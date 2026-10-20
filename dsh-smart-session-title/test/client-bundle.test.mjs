import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/**
 * Materialize the browser bundle through its real loader contract, with a
 * minimal React stand-in and the runtime's own Zod. This validates the
 * factory, its exports, and its registration helpers without a DOM: `apply()`
 * is deliberately not run, so no browser surface is exercised here.
 * @returns the materialized exports.
 */
async function loadBundle() {
  const source = await readFile(fileURLToPath(new URL('../src/client.js', import.meta.url)), 'utf8')
  let registration
  const React = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    Fragment: Symbol('Fragment'),
    useState: value => [value, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
    useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
  }
  const { z } = await import('zod')
  const sandbox = {
    __ModuleLoader__: {
      load: entry => {
        registration = entry
      },
    },
  }
  const previous = globalThis.window
  globalThis.window = sandbox
  try {
    // The bundle is a classic script that only registers its factory here.
    new Function(source)()
  } finally {
    if (previous === undefined) delete globalThis.window
    else globalThis.window = previous
  }
  assert.equal(registration.id, 'dsh-smart-session-title')
  const exports = registration.factory(specifier => {
    if (specifier === 'react') return React
    if (specifier === 'zod') return { z }
    throw new Error(`unexpected require(${specifier})`)
  })
  return exports
}

test('the client bundle registers its id and exports inject/apply', async () => {
  const exports = await loadBundle()
  assert.equal(typeof exports.apply, 'function')
  assert.ok(Array.isArray(exports.inject))
  for (const service of ['slots', 'locale', 'workspaces']) {
    assert.ok(exports.inject.includes(service), `client must inject ${service}`)
  }
})

test('the client bundle resolves the Remote face without blocking on it', async () => {
  const source = await readFile(fileURLToPath(new URL('../src/client.js', import.meta.url)), 'utf8')
  // The UI must load even when no Gateway is mounted, so `remote` is acquired
  // through an injection fiber instead of a hard dependency.
  assert.doesNotMatch(source, /inject: \[[^\]]*'remote'/)
  assert.match(source, /ctx\.inject\(\['remote'\]/)
})

test('the client bundle touches no DOM at registration time', async () => {
  // A missing `document` proves the factory body stays inert until apply().
  assert.equal(typeof globalThis.document, 'undefined')
  await loadBundle()
})

test('the client namespace target matches the Host manifest', async () => {
  const source = await readFile(fileURLToPath(new URL('../src/client.js', import.meta.url)), 'utf8')
  assert.match(source, /const NAMESPACE = 'smartSessionTitle'/)
  assert.match(source, /const PACKAGE = 'dsh-smart-session-title'/)
  const manifest = JSON.parse(await readFile(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'))
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert.equal(manifest.dsh.client.immediately, true)
  for (const dependency of [
    '@deepseek-ai/dsh-api-gateway',
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-ui-renderer',
    '@deepseek-ai/dsh-client-ui-session',
    '@deepseek-ai/dsh-client-ui-workspace',
  ]) {
    assert.ok(manifest.dsh.client.inject.includes(dependency), `dsh.client.inject must list ${dependency}`)
  }
  assert.equal(manifest.exports['./client'].default, './lib/client.js')
  assert.equal(manifest.exports['./icon'], './icon.svg')
})
