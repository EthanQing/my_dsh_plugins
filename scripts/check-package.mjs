import assert from 'node:assert/strict'
import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import vm from 'node:vm'

export const root = fileURLToPath(new URL('../', import.meta.url))
export const readJson = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'))

async function checkSyntax(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) await checkSyntax(file)
    else if (file.endsWith('.js') || file.endsWith('.mjs')) {
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' })
      assert.equal(result.status, 0, result.stderr)
    }
  }
}

export async function checkPackage() {
  const manifest = await readJson('package.json')
  const plugins = await readJson('plugins.json')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.engines.dsh, '0.2.1-rc.2')
  assert.equal(new Set(plugins.map(p => p.name)).size, plugins.length)
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('dsh-')) continue
    const pkg = await readJson(`${entry.name}/package.json`)
    if (pkg.dsh?.bundle) assert.ok(plugins.some(p => p.directory === entry.name), `${entry.name}: plugin missing from GitHub installation catalog`)
  }
  for (const script of ['prepare', 'preinstall', 'install', 'postinstall', 'prepack']) {
    assert.equal(manifest.scripts?.[script], undefined, `${script} must not run during GitHub installation`)
  }
  assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0, 'collection must ship self-contained runtime artifacts')
  const expectedRows = []
  for (const plugin of plugins) {
    assert.match(plugin.name, /^dsh-[a-z0-9-]+$/)
    assert.equal(plugin.directory, plugin.name)
    const pkg = await readJson(`${plugin.directory}/package.json`)
    assert.equal(pkg.name, plugin.name)
    const main = pkg.exports['.'].default
    const client = pkg.exports['./client'].default
    for (const resource of [main, client, 'locale/en.json', 'locale/zh.json', 'icon.svg', pkg.dsh.bundle.patch]) {
      assert.ok((await stat(path.join(root, plugin.directory, resource))).isFile(), `${plugin.name}: missing ${resource}`)
    }
    let registration
    vm.runInNewContext(await readFile(path.join(root, plugin.directory, client), 'utf8'), {
      window: { __ModuleLoader__: { load: entry => { assert.equal(registration, undefined); registration = entry } } },
    }, { timeout: 1000 })
    assert.equal(registration.id, plugin.name, 'nested manifest must own the existing browser module ID')
    assert.equal(typeof registration.factory, 'function')
    const runtimeFiles = `${plugin.directory}/lib/`
    assert.ok(manifest.files.includes(runtimeFiles))
    assert.ok(manifest.files.includes(`${plugin.directory}/package.json`))
    assert.ok(manifest.files.includes(`${plugin.directory}/locale/`))
    expectedRows.push(`    - id: ${plugin.name}\n      name: ./${plugin.directory}/${main.replace(/^\.\//, '')}\n      disabled: true`)
    await checkSyntax(path.join(root, plugin.directory, 'lib'))
    for (const locale of ['en', 'zh']) await readJson(`${plugin.directory}/locale/${locale}.json`)
  }
  const patch = (await readFile(path.join(root, manifest.dsh.bundle.patch), 'utf8')).replace(/\r\n/g, '\n')
    .split('\n').filter(line => !line.startsWith('#')).join('\n').trim()
  assert.equal(patch, `- insert:\n${expectedRows.join('\n')}`, 'collection must not activate plugins or override native providers')
  await checkSyntax(path.join(root, 'scripts'))
  console.log(`Validated ${plugins.length} prebuilt plugins; collection entries are all disabled.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await checkPackage()
