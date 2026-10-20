import { git } from './git.js'

const PAGE_SIZE = 50
const oidPattern = /^[a-f0-9]{4,64}$/i
export const emptyTree = root => ({ root, files: Object.create(null), warnings: [], captured: Date.now(), oid: 'empty' })

async function branches(root, signal) {
  return (await git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes'], { signal })).toString().trim().split('\n').filter(Boolean)
}
async function resolve(root, revision, signal) {
  return (await git(root, ['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`], { signal })).toString().trim()
}
async function headOrEmpty(snapshots, root) {
  try { return await snapshots.committed(root, 'HEAD') }
  catch (error) {
    const branch = (await git(root, ['symbolic-ref', '--quiet', 'HEAD'], { signal: snapshots.signal })).toString().trim()
    const exists = (await git(root, ['for-each-ref', '--format=%(refname)', branch], { signal: snapshots.signal })).toString().trim()
    if (exists) throw error
    return emptyTree(root)
  }
}

export async function commitDetails(root, hash, signal) {
  if (!oidPattern.test(hash ?? '')) throw new Error('请选择有效的 Commit Hash')
  const oid = await resolve(root, hash, signal)
  if (!oid.startsWith(hash.toLowerCase())) throw new Error('Hash 前缀未对应有效提交')
  const fields = (await git(root, ['show', '--no-patch', '--no-show-signature', '--no-notes', '--format=%H%x00%P%x00%s%x00%an%x00%aI%x00%B', oid, '--'], { signal, maxBuffer: 2 * 1024 * 1024 })).toString().split('\0')
  if (fields.length !== 6 || fields[0] !== oid) throw new Error('提交信息格式无法可靠解析')
  return { hash: oid, parents: fields[1] ? fields[1].split(' ') : [], subject: fields[2], author: fields[3], date: fields[4], body: fields[5].trimEnd() }
}

export async function reviewGitRange(snapshots, cwd, mode, options) {
  const root = await snapshots.repository(cwd)
  if (mode === 'staged') return { comparison: await snapshots.compare(await headOrEmpty(snapshots, root), await snapshots.index(root)) }
  if (mode === 'unstaged') {
    const before = await snapshots.index(root), after = await snapshots.working(root, { normalizeForGit: true })
    const comparison = await snapshots.compare(before, after)
    for (const file of comparison.files) if (!Object.hasOwn(before.files, file.relative) && Object.hasOwn(after.files, file.relative)) {
      file.untracked = true; file.display = `[未跟踪] ${file.display}`
    }
    return { comparison }
  }
  const commit = await commitDetails(root, options.commit, snapshots.signal)
  const selectedParent = Number(options.parent ?? 0)
  if (!Number.isSafeInteger(selectedParent) || selectedParent < 0 || selectedParent >= Math.max(1, commit.parents.length)) throw new Error('父提交选择无效')
  const before = commit.parents.length ? await snapshots.committed(root, commit.parents[selectedParent]) : emptyTree(root)
  return { comparison: await snapshots.compare(before, await snapshots.committed(root, commit.hash)), commit: { ...commit, selectedParent } }
}

export async function commitHistory(snapshots, cwd, { branch = 'HEAD', query = '', offset = 0, tip = '' } = {}) {
  const root = await snapshots.repository(cwd), signal = snapshots.signal, names = await branches(root, signal)
  branch ||= 'HEAD'
  if (branch !== 'HEAD' && !names.includes(branch)) throw new Error('请选择有效的历史分支')
  if (query.length > 200 || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new Error('历史查询范围无效')
  if (tip && !oidPattern.test(tip)) throw new Error('历史分页锚点无效')
  let anchor
  try { anchor = await resolve(root, tip || branch, signal) }
  catch (error) {
    if (branch !== 'HEAD' || tip) throw error
    if ((await headOrEmpty(snapshots, root)).oid !== 'empty') throw error
    return { branches: names, branch, tip: '', commits: [], hasMore: false, nextOffset: 0 }
  }
  const output = await git(root, ['log', '--no-show-signature', '--no-notes', '-z', '--format=%H%x00%s%x00%an%x00%aI%x00%ct', `--max-count=${PAGE_SIZE + 1}`, `--skip=${offset}`,
    ...(query ? ['--fixed-strings', '--regexp-ignore-case', `--grep=${query}`] : []), anchor, '--'], { signal, maxBuffer: 2 * 1024 * 1024 })
  const parts = output.toString().split('\0'); if (parts.at(-1) === '') parts.pop()
  if (parts.length % 5 !== 0) throw new Error('提交历史格式无法可靠解析')
  const records = []
  for (let at = 0; at < parts.length; at += 5) records.push({ hash: parts[at], subject: parts[at + 1], author: parts[at + 2], date: parts[at + 3], time: Number(parts[at + 4]) })
  const commits = records.slice(0, PAGE_SIZE)
  // Literal message search plus a reachable hash-prefix match. No shell or revision-expression input.
  if (offset === 0 && oidPattern.test(query)) {
    try {
      const hash = await resolve(root, query, signal)
      if (!hash.startsWith(query.toLowerCase())) throw new Error('Not a hash prefix')
      await git(root, ['merge-base', '--is-ancestor', hash, anchor], { signal })
      if (!commits.some(commit => commit.hash === hash)) {
        const detail = await commitDetails(root, hash, signal)
        const time = Number((await git(root, ['show', '--no-patch', '--no-show-signature', '--no-notes', '--format=%ct', hash, '--'], { signal })).toString().trim())
        commits.push({ hash, subject: detail.subject, author: detail.author, date: detail.date, time })
      }
    } catch { /* Missing, ambiguous, or outside this branch: keep message matches. */ }
  }
  commits.sort((left, right) => right.time - left.time)
  return { branches: names, branch, tip: anchor, commits, hasMore: records.length > PAGE_SIZE, nextOffset: offset + Math.min(PAGE_SIZE, records.length) }
}
