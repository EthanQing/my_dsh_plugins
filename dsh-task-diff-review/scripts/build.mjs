import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('../', import.meta.url)), check = process.argv.includes('--check')
const { build } = await import(process.env.DSH_ESBUILD_MODULE || 'esbuild')
await mkdir(path.join(root, 'lib'), { recursive: true })
for (const [entry, output, platform, format] of [['src/client.js', 'client.js', 'browser', 'iife'], ['src/index.js', 'index.js', 'node', 'esm']]) {
  const result = await build({ absWorkingDir: root, entryPoints: [entry], outfile: `lib/${output}`, bundle: true, write: false,
    platform, format, target: platform === 'node' ? 'node24' : 'chrome120', charset: 'utf8', legalComments: 'none',
    loader: { '.css': 'text' }, banner: { js: '// Generated; edit src/ and run scripts/build.mjs.' } })
  const content = result.outputFiles[0].text, destination = path.join(root, 'lib', output)
  if (check) { if ((await readFile(destination, 'utf8')).replace(/\r\n/g, '\n') !== content.replace(/\r\n/g, '\n')) throw new Error(`Stale ${output}`) }
  else await writeFile(destination, content)
  const syntax = spawnSync(process.execPath, ['--check', destination], { encoding: 'utf8' })
  if (syntax.status !== 0) throw new Error(syntax.stderr)
}
for (const locale of ['zh', 'en']) {
  const value = JSON.parse(await readFile(path.join(root, 'locale', `${locale}.json`), 'utf8'))
  if (!value.meta?.title || !value.meta?.description) throw new Error(`Missing ${locale} metadata`)
}
console.log(check ? 'Diff review sources and artifacts match.' : 'Built Diff review Host and Client.')
