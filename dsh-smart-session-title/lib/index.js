/**
 * Host half of dsh-smart-session-title.
 *
 * The plugin registers one session-title provider that names a Session from
 * its goal and its completed assistant reply instead of its first prompt. All
 * titles are still committed by `ctx.sessionTitle`; this half never appends a
 * title event itself, so the built-in manual-name protection stays the single
 * source of truth.
 *
 * Batch confirmation never writes directly either: preview only produces
 * candidates, and confirm hands one confirmed candidate to `refresh()`, which
 * runs this provider again. The provider consumes that candidate instead of
 * calling the model a second time.
 */
import z from '@deepseek-ai/schemastery'
import { SessionTitleProviderId } from '@deepseek-ai/dsh-session-title'
import { SessionTitleLlmConfigFields } from '@deepseek-ai/dsh-session-title-llm'
import { isSameTopic, versionKeyOf } from './title.js'
import { generateCandidate } from './generate.js'
import { TitleGate, TitleCancelledError } from './limits.js'
import { createOperations, FAILURE, TitleOperationError } from './operations.js'
import { registerRemote } from './remote.js'

export { cleanTitle, decideTitle, isSameTopic, isTitleLengthValid, countCodePoints } from './title.js'
export { TitleGate, Semaphore, TitleCancelledError, delay } from './limits.js'
export { FAILURE, TitleOperationError, createOperations } from './operations.js'
export { NAMESPACE, USER_CONFIRMATION_REQUIRED, descriptors, requireOwnerCall } from './remote.js'

/** Plugin identity. */
export const name = 'dsh-smart-session-title'

/** Services the provider and the Remote face require. */
export const inject = ['sessionTitle', 'llm', 'sessions']

/** Provider id recorded on every title this plugin commits. */
export const PROVIDER_ID = 'smart-session-title'

const MAX_TIMEOUT_MS = 2_147_483_647

/**
 * Loader schema. Execution controls mirror the shared title-LLM contract; the
 * throttling and batch limits are this plugin's own policy.
 */
export const Config = z.object({
  minIntervalMs: z.number().step(1).min(0).default(30_000),
  mergeWindowMs: z.number().step(1).min(0).default(2_000),
  concurrency: z.number().step(1).min(1).default(2),
  turnTimeoutMs: z.number().step(1).min(1).max(MAX_TIMEOUT_MS).default(90_000),
  minAssistantChars: z.number().step(1).min(1).default(40),
  batchLimit: z.number().step(1).min(1).max(50).default(20),
  previewTtlMs: z.number().step(1).min(1).default(10 * 60_000),
  providerId: z.string().default(PROVIDER_ID),
  maxInputBytes: z.number().step(1).min(1).default(12 * 1024),
  maxOutputTokens: z.number().step(1).min(1).default(4096),
  timeoutMs: z.number().step(1).min(1).max(MAX_TIMEOUT_MS).default(60_000),
  provider: SessionTitleLlmConfigFields.provider,
  model: SessionTitleLlmConfigFields.model,
})

/**
 * Find the turn boundary that completed the turn opened after one user message.
 * @param events - session event log.
 * @param afterSeq - the user message seq the turn belongs to.
 * @returns the completing `turn/end` event, or undefined while the turn runs.
 */
function completedTurnAfter(events, afterSeq) {
  let boundary
  for (const event of events) {
    if (event.seq <= afterSeq) continue
    if (event.type === 'turn/start' || event.type === 'turn/end') boundary = event
  }
  return boundary?.type === 'turn/end' ? boundary : undefined
}

/**
 * Wait for the turn that follows one user message to finish.
 * @param ctx - Host context.
 * @param session - the live Session.
 * @param afterSeq - the user message seq the turn belongs to.
 * @param timeoutMs - upper bound before the wait reports a timeout.
 * @param signal - cancellation from the title service or the caller.
 * @returns the `turn/end` event.
 */
function waitForTurnEnd(ctx, session, afterSeq, timeoutMs, signal) {
  const finished = completedTurnAfter(session.snapshotEvents(), afterSeq)
  if (finished !== undefined) return Promise.resolve(finished)
  return new Promise((resolve, reject) => {
    let settled = false
    let timer
    let offEvent
    let offDisposed
    const cleanup = () => {
      if (timer !== undefined) clearTimeout(timer)
      offEvent?.()
      offDisposed?.()
      signal?.removeEventListener('abort', onAbort)
    }
    const settle = (error, event) => {
      if (settled) return
      settled = true
      cleanup()
      if (error !== undefined) reject(error)
      else resolve(event)
    }
    const onAbort = () => settle(signal.reason ?? new TitleCancelledError('title generation was cancelled'))
    offEvent = ctx.on('session/event', (eventSession, event) => {
      if (eventSession?.id !== session.id) return
      if (event.seq <= afterSeq) return
      if (event.type === 'turn/end') settle(undefined, event)
    })
    offDisposed = ctx.on('session/disposed', disposed => {
      if (disposed !== session) return
      settle(new TitleCancelledError('session was disposed during title generation'))
    })
    timer = setTimeout(() => {
      settle(new TitleCancelledError(`timed out after ${String(timeoutMs)} ms waiting for the turn to end`))
    }, timeoutMs)
    if (signal !== undefined) {
      if (signal.aborted) {
        settle(signal.reason)
        return
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }
  })
}

/**
 * Register the provider, the batch operations, and the owner-only Remote face.
 * @param ctx - Host context.
 * @param rawConfig - plugin configuration from the Loader.
 */
export function apply(ctx, rawConfig) {
  const config = { ...Config(rawConfig ?? {}) }
  const providerId = config.providerId
  const titleProvider = SessionTitleProviderId(providerId)
  const gate = new TitleGate({
    minIntervalMs: config.minIntervalMs,
    mergeWindowMs: config.mergeWindowMs,
    concurrency: config.concurrency,
  })
  const operations = createOperations(ctx, config)

  ctx.effect(() => () => {
    gate.close()
  }, 'dsh-smart-session-title: scheduler lifetime')

  /**
   * Produce the provider's accepted result for one generation revision.
   * @param request - the title-service generation request.
   * @returns the accepted title result.
   */
  const generate = async request => {
    const { session, messages, signal } = request
    const lastUserSeq = messages.at(-1)?.seq
    if (lastUserSeq === undefined) throw new Error('dsh-smart-session-title: no human message to name')
    const currentTitle = typeof request.currentTitle === 'string'
      ? request.currentTitle
      : request.currentTitle?.title

    // A user rename pins the title: never generate over it.
    if (ctx.sessionTitle.get(session)?.source?.kind === 'user') {
      throw new Error('dsh-smart-session-title: the title is user-pinned')
    }
    const messageSeqs = messages.map(message => message.seq)

    if (operations.isConfirmed(session.id)) {
      const version = versionKeyOf(session.id, session.snapshotEvents(), lastUserSeq)
      const candidate = operations.takeCandidate(session.id, version)
      if (candidate === undefined) {
        throw new TitleOperationError(FAILURE.unchanged, '会话内容已变化，已取消本次命名')
      }
      return { title: candidate.title, messageSeqs }
    }

    const through = await waitForTurnEnd(ctx, session, lastUserSeq, config.turnTimeoutMs, signal)
    if (ctx.sessions.get(session.id) !== session) {
      throw new TitleCancelledError('session was disposed during title generation')
    }
    // The user may have renamed while this turn was running.
    if (ctx.sessionTitle.get(session)?.source?.kind === 'user') {
      throw new Error('dsh-smart-session-title: the title became user-pinned')
    }
    const version = versionKeyOf(session.id, session.snapshotEvents(), lastUserSeq)
    // An explicit single-session rename always regenerates; only automatic work
    // reuses a remembered result for identical content.
    if (!operations.isSingleRename(session.id)) {
      const remembered = operations.recallAutomatic(session.id, version)
      if (remembered !== undefined) {
        if (currentTitle !== undefined && isSameTopic(remembered.title, currentTitle)) {
          throw new Error('dsh-smart-session-title: this content already produced the same title')
        }
        return { title: remembered.title, messageSeqs }
      }
    }
    const generated = await gate.run(session.id, async guarded => {
      if (ctx.sessions.get(session.id) !== session) {
        throw new TitleCancelledError('session was disposed during title generation')
      }
      if (ctx.sessionTitle.get(session)?.source?.kind === 'user') {
        throw new Error('dsh-smart-session-title: the title became user-pinned')
      }
      return await generateCandidate(ctx, config, {
        session,
        events: session.snapshotEvents(),
        lastUserSeq,
        throughSeq: through.seq,
        currentTitle,
        signal: guarded,
        titleProvider,
        route: request.route,
      })
    }, { signal })
    operations.rememberAutomatic(session.id, version, generated.title)
    return {
      title: generated.title,
      messageSeqs: generated.messageSeqs,
      ...(generated.model === undefined ? {} : { model: generated.model }),
    }
  }

  ctx.sessionTitle.register({ id: titleProvider, automatic: 'all-prompts', generate })

  // The Remote face needs the Typert registry; a composition without it keeps
  // the provider working and simply exposes no batch confirmation.
  ctx.inject(['typert'], typertCtx => {
    registerRemote(typertCtx, { ...operations, rename: sessionId => operations.renameSession(sessionId) })
  })
}
