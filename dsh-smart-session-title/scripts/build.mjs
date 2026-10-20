#!/usr/bin/env node
/**
 * Build `lib/` from `src/`.
 *
 * The Host half is plain ESM and ships as `lib/index.js` plus its local
 * modules, so the build copies each source file verbatim. The Client half is a
 * browser module factory; it is copied to `lib/client.js` unchanged because it
 * is authored in that format at a version of this module that does not exist
 * yet, and the copy is verified to open with the expected loader call.
 *
 * Usage: node scripts/build.mjs
 */
import { spawnSync } from 'node:child_process'
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(new URL('.', import.meta.url)))
const src = join(root, 'src')
const lib = join(root, 'lib')

/** Host ESM modules copied into `lib/`, in dependency order. */
const HOST_MODULES = ['title.js', 'limits.js', 'validate.js', 'generate.js', 'operations.js', 'remote.js', 'index.js']
/** The browser module factory. */
const CLIENT_MODULE = 'client.js'
/** Locale resources validated by the build and shipped beside the bundles. */
const LOCALES = ['zh.json', 'en.json']

/**
 * Fail the build with one clear message.
 * @param message - what is wrong.
 */
function fail(message) {
  throw new Error(`build: ${message}`)
}

/**
 * Syntax-check one file with this Node executable.
 * @param file - absolute path to check.
 */
function checkSyntax(file) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (result.status !== 0) fail(`${file} does not parse: ${result.stderr.trim()}`)
}

/**
 * Copy one source file into `lib/` and verify the copy.
 * @param relative - file name inside `src/`.
 * @param options - whether the file is the browser bundle.
 * @returns the written relative path.
 */
async function copyModule(relative, options = {}) {
  const source = await readFile(join(src, relative), 'utf8')
  if (options.client === true) {
    if (!source.startsWith('window.__ModuleLoader__.load({')) {
      fail(`src/${relative} must open with window.__ModuleLoader__.load({ ... })`)
    }
    if (!/id:\s*'dsh-smart-session-title'/.test(source)) fail(`src/${relative} must register the package id`)
    if (!/return \{ inject:/.test(source)) fail(`src/${relative} must export its injection list`)
  }
  const target = join(lib, relative)
  await writeFile(target, source, 'utf8')
  checkSyntax(target)
  return relative
}

async function main() {
  const entries = new Set(await readdir(src))
  for (const module of HOST_MODULES) {
    if (!entries.has(module)) fail(`src/${module} is missing`)
  }
  if (!entries.has(CLIENT_MODULE)) fail(`src/${CLIENT_MODULE} is missing`)

  await rm(lib, { recursive: true, force: true })
  await mkdir(lib, { recursive: true })

  const written = []
  for (const module of HOST_MODULES) written.push(await copyModule(module))
  written.push(await copyModule(CLIENT_MODULE, { client: true }))

  for (const locale of LOCALES) {
    const json = JSON.parse(await readFile(join(root, 'locale', locale), 'utf8'))
    if (typeof json?.meta?.title !== 'string' || json.meta.title.length === 0) {
      fail(`locale/${locale} must declare meta.title`)
    }
    if (typeof json?.meta?.description !== 'string' || json.meta.description.length === 0) {
      fail(`locale/${locale} must declare meta.description`)
    }
  }

  const host = await readFile(join(lib, 'index.js'), 'utf8')
  if (!/export function apply\b/.test(host)) fail('lib/index.js does not export apply()')
  if (!/export const name\b/.test(host)) fail('lib/index.js does not export name')

  // A Host module may import only relative files, Node builtins, and packages
  // the DSH installation supplies to profile plugins (@deepseek-ai/*). Anything
  // else would resolve in this repository but fail inside a real profile.
  for (const module of HOST_MODULES) {
    const text = await readFile(join(lib, module), 'utf8')
    for (const match of text.matchAll(/from\s+['"]([^'"]+)['"]/gu)) {
      const specifier = match[1]
      if (specifier.startsWith('.') || specifier.startsWith('node:') || specifier.startsWith('@deepseek-ai/')) continue
      fail(`lib/${module} imports "${specifier}", which a profile plugin cannot resolve`)
    }
  }

  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  for (const value of Object.values(manifest.exports)) {
    const target = typeof value === 'string' ? value : value.default
    if (typeof target !== 'string' || !target.startsWith('./lib/')) continue
    if (!written.includes(target.slice('./lib/'.length))) fail(`exports target ${target} was not built`)
  }

  process.stdout.write(`built ${String(written.length)} files into ${lib}\n`)
  for (const file of written) process.stdout.write(`  lib/${file}\n`)
}

await main()
