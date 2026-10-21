import assert from 'node:assert/strict'
import test from 'node:test'
import { GitActions } from '../src/git-actions.js'

function fixture() {
  const actions = new GitActions({ repository: async () => '/repo' })
  const remote = { name: 'origin', branch: 'main', urls: ['https://example.invalid/repo'] }
  const state = { head: 'a'.repeat(40), branch: 'main' }
  actions.identity = async () => ({ ...state })
  actions.remotes = async () => ({ remotes: [remote] })
  actions.remoteTip = async () => 'b'.repeat(40)
  const calls = []
  actions.run = async (...args) => { calls.push(args); return Buffer.alloc(0) }
  const ticket = actions.issue('push', 'session', { root: '/repo', ...state, remote: structuredClone(remote), targets: [{ url: remote.urls[0], tip: 'b'.repeat(40), count: 1 }] })
  const body = { ticket, remote: 'origin', branch: 'main', head: state.head, confirmed: true }
  return { actions, state, remote, body, calls }
}

for (const [field, value] of [['remote', 'other'], ['branch', 'other'], ['head', 'c'.repeat(40)], ['confirmed', false]]) {
  test(`rejects mismatched push ${field}`, async () => {
    const f = fixture()
    await assert.rejects(f.actions.push('/repo', 'session', { ...f.body, [field]: value }), /确认/)
    assert.equal(f.calls.length, 0)
  })
}
for (const change of ['branch', 'head', 'remote', 'tip', 'late-branch']) {
  test(`rejects changed ${change} before pushing`, async () => {
    const f = fixture()
    if (change === 'branch') f.state.branch = 'other'
    if (change === 'head') f.state.head = 'c'.repeat(40)
    if (change === 'remote') f.remote.urls.push('https://example.invalid/other')
    if (change === 'tip') f.actions.remoteTip = async () => 'c'.repeat(40)
    if (change === 'late-branch') f.actions.remoteTip = async () => { f.state.branch = 'other'; return 'b'.repeat(40) }
    await assert.rejects(f.actions.push('/repo', 'session', f.body), /变化/)
    assert.equal(f.calls.length, 0)
  })
}
test('push uses confirmed immutable source and consumes ticket', async () => {
  const f = fixture()
  await f.actions.push('/repo', 'session', f.body)
  assert.equal(f.calls.length, 1)
  assert.deepEqual(f.calls[0][1].slice(-3), ['--', 'origin', `${f.body.head}:refs/heads/main`])
  await assert.rejects(f.actions.push('/repo', 'session', f.body), /过期/)
})
