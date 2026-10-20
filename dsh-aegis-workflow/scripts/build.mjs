import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const check = process.argv.includes('--check')
const roles = ['lead', 'planner', 'coder', 'knowledge-curator', 'reviewer', 'project-mentor', 'git-operator']
const entries = []
for (const role of roles) {
  const source = (await readFile(path.join(root, 'presets', `${role}.patch.yml`), 'utf8')).replace(/\r\n/g, '\n')
  const lines = source.trimEnd().split('\n')
  if (lines.shift() !== '- insert:' || lines.some(line => line.trim() && !line.startsWith('    '))) {
    throw new Error(`${role}: expected one top-level insert containing the preset entry`)
  }
  entries.push(lines.map(line => line.startsWith('    ') ? line.slice(4) : line).join('\n'))
}
const outputs = {
  'index.js': await readFile(path.join(root, 'src/index.js'), 'utf8'),
  'presets.yml': '# Generated from presets/*.patch.yml; edit the source preset files.\n' + entries.join('\n') + '\n',
}
await mkdir(path.join(root, 'lib'), { recursive: true })
for (const [name, content] of Object.entries(outputs)) {
  const target = path.join(root, 'lib', name)
  if (check) {
    if ((await readFile(target, 'utf8')).replace(/\r\n/g, '\n') !== content.replace(/\r\n/g, '\n')) {
      throw new Error(`${name} is stale; run npm run build`)
    }
  } else await writeFile(target, content)
}
const syntax = spawnSync(process.execPath, ['--check', path.join(root, 'lib/index.js')], { encoding: 'utf8' })
if (syntax.status !== 0) throw new Error(syntax.stderr)
console.log(check ? 'Workflow entry and seven preset artifacts match their sources.' : 'Built workflow entry and seven presets.')
