import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { createActionsPanel, observeGitPopoverSpace } from '../src/actions-view.js'

function renderPanel(popoverHeight = 460) {
  const status = { repository: true, branch: 'feature/' + 'long-branch-'.repeat(20), files: Array.from({ length: 30 }, (_, index) => ({ path: `src/${'long-file-'.repeat(30)}${index}.js`, xy: ' M', unstaged: true })), remotes: [{ name: 'origin' }, { name: 'very-long-remote-name'.repeat(12) }], defaultRemote: 'origin', ahead: 12 }
  const states = [status, '', '', 'notice '.repeat(200), true, new Set(), false, undefined, '', 'origin', popoverHeight]
  let index = 0
  const React = { Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props: props || {}, children }), useState: initial => [index < states.length ? states[index++] : initial, () => {}], useEffect() {}, useRef: initial => ({ current: initial }), useCallback: fn => fn }
  const wrapped = createActionsPanel(React)({ sessionId: 'layout-fixture' })
  return wrapped.type(wrapped.props)
}
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
function html(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (Array.isArray(node)) return node.map(html).join('')
  if (typeof node !== 'object') return escape(node)
  if (typeof node.type === 'function') return html(node.type({ ...node.props, children: node.children }))
  if (node.type === 'fragment') return html(node.children)
  const attrs = Object.entries(node.props).filter(([key, value]) => !key.startsWith('on') && !['ref', 'key', 'children', 'style'].includes(key) && value != null && value !== false).map(([key, value]) => ` ${key === 'className' ? 'class' : key}="${escape(value)}"`).join('')
  return `<${node.type}${attrs}>${html(node.children)}</${node.type}>`
}

test('Git panel renders a normal-flow row without viewport offsets', () => {
  const tree = renderPanel()
  assert.equal(tree.props.className, 'dtd-actions-row')
  assert.equal(tree.props.style, undefined)
  assert.equal(tree.children[0].props.className, 'dtd-actions-container')
  assert.equal(tree.children[0].props.style, undefined)
})

test('insufficient space shows a local hint and leaves the collapse button available', () => {
  for (const height of [0, 48, 87]) {
    const tree = renderPanel(height)
    const container = tree.children[0]
    assert.equal(container.children[0].props.role, 'status')
    assert.match(container.children[0].children[0], /请先缩小终端面板/)
    assert.equal(container.children[1].props['aria-expanded'], true)
    assert.equal(typeof container.children[1].props.onClick, 'function')
    assert.equal(container.children[2], false)
  }
  const waiting = renderPanel(null).children[0]
  assert.equal(waiting.children[0], false)
  assert.equal(waiting.children[2], false)
  assert.equal(renderPanel(120).children[0].children[2].props.style.maxHeight, 120)
})

test('local observer updates on resize/scroll and releases all listeners', () => {
  const original = { ResizeObserver: globalThis.ResizeObserver, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame }
  let resize, scroll, disconnected = false, removed = false, frame, rowTop = 300
  const observed = []
  const scroller = { clientTop: 2, getBoundingClientRect: () => ({ top: 100 }), addEventListener: (_type, fn) => { scroll = fn }, removeEventListener: (_type, fn) => { removed = fn === scroll } }
  const composer = {}
  const row = { closest: selector => selector === '[data-conversation-scroll]' ? scroller : composer, getBoundingClientRect: () => ({ top: rowTop }) }
  globalThis.ResizeObserver = class { constructor(fn) { resize = fn } observe(node) { observed.push(node) } disconnect() { disconnected = true } }
  globalThis.requestAnimationFrame = fn => { frame = fn; return 1 }
  globalThis.cancelAnimationFrame = () => { frame = undefined }
  try {
    const heights = []
    const stop = observeGitPopoverSpace(row, value => heights.push(value))
    assert.deepEqual(observed, [row, scroller, composer])
    assert.deepEqual(heights, [190])
    rowTop = 160; resize(); frame()
    assert.equal(heights.at(-1), 50)
    rowTop = 120; scroll(); frame()
    assert.equal(heights.at(-1), 10)
    resize(); stop()
    assert.equal(frame, undefined)
    assert.equal(disconnected, true)
    assert.equal(removed, true)
  } finally { Object.assign(globalThis, original) }
})

test('Git layout stays inside the composer at wide and narrow widths', { skip: !process.env.DSH_BROWSER_EXE }, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const output = path.join(root, '.test-output', 'actions-layout')
  await mkdir(output, { recursive: true })
  const css = await readFile(path.join(root, 'src/style.css'), 'utf8')
  const fixture = `<!doctype html><meta charset="utf-8"><style>${css}
  html,body{margin:0;font:13px sans-serif}#chat{--dsh-composer-card-max-width:500px;--dsh-composer-side-clearance:16px;margin:20px;width:640px;height:1000px;display:flex;flex-direction:column}#history{flex:1;min-height:0;overflow:auto}#composer{display:flex;flex-direction:column;gap:8px;flex:none}#input{box-sizing:border-box;width:min(var(--dsh-composer-card-max-width),calc(100% - 2 * var(--dsh-composer-side-clearance)));margin-inline:auto;height:80px;border:1px solid #888}#terminal{height:0;flex:none}
  </style><div id="chat"><div id="history"></div><div id="composer">${html(renderPanel())}<div id="input">Input bar</div></div><div id="terminal"></div></div><script>
  const results=[];
  const check=(name,ok)=>{results.push({name,passed:!!ok});if(!ok)throw Error(name)};
  try {
    for (const width of [800,640,380,280,220]) {
      document.querySelector('#chat').style.width=width+'px';
      for (const terminalHeight of [0,240]) {
        document.querySelector('#terminal').style.height=terminalHeight+'px';
        const row=document.querySelector('.dtd-actions-row'), pill=document.querySelector('.dtd-status-pill'), panel=document.querySelector('.dtd-git-popover');
        const r=row.getBoundingClientRect(), p=pill.getBoundingClientRect(), d=panel.getBoundingClientRect(), input=document.querySelector('#input').getBoundingClientRect();
        check('row reserves pill height '+width+'/'+terminalHeight, r.height>=32 && r.bottom<=input.top);
        check('row matches composer card width '+width+'/'+terminalHeight, Math.abs(r.width-Math.min(500,width-32))<1 && Math.abs(r.left-input.left)<1 && Math.abs(r.right-input.right)<1);
        check('pill right aligned '+width+'/'+terminalHeight, Math.abs(p.right-input.right)<1 && p.left>=r.left-1);
        check('popover uses row width '+width+'/'+terminalHeight, Math.abs(d.width-Math.min(380,r.width))<1 && d.left>=r.left-1 && d.right<=r.right+1);
        check('popover grows upward '+width+'/'+terminalHeight,d.bottom<r.top && d.height<=460);
        check('panel has no horizontal overflow '+width+'/'+terminalHeight,panel.scrollWidth<=panel.clientWidth+1);
        check('expanded panel scrolls '+width+'/'+terminalHeight,panel.scrollHeight>panel.clientHeight && getComputedStyle(panel).overflowY==='auto');
        panel.hidden=true;
        // The class sets display:flex, so emulate React removing the expanded element.
        panel.style.display='none';
        check('collapse preserves input position '+width+'/'+terminalHeight,document.querySelector('#input').getBoundingClientRect().top===input.top);
        panel.style.display='';panel.hidden=false;
      }
    }
    const observeSpace = ${observeGitPopoverSpace.toString()};
    const chat=document.querySelector('#chat'), composer=document.querySelector('#composer'), history=document.querySelector('#history');
    const scroller=document.createElement('div');scroller.setAttribute('data-conversation-scroll','');scroller.style.cssText='position:relative;overflow-y:auto;width:100%;flex:none';
    composer.setAttribute('data-composer-seat','');composer.style.cssText='position:sticky;bottom:0';history.style.cssText='height:900px;flex:none';
    scroller.append(history,composer);chat.prepend(scroller);document.querySelector('#terminal').style.display='none';
    const panel=document.querySelector('.dtd-git-popover'), row=document.querySelector('.dtd-actions-container');
    const hint=document.createElement('span');hint.className='dtd-actions-space-hint';hint.textContent='请先缩小终端面板以显示 Git 操作';row.prepend(hint);
    for (const height of [600,300,180,48]) {
      scroller.style.height=height+'px';scroller.scrollTop=scroller.scrollHeight;
      let measured;
      const stop=observeSpace(row,value=>{measured=value;panel.style.maxHeight=value+'px';panel.style.display=value>=88?'':'none';hint.style.display=value<88?'':'none'});
      const expected=Math.max(0,Math.min(460,Math.floor(row.getBoundingClientRect().top-scroller.getBoundingClientRect().top-scroller.clientTop-8)));
      check('local height uses overflow ancestor '+height, measured===expected);
      if(measured>=88) {
        const rect=panel.getBoundingClientRect();
        check('panel remains above clip boundary '+height, rect.top>=scroller.getBoundingClientRect().top-1 && rect.height<=measured+1);
      } else {
        check('unusable space shows hint without clipped panel '+height, getComputedStyle(panel).display==='none' && getComputedStyle(hint).display!=='none' && !!row.querySelector('.dtd-status-pill'));
      }
      stop();
    }
  } catch(error) { results.push({error:error.message}) }
  const report=document.createElement('pre');report.id='result';report.textContent=JSON.stringify(results);document.body.append(report);
  </script>`
  const file = path.join(output, 'fixture.html')
  await writeFile(file, fixture)
  const dump = await new Promise((resolve, reject) => {
    const child = spawn(process.env.DSH_BROWSER_EXE, ['--headless=new', '--disable-gpu', '--no-first-run', '--window-size=1280,1100', '--dump-dom', pathToFileURL(file).href], { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    child.stdout.on('data', chunk => stdout += chunk)
    child.stderr.on('data', chunk => stderr += chunk)
    const timeout = setTimeout(() => child.kill(), 25000)
    child.on('error', reject)
    child.on('exit', code => { clearTimeout(timeout); code === 0 ? resolve(stdout) : reject(Error(`Browser exited ${code}: ${stderr.slice(-1200)}`)) })
  })
  await writeFile(path.join(output, 'dom.html'), dump)
  const match = dump.match(/<pre id="result">(.*?)<\/pre>/s)
  assert.ok(match, 'browser produced layout results')
  const results = JSON.parse(match[1].replaceAll('&quot;', '"').replaceAll('&amp;', '&'))
  assert.equal(results.filter(result => result.error || result.passed === false).length, 0, JSON.stringify(results.filter(result => result.error || result.passed === false)))
  assert.equal(results.length, 88)
})
