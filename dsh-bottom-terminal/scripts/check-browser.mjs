import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
const root = fileURLToPath(new URL('../', import.meta.url))
const { build } = await import(process.env.DSH_ESBUILD_MODULE || 'esbuild')
const reactRoot = process.env.DSH_REACT_DIR
const reactDOMRoot = process.env.DSH_REACT_DOM_DIR
if (!reactRoot || !reactDOMRoot || !process.env.DSH_BROWSER_EXE) throw Error('Set DSH_REACT_DIR, DSH_REACT_DOM_DIR and DSH_BROWSER_EXE to existing dependencies')
const out = path.join(root, '.test-output')
await mkdir(out, { recursive: true })
await build({ absWorkingDir: root, entryPoints: ['test/browser/fixture.js'], outfile: path.join(out, 'fixture.js'), bundle: true, platform: 'browser', format: 'iife', target: 'chrome120', loader: { '.css': 'text' }, alias: { react: reactRoot, 'react-dom': reactDOMRoot }, define: { 'process.env.NODE_ENV': '"production"' } })
await writeFile(path.join(out, 'fixture.html'), '<!doctype html><meta charset="utf-8"><div id="app"></div><script src="fixture.js"></script>')
const output = await new Promise((resolve, reject) => {
  const child = spawn(process.env.DSH_BROWSER_EXE, ['--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1280,900', '--virtual-time-budget=4500', '--dump-dom', pathToFileURL(path.join(out, 'fixture.html')).href], { stdio: ['ignore', 'pipe', 'pipe'] })
  let text = '', error = ''
  child.stdout.on('data', value => text += value)
  child.stderr.on('data', value => error += value)
  const timer = setTimeout(() => child.kill(), 30000)
  child.on('error', reject)
  child.on('exit', code => { clearTimeout(timer); code === 0 ? resolve(text) : reject(Error(`Browser exit ${code}: ${error.slice(-2000)}`)) })
})
await writeFile(path.join(out, 'browser-dom.html'), output)
const result = output.match(/<pre id="result">(.*?)<\/pre>/s)
if (!result) throw Error('Browser fixture did not complete; inspect .test-output/browser-dom.html')
const report = JSON.parse(result[1].replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>'))
console.log(JSON.stringify(report, null, 2))
if (report.results.some(result => result.error || result.passed === false)) throw Error('Browser integration failed')
