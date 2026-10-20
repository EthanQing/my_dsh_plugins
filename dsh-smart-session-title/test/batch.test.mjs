import test from 'node:test'
import assert from 'node:assert/strict'
import { FakeSession, createHarness, withRemote } from './support.mjs'

/**
 * Build a session with a finished turn.
 * @param id - session id.
 * @param options - prompt, answer, and whether the turn is open.
 * @returns the fake session.
 */
function finishedSession(id, options = {}) {
  const session = new FakeSession(id, { config: { provider: 'p', model: 'm' } })
  session.append('user/message', {
    source: { kind: 'user' },
    content: [{ type: 'text', text: options.prompt ?? `请处理 ${id} 的插件批量改名与预览流程` }],
  })
  session.append('turn/start', { turn: 0 })
  session.append('assistant/message', {
    turn: 0,
    step: 0,
    message: { content: [{ type: 'text', text: options.answer ?? '已经完成实现并补充了回归测试。' }] },
  })
  if (options.finished !== false) session.append('turn/end', { turn: 0, reason: { kind: 'completed' } })
  return session
}

/**
 * Compose one harness whose project holds several kinds of session.
 * @param options - extra sessions and configuration.
 * @returns the harness, sessions by id, and remote peers.
 */
async function batchHarness(options = {}) {
  const ready = finishedSession('ready-1', { prompt: '整理插件的批量改名预览流程' })
  const ready2 = finishedSession('ready-2', { prompt: '为项目内的会话生成中文标题' })
  const locked = finishedSession('locked-1', { prompt: '这个会话由用户手动命名' })
  const running = finishedSession('running-1', { finished: false })
  const archived = finishedSession('archived-1', { prompt: '已归档会话不应参与整理' })
  const harness = await createHarness({
    sessions: [ready, ready2, locked, running, archived, ...(options.sessions ?? [])],
    workspaces: {
      w1: { workspaceId: 'w1', sessionIds: ['ready-1', 'ready-2', 'locked-1', 'running-1', 'archived-1', 'cold-1'] },
    },
    titles: options.titles ?? ['整理插件批量预览', '生成会话中文标题', '用户手动命名会话', '不应生成的标题'],
    minAssistantChars: 10,
    ...options.config,
  })
  harness.titleService.rename(locked, '用户手动命名')
  harness.workspaces.archivedSessionIds = ['archived-1']
  const remote = await withRemote(harness)
  return { harness, ready, ready2, locked, running, archived, remote }
}

test('preview reports each session status and writes nothing', async () => {
  const { harness, ready, remote } = await batchHarness()
  try {
    const preview = await remote.invoke(remote.owner, 'previewBatch', { workspaceId: 'w1' })
    const byId = new Map(preview.rows.map(row => [row.sessionId, row]))
    assert.equal(byId.get('ready-1').status, 'ready')
    assert.equal(byId.get('ready-1').title, '整理插件批量预览')
    assert.equal(byId.get('ready-1').oldTitle, '')
    assert.equal(byId.get('locked-1').status, 'user-locked')
    assert.equal(byId.get('locked-1').title, '')
    assert.equal(byId.get('running-1').status, 'running')
    assert.equal(byId.get('archived-1').status, 'archived')
    assert.equal(byId.get('cold-1').status, 'cold')
    assert.equal(preview.rows.length, 6)
    // Preview is read-only: no title event, no committed title, no refresh.
    assert.equal(harness.titleService.get(ready), undefined)
    assert.equal(ready.appends.filter(entry => entry.type === 'session/title').length, 0)
    assert.equal(harness.titleService.refreshes, 0)
  } finally {
    await remote.dispose()
    await harness.dispose()
  }
})

test('confirm applies only the selected subset and reports per-row results', async () => {
  const { harness, ready, ready2, remote } = await batchHarness()
  try {
    const preview = await remote.invoke(remote.owner, 'previewBatch', { workspaceId: 'w1' })
    const confirmed = await remote.invoke(remote.owner, 'confirmBatch', {
      previewId: preview.previewId,
      sessionIds: ['ready-1'],
    })
    assert.deepEqual(confirmed.rows, [{ sessionId: 'ready-1', status: 'renamed', title: '整理插件批量预览' }])
    assert.equal(harness.titleService.get(ready).title, '整理插件批量预览')
    assert.equal(harness.titleService.get(ready).source.kind, 'provider')
    assert.equal(harness.titleService.get(ready2), undefined)
    // The confirmed candidate is consumed by the provider, not generated again.
    assert.equal(harness.llm.calls, 2)
  } finally {
    await remote.dispose()
    await harness.dispose()
  }
})

test('confirm never replaces a session that became manually named', async () => {
  const { harness, ready, ready2, remote } = await batchHarness()
  try {
    const preview = await remote.invoke(remote.owner, 'previewBatch', { workspaceId: 'w1' })
    harness.titleService.rename(ready2, '预览后手动命名')
    const confirmed = await remote.invoke(remote.owner, 'confirmBatch', {
      previewId: preview.previewId,
      sessionIds: ['ready-1', 'ready-2'],
    })
    const byId = new Map(confirmed.rows.map(row => [row.sessionId, row]))
    assert.equal(byId.get('ready-1').status, 'renamed')
    assert.equal(byId.get('ready-2').status, 'failed')
    assert.equal(byId.get('ready-2').reason, 'USER_TITLE_LOCKED')
    assert.equal(harness.titleService.get(ready2).title, '预览后手动命名')
    assert.equal(harness.titleService.get(ready).title, '整理插件批量预览')
  } finally {
    await remote.dispose()
    await harness.dispose()
  }
})

test('confirm rejects content that changed since the preview', async () => {
  const { harness, ready, remote } = await batchHarness()
  try {
    const preview = await remote.invoke(remote.owner, 'previewBatch', { workspaceId: 'w1' })
    // The user keeps talking in that session: the previewed content is stale.
    ready.append('user/message', {
      source: { kind: 'user' },
      content: [{ type: 'text', text: '追加一个全新的需求，改变会话主题' }],
    })
    ready.append('turn/start', { turn: 1 })
    ready.append('assistant/message', {
      turn: 1,
      step: 0,
      message: { content: [{ type: 'text', text: '收到，这是新的回答内容。' }] },
    })
    ready.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
    const confirmed = await remote.invoke(remote.owner, 'confirmBatch', {
      previewId: preview.previewId,
      sessionIds: ['ready-1'],
    })
    assert.equal(confirmed.rows[0].status, 'failed')
    assert.equal(confirmed.rows[0].reason, 'CONTENT_CHANGED')
    assert.equal(harness.titleService.get(ready), undefined, 'the stale candidate is never committed')
  } finally {
    await remote.dispose()
    await harness.dispose()
  }
})

test('a preview is single-use, peer-scoped, and expires', async () => {
  const { harness, remote } = await batchHarness()
  try {
    const preview = await remote.invoke(remote.owner, 'previewBatch', { workspaceId: 'w1' })
    // Another owner connection cannot confirm someone else's preview.
    await assert.rejects(
      remote.invoke(remote.other, 'confirmBatch', { previewId: preview.previewId, sessionIds: ['ready-1'] }),
      /不属于当前连接/,
    )
    await assert.rejects(remote.invoke(remote.owner, 'confirmBatch', { previewId: 'unknown', sessionIds: ['ready-1'] }), /预览/)
    await assert.rejects(
      remote.invoke(remote.owner, 'confirmBatch', { previewId: preview.previewId, sessionIds: ['cold-1'] }),
      /不在本次预览/,
    )
    await remote.invoke(remote.owner, 'confirmBatch', { previewId: preview.previewId, sessionIds: ['ready-1'] })
    await assert.rejects(
      remote.invoke(remote.owner, 'confirmBatch', { previewId: preview.previewId, sessionIds: ['ready-2'] }),
      /已确认过/,
    )
  } finally {
    await remote.dispose()
    await harness.dispose()
  }

  const expiring = await batchHarness({ config: { previewTtlMs: 1 } })
  try {
    const preview = await expiring.remote.invoke(expiring.remote.owner, 'previewBatch', { workspaceId: 'w1' })
    await new Promise(resolve => setTimeout(resolve, 10))
    await assert.rejects(
      expiring.remote.invoke(expiring.remote.owner, 'confirmBatch', { previewId: preview.previewId, sessionIds: ['ready-1'] }),
      /过期/,
    )
  } finally {
    await expiring.remote.dispose()
    await expiring.harness.dispose()
  }
})

test('cancel drops a preview so a later confirm cannot use it', async () => {
  const { harness, remote } = await batchHarness()
  try {
    const preview = await remote.invoke(remote.owner, 'previewBatch', { workspaceId: 'w1' })
    const cancelled = await remote.invoke(remote.owner, 'cancelBatch', { previewId: preview.previewId })
    assert.equal(cancelled.cancelled, true)
    await assert.rejects(
      remote.invoke(remote.owner, 'confirmBatch', { previewId: preview.previewId, sessionIds: ['ready-1'] }),
      /失效/,
    )
  } finally {
    await remote.dispose()
    await harness.dispose()
  }
})

test('preview never generates for a project above the batch limit', async () => {
  const extra = Array.from({ length: 3 }, (_, index) => finishedSession(`extra-${String(index)}`, { prompt: `额外的会话 ${String(index)} 需要命名` }))
  const { harness, remote } = await batchHarness({
    sessions: extra,
    config: { batchLimit: 1 },
  })
  try {
    const preview = await remote.invoke(remote.owner, 'previewBatch', { workspaceId: 'w1' })
    const limited = preview.rows.filter(row => row.status === 'limited')
    assert.ok(limited.length >= 1, 'sessions beyond the limit are reported, not generated')
    assert.ok(harness.llm.calls <= 1)
  } finally {
    await remote.dispose()
    await harness.dispose()
  }
})

test('a single-session AI rename is user-lock aware', async () => {
  const { harness, ready, locked, remote } = await batchHarness()
  try {
    const renamed = await remote.invoke(remote.owner, 'renameSession', { sessionId: 'ready-1' })
    assert.equal(renamed.status, 'renamed')
    assert.equal(harness.titleService.get(ready).title, '整理插件批量预览')
    await assert.rejects(remote.invoke(remote.owner, 'renameSession', { sessionId: 'locked-1' }), /手动指定/)
    assert.equal(harness.titleService.get(locked).title, '用户手动命名')
    await assert.rejects(remote.invoke(remote.agent, 'renameSession', { sessionId: 'ready-2' }), /owner/)
  } finally {
    await remote.dispose()
    await harness.dispose()
  }
})
