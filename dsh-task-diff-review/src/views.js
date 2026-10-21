import { subscribeGitRefresh } from './refresh.js'
import { createIcons } from './icons.js'

const api = (kind, params) => `api/task-diff.${kind}?${new URLSearchParams(params)}`
const noop = () => {}
const states = { tracking: '正在记录', settled: '本轮已结束', interrupted: '恢复的历史快照', incomplete: '记录不完整', missing: '等待新任务', ready: '已更新' }
const scopes = [['task', '本轮对话'], ['uncommitted', '未提交'], ['unstaged', '未暂存'], ['staged', '已暂存'], ['commits', '历史提交'], ['branch', '分支对比']]
const emptyStates = { task: '本轮尚无代码改动', uncommitted: '没有未提交的改动', unstaged: '没有未暂存的改动', staged: '暂存区没有改动', commits: '此提交没有文件差异', branch: '当前分支相对基准没有改动' }

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return '刚刚'
  if (mins < 60) return `${mins} 分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} 小时前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days} 天前`
  return new Date(dateStr).toLocaleDateString()
}

export function createViews(React, ctx, open) {
  const { createElement: h, useState, useEffect, useCallback, useMemo, useRef } = React
  const { IconChevron, IconChevronRight, IconCheck, IconRefresh, IconInfo } = createIcons(React)

  class NativeBoundary extends React.Component {
    constructor(props) { super(props); this.state = { failed: false } }
    static getDerivedStateFromError() { return { failed: true } }
    componentDidCatch() { console.warn('[dsh-task-diff-review] native ReviewTab contract is incompatible') }
    render() { return this.state.failed ? h('p', { className: 'dtd-message', role: 'alert' }, '原生 Diff 组件与当前版本不兼容。统计仍可查看，请升级插件后重开标签。') : this.props.children }
  }

  const pending = new Map(), cached = new Map(), selections = new Map()
  const read = async (kind, params, signal) => {
    const response = await fetch(api(kind, params), { signal, cache: 'no-store' })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || `读取失败 (${response.status})`)
    return body
  }

  function useSummary(sessionId, mode = 'task', base = '', taskId = '', commit = '', parent = 0) {
    const [state, setState] = useState(), [error, setError] = useState(''), [revision, setRevision] = useState(0)
    const key = JSON.stringify([sessionId, mode, base, taskId, commit, parent])
    const value = state?.key === key ? state.value : cached.get(key)
    useEffect(() => subscribeGitRefresh(() => { cached.clear(); pending.clear(); setRevision(v => v + 1) }), [])
    useEffect(() => {
      let disposed = false, timer, loading = false
      setState({ key, value: cached.get(key) }); setError('')
      if (mode === 'commits' && !commit) return
      const load = async () => {
        if (disposed || loading) return
        loading = true
        try {
          if (!pending.has(key)) {
            const task = read('summary', { sessionId, mode, base, taskId, commit, parent: String(parent) })
            pending.set(key, task); void task.finally(() => { if (pending.get(key) === task) pending.delete(key) }).catch(() => {})
          }
          const result = await pending.get(key)
          cached.set(key, result); while (cached.size > 30) cached.delete(cached.keys().next().value)
          if (!disposed) { setState({ key, value: result }); setError('') }
        } catch (err) { if (!disposed) setError(err.message) }
        finally { loading = false }
        if (!disposed && !document.hidden && mode !== 'commits') timer = setTimeout(load, mode === 'task' ? 4000 : 10000)
      }
      const visible = () => { if (!document.hidden) { clearTimeout(timer); void load() } }
      document.addEventListener('visibilitychange', visible); void load()
      return () => { disposed = true; clearTimeout(timer); document.removeEventListener('visibilitychange', visible) }
    }, [key, revision])
    const refresh = useCallback(async () => {
      try { if (mode !== 'commits' || commit) await read('refresh', { sessionId, mode, base, taskId, commit, parent: String(parent) }); setRevision(v => v + 1) }
      catch (err) { setError(err.message) }
    }, [key])
    return { value, error, refresh }
  }

  // Counts formatted with non-serif monospace font
  const counts = value => h('span', { className: 'dtd-counts', title: '可计算的文本行；二进制和过大文件不提供行数' },
    h('span', { className: 'dtd-added' }, `+${value?.added ?? 0}`), ' ', h('span', { className: 'dtd-deleted' }, `−${value?.deleted ?? 0}`),
    value?.files?.some(file => file.binary || file.oversized) && h('span', { className: 'dtd-muted' }, '文本行'))

  const fileCount = file => file.binary ? h('span', { className: 'dtd-muted' }, '二进制') : file.oversized ? h('span', null, '过大') : counts(file)

  function FileList({ value, select, selected }) {
    return h('ul', { className: 'dtd-files', 'aria-label': '改动文件' }, value.files.map((file, index) => h('li', { key: `${file.repository}:${file.relative}` },
      h('button', { type: 'button', className: `dtd-file ${selected === index ? 'dtd-selected' : ''}`, title: file.path, onClick: () => select(index) },
        h('span', { className: `dtd-status dtd-status-${file.status}`, 'aria-label': ({ M: '修改', A: '新增', D: '删除', R: '重命名' })[file.status] || file.status }, ({ M: 'M', A: 'A', D: 'D', R: 'R' })[file.status] || file.status),
        h('span', { className: 'dtd-path' }, file.untracked ? file.display.replace(/^\[未跟踪\] /, '') : file.display), file.untracked && h('span', { className: 'dtd-untracked' }, '未跟踪'), fileCount(file)))))
  }

  // 形态 A：内联摘要条（输入框上方，高 32px 单层圆角横条，SVG 旋转箭头）
  function Dock({ sessionId }) {
    const { value, error, refresh } = useSummary(sessionId)
    const [expanded, setExpanded] = useState(false)
    useEffect(() => { setExpanded(false) }, [sessionId, value?.taskId])
    if (!value || value.total <= 0) return null

    return h('div', { className: 'dtd-dock-seat' },
      h('section', { className: 'dtd-root dtd-dock-bar', 'aria-label': '本轮代码改动' },
        h('div', { className: 'dtd-dock-bar-main' },
          // Left side: SVG Chevron + File count + Line counts
          h('button', {
            type: 'button',
            className: 'dtd-dock-trigger',
            'aria-expanded': expanded,
            onClick: () => setExpanded(!expanded),
            title: expanded ? '折叠文件列表' : '展开文件列表',
          },
            h(IconChevronRight, { size: 12, className: `dtd-chevron-rotate ${expanded ? 'is-expanded' : ''}` }),
            h('span', { className: 'dtd-dock-files-label' }, `${value?.warnings?.length > 1 ? '已覆盖 ' : ''}${value?.total ?? 0} 个文件`),
            counts(value)),

          // Right side: Status indicator + Review button
          h('div', { className: 'dtd-dock-right' },
            h('span', { className: 'dtd-dock-status' },
              h('span', { className: 'dtd-pulse-dot' }),
              error || (value?.warnings?.length > 1 ? '覆盖有限 · ' : '') + (states[value?.status] || '正在读取…')),
            h('button', { type: 'button', className: 'dtd-dock-open-btn', onClick: () => open(sessionId) }, '查看审查'))),

        // Expanded file list drawer inside dock
        expanded && h('div', { className: 'dtd-dock-drawer' },
          value && h(FileList, { value, select: index => open(sessionId, index) }),
          h('div', { className: 'dtd-dock-drawer-foot' },
            h('button', { type: 'button', className: 'dtd-btn-compact', onClick: refresh }, '刷新')))))
  }

  // Cascading Scope Selector (Cascading Popover Menu, SVG Chevrons, Flip Support)
  function ScopeSelector({ mode, onSelectMode, commit, onSelectCommit, base, onSelectBase, value, sessionId, historyRevision }) {
    const [open, setOpen] = useState(false)
    const [submenuOpen, setSubmenuOpen] = useState(false)
    const [flipLeft, setFlipLeft] = useState(false)
    const [commits, setCommits] = useState([])
    const [loadingCommits, setLoadingCommits] = useState(false)
    const [search, setSearch] = useState('')

    const menuRef = useRef(null)
    const triggerRef = useRef(null)
    const hoverTimer = useRef(null)

    useEffect(() => {
      if (!open || !submenuOpen) return
      const abort = new AbortController()
      setLoadingCommits(true)
      void read('history', { sessionId, branch: 'HEAD', query: search, offset: '0', tip: '' }, abort.signal)
        .then(result => { if (!abort.signal.aborted) setCommits(result.commits || []) })
        .catch(() => { if (!abort.signal.aborted) setCommits([]) })
        .finally(() => { if (!abort.signal.aborted) setLoadingCommits(false) })
      return () => abort.abort()
    }, [open, submenuOpen, search, historyRevision, sessionId])

    useEffect(() => {
      if (!open) setSubmenuOpen(false)
      return () => clearTimeout(hoverTimer.current)
    }, [open])

    useEffect(() => {
      if (!open) return
      const onMouseDown = e => {
        if (menuRef.current && !menuRef.current.contains(e.target) && triggerRef.current && !triggerRef.current.contains(e.target)) {
          setOpen(false)
          setSubmenuOpen(false)
        }
      }
      const onKeyDown = e => {
        if (e.key === 'Escape') {
          setOpen(false)
          setSubmenuOpen(false)
        }
      }
      document.addEventListener('mousedown', onMouseDown)
      window.addEventListener('keydown', onKeyDown, true)
      return () => {
        document.removeEventListener('mousedown', onMouseDown)
        window.removeEventListener('keydown', onKeyDown, true)
      }
    }, [open])

    const handleHoverCommits = enter => {
      if (hoverTimer.current) clearTimeout(hoverTimer.current)
      if (enter) {
        hoverTimer.current = setTimeout(() => {
          if (menuRef.current) {
            const rect = menuRef.current.getBoundingClientRect()
            setFlipLeft(rect.right + 340 > window.innerWidth - 12)
          }
          setSubmenuOpen(true)
        }, 120)
      } else {
        hoverTimer.current = setTimeout(() => {
          setSubmenuOpen(false)
        }, 200)
      }
    }

    const currentLabel = scopes.find(s => s[0] === mode)?.[1] || '范围选择'
    const displayTitle = mode === 'commits' && commit ? `历史提交 · ${commit.slice(0, 7)}` : (mode === 'branch' && base ? `分支 · ${base}` : currentLabel)

    return h('div', { className: 'dtd-scope-picker-wrap' },
      // Trigger Button (高 28px，圆角 6px，内联 SVG 下拉箭头)
      h('button', {
        ref: triggerRef,
        type: 'button',
        className: `dtd-scope-trigger ${open ? 'dtd-scope-trigger-active' : ''}`,
        onClick: () => setOpen(!open),
        title: '选择代码审查范围',
        'aria-expanded': open,
      },
        h('span', { className: 'dtd-scope-trigger-label' }, displayTitle),
        value && h('span', { className: 'dtd-scope-badge' }, counts(value)),
        h(IconChevron, { size: 12, className: `dtd-chevron-rotate ${open ? 'is-expanded' : ''}` })),

      // Cascading Menu
      open && h('div', { ref: menuRef, className: 'dtd-cascade-menu' },
        // Primary Menu (宽 160px)
        h('div', { className: 'dtd-menu-primary' },
          scopes.map(([key, label]) => {
            const isSelected = mode === key
            const isCommits = key === 'commits'
            return h('div', {
              key,
              className: `dtd-menu-item ${isSelected ? 'dtd-menu-item-active' : ''}`,
              onClick: () => {
                if (isCommits) {
                  setSubmenuOpen(true)
                } else {
                  onSelectMode(key)
                  setOpen(false)
                  setSubmenuOpen(false)
                }
              },
              onMouseEnter: () => isCommits ? handleHoverCommits(true) : handleHoverCommits(false),
              onMouseLeave: () => isCommits ? handleHoverCommits(false) : null,
            },
              h('span', { className: 'dtd-menu-check' }, isSelected ? h(IconCheck, { size: 12 }) : null),
              h('span', { className: 'dtd-menu-label' }, label),
              isCommits && h(IconChevronRight, { size: 11, className: 'dtd-menu-arrow' }))
          })),

        // Submenu: Commits (宽 340px，自适应防遮挡)
        submenuOpen && h('div', {
          className: `dtd-submenu-panel ${flipLeft ? 'dtd-submenu-left' : 'dtd-submenu-right'}`,
          onMouseEnter: () => { if (hoverTimer.current) clearTimeout(hoverTimer.current) },
          onMouseLeave: () => handleHoverCommits(false),
        },
          h('div', { className: 'dtd-submenu-search' },
            h('input', {
              type: 'search',
              className: 'dtd-search-input',
              value: search,
              placeholder: '搜索提交记录或 Hash...',
              autoFocus: true,
              onChange: e => setSearch(e.target.value),
            })),
          h('div', { className: 'dtd-submenu-list' },
            loadingCommits && h('div', { className: 'dtd-submenu-empty' }, '正在加载提交…'),
            !loadingCommits && commits.length === 0 && h('div', { className: 'dtd-submenu-empty' }, '未找到匹配提交'),
            commits.map(c => h('div', {
              key: c.hash,
              className: `dtd-commit-item ${commit === c.hash ? 'dtd-commit-item-selected' : ''}`,
              onClick: () => {
                onSelectCommit(c.hash)
                onSelectMode('commits')
                setOpen(false)
                setSubmenuOpen(false)
              },
            },
              h('div', { className: 'dtd-commit-subject' }, c.subject || '（无标题）'),
              h('div', { className: 'dtd-commit-meta-line' },
                h('code', { className: 'dtd-hash-code' }, c.hash.slice(0, 7)),
                h('span', { className: 'dtd-muted' }, ` · ${c.author}`),
                h('span', { className: 'dtd-muted' }, ` · ${timeAgo(c.date)}`)))))
        )))
  }

  function Review(props) {
    const { tab } = props.useTabInfo()
    const sessionId = useMemo(() => { try { return decodeURIComponent(tab.contentId.split('/session/')[1]) } catch { return props.sessionId } }, [tab.contentId])
    const selectionKey = `${sessionId}:${tab.id}`, remembered = selections.get(selectionKey)
    const [mode, setMode] = useState(remembered?.mode ?? 'task')
    const [base, setBase] = useState(remembered?.base ?? '')
    const [taskId, setTaskId] = useState(remembered?.taskId ?? '')
    const [historyBranch, setHistoryBranch] = useState(remembered?.historyBranch ?? 'HEAD')
    const [commit, setCommit] = useState(remembered?.commit ?? '')
    const [parent, setParent] = useState(remembered?.parent ?? 0)
    const [historyRevision, setHistoryRevision] = useState(0)
    const [infoOpen, setInfoOpen] = useState(false)

    useEffect(() => subscribeGitRefresh(() => setHistoryRevision(v => v + 1)), [])
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
      setChoices(v => ({ ...v, index: params?.index ?? v.index, navigated: tab.navigation.revision }))
    }, [tab.id, tab.navigation.revision])

    useEffect(() => {
      if (!value?.token || !value.files[index]) { setDiffState({ key: requestKey, value: 'missing' }); return }
      const abort = new AbortController(); setDiffState({ key: requestKey, value: 'loading' })
      void read('diff', { sessionId, token: value.token, index: String(index) }, abort.signal).then(diff => {
        if (!abort.signal.aborted) setDiffState({ key: requestKey, value: diff })
      }).catch(() => { if (!abort.signal.aborted) setDiffState({ key: requestKey, value: 'error' }) })
      return () => abort.abort()
    }, [sessionId, value?.token, index, diffRevision])

    const original = ctx.slots.entries('sidebar.right.pane.tab').find(entry => entry.options.key === '@deepseek-ai/dsh-client-ui-deliverables')
    const nativeActions = useMemo(() => ({
      navigated: (_id, revision, idx) => setChoices(v => ({ ...v, navigated: revision, index: idx })),
      selected: (_id, idx) => setChoices(v => ({ ...v, index: idx })),
      toggledSplit: () => setChoices(v => ({ ...v, split: !v.split })),
      toggledWrap: () => setChoices(v => ({ ...v, wrap: !v.wrap })), forget: noop,
    }), [])

    const changeMode = next => { setMode(next); setChoices(v => ({ ...v, index: 0 })) }
    const nativeTab = {
      ...tab, contentId: `dsh-resource://changes-review/session/${encodeURIComponent(sessionId)}/0/${Math.max(1, value?.turn ?? 1)}`,
      navigation: { ...tab.navigation, params: { index } },
    }
    const summaryKey = `api/changes.summary?${new URLSearchParams({ sessionId, seq: '0' })}`
    const diffKey = `api/changes.diff?${new URLSearchParams({ sessionId, seq: '0', index: String(index) })}`

    // Identify if there are uncaptured/oversized files
    const uncapturedWarning = value?.warnings?.find(w => w.includes('未捕获') || w.includes('大小限制'))

    return h('section', { className: `dtd-root dtd-review${mode === 'commits' ? ' dtd-review-commits' : ''}` },
      // Single-line High-Density Toolbar (高 38px，严格单行)
      h('div', { className: 'dtd-toolbar-compact' },
        h('div', { className: 'dtd-toolbar-left' },
          h(ScopeSelector, {
            mode,
            onSelectMode: changeMode,
            commit,
            onSelectCommit: hash => { setCommit(hash); setParent(0); setChoices(v => ({ ...v, index: 0 })) },
            base,
            onSelectBase: setBase,
            value,
            sessionId,
            historyRevision,
          }),

          // Mini Task Round Selector (only for task mode with history)
          mode === 'task' && Boolean(value?.histories?.length) && h('select', {
            className: 'dtd-mini-select',
            value: taskId || value.taskId,
            onChange: e => { setTaskId(e.target.value); setChoices(v => ({ ...v, index: 0 })) },
            title: '切换历史任务轮次',
          }, value.histories.map(t => h('option', { key: t.id, value: t.id }, `${new Date(t.started).toLocaleTimeString()} · ${states[t.status] || t.status}`))),

          // Branch mode base picker
          mode === 'branch' && h('select', {
            className: 'dtd-mini-select',
            value: base || value?.base || '',
            onChange: e => { setBase(e.target.value); setChoices(v => ({ ...v, index: 0 })) },
            title: '基准分支',
          }, (value?.branches ?? []).map(b => h('option', { key: b, value: b }, b))),

          // File Summary
          value && !error && h('span', { className: 'dtd-file-summary' },
            h('span', null, `${value.total} 个文件`),
            counts(value))),

        h('div', { className: 'dtd-toolbar-right' },
          // Disclaimers Popover Button (ⓘ SVG)
          Boolean(value?.warnings?.length) && h('div', { className: 'dtd-info-popover-wrap' },
            h('button', {
              type: 'button',
              className: 'dtd-icon-btn dtd-info-trigger',
              title: '查看技术覆盖说明',
              onClick: () => setInfoOpen(!infoOpen),
            }, h(IconInfo, { size: 13 })),
            infoOpen && h('div', { className: 'dtd-info-popover' },
              h('div', { className: 'dtd-info-popover-title' }, '覆盖范围与归属说明'),
              h('ul', { className: 'dtd-info-list' }, value.warnings.map((w, i) => h('li', { key: i }, w))))),

          // Refresh Button (↻ SVG)
          h('button', {
            type: 'button',
            className: 'dtd-icon-btn',
            title: '刷新改动',
            onClick: () => { void refresh(); if (mode === 'commits') setHistoryRevision(v => v + 1) },
          }, h(IconRefresh, { size: 13 })))),

      // Conditional slim warning alert for uncaptured/large files (26px)
      uncapturedWarning && h('div', { className: 'dtd-slim-warning-bar' },
        h('span', null, `⚠️ ${uncapturedWarning}`),
        h('button', { type: 'button', className: 'dtd-btn-link', onClick: () => setInfoOpen(true) }, '查看说明')),

      // Commit Detail Bar (compact 1-2 lines for commits mode)
      mode === 'commits' && value?.commit && h('div', { className: 'dtd-commit-bar' },
        h('div', { className: 'dtd-commit-bar-main' },
          h('strong', null, value.commit.subject || '（无标题）'),
          h('code', { className: 'dtd-hash-code' }, value.commit.hash.slice(0, 10)),
          h('span', { className: 'dtd-muted' }, `${value.commit.author} · ${new Date(value.commit.date).toLocaleTimeString()}`)),
        value.commit.parents.length > 1 && h('select', {
          className: 'dtd-mini-select',
          value: parent,
          onChange: e => { setParent(Number(e.target.value)); setChoices(v => ({ ...v, index: 0 })) },
        }, value.commit.parents.map((pHash, pIdx) => h('option', { key: pHash, value: pIdx }, `父 ${pIdx + 1}: ${pHash.slice(0, 7)}`)))),

      // File List
      value && value.files.length > 0 && h(FileList, { value, selected: index, select: idx => setChoices(v => ({ ...v, index: idx })) }),
      value?.files[index] && h('div', { className: 'dtd-fullpath', title: value.files[index].path }, value.files[index].path),

      // Empty State
      value && value.files.length === 0 && !error && (mode !== 'commits' || commit) && h('p', { className: 'dtd-empty', role: 'status' }, emptyStates[mode]),
      mode === 'commits' && !commit && h('p', { className: 'dtd-empty', role: 'status' }, '点击上方「历史提交」选择要查看的 Commit 记录'),

      // Native Diff Viewer
      !value?.files.length || error ? null : original?.component ? h('div', { className: 'dtd-native' }, h(NativeBoundary, null, h(original.component, {
        ...props, sessionId, useTabInfo: () => ({ tab: nativeTab }),
        useStore: selector => selector({ byTab: { [tab.id]: choices } }), actions: nativeActions,
        useChangesSummary: selector => selector({ [summaryKey]: value || 'loading' }),
        useChangesDiff: selector => selector({ [diffKey]: diff }),
        usePresentedHost: selector => selector({ available: false }), usePresentedOpen: selector => selector({}),
        loadChangesSummary: noop, loadChangesDiff: () => setDiffRevision(v => v + 1), reloadPresentedHost: noop, openChanged: noop,
        t: ctx.locale.bind(original.locale || 'deliverables'), renderSlot: () => null,
      }))) : h('p', { className: 'dtd-message' }, error || '当前 DSH 未提供兼容的原生 Diff 组件。'))
  }

  return { Dock, Review }
}
