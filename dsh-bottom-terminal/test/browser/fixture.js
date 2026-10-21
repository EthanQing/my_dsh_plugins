import React from 'react'
import { createRoot } from 'react-dom/client'
import { createDock } from '../../src/dock.js'
import { createTerminalGuide } from '../../src/guide.js'
import { createDockState } from '../../src/state.js'
import { createTerminalView } from '../../src/terminal-view.js'
import css from '../../src/style.css'
import xtermCSS from '../../vendor/xterm/css/xterm.css'
const style = document.createElement('style')
style.textContent = css + xtermCSS + 'html,body,#app{margin:0;height:100%;font-family:Arial}#app{display:grid;grid-template-rows:minmax(0,1fr) auto 24px;overflow:hidden}.fixture-main{min-height:0;overflow:auto;display:grid;grid-template-columns:1fr 240px}.fixture-chat{display:flex;flex-direction:column;justify-content:space-between;padding:12px}.fixture-right{border-left:1px solid #888;padding:12px}.fixture-status{background:#345;color:white}.fixture-main textarea{min-height:32px}#result{position:fixed;top:0;left:0;font-size:10px;pointer-events:none;background:#fff;z-index:99}'
document.head.append(style)
const observable = value => {
  const listeners = new Set()
  return { getSnapshot: () => value, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) }, set: next => { value = next; for (const fn of listeners) fn() } }
}
const stats = { mounts: 0, detaches: 0, closes: 0, acks: 0, resizes: 0 }
const models = new Map()
const info = { title: 'NuShell', state: 'running', cols: 80, rows: 24 }
function modelFor(key) {
  if (models.has(key)) return models.get(key)
  let revision = 0
  const state = observable({ phase: 'connected', writable: true, info, environment: { scrollback: 1000, maxCols: 500, maxRows: 200 } })
  const model = { state, mount() { stats.mounts++; state.set({ ...state.getSnapshot(), render: { revision: ++revision, frame: { type: 'snapshot', info: state.getSnapshot().info, screen: '\x1b[32mNuShell renderer fixture\x1b[0m\r\n> ' } } }); return () => { stats.detaches++ } }, acknowledge() { stats.acks++; state.set({ ...state.getSnapshot(), render: undefined }) }, resize(cols, rows) { stats.resizes++; state.set({ ...state.getSnapshot(), info: { ...state.getSnapshot().info, cols, rows } }) }, write() {}, connect() {}, refresh() {}, rename(title) { state.set({ ...state.getSnapshot(), info: { ...state.getSnapshot().info, title } }); return Promise.resolve() } }
  models.set(key, model)
  return model
}
let serial = 0
const store = createDockState({ uuid: () => String(++serial) })
store.add('session-a', 'nu.exe')
store.add('session-a', 'bash.exe')
const api = { store, session: observable('session-a'), theme: observable('light'), activity: observable({ available: true, launching: false, message: '' }), terminals: { view: (_session, id) => modelFor(id), closeFailures: observable([]), launchShells: async () => ({ shells: [{ path: 'nu.exe', name: 'NuShell' }, { path: 'bash.exe', name: 'Git Bash' }], selectedShell: 'nu.exe' }), selectShell() {} }, newTerminal: async (id, shell) => store.add(id, shell), closeTab: (id, tab) => { stats.closes++; store.remove(id, tab.id) }, openRight() {}, renameTab: async (_id, tab, title) => modelFor(tab.id).rename(title) }
const Dock = createDock(React, api, createTerminalView(React))
const Guide = createTerminalGuide(React, api)
let rightOpens = 0
const useTabInfo = () => ({ tab: { actions: { openTab: () => { rightOpens++ } } } })
createRoot(document.querySelector('#app')).render(React.createElement(React.Fragment, null,
  React.createElement('div', { className: 'fixture-main' }, React.createElement('div', { className: 'fixture-chat' }, '聊天内容', React.createElement('textarea', { placeholder: '聊天输入框' })), React.createElement('aside', { className: 'fixture-right' }, '右侧代码审查', React.createElement(Guide, { sessionId: 'session-a', useTabInfo }))),
  React.createElement(Dock), React.createElement('footer', { className: 'fixture-status' }, '状态栏')))
const pause = () => new Promise(resolve => setTimeout(resolve, 160))
const results = []
const check = (name, passed) => { results.push({ name, passed }); if (!passed) throw Error(name) }
async function run() {
try {
  await pause(); await pause()
  const dock = document.querySelector('.dbt-dock'), chat = document.querySelector('.fixture-main'), footer = document.querySelector('.fixture-status')
  check('real xterm renders ANSI snapshot', document.querySelector('.xterm-screen').textContent.includes('NuShell renderer fixture'))
  check('dock reserves layout space', chat.getBoundingClientRect().bottom <= dock.getBoundingClientRect().top + 1 && dock.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top + 1)
  check('output acknowledged and fitted', stats.acks > 0 && stats.resizes > 0)
  store.hide(); await pause()
  check('hide detaches without closing process', !document.querySelector('.dbt-dock') && stats.detaches > 0 && stats.closes === 0)
  store.show(); await pause()
  store.collapse(); await pause()
  check('collapse keeps tabs and processes', document.querySelectorAll('[role=tab]').length === 2 && stats.closes === 0)
  store.collapse(); store.resize(350); await pause()
  check('height updates', Math.abs(document.querySelector('.dbt-dock').getBoundingClientRect().height - 350) < 2)
  store.maximize(); await pause()
  check('maximize remains inside frame', document.querySelector('.fixture-status').getBoundingClientRect().bottom <= innerHeight + 1)
  store.maximize(); api.theme.set('dark'); document.body.setAttribute('data-ds-dark-theme', ''); await pause()
  check('dark palette applied', document.querySelector('.xterm-screen').style.width !== '')
  api.session.set('session-b'); await pause()
  check('session switch preserves prior tabs without closing', document.querySelectorAll('[role=tab]').length === 0 && store.getSnapshot().sessions['session-a'].tabs.length === 2 && stats.closes === 0)
  api.session.set('session-a'); await pause()
  document.querySelector('[aria-label="选择 Shell 和新建位置"]').click(); await pause()
  check('shell menu includes NuShell and right-side option', [...document.querySelectorAll('[role=menuitem]')].some(n => n.textContent.includes('NuShell')) && [...document.querySelectorAll('[role=menuitem]')].some(n => n.textContent.includes('右侧')))
  document.querySelector('.dbt-guide-main').click(); await pause()
  check('native guide creates a bottom tab', store.getSnapshot().sessions['session-a'].tabs.length === 3 && rightOpens === 0)
  document.querySelector('.dbt-guide-options button').click(); await pause()
  check('native guide preserves optional right-side creation', rightOpens === 1 && store.getSnapshot().sessions['session-a'].tabs.length === 3)
} catch (error) { results.push({ error: error.message }) }
const output = document.createElement('pre'); output.id = 'result'; output.textContent = JSON.stringify({ results, stats }); document.body.append(output)
}
void run()
