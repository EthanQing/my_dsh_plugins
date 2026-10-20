import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const execute = promisify(execFile)

// No shell, index writes, filters, textconv, hooks, or external diff drivers.
export async function git(cwd, args, { input, maxBuffer = 72 * 1024 * 1024, signal } = {}) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')))
  Object.assign(env, { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' })
  const diffConfig = args[0] === 'diff' ? ['-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false'] : []
  const child = execute('git', [...diffConfig, '-c', 'core.quotePath=false', ...args], { cwd, env, encoding: 'buffer', maxBuffer, timeout: 20000, windowsHide: true, signal })
  child.child.stdin.on('error', () => {}) // The process promise reports early exits/timeouts; EPIPE must not crash Host.
  if (input !== undefined) child.child.stdin.end(input)
  else child.child.stdin.end()
  try { return (await child).stdout }
  catch (error) {
    if (error.code === 1 && args[0] === 'diff' && Buffer.isBuffer(error.stdout)) return error.stdout
    throw new Error(`Git read failed (${error.code ?? 'aborted'})`)
  }
}

export function parseNames(output) {
  const parts = output.toString('utf8').split('\0'), files = []
  for (let i = 0; i < parts.length && parts[i];) {
    const status = parts[i++], old = parts[i++], renamed = status[0] === 'R' || status[0] === 'C'
    const next = renamed ? parts[i++] : old
    const clean = value => value?.replace(/^(?:before|after)\//, '')
    files.push({ status: status[0], oldPath: clean(old), relative: clean(next) })
  }
  return files
}

export function parseHunks(output) {
  const hunks = []; let hunk
  for (const line of output.toString('utf8').split('\n')) {
    const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line)
    if (match) {
      hunk = { oldStart: +match[1], oldLines: +(match[2] ?? 1), newStart: +match[3], newLines: +(match[4] ?? 1), lines: [] }
      hunks.push(hunk)
    } else if (hunk && /^[+ -]/.test(line)) hunk.lines.push(line.replace(/\r$/, ''))
  }
  return hunks
}

export function parseStats(output) {
  const parts = output.toString('utf8').split('\0'), result = new Map()
  for (let at = 0; at < parts.length && parts[at];) {
    const match = /^([\d-]+)\t([\d-]+)\t([\s\S]*)$/.exec(parts[at++])
    if (!match) throw new Error('Git numstat output was incomplete')
    let name = match[3]
    if (name === '') { const before = parts[at++], after = parts[at++]; name = after === '/dev/null' ? before : after }
    result.set(name.replace(/^(?:before|after)\//, ''), match[1] === '-' || match[2] === '-'
      ? { binary: true, added: 0, deleted: 0 } : { added: +match[1], deleted: +match[2] })
  }
  return result
}
