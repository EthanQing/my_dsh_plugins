import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { apply } from '../lib/index.js'

async function request(handler, method, headers, payload) {
  const req = new EventEmitter()
  req.method = method
  req.headers = headers
  let resolve
  const finished = new Promise(done => { resolve = done })
  const res = {
    writeHead(status) { this.status = status }, setHeader() {},
    end(body) { resolve({ status: this.status, data: JSON.parse(body) }) },
  }
  const pending = handler(req, res)
  if (payload !== undefined) {
    req.emit('data', Buffer.from(JSON.stringify(payload)))
    req.emit('end')
  }
  await pending
  return finished
}

test('Host rejects unauthorized, invalid and running targets without archiving', async () => {
  const testRoot = fileURLToPath(new URL('./', import.meta.url))
  const temp = await mkdtemp(path.join(testRoot, '.tmp-host-'))
  const oldHome = process.env.DSH_HOME
  process.env.DSH_HOME = temp
  const routes = new Map(), effects = []
  try {
    await mkdir(path.join(temp, 'sessions'))
    await mkdir(path.join(temp, 'storages', 'session_projcache', 'sessions'), { recursive: true })
    apply({
      webServer: { tapIndex: () => () => {}, register: entry => { routes.set(entry.path, entry.handler); return () => {} } },
      workspaceRegistry: { archivedSessionIds: [], archiveSession: () => assert.fail('must not archive') },
      get: name => name === 'agents' ? { get: () => ({ status: 'running' }) } : undefined,
      effect: fn => { const dispose = fn(); if (dispose) effects.push(dispose) },
    })
    const del = routes.get('/dsh-subagent-sidebar-default')
    const denied = await request(del, 'POST', {}, { sessionIds: ['child'] })
    assert.equal(denied.status, 403)
    const auth = await request(routes.get('/dsh-subagent-sidebar-default/token'), 'GET', {
      'sec-fetch-site': 'same-origin', 'x-dsh-ssd-client': '1',
    })
    const headers = { 'x-dsh-subagent-sidebar-default-token': auth.data.token }
    const invalid = await request(del, 'POST', headers, { sessionIds: ['../parent'] })
    assert.equal(invalid.data.results[0].code, 'invalid-id')
    const running = await request(del, 'POST', headers, { sessionIds: ['session-child'] })
    assert.equal(running.data.results[0].code, 'running')
  } finally {
    for (const dispose of effects.reverse()) dispose()
    if (oldHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = oldHome
    // Resolve and verify the owned temporary path before recursive cleanup.
    const relative = path.relative(path.resolve(testRoot), path.resolve(temp))
    assert.ok(relative.startsWith('.tmp-host-') && !relative.includes(path.sep))
    await rm(temp, { recursive: true, force: true })
  }
})
