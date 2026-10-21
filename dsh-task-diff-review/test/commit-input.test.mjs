import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtemp, writeFile, mkdir, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { collectCommitInput, readStagedFiles, sampleStagedDiff, COMMIT_INPUT_BUDGET } from '../src/commit-input.js'

async function repo(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'dsh-commit-input-'))
  // Only remove the exact temporary directory created here, never a user repository.
  assert.equal(path.dirname(root), path.resolve(tmpdir()))
  assert.ok(path.basename(root).startsWith('dsh-commit-input-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  git('init', '-q')
  git('config', 'user.name', 'Temporary Test')
  git('config', 'user.email', 'temporary@example.invalid')
  git('config', 'core.autocrlf', 'false')
  return { root, git }
}

test('real index metadata preserves Unicode, literal paths, rename, binary and staged isolation', async t => {
  const { root, git } = await repo(t)
  await mkdir(path.join(root, 'before'))
  await writeFile(path.join(root, 'before', '原始 文件.js'), 'export const original = 1\n')
  await writeFile(path.join(root, 'gone.txt'), 'delete me\n')
  git('add', '.')
  git('commit', '-qm', 'fixture baseline')
  git('mv', 'before/原始 文件.js', 'before/改名 文件.js')
  git('rm', 'gone.txt')
  await writeFile(path.join(root, '中文 文件.js'), 'export const stagedOnly = "STAGED_MARKER"\n')
  await writeFile(path.join(root, '[literal].js'), 'literal marker\n')
  await writeFile(path.join(root, 'payload.bin'), Buffer.from([0, 1, 255, 0, 42]))
  git('add', '.')
  await writeFile(path.join(root, '中文 文件.js'), 'UNSTAGED_SECRET_DO_NOT_INCLUDE\n')
  await writeFile(path.join(root, 'untracked.js'), 'UNTRACKED_SECRET_DO_NOT_INCLUDE\n')
  const before = await readFile(path.join(root, '.git', 'index'))
  const head = git('rev-parse', 'HEAD')
  const files = await readStagedFiles(root)
  assert.equal(files.length, 5)
  assert.deepEqual(files.find(f => f.path === 'before/改名 文件.js'), { status: 'R100', path: 'before/改名 文件.js', oldPath: 'before/原始 文件.js', added: 0, deleted: 0 })
  assert.equal(files.find(f => f.path === 'payload.bin').binary, true)
  assert.equal(files.find(f => f.path === 'gone.txt').deleted, 1)
  const input = await collectCommitInput(root)
  assert.match(input, /STAGED_MARKER/)
  assert.match(input, /literal marker/)
  assert.doesNotMatch(input, /UNSTAGED_SECRET|UNTRACKED_SECRET/)
  assert.match(input, /二进制 1 个/)
  assert.deepEqual(await readFile(path.join(root, '.git', 'index')), before)
  assert.equal(git('rev-parse', 'HEAD'), head)
})

test('multi-megabyte staged diff uses bounded head/tail with accurate full numstat', async t => {
  const { root, git } = await repo(t)
  const lines = Array.from({ length: 50000 }, (_, n) => `export const line${n} = "${'x'.repeat(70)}"`).join('\n') + '\n'
  await writeFile(path.join(root, 'huge.js'), lines)
  git('add', '.')
  const [file] = await readStagedFiles(root)
  assert.equal(file.added, 50000)
  const sample = await sampleStagedDiff(root, file)
  assert.equal(sample.bytes, 256 * 1024)
  assert.equal(sample.limited, true)
  assert.equal(sample.truncated, true)
  assert.equal(sample.error, undefined)
  assert.ok(Buffer.byteLength(sample.text) < 7 * 1024)
  assert.match(sample.text, /line0 =/)
  assert.doesNotMatch(sample.text, /line49999 =/)
  assert.match(sample.text, /不代表文件末尾/)
  assert.doesNotMatch(sample.text, /line25000 =/)
  const input = await collectCommitInput(root)
  assert.match(input, /新增 50000 行/)
  assert.match(input, /大 Diff 仅含已读取窗口首尾/)
  assert.ok(Buffer.byteLength(input) <= COMMIT_INPUT_BUDGET)
})

test('complete metadata is read even when many filenames exceed model manifest budget', async t => {
  const { root, git } = await repo(t)
  await Promise.all(Array.from({ length: 300 }, async (_, n) => writeFile(path.join(root, `文件_${String(n).padStart(3, '0')}_${'a'.repeat(90)}.js`), `${n}\n`)))
  git('add', '.')
  const files = await readStagedFiles(root)
  assert.equal(files.length, 300)
  assert.equal(files.reduce((n, f) => n + f.added, 0), 300)
  const input = await collectCommitInput(root)
  assert.match(input, /共 300 个文件/)
  assert.match(input, /输入预算限制：省略/)
  assert.ok(Buffer.byteLength(input) <= COMMIT_INPUT_BUDGET)
})

test('18 large Unicode files remain within final text budget without broken UTF8', async t => {
  const { root, git } = await repo(t)
  const content = '中文变化🙂'.repeat(20000) + '\n'
  await Promise.all(Array.from({ length: 18 }, (_, n) => writeFile(path.join(root, `模块${n}.js`), content)))
  git('add', '.')
  assert.equal((await readStagedFiles(root)).length, 18)
  const budget = COMMIT_INPUT_BUDGET - 1800
  const input = await collectCommitInput(root, undefined, budget)
  assert.ok(Buffer.byteLength(input) <= budget)
  assert.doesNotMatch(input, /\uFFFD/)
  assert.match(input, /共 18 个文件/)
  assert.match(input, /覆盖说明/)
  assert.match(input, /达到单文件读取上限后停止/)
})

test('Git failure differs from large input and partial sample explicitly records unreadability', async t => {
  const { root } = await repo(t)
  const outside = path.join(root, 'not-a-repo')
  await mkdir(outside)
  // A nonexistent root produces an actual spawn failure instead of a buffer limit.
  const missing = path.join(outside, 'missing')
  await assert.rejects(readStagedFiles(missing), /ENOENT/)
  const sample = await sampleStagedDiff(missing, { path: 'a.js' })
  assert.match(sample.error, /ENOENT/)
  assert.equal(sample.truncated, false)
  assert.equal(sample.bytes, 0)
  await writeFile(path.join(root, '.git', 'index'), 'invalid index')
  await assert.rejects(readStagedFiles(root), /Git 读取失败（退出码/)
  const unreadable = await sampleStagedDiff(root, { path: 'a.js' })
  assert.match(unreadable.error, /Git 读取失败/)
  assert.equal(unreadable.limited, false)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(collectCommitInput(root, controller.signal), /abort/i)
})
