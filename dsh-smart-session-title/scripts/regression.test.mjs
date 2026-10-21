import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { buildProviderInput } from '../lib/title.js'
import { Semaphore, delay, TitleCancelledError } from '../lib/limits.js'

const parse = result => JSON.parse(result.input.slice(result.input.indexOf('\n') + 1))

test('final input budgets include escaped JSON, Chinese, emoji, title and framing', () => {
  const text = '中文😀𠮷\\"\n\t\u0000'.repeat(4000)
  for (const budgetBytes of [256, 512, 1024, 4096, 8192]) {
    const result = buildProviderInput({ messages: [{ seq: 1, text: `最初目标${text}` }, { seq: 2, text }, { seq: 3, text: `最近需求${text}` }], assistantText: `完成摘要${text}`, currentTitle: text, budgetBytes })
    assert.ok(Buffer.byteLength(result.input) <= budgetBytes)
    const payload = parse(result)
    assert.deepEqual(result.messageSeqs, [1, 3])
    assert.ok(payload.goal[0].text.startsWith('最初目标'))
    assert.ok(payload.goal[1].text.startsWith('最近需求'))
    assert.ok(payload.assistant.startsWith('完成摘要'))
    for (const value of [...payload.goal.map(item => item.text), payload.assistant, payload.currentTitle]) assert.equal(value.isWellFormed(), true)
  }
})

test('small budgets fail explicitly and short content remains intact', () => {
  assert.throws(() => buildProviderInput({ messages: [{ seq: 1, text: '目标' }], budgetBytes: 1 }), /envelope/)
  const result = buildProviderInput({ messages: [{ seq: 1, text: '首条目标' }, { seq: 2, text: '补充要求' }, { seq: 3, text: '最新需求' }], assistantText: '已完成修复', currentTitle: '原有标题', budgetBytes: 4096 })
  assert.deepEqual(result.messageSeqs, [1, 2, 3])
  assert.equal(parse(result).assistant, '已完成修复')
  assert.equal(parse(result).currentTitle, '原有标题')
})

test('oversized intermediate messages are skipped while smaller context still fits', () => {
  const result = buildProviderInput({
    messages: [{ seq: 1, text: '首条目标' }, { seq: 2, text: '有用补充' }, { seq: 3, text: '超长中文😀'.repeat(1_000_000) }, { seq: 4, text: '最近需求' }],
    assistantText: '完成摘要', currentTitle: '现有标题', budgetBytes: 512,
  })
  assert.deepEqual(result.messageSeqs, [1, 2, 4])
  assert.ok(Buffer.byteLength(result.input) <= 512)
})

test('queued abort rejects, removes waiter and preserves concurrency after double release', async () => {
  const semaphore = new Semaphore(1)
  const release = await semaphore.acquire()
  const controller = new AbortController()
  const cancelled = semaphore.acquire(controller.signal)
  const rejected = assert.rejects(cancelled, TitleCancelledError)
  let admitted = false
  const next = semaphore.acquire().then(value => { admitted = true; return value })
  controller.abort()
  await rejected
  assert.equal(semaphore.active, 1)
  release()
  const releaseNext = await next
  release()
  assert.equal(admitted, true)
  assert.equal(semaphore.active, 1)
  releaseNext()
  assert.equal(semaphore.active, 0)
  const occupied = await semaphore.acquire()
  const waiting = semaphore.acquire()
  const closed = assert.rejects(waiting, TitleCancelledError)
  semaphore.close()
  await closed
  occupied()
  assert.equal(semaphore.active, 0)
  const aborted = new AbortController()
  aborted.abort()
  assert.throws(() => delay(60_000, aborted.signal))
})

test('client unload aborts all requests and removes timers and DOM decorations', async () => {
  const source = (await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')).replace("return { inject: ['slots', 'locale', 'workspaces'], apply }", 'return { createController }')
  const timers = new Map()
  const nodes = new Set()
  let timerId = 0
  const element = () => {
    const classes = new Set()
    const node = { classes, classList: { add: (...values) => values.forEach(value => classes.add(value)), remove: (...values) => values.forEach(value => classes.delete(value)) }, setAttribute() {}, appendChild(child) { nodes.add(child) }, prepend(child) { nodes.add(child) }, remove() { nodes.delete(node) }, querySelector() { return null } }
    return node
  }
  const row = element()
  let factory
  const context = { window: { __ModuleLoader__: { load: value => { factory = value.factory } } }, document: { querySelector: () => row, createElement: element, body: element() }, CSS: { escape: value => value }, AbortController, Error, setTimeout: (callback, ms) => { const id = ++timerId; timers.set(id, { callback, ms }); return id }, clearTimeout: id => timers.delete(id) }
  vm.runInNewContext(source, context)
  const { createController } = factory(name => name === 'react' ? {} : { z: {} })
  const controller = createController()
  controller.setRemote({ renameSession: async () => ({ ok: false, error: new Error('failed') }) })
  await controller.renameOne('toast')
  assert.ok(timers.size > 0)
  const signals = []
  const finish = []
  controller.setRemote({ renameSession: (_, signal) => { signals.push(signal); return new Promise(resolve => finish.push(resolve)) } })
  const first = controller.renameOne('first')
  const second = controller.renameOne('second')
  controller.dispose()
  assert.ok(signals.every(signal => signal.aborted))
  assert.equal(timers.size, 0)
  assert.equal(row.classes.size, 0)
  // Child nodes of a detached toast container need no separate DOM removal.
  const before = nodes.size
  for (const resolve of finish) resolve({ ok: true, value: {} })
  await Promise.all([first, second])
  assert.equal(nodes.size, before)
  assert.equal(timers.size, 0)
})


test('provider rechecks the actual configured limit immediately before retry', async () => {
  const helperUrl = new URL('../lib/title.js', import.meta.url).href
  const source = (await readFile(new URL('../lib/generate.js', import.meta.url), 'utf8'))
    .replace("import { executeSessionTitleLlm } from '@deepseek-ai/dsh-session-title-llm'", 'const executeSessionTitleLlm = (...args) => globalThis.__titleTestExecute(...args)')
    .replace("from './title.js'", 'from ' + JSON.stringify(helperUrl))
  const { generateCandidate } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))
  const config = { maxInputBytes: 512, minAssistantChars: 1 }
  let calls = 0
  globalThis.__titleTestExecute = async (_ctx, actual, _request, _provider, options) => {
    calls += 1
    assert.ok(Buffer.byteLength(options.input) <= actual.maxInputBytes)
    config.maxInputBytes = 1
    return { finish: { kind: 'stop' }, blocks: [{ type: 'text', text: '短' }], model: 'test' }
  }
  try {
    await assert.rejects(generateCandidate({}, config, {
      session: {}, route: { provider: 'test', model: 'test' }, lastUserSeq: 1, throughSeq: 2,
      events: [
        { type: 'user/message', seq: 1, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '最初目标'.repeat(1000) }] } },
        { type: 'assistant/message', seq: 2, data: { message: { content: [{ type: 'text', text: '完成摘要'.repeat(1000) }] } } },
      ],
    }), /exceeds maxInputBytes/)
    assert.equal(calls, 1)
  } finally {
    delete globalThis.__titleTestExecute
  }
})
