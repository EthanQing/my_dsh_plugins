import { createHistoryBrowser } from './history-view.js'

const api = (kind, params) => `api/task-diff.${kind}?${new URLSearchParams(params)}`
const noop = () => {}
const states = { tracking: '正在记录', settled: '本轮已结束', interrupted: '恢复的历史快照', incomplete: '记录不完整', missing: '等待新任务', ready: '已更新' }

export function createViews(React, ctx, open) {
  const { createElement: h, useState, useEffect, useCallback, useMemo } = React
  class NativeBoundary extends React.Component {
    constructor(props) { super(props); this.state = { failed: false } }
    static getDerivedStateFromError() { return { failed: true } }
    componentDidCatch() { console.warn('[dsh-task-diff-review] native ReviewTab contract is incompatible') }
    render() { return this.state.failed ? h('p', { className: 'dtd-message', role: 'alert' }, '原生 Diff 组件与当前版本不兼容。统计仍可查看，请升级插件后重开标签。') : this.props.children }
  }
  // One shared fetch per set of coordinates; dock and review never trigger parallel full scans.
  const pending = new Map(), cached = new Map(), selections = new Map()
  const read = async (kind, params, signal) => {
    const response = await fetch(api(kind, params), { signal, cache: 'no-store' })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || `读取失败 (${response.status})`)
    return body
  }
  const HistoryBrowser = createHistoryBrowser(React, read)
  function useSummary(sessionId, mode = 'task', base = '', taskId = '', commit = '', parent = 0) {
    const [state, setState] = useState(), [error, setError] = useState(''), [revision, setRevision] = useState(0)
    const key = JSON.stringify([sessionId, mode, base, taskId, commit, parent])
    const value = state?.key === key ? state.value : cached.get(key)
    useEffect(() => {
      let disposed = false, timer
      setState({ key, value: cached.get(key) }); setError('')
      if (mode === 'commits' && !commit) return
      const load = async () => {
        try {
          if (!pending.has(key)) pending.set(key, read('summary', { sessionId, mode, base, taskId, commit, parent: String(parent) }).finally(() => pending.delete(key)))
          const result = await pending.get(key)
          cached.set(key, result); while (cached.size > 30) cached.delete(cached.keys().next().value)
          if (!disposed) { setState({ key, value: result }); setError('') }
        } catch (err) { if (!disposed) setError(err.message) }
        // UI refresh reads recorded snapshots. It does not poll agents, session history, or tool progress.
        if (!disposed && !document.hidden && mode !== 'commits') timer = setTimeout(load, mode === 'task' ? 4000 : 10000)
      }
      const visible = () => { if (!document.hidden) { clearTimeout(timer); void load() } }
      document.addEventListener('visibilitychange', visible); void load()
      return () => { disposed = true; clearTimeout(timer); document.removeEventListener('visibilitychange', visible) }
    }, [key, revision])
    const refresh = useCallback(async () => {
      try { if (mode !== 'commits' || commit) await read('refresh', { sessionId, mode, base, taskId, commit, parent: String(parent) }); setRevision(value => value + 1) }
      catch (error) { setError(error.message) }
    }, [key])
    return { value, error, refresh }
  }
  const counts = value => h('span', { className: 'dtd-counts', title: '可计算的文本行；二进制和过大文件不提供行数' },
    h('span', { className: 'dtd-added' }, `+${value?.added ?? 0}`), ' ', h('span', { className: 'dtd-deleted' }, `−${value?.deleted ?? 0}`),
    value?.files?.some(file => file.binary || file.oversized) && h('span', { className: 'dtd-muted' }, '文本行'))
  const fileCount = file => file.binary ? h('span', { className: 'dtd-muted' }, '二进制') : file.oversized ? h('span', null, '过大') : counts(file)
  function FileList({ value, select, selected }) {
    return h('ul', { className: 'dtd-files', 'aria-label': '改动文件' }, value.files.map((file, index) => h('li', { key: `${file.repository}:${file.relative}` },
      h('button', { type: 'button', className: `dtd-file ${selected === index ? 'dtd-selected' : ''}`, title: file.path, onClick: () => select(index) },
        h('span', { className: `dtd-status dtd-status-${file.status}`, 'aria-label': ({ M: '修改', A: '新增', D: '删除', R: '重命名' })[file.status] || file.status }, ({ M: '● M', A: '+ A', D: '− D', R: '↔ R' })[file.status] || file.status),
        h('span', { className: 'dtd-path' }, file.untracked ? file.display.replace(/^\[未跟踪\] /, '') : file.display), file.untracked && h('span', { className: 'dtd-untracked' }, '未跟踪'), fileCount(file)))))
  }
  function Warnings({ value }) {
    if (!value?.warnings?.length) return null
    return h('details', { className: 'dtd-coverage' }, h('summary', null, value.warnings.length > 1 ? '覆盖范围有限 · 查看说明' : '覆盖范围与归属说明'),
      h('ul', null, value.warnings.map((warning, index) => h('li', { key: index }, warning))))
  }
  function Dock({ sessionId }) {
    const { value, error, refresh } = useSummary(sessionId)
    const [expanded, setExpanded] = useState(false)
    return h('section', { className: 'dtd-root dtd-dock', 'aria-label': '本轮代码改动' },
      h('div', { className: 'dtd-heading' }, h('button', { type: 'button', className: 'dtd-disclosure', 'aria-expanded': expanded, onClick: () => setExpanded(!expanded) },
        h('span', { 'aria-hidden': true }, expanded ? '⌄' : '›'), ` ${value?.warnings?.length > 1 ? '已覆盖 ' : ''}${value?.total ?? 0} 个文件`, counts(value)),
      h('span', { className: 'dtd-muted', role: 'status' }, error || (value?.warnings?.length > 1 ? '覆盖有限 · ' : '') + (states[value?.status] || '正在读取…')),
      h('button', { type: 'button', onClick: () => open(sessionId) }, '查看全部改动')),
      expanded && h(React.Fragment, null, value && h(FileList, { value, select: index => open(sessionId, index) }), h(Warnings, { value }),
        h('button', { type: 'button', onClick: refresh }, '刷新')))
  }
  function Review(props) {
    const { tab } = props.useTabInfo()
    // The resource owns its session even when the user navigates the main conversation.
    const sessionId = useMemo(() => { try { return decodeURIComponent(tab.contentId.split('/session/')[1]) } catch { return props.sessionId } }, [tab.contentId])
    const selectionKey = `${sessionId}:${tab.id}`, remembered = selections.get(selectionKey)
    const [mode, setMode] = useState(remembered?.mode ?? 'task'), [base, setBase] = useState(remembered?.base ?? ''), [taskId, setTaskId] = useState(remembered?.taskId ?? '')
    const [historyBranch, setHistoryBranch] = useState(remembered?.historyBranch ?? 'HEAD'), [commit, setCommit] = useState(remembered?.commit ?? ''), [parent, setParent] = useState(remembered?.parent ?? 0)
    const [historyRevision, setHistoryRevision] = useState(0)
    const { value, error, refresh } = useSummary(sessionId, mode, base, taskId, mode === 'commits' ? commit : '', mode === 'commits' ? parent : 0)
    const [choices, setChoices] = useState(remembered?.choices ?? { index: 0, split: false, wrap: false, navigated: -1 })
    const [diffState, setDiffState] = useState(), [diffRevision, setDiffRevision] = useState(0)
    const index = value?.files[choices.index] ? choices.index : 0
    const requestKey = `${value?.token}:${index}`
    const diff = diffState?.key === requestKey ? diffState.value : 'loading'
    useEffect(() => {
      selections.set(selectionKey, { mode, base, taskId, choices, historyBranch, commit, parent })
      while (selections.size > 100) selections.delete(selections.keys().next().value)
    }, [selectionKey, mode, base, taskId, choices, historyBranch, commit, parent])
    useEffect(() => {
      if (choices.navigated === tab.navigation.revision) return
      const params = tab.navigation.params
      if (params?.mode === 'task') { setMode('task'); setTaskId(params.taskId ?? '') }
      setChoices(value => ({ ...value, index: params?.index ?? value.index, navigated: tab.navigation.revision }))
    }, [tab.id, tab.navigation.revision])
    useEffect(() => {
      if (!value?.token || !value.files[index]) { setDiffState({ key: requestKey, value: 'missing' }); return }
      const abort = new AbortController(); setDiffState({ key: requestKey, value: 'loading' })
      void read('diff', { sessionId, token: value.token, index: String(index) }, abort.signal).then(diff => { if (!abort.signal.aborted) setDiffState({ key: requestKey, value: diff }) }).catch(() => { if (!abort.signal.aborted) setDiffState({ key: requestKey, value: 'error' }) })
      return () => abort.abort()
    }, [sessionId, value?.token, index, diffRevision])
    const original = ctx.slots.entries('sidebar.right.pane.tab').find(entry => entry.options.key === '@deepseek-ai/dsh-client-ui-deliverables')
    const nativeActions = useMemo(() => ({
      navigated: (_id, revision, index) => setChoices(value => ({ ...value, navigated: revision, index })),
      selected: (_id, index) => setChoices(value => ({ ...value, index })),
      toggledSplit: () => setChoices(value => ({ ...value, split: !value.split })),
      toggledWrap: () => setChoices(value => ({ ...value, wrap: !value.wrap })), forget: noop,
    }), [])
    const changeMode = next => { setMode(next); setChoices(value => ({ ...value, index: 0 })) }
    const nativeTab = { ...tab, contentId: `dsh-resource://changes-review/session/${encodeURIComponent(sessionId)}/0/${Math.max(1, value?.turn ?? 1)}`,
      navigation: { ...tab.navigation, params: { index } } }
    const summaryKey = `api/changes.summary?${new URLSearchParams({ sessionId, seq: '0' })}`
    const diffKey = `api/changes.diff?${new URLSearchParams({ sessionId, seq: '0', index: String(index) })}`
    return h('section', { className: `dtd-root dtd-review${mode === 'commits' ? ' dtd-review-commits' : ''}` },
      h('div', { className: 'dtd-toolbar' }, h('div', { role: 'group', 'aria-label': '改动范围', className: 'dtd-scopes' },
        [['task', '本轮对话'], ['uncommitted', '未提交'], ['staged', '暂存 Staged'], ['unstaged', '未暂存 Unstaged'], ['branch', '分支对比'], ['commits', '历史提交 Commits']].map(([key, label]) => h('button', { key, type: 'button', 'aria-pressed': mode === key, onClick: () => changeMode(key) }, label))),
        h('button', { type: 'button', onClick: () => { void refresh(); if (mode === 'commits') setHistoryRevision(value => value + 1) } }, '刷新')),
      mode === 'commits' && h(HistoryBrowser, { sessionId, branch: historyBranch, revision: historyRevision, selected: commit,
        onBranch: branch => { setHistoryBranch(branch); setCommit(''); setParent(0); setChoices(value => ({ ...value, index: 0 })) },
        onSelect: hash => { setCommit(hash); setParent(0); setChoices(value => ({ ...value, index: 0 })) } }),
      mode === 'commits' && value?.commit && h('div', { className: 'dtd-commit-detail' },
        h('strong', null, value.commit.subject || '（无标题）'), h('code', { className: 'dtd-commit-hash' }, value.commit.hash),
        h('p', { className: 'dtd-commit-meta' }, `${value.commit.author} · ${new Date(value.commit.date).toLocaleString()}`),
        h('details', null, h('summary', null, '完整提交说明'), h('pre', null, value.commit.body)),
        value.commit.parents.length > 1 && h('label', null, '对比父提交 ', h('select', { value: parent, onChange: event => { setParent(Number(event.target.value)); setChoices(value => ({ ...value, index: 0 })) } },
          value.commit.parents.map((hash, index) => h('option', { key: hash, value: index }, `父提交 ${index + 1} · ${hash}`))))),
      mode === 'branch' && h('label', { className: 'dtd-options' }, '基准分支 ', h('select', { value: base || value?.base || '', onChange: event => { setBase(event.target.value); setChoices(value => ({ ...value, index: 0 })) } }, (value?.branches ?? []).map(branch => h('option', { key: branch, value: branch }, branch)))),
      mode === 'task' && Boolean(value?.histories?.length) && h('label', { className: 'dtd-options' }, '任务 ', h('select', { value: taskId || value.taskId, onChange: event => { setTaskId(event.target.value); setChoices(value => ({ ...value, index: 0 })) } }, value.histories.map(task => h('option', { key: task.id, value: task.id }, `${new Date(task.started).toLocaleString()} · ${states[task.status] || task.status}`)))),
      h('div', { className: 'dtd-totals', role: 'status' }, error || (mode === 'commits' && !commit ? '选择一个提交查看详情与文件 Diff' : value ? `${value.total} 个文件 · ${states[value.status] || value.status}` : '正在读取…'), !error && (mode !== 'commits' || commit) && counts(value)),
      h(Warnings, { value }),
      value && value.files.length > 0 && h(FileList, { value, selected: index, select: index => setChoices(value => ({ ...value, index })) }),
      value?.files[index] && h('div', { className: 'dtd-fullpath', title: value.files[index].path }, value.files[index].path),
      mode === 'commits' && !commit ? null : original?.component && !error ? h('div', { className: 'dtd-native' }, h(NativeBoundary, null, h(original.component, {
        ...props, sessionId, useTabInfo: () => ({ tab: nativeTab }),
        useStore: selector => selector({ byTab: { [tab.id]: choices } }), actions: nativeActions,
        useChangesSummary: selector => selector({ [summaryKey]: value || 'loading' }),
        useChangesDiff: selector => selector({ [diffKey]: diff }),
        usePresentedHost: selector => selector({ available: false }), usePresentedOpen: selector => selector({}),
        loadChangesSummary: noop, loadChangesDiff: () => setDiffRevision(value => value + 1), reloadPresentedHost: noop, openChanged: noop,
        t: ctx.locale.bind(original.locale || 'deliverables'), renderSlot: () => null,
      }))) : h('p', { className: 'dtd-message' }, error || '当前 DSH 未提供兼容的原生 Diff 组件，请核对版本；不会替换或劫持原生审查页面。'))
  }
  return { Dock, Review }
}
