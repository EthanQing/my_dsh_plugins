import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { git } from './git.js'

const execute = promisify(execFile)
const digest = value => createHash('sha256').update(value).digest('hex')
export function redact(value) {
  return String(value).replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+(?::[^\s/@]*)?@/gi, '$1[凭据已隐藏]@')
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^\s?#]+)\?[^\s#]*/gi, '$1?[参数已隐藏]')
    .replace(/([?&](?:token|access_token|password|key|auth)=)[^\s&#]+/gi, '$1[已隐藏]')
}
export function parseStatus(bytes) {
  const parts = bytes.toString('utf8').split('\0'), files = []
  for (let at = 0; at < parts.length && parts[at];) {
    const record = parts[at++], xy = record.slice(0, 2), name = record.slice(3)
    if (!name || record[2] !== ' ') throw new Error('无法解析 Git 状态')
    const original = /[RC]/.test(xy) ? parts[at++] : undefined
    const untracked = xy === '??', conflict = ['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU'].includes(xy)
    files.push({ path: name, original, xy, untracked, conflict, staged: !untracked && xy[0] !== ' ' && xy[0] !== '?', unstaged: untracked || xy[1] !== ' ' })
  }
  return files
}
function totals(bytes) {
  const parts = bytes.toString().split('\0'); let added = 0, deleted = 0, binary = 0, files = 0
  for (let at = 0; at < parts.length && parts[at];) {
    const match = /^([\d-]+)\t([\d-]+)\t([\s\S]*)$/.exec(parts[at++])
    if (!match) throw new Error('暂存区统计不完整')
    if (!match[3]) at += 2
    files++; if (match[1] === '-' || match[2] === '-') binary++
    else { added += +match[1]; deleted += +match[2] }
  }
  return { files, added, deleted, binary }
}
const validPath = name => typeof name === 'string' && name && !path.isAbsolute(name) && !/[\0\\]/.test(name)
  && name.split('/').every(part => part && part !== '..' && part !== '.' && part.toLowerCase() !== '.git')

export class GitActions {
  constructor(snapshots, signal) { this.snapshots = snapshots; this.signal = signal; this.busy = new Set(); this.tickets = new Map() }
  async repository(cwd) {
    if (typeof cwd !== 'string' || !cwd || !path.isAbsolute(cwd)) throw new Error('会话没有明确的本地工作目录，已禁用 Git 操作')
    return this.snapshots.repository(cwd)
  }
  async run(root, args, { input, timeout = 120000 } = {}) {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')))
    for (const key of ['GIT_SSH', 'GIT_SSH_COMMAND', 'GIT_SSH_VARIANT', 'GIT_ASKPASS', 'GIT_SSL_CAINFO', 'GIT_SSL_CAPATH', 'GIT_CONFIG_GLOBAL', 'GIT_CONFIG_SYSTEM']) {
      if (process.env[key] !== undefined) env[key] = process.env[key]
    }
    Object.assign(env, { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', LC_ALL: 'C' })
    const processCall = execute('git', ['-c', 'protocol.ext.allow=never', '--literal-pathspecs', ...args], {
      cwd: root, env, encoding: 'buffer', maxBuffer: 8 * 1024 * 1024, timeout, signal: this.signal, windowsHide: true,
    })
    processCall.child.stdin.on('error', () => {})
    processCall.child.stdin.end(input)
    try { return (await processCall).stdout }
    catch (error) { throw new Error(redact(error.stderr?.toString() || error.message).slice(0, 4000)) }
  }
  async config(root, key) {
    try { return (await git(root, ['config', '--get', key], { signal: this.signal })).toString().trim() } catch { return '' }
  }
  async identity(root) {
    const [raw, branch, head, indexPath] = await Promise.all([
      git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { signal: this.signal, maxBuffer: 8 * 1024 * 1024 }),
      git(root, ['symbolic-ref', '--quiet', '--short', 'HEAD'], { signal: this.signal }).then(bytes => bytes.toString().trim()).catch(() => ''),
      git(root, ['rev-parse', '--verify', 'HEAD'], { signal: this.signal }).then(bytes => bytes.toString().trim()).catch(() => ''),
      git(root, ['rev-parse', '--git-path', 'index'], { signal: this.signal }).then(bytes => path.resolve(root, bytes.toString().trim())),
    ])
    const index = await fs.readFile(indexPath).catch(error => { if (error.code === 'ENOENT') return Buffer.alloc(0); throw error })
    const files = parseStatus(raw)
    return { root, branch, head, files, indexVersion: digest(Buffer.concat([Buffer.from(`${branch}\0${head}\0`), index])),
      version: digest(Buffer.concat([Buffer.from(`${branch}\0${head}\0`), index, raw])) }
  }
  async remotes(root, branch) {
    const names = (await git(root, ['remote'], { signal: this.signal })).toString().trim().split('\n').filter(Boolean)
    const [pushRemote, pushDefault, upstream, merge] = await Promise.all([
      this.config(root, `branch.${branch}.pushRemote`), this.config(root, 'remote.pushDefault'),
      this.config(root, `branch.${branch}.remote`), this.config(root, `branch.${branch}.merge`),
    ])
    const remotes = await Promise.all(names.map(async name => {
      const urls = (await git(root, ['remote', 'get-url', '--push', '--all', '--', name], { signal: this.signal })).toString().trim().split('\n').filter(Boolean)
      return { name, urls, branch: name === upstream && merge.startsWith('refs/heads/') ? merge.slice(11) : branch }
    }))
    return { remotes, defaultRemote: [pushRemote, pushDefault, upstream, 'origin', names[0]].find(name => names.includes(name)) || '' }
  }
  async status(cwd) {
    let root
    try { root = await this.repository(cwd) } catch { return { repository: false, message: '当前工作区不是可读取的 Git 仓库' } }
    const identity = await this.identity(root), destinations = await this.remotes(root, identity.branch)
    let ahead = null, behind = null
    const destination = destinations.remotes.find(remote => remote.name === destinations.defaultRemote)
    if (identity.head && identity.branch && destination) try {
      const tracking = `refs/remotes/${destination.name}/${destination.branch}`
      const counts = (await git(root, ['rev-list', '--left-right', '--count', `HEAD...${tracking}`], { signal: this.signal })).toString().trim().split(/\s+/).map(Number)
      ;[ahead, behind] = counts
    } catch {}
    return { repository: true, ...identity, ahead, behind, defaultRemote: destinations.defaultRemote,
      remotes: destinations.remotes.map(remote => ({ ...remote, urls: remote.urls.map(redact) })), busy: this.busy.has(root),
      staged: identity.files.filter(file => file.staged).length, unstaged: identity.files.filter(file => file.unstaged).length }
  }
  async locked(root, action) {
    if (this.busy.has(root)) throw new Error('此仓库已有 Git 操作正在执行，请等待其结束')
    this.busy.add(root)
    try { return await action() } finally { this.busy.delete(root) }
  }
  issue(kind, sessionId, data) {
    const ticket = randomUUID()
    for (const [key, value] of this.tickets) if (Date.now() - value.time > 300000) this.tickets.delete(key)
    while (this.tickets.size >= 32) this.tickets.delete(this.tickets.keys().next().value)
    this.tickets.set(ticket, { kind, sessionId, time: Date.now(), ...data }); return ticket
  }
  ticket(kind, sessionId, id) {
    const value = this.tickets.get(id)
    if (!value || value.kind !== kind || value.sessionId !== sessionId || Date.now() - value.time > 300000) throw new Error('确认预览已过期，请重新打开')
    return value
  }
  async select(cwd, action, body) {
    const root = await this.repository(cwd)
    return this.locked(root, async () => {
      const state = await this.identity(root)
      if (body.version !== state.version) throw new Error('Git 状态已变化，请刷新后重新选择文件')
      const eligible = state.files.filter(file => action === 'stage' ? file.unstaged : file.staged)
      if (!body.all && (!Array.isArray(body.paths) || body.paths.length > 3000)) throw new Error('文件选择无效')
      const chosen = body.all ? eligible : eligible.filter(file => body.paths.includes(file.path))
      if (!chosen.length) throw new Error('没有符合操作条件的选中文件')
      if (chosen.some(file => file.conflict)) throw new Error('选中项存在未解决冲突，请先处理冲突')
      const paths = [...new Set(chosen.flatMap(file => {
        if (action === 'stage') return [file.path, ...(file.original && file.xy[1] === 'R' ? [file.original] : [])]
        if (file.original && file.xy[0] === 'R') return [file.path, file.original]
        return [file.original && file.xy[1] === 'R' ? file.original : file.path]
      }))]
      if (!paths.every(validPath)) throw new Error('选中路径不安全，已停止操作')
      const input = Buffer.from(paths.join('\0') + '\0')
      const args = action === 'stage' ? ['add', '-A'] : state.head ? ['restore', '--staged', '--source=HEAD'] : ['rm', '--cached', '-f', '--ignore-unmatch']
      await this.run(root, [...args, '--pathspec-from-file=-', '--pathspec-file-nul'], { input })
      return { message: action === 'stage' ? `已暂存 ${chosen.length} 个文件` : `已取消暂存 ${chosen.length} 个文件` }
    })
  }
  async prepareCommit(cwd, sessionId) {
    const root = await this.repository(cwd)
    return this.locked(root, async () => {
      const state = await this.identity(root)
      if (!state.branch) throw new Error('当前处于 Detached HEAD，暂不支持在面板提交')
      if (state.files.some(file => file.conflict)) throw new Error('存在未解决的 Git 冲突')
      const stats = totals(await git(root, ['diff', '--cached', '--no-ext-diff', '--no-textconv', '--numstat', '-z'], { signal: this.signal, maxBuffer: 8 * 1024 * 1024 }))
      if (!stats.files) throw new Error('没有已暂存改动')
      if ((await this.identity(root)).indexVersion !== state.indexVersion) throw new Error('读取期间暂存区发生变化，请重新预览')
      return { ticket: this.issue('commit', sessionId, state), branch: state.branch, ...stats }
    })
  }
  async verifyCommit(cwd, sessionId, id) {
    const preview = this.ticket('commit', sessionId, id), root = await this.repository(cwd)
    if (root !== preview.root || (await this.identity(root)).indexVersion !== preview.indexVersion) throw new Error('分支、HEAD 或暂存区已变化，请重新预览提交')
    return preview
  }
  async commit(cwd, sessionId, body) {
    if (body.confirmed !== true) throw new Error('提交需要用户明确确认')
    const root = await this.repository(cwd)
    return this.locked(root, async () => {
      await this.verifyCommit(cwd, sessionId, body.ticket)
      if (typeof body.message !== 'string' || !body.message.trim() || Buffer.byteLength(body.message) > 32768 || body.message.includes('\0')) throw new Error('请填写有效的提交信息（最多 32 KiB）')
      this.tickets.delete(body.ticket)
      await this.run(root, ['commit', '--file=-', '--cleanup=verbatim'], { input: body.message.trim() + '\n' })
      return { message: '提交成功' }
    })
  }
  async remoteTip(root, url, branch) {
    if (/^ext::/i.test(url)) throw new Error('不支持 ext 外部命令传输')
    const text = (await this.run(root, ['ls-remote', '--heads', '--', url, `refs/heads/${branch}`], { timeout: 30000 })).toString().trim()
    if (!text) return ''
    const match = /^([a-f0-9]{40,64})\t/.exec(text)
    if (!match) throw new Error('无法识别远端分支信息')
    return match[1]
  }
  async preparePush(cwd, sessionId, name) {
    const root = await this.repository(cwd)
    return this.locked(root, async () => {
      const state = await this.identity(root)
      if (!state.head || !state.branch) throw new Error('当前分支没有提交或处于 Detached HEAD')
      const destinations = await this.remotes(root, state.branch), remote = destinations.remotes.find(item => item.name === (name || destinations.defaultRemote))
      if (!remote?.urls.length) throw new Error('没有可用的推送 Remote')
      await git(root, ['check-ref-format', `refs/heads/${remote.branch}`], { signal: this.signal })
      const targets = []
      for (const url of remote.urls) {
        const tip = await this.remoteTip(root, url, remote.branch)
        if (tip && tip !== state.head) try { await git(root, ['merge-base', '--is-ancestor', tip, state.head], { signal: this.signal }) }
        catch { throw new Error('远端存在分歧或所需远端对象不在本地，无法安全普通推送；请先核对远端状态') }
        const count = tip === state.head ? 0 : Number((await git(root, ['rev-list', '--count', tip ? `${tip}..${state.head}` : state.head], { signal: this.signal })).toString().trim())
        targets.push({ url, tip, count })
      }
      const current = await this.identity(root)
      if (current.head !== state.head || current.branch !== state.branch) throw new Error('分支或 HEAD 已变化，请重新预览推送')
      const currentRemote = (await this.remotes(root, state.branch)).remotes.find(item => item.name === remote.name)
      if (JSON.stringify(currentRemote) !== JSON.stringify(remote)) throw new Error('Remote 配置已变化，请重新预览推送')
      return { ticket: this.issue('push', sessionId, { root, head: state.head, branch: state.branch, remote, targets }), remote: remote.name,
        branch: remote.branch, localBranch: state.branch, head: state.head, targets: targets.map(target => ({ ...target, url: redact(target.url) })), count: Math.max(...targets.map(target => target.count)) }
    })
  }
  async push(cwd, sessionId, body) {
    const { ticket: id } = body
    const preview = this.ticket('push', sessionId, id), root = await this.repository(cwd)
    if (body.confirmed !== true || body.remote !== preview.remote.name || body.branch !== preview.remote.branch || body.head !== preview.head) throw new Error('推送目标与确认预览不一致，请重新确认')
    return this.locked(root, async () => {
      const state = await this.identity(root)
      if (root !== preview.root || state.head !== preview.head || state.branch !== preview.branch) throw new Error('当前分支或 HEAD 已变化，请重新确认推送')
      const remote = (await this.remotes(root, state.branch)).remotes.find(item => item.name === preview.remote.name)
      if (JSON.stringify(remote) !== JSON.stringify(preview.remote)) throw new Error('Remote 配置已变化，请重新确认')
      if (!preview.targets.some(target => target.count > 0)) throw new Error('没有需要推送的提交')
      for (const target of preview.targets) if (await this.remoteTip(root, target.url, remote.branch) !== target.tip) throw new Error('远端分支已变化，请重新预览')
      const current = await this.identity(root)
      const currentRemote = (await this.remotes(root, current.branch)).remotes.find(item => item.name === preview.remote.name)
      if (current.head !== preview.head || current.branch !== preview.branch || JSON.stringify(currentRemote) !== JSON.stringify(preview.remote)) throw new Error('分支、HEAD 或 Remote 已变化，请重新确认推送')
      this.tickets.delete(id)
      // Explicit immutable source and single destination ref. Never force, mirror, tag, pull, or rewrite remote settings.
      try { await this.run(root, ['push', '--porcelain', '--no-force', '--no-mirror', '--no-follow-tags', '--recurse-submodules=no', '--', remote.name, `${preview.head}:refs/heads/${remote.branch}`]) }
      catch (error) { if (preview.targets.length > 1) throw new Error(`多地址推送未全部成功，请重新检查各目标（可能部分已成功）：\n${error.message}`); throw error }
      return { message: '推送成功' }
    })
  }
}
