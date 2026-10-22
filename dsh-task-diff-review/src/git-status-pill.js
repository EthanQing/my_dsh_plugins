import { createIcons } from './icons.js'

// Visible footer content is limited to branch names, SVG indicators and counts.
export function createGitStatusPill(React) {
  const h = React.createElement
  const { IconBranch, IconChevron, IconCheck, IconEdit, IconStaged, IconUpload, IconWarning, IconUnavailable, IconCommit, IconLoading } = createIcons(React)
  return function GitStatusPill({ state, error = '', busy = false, expanded = false, onClick, disabled = false }) {
    const files = state?.files || []
    const staged = files.filter(file => file.staged).length
    const unstaged = files.filter(file => file.unstaged || file.untracked).length
    const badges = []
    const badge = (kind, Icon, label, count) => {
      badges.push({ kind, label, Icon, element: h('span', { key: kind, className: `dtd-pill-indicator dtd-pill-${kind}`, role: 'img', title: label, 'aria-label': label }, h(Icon, { size: 13 }), count === undefined ? null : h('span', { 'aria-hidden': true }, count)) })
    }
    if (error) badge('error', IconWarning, `Git 状态读取或操作失败：${error}`)
    else if (!state || busy || state.busy) badge('loading', IconLoading, !state ? '正在读取 Git 状态' : 'Git 操作进行中')
    else if (!state.repository) badge('unavailable', IconUnavailable, state.message || '当前目录未关联 Git 仓库')
    else if (files.some(file => file.conflict)) badge('conflict', IconWarning, `未解决冲突 ${files.filter(file => file.conflict).length} 个文件`, files.filter(file => file.conflict).length)
    else if (!files.length) badge('clean', IconCheck, '工作区干净')
    else {
      if (staged) badge('staged', IconStaged, `已暂存 ${staged} 个文件`, staged)
      if (unstaged) badge('changes', IconEdit, `未暂存 ${unstaged} 个文件`, unstaged)
      if (!staged && !unstaged) badge('changes', IconEdit, `未提交 ${files.length} 个文件`, files.length)
    }
    if (state?.repository && !state.branch) badge('detached', IconCommit, '游离 HEAD')
    if (state?.repository && state.ahead > 0) badge('ahead', IconUpload, `待推送 ${state.ahead} 个提交`, state.ahead)
    const compact = badges[0].kind === 'clean' && badges.length > 1 ? badges[badges.length - 1] : badges[0]
    const label = [state?.branch, ...badges.map(item => item.label), '点击打开 Git 操作面板'].filter(Boolean).join('；')
    return h('button', { type: 'button', className: `dtd-status-pill ${expanded ? 'dtd-status-pill-active' : ''}`, title: label, 'aria-label': label, 'aria-expanded': expanded, disabled, onClick },
      h('span', { className: 'dtd-pill-leading', 'aria-hidden': true }, h(IconBranch, { size: 14 }), h('span', { className: `dtd-pill-compact-state dtd-pill-${compact.kind}` }, h(compact.Icon, { size: 14 }))),
      state?.branch && h('span', { className: 'dtd-pill-branch' }, state.branch),
      ...badges.map(item => item.element),
      h(IconChevron, { size: 12, className: `dtd-pill-chevron ${expanded ? 'is-expanded' : ''}` }))
  }
}
