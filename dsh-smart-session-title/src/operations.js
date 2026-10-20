/**
 * Host operations for the single-Session and project-batch title flows.
 *
 * Nothing here writes a title directly: every accepted candidate is applied by
 * asking `sessionTitle.refresh()` to run the registered provider, so the
 * title service stays the only writer and a user title can never be replaced
 * from this plugin. Batch confirmation is reachable only through the Remote
 * namespace, whose caller gate is applied before these functions run.
 */
import { randomUUID } from 'node:crypto'
import {
  collectUserMessages,
  isTurnRunning,
  versionKeyOf,
} from './title.js'
import { generateCandidate } from './generate.js'

/** Stable failure codes the Remote face and the Client translate. */
export const FAILURE = {
  userLocked: 'USER_TITLE_LOCKED',
  running: 'SESSION_RUNNING',
  cold: 'SESSION_NOT_LIVE',
  insufficient: 'INSUFFICIENT_CONTENT',
  previewMissing: 'PREVIEW_NOT_FOUND',
  previewExpired: 'PREVIEW_EXPIRED',
  previewUsed: 'PREVIEW_ALREADY_CONFIRMED',
  previewForeign: 'PREVIEW_NOT_YOURS',
  subset: 'PREVIEW_SELECTION_INVALID',
  unchanged: 'CONTENT_CHANGED',
  batch: 'BATCH_LIMIT',
}

/** An operation failure the Remote layer can carry as a stable code. */
export class TitleOperationError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'TitleOperationError'
    this.code = code
  }
}

/**
 * Read the live Session and reject cold or foreign ids.
 * @param ctx - Host context.
 * @param sessionId - requested session.
 * @returns the live Session.
 */
function requireLiveSession(ctx, sessionId) {
  const session = ctx.sessions.get(sessionId)
  if (session === undefined) throw new TitleOperationError(FAILURE.cold, `会话 ${sessionId} 未在内存中打开`)
  return session
}

/**
 * Reject a user-pinned title. Every entry point runs this check, so a rename
 * made while a model call is in flight is never overwritten.
 * @param ctx - Host context.
 * @param session - live Session.
 */
function requireNotUserLocked(ctx, session) {
  if (ctx.sessionTitle.get(session)?.source?.kind === 'user') {
    throw new TitleOperationError(FAILURE.userLocked, '该会话标题由用户手动指定，自动命名已跳过')
  }
}

/**
 * Build the batch/preview/single-session operations over one Host context.
 * @param ctx - Host context exposed to the plugin.
 * @param config - validated plugin configuration.
 * @returns operations, candidate store, and disposal.
 */
export function createOperations(ctx, config) {
  /** previewId → preview record (peer, workspace, members, candidates, versions). */
  const previews = new Map()
  /** sessionId → {version, title}: confirmed candidate consumed by the provider. */
  const candidates = new Map()
  /** sessionId → {version, title}: last result, so identical content is never re-sent. */
  const lastGenerated = new Map()
  /** Sessions whose next provider run must consume a confirmed preview candidate. */
  const confirmed = new Set()
  /** Sessions renamed directly from the single-session entry point (fresh generation). */
  const single = new Set()
  let disposed = false

  ctx.effect(() => () => {
    disposed = true
    previews.clear()
    candidates.clear()
    lastGenerated.clear()
    confirmed.clear()
    single.clear()
  }, 'smart-session-title: operations lifetime')

  /**
   * Compute the content version of one Session at its current last user message.
   * @param session - live Session.
   * @returns `{version, lastUserSeq, events}`.
   */
  function snapshotOf(session) {
    const events = session.snapshotEvents()
    const messages = collectUserMessages(events)
    const last = messages.at(-1)
    return {
      events,
      lastUserSeq: last?.seq,
      version: last === undefined ? undefined : versionKeyOf(session.id, events, last.seq),
    }
  }

  /**
   * Produce one candidate for a live Session without writing it.
   * @param session - live Session.
   * @param signal - cancellation.
   * @returns the candidate title and its version.
   */
  async function candidateFor(session, signal) {
    requireNotUserLocked(ctx, session)
    const { events, lastUserSeq, version } = snapshotOf(session)
    if (lastUserSeq === undefined) throw new TitleOperationError(FAILURE.insufficient, '会话没有真人消息')
    if (isTurnRunning(events)) throw new TitleOperationError(FAILURE.running, '会话正在运行')
    const cached = lastGenerated.get(session.id)
    if (cached !== undefined && cached.version === version) return cached
    const currentTitle = ctx.sessionTitle.get(session)?.title
    const generated = await generateCandidate(ctx, config, {
      session,
      events,
      lastUserSeq,
      throughSeq: events.at(-1)?.seq,
      currentTitle,
      signal,
      titleProvider: config.providerId,
    })
    const record = { version, title: generated.title }
    lastGenerated.set(session.id, record)
    return record
  }

  /**
   * Preview an AI rename for every eligible Session of one project.
   * @param peer - the calling Remote peer (owner) or a synthetic local peer.
   * @param workspaceId - project to scan.
   * @param signal - cancellation.
   * @returns preview rows; nothing is written.
   */
  async function preview(peer, workspaceId, signal) {
    if (disposed) throw new TitleOperationError(FAILURE.previewExpired, '插件已卸载')
    signal?.throwIfAborted()
    const workspace = ctx.get('workspaceRegistry')?.get(workspaceId)
    if (workspace === undefined) throw new TitleOperationError(FAILURE.cold, `项目 ${workspaceId} 不存在`)
    const archived = new Set(ctx.get('workspaceRegistry')?.archivedSessionIds ?? [])
    const members = [...workspace.sessionIds]
    const candidatesBySession = new Map()
    const rows = []
    let modelCalls = 0
    for (const sessionId of members) {
      signal?.throwIfAborted()
      if (archived.has(sessionId)) {
        rows.push({ sessionId, oldTitle: '', title: '', status: 'archived' })
        continue
      }
      const session = ctx.sessions.get(sessionId)
      if (session === undefined) {
        rows.push({ sessionId, oldTitle: '', title: '', status: 'cold' })
        continue
      }
      const oldTitle = ctx.sessionTitle.get(session)?.title ?? ''
      if (ctx.sessionTitle.get(session)?.source?.kind === 'user') {
        rows.push({ sessionId, oldTitle, title: '', status: 'user-locked' })
        continue
      }
      if (isTurnRunning(session.snapshotEvents())) {
        rows.push({ sessionId, oldTitle, title: '', status: 'running' })
        continue
      }
      if (modelCalls >= config.batchLimit) {
        rows.push({ sessionId, oldTitle, title: '', status: 'limited' })
        continue
      }
      modelCalls += 1
      try {
        const candidate = await candidateFor(session, signal)
        candidatesBySession.set(sessionId, candidate)
        rows.push({ sessionId, oldTitle, title: candidate.title, status: 'ready' })
      } catch (error) {
        rows.push({
          sessionId,
          oldTitle,
          title: '',
          status: error instanceof TitleOperationError && error.code === FAILURE.insufficient ? 'insufficient' : 'failed',
        })
      }
    }
    signal?.throwIfAborted()
    const previewId = randomUUID()
    const expiresAt = Date.now() + config.previewTtlMs
    previews.set(previewId, {
      previewId,
      peerId: peer?.id,
      workspaceId,
      members: new Set(candidatesBySession.keys()),
      candidates: candidatesBySession,
      rows,
      expiresAt,
      consumed: false,
    })
    return { previewId, expiresAt, rows }
  }

  /**
   * Validate one preview for the calling peer.
   * @param peer - the calling Remote peer.
   * @param previewId - preview identity.
   * @returns the preview record.
   */
  function requirePreview(peer, previewId) {
    const preview = previews.get(previewId)
    if (preview === undefined) throw new TitleOperationError(FAILURE.previewMissing, '预览已失效，请重新预览')
    if (preview.peerId !== peer?.id) throw new TitleOperationError(FAILURE.previewForeign, '预览不属于当前连接')
    if (preview.consumed) throw new TitleOperationError(FAILURE.previewUsed, '该预览已确认过，请重新预览')
    if (Date.now() > preview.expiresAt) {
      previews.delete(previewId)
      throw new TitleOperationError(FAILURE.previewExpired, '预览已过期，请重新预览')
    }
    return preview
  }

  /**
   * Apply the selected candidates of one preview.
   * @param peer - the calling Remote peer.
   * @param previewId - preview identity.
   * @param sessionIds - selected subset.
   * @param signal - cancellation.
   * @returns per-session results.
   */
  async function confirm(peer, previewId, sessionIds, signal) {
    signal?.throwIfAborted()
    const preview = requirePreview(peer, previewId)
    const selected = [...new Set(sessionIds)]
    if (selected.length === 0) throw new TitleOperationError(FAILURE.subset, '请至少选择一个会话')
    if (selected.length > config.batchLimit) throw new TitleOperationError(FAILURE.subset, '选择数量超过单次上限')
    for (const sessionId of selected) {
      if (!preview.members.has(sessionId)) throw new TitleOperationError(FAILURE.subset, `会话 ${sessionId} 不在本次预览的候选中`)
    }
    preview.consumed = true
    const workspace = ctx.get('workspaceRegistry')?.get(preview.workspaceId)
    const results = []
    for (const sessionId of selected) {
      signal?.throwIfAborted()
      const session = ctx.sessions.get(sessionId)
      if (session === undefined) {
        results.push({ sessionId, status: 'skipped', reason: FAILURE.cold })
        continue
      }
      try {
        requireNotUserLocked(ctx, session)
        if (workspace === undefined || !workspace.sessionIds.includes(sessionId)) {
          throw new TitleOperationError(FAILURE.unchanged, '会话已不属于该项目')
        }
        const { version } = snapshotOf(session)
        const candidate = preview.candidates.get(sessionId)
        if (candidate === undefined || version === undefined || candidate.version !== version) {
          throw new TitleOperationError(FAILURE.unchanged, '会话内容已变化，请重新预览')
        }
        candidates.set(sessionId, { version, title: candidate.title })
        confirmed.add(sessionId)
        try {
          const snapshot = await ctx.sessionTitle.refresh(session, signal)
          results.push({ sessionId, status: 'renamed', title: snapshot?.title ?? candidate.title })
        } finally {
          confirmed.delete(sessionId)
          // A candidate is single-use: it never survives the refresh it authorized.
          candidates.delete(sessionId)
        }
      } catch (error) {
        results.push({
          sessionId,
          status: 'failed',
          reason: error instanceof TitleOperationError ? error.code : 'GENERATION_FAILED',
        })
      }
    }
    return { previewId, rows: results }
  }

  /**
   * Drop one preview.
   * @param peer - the calling Remote peer.
   * @param previewId - preview identity.
   */
  function cancel(peer, previewId) {
    const preview = previews.get(previewId)
    if (preview === undefined) return { previewId, cancelled: false }
    if (preview.peerId !== peer?.id) throw new TitleOperationError(FAILURE.previewForeign, '预览不属于当前连接')
    previews.delete(previewId)
    return { previewId, cancelled: true }
  }

  /**
   * Ask for one AI rename of an explicitly chosen Session.
   * @param sessionId - target session.
   * @param signal - cancellation.
   * @returns the accepted title.
   */
  async function renameSession(sessionId, signal) {
    signal?.throwIfAborted()
    const session = requireLiveSession(ctx, sessionId)
    requireNotUserLocked(ctx, session)
    if (isTurnRunning(session.snapshotEvents())) throw new TitleOperationError(FAILURE.running, '会话正在运行，请稍后再试')
    const { lastUserSeq } = snapshotOf(session)
    if (lastUserSeq === undefined) throw new TitleOperationError(FAILURE.insufficient, '会话没有真人消息')
    single.add(sessionId)
    try {
      const snapshot = await ctx.sessionTitle.refresh(session, signal)
      return { sessionId, status: 'renamed', title: snapshot?.title ?? '' }
    } catch (error) {
      if (error instanceof TitleOperationError) throw error
      throw new TitleOperationError(FAILURE.insufficient, error instanceof Error ? error.message : String(error))
    } finally {
      single.delete(sessionId)
    }
  }

  return {
    preview,
    confirm,
    cancel,
    rename: renameSession,
    renameSession,
    /** Whether the next provider run must consume a confirmed preview candidate. */
    isConfirmed: sessionId => confirmed.has(sessionId),
    /** Whether the next provider run was requested from the single-session entry point. */
    isSingleRename: sessionId => single.has(sessionId),
    /**
     * Take one confirmed candidate exactly once.
     * @param sessionId - target session.
     * @param version - content version the candidate was previewed against.
     * @returns the candidate when the version still matches, else undefined.
     */
    takeCandidate(sessionId, version) {
      const candidate = candidates.get(sessionId)
      candidates.delete(sessionId)
      if (candidate === undefined || candidate.version !== version) return undefined
      return candidate
    },
    /** Record the last automatic result so an unchanged version is not re-sent. */
    rememberAutomatic(sessionId, version, title) {
      lastGenerated.set(sessionId, { version, title })
    },
    /** Look up a previously generated result for the same content version. */
    recallAutomatic(sessionId, version) {
      const cached = lastGenerated.get(sessionId)
      return cached !== undefined && cached.version === version ? cached : undefined
    },
  }
}
