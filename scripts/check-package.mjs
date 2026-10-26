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
  const supportedDsh = manifest.engines.dsh
  const versions = supportedDsh.split(' || ')
  assert.equal(new Set(versions).size, versions.length)
  for (const version of versions) {
    assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
  }
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(plugins.length, 9, 'component catalog must remain complete')
  assert.equal(new Set(plugins.map(p => p.name)).size, plugins.length)
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('dsh-')) continue
    const pkg = await readJson(`${entry.name}/package.json`)
    if (pkg.dsh?.bundle) assert.ok(plugins.some(p => p.directory === entry.name), `${entry.name}: plugin missing from GitHub installation catalog`)
  }
  for (const script of ['prepare', 'preinstall', 'install', 'postinstall', 'prepack']) {
    assert.equal(manifest.scripts?.[script], undefined, `${script} must not run during GitHub installation`)
  }
  assert.deepEqual(manifest.dependencies, Object.fromEntries(plugins.map(p => [p.name, `file:./${p.directory}`])),
    'collection dependencies must only reference its own shipped plugin directories')
  for (const locale of ['en', 'zh']) {
    const data = await readJson(`locale/${locale}.json`)
    assert.ok(data.meta?.title && data.meta?.description, `collection: missing ${locale} display metadata`)
  }
  assert.equal(manifest.exports['./locale/*.json'], './locale/*.json')
  assert.equal(manifest.exports['./icon'], './icon.svg')
  const expectedRows = []
  for (const plugin of plugins) {
    assert.match(plugin.name, /^dsh-[a-z0-9-]+$/)
    assert.equal(plugin.directory, plugin.name)
    const pkg = await readJson(`${plugin.directory}/package.json`)
    assert.equal(pkg.name, plugin.name)
    assert.equal(pkg.engines?.dsh, supportedDsh, `${plugin.name}: DSH compatibility must match the verified collection versions`)
    for (const [peer, range] of Object.entries(pkg.peerDependencies ?? {})) {
      if (peer.startsWith('@deepseek-ai/dsh-') || peer === '@deepseek-ai/dsh') {
        assert.equal(range, supportedDsh, `${plugin.name}: ${peer} must support exactly the verified DSH versions`)
      }
    }
    try {
      const lock = await readJson(`${plugin.directory}/package-lock.json`)
      assert.equal(lock.version, pkg.version, `${plugin.name}: stale lockfile version`)
      assert.deepEqual(lock.packages[''].engines, pkg.engines, `${plugin.name}: stale lockfile engines`)
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
    for (const script of ['prepare', 'preinstall', 'install', 'postinstall', 'prepack']) {
      assert.equal(pkg.scripts?.[script], undefined, `${plugin.name}: ${script} must not run while installing the collection`)
    }
    for (const peer of Object.keys(pkg.peerDependencies ?? {})) {
      assert.equal(pkg.peerDependenciesMeta?.[peer]?.optional, true, `${plugin.name}: DSH-owned peer ${peer} must not cause a registry installation`)
    }
    const main = pkg.exports['.'].default
    const client = pkg.exports['./client']?.default
    assert.equal(Boolean(client), Boolean(pkg.dsh.client), `${plugin.name}: Client declaration and export must agree`)
    for (const resource of [main, client, 'locale/en.json', 'locale/zh.json', 'icon.svg', pkg.dsh.bundle.patch].filter(Boolean)) {
      assert.ok((await stat(path.join(root, plugin.directory, resource))).isFile(), `${plugin.name}: missing ${resource}`)
    }
    if (client) {
      let registration
      vm.runInNewContext(await readFile(path.join(root, plugin.directory, client), 'utf8'), {
        window: { __ModuleLoader__: { load: entry => { assert.equal(registration, undefined); registration = entry } } },
      }, { timeout: 1000 })
      assert.equal(registration.id, plugin.name, 'nested manifest must own the existing browser module ID')
      assert.equal(typeof registration.factory, 'function')
    } else {
      const checked = spawnSync(process.execPath, [path.join(root, plugin.directory, 'scripts/build.mjs'), '--check'], { encoding: 'utf8' })
      assert.equal(checked.status, 0, checked.stderr || checked.stdout)
    }
    const runtimeFiles = `${plugin.directory}/lib/`
    assert.ok(manifest.files.includes(runtimeFiles))
    assert.ok(manifest.files.includes(`${plugin.directory}/package.json`))
    assert.ok(manifest.files.includes(`${plugin.directory}/locale/`))
    expectedRows.push(`    - id: ${plugin.name}\n      name: ${plugin.name}\n      disabled: true`)
    await checkSyntax(path.join(root, plugin.directory, 'lib'))
    assert.equal(pkg.exports['./locale/*.json'], './locale/*.json')
    assert.equal(pkg.exports['./icon'], './icon.svg')
    for (const locale of ['en', 'zh']) {
      const data = await readJson(`${plugin.directory}/locale/${locale}.json`)
      assert.ok(data.meta?.title && data.meta?.description, `${plugin.name}: missing ${locale} display metadata`)
    }
  }
  const patch = (await readFile(path.join(root, manifest.dsh.bundle.patch), 'utf8')).replace(/\r\n/g, '\n')
    .split('\n').filter(line => !line.startsWith('#')).join('\n').trim()
  assert.equal(patch, `- insert:\n${expectedRows.join('\n')}`, 'collection must not activate plugins or override native providers')
  await checkSyntax(path.join(root, 'scripts'))
  console.log(`Validated ${plugins.length} prebuilt plugins; collection entries are all disabled.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await checkPackage()
