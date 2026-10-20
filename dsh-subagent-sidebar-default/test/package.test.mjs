import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

test('browser factory has no eager DOM side effects or third-party plugin dependency', async () => {
  let module
  vm.runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load(value) { module = value } } },
  }, { timeout: 1000 })
  assert.equal(module.id, 'dsh-subagent-sidebar-default')
  const requires = []
  // This checks the factory only; it does not render or emulate a React view.
  const plugin = module.factory(name => { requires.push(name); return {} })
  assert.deepEqual(requires, ['react', 'react/jsx-runtime'])
  assert.equal(typeof plugin.apply, 'function')
  assert.deepEqual(Array.from(plugin.inject), ['sessions', 'slots', 'locale'])
})
