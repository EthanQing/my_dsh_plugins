/**
 * The owner-only Remote face of this plugin.
 *
 * One descriptor set is shared by the Host registration and the Client mount,
 * so both sides agree on wire names, strictness, and cancellation. Every
 * method re-reads `this.ctx.invocation` and refuses anything that is not an
 * owner Peer able to answer prompts, so a batch confirmation can never be
 * forged by an agent, a secondary page, or a direct in-process call.
 */
import { RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { rules, strictCodec } from './validate.js'

/** npm package that owns the contribution. */
export const PACKAGE = 'dsh-smart-session-title'
/** Remote namespace installed on the Client as `ctx.remote.smartSessionTitle`. */
export const NAMESPACE = 'smartSessionTitle'
/** Stable failure code for a call that lacks the owner confirmation context. */
export const USER_CONFIRMATION_REQUIRED = 'USER_CONFIRMATION_REQUIRED'
/** Failure code carried for a rejected title operation. */
export const OPERATION_FAILED = 'smart-session-title/failed'

/**
 * Compose one descriptor per Remote method. The Host half validates with its
 * own dependency-free strict rules; the Client half builds the same shape from
 * the seeded `zod` module, so names, strictness, and cancellation match.
 * @param codecFor - maps a schema name to a strict codec.
 * @returns descriptors accepted by the Typert registry and the Client mount.
 */
export function descriptorsWith(codecFor) {
  const names = {
    previewBatch: ['previewBatchInput', 'previewBatchResult'],
    confirmBatch: ['confirmBatchInput', 'confirmBatchResult'],
    cancelBatch: ['cancelBatchInput', 'cancelBatchResult'],
    renameSession: ['renameSessionInput', 'renameSessionResult'],
  }
  return Object.entries(names).map(([method, [inputName, resultName]]) => ({
    id: `${PACKAGE}#${NAMESPACE}/${method}`,
    service: NAMESPACE,
    namespace: NAMESPACE,
    method,
    invocation: { kind: 'direct' },
    parameters: [{ name: 'request', wire: 'request', source: 'json', codec: codecFor(inputName) }],
    cancellation: { parameter: 'signal' },
    result: codecFor(resultName),
  }))
}

/**
 * The Host descriptor set, whose codecs run the dependency-free rules.
 * @returns descriptors for `ctx.typert.register`.
 */
export function descriptors() {
  const table = rules()
  return descriptorsWith(name => strictCodec(`${PACKAGE}#${name}`, table[name]))
}

/**
 * Reafirm the owner confirmation context of the current Remote call.
 * @param invocation - `this.ctx.invocation` of the called method.
 * @param method - expected Remote method name.
 * @returns the calling owner Peer.
 * @throws {RemoteError} `USER_CONFIRMATION_REQUIRED` for anything else.
 */
export function requireOwnerCall(invocation, method) {
  const fail = reason => {
    throw new RemoteError(USER_CONFIRMATION_REQUIRED, `smart-session-title: ${reason}`, { method })
  }
  if (invocation === null || typeof invocation !== 'object') fail('the call has no Remote invocation context')
  if (invocation.service !== NAMESPACE) fail('the call targets another service')
  if (invocation.request?.namespace !== NAMESPACE) fail('the call namespace does not match')
  if (invocation.request?.method !== method) fail('the call method does not match')
  const peer = invocation.peer
  if (peer === null || typeof peer !== 'object') fail('the call has no peer')
  if (peer.principal?.kind !== 'owner') fail('only the owner may confirm title changes')
  if (peer.interactions !== 'answer') fail('the connection cannot answer a confirmation')
  if (peer.signal?.aborted === true) fail('the connection is gone')
  if (invocation.signal?.aborted === true) fail('the call was cancelled')
  return peer
}

/**
 * Translate a rejected title operation into a Remote failure carrying its
 * stable code, so the Client can explain the refusal instead of showing a
 * generic gateway error.
 * @param error - the caught value.
 * @returns a RemoteError.
 */
export function toRemoteError(error) {
  if (error?.isDSHRemoteError === true) return error
  const code = typeof error?.code === 'string' ? error.code : undefined
  const message = error instanceof Error ? error.message : String(error)
  return new RemoteError(OPERATION_FAILED, message, code === undefined ? {} : { code })
}

/**
 * The Remote service: a thin, gated adapter over the Host operations.
 */
export class SmartSessionTitleRemote extends TypertRemoteService {
  /**
   * @param ctx - Host context.
   * @param operations - preview/confirm/cancel/rename implementations.
   */
  constructor(ctx, operations) {
    super(ctx, NAMESPACE)
    this.operations = operations
  }

  /**
   * Preview an AI rename for one project without writing anything.
   * @param request - `{workspaceId}`.
   * @param signal - caller cancellation.
   * @returns preview rows.
   */
  async previewBatch(request, signal) {
    const peer = requireOwnerCall(this.ctx.invocation, 'previewBatch')
    signal?.throwIfAborted()
    try {
      return await this.operations.preview(peer, request.workspaceId, signal)
    } catch (error) {
      throw toRemoteError(error)
    }
  }

  /**
   * Apply the selected candidates of one preview.
   * @param request - `{previewId, sessionIds}` only.
   * @param signal - caller cancellation.
   * @returns per-session results.
   */
  async confirmBatch(request, signal) {
    const peer = requireOwnerCall(this.ctx.invocation, 'confirmBatch')
    signal?.throwIfAborted()
    try {
      return await this.operations.confirm(peer, request.previewId, request.sessionIds, signal)
    } catch (error) {
      throw toRemoteError(error)
    }
  }

  /**
   * Drop one preview.
   * @param request - `{previewId}`.
   * @param signal - caller cancellation.
   * @returns whether a preview was removed.
   */
  cancelBatch(request, signal) {
    const peer = requireOwnerCall(this.ctx.invocation, 'cancelBatch')
    signal?.throwIfAborted()
    try {
      return this.operations.cancel(peer, request.previewId)
    } catch (error) {
      throw toRemoteError(error)
    }
  }

  /**
   * Ask for one AI rename of an explicitly chosen Session.
   * @param request - `{sessionId}`.
   * @param signal - caller cancellation.
   * @returns the accepted title.
   */
  async renameSession(request, signal) {
    requireOwnerCall(this.ctx.invocation, 'renameSession')
    signal?.throwIfAborted()
    try {
      return await this.operations.rename(request.sessionId, signal)
    } catch (error) {
      throw toRemoteError(error)
    }
  }
}

/**
 * Register the Remote service and its Typert contribution.
 * @param ctx - Host context exposing `typert`.
 * @param operations - Host operations.
 * @returns the contribution disposer.
 */
export function registerRemote(ctx, operations) {
  new SmartSessionTitleRemote(ctx, operations)
  return ctx.typert.register({
    package: PACKAGE,
    face: 'host',
    schemas: [],
    model: { services: [], events: [], objects: [] },
    invocations: descriptors(),
  })
}
