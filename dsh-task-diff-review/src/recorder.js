import { promises as fs, watch } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { git } from './git.js'
import { reviewGitRange } from './git-review.js'

const note = '本轮为时间窗口内的工作区净变化；用户或其他任务并发写入无法可靠归属。忽略文件、链接、子模块、工作区外路径及未关联到 DSH 子代理的外部工作树不在覆盖范围内。目录捕获不是原子文件系统快照。'

export class Recorder {
  constructor(ctx, snapshots, signal) {
    this.ctx = ctx; this.snapshots = snapshots; this.signal = signal
    this.tasks = new Map(); this.current = new Map(); this.assigned = new Map(); this.headers = new Map(); this.running = new Set()
    this.views = new Map(); this.watches = new Map(); this.timers = new Map(); this.jobs = new Map()
    this.comparisons = new Map()
    this.pendingCaptures = new Map(); this.dirty = new Set()
  }
  async init() {
    await this.snapshots.init()
    const directory = path.join(this.snapshots.root, 'tasks'); await fs.mkdir(directory, { recursive: true })
    for (const name of (await fs.readdir(directory)).filter(name => /^[a-f0-9-]+\.json$/.test(name))) {
      try {
        const task = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'))
        if (task.version !== 1 || !task.id || !task.sessionId || !Array.isArray(task.repositories)) continue
        if (task.status === 'tracking') { task.status = 'interrupted'; task.warnings.push('Host 已重启：保留最后快照，重启期间及之后的变化未追溯') }
        this.tasks.set(task.id, task)
      } catch { /* An incomplete manifest is not a valid baseline. */ }
    }
  }
  header(session) { this.headers.set(session.id, session.header); return session.header }
  rootId(session) {
    this.header(session); let id = session.id; const seen = new Set()
    while (!seen.has(id)) {
      seen.add(id)
      const header = this.headers.get(id) ?? this.ctx.agents.get(id)?.session?.header
      if (!header?.parentSession) break
      id = header.parentSession
    }
    return id
  }
  taskFor(session) {
    const assigned = this.assigned.get(session.id)
    return this.tasks.get(assigned ?? this.current.get(this.rootId(session)))
  }
  async save(task) {
    const destination = path.join(this.snapshots.root, 'tasks', `${task.id}.json`)
    const temporary = `${destination}.${randomUUID()}.tmp`
    try { await fs.writeFile(temporary, JSON.stringify(task), { mode: 0o600 }); await fs.rename(temporary, destination) }
    finally { await fs.rm(temporary, { force: true }).catch(() => {}) }
  }
  queue(task, work) {
    const previous = this.jobs.get(task.id) ?? Promise.resolve()
    const next = previous.catch(() => {}).then(() => { this.signal.throwIfAborted(); return work() })
      .catch(error => { if (!this.signal.aborted) { task.warnings = [...new Set([...task.warnings, error.code ? `快照捕获/保存失败（${error.code}）` : error.message])]; task.status = 'incomplete' } })
    this.jobs.set(task.id, next); return next
  }
  start(session, event) {
    const sessionId = this.rootId(session)
    const previous = this.taskFor(session)
    const task = { version: 1, id: randomUUID(), sessionId, turn: this.turns?.get(session.id) ?? 1,
      eventSeq: event.seq, started: Date.now(), updated: Date.now(), status: 'tracking', warnings: [note], repositories: [], members: [session.id] }
    // Steering input is a new time window, not a reason to overwrite an older child's baseline.
    if ([...this.running].some(id => this.rootId({ id, header: this.headers.get(id) ?? {} }) === sessionId && id !== session.id)) task.warnings.push('新用户消息到达时旧子代理仍在运行，两个任务时间窗口可能重叠')
    this.tasks.set(task.id, task); this.current.set(sessionId, task.id); this.assigned.set(session.id, task.id)
    if (previous && !this.active(previous)) {
      this.stopWatching(previous)
      clearTimeout(this.timers.get(previous.id)); this.timers.delete(previous.id)
    }
    const previousJob = previous ? this.jobs.get(previous.id) : undefined
    this.queue(task, async () => { await previousJob; await this.addRepository(task, session.header.cwd, false); await this.save(task) })
    return task
  }
  async addRepository(task, cwd, secondary) {
    if (!cwd) { task.warnings.push('会话没有本地工作目录，无法建立文件基线'); return }
    let root
    try { root = await this.snapshots.repository(cwd) }
    catch { task.warnings.push('未找到可读取的本地 Git 仓库；无法完整记录本轮改动'); return }
    if (task.repositories.some(repo => repo.root.toLowerCase() === root.toLowerCase())) return
    if (secondary) task.warnings.push(`额外仓库/工作树 ${root}：基线从首次观察到该子代理时建立，创建前改动无法追溯`)
    const before = await this.snapshots.working(root)
    task.repositories.push({ root, before, after: before })
    this.watch(task, root)
  }
  watch(task, root) {
    const key = `${task.id}:${root}`
    if (this.watches.has(key) || this.signal.aborted) return
    try {
      const watcher = watch(root, { recursive: true }, (_event, filename) => {
        const parts = String(filename ?? '').replace(/\\/g, '/').split('/')
        if (parts.some(part => ['.git', 'node_modules', '.dsh'].includes(part))) return
        this.schedule(task)
      })
      watcher.on('error', () => { task.warnings.push('目录监听中断；工具完成和手动刷新仍会重新读取工作区'); watcher.close(); this.watches.delete(key) })
      this.watches.set(key, watcher)
    } catch { task.warnings.push('无法递归监听目录；长命令运行中请使用手动刷新') }
  }
  schedule(task) {
    if (this.timers.has(task.id) || this.signal.aborted) return
    const timer = setTimeout(() => { this.timers.delete(task.id); void this.capture(task) }, 1800)
    timer.unref?.(); this.timers.set(task.id, timer)
  }
  active(task) { return task.members.some(id => this.running.has(id) && this.assigned.get(id) === task.id) }
  stopWatching(task) {
    for (const [key, watcher] of this.watches) if (key.startsWith(`${task.id}:`)) { watcher.close(); this.watches.delete(key) }
  }
  capture(task, force = false) {
    if (!force && this.pendingCaptures.has(task.id)) { this.dirty.add(task.id); return this.pendingCaptures.get(task.id) }
    const pending = this.queue(task, async () => {
      for (const repository of task.repositories) repository.after = await this.snapshots.working(repository.root)
      task.updated = Date.now()
      const active = this.active(task)
      task.status = active ? 'tracking' : 'settled'
      if (!active) this.stopWatching(task)
      await this.save(task)
    })
    this.pendingCaptures.set(task.id, pending)
    void pending.finally(() => {
      if (this.pendingCaptures.get(task.id) !== pending) return
      this.pendingCaptures.delete(task.id)
      if (this.dirty.delete(task.id) && this.active(task)) this.schedule(task)
    })
    return pending
  }
  created(agent) {
    const session = agent.session; this.header(session)
    if (!session.header.parentSession) return
    const task = this.taskFor(session)
    if (!task) return
    this.assigned.set(session.id, task.id); if (!task.members.includes(session.id)) task.members.push(session.id)
    // Includes the interval between creation and the child's first turn/start.
    this.running.add(session.id)
    this.queue(task, () => this.addRepository(task, session.header.cwd, true))
  }
  event(session, event) {
    this.header(session)
    if (event.type === 'turn/start') {
      this.turns ??= new Map(); this.turns.set(session.id, event.data.turn); this.running.add(session.id)
      if (session.header.parentSession) {
        const parent = this.ctx.agents.get(session.header.parentSession)?.session
        const task = parent ? this.taskFor(parent) : this.taskFor(session)
        if (task) {
          this.assigned.set(session.id, task.id); if (!task.members.includes(session.id)) task.members.push(session.id)
          this.queue(task, async () => { await this.addRepository(task, session.header.cwd, true); for (const repo of task.repositories) this.watch(task, repo.root) })
        }
      }
    }
    if (event.type === 'user/message' && event.data?.source?.kind === 'user' && !session.header.parentSession) this.start(session, event)
    const task = this.taskFor(session)
    if (event.type === 'tool/result' && task) this.schedule(task)
    if (event.type === 'turn/end') {
      this.running.delete(session.id)
      if (task) this.queue(task, async () => {
        if (!this.active(task)) {
          this.stopWatching(task); clearTimeout(this.timers.get(task.id)); this.timers.delete(task.id)
          task.status = 'settled'; task.updated = Date.now(); await this.save(task)
        }
      })
    }
  }
  async beforeTools(session) {
    const task = this.taskFor(session)
    if (!task) return
    await this.queue(task, async () => {
      await this.addRepository(task, session.header.cwd, Boolean(session.header.parentSession))
      for (const repo of task.repositories) this.watch(task, repo.root)
    })
    // A failed baseline is shown as incomplete; observing must never block the user's tools indefinitely.
  }
  disposed(agent) {
    const wasRunning = this.running.delete(agent.session.id)
    const task = this.taskFor(agent.session); if (task && wasRunning) this.schedule(task)
  }
  async view(sessionId, mode, base, taskId, cwd, options = {}) {
    const histories = [...this.tasks.values()].filter(task => task.sessionId === sessionId).sort((a, b) => b.started - a.started)
    const task = taskId ? histories.find(task => task.id === taskId) : histories[0]
    const comparisons = []; let warnings = [], branches = [], selectedBase = base, status = 'ready', commit
    if (mode === 'task') {
      if (!task) return { files: [], total: 0, added: 0, deleted: 0, warnings: ['尚无可信的本轮基线。请启用后开始一条新任务；不会用已有工作区修改冒充本轮改动。'], histories: [], status: 'missing', turn: 1 }
      await this.jobs.get(task.id)
      warnings = [...task.warnings]; status = task.status
      let cached = this.comparisons.get(task.id)
      if (!cached || cached.updated !== task.updated) {
        cached = { updated: task.updated, promise: Promise.all(task.repositories.map(repository => this.snapshots.compare(repository.before, repository.after))) }
        this.comparisons.set(task.id, cached)
        while (this.comparisons.size > 30) this.comparisons.delete(this.comparisons.keys().next().value)
      }
      comparisons.push(...await cached.promise)
    } else if (['staged', 'unstaged', 'commits'].includes(mode)) {
      const result = await reviewGitRange(this.snapshots, cwd, mode, options)
      comparisons.push(result.comparison); commit = result.commit
    } else {
      const root = await this.snapshots.repository(cwd)
      if (mode === 'uncommitted') {
        let before
        try { before = await this.snapshots.committed(root, 'HEAD') }
        catch { throw new Error('当前仓库没有可读取的 HEAD；未提交模式暂不支持未出生分支') }
        comparisons.push(await this.snapshots.compare(before, await this.snapshots.working(root, { normalizeForGit: true })))
      } else {
        branches = (await git(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes'], { signal: this.signal })).toString().trim().split('\n').filter(Boolean)
        if (!selectedBase) {
          try { selectedBase = (await git(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], { signal: this.signal })).toString().trim() } catch {}
          selectedBase ||= ['main', 'master', 'origin/main', 'origin/master'].find(name => branches.includes(name))
          if (!selectedBase) { try { selectedBase = (await git(root, ['rev-parse', '--abbrev-ref', '@{upstream}'], { signal: this.signal })).toString().trim() } catch {} }
          selectedBase ||= branches[0]
        }
        if (!selectedBase || !branches.includes(selectedBase)) throw new Error('请选择仓库中存在的基准分支')
        const baseOid = (await git(root, ['rev-parse', '--verify', '--end-of-options', `${selectedBase}^{commit}`], { signal: this.signal })).toString().trim()
        const mergeBase = (await git(root, ['merge-base', baseOid, 'HEAD'], { signal: this.signal })).toString().trim()
        comparisons.push(await this.snapshots.compare(await this.snapshots.committed(root, mergeBase), await this.snapshots.committed(root, 'HEAD')))
      }
    }
    const files = []
    for (let at = 0; at < comparisons.length; at++) for (let index = 0; index < comparisons[at].files.length; index++) files.push({ ...comparisons[at].files[index], repository: comparisons[at].root, comparison: at, entry: index })
    warnings.push(...comparisons.flatMap(comparison => comparison.warnings))
    const token = randomUUID()
    this.views.set(token, { sessionId, comparisons, files, time: Date.now() })
    // Comparison manifests, not file bytes; bounded cache for concurrent dock/sidebar requests.
    while (this.views.size > 24) this.views.delete(this.views.keys().next().value)
    return { token, files, total: files.length, added: files.reduce((sum, file) => sum + file.added, 0), deleted: files.reduce((sum, file) => sum + file.deleted, 0),
      warnings: [...new Set(warnings)], status, branches, base: selectedBase, commit, turn: task?.turn ?? 1, taskId: task?.id, updated: task?.updated,
      histories: histories.slice(0, 30).map(entry => ({ id: entry.id, started: entry.started, status: entry.status })) }
  }
  async diff(sessionId, token, index) {
    const view = this.views.get(token), file = view?.files[index]
    if (!view || view.sessionId !== sessionId || !file) throw new Error('审查快照已过期，请刷新')
    return this.snapshots.diff(view.comparisons[file.comparison], file.entry)
  }
  async close() {
    for (const watcher of this.watches.values()) watcher.close()
    for (const timer of this.timers.values()) clearTimeout(timer)
    await Promise.allSettled(this.jobs.values())
  }
}
