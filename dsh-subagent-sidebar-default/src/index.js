// Adapted from dsh-session-delete-manager (MIT); see THIRD_PARTY_NOTICES.md.
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const name = 'dsh-subagent-sidebar-default'
export const inject = ['webServer', 'workspaceRegistry']

const ROUTE = '/dsh-subagent-sidebar-default'
const TOKEN_ROUTE = '/dsh-subagent-sidebar-default/token'
const TOKEN_META = 'dsh-subagent-sidebar-default-token'
const TOKEN_HEADER = 'x-dsh-subagent-sidebar-default-token'
const CLIENT_HEADER = 'x-dsh-ssd-client'
const MAX_IDS = 200
const MAX_BODY = 64 * 1024
const MAX_TREE_DEPTH = 32
const MAX_TREE_ENTRIES = 20000
const RETRY_DELAYS = [50, 100, 200]
const RETRY_CODES = new Set(['EBUSY', 'EPERM', 'EACCES'])
const INVALID_ID_CHAR = /[\u0000-\u001f\u007f/\\]/u
const TOKEN_META_PATTERN = /<meta\b[^>]*\bname\s*=\s*["']dsh-subagent-sidebar-default-token["'][^>]*>/i
const token = randomBytes(32).toString('hex')

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

function codedError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function logWarn(ctx, scope, errorOrCode) {
  const code = typeof errorOrCode === 'string'
    ? errorOrCode
    : String(errorOrCode?.code || errorOrCode?.name || 'internal')
  try {
    const message = `[dsh-subagent-sidebar-default] ${scope}: ${code}`
    if (ctx?.logger?.warn) ctx.logger.warn(message)
    else console.warn(message)
  } catch {
    // Logging must never take down the route.
  }
}

function injectTokenMeta(html) {
  if (typeof html !== 'string') return html
  const existing = TOKEN_META_PATTERN.exec(html)
  if (existing !== null) {
    const original = existing[0]
    const contentAttribute = /(\s)content\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/i
    const replaced = contentAttribute.test(original)
      ? original.replace(contentAttribute, `$1content="${token}"`)
      : original.replace(/(\s*\/?>)$/, (ending) => ` content="${token}"${ending}`)
    return html.slice(0, existing.index) + replaced + html.slice(existing.index + original.length)
  }
  const tag = `<meta name="${TOKEN_META}" content="${token}">`
  const closing = /<\/head\s*>/i.exec(html)
  if (closing === null) return tag + html
  return html.slice(0, closing.index) + tag + html.slice(closing.index)
}

function hasValidToken(req) {
  const raw = req.headers[TOKEN_HEADER]
  if (typeof raw !== 'string') return false
  const given = Buffer.from(raw, 'utf8')
  const expected = Buffer.from(token, 'utf8')
  if (given.length !== expected.length) return false
  try {
    return timingSafeEqual(given, expected)
  } catch {
    return false
  }
}

function sendJson(res, status, payload) {
  if (res.headersSent || res.writableEnded || res.destroyed) return
  const body = JSON.stringify(payload)
  try {
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      'content-length': Buffer.byteLength(body),
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    })
    res.end(body)
  } catch {
    // The peer may have gone away between the checks and the write.
  }
}

function sameOriginRequest(req) {
  const secFetchSite = req.headers['sec-fetch-site']
  if (secFetchSite === 'same-origin') return true
  if (secFetchSite === 'cross-site' || secFetchSite === 'same-site') return false
  const origin = req.headers.origin
  const referer = req.headers.referer
  const host = req.headers.host
  if (typeof host === 'string' && host !== '') {
    for (const value of [origin, referer]) {
      if (typeof value !== 'string' || value === '') continue
      try {
        const url = new URL(value)
        if ((url.protocol === 'http:' || url.protocol === 'https:') && url.host === host) return true
      } catch {
        // An unparsable Origin/Referer is not evidence of a same-origin request.
      }
    }
  }
  if (secFetchSite !== undefined) return false
  if (origin !== undefined) return false
  const cookie = req.headers.cookie
  return typeof cookie === 'string' && cookie !== ''
}

function handleTokenRequest(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader?.('allow', 'GET')
      sendJson(res, 405, { ok: false, code: 'method' })
      return
    }
    if (req.headers[CLIENT_HEADER] !== '1' || !sameOriginRequest(req)) {
      sendJson(res, 403, { ok: false, code: 'forbidden' })
      return
    }
    sendJson(res, 200, { ok: true, token })
  } catch {
    sendJson(res, 500, { ok: false, code: 'internal' })
  }
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let settled = false
    let size = 0
    const chunks = []
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      callback(value)
    }
    req.on('data', (chunk) => {
      if (settled) return
      size += chunk.length
      if (size > MAX_BODY) {
        finish(reject, codedError('too-large', 'request body exceeds the limit'))
        if (typeof req.resume === 'function') req.resume()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => finish(resolve, Buffer.concat(chunks)))
    req.on('error', (error) => finish(reject, error))
    req.on('aborted', () => finish(reject, codedError('aborted', 'request aborted')))
  })
}

function isValidSessionId(value) {
  if (typeof value !== 'string') return false
  if (value.length < 1 || value.length > 200) return false
  if (value === '.' || value === '..') return false
  return !INVALID_ID_CHAR.test(value)
}

/**
 * Ported from @deepseek-ai/dsh-session-persistence-jsonl (MIT): encode an
 * arbitrary JS string as one safe path segment. Safe code units stay literal;
 * every other code unit, including `~`, becomes `~XXXX`. `.` and `..` are
 * escaped even though each is otherwise a safe whole segment.
 */
function encodeSegment(raw) {
  if (raw.length === 0) throw new Error('cannot encode an empty path segment')
  if (raw === '.') return '~002E'
  if (raw === '..') return '~002E~002E'
  let out = ''
  for (let index = 0; index < raw.length; index += 1) {
    const code = raw.charCodeAt(index)
    const character = String.fromCharCode(code)
    if (character !== '~' && /^[A-Za-z0-9._-]$/.test(character)) out += character
    else out += `~${code.toString(16).toUpperCase().padStart(4, '0')}`
  }
  return out
}

function isContained(root, candidate) {
  const relative = path.relative(root, candidate)
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

async function retryIo(operation) {
  let attempt = 0
  for (;;) {
    try {
      return await operation()
    } catch (error) {
      if (!RETRY_CODES.has(error?.code) || attempt >= RETRY_DELAYS.length) throw error
      await sleep(RETRY_DELAYS[attempt])
      attempt += 1
    }
  }
}

async function removeEntry(target, depth, budget) {
  if (depth > MAX_TREE_DEPTH) throw codedError('unsafe', 'session log directory is nested too deeply')
  budget.entries += 1
  if (budget.entries > MAX_TREE_ENTRIES) throw codedError('unsafe', 'session log directory has too many entries')
  let stat
  try {
    stat = await retryIo(() => fs.lstat(target))
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  if (stat.isSymbolicLink() || stat.isFile()) {
    try {
      await retryIo(() => fs.unlink(target))
    } catch (error) {
      if (error?.code === 'ENOENT') return
      throw error
    }
    return
  }
  if (!stat.isDirectory()) throw codedError('unsafe', 'session log directory contains an unsupported entry')
  let children
  try {
    children = await retryIo(() => fs.readdir(target))
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  for (const child of children) await removeEntry(path.join(target, child), depth + 1, budget)
  try {
    await retryIo(() => fs.rmdir(target))
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
}

async function removeLogTree(target) {
  const budget = { entries: 0 }
  try {
    await removeEntry(target, 0, budget)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  try {
    await fs.lstat(target)
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  throw codedError('log-locked', 'session log directory still exists after removal')
}

async function removeCacheFile(target) {
  let stat
  try {
    stat = await fs.lstat(target)
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  if (stat.isSymbolicLink() || !stat.isFile()) throw codedError('unsafe', 'projection cache entry is not a regular file')
  try {
    await fs.unlink(target)
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  try {
    await fs.lstat(target)
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
  throw codedError('cache-locked', 'projection cache file still exists after removal')
}

function addIndexEntry(map, key, entry) {
  const entries = map.get(key)
  if (entries === undefined) map.set(key, [entry])
  else entries.push(entry)
}

async function readSessionsRoot(root) {
  let stat
  try {
    stat = await fs.stat(root)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
  if (!stat.isDirectory()) return null
  try {
    return await fs.realpath(root)
  } catch (error) {
    if (error?.code === 'ENOENT') return null
    throw error
  }
}

async function indexLogs(root, rootReal) {
  const byName = new Map()
  let projects
  try {
    projects = await fs.readdir(root, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') throw codedError('root-missing', 'session storage root disappeared during the scan')
    throw error
  }
  for (const project of projects) {
    if (!project.isDirectory() || project.isSymbolicLink()) continue
    const projectPath = path.join(root, project.name)
    let children
    try {
      children = await fs.readdir(projectPath, { withFileTypes: true })
    } catch (error) {
      if (error?.code === 'ENOENT') continue
      throw error
    }
    for (const child of children) {
      addIndexEntry(byName, child.name, {
        path: path.join(projectPath, child.name),
        isDirectory: child.isDirectory(),
        isSymbolicLink: child.isSymbolicLink(),
      })
    }
  }
  return { byName, rootReal }
}

async function indexCache(root) {
  let entries
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return { byName: new Map() }
    throw error
  }
  const byName = new Map()
  for (const entry of entries) {
    addIndexEntry(byName, entry.name, {
      path: path.join(root, entry.name),
      isFile: entry.isFile(),
      isDirectory: entry.isDirectory(),
      isSymbolicLink: entry.isSymbolicLink(),
    })
  }
  return { byName }
}

function logCandidate(index, sessionId) {
  const matches = index.byName.get(encodeSegment(sessionId)) || []
  if (matches.length === 0) return { kind: 'none' }
  if (matches.length > 1) return { kind: 'ambiguous' }
  const match = matches[0]
  if (!match.isDirectory || match.isSymbolicLink) return { kind: 'unsafe' }
  return { kind: 'entry', path: match.path }
}

function cacheCandidate(index, sessionId) {
  const names = new Set([`${sessionId}.json`, `${encodeSegment(sessionId)}.json`])
  const matches = []
  for (const key of names) {
    for (const entry of index.byName.get(key) || []) {
      if (!matches.some((candidate) => candidate.path === entry.path)) matches.push(entry)
    }
  }
  if (matches.length === 0) return { kind: 'none' }
  if (matches.length > 1) return { kind: 'ambiguous' }
  const match = matches[0]
  if (!match.isFile || match.isDirectory || match.isSymbolicLink) return { kind: 'unsafe' }
  return { kind: 'entry', path: match.path }
}

async function validateLogCandidate(index, candidate) {
  if (candidate.kind !== 'entry') return candidate
  let stat
  try {
    stat = await fs.lstat(candidate.path)
  } catch (error) {
    if (error?.code === 'ENOENT') return { kind: 'none' }
    throw error
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) return { kind: 'unsafe' }
  let real
  try {
    real = await fs.realpath(candidate.path)
  } catch (error) {
    if (error?.code === 'ENOENT') return { kind: 'none' }
    throw error
  }
  if (!isContained(index.rootReal, real)) return { kind: 'unsafe' }
  return { kind: 'entry', path: real }
}

async function validateCacheCandidate(candidate) {
  if (candidate.kind !== 'entry') return candidate
  let stat
  try {
    stat = await fs.lstat(candidate.path)
  } catch (error) {
    if (error?.code === 'ENOENT') return { kind: 'none' }
    throw error
  }
  if (stat.isSymbolicLink() || !stat.isFile()) return { kind: 'unsafe' }
  return { kind: 'entry', path: candidate.path }
}

async function inspectArtifacts(env, sessionId) {
  const rootReal = await readSessionsRoot(env.sessionsRoot)
  if (rootReal === null) return { status: 'root-missing' }
  const logs = await indexLogs(env.sessionsRoot, rootReal)
  const cache = await indexCache(env.cacheRoot)
  const log = await validateLogCandidate(logs, logCandidate(logs, sessionId))
  const cached = await validateCacheCandidate(cacheCandidate(cache, sessionId))
  if (log.kind === 'ambiguous' || cached.kind === 'ambiguous') return { status: 'ambiguous' }
  if (log.kind === 'unsafe' || cached.kind === 'unsafe') return { status: 'unsafe' }
  return {
    status: 'ok',
    logPath: log.kind === 'entry' ? log.path : null,
    cachePath: cached.kind === 'entry' ? cached.path : null,
  }
}

async function isRunning(ctx, sessionId) {
  try {
    const agents = typeof ctx.get === 'function' ? ctx.get('agents') : undefined
    const get = agents?.get
    const agent = typeof get === 'function' ? await get.call(agents, sessionId) : undefined
    if (agent === undefined || agent === null) return { running: false }
    return { running: agent.status === 'running' || agent.running === true }
  } catch (error) {
    return { error }
  }
}

function activityKinds(error) {
  if (!Array.isArray(error?.activity)) return []
  return error.activity
    .map((entry) => (entry && typeof entry.kind === 'string' ? entry.kind : undefined))
    .filter((kind) => typeof kind === 'string')
}

function failed(sessionId, code, extra) {
  return { sessionId, ok: false, code, ...extra }
}

function gone(sessionId) {
  return { sessionId, ok: true, code: 'alreadyGone' }
}

async function unarchive(ctx, sessionId) {
  try {
    await ctx.workspaceRegistry.unarchiveSession(sessionId)
    return true
  } catch (error) {
    logWarn(ctx, 'unarchive', error)
    return false
  }
}

async function deleteOne(ctx, env, sessionId) {
  if (!isValidSessionId(sessionId)) return failed(sessionId, 'invalid-id')

  // Refuse active work before touching or scanning persistence artifacts.
  let running = await isRunning(ctx, sessionId)
  if (running.error) {
    logWarn(ctx, 'running-check', running.error)
    return failed(sessionId, 'internal')
  }
  if (running.running) return failed(sessionId, 'running')

  let artifacts
  try {
    artifacts = await inspectArtifacts(env, sessionId)
  } catch (error) {
    if (error?.code === 'root-missing') return failed(sessionId, 'root-missing')
    logWarn(ctx, 'scan', error)
    return failed(sessionId, 'internal')
  }
  if (artifacts.status !== 'ok') return failed(sessionId, artifacts.status)

  let archived
  try {
    const ids = ctx.workspaceRegistry.archivedSessionIds
    archived = Array.isArray(ids) && ids.includes(sessionId)
  } catch (error) {
    logWarn(ctx, 'archive-set', error)
    return failed(sessionId, 'internal')
  }
  const hasArtifacts = artifacts.logPath !== null || artifacts.cachePath !== null
  if (archived) return hasArtifacts ? failed(sessionId, 'archived') : gone(sessionId)

  if (!hasArtifacts) {
    try {
      await ctx.workspaceRegistry.archiveSession(sessionId)
    } catch (error) {
      if (error?.name === 'WorkspaceActiveSessionError') {
        return failed(sessionId, 'active', { activity: activityKinds(error) })
      }
      // Unknown or any other archive failure leaves nothing to delete: the
      // session has no durable artifacts, so this is already an effective
      // deletion from the user's point of view.
    }
    return gone(sessionId)
  }

  try {
    await ctx.workspaceRegistry.archiveSession(sessionId)
  } catch (error) {
    if (error?.name === 'WorkspaceActiveSessionError') {
      return failed(sessionId, 'active', { activity: activityKinds(error) })
    }
    if (error?.name === 'WorkspaceUnknownSessionError') return failed(sessionId, 'unknown')
    logWarn(ctx, 'archive', error)
    return failed(sessionId, 'archive-failed')
  }

  try {
    running = await isRunning(ctx, sessionId)
  } catch (error) {
    running = { error }
  }
  if (running.error) {
    logWarn(ctx, 'post-archive-running-check', running.error)
    const restored = await unarchive(ctx, sessionId)
    return failed(sessionId, 'internal', restored ? undefined : { restoreFailed: true })
  }
  if (running.running) {
    const restored = await unarchive(ctx, sessionId)
    return failed(sessionId, 'running', restored ? undefined : { restoreFailed: true })
  }

  let removedCache = false
  if (artifacts.cachePath !== null) {
    try {
      await removeCacheFile(artifacts.cachePath)
      removedCache = true
    } catch (error) {
      logWarn(ctx, 'cache-delete', error)
      const restored = await unarchive(ctx, sessionId)
      const code = error?.code === 'unsafe' ? 'unsafe' : 'cache-locked'
      return failed(sessionId, code, restored ? undefined : { restoreFailed: true })
    }
  }

  let removedLog = false
  if (artifacts.logPath !== null) {
    try {
      await removeLogTree(artifacts.logPath)
      removedLog = true
    } catch (error) {
      logWarn(ctx, 'log-delete', error)
      const restored = await unarchive(ctx, sessionId)
      const code = error?.code === 'unsafe' ? 'unsafe' : 'log-locked'
      return failed(sessionId, code, restored ? undefined : { restoreFailed: true })
    }
  }

  return {
    sessionId,
    ok: true,
    code: 'ok',
    ...(removedLog ? { removedLog: true } : {}),
    ...(removedCache ? { removedCache: true } : {}),
  }
}

async function handleRequest(ctx, env, req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader?.('allow', 'POST')
      sendJson(res, 405, { ok: false, code: 'method' })
      return
    }
    if (!hasValidToken(req)) {
      sendJson(res, 403, { ok: false, code: 'forbidden' })
      return
    }

    const declaredLength = req.headers['content-length']
    if (typeof declaredLength === 'string' && Number(declaredLength) > MAX_BODY) {
      if (typeof req.resume === 'function') req.resume()
      sendJson(res, 413, { ok: false, code: 'too-large' })
      return
    }

    let body
    try {
      body = await readRequestBody(req)
    } catch (error) {
      if (error?.code === 'too-large') {
        sendJson(res, 413, { ok: false, code: 'too-large' })
        return
      }
      if (error?.code === 'aborted') return
      throw error
    }

    let parsed
    try {
      parsed = JSON.parse(body.toString('utf8'))
    } catch {
      sendJson(res, 400, { ok: false, code: 'bad-body' })
      return
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed) || !Array.isArray(parsed.sessionIds)) {
      sendJson(res, 400, { ok: false, code: 'bad-body' })
      return
    }
    if (parsed.sessionIds.length === 0) {
      sendJson(res, 400, { ok: false, code: 'bad-body' })
      return
    }
    if (parsed.sessionIds.length > MAX_IDS) {
      sendJson(res, 400, { ok: false, code: 'too-many' })
      return
    }

    const seen = new Set()
    const sessionIds = []
    for (const value of parsed.sessionIds) {
      if (seen.has(value)) continue
      seen.add(value)
      sessionIds.push(value)
      if (sessionIds.length >= MAX_IDS) break
    }

    const results = []
    for (const raw of sessionIds) {
      if (typeof raw !== 'string') {
        results.push(failed(String(raw), 'invalid-id'))
        continue
      }
      try {
        const result = await deleteOne(ctx, env, raw)
        results.push({ ...result, sessionId: raw })
      } catch (error) {
        logWarn(ctx, 'delete', error)
        results.push(failed(raw, 'internal'))
      }
    }

    sendJson(res, 200, {
      ok: results.every((result) => result.ok === true),
      results,
    })
  } catch (error) {
    logWarn(ctx, 'route', error)
    sendJson(res, 500, { ok: false, code: 'internal' })
  }
}

export function apply(ctx) {
  const dshHome = process.env.DSH_HOME?.trim() || path.join(os.homedir(), '.dsh')
  const env = {
    sessionsRoot: path.join(dshHome, 'sessions'),
    cacheRoot: path.join(dshHome, 'storages', 'session_projcache', 'sessions'),
  }

  ctx.effect(() => ctx.webServer.tapIndex((html) => injectTokenMeta(html)), 'dsh-subagent-sidebar-default: token meta')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: TOKEN_ROUTE,
    handler: (req, res) => handleTokenRequest(req, res),
  }), 'dsh-subagent-sidebar-default: token route')
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUTE,
    handler: (req, res) => handleRequest(ctx, env, req, res),
  }), 'dsh-subagent-sidebar-default: delete route')
}
