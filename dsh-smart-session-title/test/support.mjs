/**
 * A small Host harness for the plugin's behavior tests.
 *
 * It exercises the real `apply()` wiring against a fake title service, a fake
 * Session store, a fake LLM, and a real Cordis Context, so tests cover the
 * provider contract, the manual-name protection, and the batch flow without
 * opening a real conversation or writing any Session log on disk.
 */
import { Context } from '@deepseek-ai/cordis'

/**
 * A deterministic event log stand-in with the Session methods the plugin uses.
 */
export class FakeSession {
  /**
   * @param id - session identity.
   * @param options - initial events and a model route.
   */
  constructor(id, options = {}) {
    this.id = id
    this.log = []
    this.header = { id, config: options.config }
    this.appends = []
    this.seq = 0
  }

  /**
   * Append one event to the fake log.
   * @param type - event type.
   * @param data - event payload.
   * @returns the appended event.
   */
  append(type, data) {
    const event = { type, seq: this.seq, time: Date.now(), data }
    this.seq += 1
    this.log.push(event)
    this.appends.push({ type, data })
    return event
  }

  /** @returns a shallow snapshot of the fake log. */
  snapshotEvents() {
    return [...this.log]
  }

  /** @returns the folded request header stand-in. */
  requestHeader() {
    return this.header.config === undefined ? undefined : { config: this.header.config }
  }
}

/**
 * A title-service stand-in that commits provider results the way the real
 * service does, including the manual-name protection.
 */
export class FakeTitleService {
  constructor() {
    this.provider = undefined
    this.titles = new Map()
    this.refreshes = 0
    this.providerCalls = 0
  }

  register(provider) {
    if (this.provider !== undefined) throw new Error('a provider is already registered')
    this.provider = provider
    return () => {
      this.provider = undefined
    }
  }

  get(session) {
    return this.titles.get(session.id)
  }

  rename(session, title) {
    this.titles.set(session.id, { title, source: { kind: 'user' }, messageSeqs: [] })
  }

  async refresh(session) {
    this.refreshes += 1
    if (this.provider === undefined) throw new Error('no provider')
    const messages = session.snapshotEvents()
      .filter(event => event.type === 'user/message' && event.data.source.kind === 'user')
      .map(event => ({
        seq: event.seq,
        text: event.data.content.filter(block => block.type === 'text').map(block => block.text).join('\n'),
      }))
    if (messages.length === 0) return undefined
    const current = this.titles.get(session.id)
    this.providerCalls += 1
    const result = await this.provider.generate({
      session,
      messages,
      ...current === undefined ? {} : { currentTitle: current },
    })
    if (current?.source?.kind === 'user') throw new Error('a user title must never be replaced by refresh')
    this.titles.set(session.id, {
      title: result.title,
      source: { kind: 'provider', provider: this.provider.id },
      messageSeqs: result.messageSeqs,
    })
    session.append('session/title', {
      title: result.title,
      messageSeqs: result.messageSeqs,
      source: { kind: 'provider', provider: this.provider.id },
    })
    return this.get(session)
  }
}

/**
 * A fake workspace registry over plain records.
 */
export class FakeWorkspaceRegistry {
  constructor(records = {}) {
    this.records = new Map(Object.entries(records))
    this.archivedSessionIds = []
  }

  /**
   * @param id - workspace id.
   * @returns the workspace record with `sessionIds`.
   */
  get(id) {
    return this.records.get(id)
  }
}

/**
 * An LLM stand-in that records calls and returns scripted titles.
 */
export class FakeLlm {
  constructor(titles) {
    this.titles = [...titles]
    this.calls = 0
  }

  async prepareCall() {
    const llm = this
    return {
      config: { provider: 'fake', model: 'fake-model' },
      stream: async function* stream() {
        llm.calls += 1
        const text = llm.titles.length > 0 ? llm.titles.shift() : '会话标题兜底方案'
        yield { type: 'block-start', index: 0, blockType: 'text' }
        yield { type: 'text-delta', index: 0, text }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    }
  }
}

/**
 * Compose one Host context with the plugin applied.
 * @param options - config, sessions, workspaces, and scripted model titles.
 * @returns the context, fakes, and a teardown.
 */
export async function createHarness(options = {}) {
  const ctx = new Context()
  const titleService = new FakeTitleService()
  const sessions = new Map()
  for (const session of options.sessions ?? []) sessions.set(session.id, session)
  const workspaces = new FakeWorkspaceRegistry(options.workspaces ?? {})
  const llm = new FakeLlm(options.titles ?? [])

  ctx.provide('sessionTitle', titleService)
  ctx.provide('llm', llm)
  ctx.provide('sessions', {
    get: id => sessions.get(id),
    list: () => [...sessions.values()],
  })
  ctx.provide('workspaceRegistry', workspaces)

  const plugin = await import('../src/index.js')
  const config = {
    minIntervalMs: 0,
    mergeWindowMs: 0,
    concurrency: 1,
    turnTimeoutMs: options.turnTimeoutMs ?? 1000,
    minAssistantChars: options.minAssistantChars ?? 10,
    batchLimit: options.batchLimit ?? 20,
    previewTtlMs: options.previewTtlMs ?? 60_000,
    ...options.config,
  }
  const fiber = ctx.plugin({ name: 'dsh-smart-session-title-test', inject: plugin.inject, apply: plugin.apply }, config)
  await fiber

  return {
    ctx,
    plugin,
    titleService,
    sessions,
    workspaces,
    llm,
    /**
     * Emit one Session event through the Host event bus.
     * @param session - the emitting session.
     * @param event - the event payload.
     */
    emit(session, event) {
      ctx.emit('session/event', session, event)
    },
    async dispose() {
      await ctx.fiber.dispose()
    },
  }
}

/**
 * Extend one harness with a real Typert registry, access control, and Gateway,
 * then create owner/non-owner Peers for Remote-level behavior tests.
 * @param harness - a harness from {@link createHarness}.
 * @returns the peers, a Gateway invoker, and teardown.
 */
export async function withRemote(harness) {
  const { Context } = await import('@deepseek-ai/cordis')
  const { TypertRegistry } = await import('@deepseek-ai/dsh-typert-registry')
  const { TypertGatewayService } = await import('@deepseek-ai/dsh-api-gateway')
  const { Peer } = await import('@deepseek-ai/dsh-client-connection')
  const ctx = harness.ctx
  new TypertRegistry(ctx)
  ctx.provide('remoteAccess', { decide: () => ({ kind: 'allow' }) })
  new TypertGatewayService(ctx, { websocketHeartbeatIntervalMs: 30_000, streamInboxBytes: 65_536 })
  const owner = new Peer(ctx, { principal: { kind: 'owner' }, interactions: 'answer' })
  const other = new Peer(ctx, { principal: { kind: 'owner' }, interactions: 'answer' })
  const agent = new Peer(ctx, { principal: { kind: 'agent', id: 'agent-test' }, interactions: 'answer' })
  const invoke = (peer, method, request) => ctx.typertGateway.invoke({
    namespace: 'smartSessionTitle',
    method,
    args: { request },
    peer,
    signal: new AbortController().signal,
  })
  return {
    Context,
    owner,
    other,
    agent,
    invoke,
    async dispose() {
      await owner.dispose()
      await other.dispose()
      await agent.dispose()
    },
  }
}
