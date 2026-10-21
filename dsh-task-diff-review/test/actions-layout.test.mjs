import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { createActionsPanel, observeGitPopoverSpace } from '../src/actions-view.js'
import { attachComposerTool } from '../../shared/composer-tools.js'

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
  const tools = { getBoundingClientRect: () => ({ left: 20 }) }
  const widths = []
  const row = { style: { setProperty: (_key, value) => widths.push(value) }, closest: selector => selector === '[data-conversation-scroll]' ? scroller : selector === '[data-composer-dock]' ? tools : composer, getBoundingClientRect: () => ({ top: rowTop, right: 320 }) }
  globalThis.ResizeObserver = class { constructor(fn) { resize = fn } observe(node) { observed.push(node) } disconnect() { disconnected = true } }
  globalThis.requestAnimationFrame = fn => { frame = fn; return 1 }
  globalThis.cancelAnimationFrame = () => { frame = undefined }
  try {
    const heights = []
    const stop = observeGitPopoverSpace(row, value => heights.push(value))
    assert.deepEqual(observed, [row, scroller, tools, composer])
    assert.deepEqual(widths, ['300px'])
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

test('native footer shares centered information and right tools without adding a row', { skip: !process.env.DSH_BROWSER_EXE }, async () => {
  await import('../../shared/composer-tools.browser.mjs')
})
