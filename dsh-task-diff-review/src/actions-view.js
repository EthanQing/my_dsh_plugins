import { subscribeGitRefresh, refreshGitViews } from './refresh.js'

export function createActionsPanel(React) {
  const { createElement: h, useState, useEffect, useRef, useCallback } = React
  const request = async (kind, sessionId, data) => {
    const response = await fetch(kind === 'status' ? `api/task-diff.git-status?${new URLSearchParams({ sessionId })}` : 'api/task-diff.git-action', {
      method: kind === 'status' ? 'GET' : 'POST', cache: 'no-store',
      ...(kind === 'status' ? {} : { headers: { 'content-type': 'application/json', 'x-dsh-git-action': '1' }, body: JSON.stringify({ ...data, sessionId }) }),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || `Git 请求失败 (${response.status})`)
    return result
  }
  function Dialog({ title, close, busy, children }) {
    const ref = useRef()
    useEffect(() => { ref.current.showModal(); return () => ref.current?.close() }, [])
    return h('dialog', { ref, className: 'dtd-actions-dialog', 'aria-label': title, onCancel: event => { event.preventDefault(); if (!busy) close() } },
      h('div', { className: 'dtd-dialog-title' }, h('strong', null, title), h('button', { type: 'button', disabled: busy, onClick: close, 'aria-label': '关闭窗口' }, '×')), children)
  }
  function ActionsPanel({ sessionId }) {
    const [state, setState] = useState(), [error, setError] = useState(''), [statusError, setStatusError] = useState(''), [notice, setNotice] = useState(''), [expanded, setExpanded] = useState(false)
    const [selected, setSelected] = useState(new Set()), [busy, setBusy] = useState(false), [modal, setModal] = useState(), [message, setMessage] = useState(''), [remote, setRemote] = useState('')
    const generation = useRef(0), mounted = useRef(true), dialogMessage = useRef('')
    const load = useCallback(async () => {
      const epoch = ++generation.current
      try {
        const result = await request('status', sessionId)
        if (!mounted.current || epoch !== generation.current) return
        setState(result); setStatusError('')
        setSelected(previous => new Set([...previous].filter(path => result.files?.some(file => file.path === path))))
      } catch (error) { if (mounted.current && epoch === generation.current) setStatusError(error.message) }
    }, [sessionId])
    useEffect(() => {
      mounted.current = true; let stopped = false, timer
      setState(undefined); setSelected(new Set()); setModal(undefined); setError(''); setNotice('')
      const tick = async () => { await load(); if (!stopped && !document.hidden) timer = setTimeout(tick, 5000) }
      const visible = () => { if (!document.hidden) { clearTimeout(timer); void tick() } }
      const unsubscribe = subscribeGitRefresh(() => { void load() })
      document.addEventListener('visibilitychange', visible); void tick()
      return () => { stopped = true; mounted.current = false; generation.current++; clearTimeout(timer); unsubscribe(); document.removeEventListener('visibilitychange', visible) }
    }, [sessionId, load])
    const act = async (action, data = {}) => {
      if (busy) return
      setBusy(true); setError(''); setNotice('')
      try {
        const result = await request('action', sessionId, { action, ...data })
        if (!mounted.current) return
        if (['stage', 'unstage', 'commit', 'push'].includes(action)) {
          setNotice(result.message); setSelected(new Set()); setModal(undefined)
        }
        return result
      } catch (error) { if (mounted.current) setError(error.message) }
      finally {
        if (mounted.current) setBusy(false)
        if (['stage', 'unstage', 'commit', 'push'].includes(action)) refreshGitViews()
      }
    }
    const prepareCommit = async () => {
      const result = await act('prepareCommit')
      if (result) { setMessage(''); dialogMessage.current = ''; setModal({ kind: 'commit', ...result }) }
    }
    const openPush = () => {
      setRemote(state.defaultRemote); setModal({ kind: 'push' }); setError(''); setNotice('')
    }
    const previewPush = async name => {
      setModal({ kind: 'push' })
      const result = await act('preparePush', { remote: name })
      if (result) setModal({ kind: 'push', ...result })
    }
    const select = path => setSelected(previous => { const next = new Set(previous); next.has(path) ? next.delete(path) : next.add(path); return next })
    const paths = [...selected], enabled = state?.repository && !busy && !state.busy
    const remotes = state?.remotes ?? []
    const staged = state?.files?.filter(file => file.staged) ?? [], unstaged = state?.files?.filter(file => file.unstaged) ?? []
    const selection = files => paths.length ? files.some(file => selected.has(file.path)) : files.length > 0
    const changeMessage = value => { setMessage(value); dialogMessage.current = value }
    const errors = (error || statusError) && h('p', { className: 'dtd-action-error', role: 'alert' }, error || statusError)
    return h('section', { className: 'dtd-root dtd-actions', 'aria-label': 'Git 状态与操作' },
      h('button', { type: 'button', className: 'dtd-actions-summary', title: '推送数量来自默认目标的本地跟踪记录；推送前会核对实际远端。', 'aria-expanded': expanded, onClick: () => setExpanded(!expanded) },
        state?.repository ? `⑂ ${state.branch || 'Detached HEAD'} · ${state.files.length} 个未提交 · 暂存 ${state.staged} / 未暂存 ${state.unstaged} · ${state.ahead === null ? '推送状态待核对' : `未推送 ${state.ahead}`}` : state ? 'Git · 非仓库' : 'Git · 正在读取…', expanded ? ' ⌄' : ' ⌃'),
      expanded && h('div', { className: 'dtd-actions-body' },
        !state?.repository && h('p', { className: 'dtd-muted' }, state?.message || '正在读取工作区'),
        h('div', { className: 'dtd-action-buttons' },
          h('button', { type: 'button', disabled: !enabled || !selection(unstaged), onClick: () => act('stage', { all: !paths.length, paths, version: state.version }) }, paths.length ? '暂存选中' : '全部暂存'),
          h('button', { type: 'button', disabled: !enabled || !selection(staged), onClick: () => act('unstage', { all: !paths.length, paths, version: state.version }) }, paths.length ? '取消暂存选中' : '全部取消暂存'),
          h('button', { type: 'button', disabled: !enabled || !staged.length, onClick: prepareCommit }, '提交'),
          h('button', { type: 'button', disabled: !enabled || !state?.remotes?.length || !state.head || !state.branch, onClick: openPush }, '推送')),
        Boolean(state?.files?.length) && h('div', { className: 'dtd-action-files' },
          h('label', { className: 'dtd-action-file' }, h('input', { type: 'checkbox', checked: state.files.length > 0 && selected.size === state.files.length, disabled: busy, onChange: event => setSelected(event.target.checked ? new Set(state.files.map(file => file.path)) : new Set()) }), '选择全部文件（不勾选时按钮明确操作全部）'),
          state.files.map(file => h('label', { key: file.path, className: 'dtd-action-file', title: file.original ? `${file.original} → ${file.path}` : file.path },
            h('input', { type: 'checkbox', checked: selected.has(file.path), disabled: busy, onChange: () => select(file.path) }),
            h('code', null, file.xy), h('span', { className: 'dtd-path' }, file.path), h('span', { className: 'dtd-muted' }, file.conflict ? '冲突' : file.untracked ? '未跟踪' : [file.staged && '已暂存', file.unstaged && '未暂存'].filter(Boolean).join(' / '))))),
        state?.repository && state.ahead === null && h('p', { className: 'dtd-muted' }, '默认推送目标尚无本地跟踪记录；推送窗口将核对实际目标。'),
        Boolean(state?.behind) && h('p', { className: 'dtd-muted' }, `本地跟踪记录显示落后 ${state.behind} 个提交，推送前会再次核对远端。`),
        state?.repository && !state.remotes.length && h('p', { className: 'dtd-muted' }, '没有配置 Remote，无法推送。'), !modal && errors),
      !modal && (error || statusError) && !expanded && errors,
      notice && h('p', { className: 'dtd-action-notice', role: 'status' }, notice),
      modal && h(Dialog, { title: modal.kind === 'commit' ? '提交已暂存改动' : '确认 Git 推送', busy, close: () => setModal(undefined) },
        modal.kind === 'commit' ? h(React.Fragment, null,
          h('p', null, `${modal.branch} · ${modal.files} 个已暂存文件 · +${modal.added} / −${modal.deleted}${modal.binary ? `（另有 ${modal.binary} 个二进制文件）` : ''}`),
          h('label', { className: 'dtd-message-label' }, 'Commit Message', h('textarea', { value: message, rows: 6, maxLength: 32768, autoFocus: true, disabled: busy, onChange: event => changeMessage(event.target.value), placeholder: 'feat: 简短中文说明' })),
          h('p', { className: 'dtd-muted' }, 'AI 按钮会将当前暂存 Diff 交给本会话模型，仅生成文字；你也可以直接手动填写。'),
          h('div', { className: 'dtd-dialog-buttons' }, h('button', { type: 'button', disabled: busy, onClick: async () => {
            const previous = dialogMessage.current, result = await act('generate', { ticket: modal.ticket })
            if (result && dialogMessage.current === previous) changeMessage(result.message)
          } }, busy ? '处理中…' : 'AI 生成提交信息'), h('button', { type: 'button', disabled: busy || !message.trim(), onClick: () => act('commit', { ticket: modal.ticket, message, confirmed: true }) }, '确认提交'))) : h(React.Fragment, null,
          h('label', null, '推送 Remote ', remotes.length === 1 ? h('strong', null, remote) : h('select', { value: remote, disabled: busy, onChange: event => { setRemote(event.target.value); setModal({ kind: 'push' }); setError('') } }, remotes.map(item => h('option', { key: item.name, value: item.name }, `${item.name} · ${item.urls.join(' ; ')}`)))),
          h('div', { className: 'dtd-push-urls' }, remotes.find(item => item.name === remote)?.urls.map(url => h('div', { key: url }, url))),
          !modal.ticket ? h('button', { type: 'button', disabled: busy || !remotes.some(item => item.name === remote), onClick: () => previewPush(remote) }, busy ? '正在核对…' : '检查推送目标') : h(React.Fragment, null,
            h('p', null, `目标：${modal.remote} / ${modal.branch} · ${modal.targets.length === 1 ? `待推送 ${modal.count} 个提交` : '各推送地址分别统计如下'}`),
            modal.targets.map(target => h('p', { key: target.url, className: 'dtd-muted' }, `${target.url} · ${target.count} 个提交`)),
            modal.count === 0 && h('p', null, '没有需要推送的提交'),
            h('button', { type: 'button', disabled: busy || modal.count === 0, onClick: () => act('push', { ticket: modal.ticket, confirmed: true }) }, busy ? '正在推送…' : '确认推送'))), errors))
  }
  return props => h(ActionsPanel, { ...props, key: props.sessionId })
}
