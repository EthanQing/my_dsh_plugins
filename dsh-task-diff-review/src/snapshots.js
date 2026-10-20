import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { git, parseNames, parseHunks, parseStats } from './git.js'

const MAX_FILES = 3000, MAX_FILE = 2 * 1024 * 1024, MAX_HASH = 16 * 1024 * 1024, MAX_CAPTURE = 64 * 1024 * 1024, MAX_STORE = 512 * 1024 * 1024
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const safeRelative = name => typeof name === 'string' && name !== '' && !name.includes('\\')
  && !path.isAbsolute(name) && name.split('/').every(part => part && part !== '.' && part !== '..' && part.toLowerCase() !== '.git' && !part.includes(':'))

export class Snapshots {
  constructor(root, signal) { this.root = root; this.signal = signal; this.bytes = 0; this.known = new Set() }
  async init() {
    await fs.mkdir(path.join(this.root, 'blobs'), { recursive: true, mode: 0o700 })
    for (const name of await fs.readdir(path.join(this.root, 'blobs'))) {
      if (!/^[a-f0-9]{64}$/.test(name)) continue
      this.known.add(name); this.bytes += (await fs.stat(path.join(this.root, 'blobs', name))).size
    }
  }
  async blob(bytes) {
    const id = hash(bytes)
    if (bytes.length > MAX_FILE) return { fingerprint: id, oversized: true, size: bytes.length }
    if (!this.known.has(id)) {
      if (this.bytes + bytes.length > MAX_STORE) throw new Error('快照存储已达 512 MiB 上限')
      await fs.writeFile(this.blobPath(id), bytes, { flag: 'wx', mode: 0o600 }).catch(error => { if (error.code !== 'EEXIST') throw error })
      this.known.add(id); this.bytes += bytes.length
    }
    let binary = bytes.includes(0)
    if (!binary) { try { new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { binary = true } }
    return { hash: id, binary, size: bytes.length }
  }
  blobPath(id) { if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('Invalid blob'); return path.join(this.root, 'blobs', id) }
  async repository(cwd) {
    return (await git(cwd, ['rev-parse', '--show-toplevel'], { signal: this.signal })).toString().trim()
  }
  async conversion(root, names) {
    const [config, eol, attributes] = await Promise.all([
      git(root, ['config', '--get', 'core.autocrlf'], { signal: this.signal }).catch(() => Buffer.from('false')),
      git(root, ['ls-files', '--eol', '-z', '--cached', '--others', '--exclude-standard'], { signal: this.signal }),
      git(root, ['check-attr', '-z', '--stdin', 'text', 'eol', 'filter', 'working-tree-encoding', 'ident'], { input: names.join('\0') + '\0', signal: this.signal }),
    ])
    const auto = ['true', 'input'].includes(config.toString().trim()), stats = new Map(), attrs = new Map()
    for (const record of eol.toString().split('\0').filter(Boolean)) {
      const at = record.indexOf('\t'); if (at < 0) continue
      const meta = record.slice(0, at)
      stats.set(record.slice(at + 1), { index: /i\/(\S+)/.exec(meta)?.[1], work: /w\/(\S+)/.exec(meta)?.[1] })
    }
    const parts = attributes.toString().split('\0')
    for (let at = 0; at + 2 < parts.length; at += 3) {
      const name = parts[at]; if (!attrs.has(name)) attrs.set(name, {})
      attrs.get(name)[parts[at + 1]] = parts[at + 2]
    }
    return (name, bytes) => {
      const attr = attrs.get(name) ?? {}, active = value => value && !['unspecified', 'unset'].includes(value)
      if (active(attr.filter) || active(attr['working-tree-encoding']) || active(attr.ident)) throw new Error('Git 过滤器/编码/ident 转换未覆盖；为保持只读不执行过滤命令')
      if (attr.text === 'unset') return bytes
      const forced = attr.text === 'set' || (['lf', 'crlf'].includes(attr.eol) && attr.text !== 'auto')
      const automatic = attr.text === 'auto' || ((!attr.text || attr.text === 'unspecified') && auto)
      const info = stats.get(name)
      const normalize = forced || (automatic && info && info.work !== '-text' && !['crlf', 'mixed'].includes(info.index))
      if (!normalize || !bytes.includes(13)) return bytes
      // Byte-preserving CRLF conversion; never run clean filters in the real repository.
      return Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1')
    }
  }
  async working(root, { normalizeForGit = false } = {}) {
    const names = [...new Set((await git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { signal: this.signal })).toString('utf8').split('\0').filter(Boolean))].sort()
    const files = Object.create(null), warnings = []; let total = 0
    const convert = normalizeForGit && names.length ? await this.conversion(root, names.slice(0, MAX_FILES)) : (_name, bytes) => bytes
    if (names.length > MAX_FILES) warnings.push(`仓库超过 ${MAX_FILES} 个文件，未覆盖超限路径`)
    for (const name of names.slice(0, MAX_FILES)) {
      this.signal.throwIfAborted()
      if (!safeRelative(name)) { warnings.push(`未覆盖特殊路径：${name}`); continue }
      try {
        // Never follow a directory junction or symbolic link out of the repository.
        let target = root
        for (const part of name.split('/')) {
          target = path.join(target, part)
          if ((await fs.lstat(target)).isSymbolicLink()) throw new Error('符号链接/联接未覆盖')
        }
        const before = await fs.lstat(target)
        if (!before.isFile()) { warnings.push(`子模块或非普通文件未覆盖：${name}`); continue }
        if (before.size > MAX_HASH || total + before.size > MAX_CAPTURE) {
          files[name] = { unavailable: true, size: before.size }
          warnings.push(`文件内容未捕获（大小/总量限制）：${name}`); continue
        }
        const bytes = await fs.readFile(target), after = await fs.lstat(target)
        if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || bytes.length !== after.size) throw new Error('捕获时文件正在变化')
        total += bytes.length; files[name] = { ...await this.blob(convert(name, bytes)), executable: Boolean(before.mode & 0o111) }
      } catch (error) {
        if (error.code === 'ENOENT' || error.code === 'ENOTDIR') continue
        files[name] = { unavailable: true }; warnings.push(`${name}：${error.message}`)
      }
    }
    return { root, files, warnings, captured: Date.now() }
  }
  async committed(root, revision) {
    // A revision is first resolved to an object id. No user text becomes an option or shell command.
    const oid = (await git(root, ['rev-parse', '--verify', '--end-of-options', `${revision}^{commit}`], { signal: this.signal })).toString().trim()
    const records = (await git(root, ['ls-tree', '-r', '-l', '-z', oid], { signal: this.signal })).toString().split('\0').filter(Boolean)
    const files = Object.create(null), warnings = [], selected = []; let total = 0
    if (records.length > MAX_FILES) warnings.push(`提交超过 ${MAX_FILES} 个文件，未覆盖超限路径`)
    for (const record of records.slice(0, MAX_FILES)) {
      const match = /^(\d+) (\w+) ([a-f0-9]+)\s+([\d-]+)\t([\s\S]+)$/.exec(record)
      if (!match) continue
      const [, mode, type, object, size, name] = match
      if (!safeRelative(name) || type !== 'blob' || mode === '120000') { warnings.push(`特殊路径/链接/子模块未覆盖：${name}`); continue }
      if (+size > MAX_HASH || total + +size > MAX_CAPTURE) { files[name] = { unavailable: true, size: +size }; warnings.push(`文件内容未捕获：${name}`); continue }
      total += +size; selected.push({ name, object, executable: mode === '100755' })
    }
    if (selected.length) {
      const data = await git(root, ['cat-file', '--batch'], { input: selected.map(entry => entry.object).join('\n') + '\n', signal: this.signal })
      let offset = 0
      for (const entry of selected) {
        const end = data.indexOf(10, offset), header = data.subarray(offset, end).toString(), size = Number(header.split(' ')[2])
        if (end < 0 || !Number.isSafeInteger(size) || size < 0 || end + 1 + size >= data.length) throw new Error('Git blob stream incomplete')
        files[entry.name] = { ...await this.blob(data.subarray(end + 1, end + 1 + size)), executable: entry.executable }; offset = end + 2 + size
      }
    }
    return { root, files, warnings, captured: Date.now(), oid }
  }
  async index(root) {
    const records = (await git(root, ['ls-files', '--stage', '-z'], { signal: this.signal })).toString().split('\0').filter(Boolean)
    const files = Object.create(null), warnings = [], selected = []
    if (records.length > MAX_FILES) warnings.push(`暂存区超过 ${MAX_FILES} 条记录，未覆盖超限路径`)
    for (const record of records.slice(0, MAX_FILES)) {
      const match = /^(\d+) ([a-f0-9]+) (\d)\t([\s\S]+)$/.exec(record)
      if (!match) throw new Error('无法解析暂存区记录')
      const [, mode, object, stage, name] = match
      if (stage !== '0' || !safeRelative(name) || !['100644', '100755'].includes(mode)) {
        files[name] = { unavailable: true }; warnings.push(`冲突、链接、子模块或特殊路径未覆盖：${name}`); continue
      }
      selected.push({ name, object, executable: mode === '100755' })
    }
    if (selected.length) {
      const sizes = (await git(root, ['cat-file', '--batch-check'], { input: selected.map(entry => entry.object).join('\n') + '\n', signal: this.signal })).toString().trim().split('\n')
      const bounded = []; let total = 0
      for (let at = 0; at < selected.length; at++) {
        const entry = selected[at], match = /^[a-f0-9]+ blob (\d+)$/.exec(sizes[at] ?? '')
        if (!match) throw new Error('暂存区对象缺失或读取不完整')
        const size = Number(match[1])
        if (size > MAX_HASH || total + size > MAX_CAPTURE) { files[entry.name] = { unavailable: true }; warnings.push(`暂存区文件内容超限：${entry.name}`); continue }
        total += size; bounded.push(entry)
      }
      if (bounded.length) {
        const data = await git(root, ['cat-file', '--batch'], { input: bounded.map(entry => entry.object).join('\n') + '\n', signal: this.signal })
        let offset = 0
        for (const entry of bounded) {
          const end = data.indexOf(10, offset), size = Number(data.subarray(offset, end).toString().split(' ')[2])
          if (end < 0 || !Number.isSafeInteger(size) || size < 0 || end + 1 + size >= data.length) throw new Error('暂存区内容读取不完整')
          files[entry.name] = { ...await this.blob(data.subarray(end + 1, end + 1 + size)), executable: entry.executable }; offset = end + 2 + size
        }
      }
    }
    return { root, files, warnings, captured: Date.now(), oid: 'index' }
  }
  async materialize(snapshot, destination) {
    await fs.mkdir(destination, { recursive: true })
    for (const [name, entry] of Object.entries(snapshot.files)) {
      if (!entry.hash || !safeRelative(name)) continue
      const target = path.join(destination, ...name.split('/'))
      await fs.mkdir(path.dirname(target), { recursive: true })
      await fs.copyFile(this.blobPath(entry.hash), target)
      if (process.platform !== 'win32') await fs.chmod(target, entry.executable ? 0o700 : 0o600)
    }
  }
  async compare(before, after) {
    const temp = path.join(this.root, 'compare', randomUUID())
    await fs.mkdir(temp, { recursive: true })
    try {
      await this.materialize(before, path.join(temp, 'before')); await this.materialize(after, path.join(temp, 'after'))
      const files = parseNames(await git(temp, ['diff', '--no-index', '--no-ext-diff', '--no-textconv', '-M', '--name-status', '-z', '--', 'before', 'after'], { signal: this.signal }))
      const stats = parseStats(await git(temp, ['diff', '--no-index', '--no-ext-diff', '--no-textconv', '-M', '--numstat', '-z', '--', 'before', 'after'], { signal: this.signal }))
      const result = []
      for (const file of files) {
        const left = before.files[file.oldPath], right = after.files[file.relative]
        // Omitted content must never turn an actual modification into a fictitious creation/deletion.
        if (left?.unavailable || right?.unavailable || before.files[file.relative]?.unavailable || after.files[file.oldPath]?.unavailable
          || left?.oversized || right?.oversized || before.files[file.relative]?.oversized || after.files[file.oldPath]?.oversized) continue
        const descriptor = { ...file, path: path.join(after.root, ...file.relative.split('/')), display: file.status === 'R' ? `${file.oldPath} → ${file.relative}` : file.relative, added: 0, deleted: 0 }
        if (left?.binary || right?.binary) descriptor.binary = true
        else {
          const stat = stats.get(file.relative)
          if (!stat) throw new Error('文件状态和行数统计不一致，未发布不完整统计')
          Object.assign(descriptor, stat)
        }
        result.push(descriptor)
      }
      const remaining = []
      for (const name of new Set([...Object.keys(before.files), ...Object.keys(after.files)])) {
        const left = before.files[name], right = after.files[name]
        if ((!left?.oversized && !right?.oversized) || left?.unavailable || right?.unavailable) continue
        if ((left?.fingerprint ?? left?.hash) === (right?.fingerprint ?? right?.hash)) continue
        remaining.push({ status: !left ? 'A' : !right ? 'D' : 'M', oldPath: name, relative: name,
          path: path.join(after.root, ...name.split('/')), display: name, added: 0, deleted: 0, oversized: true,
          fingerprint: left?.fingerprint ?? right?.fingerprint })
      }
      for (const file of remaining) {
        if (file.status !== 'D') continue
        const renamed = remaining.find(entry => entry.status === 'A' && !entry.merged && entry.fingerprint === file.fingerprint)
        if (renamed) { file.status = 'R'; file.relative = renamed.relative; file.path = renamed.path; file.display = `${file.oldPath} → ${file.relative}`; renamed.merged = true }
      }
      result.push(...remaining.filter(file => !file.merged).map(({ fingerprint, ...file }) => file))
      if (before.oid && after.oid) for (const [name, left] of Object.entries(before.files)) {
        const right = after.files[name]
        if (left.hash && left.hash === right?.hash && left.executable !== right.executable && !result.some(file => file.relative === name)) {
          result.push({ status: 'M', oldPath: name, relative: name, path: path.join(after.root, ...name.split('/')), display: name,
            added: 0, deleted: 0, ...(left.binary ? { binary: true } : {}) })
        }
      }
      // Metadata-only empty additions/deletions have no patch lines but are still real changes.
      return { root: after.root, files: result, before, after, warnings: [...new Set([...before.warnings, ...after.warnings])], total: result.length,
        added: result.reduce((sum, file) => sum + file.added, 0), deleted: result.reduce((sum, file) => sum + file.deleted, 0) }
    } finally { await fs.rm(temp, { recursive: true, force: true }) }
  }
  async diff(comparison, index) {
    const file = comparison.files[index]
    if (!file) throw new Error('文件不在当前快照中')
    const base = { path: file.path, display: file.display }
    if (file.binary) return { ...base, kind: 'binary' }
    if (file.oversized) return { ...base, kind: 'oversized' }
    const left = comparison.before.files[file.oldPath], right = comparison.after.files[file.relative]
    if (left?.unavailable || right?.unavailable) return { ...base, kind: 'oversized' }
    const temp = path.join(this.root, 'compare', randomUUID())
    await fs.mkdir(temp, { recursive: true })
    try {
      for (const [name, item] of [['before', left], ['after', right]]) {
        if (item?.hash) await fs.copyFile(this.blobPath(item.hash), path.join(temp, name))
        else await fs.writeFile(path.join(temp, name), '')
      }
      const output = await git(temp, ['diff', '--no-index', '--no-ext-diff', '--no-textconv', '--unified=3', '--', 'before', 'after'], { signal: this.signal })
      return { ...base, kind: 'text', before: Boolean(left?.hash), after: Boolean(right?.hash), coarse: false, hunks: parseHunks(output) }
    } finally { await fs.rm(temp, { recursive: true, force: true }) }
  }
}
