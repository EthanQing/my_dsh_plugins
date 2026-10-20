import test from 'node:test'
import assert from 'node:assert/strict'
import { describeTurn, needsAttention, phaseOf, summary } from '../src/model.js'
import { hiddenStyle } from '../src/styles.js'

const turn = (kind = 'completed') => ({ turn: 1, status: kind === 'running' ? 'open' : 'closed', end: { data: { reason: { kind } } } })
const node = (kind, key, data, owner = turn()) => ({ kind, key, data, location: { kind: 'turn', turn: owner } })
const tool = (callId, name, args = {}, extra = {}) => ({ callId, name, kind: 'tool-result', args: { value: key => args[key] }, isError: false, subCalls: [], ...extra })

test('successful unique file counts come from paths, not command names or guessed effects', () => {
  const data = [
    node('tool-call', 'read1', { root: tool('r1', 'read', { file_path: 'src/a.js' }) }),
    node('tool-call', 'read2', { root: tool('r2', 'read', { file_path: 'src/a.js' }) }),
    node('tool-call', 'edit1', { root: tool('e1', 'edit', { path: 'src/b.js' }) }),
    node('tool-call', 'error', { root: tool('e2', 'write', { path: 'src/c.js' }, { isError: true }) }),
    node('tool-call', 'shell', { root: tool('s1', 'exec_command', { cmd: 'cat 100files; write 500files' }) }),
  ]
  const result = describeTurn(data, turn())
  assert.equal(result.reads, 1)
  assert.equal(result.edits, 1)
  assert.equal(result.calls, 5)
  assert.equal(result.errors, 1)
  assert.equal(result.hidden.some(row => row.key === 'error'), false)
})

test('patch paths and recursive tool calls are deduplicated; source records remain unchanged', () => {
  const child = tool('child', 'apply_patch', { patch: '*** Begin Patch\n*** Update File: a.js\n*** Add File: b.js\n*** Update File: a.js\n*** End Patch' })
  const parent = tool('parent', 'run_code', {}, { subCalls: [child, child] })
  const data = [node('tool-call', 'parent', { root: parent })]
  const before = parent.subCalls
  const result = describeTurn(data, turn())
  assert.equal(result.edits, 2)
  assert.equal(result.calls, 2)
  assert.equal(parent.subCalls, before)
})

test('progress prose, final answers, unknown nodes, commands, errors and other turns are never hidden', () => {
  const data = [
    node('assistant-step', 'progress', { blocks: [{ kind: 'text', text: 'I am checking the project.' }] }),
    node('assistant-step', 'mixed', { blocks: [{ kind: 'reasoning', text: 'private' }, { kind: 'text', text: 'final answer' }] }),
    node('turn-error', 'failure', { message: 'error' }),
    node('tool-custom', 'unknown', {}),
    node('command', 'interactive-command', {}),
    node('system-prompt', 'system', {}),
    node('tool-call', 'other', { root: tool('o', 'read') }, { ...turn(), turn: 2 }),
  ]
  const result = describeTurn(data, turn())
  assert.deepEqual(result.hidden, [{ key: 'mixed', part: 'reasoning' }, { key: 'system' }])
  const css = hiddenStyle('scope', 1, result.hidden)
  assert.match(css, /data-chat-group-part="reasoning"/)
  assert.doesNotMatch(css, /"progress"|"failure"|"other"|"unknown"|interactive-command/)
  assert.match(css, /:not\(:focus-within\)/)
})

test('waiting, escalated, unknown running tools and their parent rows stay actionable', () => {
  for (const current of [
    tool('q', 'request_user_input', {}, { kind: undefined }),
    tool('p', 'exec_command', { sandbox_permissions: 'require_escalated' }, { kind: undefined }),
    tool('u', 'unknown_custom_tool', {}, { kind: undefined }),
    tool('p', 'run_code', {}, { subCalls: [tool('q', 'ask_user_question', {}, { kind: undefined })] }),
  ]) {
    assert.ok(needsAttention(current))
    const model = describeTurn([node('tool-call', 'active', { root: current }, turn('running'))], turn('running'))
    assert.equal(model.hidden.length, 0)
  }
})

test('live summary selects the current build; stopped and failure states are explicit', () => {
  const tr = (key, args = {}) => `${key}${args.n ?? args.detail ?? ''}`
  const active = tool('b', 'exec_command', { cmd: 'npm run build' }, { kind: undefined, time: 40 })
  const model = describeTurn([node('tool-call', 'b', { root: active }, turn('running'))], turn('running'))
  assert.match(summary(model, tr), /^doing.build/)
  assert.equal(phaseOf(turn('aborted')), 'stopped')
  assert.equal(phaseOf(turn('interrupted')), 'stopped')
  assert.equal(phaseOf(turn('error')), 'failed')
  assert.equal(phaseOf(turn('max-tokens')), 'incomplete')
  assert.match(summary(describeTurn([node('tool-call', 'b', { root: active })], turn('aborted')), tr), /^stopped.*last/)
})

test('selectors remain session/turn-scoped and escape control characters in node IDs', () => {
  const css = hiddenStyle(':r1:', 7, [{ key: 'x"\n}body{display:none}/*' }])
  assert.match(css, /^\[data-slot="conversation.chat.flow"\]:has\(/)
  assert.match(css, /data-chat-turn="7"/)
  assert.equal(css.includes('\n'), false)
  assert.equal(hiddenStyle('x', 1, []), '')
})
