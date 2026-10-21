import { subscribeGitRefresh, refreshGitViews } from './refresh.js'
import { createIcons } from './icons.js'

export function pushPreviewIssue(preview, remote, state, statusError = '') {
  if (!preview?.ticket) return ''
  const missing = ['remote', 'branch', 'localBranch', 'head'].filter(key => typeof preview[key] !== 'string' || !preview[key])
  if (missing.length) return `推送预览缺少 ${missing.join('、')}，Host 与 Client 可能未同步加载。请重启 DSH、刷新页面后重新检查推送目标。`
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(preview.head) || !Number.isSafeInteger(preview.count) || preview.count < 0 || !Array.isArray(preview.targets) || !preview.targets.length || preview.targets.some(target => !target || typeof target.url !== 'string' || !Number.isSafeInteger(target.count) || target.count < 0)) return '推送预览数据无效，请重新检查推送目标。'
  if (remote !== preview.remote) return '所选 Remote 已变化，请重新检查推送目标。'
  if (statusError) return '当前 Git 状态读取失败，请重新检查推送目标。'
  if (!state?.repository || !state.head || !state.branch) return '当前分支状态不可用，请重新检查推送目标。'
  if (state.head !== preview.head) return '本地 HEAD 已变化，请重新检查推送目标。'
  if (state.branch !== preview.localBranch) return '本地分支已变化，请重新检查推送目标。'
  const destination = state.remotes?.find(item => item.name === remote)
  if (!destination || destination.branch !== preview.branch || JSON.stringify(destination.urls) !== JSON.stringify(preview.targets.map(target => target.url))) return 'Remote 地址或目标分支已变化，请重新检查推送目标。'
  if (preview.count === 0) return '没有需要推送的提交。'
  return ''
}

export function createActionsPanel(React) {
  const { createElement: h, useState, useEffect, useRef, useCallback } = React
  const { IconBranch, IconChevron, IconClose, IconSparkles } = createIcons(React)

  const request = async (kind, sessionId, data) => {
    const response = await fetch(kind === 'status' ? `api/task-diff.git-status?${new URLSearchParams({ sessionId })}` : 'api/task-diff.git-action', {
      method: kind === 'status' ? 'GET' : 'POST',
      cache: 'no-store',
      ...(kind === 'status' ? {} : { headers: { 'content-type': 'application/json', 'x-dsh-git-action': '1' }, body: JSON.stringify({ ...data, sessionId }) }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || `Git 请求失败 (${response.status})`)
    return result
  }

  function Dialog({ title, close, busy, children, actions }) {
    const ref = useRef()
    useEffect(() => { const dialog = ref.current; dialog.showModal(); return () => dialog.close() }, [])
    return h('dialog', { ref, className: 'dtd-actions-dialog', 'aria-label': title, onCancel: event => { event.preventDefault(); if (!busy) close() } },
      h('div', { className: 'dtd-dialog-title' },
        h('strong', null, title),
        h('button', { type: 'button', className: 'dtd-dialog-close-btn', disabled: busy, onClick: close, 'aria-label': '关闭窗口' }, h(IconClose, { size: 12 }))),
      h('div', { className: 'dtd-dialog-body' }, children),
      h('div', { className: 'dtd-dialog-footer' },
        h('button', { type: 'button', className: 'dtd-btn-secondary', disabled: busy, onClick: close }, '取消'),
        actions))
  }

  function ActionsPanel({ sessionId }) {
    const [state, setState] = useState()
    const [error, setError] = useState('')
    const [statusError, setStatusError] = useState('')
    const [notice, setNotice] = useState('')
    const [expanded, setExpanded] = useState(false)
    const [selected, setSelected] = useState(new Set())
    const [busy, setBusy] = useState(false)
    const [modal, setModal] = useState()
    const [message, setMessage] = useState('')
    const [remote, setRemote] = useState('')
    const [rightOffset, setRightOffset] = useState(0)

    const generation = useRef(0)
    const mounted = useRef(true)
    const dialogMessage = useRef('')
    const popoverRef = useRef(null)
    const acting = useRef(false)
    const previewing = useRef(false)

    // Dynamic right-sidebar offset calculation
    useEffect(() => {
      let sidebar, frame
      const updateOffset = () => {
        frame = undefined
        const next = document.querySelector('[data-sidebar-right-open]')
        if (next !== sidebar) {
          if (sidebar) ro.unobserve(sidebar)
          sidebar = next
          if (sidebar) ro.observe(sidebar)
        }
        const rect = sidebar?.getBoundingClientRect()
        setRightOffset(rect && rect.width > 0 && rect.right >= window.innerWidth - 10 ? rect.width : 0)
      }
      const schedule = () => { if (frame === undefined) frame = requestAnimationFrame(updateOffset) }
      const ro = new ResizeObserver(schedule)
      const mo = new MutationObserver(records => {
        if (records.some(record => record.type === 'attributes' || [...record.addedNodes, ...record.removedNodes].some(node =>
          node.nodeType === 1 && (node.matches('[data-sidebar-right-open]') || node.querySelector('[data-sidebar-right-open]'))))) schedule()
      })
      mo.observe(document.body, { attributes: true, childList: true, subtree: true, attributeFilter: ['data-sidebar-right-open'] })
      updateOffset()
      window.addEventListener('resize', schedule)
      return () => {
        ro.disconnect()
        mo.disconnect()
        cancelAnimationFrame(frame)
        window.removeEventListener('resize', schedule)
      }
    }, [])

    // Close popover when clicking outside or pressing Escape
    useEffect(() => {
      if (!expanded) return
      const onMouseDown = event => {
        if (popoverRef.current && !popoverRef.current.contains(event.target)) {
          setExpanded(false)
        }
      }
      const onKeyDown = event => {
        if (event.key === 'Escape') {
          setExpanded(false)
        }
      }
      document.addEventListener('mousedown', onMouseDown)
      window.addEventListener('keydown', onKeyDown, true)
      return () => {
        document.removeEventListener('mousedown', onMouseDown)
        window.removeEventListener('keydown', onKeyDown, true)
      }
    }, [expanded])

    const load = useCallback(async () => {
      const epoch = ++generation.current
      try {
        const result = await request('status', sessionId)
        if (!mounted.current || epoch !== generation.current) return
        setState(result)
        setStatusError('')
        setSelected(previous => new Set([...previous].filter(path => result.files?.some(file => file.path === path))))
      } catch (error) {
        if (mounted.current && epoch === generation.current) setStatusError(error.message)
      }
    }, [sessionId])

    useEffect(() => {
      mounted.current = true
      let stopped = false, timer, polling = false
      setState(undefined); setSelected(new Set()); setModal(undefined); setError(''); setNotice('')
      const tick = async () => {
        if (stopped || polling) return
        polling = true
        try { await load() } finally { polling = false }
        if (!stopped && !document.hidden) timer = setTimeout(tick, 5000)
      }
      const visible = () => { if (!document.hidden) { clearTimeout(timer); void tick() } }
      const unsubscribe = subscribeGitRefresh(() => { void load() })
      document.addEventListener('visibilitychange', visible); void tick()
      return () => {
        stopped = true
        mounted.current = false
        generation.current++
        clearTimeout(timer)
        unsubscribe()
        document.removeEventListener('visibilitychange', visible)
      }
    }, [sessionId, load])

    const act = async (action, data = {}) => {
      if (acting.current || !mounted.current) return
      acting.current = true
      setBusy(true); setError(''); setNotice('')
      try {
        const result = await request('action', sessionId, { action, ...data })
        if (!mounted.current) return
        if (['stage', 'unstage', 'commit', 'push'].includes(action)) {
          setNotice(result.message); setSelected(new Set()); setModal(undefined)
          if (action === 'commit') {
            setMessage('')
            dialogMessage.current = ''
            setExpanded(false)
          }
        }
        return result
      } catch (error) {
        if (mounted.current) {
          setError(error.message)
          if (action === 'push') setModal(previous => previous?.kind === 'push' ? { ...previous, ticket: undefined, failed: true } : previous)
        }
      } finally {
        acting.current = false
        if (mounted.current) setBusy(false)
        if (['stage', 'unstage', 'commit', 'push'].includes(action)) refreshGitViews()
      }
    }

    const openPush = () => {
      const name = remotes.some(item => item.name === remote) ? remote : (state?.defaultRemote || remotes[0]?.name || '')
      setRemote(name)
      return previewPush(name)
    }

    const previewPush = async name => {
      if (acting.current || previewing.current || !mounted.current) return
      previewing.current = true
      generation.current++ // Ignore status reads started before this preview.
      setModal({ kind: 'push', checkingStatus: true })
      try {
        const result = await act('preparePush', { remote: name })
        if (!mounted.current) return
        if (!result) { setModal({ kind: 'push', failed: true }); return }
        setModal({ kind: 'push', ...result, checkingStatus: true })
        await load()
        if (mounted.current) setModal(previous => previous?.ticket === result.ticket ? { ...previous, checkingStatus: false } : previous)
      } finally {
        previewing.current = false
      }
    }

    const changeRemote = name => {
      if (acting.current || previewing.current) return
      setRemote(name); setError('')
      if (modal?.kind === 'push') return previewPush(name)
    }

    const select = path => setSelected(previous => {
      const next = new Set(previous)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })

    const paths = [...selected]
    const enabled = state?.repository && !busy && !state.busy
    const remotes = state?.remotes ?? []
    const staged = state?.files?.filter(file => file.staged) ?? []
    const unstaged = state?.files?.filter(file => file.unstaged) ?? []
    const changeMessage = value => { setMessage(value); dialogMessage.current = value }

    // Quick AI Commit Message generation
    const generateAiMessage = async () => {
      if (!enabled || !staged.length) return
      const prep = await act('prepareCommit')
      if (!prep?.ticket) return
      const ticket = prep.ticket
      const previous = dialogMessage.current
      const result = await act('generate', { ticket })
      if (result && dialogMessage.current === previous) {
        changeMessage(result.message)
      }
    }

    const handleCommit = async () => {
      if (!enabled || !message.trim()) return
      if (!staged.length) {
        if (unstaged.length) setModal({ kind: 'stageCommit', version: state.version, files: unstaged.length })
        return
      }
      const prep = await act('prepareCommit')
      if (prep) setModal({ kind: 'commit', ...prep, message: message.trim() })
    }

    const confirmStageCommit = async () => {
      const result = await act('stage', { all: true, paths: [], version: modal.version })
      if (!result) return
      const prep = await act('prepareCommit')
      if (prep) setModal({ kind: 'commit', ...prep, message: message.trim() })
    }

    if (!state) return null

    const renderFileInfo = path => {
      const idx = path.lastIndexOf('/')
      if (idx === -1) return { dir: '', file: path }
      return { dir: path.slice(0, idx + 1), file: path.slice(idx + 1) }
    }

    const errors = (error || statusError) && h('p', { className: 'dtd-action-error', role: 'alert' }, error || statusError)
    const pushIssue = modal?.kind === 'push' ? pushPreviewIssue(modal, remote, state, statusError) : ''
    const pushChecking = busy || modal?.checkingStatus
    const confirmPush = () => {
      if (pushChecking || previewing.current || pushIssue || !modal?.ticket) return
      return act('push', { ticket: modal.ticket, remote, branch: modal.branch, head: modal.head, confirmed: true })
    }

    // Formatted Pill Label (Task 3: 精简文案，零值隐藏)
    const stagedCount = staged.length
    const totalChanges = state.files ? state.files.length : 0
    let changesText = `${totalChanges} 项更改`
    if (stagedCount > 0) {
      changesText = `已暂存 ${stagedCount}/${totalChanges}`
    } else if (totalChanges === 0) {
      changesText = '干净'
    }

    return h('div', {
      className: 'dtd-actions-fixed-wrap',
      style: {
        position: 'fixed',
        bottom: '14px',
        right: `calc(${rightOffset}px + 16px)`,
        zIndex: 90,
        pointerEvents: 'none',
        transition: 'right 0.2s ease-out',
      },
    },
      h('div', { ref: popoverRef, className: 'dtd-actions-container', style: { pointerEvents: 'auto', position: 'relative' } },
        // Floating pill status button (形态 B：高 32px，圆角 16px，使用 SVG 图标)
        h('button', {
          type: 'button',
          className: `dtd-status-pill ${expanded ? 'dtd-status-pill-active' : ''}`,
          onClick: () => setExpanded(!expanded),
          title: 'Git 状态 (点击打开操作面板)',
          'aria-expanded': expanded,
        },
          h(IconBranch, { size: 14 }),
          h('span', { className: 'dtd-pill-branch' }, state.repository ? (state.branch || 'Detached') : '非仓库'),
          h('span', { className: 'dtd-pill-dot' }, '·'),
          state.repository ? (
            totalChanges > 0
              ? h('span', { className: 'dtd-pill-changes' }, h('span', { className: 'dtd-dot-orange' }, '●'), ` ${changesText}`)
              : h('span', { className: 'dtd-pill-clean' }, '✓ 干净')
          ) : h('span', { className: 'dtd-muted' }, '未关联'),
          // Only show ahead badge when ahead > 0 (zero-value hidden)
          state.ahead !== null && state.ahead > 0 ? h(React.Fragment, null,
            h('span', { className: 'dtd-pill-dot' }, '·'),
            h('span', { className: 'dtd-pill-ahead' }, `↑${state.ahead}`)) : null,
          h(IconChevron, { size: 12, className: `dtd-pill-chevron ${expanded ? 'is-expanded' : ''}` })),

        // Upward Popover (向上生长的操作面板)
        expanded && h('div', { className: 'dtd-git-popover', role: 'dialog', 'aria-label': 'Git 操作面板' },
          // Header (36px)
          h('div', { className: 'dtd-popover-header' },
            h('div', { className: 'dtd-popover-title' },
              h(IconBranch, { size: 14 }),
              h('strong', { className: 'dtd-popover-branch-name' }, state.branch || 'Detached HEAD')),
            h('div', { className: 'dtd-popover-header-actions' },
              remotes.length > 1 && h('select', {
                className: 'dtd-popover-remote-select',
                value: remote || state.defaultRemote,
                disabled: busy,
                onChange: e => changeRemote(e.target.value),
                title: '选择远端',
              }, remotes.map(r => h('option', { key: r.name, value: r.name }, r.name))),
              remotes.length > 0 && h('button', {
                type: 'button',
                className: 'dtd-btn-compact',
                disabled: !enabled || !state.head || !state.branch,
                onClick: openPush,
                title: '推送至远端',
              }, `↑ 推送${state.ahead && state.ahead > 0 ? ` (${state.ahead})` : ''}`),
              h('button', {
                type: 'button',
                className: 'dtd-popover-close-btn',
                onClick: () => setExpanded(false),
                'aria-label': '关闭面板',
              }, h(IconClose, { size: 12 })))),

          notice && h('div', { className: 'dtd-action-notice', role: 'status' }, notice),
          errors,

          !state.repository ? h('div', { className: 'dtd-empty-repo' }, state.message || '当前目录不是 Git 仓库') : h(React.Fragment, null,
            // File List Section (180px~220px, scrollable)
            h('div', { className: 'dtd-popover-files-section' },
              h('div', { className: 'dtd-files-subheader' },
                h('label', { className: 'dtd-check-label' },
                  h('input', {
                    type: 'checkbox',
                    className: 'dtd-header-checkbox',
                    checked: state.files.length > 0 && selected.size === state.files.length,
                    disabled: busy,
                    onChange: e => setSelected(e.target.checked ? new Set(state.files.map(f => f.path)) : new Set()),
                  }),
                  h('span', null, `全部变更 (${state.files.length})`)),
                h('div', { className: 'dtd-files-sub-actions' },
                  h('button', {
                    type: 'button',
                    className: 'dtd-btn-sub',
                    disabled: !enabled || !unstaged.length,
                    onClick: () => act('stage', { all: !paths.length, paths, version: state.version }),
                  }, paths.length ? `暂存所选 (${paths.length})` : `全部暂存 (${unstaged.length})`),
                  h('button', {
                    type: 'button',
                    className: 'dtd-btn-sub',
                    disabled: !enabled || !staged.length,
                    onClick: () => act('unstage', { all: !paths.length, paths, version: state.version }),
                  }, paths.length ? `取消所选 (${paths.length})` : `全部取消 (${staged.length})`))),

              h('div', { className: 'dtd-files-scroll-list' },
                state.files.length === 0
                  ? h('div', { className: 'dtd-empty-files' }, '工作区干净，无改动文件')
                  : state.files.map(file => {
                    const { dir, file: fileName } = renderFileInfo(file.path)
                    const statusChar = file.untracked ? 'U' : (file.xy.trim() || 'M')[0]
                    const statusClass = `dtd-badge-${statusChar}`
                    return h('div', { key: file.path, className: `dtd-file-row ${selected.has(file.path) ? 'dtd-file-row-selected' : ''}` },
                      h('input', {
                        type: 'checkbox',
                        className: 'dtd-row-checkbox',
                        checked: selected.has(file.path),
                        disabled: busy,
                        onChange: () => select(file.path),
                      }),
                      h('span', { className: `dtd-file-badge ${statusClass}` }, statusChar),
                      h('span', { className: 'dtd-file-name', title: file.path }, fileName),
                      dir && h('span', { className: 'dtd-file-dir', title: dir }, dir),
                      h('div', { className: 'dtd-file-hover-actions' },
                        file.unstaged && h('button', {
                          type: 'button',
                          className: 'dtd-quick-stage-btn',
                          title: '暂存此文件',
                          disabled: busy,
                          onClick: e => { e.stopPropagation(); void act('stage', { all: false, paths: [file.path], version: state.version }) },
                        }, '+'),
                        file.staged && h('button', {
                          type: 'button',
                          className: 'dtd-quick-unstage-btn',
                          title: '取消暂存此文件',
                          disabled: busy,
                          onClick: e => { e.stopPropagation(); void act('unstage', { all: false, paths: [file.path], version: state.version }) },
                        }, '−'))
                    )
                  }))),

            // Commit Section (pinned at bottom)
            h('div', { className: 'dtd-commit-section' },
              h('div', { className: 'dtd-commit-input-wrapper' },
                h('textarea', {
                  className: 'dtd-commit-textarea',
                  value: message,
                  placeholder: '输入提交信息 (Commit message)...',
                  rows: 2,
                  disabled: busy,
                  onChange: e => changeMessage(e.target.value),
                  onKeyDown: e => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault()
                      void handleCommit()
                    }
                  },
                }),
                h('button', {
                  type: 'button',
                  className: 'dtd-ai-generate-btn',
                  title: '使用本会话 AI 根据暂存改动生成提交说明',
                  disabled: !enabled || !staged.length,
                  onClick: generateAiMessage,
                }, h(IconSparkles, { size: 12 }), h('span', null, 'AI 生成'))),
              h('button', {
                type: 'button',
                className: 'dtd-btn-primary dtd-btn-commit-main',
                disabled: !enabled || !message.trim() || (!staged.length && !unstaged.length),
                onClick: handleCommit,
              }, busy ? '处理中…' : (staged.length > 0 ? `提交更改 (Commit ${staged.length} 个暂存文件)` : (unstaged.length > 0 ? '暂存全部并提交' : '提交更改')))))),

        modal?.kind === 'stageCommit' && h(Dialog, { title: '暂存全部并提交', busy, close: () => setModal(undefined),
          actions: h('button', { type: 'button', className: 'dtd-btn-primary', disabled: busy, onClick: confirmStageCommit }, busy ? '正在暂存…' : '确认暂存全部') },
          h('p', null, `将全部 ${modal.files} 个未暂存文件加入暂存区，然后预览并确认提交。`),
          errors),

        modal?.kind === 'commit' && h(Dialog, { title: '确认 Git 提交', busy, close: () => setModal(undefined),
          actions: h('button', { type: 'button', className: 'dtd-btn-primary', disabled: busy, onClick: () => act('commit', { ticket: modal.ticket, message: modal.message, confirmed: true }) }, busy ? '正在提交…' : '确认提交') },
          h('p', null, `分支：${modal.branch} · ${modal.files} 个暂存文件 · +${modal.added} / −${modal.deleted}`),
          h('p', { className: 'dtd-commit-preview' }, modal.message),
          errors),

        // Push Dialog Modal
        modal && modal.kind === 'push' && h(Dialog, { title: '确认 Git 推送', busy: pushChecking, close: () => setModal(undefined),
          actions: h('button', { type: 'button', className: 'dtd-btn-primary', disabled: Boolean(pushChecking || pushIssue || !modal.ticket), onClick: confirmPush }, modal.checkingStatus ? '确认推送' : busy ? '正在推送…' : '确认推送') },
          h('label', { className: 'dtd-dialog-row' }, '推送 Remote ', remotes.length === 1 ? h('strong', null, remote) : h('select', { value: remote, disabled: pushChecking, onChange: event => changeRemote(event.target.value) }, remotes.map(item => h('option', { key: item.name, value: item.name }, `${item.name} · ${item.urls.join(' ; ')}`)))),
          h('div', { className: 'dtd-push-urls' }, remotes.find(item => item.name === remote)?.urls.map(url => h('div', { key: url }, url))),
          errors,
          modal.checkingStatus && h('p', { role: 'status', className: 'dtd-muted' }, '正在检查推送目标…'),
          !modal.checkingStatus && modal.ticket && h(React.Fragment, null,
            h('p', null, `目标：${modal.remote || '未返回'} / ${modal.branch || '未返回'} · ${modal.targets?.length === 1 ? `待推送 ${modal.count} 个提交` : '各推送地址分别统计如下'}`),
            h('p', null, '提交：', h('code', null, modal.head || 'Host 未返回 HEAD')),
            Array.isArray(modal.targets) && modal.targets.filter(target => target && typeof target.url === 'string').map(target => h('p', { key: target.url, className: 'dtd-muted' }, `${target.url} · ${target.count} 个提交`)),
            pushIssue && h('p', { className: 'dtd-action-error', role: 'alert' }, pushIssue)),
          !pushChecking && (pushIssue || modal.failed) && h('button', { type: 'button', className: 'dtd-dialog-recheck', disabled: !remotes.some(item => item.name === remote), onClick: () => previewPush(remote) }, '重新检查'))
      ))
  }

  return props => h(ActionsPanel, { ...props, key: props.sessionId })
}
