import test from 'node:test'
import assert from 'node:assert/strict'
import { deleteSidebarSubagents } from '../lib/deletion.js'

test('partial deletion keeps failures and deduplicates the requested IDs', async t => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push([url, options])
    return { ok: true, json: async () => url.endsWith('/token') ? { token: 'test-token' }
      : { ok: false, results: [{ sessionId: 'a', ok: true }, { sessionId: 'b', ok: false, code: 'active' }] } }
  })
  const result = await deleteSidebarSubagents(['a', 'b', 'a'])
  assert.deepEqual(result, { deleted: ['a'], failed: [{ sessionId: 'b', code: 'active' }] })
  assert.deepEqual(JSON.parse(requests[1][1].body), { sessionIds: ['a', 'b'] })
  assert.equal(requests[1][1].headers['x-dsh-subagent-sidebar-default-token'], 'test-token')
})

test('an interrupted request remains unconfirmed and is never automatically retried', async t => {
  let posts = 0
  t.mock.method(globalThis, 'fetch', async url => {
    if (url.endsWith('/token')) return { ok: true, json: async () => ({ token: 'test-token' }) }
    posts++
    throw new Error('connection dropped after possible commit')
  })
  assert.deepEqual(await deleteSidebarSubagents(['a']), {
    deleted: [], failed: [{ sessionId: 'a', code: 'unconfirmed' }],
  })
  assert.equal(posts, 1)
})

test('missing security token prevents any deletion request', async t => {
  let requests = 0
  t.mock.method(globalThis, 'fetch', async () => {
    requests++
    return { ok: false, json: async () => ({ ok: false }) }
  })
  await assert.rejects(() => deleteSidebarSubagents(['a']), /token-missing/)
  assert.equal(requests, 1)
})
