import assert from 'node:assert/strict'
import test from 'node:test'
import { attachTerminalRenderer, terminalAppearance } from '../src/terminal-view.js'

function fixture({ visible = true } = {}) {
  let state = { phase: 'connected', writable: true, info: { cols: 80, rows: 24, state: 'running' }, environment: { maxCols: 100, maxRows: 40, scrollback: 2000 } }
  const listeners = new Set(), raf = new Map(), fonts = new Set(), calls = { ack: [], input: [], resize: [], detach: 0, close: 0 }
  let id = 0, term, observer
  const model = {
    state: { getSnapshot: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) } },
    mount: () => () => { calls.detach++ },
    acknowledge: revision => calls.ack.push(revision), write: text => calls.input.push(text), resize: (...size) => calls.resize.push(size), close: () => calls.close++,
  }
  const view = {
    requestAnimationFrame: cb => { raf.set(++id, cb); return id }, cancelAnimationFrame: key => raf.delete(key),
    ResizeObserver: class { constructor(cb) { this.cb = cb; observer = this } observe() {} disconnect() { this.disconnected = true } },
    navigator: { clipboard: { writeText: async text => { calls.copied = text }, readText: async () => '粘贴\n内容' } },
  }
  const node = { clientWidth: 800, clientHeight: 400, ownerDocument: { defaultView: view, body: { hasAttribute: () => false }, fonts: { addEventListener: (_, cb) => fonts.add(cb), removeEventListener: (_, cb) => fonts.delete(cb) } } }
  class Terminal {
    constructor(options) { term = this; this.options = options; this.cols = 80; this.rows = 24; this.writes = []; this.sizes = []; this.focuses = 0; this.resets = 0; this.textarea = { setAttribute() {} } }
    loadAddon(addon) { this.addon = addon }
    open() {}
    write(data, callback) { this.writes.push({ data, callback }) }
    reset() { this.resets++ }
    resize(cols, rows) { this.cols = cols; this.rows = rows; this.sizes.push([cols, rows]) }
    focus() { this.focuses++ }
    blur() {}
    onData(cb) { this.input = cb; return { dispose: () => { this.inputDisposed = true } } }
    attachCustomKeyEventHandler(cb) { this.key = cb }
    hasSelection() { return true }
    getSelection() { return 'selected' }
    paste(text) { this.input(text) }
    dispose() { this.disposed = true; this.addon.dispose() }
  }
  class Fit { proposeDimensions() { return { cols: 120, rows: 50 } } dispose() { this.disposed = true } }
  const renderer = attachTerminalRenderer({ node, model, visible, theme: 'dark', TerminalClass: Terminal, FitAddonClass: Fit })
  const patch = value => { state = { ...state, ...value }; for (const cb of [...listeners]) cb() }
  const frame = (revision, data, snapshot = false) => patch({ render: { revision, frame: snapshot ? { type: 'snapshot', screen: data, info: { cols: 90, rows: 30 } } : { type: 'output', data } } })
  const flush = () => { for (const [key, cb] of [...raf]) { raf.delete(key); cb() } }
  return { model, term, renderer, patch, frame, flush, calls, raf, fonts, listeners, observer, view }
}

test('snapshot reset/resize and ANSI output ACK only after parser callback', () => {
  const f = fixture()
  f.frame(1, '\u001b[31m你好\u001b[0m', true)
  assert.equal(f.term.resets, 1)
  assert.deepEqual(f.term.sizes, [[90, 30]])
  assert.deepEqual(f.calls.ack, [])
  assert.equal(f.term.writes[0].data, '\u001b[31m你好\u001b[0m')
  f.term.writes[0].callback()
  assert.deepEqual(f.calls.ack, [1])
  f.patch({ writable: true })
  assert.equal(f.term.writes.length, 1)
  f.frame(2, 'output')
  assert.deepEqual(f.calls.ack, [1])
  f.term.writes[1].callback()
  assert.deepEqual(f.calls.ack, [1, 2])
  f.renderer.dispose()
})

test('hidden renderer keeps parsing and acknowledging without sending input or fitting', () => {
  const f = fixture({ visible: false })
  f.frame(1, 'background')
  f.flush()
  assert.equal(f.term.focuses, 0)
  assert.deepEqual(f.calls.resize, [])
  f.term.input('ignored')
  f.term.writes[0].callback()
  assert.deepEqual(f.calls.ack, [1])
  assert.deepEqual(f.calls.input, [])
  f.renderer.update({ visible: true, theme: 'light' })
  f.flush()
  assert.equal(f.term.focuses, 1)
  assert.deepEqual(f.calls.resize, [[100, 40]])
  f.term.input('\u0003')
  assert.deepEqual(f.calls.input, ['\u0003'])
  f.patch({ writable: false })
  f.term.input('blocked')
  assert.deepEqual(f.calls.input, ['\u0003'])
  assert.equal(f.term.options.disableStdin, true)
  f.renderer.dispose()
})

test('reconnect snapshot waits for previous async parse before resetting', () => {
  const f = fixture()
  f.frame(1, 'old')
  f.patch({ phase: 'connecting', writable: false, render: undefined })
  f.frame(2, 'restored', true)
  assert.equal(f.term.resets, 0)
  assert.equal(f.term.writes.length, 1)
  f.term.writes[0].callback()
  assert.equal(f.term.resets, 1)
  assert.equal(f.term.writes[1].data, 'restored')
  f.term.writes[1].callback()
  assert.deepEqual(f.calls.ack, [1, 2])
  f.renderer.dispose()
})

test('dispose detaches once without closing PTY and suppresses late ACK', () => {
  const f = fixture()
  f.frame(1, 'pending')
  f.renderer.dispose()
  f.renderer.dispose()
  f.term.writes[0].callback()
  f.patch({ writable: true })
  assert.equal(f.calls.detach, 1)
  assert.equal(f.calls.close, 0)
  assert.equal(f.listeners.size, 0)
  assert.equal(f.raf.size, 0)
  assert.equal(f.fonts.size, 0)
  assert.equal(f.observer.disconnected, true)
  assert.equal(f.term.inputDisposed, true)
  assert.equal(f.term.addon.disposed, true)
  assert.equal(f.term.disposed, true)
  assert.deepEqual(f.calls.ack, [])
})

test('clipboard shortcuts use xterm paste and do not intercept Ctrl+C interrupt', async () => {
  const f = fixture()
  const event = code => ({ type: 'keydown', code, ctrlKey: true, shiftKey: true, preventDefault() {} })
  assert.equal(f.term.key(event('KeyC')), false)
  await Promise.resolve()
  assert.equal(f.calls.copied, 'selected')
  assert.equal(f.term.key(event('KeyV')), false)
  await Promise.resolve()
  assert.deepEqual(f.calls.input, ['粘贴\n内容'])
  assert.equal(f.term.key({ ...event('KeyC'), shiftKey: false }), true)
  let resolve
  f.view.navigator.clipboard.readText = () => new Promise(done => { resolve = done })
  f.term.key(event('KeyV'))
  f.renderer.dispose()
  resolve('late')
  await Promise.resolve()
  assert.deepEqual(f.calls.input, ['粘贴\n内容'])
})

test('output does not refit each chunk, but resize during parsing is preserved', () => {
  const f = fixture()
  f.flush()
  const before = f.calls.resize.length
  f.frame(1, 'chunk')
  f.term.writes[0].callback()
  f.flush()
  assert.equal(f.calls.resize.length, before)
  f.frame(2, 'pending chunk')
  f.observer.cb()
  f.flush()
  assert.equal(f.calls.resize.length, before)
  f.term.writes[1].callback()
  f.flush()
  assert.equal(f.calls.resize.length, before + 1)
  f.renderer.dispose()
})

test('theme supports light/dark, direct xterm palette, and DSH fonts', () => {
  const node = { ownerDocument: { body: { hasAttribute: () => false } } }
  assert.equal(terminalAppearance('dark', node).theme.background, '#17191d')
  assert.equal(terminalAppearance('light', node).theme.background, '#ffffff')
  const value = terminalAppearance({ background: '#123456', brightRed: '#abcdef', fontFamilies: { terminal: 'Test Mono' }, fontSizes: { terminal: 16 } }, node)
  assert.equal(value.theme.background, '#123456')
  assert.equal(value.theme.brightRed, '#abcdef')
  assert.match(value.fontFamily, /^Test Mono,/)
  assert.equal(value.fontSize, 16)
})
