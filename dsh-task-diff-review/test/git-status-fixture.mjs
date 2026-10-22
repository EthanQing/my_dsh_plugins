import { createGitStatusPill } from '../src/git-status-pill.js'
export const base = { repository: true, branch: 'main', files: [], ahead: 0 }
export const scenarios = [
  ['干净', { state: base }, ['clean']],
  ['未暂存', { state: { ...base, files: [{ unstaged: true }] } }, ['changes']],
  ['已暂存', { state: { ...base, files: [{ staged: true }] } }, ['staged']],
  ['混合改动', { state: { ...base, files: [{ staged: true, unstaged: true }] } }, ['staged', 'changes']],
  ['待推送', { state: { ...base, ahead: 3 } }, ['clean', 'ahead']],
  ['读取中', {}, ['loading']],
  ['操作中', { state: base, busy: true }, ['loading']],
  ['读取失败', { error: '无法读取仓库' }, ['error']],
  ['已有状态后失败', { state: base, error: '状态已过期' }, ['error']],
  ['非仓库', { state: { repository: false } }, ['unavailable']],
  ['游离HEAD', { state: { ...base, branch: undefined } }, ['clean', 'detached']],
  ['冲突', { state: { ...base, files: [{ conflict: true, staged: true, unstaged: true }] } }, ['conflict']],
]
const React = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) }
const Pill = createGitStatusPill(React)
export function renderPill(props) {
  const expand = node => {
    if (!node || typeof node !== 'object') return node
    if (Array.isArray(node)) return node.map(expand)
    if (typeof node.type === 'function') return expand(node.type({ ...node.props, children: node.children }))
    return { ...node, children: node.children.map(expand) }
  }
  return expand(Pill(props))
}
export function nodes(node) { return !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(nodes) : [node, ...node.children.flatMap(nodes)] }
export const text = node => node == null || typeof node === 'boolean' ? '' : Array.isArray(node) ? node.map(text).join('') : typeof node === 'object' ? text(node.children) : String(node)
const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
export function html(node) {
  if (node == null || typeof node === 'boolean') return ''
  if (Array.isArray(node)) return node.map(html).join('')
  if (typeof node !== 'object') return escape(node)
  const names = { className: 'class', strokeWidth: 'stroke-width', strokeLinecap: 'stroke-linecap', strokeLinejoin: 'stroke-linejoin' }
  const attrs = Object.entries(node.props).filter(([key, value]) => !key.startsWith('on') && !['key', 'children'].includes(key) && value != null && (value !== false || key.startsWith('aria-') || key === 'focusable')).map(([key, value]) => ` ${names[key] || key}="${escape(value)}"`).join('')
  return `<${node.type}${attrs}>${html(node.children)}</${node.type}>`
}
