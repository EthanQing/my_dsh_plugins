import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/**
 * Load the bundle patch through the runtime's own YAML parser, so a malformed
 * patch fails here instead of at DSH startup.
 * @returns the parsed patch document.
 */
async function readPatch() {
  // Anchor the YAML package at the runtime that ships it.
  const runtime = process.env.DSH_RUNTIME
  if (runtime === undefined) throw new Error('DSH_RUNTIME must point at the extracted runtime')
  const { createRequire } = await import('node:module')
  const { resolve } = await import('node:path')
  const { pathToFileURL } = await import('node:url')
  const require = createRequire(pathToFileURL(resolve(runtime, 'package.json')))
  const { default: YAML } = await import(pathToFileURL(require.resolve('js-yaml')).href)
  const source = await readFile(fileURLToPath(new URL('../cordis.patch.yml', import.meta.url)), 'utf8')
  return YAML.load(source)
}

test('the patch disables the built-in provider and inserts this plugin', async () => {
  const patch = await readPatch()
  assert.ok(Array.isArray(patch))
  const disableRow = patch.find(entry => entry.id === 'session-title-llm')
  assert.deepEqual(disableRow, { id: 'session-title-llm', disabled: true })
  const insert = patch.find(entry => Array.isArray(entry.insert))
  assert.ok(insert !== undefined, 'the patch must insert the plugin row')
  const row = insert.insert.find(entry => entry.id === 'dsh-smart-session-title')
  assert.equal(row.name, 'dsh-smart-session-title')
  assert.equal(row.disabled, undefined)
})

test('the patch never disables or replaces the title service row', async () => {
  const patch = await readPatch()
  const touched = patch.filter(entry => entry.id === 'session-title')
  assert.equal(touched.length, 0, 'the session-title service row must keep the bundle configuration')
  const serialized = JSON.stringify(patch)
  assert.ok(!serialized.includes('"disabled":true,"id":"session-title"'))
})

test('the inserted config restates every owned key with bounded values', async () => {
  const patch = await readPatch()
  const insert = patch.find(entry => Array.isArray(entry.insert))
  const row = insert.insert.find(entry => entry.id === 'dsh-smart-session-title')
  const config = row.config
  assert.equal(config.minIntervalMs, 30_000)
  assert.equal(config.mergeWindowMs, 2_000)
  assert.equal(config.concurrency, 2)
  assert.equal(config.turnTimeoutMs, 90_000)
  assert.equal(config.minAssistantChars, 40)
  assert.equal(config.batchLimit, 20)
  assert.equal(config.previewTtlMs, 600_000)
  assert.equal(config.maxInputBytes, 12_288)
  assert.equal(config.maxOutputTokens, 4_096)
  assert.equal(config.timeoutMs, 60_000)
  // No forced route: it comes from each Session's logged request header.
  assert.equal(config.provider, undefined)
  assert.equal(config.model, undefined)
})

test('locale resources declare the plugin metadata', async () => {
  for (const locale of ['zh', 'en']) {
    const json = JSON.parse(await readFile(fileURLToPath(new URL(`../locale/${locale}.json`, import.meta.url)), 'utf8'))
    assert.equal(typeof json.meta.title, 'string')
    assert.ok(json.meta.title.length > 0)
    assert.equal(typeof json.meta.description, 'string')
    assert.ok(json.meta.description.length > 0)
  }
})
