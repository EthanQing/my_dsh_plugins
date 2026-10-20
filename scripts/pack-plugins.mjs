import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { checkPackage, readJson, root } from './check-package.mjs'

await checkPackage()
// Use npm's JS entry directly: no shell, no platform-specific npm.cmd quoting.
const npm = process.env.npm_execpath
if (!npm) throw new Error('Run this script with npm run pack:plugins')
const destination = path.join(root, 'dist')
await mkdir(destination, { recursive: true })
const packages = [{ directory: '.' }, ...await readJson('plugins.json')]
const checksums = []
for (const pkg of packages) {
  const result = spawnSync(process.execPath, [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', destination], {
    cwd: path.join(root, pkg.directory), encoding: 'utf8',
  })
  if (result.status !== 0) throw new Error(result.stderr || result.stdout)
  const [{ filename }] = JSON.parse(result.stdout)
  const digest = createHash('sha256').update(await readFile(path.join(destination, filename))).digest('hex')
  checksums.push(`${digest}  ${filename}`)
  console.log(filename)
}
await writeFile(path.join(destination, 'SHA256SUMS.txt'), `${checksums.join('\n')}\n`)
