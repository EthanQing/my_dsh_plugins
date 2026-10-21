import { shellLabel } from './shell.js'

export function createDock(React, api, TerminalView) {
  const { createElement: h, useEffect, useRef, useState, useSyncExternalStore } = React
  const useStore = store => useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  function Tab({ tab, sessionId, selected }) {
    const model = api.terminals.view(sessionId, tab.id, tab.contentId, undefined, tab.shellPath)
    const state = useStore(model.state)
    const title = state.info?.title || state.title || '终端'
    const [editing, setEditing] = useState(false)
    const input = useRef(null)
    const cancelled = useRef(false)
    useEffect(() => { if (editing) { input.current?.focus(); input.current?.select() } }, [editing])
    const edit = () => { cancelled.current = false; setEditing(true) }
    return h('div', { className: `dbt-tab${selected ? ' is-active' : ''}` },
      editing ? h('input', { ref: input, className: 'dbt-rename', defaultValue: title, maxLength: 120, 'aria-label': '终端名称',
        onBlur: event => { setEditing(false); const next = event.currentTarget.value.trim(); if (!cancelled.current && next && next !== title) void model.rename(next) },
        onKeyDown: event => { event.stopPropagation(); if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return; if (event.key === 'Escape') { cancelled.current = true; event.currentTarget.blur() } else if (event.key === 'Enter') event.currentTarget.blur() },
      }) : h('button', { type: 'button', role: 'tab', 'aria-selected': selected, onClick: () => api.store.select(sessionId, tab.id), onDoubleClick: edit, onKeyDown: event => { if (event.key === 'F2') { event.preventDefault(); edit() } }, title: `${title}（双击或 F2 重命名）` }, title),
      h('button', { type: 'button', className: 'dbt-tab-close', title: `关闭 ${title}（结束进程）`, 'aria-label': `关闭 ${title}（结束进程）`, onClick: () => api.closeTab(sessionId, tab) }, '×'))
  }
  return function BottomTerminalDock() {
    const layout = useStore(api.store)
    const sessionId = useStore(api.session)
    const theme = useStore(api.theme)
    const activity = useStore(api.activity)
    const failures = useStore(api.terminals.closeFailures)
    const [menu, setMenu] = useState(false)
    const [shells, setShells] = useState({ phase: 'idle' })
    const drag = useRef(null)
    const root = useRef(null)
    const session = layout.sessions[sessionId]
    const tabs = session?.tabs || []
    useEffect(() => {
      if (!menu || !sessionId) return
      const controller = new AbortController()
      setShells({ phase: 'loading' })
      api.terminals.launchShells(sessionId, controller.signal).then(choices => {
        if (!controller.signal.aborted) setShells({ phase: 'ready', ...choices })
      }, error => { if (!controller.signal.aborted) setShells({ phase: 'error', error: error.message }) })
      return () => controller.abort()
    }, [menu, sessionId])
    useEffect(() => {
      setMenu(false)
    }, [sessionId, layout.visible, layout.collapsed])
    useEffect(() => {
      if (!menu) return
      const outside = event => { if (!event.target.closest?.('.dbt-new-menu')) setMenu(false) }
      const key = event => { if (event.key === 'Escape') setMenu(false) }
      document.addEventListener('pointerdown', outside)
      document.addEventListener('keydown', key)
      return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key) }
    }, [menu])
    useEffect(() => () => {
      if (drag.current) { try { drag.current.element.releasePointerCapture(drag.current.id) } catch {} drag.current = null }
    }, [])
    if (!layout.visible || !activity.available) return null
    const launch = shellPath => { setMenu(false); void api.newTerminal(sessionId, shellPath) }
    const finishDrag = event => {
      if (!drag.current || event.pointerId !== drag.current.id) return
      try { event.currentTarget.releasePointerCapture(event.pointerId) } catch {}
      drag.current = null
    }
    return h('section', { className: `dbt-dock${layout.collapsed ? ' is-collapsed' : ''}${layout.maximized ? ' is-maximized' : ''}`, ref: root, 'aria-label': '底部终端', style: layout.collapsed ? undefined : { height: layout.maximized ? 'calc(100dvh - var(--dsh-frame-top-clearance, 0px) - 140px)' : `min(${layout.height}px, 75dvh)` } },
      !layout.collapsed && h('div', { className: 'dbt-resize', role: 'separator', 'aria-label': '调整终端高度', 'aria-orientation': 'horizontal', 'aria-valuemin': 140, 'aria-valuemax': 900, 'aria-valuenow': layout.height, tabIndex: 0,
        onKeyDown: event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); api.store.resize(layout.height + (event.key === 'ArrowUp' ? 20 : -20)) } },
        onPointerDown: event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: event.pointerId, y: event.clientY, height: root.current.getBoundingClientRect().height, element: event.currentTarget } },
        onPointerMove: event => { if (drag.current?.id === event.pointerId) api.store.resize(drag.current.height + drag.current.y - event.clientY) },
        onPointerUp: finishDrag, onPointerCancel: finishDrag, onLostPointerCapture: () => { drag.current = null },
      }),
      h('header', { className: 'dbt-toolbar' },
        h('strong', { className: 'dbt-label' }, '终端'),
        h('div', { className: 'dbt-tabs', role: 'tablist', 'aria-label': '当前会话终端' }, tabs.map(tab => h(Tab, { key: tab.id, tab, sessionId, selected: tab.id === session.activeId }))),
        h('div', { className: 'dbt-new-menu' },
          h('button', { type: 'button', disabled: !sessionId || activity.launching, onClick: () => launch(), title: '新建底部终端' }, '+'),
          h('button', { type: 'button', disabled: !sessionId || activity.launching, onClick: () => setMenu(!menu), 'aria-label': '选择 Shell 和新建位置', 'aria-expanded': menu }, '▾'),
          menu && h('div', { className: 'dbt-menu', role: 'menu' },
            shells.phase === 'loading' && h('span', { role: 'status' }, '正在读取 Shell…'),
            shells.phase === 'error' && h('span', { role: 'alert' }, shells.error),
            shells.phase === 'ready' && shells.shells.length === 0 && h('span', null, '没有可用的 Shell'),
            shells.phase === 'ready' && shells.shells.map(shell => h('button', { type: 'button', role: 'menuitem', key: shell.path, title: shell.path, onClick: () => launch(shell.path) }, `${shell.path === shells.selectedShell ? '✓ ' : ''}${shellLabel(shell)}`)),
            h('button', { type: 'button', role: 'menuitem', onClick: () => { setMenu(false); api.openRight() } }, '在右侧新建终端'))),
        h('button', { type: 'button', onClick: () => api.store.collapse(), title: layout.collapsed ? '展开终端' : '折叠终端（保留进程）', 'aria-label': layout.collapsed ? '展开终端' : '折叠终端' }, layout.collapsed ? '▴' : '▾'),
        h('button', { type: 'button', onClick: () => api.store.maximize(), title: layout.maximized ? '还原高度' : '最大化终端', 'aria-label': layout.maximized ? '还原高度' : '最大化终端' }, layout.maximized ? '▣' : '□'),
        h('button', { type: 'button', onClick: () => api.store.hide(), title: '隐藏终端（保留进程）', 'aria-label': '隐藏终端' }, '×')),
      !layout.collapsed && h('div', { className: 'dbt-content' },
        activity.launching && h('div', { className: 'dbt-message', role: 'status' }, '正在启动终端…'),
        activity.message && h('div', { className: 'dbt-message', role: 'alert' }, activity.message),
        failures.map(failure => h('div', { className: 'dbt-message', key: failure.id, role: 'alert' }, `终端「${failure.title}」未能结束：${failure.message} `, h('button', { type: 'button', onClick: () => api.terminals.retryClose(failure.id) }, '重试关闭'))),
        !sessionId ? h('div', { className: 'dbt-empty' }, '请先选择会话') : tabs.length === 0 ? h('div', { className: 'dbt-empty' }, h('button', { type: 'button', disabled: activity.launching, onClick: () => launch() }, '新建终端')) :
          tabs.map(tab => h('div', { key: tab.id, className: 'dbt-terminal-pane', hidden: tab.id !== session.activeId }, h(TerminalView, { model: api.terminals.view(sessionId, tab.id, tab.contentId, undefined, tab.shellPath), visible: tab.id === session.activeId, theme }))))
    )
  }
}
