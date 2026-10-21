import test from 'node:test'
import assert from 'node:assert/strict'
import { createDockState, restoreState, retainedTabs, STORAGE_KEY } from '../src/state.js'

function setup() {
  const values = new Map()
  let count = 0
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }
  return { values, storage, store: createDockState({ storage, uuid: () => String(++count) }) }
}

test('all sessions retain independent terminal identities through hide, collapse and resize', () => {
  const { store } = setup()
  const a = store.add('session-a', '/bin/bash')
  const b = store.add('session-b', '/bin/nu')
  const expected = [
    { kind: 'terminal', sessionId: 'session-a', tabId: a.id, contentId: a.contentId },
    { kind: 'terminal', sessionId: 'session-b', tabId: b.id, contentId: b.contentId },
  ]
  store.select('session-a', a.id)
  store.hide(); store.collapse(); store.resize(500); store.maximize()
  assert.deepEqual(retainedTabs(store.getSnapshot()), expected)
  assert.equal(store.getSnapshot().visible, false)
  assert.equal(store.getSnapshot().sessions['session-b'].tabs[0].shellPath, '/bin/nu')
})

test('reload restores every session, active tab, shell choice and dock geometry', () => {
  const { store, storage, values } = setup()
  const a = store.add('a', '/bin/bash')
  const b = store.add('a', '/bin/nu')
  store.add('b', '/bin/sh')
  store.select('a', a.id)
  store.resize(430); store.collapse()
  const restored = createDockState({ storage })
  assert.deepEqual(restored.getSnapshot(), store.getSnapshot())
  assert.equal(restored.getSnapshot().sessions.a.activeId, a.id)
  assert.notEqual(a.contentId, b.contentId)
  assert.equal(JSON.parse(values.get(STORAGE_KEY)).sessions.b.tabs.length, 1)
})

test('explicit remove only releases the selected occurrence and preserves other sessions', () => {
  const { store } = setup()
  const first = store.add('a')
  const second = store.add('a')
  const other = store.add('b')
  store.remove('a', second.id)
  assert.equal(store.getSnapshot().sessions.a.activeId, first.id)
  assert.equal(retainedTabs(store.getSnapshot()).length, 2)
  store.remove('a', first.id)
  assert.equal(store.getSnapshot().sessions.a, undefined)
  assert.deepEqual(retainedTabs(store.getSnapshot()).map(tab => tab.contentId), [other.contentId])
})

test('damaged state is sanitized without duplicated process content identities', () => {
  const state = restoreState({ version: 1, height: 100000, visible: 'yes', sessions: {
    a: { activeId: 'missing', tabs: [null, {}, { id: '1', contentId: 'x' }, { id: '1', contentId: 'y' }] },
    b: { tabs: [{ id: '2', contentId: 'x' }, { id: '3', contentId: 'z', shellPath: 42 }] },
    bad: { tabs: null },
  } })
  assert.equal(state.visible, false)
  assert.equal(state.height, 10000)
  assert.equal(state.sessions.a.activeId, '1')
  assert.deepEqual(retainedTabs(state).map(tab => tab.contentId), ['x', 'z'])
  assert.equal(state.sessions.b.tabs[0].shellPath, undefined)
  assert.equal(restoreState({ version: 500 }).height, 240)
})

test('unavailable or corrupted browser storage does not prevent an in-memory terminal', () => {
  let notified = 0
  const store = createDockState({ storage: { getItem: () => '{bad', setItem: () => { throw Error('quota') } }, uuid: () => 'id', onStorageError: () => notified++ })
  store.add('a')
  assert.equal(retainedTabs(store.getSnapshot()).length, 1)
  assert.equal(notified, 1)
})

test('invalid selection does not change another session or publish a new snapshot', () => {
  const { store } = setup()
  const tab = store.add('a')
  let calls = 0
  const off = store.subscribe(() => calls++)
  const before = store.getSnapshot()
  store.select('b', tab.id)
  store.remove('a', 'missing')
  assert.equal(store.getSnapshot(), before)
  assert.equal(calls, 0)
  assert.throws(() => store.add(undefined), /会话/)
  assert.throws(() => store.add('__proto__'), /会话/)
  store.hide()
  assert.equal(calls, 1)
  off(); store.show()
  assert.equal(calls, 1)
})
