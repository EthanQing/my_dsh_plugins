import { shellLabel } from './shell.js'

const RIGHT = 'action:right'
const RETRY = 'action:retry'
const shellId = path => `shell:${path}`

// IDs distinguish shell paths from menu actions; native Menu renders the check SVG.
export function guideMenuItems(state, disabled = false) {
  let items
  if (state.phase === 'ready') {
    items = state.choices.shells.map(shell => ({ id: shellId(shell.path), label: shellLabel(shell), disabled }))
    if (!items.length) items = [{ id: 'status:empty', label: '没有可用的 Shell', disabled: true }]
  } else if (state.phase === 'failed') {
    items = [{ id: 'status:error', label: `读取 Shell 失败：${state.message}`, disabled: true }, { id: RETRY, label: '重试' }]
  } else items = [{ id: 'status:loading', label: '正在读取 Shell…', disabled: true }]
  return [...items, { type: 'separator', id: 'separator:location' }, { id: RIGHT, label: '在右侧打开' }]
}

export function createTerminalGuide(React, api, primitives) {
  const { createElement: h, useEffect, useState, useSyncExternalStore } = React
  const { Button, Menu, PluginArtworkTerminal, IconChevronRightOutlineRegular } = primitives
  return function TerminalGuide({ sessionId, title = '新建终端', description, useTabInfo }) {
    const subtitle = description === undefined ? undefined : '在底部打开终端'
    const { tab } = useTabInfo()
    const activity = useSyncExternalStore(api.activity.subscribe, api.activity.getSnapshot, api.activity.getSnapshot)
    const [open, setOpen] = useState(false)
    const [attempt, setAttempt] = useState(0)
    const [state, setState] = useState({ phase: 'loading' })
    useEffect(() => { setOpen(false) }, [sessionId])
    useEffect(() => {
      if (!open) return
      const lifetime = new AbortController()
      Promise.resolve().then(() => api.launchShells
        ? api.launchShells(sessionId, lifetime.signal)
        : api.terminals.launchShells(sessionId, lifetime.signal)).then(choices => {
        if (!lifetime.signal.aborted) setState({ phase: 'ready', choices })
      }, error => {
        if (!lifetime.signal.aborted) setState({ phase: 'failed', message: error instanceof Error ? error.message : String(error) })
      })
      return () => lifetime.abort()
    }, [open, attempt, sessionId])
    const unavailable = !sessionId || !activity.available || activity.launching
    const onSelect = id => {
      if (id === RETRY) { setState({ phase: 'loading' }); setAttempt(value => value + 1); return }
      if (id === RIGHT) {
        setOpen(false)
        tab.actions.openTab('terminal', { replaceTab: true })
        return
      }
      if (unavailable || state.phase !== 'ready') return
      const shell = state.choices.shells.find(candidate => shellId(candidate.path) === id)
      if (!shell) return
      if (api.selectShell) api.selectShell(shell.path)
      else api.terminals.selectShell(shell.path)
      setOpen(false)
      void api.newTerminal(sessionId, shell.path)
    }
    return h('div', { className: 'dbt-terminal-guide', 'data-sidebar-right-guide-entry': 'terminal' },
      h(Button, {
        variant: 'ghost', className: 'dbt-terminal-guide-main', disabled: unavailable,
        'aria-label': description === undefined ? title : `${title} ${subtitle}`,
        title: !sessionId || !activity.available ? '请先打开主聊天会话，并确认底部终端位置可用' : '在底部新建终端',
        onClick: () => { if (!unavailable) void api.newTerminal(sessionId) },
      }),
      h('span', { className: 'dbt-terminal-guide-icon', 'aria-hidden': true }, h(PluginArtworkTerminal, { size: description === undefined ? 22 : 26 })),
      h('span', { className: 'dbt-terminal-guide-text' },
        h('span', { className: 'dbt-terminal-guide-title', 'aria-hidden': true }, title),
        description !== undefined && h('span', { className: 'dbt-terminal-guide-description', 'aria-hidden': true }, subtitle)),
      h(Menu, {
        open, portal: true, autoFocus: true, side: 'right', align: 'start', selection: 'check',
        className: 'dbt-terminal-guide-menu', listClassName: 'dbt-terminal-guide-menu-list',
        items: guideMenuItems(state, unavailable),
        selectedId: state.phase === 'ready' ? shellId(state.choices.selectedShell) : undefined,
        onClose: () => setOpen(false), onSelect,
        anchor: h(Button, {
          variant: 'ghost', className: 'dbt-terminal-guide-trigger',
          'aria-label': '选择终端 Shell 或在右侧打开', 'aria-haspopup': 'menu', 'aria-expanded': open,
          onClick: () => { setState({ phase: 'loading' }); setOpen(value => !value) },
        }, h(IconChevronRightOutlineRegular, {})),
      }))
  }
}
