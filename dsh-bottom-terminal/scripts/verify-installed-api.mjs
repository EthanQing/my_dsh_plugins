// Optional compatibility probe against an extracted, byte-verified Desktop package tree.
// node scripts/verify-installed-api.mjs <dsh/node_modules/@deepseek-ai>
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'
const base = path.resolve(process.argv[2] || '')
if (!process.argv[2]) throw Error('Pass the verified Desktop @deepseek-ai package directory')
const cordis = await import(pathToFileURL(path.join(base, 'cordis/lib/index.js')).href)
const values = new Map()
const localStorage = { get length() { return values.size }, key: i => [...values.keys()][i] ?? null, getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
const createSnapshotStore = initial => {
  let value = initial
  const listeners = new Set()
  return { getSnapshot: () => value, set: next => { value = next; for (const listener of listeners) listener() }, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) } }
}
let registration
vm.runInNewContext(await readFile(path.join(base, 'dsh-api-terminal-controller/lib/client.js'), 'utf8'), { window: { __ModuleLoader__: { load: entry => { registration = entry } } }, localStorage, console, AbortController, Promise, crypto: globalThis.crypto })
const { ClientTerminals } = registration.factory(name => {
  if (name === '@deepseek-ai/cordis') return cordis
  if (name === '@deepseek-ai/dsh-client-store') return { createSnapshotStore }
  if (name === '@deepseek-ai/dsh-api-gateway/client') return {}
  throw Error(`Unexpected runtime dependency ${name}`)
})
const streams = []
const remote = { $stream: () => {
  let resolve
  const done = new Promise(r => { resolve = r })
  const stream = { disposed: false, async *[Symbol.asyncIterator]() { await done }, async dispose() { this.disposed = true; resolve() } }
  streams.push(stream)
  return stream
} }
const closed = []
const terminal = { close: async (session, id) => { closed.push([session, id]); return { ok: true, value: undefined } } }
const ctx = new cordis.Context()
ctx.provide('connection', { generation: createSnapshotStore(1) })
ctx.provide('remote', remote)
const native = new ClientTerminals(ctx, terminal)
const local = ctx.isolate('webTerminals')
const bottom = new ClientTerminals(local, terminal)
// Cordis returns context-bound service proxies, not the constructor's raw object.
assert.equal(ctx.webTerminals.closeFailures.getSnapshot(), native.closeFailures.getSnapshot())
assert.equal(local.webTerminals.closeFailures.getSnapshot(), bottom.closeFailures.getSnapshot())
assert.notEqual(ctx.webTerminals.closeFailures.getSnapshot(), local.webTerminals.closeFailures.getSnapshot())
for (const [content, id] of [['native-content', 'native-terminal'], ['bottom-content', 'bottom-terminal']]) localStorage.setItem('dsh.terminal.binding.v1.' + JSON.stringify(['session', content]), JSON.stringify(id))
native.retainTabs([{ sessionId: 'session', tabId: 'native-tab', contentId: 'native-content' }])
bottom.retainTabs([{ sessionId: 'session', tabId: 'bottom-tab', contentId: 'bottom-content' }])
assert.equal(streams.length, 2)
bottom.retainTabs([])
assert.equal(streams[0].disposed, false)
assert.equal(streams[1].disposed, true)
assert.equal(closed.length, 0)
bottom.retainTabs([{ sessionId: 'session', tabId: 'bottom-tab', contentId: 'bottom-content' }])
bottom.close('session', 'bottom-tab', 'bottom-content', 'bottom-terminal')
await Promise.resolve()
await Promise.resolve()
assert.equal(closed.length, 1)
assert.deepEqual(closed[0], ['session', 'bottom-terminal'])
assert.equal(streams[0].disposed, false)
native.retainTabs([])
await ctx.fiber.dispose()
assert.equal(streams.every(stream => stream.disposed), true)
assert.equal(closed.length, 1, 'model disposal must not close other terminals')
console.log('Actual Cordis + ClientTerminals: isolated services, independent holds, targeted close and detach-only disposal verified.')
