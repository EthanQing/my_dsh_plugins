/**
 * Cancellable throttling and concurrency control for title generation.
 *
 * Three independent rules are enforced per Session:
 * - one generation per Session at a time, with a minimum interval between
 *   two accepted generations (default 30 s);
 * - a short merge window (default 2 s) so a burst of user messages produces
 *   one model call, and the newest request supersedes the queued one;
 * - one global concurrency limit (default 2), shared by every Session.
 *
 * Every waiter is abortable: a cancelled caller leaves no timer behind, and
 * disposal rejects all outstanding waiters.
 */

/** Default minimum spacing between two generations for one Session. */
export const DEFAULT_MIN_INTERVAL_MS = 30_000
/** Default merge window before a scheduled generation runs. */
export const DEFAULT_MERGE_WINDOW_MS = 2_000
/** Default number of generations allowed to run at once. */
export const DEFAULT_CONCURRENCY = 2

/** Thrown when a waiter is cancelled by its caller, by a newer request, or by disposal. */
export class TitleCancelledError extends Error {
  constructor(message = 'title generation was cancelled') {
    super(message)
    this.name = 'TitleCancelledError'
  }
}

/**
 * A counting semaphore whose acquire is abortable.
 */
export class Semaphore {
  #limit
  #active = 0
  #waiters = []
  #closed = false

  constructor(limit) {
    if (!Number.isInteger(limit) || limit < 1) throw new Error('concurrency limit must be a positive integer')
    this.#limit = limit
  }

  get active() {
    return this.#active
  }

  /**
   * Reserve one slot.
   * @param signal - optional cancellation for the waiter.
   * @returns a release function; calling it more than once is harmless.
   */
  async acquire(signal) {
    if (this.#closed) throw new TitleCancelledError('title scheduler was disposed')
    signal?.throwIfAborted()
    if (this.#active < this.#limit) {
      this.#active += 1
      return this.#releaseOnce()
    }
    const waiter = { resolve: undefined, reject: undefined, signal, onAbort: undefined }
    const pending = new Promise((resolve, reject) => {
      waiter.resolve = resolve
      waiter.reject = reject
    })
    waiter.onAbort = () => {
      const index = this.#waiters.indexOf(waiter)
      if (index >= 0) this.#waiters.splice(index, 1)
      waiter.reject(new TitleCancelledError('title generation was cancelled while queued'))
    }
    signal?.addEventListener('abort', waiter.onAbort, { once: true })
    this.#waiters.push(waiter)
    try {
      await pending
    } finally {
      signal?.removeEventListener('abort', waiter.onAbort)
    }
    return this.#releaseOnce()
  }

  #releaseOnce() {
    let released = false
    return () => {
      if (released) return
      released = true
      this.#release()
    }
  }

  #release() {
    if (this.#closed) return
    const next = this.#waiters.shift()
    if (next !== undefined) {
      next.signal?.removeEventListener('abort', next.onAbort)
      next.resolve()
      return
    }
    this.#active = Math.max(0, this.#active - 1)
  }

  /**
   * Reject every waiter and refuse later acquisitions.
   * @param reason - cancellation reason for outstanding waiters.
   */
  close(reason = 'title scheduler was disposed') {
    if (this.#closed) return
    this.#closed = true
    for (const waiter of this.#waiters.splice(0)) {
      waiter.signal?.removeEventListener('abort', waiter.onAbort)
      waiter.reject(new TitleCancelledError(reason))
    }
    this.#active = 0
  }
}

/**
 * Abortable sleep.
 * @param ms - delay in milliseconds.
 * @param signal - optional cancellation.
 */
export function delay(ms, signal) {
  signal?.throwIfAborted()
  if (ms <= 0) {
    signal?.throwIfAborted()
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new TitleCancelledError('title generation was cancelled while waiting'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Per-Session throttling plus a global concurrency limit.
 *
 * A caller reserves its place by calling {@link TitleGate.run}: the gate waits
 * for the merge window, enforces the minimum interval and the global limit,
 * then runs the task. A newer reservation for the same Session cancels the
 * older one, so only the newest content is sent to the model.
 */
export class TitleGate {
  #minIntervalMs
  #mergeWindowMs
  #semaphore
  #states = new Map()
  #closed = false

  /**
   * @param options - interval, merge window, and concurrency.
   */
  constructor(options = {}) {
    this.#minIntervalMs = options.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS
    this.#mergeWindowMs = options.mergeWindowMs ?? DEFAULT_MERGE_WINDOW_MS
    if (!Number.isInteger(this.#minIntervalMs) || this.#minIntervalMs < 0) throw new Error('minIntervalMs must be a non-negative integer')
    if (!Number.isInteger(this.#mergeWindowMs) || this.#mergeWindowMs < 0) throw new Error('mergeWindowMs must be a non-negative integer')
    this.#semaphore = new Semaphore(options.concurrency ?? DEFAULT_CONCURRENCY)
  }

  get running() {
    return this.#semaphore.active
  }

  /**
   * Run one throttled task.
   * @param key - Session identity the interval belongs to.
   * @param task - the generation work; receives the caller's signal.
   * @param options - caller cancellation and an optional skip of the merge window.
   * @returns the task's result.
   */
  async run(key, task, options = {}) {
    if (this.#closed) throw new TitleCancelledError('title scheduler was disposed')
    const signal = options.signal
    signal?.throwIfAborted()
    const superseded = new AbortController()
    const previous = this.#states.get(key)?.pending
    if (previous !== undefined) previous.abort(new TitleCancelledError('a newer title request superseded this one'))
    const now = Date.now()
    const state = this.#states.get(key) ?? { lastStartedAt: 0, chain: Promise.resolve(), pending: undefined }
    state.pending = superseded
    this.#states.set(key, state)
    const combined = signal === undefined ? superseded.signal : AbortSignal.any([signal, superseded.signal])
    const wait = Math.max(0, state.lastStartedAt + this.#minIntervalMs - now)
    const releaseChain = await this.#enqueue(state)
    try {
      if (wait > 0) await delay(wait, combined)
      if (options.merge !== false) await delay(this.#mergeWindowMs, combined)
      combined.throwIfAborted()
      const release = await this.#semaphore.acquire(combined)
      try {
        combined.throwIfAborted()
        state.lastStartedAt = Date.now()
        return await task(combined)
      } finally {
        release()
      }
    } finally {
      if (state.pending === superseded) delete state.pending
      releaseChain()
    }
  }

  async #enqueue(state) {
    const previous = state.chain
    let release
    state.chain = new Promise(resolve => { release = resolve })
    await previous
    return release
  }

  /**
   * Reject every outstanding wait and forget per-Session state.
   */
  close() {
    if (this.#closed) return
    this.#closed = true
    for (const state of this.#states.values()) {
      state.pending?.abort(new TitleCancelledError('title scheduler was disposed'))
    }
    this.#states.clear()
    this.#semaphore.close()
  }
}
