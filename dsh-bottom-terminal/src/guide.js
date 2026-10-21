import { shellLabel } from './shell.js'

export function createTerminalGuide(React, api) {
  const { createElement: h, useEffect, useState, useSyncExternalStore } = React
  return function TerminalGuide({ sessionId, title = '新建终端', useTabInfo }) {
    const { tab } = useTabInfo()
    const activity = useSyncExternalStore(api.activity.subscribe, api.activity.getSnapshot, api.activity.getSnapshot)
    const [choices, setChoices] = useState({ phase: 'loading', shells: [], selectedShell: '' })
    useEffect(() => {
      const lifetime = new AbortController()
      setChoices({ phase: 'loading', shells: [], selectedShell: '' })
      api.terminals.launchShells(sessionId, lifetime.signal).then(value => {
        if (!lifetime.signal.aborted) setChoices({ phase: 'ready', ...value })
      }, error => { if (!lifetime.signal.aborted) setChoices({ phase: 'failed', shells: [], selectedShell: '', error: error.message }) })
      return () => lifetime.abort()
    }, [sessionId])
    const openRight = () => tab.actions.openTab('terminal', { replaceTab: true, ...(choices.selectedShell ? { params: { shellPath: choices.selectedShell } } : {}) })
    return h('div', { className: 'dbt-guide', 'data-sidebar-right-guide-entry': 'terminal' },
      h('button', { type: 'button', className: 'dbt-guide-main', disabled: activity.launching, onClick: () => activity.available ? void api.newTerminal(sessionId, choices.selectedShell || undefined) : openRight() },
        h('span', { className: 'dbt-guide-icon', 'aria-hidden': true }, '>_'),
        h('span', null, h('strong', null, title), h('small', null, activity.available ? '在底部打开终端' : '底部位置已被占用，在右侧打开'))),
      h('div', { className: 'dbt-guide-options' },
        h('select', { 'aria-label': '新建终端的 Shell', value: choices.selectedShell || '', disabled: choices.phase !== 'ready' || !choices.shells.length || activity.launching,
          onChange: event => { const selectedShell = event.target.value; api.terminals.selectShell(selectedShell); setChoices(previous => ({ ...previous, selectedShell })) } },
          choices.shells.length ? choices.shells.map(shell => h('option', { key: shell.path, value: shell.path, title: shell.path }, shellLabel(shell))) : h('option', { value: '' }, choices.phase === 'loading' ? '正在读取 Shell…' : 'Shell 不可用')),
        h('button', { type: 'button', onClick: openRight, disabled: activity.launching }, '在右侧打开')),
      choices.error && h('small', { role: 'alert' }, choices.error))
  }
}
