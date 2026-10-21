import test from 'node:test'
import assert from 'node:assert/strict'
import { createShellPreferences, SHELL_PREFERENCE_KEY } from '../src/shell.js'
import { createDockState, dockBounds } from '../src/state.js'
const shells = [{ name: 'cmd', path: 'C:/Windows/cmd.exe' }, { name: 'pwsh', path: 'C:/pwsh.exe' }, { name: 'nu', path: 'C:/nu.exe' }, { name: 'Git Bash', path: 'C:/Git/bash.exe' }]
function fixture(initial) {
  const data = new Map(initial ? [[SHELL_PREFERENCE_KEY, initial]] : [])
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) }
  const native = { launchShells: async () => ({ shells, selectedShell: 'C:/pwsh.exe' }), selectShell: () => assert.fail('Native shell preference must remain unchanged') }
  return { storage, native, prefs: createShellPreferences(native, storage), data }
}
test('first use chooses discovered NuShell, orders menu, and does not alter native storage', async () => {
  const { prefs, data } = fixture()
  const choices = await prefs.launchShells('a')
  assert.equal(choices.selectedShell, 'C:/nu.exe')
  assert.deepEqual(choices.shells.map(shell => shell.name), ['nu', 'pwsh', 'Git Bash', 'cmd'])
  assert.equal(data.size, 0)
})
test('explicit preference persists independently and wins over available NuShell on reload', async () => {
  const { prefs, storage, native, data } = fixture()
  prefs.selectShell('C:/Git/bash.exe')
  assert.equal((await createShellPreferences(native, storage).launchShells('b')).selectedShell, 'C:/Git/bash.exe')
  assert.deepEqual([...data.keys()], [SHELL_PREFERENCE_KEY])
})
test('missing remembered shell falls back only to a Host-approved candidate', async () => {
  const { prefs } = fixture('C:/removed.exe')
  assert.equal((await prefs.launchShells('a')).selectedShell, 'C:/nu.exe')
  const noNu = createShellPreferences({ launchShells: async () => ({ shells: shells.filter(shell => shell.name !== 'nu'), selectedShell: 'C:/pwsh.exe' }) })
  const choices = await noNu.launchShells('a')
  assert.equal(choices.selectedShell, 'C:/pwsh.exe')
  assert(!choices.shells.some(shell => shell.name === 'nu'))
})
test('layout uses parent height, preserves resize preference through maximize, and tolerates tiny parents', () => {
  assert.deepEqual(dockBounds(700), { min: 120, max: 520, maximized: 652 })
  assert.deepEqual(dockBounds(700, 200), { min: 120, max: 500, maximized: 500 })
  assert.deepEqual(dockBounds(120), { min: 36, max: 36, maximized: 72 })
  assert.deepEqual(dockBounds(0), { min: 0, max: 0, maximized: 0 })
  const state = createDockState()
  state.resize(350); state.maximize(); state.maximize()
  assert.equal(state.getSnapshot().height, 350)
  assert.equal(state.getSnapshot().maximized, false)
})
