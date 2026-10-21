import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { launchBrowser } from '../test/browser/cdp.mjs'
const root = fileURLToPath(new URL('../', import.meta.url))
const { build } = await import(process.env.DSH_ESBUILD_MODULE || 'esbuild')
const reactRoot = process.env.DSH_REACT_DIR, reactDOMRoot = process.env.DSH_REACT_DOM_DIR
if (!reactRoot || !reactDOMRoot || !process.env.DSH_BROWSER_EXE) throw Error('Set DSH_REACT_DIR, DSH_REACT_DOM_DIR and DSH_BROWSER_EXE to existing dependencies')
const out = path.join(root, '.test-output')
await mkdir(out, { recursive: true })
await build({ absWorkingDir: root, entryPoints: ['test/browser/fixture.js'], outfile: path.join(out, 'fixture.js'), bundle: true, platform: 'browser', format: 'iife', target: 'chrome120', loader: { '.css': 'text' }, alias: { react: reactRoot, 'react-dom': reactDOMRoot }, define: { 'process.env.NODE_ENV': '"production"' } })
await writeFile(path.join(out, 'fixture.html'), '<!doctype html><meta charset="utf-8"><title>Isolated bottom terminal fixture</title><div id="app"></div><script src="fixture.js"></script>')
const browser = await launchBrowser(process.env.DSH_BROWSER_EXE, path.join(out, `edge-profile-${process.pid}`))
let report
try {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true })
  const send = (method, params) => browser.send(method, params, sessionId)
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || JSON.stringify(result.exceptionDetails))
    return result.result.value
  }
  await send('Page.navigate', { url: pathToFileURL(path.join(out, 'fixture.html')).href })
  await evaluate(`new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(window.dbtTest){clearInterval(timer);resolve(true)}else if(++n>100){clearInterval(timer);reject(Error('Fixture did not load'))}},30)})`)
  report = await evaluate('window.dbtTest.run()')
  if (!report.results.some(result => result.error || result.passed === false)) {
    const drag = await evaluate('window.dbtTest.prepareDrag()')
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: drag.x, y: drag.y })
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: drag.x, y: drag.y, button: 'left', buttons: 1, clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: drag.x, y: drag.y - 60, button: 'left', buttons: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: drag.x, y: drag.y - 60, button: 'left', buttons: 0, clickCount: 1 })
    try { report = await evaluate(`window.dbtTest.verifyDrag(${drag.height})`) } catch (error) { report = await evaluate('window.dbtTest.report()'); report.results.push({ error: error.message }) }
  }
  const screenshots = []
  if (!report.results.some(result => result.error || result.passed === false)) {
    for (const config of [{ width: 900, height: 720, deviceScaleFactor: 1, name: 'width900' }, { width: 720, height: 720, deviceScaleFactor: 1, name: 'width720' }, { width: 1000, height: 720, deviceScaleFactor: 1.25, name: 'dpi125' }, { width: 1280, height: 900, deviceScaleFactor: 1.5, name: 'dpi150' }]) {
      await send('Emulation.setDeviceMetricsOverride', { width: config.width, height: config.height, deviceScaleFactor: config.deviceScaleFactor, mobile: false })
      try { report = await evaluate(`window.dbtTest.responsive(${JSON.stringify(config.name)})`) } catch (error) { report = await evaluate('window.dbtTest.report()'); report.results.push({ error: error.message }); break }
      const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      const filename = `browser-${config.name}.png`
      await writeFile(path.join(out, filename), Buffer.from(data, 'base64')); screenshots.push(filename)
    }
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  for (const scenario of ['default', 'maximized', 'no-right', 'guide']) {
    await evaluate(`window.dbtTest.scenario(${JSON.stringify(scenario)})`)
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    const filename = `browser-${scenario}.png`
    await writeFile(path.join(out, filename), Buffer.from(data, 'base64'))
    screenshots.push(filename)
  }
  report.screenshots = screenshots
  report.browserExceptions = browser.events
  await writeFile(path.join(out, 'browser-dom.html'), await evaluate('document.documentElement.outerHTML'))
  await writeFile(path.join(out, 'browser-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ scope: report.scope, checks: report.results.filter(result => result.passed).length, failures: report.results.filter(result => result.error || result.passed === false), metrics: report.metrics, stats: report.stats, screenshots, browserExceptions: report.browserExceptions }, null, 2))
  if (report.results.some(result => result.error || result.passed === false) || browser.events.length) throw Error('Browser integration failed; inspect .test-output/browser-report.json and screenshots')
} finally { await browser.close() }
