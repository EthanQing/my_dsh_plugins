import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

test('browser bundle registers one native turn-process replacement and never changes view mode on load', async () => {
  const path = new URL('../lib/client.js', import.meta.url)
  let factory
  vm.runInNewContext(await readFile(path, 'utf8'), {
    window: { __ModuleLoader__: { load: value => { assert.equal(value.id, 'dsh-codex-collapse'); factory = value.factory } } },
  })
  const imports = []
  const plugin = factory(name => { imports.push(name); return { memo: value => value, Component: class {} } })
  const registrations = []
  const cleanups = []
  let modeChanges = 0
  const original = { component() {}, options: { key: 'turn-process', priority: 0 }, locale: 'chat' }
  const ctx = {
    locale: { register: () => () => {} },
    effect(fn) { cleanups.push(fn()) },
    slots: {
      entries(name) {
        return name === 'conversation.chat.node' ? [original] : [{ options: { id: 'transcript-view' }, inject: () => ({ setTranscriptView: () => modeChanges++ }) }]
      },
      inject(name, callback) { assert.equal(name, 'conversation.chat.node'); cleanups.push(callback()) },
      register(options) { registrations.push(options); return () => {} },
    },
  }
  plugin.apply(ctx)
  assert.deepEqual(imports, ['react'])
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].key, 'turn-process')
  assert.equal(registrations[0].priority, -10)
  assert.equal(modeChanges, 0)
  for (const cleanup of cleanups.reverse()) cleanup?.()
})
