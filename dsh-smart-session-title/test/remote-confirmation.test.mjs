import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry'
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway'
import { Peer } from '@deepseek-ai/dsh-client-connection'
import { registerRemote, requireOwnerCall, USER_CONFIRMATION_REQUIRED } from '../src/remote.js'

/**
 * Compose a real Typert registry, a real Gateway, and this plugin's Remote
 * service, with the operation table replaced by a recorder.
 * @returns the context, recorder, peers, and teardown.
 */
async function createGateway() {
  const ctx = new Context()
  new TypertRegistry(ctx)
  // Access control is deliberately permissive so the plugin's own guard is
  // the only thing that can refuse a non-owner caller.
  ctx.provide('remoteAccess', { decide: () => ({ kind: 'allow' }) })
  new TypertGatewayService(ctx, { websocketHeartbeatIntervalMs: 30_000, streamInboxBytes: 65_536 })
  const calls = []
  const dispose = registerRemote(ctx, {
    preview: async (peer, workspaceId) => {
      calls.push({ method: 'preview', peer, workspaceId })
      return { previewId: 'p1', expiresAt: Date.now() + 1000, rows: [] }
    },
    confirm: async (peer, previewId, sessionIds) => {
      calls.push({ method: 'confirm', peer, previewId, sessionIds })
      return { previewId, rows: sessionIds.map(sessionId => ({ sessionId, status: 'renamed', title: '新标题内容' })) }
    },
    cancel: (peer, previewId) => {
      calls.push({ method: 'cancel', peer, previewId })
      return { previewId, cancelled: true }
    },
    rename: async sessionId => {
      calls.push({ method: 'rename', sessionId })
      return { sessionId, status: 'renamed', title: '单会话标题' }
    },
  })
  const owner = new Peer(ctx, { principal: { kind: 'owner' }, interactions: 'answer' })
  const silent = new Peer(ctx, { principal: { kind: 'owner' }, interactions: 'none' })
  const agent = new Peer(ctx, { principal: { kind: 'agent', id: 'agent-test' }, interactions: 'answer' })
  const invoke = (peer, method, request) => ctx.typertGateway.invoke({
    namespace: 'smartSessionTitle',
    method,
    args: { request },
    peer,
    signal: new AbortController().signal,
  })
  return {
    ctx,
    calls,
    owner,
    silent,
    agent,
    invoke,
    async dispose() {
      await dispose()
      await owner.dispose()
      await silent.dispose()
      await agent.dispose()
      await ctx.fiber.dispose()
    },
  }
}

const INPUTS = {
  previewBatch: { workspaceId: 'w1' },
  confirmBatch: { previewId: 'p1', sessionIds: ['s1'] },
  cancelBatch: { previewId: 'p1' },
  renameSession: { sessionId: 's1' },
}

test('the contribution registers against the real Typert registry', async () => {
  const gateway = await createGateway()
  try {
    const endpoints = gateway.ctx.typert.local.list().map(descriptor => `${descriptor.namespace}/${descriptor.method}`)
    for (const method of Object.keys(INPUTS)) {
      assert.ok(endpoints.includes(`smartSessionTitle/${method}`), `${method} must be registered`)
    }
  } finally {
    await gateway.dispose()
  }
})

test('a direct in-process call without a Remote context is refused', async () => {
  const gateway = await createGateway()
  try {
    for (const method of Object.keys(INPUTS)) {
      await assert.rejects(
        async () => gateway.ctx.smartSessionTitle[method](INPUTS[method], new AbortController().signal),
        error => error.code === USER_CONFIRMATION_REQUIRED,
      )
    }
    assert.equal(gateway.calls.length, 0)
  } finally {
    await gateway.dispose()
  }
})

test('an owner Peer that cannot answer prompts is refused', async () => {
  const gateway = await createGateway()
  try {
    for (const method of Object.keys(INPUTS)) {
      await assert.rejects(
        gateway.invoke(gateway.silent, method, INPUTS[method]),
        error => error.code === USER_CONFIRMATION_REQUIRED,
      )
    }
    assert.equal(gateway.calls.length, 0)
  } finally {
    await gateway.dispose()
  }
})

test('a non-owner principal is refused even when it can answer', async () => {
  const gateway = await createGateway()
  try {
    for (const method of Object.keys(INPUTS)) {
      await assert.rejects(
        gateway.invoke(gateway.agent, method, INPUTS[method]),
        error => error.code === USER_CONFIRMATION_REQUIRED,
      )
    }
    assert.equal(gateway.calls.length, 0)
  } finally {
    await gateway.dispose()
  }
})

test('an owner with answer interactions reaches every method', async () => {
  const gateway = await createGateway()
  try {
    const preview = await gateway.invoke(gateway.owner, 'previewBatch', INPUTS.previewBatch)
    assert.equal(preview.previewId, 'p1')
    const confirmed = await gateway.invoke(gateway.owner, 'confirmBatch', INPUTS.confirmBatch)
    assert.deepEqual(confirmed.rows.map(row => row.sessionId), ['s1'])
    const cancelled = await gateway.invoke(gateway.owner, 'cancelBatch', INPUTS.cancelBatch)
    assert.equal(cancelled.cancelled, true)
    const renamed = await gateway.invoke(gateway.owner, 'renameSession', INPUTS.renameSession)
    assert.equal(renamed.status, 'renamed')
    assert.deepEqual(gateway.calls.map(call => call.method), ['preview', 'confirm', 'cancel', 'rename'])
    // Every confirmation-bearing operation receives the exact calling Peer;
    // the single-session rename is not peer-scoped and receives only its id.
    assert.ok(
      gateway.calls.filter(call => call.method !== 'rename').every(call => call.peer === gateway.owner),
      'every batch operation receives the calling peer',
    )
    assert.equal(gateway.calls.at(-1).sessionId, 's1')
  } finally {
    await gateway.dispose()
  }
})

test('the confirm wire accepts only previewId and sessionIds', async () => {
  const gateway = await createGateway()
  try {
    for (const forged of [
      { ...INPUTS.confirmBatch, confirmed: true },
      { ...INPUTS.confirmBatch, title: '伪造标题' },
      { ...INPUTS.confirmBatch, peer: 'owner' },
      { previewId: 'p1' },
      { sessionIds: ['s1'] },
    ]) {
      await assert.rejects(gateway.invoke(gateway.owner, 'confirmBatch', forged))
    }
    assert.equal(gateway.calls.length, 0, 'no forged input reaches the operations')
  } finally {
    await gateway.dispose()
  }
})

test('a finished call does not leave a reusable receiver identity behind', async () => {
  const gateway = await createGateway()
  try {
    await gateway.invoke(gateway.owner, 'confirmBatch', INPUTS.confirmBatch)
    await assert.rejects(
      async () => gateway.ctx.smartSessionTitle.confirmBatch(INPUTS.confirmBatch, new AbortController().signal),
      error => error.code === USER_CONFIRMATION_REQUIRED,
    )
  } finally {
    await gateway.dispose()
  }
})

test('requireOwnerCall checks namespace, method, and peer shape', () => {
  const peer = { principal: { kind: 'owner' }, interactions: 'answer', signal: new AbortController().signal }
  const base = { service: 'smartSessionTitle', request: { namespace: 'smartSessionTitle', method: 'confirmBatch' }, peer, signal: new AbortController().signal }
  assert.equal(requireOwnerCall(base, 'confirmBatch'), peer)
  for (const broken of [
    undefined,
    null,
    { ...base, service: 'other' },
    { ...base, request: { namespace: 'other', method: 'confirmBatch' } },
    { ...base, request: { namespace: 'smartSessionTitle', method: 'previewBatch' } },
    { ...base, peer: undefined },
    { ...base, peer: { principal: { kind: 'agent' }, interactions: 'answer' } },
    { ...base, peer: { principal: { kind: 'owner' }, interactions: 'none' } },
    { ...base, peer: { principal: { kind: 'owner' }, interactions: 'answer', signal: AbortSignal.abort() } },
  ]) {
    assert.throws(() => requireOwnerCall(broken, 'confirmBatch'), error => error.code === USER_CONFIRMATION_REQUIRED)
  }
})
