export const STORAGE_KEY = 'dsh-bottom-terminal.layout.v1'
export const DEFAULT_HEIGHT = 240
export const clampHeight = height => Math.min(10000, Math.max(120, Number.isFinite(height) ? height : DEFAULT_HEIGHT))
export function dockBounds(availableHeight, composerHeight = 0) {
  const available = Math.max(0, Number.isFinite(availableHeight) ? availableHeight : 0)
  const composer = Math.max(0, Number.isFinite(composerHeight) ? composerHeight : 0)
  const max = Math.min(available, Math.max(36, available - Math.max(180, composer)))
  return { min: Math.min(120, max), max, maximized: Math.max(0, available - Math.max(48, composer)) }
}

export function restoreState(value) {
  const initial = { version: 1, visible: false, collapsed: false, maximized: false, height: DEFAULT_HEIGHT, sessions: {} }
  if (!value || value.version !== 1) return initial
  const sessions = {}
  const contentIds = new Set()
  for (const [sessionId, session] of Object.entries(value.sessions || {})) {
    if (!sessionId || ['__proto__', 'constructor', 'prototype'].includes(sessionId) || !session || !Array.isArray(session.tabs)) continue
    const ids = new Set()
    const tabs = session.tabs.filter(tab => {
      if (!tab || typeof tab.id !== 'string' || !tab.id || typeof tab.contentId !== 'string' || !tab.contentId || ids.has(tab.id) || contentIds.has(tab.contentId)) return false
      ids.add(tab.id); contentIds.add(tab.contentId)
      return true
    }).map(tab => ({ id: tab.id, contentId: tab.contentId, ...(typeof tab.shellPath === 'string' ? { shellPath: tab.shellPath } : {}) }))
    if (tabs.length) sessions[sessionId] = { tabs, activeId: tabs.some(tab => tab.id === session.activeId) ? session.activeId : tabs[0].id }
  }
  return { ...initial, visible: value.visible === true, collapsed: value.collapsed === true, maximized: value.maximized === true, height: clampHeight(value.height), sessions }
}

export function retainedTabs(state) {
  return Object.entries(state.sessions).flatMap(([sessionId, session]) => session.tabs.map(tab => ({ kind: 'terminal', sessionId, tabId: tab.id, contentId: tab.contentId })))
}

export function createDockState({ storage, uuid = () => globalThis.crypto.randomUUID(), onStorageError = () => {} } = {}) {
  let snapshot
  try { snapshot = restoreState(JSON.parse(storage?.getItem(STORAGE_KEY) || 'null')) } catch { snapshot = restoreState() }
  const listeners = new Set()
  const update = next => {
    snapshot = next
    try { storage?.setItem(STORAGE_KEY, JSON.stringify(snapshot)) } catch (error) { onStorageError(error) }
    for (const listener of listeners) listener()
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    add(sessionId, shellPath) {
      if (typeof sessionId !== 'string' || !sessionId || ['__proto__', 'constructor', 'prototype'].includes(sessionId)) throw new Error('请先选择会话')
      const tab = { id: `bottom-${uuid()}`, contentId: `bottom-terminal:${uuid()}`, ...(shellPath ? { shellPath } : {}) }
      const session = snapshot.sessions[sessionId] || { tabs: [] }
      update({ ...snapshot, visible: true, collapsed: false, sessions: { ...snapshot.sessions, [sessionId]: { tabs: [...session.tabs, tab], activeId: tab.id } } })
      return tab
    },
    select(sessionId, tabId) {
      const session = snapshot.sessions[sessionId]
      if (!session?.tabs.some(tab => tab.id === tabId)) return
      update({ ...snapshot, visible: true, collapsed: false, sessions: { ...snapshot.sessions, [sessionId]: { ...session, activeId: tabId } } })
    },
    remove(sessionId, tabId) {
      const session = snapshot.sessions[sessionId]
      if (!session?.tabs.some(tab => tab.id === tabId)) return
      const tabs = session.tabs.filter(tab => tab.id !== tabId)
      const sessions = { ...snapshot.sessions }
      if (tabs.length) sessions[sessionId] = { tabs, activeId: session.activeId === tabId ? tabs.at(-1).id : session.activeId }
      else delete sessions[sessionId]
      update({ ...snapshot, sessions })
    },
    show() { update({ ...snapshot, visible: true, collapsed: false }) },
    hide() { update({ ...snapshot, visible: false }) },
    collapse() { update({ ...snapshot, collapsed: !snapshot.collapsed }) },
    maximize() { update({ ...snapshot, maximized: !snapshot.maximized, collapsed: false }) },
    resize(height) { update({ ...snapshot, height: clampHeight(height), maximized: false }) },
    dispose() { listeners.clear() },
  }
}
