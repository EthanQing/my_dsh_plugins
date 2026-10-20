import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry'
import { descriptors, PACKAGE, NAMESPACE } from '../src/remote.js'

/**
 * Validate the descriptor set exactly as the Client mount does: strict input
 * codecs, a direct receiver, and one unique method per namespace.
 * @param list - the descriptors to validate.
 * @returns the endpoints in order.
 */
function validateLikeClientMount(list) {
  const seen = new Set()
  const endpoints = []
  for (const descriptor of list) {
    const endpoint = `${descriptor.namespace}/${descriptor.method}`
    assert.ok(!seen.has(endpoint), `duplicate endpoint ${endpoint}`)
    seen.add(endpoint)
    assert.equal(descriptor.invocation.kind, 'direct', `${endpoint} must use a direct receiver`)
    for (const parameter of descriptor.parameters) {
      assert.equal(parameter.codec.mode, 'strict', `${endpoint} parameter must be strict`)
      assert.equal(typeof parameter.codec.typeSymbol, 'string')
      assert.equal(typeof parameter.codec.create, 'function')
      // A strict codec must be constructible, not necessarily valid for `{}`.
      assert.throws(() => parameter.codec.create().parse({}))
    }
    assert.equal(descriptor.result.mode, 'strict', `${endpoint} result must be strict`)
    assert.equal(typeof descriptor.result.create, 'function')
    endpoints.push(endpoint)
  }
  return endpoints
}

test('the Client contribution validates the same descriptor set the Host registers', () => {
  const list = descriptors()
  assert.equal(list.length, 4)
  assert.deepEqual(validateLikeClientMount(list), [
    `${NAMESPACE}/previewBatch`,
    `${NAMESPACE}/confirmBatch`,
    `${NAMESPACE}/cancelBatch`,
    `${NAMESPACE}/renameSession`,
  ])
  for (const descriptor of list) {
    assert.equal(descriptor.id, `${PACKAGE}#${descriptor.namespace}/${descriptor.method}`)
    assert.equal(descriptor.service, NAMESPACE)
    assert.deepEqual(descriptor.cancellation, { parameter: 'signal' })
    // Every strict symbol is owned by this package, so a Client mount of the
    // same names cannot silently bind another contribution's schemas.
    for (const codec of [descriptor.result, ...descriptor.parameters.map(parameter => parameter.codec)]) {
      assert.ok(codec.typeSymbol.startsWith(`${PACKAGE}#`), `${codec.typeSymbol} must be package-prefixed`)
    }
  }
})

test('the descriptor set registers as a Client Remote contribution', async () => {
  const ctx = new Context()
  new TypertRegistry(ctx)
  const dispose = ctx.typert.remotes.register({ package: PACKAGE, descriptors: descriptors() })
  try {
    const registered = ctx.typert.remotes
      .list()
      .map(descriptor => `${descriptor.namespace}/${descriptor.method}`)
      .sort()
    assert.deepEqual(registered, [
      `${NAMESPACE}/cancelBatch`,
      `${NAMESPACE}/confirmBatch`,
      `${NAMESPACE}/previewBatch`,
      `${NAMESPACE}/renameSession`,
    ])
  } finally {
    await dispose()
    await ctx.fiber.dispose()
  }
})

test('confirm input rejects anything beyond previewId and sessionIds', () => {
  const list = descriptors()
  const confirm = list.find(descriptor => descriptor.method === 'confirmBatch')
  const schema = confirm.parameters[0].codec.create()
  assert.deepEqual(schema.parse({ previewId: 'p', sessionIds: ['s'] }), { previewId: 'p', sessionIds: ['s'] })
  for (const forged of [
    { previewId: 'p', sessionIds: ['s'], confirmed: true },
    { previewId: 'p', sessionIds: ['s'], title: 'x' },
    { previewId: 'p' },
    { sessionIds: ['s'] },
    { previewId: 'p', sessionIds: [] },
  ]) {
    assert.throws(() => schema.parse(forged))
  }
})

test('the preview result schema matches the Host result shape', () => {
  const list = descriptors()
  const preview = list.find(descriptor => descriptor.method === 'previewBatch')
  const result = preview.result.create()
  const parsed = result.parse({
    previewId: 'p',
    expiresAt: 1,
    rows: [{ sessionId: 's', oldTitle: '', title: '新标题内容', status: 'ready' }],
  })
  assert.equal(parsed.rows.length, 1)
  assert.throws(() => result.parse({ previewId: 'p', expiresAt: 1, rows: [{ sessionId: 's' }] }))
})
