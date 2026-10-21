import assert from 'node:assert/strict'
import test from 'node:test'
import { createActionsPanel, pushPreviewIssue } from '../src/actions-view.js'

const head = 'a'.repeat(40)
const destination = { name: 'origin', branch: 'main', urls: ['https://example.invalid/repo'] }
const preview = { kind: 'push', ticket: 'ticket', remote: 'origin', branch: 'main', localBranch: 'main', head, count: 1, targets: [{ url: destination.urls[0], count: 1 }] }
const state = { repository: true, head, branch: 'main', remotes: [destination], files: [], defaultRemote: 'origin' }

function panel(modal = preview, status = state) {
  const slots = [status, '', '', '', true, new Set(), false, modal, '', 'origin', 0]
  const refs = []
  let at = 0, refAt = 0
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children }),
    Fragment: 'fragment',
    useState: initial => { const index = at++; if (!(index in slots)) slots[index] = initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }] },
    useRef: initial => refs[refAt++] ||= { current: initial },
    useEffect: () => {}, useCallback: fn => fn,
  }
  const wrapper = createActionsPanel(React)
  const component = wrapper({ sessionId: 'session' })
  return { slots, render: () => { at = 0; refAt = 0; return component.type(component.props) } }
}
function nodes(node) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(nodes)
  if (node.type?.name === 'Dialog') return nodes(node.type({ ...node.props, children: node.children }))
  return [node, ...node.children.flatMap(nodes)]
}
const button = (tree, label) => nodes(tree).find(node => node.type === 'button' && node.children.includes(label))

test('valid preview with unchanged HEAD enables confirmation, including ordinary status refresh', () => {
  assert.equal(pushPreviewIssue(preview, 'origin', state), '')
  const p = panel()
  assert.equal(button(p.render(), '确认推送').props.disabled, false)
  p.slots[0] = { ...state, busy: true, version: 'index-or-working-tree-changed', files: [{ path: 'new.txt', xy: '??', untracked: true, unstaged: true }] }
  assert.equal(button(p.render(), '确认推送').props.disabled, false)
})

test('missing Host HEAD is explained, never inferred from current state, and retry remains enabled', () => {
  const p = panel({ ...preview, head: undefined })
  const tree = p.render()
  assert.equal(button(tree, '确认推送').props.disabled, true)
  assert.equal(button(tree, '重新检查').props.disabled, false)
  assert.match(pushPreviewIssue(p.slots[7], 'origin', state), /缺少 head.*重启 DSH/)
})

for (const [label, changed, remote, error, expected] of [
  ['HEAD', { ...state, head: 'b'.repeat(40) }, 'origin', '', /HEAD 已变化/],
  ['branch', { ...state, branch: 'other' }, 'origin', '', /本地分支/],
  ['remote', state, 'other', '', /所选 Remote/],
  ['destination', { ...state, remotes: [{ ...destination, branch: 'other' }] }, 'origin', '', /目标分支/],
  ['read failure', state, 'origin', 'Git failed', /读取失败/],
]) test(`${label} mismatch explains why preview must be rechecked`, () => assert.match(pushPreviewIssue(preview, remote, changed, error), expected))

test('preparePush response retains HEAD and refreshes status before enabling push', async () => {
  const original = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    return { ok: true, json: async () => url.includes('git-status') ? state : preview }
  }
  try {
    const p = panel({ kind: 'push' }, { ...state, head: 'b'.repeat(40) })
    await nodes(p.render()).find(node => node.props.title === '推送至远端').props.onClick()
    assert.equal(p.slots[7].head, head)
    assert.equal(p.slots[7].checkingStatus, false)
    assert.equal(button(p.render(), '确认推送').props.disabled, false)
    assert.equal(calls.length, 2)
    assert.equal(JSON.parse(calls[0].options.body).action, 'preparePush')
    assert.match(calls[1].url, /git-status/)
  } finally { globalThis.fetch = original }
})

test('confirmation sends exactly the displayed remote, branch and HEAD', async () => {
  const original = globalThis.fetch
  let body
  globalThis.fetch = async (_url, options) => {
    body = JSON.parse(options.body)
    return { ok: true, json: async () => ({ message: 'mock push result' }) }
  }
  try {
    await button(panel().render(), '确认推送').props.onClick()
    assert.deepEqual(body, { sessionId: 'session', action: 'push', ticket: 'ticket', remote: 'origin', branch: 'main', head, confirmed: true })
  } finally { globalThis.fetch = original }
})

test('all confirmation dialogs use one footer with cancel and one primary action', () => {
  for (const modal of [preview, { kind: 'commit', message: 'long message' }, { kind: 'stageCommit', files: 18 }]) {
    const tree = panel(modal).render()
    const footer = nodes(tree).find(node => node.props.className === 'dtd-dialog-footer')
    assert.ok(footer)
    assert.ok(button(footer, '取消'))
    assert.equal(nodes(footer).filter(node => node.props.className === 'dtd-btn-primary').length, 1)
    assert.ok(nodes(tree).find(node => node.props['aria-label'] === '关闭窗口'))
  }
  assert.equal(button(panel().render(), '重新检查'), undefined)
})

test('remote change invalidates preview immediately and automatically checks new destination', async () => {
  const original = globalThis.fetch
  let resolvePreview
  const other = { ...destination, name: 'backup' }
  const status = { ...state, remotes: [destination, other] }
  const calls = []
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options })
    if (url.includes('git-status')) return { ok: true, json: async () => status }
    return new Promise(resolve => { resolvePreview = resolve })
  }
  try {
    const p = panel(preview, status)
    const select = nodes(p.render()).find(node => node.type === 'select' && node.props.value === 'origin' && !node.props.className)
    const pending = select.props.onChange({ target: { value: 'backup' } })
    assert.equal(p.slots[7].ticket, undefined)
    assert.equal(button(p.render(), '确认推送').props.disabled, true)
    assert.equal(nodes(p.render()).filter(node => node.props.className === 'dtd-dialog-recheck').length, 0)
    resolvePreview({ ok: true, json: async () => ({ ...preview, ticket: 'new-ticket', remote: 'backup' }) })
    await pending
    assert.equal(JSON.parse(calls[0].options.body).remote, 'backup')
    assert.equal(p.slots[7].ticket, 'new-ticket')
    assert.equal(button(p.render(), '确认推送').props.disabled, false)
  } finally { globalThis.fetch = original }
})

test('failed push invalidates ticket and exposes only a lightweight recheck', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: '远端分支已变化，请重新预览' }) })
  try {
    const p = panel()
    const confirm = button(p.render(), '确认推送')
    const pending = confirm.props.onClick()
    assert.equal(button(p.render(), '正在推送…').props.disabled, true)
    await confirm.props.onClick() // synchronous guard prevents a second action
    await pending
    assert.equal(p.slots[7].ticket, undefined)
    assert.equal(button(p.render(), '确认推送').props.disabled, true)
    assert.equal(button(p.render(), '重新检查').props.className, 'dtd-dialog-recheck')
    assert.match(p.slots[1], /远端分支已变化/)
  } finally { globalThis.fetch = original }
})

test('zero commits and malformed preview never enable confirmation', () => {
  assert.match(pushPreviewIssue({ ...preview, count: 0 }, 'origin', state), /没有需要/)
  assert.match(pushPreviewIssue({ ...preview, targets: undefined }, 'origin', state), /无效/)
  assert.equal(button(panel({ ...preview, targets: undefined }).render(), '确认推送').props.disabled, true)
})
