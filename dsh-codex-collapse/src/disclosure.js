const DEFAULT = Object.freeze({ expanded: false, choice: null, phase: null })
const KEY = 'dsh-codex-collapse:v1:choices'

export function createDisclosures(storage, limit = 300) {
  let saved = []
  try {
    const parsed = JSON.parse(storage?.getItem(KEY) ?? '[]')
    if (Array.isArray(parsed)) saved = parsed.filter(item => Array.isArray(item) && typeof item[0] === 'string' && typeof item[1] === 'boolean').slice(-limit)
  } catch { /* unavailable storage remains memory-only */ }
  const choices = new Map(saved)
  const entries = new Map()
  const listeners = new Map()
  function get(key) {
    if (!entries.has(key)) entries.set(key, choices.has(key) ? { ...DEFAULT, expanded: choices.get(key), choice: choices.get(key) } : DEFAULT)
    // Evict only inactive entries; mounted source snapshots stay identity-stable.
    if (entries.size > limit) {
      for (const oldest of entries.keys()) {
        if (oldest !== key && !listeners.has(oldest)) entries.delete(oldest)
        if (entries.size <= limit) break
      }
    }
    return entries.get(key)
  }
  function publish(key, next) {
    entries.set(key, Object.freeze(next))
    for (const notify of listeners.get(key) ?? []) notify()
  }
  return {
    get,
    observe(key, phase) {
      const previous = get(key)
      if (previous.phase === phase) return
      // Completion is observed once, not on every token or render. Explicit
      // choices win even over completion, so reading an expanded log is stable.
      publish(key, { ...previous, phase, expanded: previous.choice ?? false })
    },
    toggle(key) {
      const previous = get(key)
      const expanded = !previous.expanded
      choices.delete(key)
      choices.set(key, expanded)
      while (choices.size > limit) choices.delete(choices.keys().next().value)
      try { storage?.setItem(KEY, JSON.stringify([...choices])) } catch { /* memory-only */ }
      publish(key, { ...previous, expanded, choice: expanded })
    },
    subscribe(key, notify) {
      if (!listeners.has(key)) listeners.set(key, new Set())
      listeners.get(key).add(notify)
      return () => {
        const set = listeners.get(key)
        set?.delete(notify)
        if (set?.size === 0) listeners.delete(key)
      }
    },
    clear() { entries.clear(); listeners.clear(); choices.clear() },
  }
}
