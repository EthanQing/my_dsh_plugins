import test from 'node:test'
import assert from 'node:assert/strict'
import { createTerminalGuide, guideMenuItems } from '../src/guide.js'

const ready = { phase: 'ready', choices: { shells: [{ path: 'C:/nu.exe', name: 'nu' }, { path: 'C:/bash.exe', name: 'Git Bash' }], selectedShell: 'C:/nu.exe' } }
function fixture({ state = ready, available = true, sessionId = 'session-a' } = {}) {
  const calls = [], effects = [], updates = []
  const values = [true, 0, state]
  let index = 0
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    useState: initial => { const slot = index++; return [values[slot] ?? initial, value => updates.push([slot, value])] },
    useEffect: callback => effects.push(callback),
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
  }
  const api = {
    activity: { subscribe() {}, getSnapshot: () => ({ available, launching: false }) },
    terminals: { selectShell: path => calls.push(['select', path]), launchShells: async () => ready.choices },
    newTerminal: (...args) => calls.push(['bottom', ...args]),
  }
  const primitives = { Button: 'Button', Menu: 'Menu', PluginArtworkTerminal: 'Artwork', IconChevronRightOutlineRegular: 'ChevronRight' }
  const Component = createTerminalGuide(React, api, primitives)
  const tree = Component({ sessionId, title: '新建终端', useTabInfo: () => ({ tab: { actions: { openTab: (...args) => calls.push(['right', ...args]) } } }) })
  return { tree, calls, effects, updates, api, menu: tree.children.find(child => child?.type === 'Menu'), main: tree.children[0] }
}

test('shell items retain selected identities, followed by a separator and right-side action without shortcut', () => {
  const items = guideMenuItems(ready)
  assert.equal(items[0].label, 'NuShell')
  assert.equal(items[0].id, 'shell:C:/nu.exe')
  assert.equal(items.at(-2).type, 'separator')
  assert.equal(items.at(-1).label, '在右侧打开')
  assert(items.every(item => !('shortcut' in item)))
})

test('main card creates bottom terminal using current preference, shell item persists and launches chosen shell', () => {
  const { main, menu, calls } = fixture()
  main.props.onClick()
  menu.props.onSelect('shell:C:/bash.exe')
  assert.deepEqual(calls, [['bottom', 'session-a'], ['select', 'C:/bash.exe'], ['bottom', 'session-a', 'C:/bash.exe']])
})

test('right-side action uses official tab action and never creates a bottom terminal', () => {
  const { menu, calls } = fixture()
  menu.props.onSelect('action:right')
  assert.deepEqual(calls, [['right', 'terminal', { replaceTab: true }]])
  assert.equal(menu.props.items.at(-1).shortcut, undefined)
})

test('unavailable bottom slot blocks bottom creation while right-side action remains usable', () => {
  const { main, menu, calls } = fixture({ available: false })
  assert.equal(main.props.disabled, true)
  assert(menu.props.items.filter(item => item.id.startsWith('shell:')).every(item => item.disabled))
  main.props.onClick(); menu.props.onSelect('shell:C:/nu.exe'); menu.props.onSelect('action:right')
  assert.deepEqual(calls, [['right', 'terminal', { replaceTab: true }]])
})

test('native Menu owns portal positioning, focus, check mark and SVG trigger', () => {
  const { menu, tree } = fixture()
  assert.equal(menu.props.portal, true)
  assert.equal(menu.props.autoFocus, true)
  assert.equal(menu.props.side, 'right')
  assert.equal(menu.props.selection, 'check')
  assert.equal(menu.props.selectedId, 'shell:C:/nu.exe')
  assert.equal(menu.props.anchor.children[0].type, 'ChevronRight')
  assert.equal(tree.children[1].children[0].props.size, 22)
  assert(!JSON.stringify(tree).includes('select"'))
})

test('missing main session never falls back to a right-side launch', () => {
  const { main, menu, calls } = fixture({ sessionId: null })
  assert.equal(main.props.disabled, true)
  assert.match(main.props.title, /主聊天会话/)
  main.props.onClick(); menu.props.onSelect('shell:C:/nu.exe')
  assert.deepEqual(calls, [])
})

test('plugin shell preference interface takes precedence over native facade', () => {
  const { menu, api, calls } = fixture()
  api.selectShell = path => calls.push(['plugin-select', path])
  menu.props.onSelect('shell:C:/nu.exe')
  assert.deepEqual(calls, [['plugin-select', 'C:/nu.exe'], ['bottom', 'session-a', 'C:/nu.exe']])
})

test('failed discovery supports retry without launching or persisting a fake shell', () => {
  const { menu, calls, updates } = fixture({ state: { phase: 'failed', message: 'offline' } })
  menu.props.onSelect('action:retry')
  assert.deepEqual(calls, [])
  assert(updates.some(([slot, value]) => slot === 2 && value.phase === 'loading'))
  assert.equal(menu.props.items[0].disabled, true)
  assert.equal(menu.props.items.at(-1).id, 'action:right')
})
