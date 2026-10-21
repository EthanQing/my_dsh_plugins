import React from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'
import { createDock } from '../../src/dock.js'
import { createDockMount } from '../../src/mount.js'
import { createTerminalGuide } from '../../src/guide.js'
import { createDockState } from '../../src/state.js'
import { createTerminalView } from '../../src/terminal-view.js'
import * as primitives from './primitives-shim.js'
import { createIconChecks } from './icon-checks.js'
import css from '../../src/style.css'
import guideCSS from '../../src/guide.css'
import xtermCSS from '../../vendor/xterm/css/xterm.css'
import fixtureCSS from './fixture.css'
const h = React.createElement
const style = document.createElement('style'); style.textContent = css + guideCSS + xtermCSS + fixtureCSS; document.head.append(style)
function observable(value) { const listeners = new Set(); return { getSnapshot: () => value, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn) }, set(next) { value = next; for (const fn of listeners) fn() } } }
const stats = { mounts: 0, detaches: 0, closes: 0, acks: 0, resizes: 0, rightOpens: 0, gitClicks: 0, sideClicks: 0, selectedShell: '' }
const models = new Map()
function modelFor(session, key) {
  const identity = `${session}:${key}`
  if (models.has(identity)) return models.get(identity)
  let revision = 0
  const state = observable({ phase: 'connected', writable: true, info: { title: 'NuShell', state: 'running', cols: 80, rows: 24 }, environment: { scrollback: 1000, maxCols: 500, maxRows: 200 } })
  const model = { state, mount() { stats.mounts++; state.set({ ...state.getSnapshot(), render: { revision: ++revision, frame: { type: 'snapshot', info: state.getSnapshot().info, screen: '\x1b[32mNuShell renderer fixture\x1b[0m\r\n> ANSI output / session ownership check\r\n' } } }); return () => { stats.detaches++ } }, acknowledge() { stats.acks++; state.set({ ...state.getSnapshot(), render: undefined }) }, resize(cols, rows) { stats.resizes++; state.set({ ...state.getSnapshot(), info: { ...state.getSnapshot().info, cols, rows } }) }, write() {}, connect() {}, refresh() {}, rename(title) { state.set({ ...state.getSnapshot(), info: { ...state.getSnapshot().info, title } }); return Promise.resolve() } }
  models.set(identity, model); return model
}
let serial = 0
const store = createDockState({ uuid: () => String(++serial) })
store.add('session-a', 'nu.exe'); store.add('session-a', 'bash.exe')
const rightVisible = observable(true)
const api = { store, session: observable('session-a'), viewport: observable({ height: 0, composerHeight: 0 }), theme: observable('light'), activity: observable({ available: false, launching: false, message: '' }), terminals: { view: modelFor, closeFailures: observable([]), launchShells: async () => ({ shells: [{ path: 'nu.exe', name: 'NuShell' }, { path: 'bash.exe', name: 'Git Bash' }], selectedShell: 'nu.exe' }), selectShell(path) { stats.selectedShell = path } }, setAvailable(available) { api.activity.set({ ...api.activity.getSnapshot(), available }) }, newTerminal: async (id, shell) => store.add(id, shell), closeTab: (id, tab) => { stats.closes++; store.remove(id, tab.id) }, openRight() { stats.rightOpens++ } }
const Dock = createDock(React, api, createTerminalView(React), primitives)
const DockMount = createDockMount(React, createPortal, api, Dock)
const Guide = createTerminalGuide(React, api, primitives)
const useTabInfo = () => ({ tab: { actions: { openTab: () => { stats.rightOpens++ } } } })
const useStore = value => React.useSyncExternalStore(value.subscribe, value.getSnapshot, value.getSnapshot)
function MetricReference({ description }) { return h('div', { className: 'official-metric-reference', 'data-reference': description ? 'description' : 'compact' }, h('span', { className: 'ref-icon' }), h('span', { className: 'ref-text' }, h('span', { className: 'ref-title' }, '新建终端'), description && h('span', { className: 'ref-description' }, '在底部打开终端'))) }
function Composer({ sessionId, main }) { return h('div', { 'data-composer-seat': '', 'data-fixture-main-composer': main || undefined }, main && h('div', { className: 'fixture-git' }, 'Git 操作胶囊', h('button', { id: 'git-action', onClick: () => stats.gitClicks++ }, '查看改动')), h('div', { className: 'fixture-input' }, h('textarea', { 'aria-label': main ? '主聊天输入框' : '右栏输入框', placeholder: main ? '主聊天输入框' : '右栏同会话' }), h('button', { onClick: () => store.show() }, '终端')), h(DockMount, { sessionId })) }
function Conversation({ main }) { const sessionId = useStore(api.session); return h('div', { 'data-conversation-content': '', 'data-fixture-main-content': main || undefined }, h('div', { 'data-conversation-scroll': '' }, h('div', { className: 'fixture-messages' }, main ? h(React.Fragment, null, h('div', { className: 'fixture-guide-gallery' }, h(Guide, { sessionId, useTabInfo }), h(Guide, { sessionId, useTabInfo, description: '原生卡片描述' })), h('p', null, '真实 React / xterm / ReactDOM portal。菜单使用测试 shim。'), h('p', null, '左右栏保留完整高度；底部终端只占主聊天列。')) : '同一个 session 嵌入右侧栏，不得再创建终端 host'), h(Composer, { sessionId, main }))) }
function SideControls({ side }) { return h('div', { className: 'side-controls' }, ['top', 'middle', 'bottom'].map(position => h('button', { key: position, 'data-side-target': `${side}-${position}`, onClick: () => stats.sideClicks++ }, `${side} ${position}`))) }
function App() { const right = useStore(rightVisible); return h(React.Fragment, null, h('div', { className: `fixture-grid${right ? '' : ' no-right'}` }, h('aside', { className: 'fixture-side fixture-left' }, '会话侧栏 220px', h(SideControls, { side: 'left' })), h('main', { className: 'fixture-main' }, h('header', { className: 'fixture-heading' }, '主聊天 / bottom terminal fixture'), h(Conversation, { main: true })), right && h('aside', { className: 'fixture-side fixture-right', 'data-rightbar-col': '' }, h('div', { 'data-sidebar-right-session': '', style: { display: 'flex', flex: 1, minHeight: 0 } }, h(Conversation, { main: false })), h(SideControls, { side: 'right' }))), h('div', { className: 'fixture-reference-gallery' }, h(MetricReference, {}), h(MetricReference, { description: true })), h('span', { className: 'fixture-badge' }, 'ISOLATED FIXTURE · OFFICIAL SVG · Menu/Button SHIMS')) }
createRoot(document.querySelector('#app')).render(h(App))
const pause = () => new Promise(resolve => setTimeout(resolve, 100))
const rect = selector => document.querySelector(selector).getBoundingClientRect()
const main = () => document.querySelector('[data-fixture-main-content]')
const scrollBottom = () => { const scroll = main().querySelector(':scope > [data-conversation-scroll]'); scroll.scrollTop = scroll.scrollHeight }
const results = [], metrics = {}
function check(name, passed, detail) { results.push({ name, passed: !!passed, ...(detail === undefined ? {} : { detail }) }); if (!passed) throw Error(name) }
function reachable(element) { const r = element.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) return false; const x = r.left + r.width / 2, y = r.top + r.height / 2; const hit = document.elementFromPoint(x, y); return y >= 0 && y < innerHeight && (hit === element || element.contains(hit)) }
function sidebarChecks(label) { for (const side of ['left', ...(rightVisible.getSnapshot() ? ['right'] : [])]) { const r = rect(`.fixture-${side}`); check(`${label}: ${side} keeps full height`, Math.abs(r.height - innerHeight) < 1); for (const target of document.querySelectorAll(`[data-side-target^=${side}]`)) { check(`${label}: ${target.dataset.sideTarget} remains clickable`, reachable(target)); const count = stats.sideClicks; target.click(); check(`${label}: ${target.dataset.sideTarget} action fires`, stats.sideClicks === count + 1) } } }
function alignment(label) { const host = rect('.dbt-host'), content = main().getBoundingClientRect(); check(`${label}: host follows main grid column`, Math.abs(host.left - content.left) < 1 && Math.abs(host.right - content.right) < 1); if (rightVisible.getSnapshot()) check(`${label}: host ends at right column`, Math.abs(host.right - rect('.fixture-right').left) < 1 && host.right < innerWidth - 200) }
function composerChecks(label) { scrollBottom(); const composer = rect('[data-fixture-main-composer]'), scroller = main().querySelector(':scope > [data-conversation-scroll]').getBoundingClientRect(); check(`${label}: complete composer remains visible`, composer.top >= scroller.top - 1 && composer.bottom <= scroller.bottom + 1); const input = document.querySelector('[aria-label="主聊天输入框"]'), git = document.querySelector('#git-action'); check(`${label}: chat input remains clickable`, reachable(input)); check(`${label}: Git action remains clickable`, reachable(git)); const before = stats.gitClicks; git.click(); check(`${label}: Git action fires`, stats.gitClicks === before + 1) }
async function run() {
  try {
    await pause(); await pause(); scrollBottom(); await pause()
    check('one portal host despite same-session right mount', document.querySelectorAll('.dbt-host').length === 1 && main().querySelector(':scope > .dbt-host') && !document.querySelector('[data-rightbar-col] .dbt-host'))
    check('host is sibling of native scroller', main().querySelector(':scope > [data-conversation-scroll]')?.nextElementSibling?.matches('.dbt-host'))
    check('default height is 240', Math.abs(rect('.dbt-dock').height - 240) < 1)
    check('real xterm renders ANSI snapshot', [...document.querySelectorAll('.xterm-screen')].some(node => node.textContent.includes('NuShell renderer fixture')))
    check('ANSI output acknowledged and xterm fitted', stats.acks > 0 && stats.resizes > 0)
    alignment('default'); sidebarChecks('default'); composerChecks('default')
    store.hide(); await pause(); check('hide detaches without closing', !document.querySelector('.dbt-dock') && stats.detaches > 0 && stats.closes === 0); sidebarChecks('hidden'); composerChecks('hidden')
    store.show(); store.collapse(); await pause(); check('collapse keeps two tabs', document.querySelectorAll('.dbt-dock [role=tab]').length === 2 && rect('.dbt-dock').height < 48 && stats.closes === 0); alignment('collapsed'); sidebarChecks('collapsed'); composerChecks('collapsed')
    store.collapse(); store.resize(1); await pause(); check('minimum height is 120', Math.abs(rect('.dbt-dock').height - 120) < 1)
    store.resize(10000); await pause(); const available = api.viewport.getSnapshot(); const composerHeight = rect('[data-fixture-main-composer]').height
    metrics.parentHeight = available.height; metrics.composerHeight = composerHeight; metrics.viewport = available
    const expectedMax = available.height - Math.max(180, available.composerHeight || 0)
    check('raised height clamps to parent minus reserved composer space', Math.abs(rect('.dbt-dock').height - expectedMax) < 1, { actual: rect('.dbt-dock').height, expected: expectedMax })
    alignment('raised'); sidebarChecks('raised'); composerChecks('raised')
    store.resize(320); await pause(); document.querySelector('[aria-label="最大化终端"]').click(); await pause(); scrollBottom()
    const expectedMaximized = available.height - Math.max(48, available.composerHeight || 0)
    check('maximize uses parent and composer reserve', Math.abs(rect('.dbt-dock').height - expectedMaximized) < 1, { actual: rect('.dbt-dock').height, expected: expectedMaximized })
    alignment('maximized'); sidebarChecks('maximized'); composerChecks('maximized')
    document.querySelector('[aria-label="还原高度"]').click(); await pause(); check('restore returns to previous height', Math.abs(rect('.dbt-dock').height - 320) < 1)
    document.querySelector('.dbt-resize').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); await pause(); check('keyboard resize raises height by 20px', Math.abs(rect('.dbt-dock').height - 340) < 1)
    document.querySelector('.fixture-git').style.height = '76px'; await pause(); await pause(); store.maximize(); await pause(); const expanded = api.viewport.getSnapshot(); check('ResizeObserver tracks expanded Git/composer height', expanded.composerHeight === Math.ceil(rect('[data-fixture-main-composer]').height) && expanded.composerHeight > composerHeight); check('maximize reserves expanded composer', Math.abs(rect('.dbt-dock').height - (expanded.height - expanded.composerHeight)) < 1); composerChecks('expanded Git maximized'); sidebarChecks('expanded Git maximized')
    store.maximize(); document.querySelector('.fixture-git').style.height = ''; await pause(); await pause()
    const originalWidth = rect('.dbt-host').width; rightVisible.set(false); await pause(); await pause(); alignment('right hidden'); sidebarChecks('right hidden'); check('right-column removal expands terminal by 260px', Math.abs(rect('.dbt-host').width - originalWidth - 260) < 1)
    rightVisible.set(true); await pause(); await pause(); check('right-column restoration restores width and single host', Math.abs(rect('.dbt-host').width - originalWidth) < 1 && document.querySelectorAll('.dbt-host').length === 1)
    api.session.set('session-b'); await pause(); check('session switch keeps old tabs and no closes', document.querySelectorAll('.dbt-dock [role=tab]').length === 0 && store.getSnapshot().sessions['session-a'].tabs.length === 2 && stats.closes === 0)
    api.session.set('session-a'); await pause(); check('return restores tabs with one main host', document.querySelectorAll('.dbt-dock [role=tab]').length === 2 && document.querySelectorAll('.dbt-host').length === 1)
    const cards = [...document.querySelectorAll('.dbt-terminal-guide')]; const compact = cards[0].getBoundingClientRect().height, described = cards[1].getBoundingClientRect().height
    metrics.guide = { compact, described, referenceCompact: rect('[data-reference=compact]').height, referenceDescribed: rect('[data-reference=description]').height }
    check('compact guide matches official 56px metric reference', Math.abs(compact - 56) < 1 && Math.abs(compact - metrics.guide.referenceCompact) < 1, metrics.guide)
    check('description guide matches official padding metric reference', Math.abs(described - metrics.guide.referenceDescribed) < 1 && described > compact, metrics.guide)
    check('guide has no native select', !document.querySelector('.dbt-terminal-guide select'))
    cards[0].querySelector('.dbt-terminal-guide-main').click(); await pause(); check('guide body creates bottom terminal', store.getSnapshot().sessions['session-a'].tabs.length === 3 && stats.rightOpens === 0)
    cards[0].querySelector('.dbt-terminal-guide-trigger').click(); await pause(); await pause(); check('shim menu exposes shell actions and SVG check', document.querySelector('[data-menu-id="shell:nu.exe"] svg') && document.querySelector('[data-menu-id="action:right"]'))
    document.querySelector('[data-menu-id="action:right"]').click(); await pause(); check('guide right action opens native target only (shim action wiring)', stats.rightOpens === 1 && store.getSnapshot().sessions['session-a'].tabs.length === 3)
    cards[0].querySelector('.dbt-terminal-guide-trigger').click(); await pause(); await pause(); document.querySelector('[data-menu-id="shell:nu.exe"]').click(); await pause(); check('guide shell action selects Nu and creates bottom tab (shim wiring)', stats.selectedShell === 'nu.exe' && store.getSnapshot().sessions['session-a'].tabs.length === 4)
    store.resize(240); scrollBottom(); await pause()
  } catch (error) { results.push({ error: error.message, stack: error.stack }) }
  return report()
}
async function responsive(label) {
  store.resize(240); await pause(); await pause(); scrollBottom()
  check(`${label}: ResizeObserver follows parent height`, api.viewport.getSnapshot().height === main().clientHeight)
  check(`${label}: closed new-terminal controls stay compact`, rect('.dbt-new-menu').width <= 80, { width: rect('.dbt-new-menu').width })
  const hide = document.querySelector('[aria-label="隐藏终端"]'), hideRect = hide.getBoundingClientRect(), dockRect = rect('.dbt-dock')
  check(`${label}: last hide button stays inside dock and clickable`, hideRect.left >= dockRect.left && hideRect.right <= dockRect.right && reachable(hide), { dockWidth: dockRect.width, hideRight: hideRect.right, dockRight: dockRect.right })
  if (dockRect.width < 420) check(`${label}: narrow dock hides label through container query`, getComputedStyle(document.querySelector('.dbt-label')).display === 'none')
  alignment(label); sidebarChecks(label); composerChecks(label)
  store.maximize(); await pause(); scrollBottom(); const viewport = api.viewport.getSnapshot()
  check(`${label}: maximized height follows resized parent`, Math.abs(rect('.dbt-dock').height - (viewport.height - Math.max(48, viewport.composerHeight))) < 1)
  alignment(`${label} maximized`); sidebarChecks(`${label} maximized`); composerChecks(`${label} maximized`)
  store.maximize(); await pause(); scrollBottom(); return report()
}
function report() { return { scope: 'Isolated real React/xterm/ReactDOM portal fixture; terminal models are test doubles with no real PTY; SVG components extracted unchanged from the verified official release; Menu/Button remain explicit test shims. Menu placement/collision is NOT native GUI acceptance.', results, metrics, stats } }
window.dbtTest = { ...createIconChecks({ store, main, pause, check }), run, report, responsive, async prepareDrag() { store.resize(240); scrollBottom(); await pause(); const r = rect('.dbt-resize'); return { x: r.left + r.width / 2, y: r.top + r.height / 2, height: rect('.dbt-dock').height } }, async verifyDrag(before) { await pause(); check('real CDP mouse drag raises dock by 60px', Math.abs(rect('.dbt-dock').height - before - 60) < 2, { before, after: rect('.dbt-dock').height }); alignment('mouse dragged'); sidebarChecks('mouse dragged'); composerChecks('mouse dragged'); return report() }, async scenario(name) { if (store.getSnapshot().maximized) store.maximize(); store.show(); store.resize(240); rightVisible.set(name !== 'no-right'); if (name === 'maximized') store.maximize(); await pause(); await pause(); scrollBottom(); if (name === 'guide') main().querySelector('[data-conversation-scroll]').scrollTop = 0; await pause(); return report() } }
