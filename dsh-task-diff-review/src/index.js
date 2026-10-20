import path from 'node:path'
import os from 'node:os'
import { Snapshots } from './snapshots.js'
import { Recorder } from './recorder.js'
import { commitHistory } from './git-review.js'
import { GitActions, redact } from './git-actions.js'
import { generateCommitMessage } from './commit-message.js'

export const name = 'dsh-task-diff-review'
export const inject = ['connection', 'agents', 'sessionQuery']

export function apply(ctx) {
  const lifetime = new AbortController()
  const root = path.join(process.env.DSH_HOME || path.join(os.homedir(), '.dsh'), 'plugin-data', name)
  const recorder = new Recorder(ctx, new Snapshots(root, lifetime.signal), lifetime.signal)
  const actions = new GitActions(recorder.snapshots, lifetime.signal)
  const ready = recorder.init()
  void ready.catch(error => ctx.logger.warn(`${name}: storage unavailable: ${error.code || error.message}`))
  const headers = new Map()
  const headerFor = async sessionId => {
    const live = ctx.agents.get(sessionId)?.session
    if (live) return live.header
    if (!headers.has(sessionId)) {
      if (headers.size >= 100) headers.delete(headers.keys().next().value)
      headers.set(sessionId, ctx.sessionQuery.readSession(sessionId).then(result => result.session).catch(error => { headers.delete(sessionId); throw error }))
    }
    return headers.get(sessionId)
  }
  const ownerFor = async sessionId => {
    const seen = new Set()
    while (!seen.has(sessionId) && seen.size < 32) {
      seen.add(sessionId)
      const header = await headerFor(sessionId)
      if (!header.parentSession) return sessionId
      sessionId = header.parentSession
    }
    throw new Error('无法可靠解析父子会话关系')
  }
  // Attach immediately, queue initialization before any baseline or file tool.
  const run = work => { void ready.then(work).catch(error => ctx.logger.warn(`${name}: ${error.message}`)) }
  ctx.on('session/event', (session, event) => run(() => recorder.event(session, event)))
  ctx.on('agent/created', ({ agent }) => run(() => recorder.created(agent)))
  ctx.on('agent/disposed', ({ agent }) => run(() => recorder.disposed(agent)))
  ctx.on('agent/turn-stopping', async ({ agent }) => {
    try { await ready; const task = recorder.taskFor(agent.session); if (task) await recorder.capture(task, true) }
    catch (error) { ctx.logger.warn(`${name}: final capture unavailable: ${error.message}`) }
  })
  ctx.on('tools/pre-execute', async (exec, next) => {
    try { await ready; if (exec.agent?.session) await recorder.beforeTools(exec.agent.session) }
    catch (error) { ctx.logger.warn(`${name}: baseline unavailable: ${error.message}`) }
    return next()
  })
  ctx.effect(() => async () => { lifetime.abort(); await ready.catch(() => {}); await recorder.close() })
  // All reads stay behind DSH Connection's official authentication fence.
  for (const kind of ['summary', 'diff', 'refresh', 'history']) ctx.connection.fetch.register({
    path: `/api/task-diff.${kind}`, methods: ['GET'], requestBody: 'buffered',
    async fetch(request) {
      try {
        await ready
        const query = new URL(request.url).searchParams, sessionId = query.get('sessionId')
        if (!sessionId || sessionId.length > 256) return new Response('Invalid session', { status: 400 })
        let result
        if (kind === 'diff') {
          const index = Number(query.get('index'))
          if (!Number.isSafeInteger(index) || index < 0) return new Response('Invalid index', { status: 400 })
          result = await recorder.diff(await ownerFor(sessionId), query.get('token'), index)
        } else if (kind === 'history') {
          const header = await headerFor(sessionId)
          result = await commitHistory(recorder.snapshots, header.cwd, { branch: query.get('branch') || 'HEAD', query: query.get('query') || '', offset: Number(query.get('offset') || 0), tip: query.get('tip') || '' })
        } else {
          const mode = query.get('mode') || 'task'
          if (!['task', 'uncommitted', 'staged', 'unstaged', 'branch', 'commits'].includes(mode)) return new Response('Invalid mode', { status: 400 })
          const header = await headerFor(sessionId), owner = await ownerFor(sessionId)
          if (kind === 'refresh' && mode === 'task') {
            const task = recorder.tasks.get(recorder.current.get(owner))
            if (task && recorder.active(task)) await recorder.capture(task, true)
          }
          result = await recorder.view(owner, mode, query.get('base'), query.get('taskId'), header.cwd, { commit: query.get('commit'), parent: query.get('parent') })
        }
        return Response.json(result, { headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
      } catch (error) { return Response.json({ error: error.message }, { status: 422, headers: { 'cache-control': 'no-store' } }) }
    },
  })
  ctx.connection.fetch.register({
    path: '/api/task-diff.git-status', methods: ['GET'], requestBody: 'buffered',
    async fetch(request) {
      try {
        const sessionId = new URL(request.url).searchParams.get('sessionId')
        if (!sessionId || sessionId.length > 256) return new Response('Invalid session', { status: 400 })
        return Response.json(await actions.status((await headerFor(sessionId)).cwd), { headers: { 'cache-control': 'no-store' } })
      } catch (error) { return Response.json({ error: redact(error.message) }, { status: 422 }) }
    },
  })
  ctx.connection.fetch.register({
    path: '/api/task-diff.git-action', methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      try {
        if (request.headers.get('x-dsh-git-action') !== '1' || ['cross-site', 'same-site'].includes(request.headers.get('sec-fetch-site'))) return new Response('Forbidden', { status: 403 })
        const origin = request.headers.get('origin')
        if (origin && origin !== new URL(request.url).origin) return new Response('Forbidden', { status: 403 })
        if (Number(request.headers.get('content-length')) > 65536) return new Response('Body too large', { status: 413 })
        const text = await request.text()
        if (Buffer.byteLength(text) > 65536) return new Response('Body too large', { status: 413 })
        const body = JSON.parse(text), sessionId = body.sessionId
        if (typeof sessionId !== 'string' || !sessionId || sessionId.length > 256) return new Response('Invalid session', { status: 400 })
        const cwd = (await headerFor(sessionId)).cwd
        let result
        switch (body.action) {
          case 'stage': case 'unstage':
            if (typeof body.all !== 'boolean') throw new Error('文件选择无效')
            result = await actions.select(cwd, body.action, body); break
          case 'prepareCommit': result = await actions.prepareCommit(cwd, sessionId); break
          case 'commit': result = await actions.commit(cwd, sessionId, body); break
          case 'preparePush': result = await actions.preparePush(cwd, sessionId, body.remote); break
          case 'push':
            if (body.confirmed !== true) throw new Error('推送需要用户明确确认')
            result = await actions.push(cwd, sessionId, body.ticket); break
          case 'generate': {
            const modelContext = { agents: ctx.agents, sessionQuery: ctx.sessionQuery, llm: ctx.get('llm') }
            result = await generateCommitMessage(modelContext, actions, cwd, sessionId, body.ticket, lifetime.signal); break
          }
          default: return new Response('Invalid action', { status: 400 })
        }
        return Response.json(result, { headers: { 'cache-control': 'no-store' } })
      } catch (error) { return Response.json({ error: redact(error.message) }, { status: 422, headers: { 'cache-control': 'no-store' } }) }
    },
  })
}
