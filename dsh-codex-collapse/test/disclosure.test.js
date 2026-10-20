import test from 'node:test'
import assert from 'node:assert/strict'
import { createDisclosures } from '../src/disclosure.js'

test('running and historical turns start compact; repeated stream observations do not reset or notify', () => {
  const store = createDisclosures()
  let updates = 0
  const off = store.subscribe('s1:turn1', () => updates++)
  assert.equal(store.get('s1:turn1').expanded, false)
  store.observe('s1:turn1', 'running')
  store.observe('s1:turn1', 'running')
  assert.equal(updates, 1)
  store.observe('s1:turn1', 'completed')
  store.observe('s1:turn1', 'completed')
  assert.equal(updates, 2)
  assert.equal(store.get('s1:turn1').expanded, false)
  assert.equal(store.get('s1:history').expanded, false)
  off()
})

test('explicit expansion survives streaming, completion, re-mount and session changes', () => {
  let saved = null
  const storage = { getItem: () => saved, setItem: (key, value) => { saved = value } }
  const store = createDisclosures(storage)
  store.observe('s1:1', 'running')
  store.toggle('s1:1')
  store.observe('s1:1', 'running')
  store.observe('s1:1', 'completed')
  assert.equal(store.get('s1:1').expanded, true)
  assert.equal(store.get('s2:1').expanded, false)
  const restored = createDisclosures(storage)
  assert.equal(restored.get('s1:1').expanded, true)
  restored.toggle('s1:1')
  restored.observe('s1:1', 'completed')
  assert.equal(restored.get('s1:1').expanded, false)
})

test('malformed/denied storage fails safely and inactive cache entries are bounded', () => {
  const store = createDisclosures({ getItem: () => '{bad', setItem: () => { throw new Error('denied') } }, 2)
  assert.equal(store.get('first').expanded, false)
  store.toggle('first')
  store.observe('second', 'running')
  store.observe('third', 'running')
  assert.equal(store.get('first').expanded, true)
  store.clear()
  assert.equal(store.get('first').expanded, false)
})
