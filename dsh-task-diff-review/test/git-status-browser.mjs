import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { launchBrowser } from '../../dsh-bottom-terminal/test/browser/cdp.mjs'
import { scenarios, renderPill, html } from './git-status-fixture.mjs'
const out = path.resolve('dsh-task-diff-review/.test-output/git-status-icons')
await mkdir(out, { recursive: true })
const css = await readFile('dsh-task-diff-review/src/style.css', 'utf8')
await writeFile(path.join(out, 'preview.html'), `<!doctype html><meta charset="utf-8"><style>${css}
body{font:13px system-ui;margin:24px;color:#4b5563;background:#fff}h1{font-size:16px;font-weight:500;margin:0 0 8px}p{color:#737780;margin:0 0 20px}main{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.case{border:1px solid #e5e7eb;border-radius:8px;padding:12px;min-width:0}.caption{color:#737780;margin-bottom:10px}.sample{display:flex;align-items:center;gap:12px;height:26px}.compact{margin-left:auto}.dtd-status-pill{font-family:inherit;color:inherit}.dtd-svg-loading{animation:none}</style>
<h1>Git底栏状态：真实组件 SVG</h1><p>隔离预览。每格左侧为常规底栏，右侧为窄栏图标；格外说明不属于按钮文案。</p><main>${scenarios.map(([name, props]) => `<section class="case"><div class="caption">${name}</div><div class="sample dtd-actions-row"><div data-dsh-composer-tools>${html(renderPill(props))}</div><div data-dsh-composer-tools data-tools-compact class="compact">${html(renderPill(props))}</div></div></section>`).join('')}</main>`)
const browser = await launchBrowser(process.env.DSH_BROWSER_EXE || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', path.join(out, `edge-${process.pid}`))
try {
  const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true })
  const send = (method, params) => browser.send(method, params, sessionId)
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception.description)
    return r.result.value
  }
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1150, height: 510, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: pathToFileURL(path.join(out, 'preview.html')).href })
  await evaluate('new Promise(r=>setTimeout(r,100))')
  const checks = await evaluate(`Array.from(document.querySelectorAll('.dtd-status-pill')).map(b=>{const compact=b.parentElement.hasAttribute('data-tools-compact'),icons=[...b.querySelectorAll('svg')].filter(s=>s.getBoundingClientRect().width>0&&s.getBoundingClientRect().height>0),r=b.getBoundingClientRect();return {compact,height:r.height,width:r.width,icons:icons.length,nowrap:getComputedStyle(b).whiteSpace==='nowrap',label:!!b.getAttribute('aria-label'),overflow:b.scrollWidth>b.clientWidth+1,text:b.innerText}})`)
  for (const c of checks) { assert.equal(c.height, 22); assert.ok(c.icons > 0); assert.ok(c.nowrap); assert.ok(c.label); assert.equal(c.overflow, false); assert.match(c.text.replaceAll('\n',''), /^(main)?\d*$/); if(c.compact){assert.equal(c.width,22);assert.equal(c.icons,1)} }
  await writeFile(path.join(out, 'states.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
  console.log(JSON.stringify({ cases: scenarios.length, buttons: checks.length, screenshot: path.join(out, 'states.png') }))
} finally { await browser.close() }
