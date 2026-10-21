// Run without --apply to review only. Applying requires the user's explicit approval.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
const yaml = await import(process.env.DSH_YAML_MODULE || 'yaml')
const root = fileURLToPath(new URL('../', import.meta.url))
const profile = fs.realpathSync(path.join(os.homedir(), '.dsh/profiles/desktop'))
const expected = path.resolve(os.homedir(), '.dsh/profiles/desktop')
if (profile.toLowerCase() !== expected.toLowerCase()) throw Error('Unexpected Desktop profile real path')
const file = path.join(profile, 'cordis.patch.yml')
if (fs.realpathSync(file).toLowerCase() !== file.toLowerCase()) throw Error('Unexpected profile config link')
const before = fs.readFileSync(file, 'utf8')
const doc = yaml.parseDocument(before)
if (doc.errors.length || !yaml.isSeq(doc.contents)) throw Error('Profile must be a valid YAML sequence')
const controllers = doc.contents.items.filter(row => yaml.isMap(row) && row.get('id') === 'terminal-controller')
if (controllers.length !== 1) throw Error('Expected exactly one existing terminal-controller override')
const controller = controllers[0]
if (controller.get('name') && controller.get('name') !== '@deepseek-ai/dsh-api-terminal-controller') throw Error('Unexpected terminal-controller package')
let config = controller.get('config', true)
if (!config) { config = doc.createNode({}); controller.set('config', config) }
if (!yaml.isMap(config)) throw Error('Unexpected terminal-controller config shape')
const originalShell = JSON.stringify(config.get('shell', true)?.toJSON())
const nu = path.join(os.homedir(), 'AppData/Local/Programs/nu/bin/nu.exe').replaceAll('\\', '/')
if (!fs.statSync(nu).isFile()) throw Error('Verified NuShell executable is missing')
const existing = config.get('shellCandidates', true)
if (existing && !yaml.isSeq(existing)) throw Error('Unexpected shellCandidates shape; manual review needed')
const choices = existing ? existing.toJSON() : ['zsh', 'bash', 'fish', 'pwsh', 'powershell', 'cmd']
if (!choices.every(value => typeof value === 'string')) throw Error('Unexpected shell candidate values')
if (!choices.some(value => value.replaceAll('\\', '/').toLowerCase() === nu.toLowerCase())) {
  if (existing) existing.add(nu)
  else config.set('shellCandidates', doc.createNode([...choices, nu]))
}
const activations = doc.contents.items.filter(row => yaml.isMap(row) && row.get('id') === 'dsh-bottom-terminal')
if (activations.length > 1) throw Error('Duplicate bottom terminal override')
if (activations.length) activations[0].set('disabled', false)
else doc.contents.add(doc.createNode({ id: 'dsh-bottom-terminal', disabled: false }))
if (JSON.stringify(config.get('shell', true)?.toJSON()) !== originalShell) throw Error('Existing shell default changed')
let after = doc.toString({ lineWidth: 0 })
if (before.includes('\r\n')) after = after.replaceAll('\n', '\r\n')
console.log('Reviewed changes: enable dsh-bottom-terminal; retain all existing shell candidates and append', nu)
console.log('Existing terminal-controller shell default is preserved. No runtime reload or restart is requested.')
if (process.argv.includes('--apply')) {
  if (fs.readFileSync(file, 'utf8') !== before) throw Error('Profile changed during review; rerun')
  const backup = path.join(root, '.test-output', `desktop-config-backup-${Date.now()}`)
  fs.mkdirSync(backup, { recursive: true })
  fs.writeFileSync(path.join(backup, 'cordis.patch.yml'), before, { flag: 'wx' })
  const temporary = file + '.bottom-terminal.tmp'
  fs.writeFileSync(temporary, after, { flag: 'wx' })
  // Both exact target paths are verified, including realpath of the existing destination.
  if (fs.realpathSync(temporary).toLowerCase() !== temporary.toLowerCase() || fs.realpathSync(file).toLowerCase() !== file.toLowerCase()) throw Error('Unexpected config replacement path')
  if (fs.readFileSync(file, 'utf8') !== before) throw Error('Profile changed before replacement; temporary file retained for inspection')
  fs.renameSync(temporary, file)
  if (fs.readFileSync(file, 'utf8') !== after) throw Error('Config verification failed')
  console.log('Configuration saved; backup:', backup)
} else console.log('Dry run only; no Profile file has been changed.')
