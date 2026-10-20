import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const root = fileURLToPath(new URL('../', import.meta.url))
const npm = process.env.npm_execpath
if (!npm) throw new Error('Run npm run pack:plugin')
await mkdir(path.join(root, 'dist'), { recursive: true })
const packed = spawnSync(process.execPath, [npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', 'dist'], { cwd: root, encoding: 'utf8' })
if (packed.status !== 0) throw new Error(packed.stderr || packed.stdout)
const [{ filename, files }] = JSON.parse(packed.stdout)
for (const required of ['lib/client.js', 'lib/index.js', 'locale/zh.json', 'locale/en.json', 'icon.svg', 'cordis.patch.yml', 'LICENSE', 'THIRD_PARTY_NOTICES.md']) {
  if (!files.some(item => item.path === required)) throw new Error(`Archive missing ${required}`)
}
const digest = createHash('sha256').update(await readFile(path.join(root, 'dist', filename))).digest('hex')
await writeFile(path.join(root, 'dist/SHA256SUMS.txt'), `${digest}  ${filename}\n`)
console.log(`${filename}\nSHA256 ${digest}`)
