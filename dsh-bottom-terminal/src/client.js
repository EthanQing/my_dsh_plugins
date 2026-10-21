import { createDockState, retainedTabs } from './state.js'
import { createDock } from './dock.js'
import { createTerminalGuide } from './guide.js'
import styles from './style.css'
import xtermStyles from '../vendor/xterm/css/xterm.css'

const ID = 'dsh-bottom-terminal'
const COMMAND = 'terminal.bottom.new'
function observable(initial) {
  let value = initial
  const listeners = new Set()
  return { getSnapshot: () => value, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) }, set(next) { value = next; for (const listener of listeners) listener() }, dispose() { listeners.clear() } }
}

window.__ModuleLoader__.load({
  id: ID,
  factory: require => {
    const React = require('react')
    const { ClientTerminals } = require('@deepseek-ai/dsh-api-terminal-controller')
    return {
      inject: ['slots', 'sessions', 'remote', 'remote.terminal', 'connection', 'sidebarRight', 'theme', 'shortcuts'],
      apply(ctx) {
        const local = ctx.isolate('webTerminals')
        const terminals = new ClientTerminals(local, ctx.remote.terminal)
        let storage
        try { storage = window.localStorage } catch {}
        const store = createDockState({ storage, onStorageError: error => ctx.logger.warn('底部终端布局未能持久保存', error) })
        const session = observable(undefined)
        const activity = observable({ available: false, launching: false, message: '' })
        const lifetime = new AbortController()
        const patchActivity = patch => { if (!lifetime.signal.aborted) activity.set({ ...activity.getSnapshot(), ...patch }) }
        const syncSession = () => session.set(Object.values(ctx.sessions.list.getSnapshot().byId).find(row => (row.retainedBy.mainView ?? 0) > 0)?.id)
        const syncHolds = () => terminals.retainTabs(retainedTabs(store.getSnapshot()))
        ctx.effect(() => {
          const offSession = ctx.sessions.list.subscribe(syncSession)
          const offHolds = store.subscribe(syncHolds)
          syncSession(); syncHolds()
          return () => { lifetime.abort(); offSession(); offHolds(); terminals.retainTabs([]); store.dispose(); session.dispose(); activity.dispose() }
        })
        ctx.effect(() => {
          const style = document.createElement('style')
          style.dataset.plugin = ID
          style.textContent = `${xtermStyles}\n${styles}`
          document.head.append(style)
          return () => style.remove()
        })
        const api = {
          store, terminals, session, activity,
          theme: { getSnapshot: () => ctx.theme.getTheme(), subscribe: listener => ctx.on('theme/change', listener) },
          async newTerminal(sessionId = session.getSnapshot(), shellPath) {
            if (lifetime.signal.aborted || activity.getSnapshot().launching) return
            if (!activity.getSnapshot().available) { ctx.logger.warn('shell.bottom 已被其他插件占用，底部终端未打开'); return }
            if (!sessionId) { patchActivity({ message: '请先选择会话' }); store.show(); return }
            patchActivity({ launching: true, message: '' }); store.show()
            try {
              const choices = await terminals.launchShells(sessionId, lifetime.signal)
              if (lifetime.signal.aborted) return
              const selected = shellPath || choices.selectedShell || choices.shells[0]?.path
              if (!selected || !choices.shells.some(shell => shell.path === selected)) throw new Error('所选 Shell 不可用，请从列表选择可用的 Shell')
              terminals.selectShell(selected)
              store.add(sessionId, selected)
            } catch (error) { if (!lifetime.signal.aborted) patchActivity({ message: error.message || String(error) }) }
            finally { patchActivity({ launching: false }) }
          },
          closeTab(sessionId, tab) {
            if (lifetime.signal.aborted) return
            // Only this explicit action closes the Host process. Hiding never calls close.
            terminals.close(sessionId, tab.id, tab.contentId)
            store.remove(sessionId, tab.id)
          },
          openRight() {
            const target = ctx.sidebarRight.commandTarget()
            if (target) ctx.sidebarRight.openTabFromTarget('terminal', target)
            else patchActivity({ message: '当前会话没有可用的右侧终端位置' })
          },
        }
        const LoadedTerminal = React.lazy(() => import('./terminal-view.js').then(module => ({ default: module.createTerminalView(React) })))
        const TerminalView = props => React.createElement(React.Suspense, { fallback: React.createElement('div', { className: 'dbt-message', role: 'status' }, '正在加载终端…') }, React.createElement(LoadedTerminal, props))
        const Dock = createDock(React, api, TerminalView)
        ctx.slots.inject('shell.bottom', () => {
          let unregister, changing = false, warned = false
          const sync = () => {
            if (changing || lifetime.signal.aborted) return
            changing = true
            try {
              const occupied = ctx.slots.entries('shell.bottom').some(entry => entry.options.id !== ID)
              if (occupied) {
                if (unregister) { const off = unregister; unregister = undefined; off() }
                patchActivity({ available: false })
                if (!warned) { warned = true; ctx.logger.warn('shell.bottom 是单一插槽，已有其他插件占用；底部终端不会覆盖现有内容') }
              } else {
                if (!unregister) unregister = ctx.slots.register({ name: 'shell.bottom', id: ID, priority: 1000 }, Dock)
                warned = false
                patchActivity({ available: true })
              }
            } finally { changing = false }
          }
          const unsubscribe = ctx.slots.subscribe('shell.bottom', sync)
          sync()
          return () => { unsubscribe(); unregister?.(); patchActivity({ available: false }) }
        })
        const Guide = createTerminalGuide(React, api)
        ctx.slots.inject('sidebar.right.tab.guide.entry', () => {
          const key = '@deepseek-ai/dsh-client-ui-sidebar-terminal'
          if (ctx.slots.entries('sidebar.right.tab.guide.entry').some(entry => entry.options.key === key && (entry.options.priority ?? 0) !== 0)) {
            ctx.logger.warn('终端引导入口已有自定义扩展，保留其入口；可通过输入框旁的终端按钮打开底部')
            return
          }
          return ctx.slots.register({ name: 'sidebar.right.tab.guide.entry', key, priority: -1 }, Guide)
        })
        // An unobtrusive composer entry also restores a hidden dock without creating a process.
        function Launcher() {
          const current = React.useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
          const status = React.useSyncExternalStore(activity.subscribe, activity.getSnapshot, activity.getSnapshot)
          return React.createElement('button', { type: 'button', className: 'dbt-launcher', disabled: !current || !status.available, title: status.available ? '显示底部终端' : '底部位置已由其他插件占用', onClick: () => store.show() }, '终端')
        }
        ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({ name: 'conversation.composer.dock', id: ID }, Launcher))
        ctx.effect(() => {
          const binding = { code: 'Backquote', modifiers: ['control', 'shift'] }
          const description = ctx.shortcuts.describeBinding(binding)
          const defaults = description.conflicts.length || description.issue ? {} : Object.fromEntries(['desktop:windows', 'desktop:linux', 'desktop:macos', 'web:windows'].map(key => [key, binding]))
          const command = {
            id: COMMAND, label: () => '新建底部终端', aliases: ['bottom terminal', '底部终端'], defaults,
            regions: ['page', 'editable', 'terminal'], modals: [],
            resolve: () => {
              if (!activity.getSnapshot().available || !session.getSnapshot()) return { status: 'pass' }
              return { status: 'handled', run: () => { void api.newTerminal() } }
            },
          }
          if (!Object.keys(defaults).length) ctx.logger.warn('底部终端快捷键存在冲突或不可用；保留独立命令，请在快捷键设置分配按键')
          try { return ctx.shortcuts.register(command) }
          catch (error) {
            if (!Object.keys(defaults).length) throw error
            ctx.logger.warn('底部终端默认快捷键未注册，保留其他插件按键', error)
            return ctx.shortcuts.register({ ...command, defaults: {} })
          }
        })
      },
    }
  },
})
