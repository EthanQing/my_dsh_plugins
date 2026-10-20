import test from 'node:test'
import assert from 'node:assert/strict'
import { FakeSession, createHarness } from './support.mjs'
import { TitleGate, TitleCancelledError, delay } from '../src/limits.js'

/**
 * Build one session with a completed turn and a substantive assistant answer.
 * @param options - ids, texts, and whether the turn is finished.
 * @returns the fake session.
 */
function sessionWithTurn({ id = 's1', prompt = '帮我修复插件的 Remote 身份校验', answer = '已完成身份校验与参数校验，并补充了测试。', finished = true, config = { provider: 'p', model: 'm' } } = {}) {
  const session = new FakeSession(id, { config })
  session.append('user/message', { source: { kind: 'user' }, content: [{ type: 'text', text: prompt }] })
  session.append('turn/start', { turn: 0 })
  session.append('assistant/message', { turn: 0, step: 0, message: { content: [{ type: 'reasoning', text: '思考' }, { type: 'text', text: answer }] } })
  if (finished) session.append('turn/end', { turn: 0, reason: { kind: 'completed' } })
  return session
}

test('the provider registers once with all-prompts cadence', async () => {
  const harness = await createHarness({ sessions: [sessionWithTurn()] })
  try {
    assert.equal(harness.titleService.provider.id, 'smart-session-title')
    assert.equal(harness.titleService.provider.automatic, 'all-prompts')
    assert.throws(() => harness.titleService.register({ id: 'x', automatic: 'all-prompts', generate: () => {} }), /already registered/)
  } finally {
    await harness.dispose()
  }
})

test('refresh waits for the completed turn, then commits one title with source seqs', async () => {
  const session = sessionWithTurn({ finished: false })
  const harness = await createHarness({ sessions: [session], titles: ['修复插件 Remote 身份校验'] })
  try {
    const pending = harness.titleService.refresh(session)
    await delay(10)
    // Nothing is decided while the turn is still open.
    assert.equal(harness.titleService.get(session), undefined)
    session.append('turn/end', { turn: 0, reason: { kind: 'completed' } })
    harness.emit(session, session.snapshotEvents().at(-1))
    const snapshot = await pending
    assert.equal(snapshot.title, '修复插件 Remote 身份校验')
    assert.deepEqual(snapshot.messageSeqs, [0])
    assert.equal(harness.llm.calls, 1)
    assert.equal(session.appends.filter(entry => entry.type === 'session/title').length, 1)
  } finally {
    await harness.dispose()
  }
})

test('a user rename before the turn ends is never overwritten', async () => {
  const session = sessionWithTurn({ finished: false })
  const harness = await createHarness({ sessions: [session], titles: ['模型生成的标题内容'] })
  try {
    const pending = harness.titleService.refresh(session)
    await delay(10)
    harness.titleService.rename(session, '手动命名的标题')
    session.append('turn/end', { turn: 0, reason: { kind: 'completed' } })
    harness.emit(session, session.snapshotEvents().at(-1))
    await assert.rejects(pending, /user-pinned/)
    assert.equal(harness.titleService.get(session).title, '手动命名的标题')
    assert.equal(harness.titleService.get(session).source.kind, 'user')
    assert.equal(harness.llm.calls, 0)
  } finally {
    await harness.dispose()
  }
})

test('a user rename present before generation rejects without calling the model', async () => {
  const session = sessionWithTurn()
  const harness = await createHarness({ sessions: [session], titles: ['不该使用的标题'] })
  try {
    harness.titleService.rename(session, '用户自己的标题')
    await assert.rejects(harness.titleService.refresh(session), /user-pinned/)
    assert.equal(harness.llm.calls, 0)
    assert.equal(harness.titleService.get(session).title, '用户自己的标题')
  } finally {
    await harness.dispose()
  }
})

test('an open turn times out and keeps the standing title', async () => {
  const session = sessionWithTurn({ finished: false })
  const harness = await createHarness({ sessions: [session], titles: ['超时不该提交'], turnTimeoutMs: 30 })
  try {
    harness.titleService.titles.set(session.id, { title: '原标题', source: { kind: 'fallback' }, messageSeqs: [] })
    await assert.rejects(harness.titleService.refresh(session), /timed out/)
    assert.equal(harness.titleService.get(session).title, '原标题')
    assert.equal(harness.llm.calls, 0)
  } finally {
    await harness.dispose()
  }
})

test('no model call happens without a substantive assistant reply', async () => {
  const stub = sessionWithTurn({ answer: '好' })
  const harness = await createHarness({ sessions: [stub], titles: ['短回复不该生成'], minAssistantChars: 40 })
  try {
    await assert.rejects(harness.titleService.refresh(stub), /过短/)
    assert.equal(harness.llm.calls, 0)
    assert.equal(harness.titleService.get(stub), undefined)
  } finally {
    await harness.dispose()
  }
})

test('a rejected length retries once, then keeps the old title', async () => {
  const session = sessionWithTurn({ prompt: '修复插件 Remote 校验并补充测试' })
  const harness = await createHarness({ sessions: [session], titles: ['太短', '还是太短'] })
  try {
    await assert.rejects(harness.titleService.refresh(session), /不是合法标题/)
    assert.equal(harness.llm.calls, 2)
    assert.equal(harness.titleService.get(session), undefined)
  } finally {
    await harness.dispose()
  }
})

test('an identical content version is never sent to the model twice', async () => {
  const session = sessionWithTurn({ prompt: '整理项目内的会话标题并确认结果' })
  const harness = await createHarness({ sessions: [session], titles: ['整理项目会话标题确认'] })
  try {
    const first = await harness.titleService.refresh(session)
    assert.equal(first.title, '整理项目会话标题确认')
    // A second refresh of identical content never reaches the model: the
    // provider refuses, so the standing title stays exactly as it was.
    await assert.rejects(harness.titleService.refresh(session), /already produced the same title/)
    assert.equal(harness.llm.calls, 1)
    assert.equal(harness.titleService.get(session).title, '整理项目会话标题确认')
  } finally {
    await harness.dispose()
  }
})

test('the title gate enforces the interval, the merge window, and concurrency', async () => {
  const gate = new TitleGate({ minIntervalMs: 30, mergeWindowMs: 5, concurrency: 1 })
  const starts = []
  const run = key => gate.run(key, async () => {
    starts.push(Date.now())
    await delay(5)
    return key
  })
  try {
    const startedAt = Date.now()
    await run('a')
    await run('a')
    assert.ok(Date.now() - startedAt >= 30, 'the second start waits for the interval')
  } finally {
    gate.close()
  }

  const parallel = new TitleGate({ minIntervalMs: 0, mergeWindowMs: 0, concurrency: 2 })
  let peak = 0
  let active = 0
  try {
    await Promise.all(['a', 'b', 'c'].map(key => parallel.run(key, async () => {
      active += 1
      peak = Math.max(peak, active)
      await delay(10)
      active -= 1
      return key
    })))
    assert.equal(peak, 2)
  } finally {
    parallel.close()
  }
})

test('a queued generation is cancelled by cancellation and by disposal', async () => {
  const gate = new TitleGate({ minIntervalMs: 0, mergeWindowMs: 50, concurrency: 1 })
  try {
    const controller = new AbortController()
    const run = gate.run('s', async () => 'never', { signal: controller.signal })
    controller.abort(new Error('user cancelled'))
    await assert.rejects(run, /user cancelled/, 'cancellation rejects the waiter')
  } finally {
    gate.close()
  }

  const closing = new TitleGate({ minIntervalMs: 0, mergeWindowMs: 200, concurrency: 1 })
  const pending = closing.run('s', async () => 'never')
  closing.close()
  await assert.rejects(pending, /disposed/, 'disposal rejects the waiter')
})

test('a newer request for one session supersedes the queued one', async () => {
  const gate = new TitleGate({ minIntervalMs: 0, mergeWindowMs: 40, concurrency: 1 })
  try {
    const first = gate.run('s', async () => 'first')
    const second = gate.run('s', async () => 'second')
    await assert.rejects(first, TitleCancelledError)
    assert.equal(await second, 'second')
  } finally {
    gate.close()
  }
})
