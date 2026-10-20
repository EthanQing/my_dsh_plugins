import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const { transform, build } = await import(process.env.DSH_ESBUILD_MODULE || 'esbuild')
const check = process.argv.includes('--check')
// Preserve upstream's single factory scope. Its modules intentionally share
// ambient React/jsx/session bindings; treating them as normal independent ESM
// modules would create a different runtime. esbuild erases the TypeScript.
const modules = ['types', 'styles', 'bootstrap', 'format', 'runtime', 'retain',
  'live-output', 'detail', 'markdown', 'live-events', 'active-float', 'navigation',
  'deletion', 'manager', 'i18n', 'prompt-view', 'apply']
const sources = await Promise.all(modules.map(async name => {
  const source = await readFile(path.join(root, 'src/client', `${name}.ts`), 'utf8')
  return source.split('\n').filter(line => !/^import\s.*\sfrom\s*['"]\./.test(line.trim()))
    .map(line => line.replace(/^export /, '')).join('\n')
}))
const browser = await transform(`window.__ModuleLoader__.load({
  id: 'dsh-subagent-sidebar-default',
  factory: require => {
    const React = require('react')
    const { jsx, jsxs } = require('react/jsx-runtime')
    ${sources.join('\n')}
    return { inject: ['sessions', 'slots', 'locale'], apply }
  }
})`, { loader: 'ts', target: 'chrome120', charset: 'utf8' })
const host = await build({ absWorkingDir: root, entryPoints: ['src/index.js'],
  bundle: true, format: 'esm', platform: 'node', target: 'node24', write: false,
  outfile: 'lib/index.js', charset: 'utf8' })
await mkdir(path.join(root, 'lib'), { recursive: true })
for (const [name, text] of [['client.js', browser.code], ['index.js', host.outputFiles[0].text]]) {
  const content = '// Generated from src/; see THIRD_PARTY_NOTICES.md for MIT attribution.\n' + text
  const file = path.join(root, 'lib', name)
  if (check) {
    if ((await readFile(file, 'utf8')).replace(/\r\n/g, '\n') !== content.replace(/\r\n/g, '\n')) {
      throw new Error(`${name} is stale; run npm run build`)
    }
  } else await writeFile(file, content)
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
  if (result.status !== 0) throw new Error(result.stderr)
}
for (const locale of ['zh', 'en']) {
  const dictionary = JSON.parse(await readFile(path.join(root, 'locale', `${locale}.json`), 'utf8'))
  if (!dictionary.meta?.title || !dictionary.meta?.description) throw new Error('Missing metadata')
}
console.log(check ? 'Runtime artifacts match source; syntax and metadata passed.' : 'Built Host and Client.')
