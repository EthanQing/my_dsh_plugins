import { spawn } from 'node:child_process'

export const COMMIT_INPUT_BUDGET = 48 * 1024
const SAMPLE_BYTES = 6 * 1024
export const DIFF_READ_LIMIT = 256 * 1024
const MAX_SAMPLES = 8

function utf8Prefix(text, bytes) {
  const buffer = Buffer.from(text)
  if (buffer.length <= bytes) return text
  let end = Math.max(0, bytes)
  while (end > 0 && (buffer[end] & 0xc0) === 0x80) end--
  return buffer.subarray(0, end).toString('utf8')
}

// Stream metadata and patches without buffering whole outputs. A false callback
// result stops Git at the sample read cap; other nonzero exits remain Git errors.
// Stderr is bounded independently.
function readGit(root, args, onData, signal) {
  return new Promise((resolve, reject) => {
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')))
    Object.assign(env, { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C' })
    const child = spawn('git', ['--literal-pathspecs', '-c', 'core.autocrlf=false', '-c', 'core.safecrlf=false', '-c', 'core.quotePath=false', ...args], { cwd: root, env, windowsHide: true, signal, stdio: ['ignore', 'pipe', 'pipe'] })
    let failure, limited = false, stderr = Buffer.alloc(0)
    const timer = setTimeout(() => { failure = new Error('Git 读取超时'); child.kill() }, 20000)
    child.on('error', error => { failure = error })
    child.stdout.on('data', data => {
      if (failure || limited) return
      try { if (onData(data) === false) { limited = true; child.kill() } } catch (error) { failure = error; child.kill() }
    })
    child.stderr.on('data', data => { if (stderr.length < 2048) stderr = Buffer.concat([stderr, data.subarray(0, 2048 - stderr.length)]) })
    child.on('close', code => {
      clearTimeout(timer)
      if (failure) reject(failure)
      else if (limited) resolve({ limited: true })
      else if (code !== 0) reject(new Error(`Git 读取失败（退出码 ${code}）：${stderr.toString('utf8').trim()}`))
      else resolve({ limited: false })
    })
  })
}

async function readTokens(root, args, consume, signal) {
  let pending = Buffer.alloc(0)
  await readGit(root, args, data => {
    pending = Buffer.concat([pending, data])
    let offset = 0, end
    while ((end = pending.indexOf(0, offset)) !== -1) {
      consume(pending.subarray(offset, end).toString('utf8'))
      offset = end + 1
    }
    pending = Buffer.from(pending.subarray(offset))
  }, signal)
  if (pending.length) throw new Error('Git 元数据输出不完整')
}

const diffArgs = ['diff', '--cached', '--no-ext-diff', '--no-textconv', '--no-color', '--find-renames']

export async function readStagedFiles(root, signal) {
  const files = []
  let status, before
  await readTokens(root, [...diffArgs, '--name-status', '-z'], token => {
    if (status === undefined) { status = token; return }
    if (/^[RC]/.test(status) && before === undefined) { before = token; return }
    files.push({ status, path: token, ...(before !== undefined ? { oldPath: before } : {}) })
    status = before = undefined
  }, signal)
  if (status !== undefined) throw new Error('Git 文件状态输出不完整')
  const stats = new Map()
  let rename, oldPath
  await readTokens(root, [...diffArgs, '--numstat', '-z'], token => {
    if (rename) {
      if (oldPath === undefined) { oldPath = token; return }
      stats.set(token, rename)
      rename = oldPath = undefined
      return
    }
    const match = /^(\d+|-)\t(\d+|-)\t([\s\S]*)$/.exec(token)
    if (!match) throw new Error('Git numstat 输出不完整')
    const stat = match[1] === '-' || match[2] === '-' ? { binary: true } : { added: Number(match[1]), deleted: Number(match[2]) }
    if (match[3] === '') rename = stat
    else stats.set(match[3], stat)
  }, signal)
  if (rename) throw new Error('Git 重命名统计输出不完整')
  for (const file of files) {
    if (!stats.has(file.path)) throw new Error('Git 暂存区状态与统计不一致，请刷新后重试')
    Object.assign(file, stats.get(file.path))
  }
  return files
}

function decodeWindow(buffer, trimStart, trimEnd) {
  let start = 0, end = buffer.length
  if (trimStart) while (start < end && (buffer[start] & 0xc0) === 0x80) start++
  if (trimEnd && end > start) {
    let lead = end - 1
    while (lead > start && (buffer[lead] & 0xc0) === 0x80) lead--
    const byte = buffer[lead]
    const length = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : byte >= 0xc0 ? 2 : 1
    if (lead + length > end) end = lead
  }
  return buffer.subarray(start, end).toString('utf8')
}

export async function sampleStagedDiff(root, file, signal, budget = SAMPLE_BYTES) {
  const half = Math.floor(budget / 2)
  let head = Buffer.alloc(0), tail = Buffer.alloc(0), total = 0, error, limited = false
  try {
    const result = await readGit(root, [...diffArgs, '--unified=2', '--', ...(file.oldPath ? [file.oldPath] : []), file.path], chunk => {
      const data = chunk.subarray(0, DIFF_READ_LIMIT - total)
      total += data.length
      const take = Math.min(half - head.length, data.length)
      if (take > 0) head = Buffer.concat([head, data.subarray(0, take)])
      const rest = data.subarray(take)
      if (rest.length) tail = Buffer.concat([tail, rest.subarray(-half)]).subarray(-half)
      return total < DIFF_READ_LIMIT
    }, signal)
    limited = result.limited
  } catch (cause) {
    if (signal?.aborted) throw cause
    error = cause.message
  }
  const truncated = total > budget || limited
  const text = truncated
    ? decodeWindow(head, false, true) + '\n[中间 Diff 已省略；以下为已读取窗口的尾部，不代表文件末尾]\n' + decodeWindow(tail, true, limited || !!error)
    : Buffer.concat([head, tail]).toString('utf8')
  return { text, truncated, limited, bytes: total, error }
}

function importance(file) {
  if (file.binary) return -10
  if (/(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|lib\/|dist\/)|\.min\./.test(file.path)) return -5
  if (/\.(?:[cm]?[jt]sx?|py|rs|go|java|cpp|c|h|vue|svelte)$/.test(file.path)) return 5
  return 0
}

export async function collectCommitInput(root, signal, inputBudget = COMMIT_INPUT_BUDGET) {
  const files = await readStagedFiles(root, signal)
  const totals = files.reduce((sum, file) => ({ added: sum.added + (file.added ?? 0), deleted: sum.deleted + (file.deleted ?? 0), binary: sum.binary + Number(!!file.binary) }), { added: 0, deleted: 0, binary: 0 })
  const header = `真实 Git 暂存区：共 ${files.length} 个文件，文本新增 ${totals.added} 行、删除 ${totals.deleted} 行，二进制 ${totals.binary} 个。\n状态及 numstat 已完整读取；文件名使用 JSON 转义。以下内容仅来自暂存区。\n`
  let manifest = '', shown = 0
  for (const file of files) {
    const row = JSON.stringify(file) + '\n'
    if (Buffer.byteLength(manifest) + Buffer.byteLength(row) > 16 * 1024) break
    manifest += row
    shown++
  }
  let text = header + manifest
  if (shown < files.length) text += `[输入预算限制：省略 ${files.length - shown} 个文件的逐项名称及统计；它们已计入总数，不能推测其具体改动。]\n`
  const selected = [...files].sort((a, b) => importance(b) - importance(a)).filter(file => !file.binary).slice(0, MAX_SAMPLES)
  let failures = 0, truncated = 0, sampled = 0
  for (const file of selected) {
    // Reserve room for the final coverage disclosure and never cut a metadata row.
    const available = inputBudget - Buffer.byteLength(text) - 2048
    if (available < 1024) break
    const sample = await sampleStagedDiff(root, file, signal, Math.min(SAMPLE_BYTES, available - 512))
    sampled++
    if (sample.error) failures++
    if (sample.truncated) truncated++
    const label = `\nDiff 采样 ${JSON.stringify(file.path)}（已读取 ${sample.bytes} 字节${sample.limited ? '，达到单文件读取上限后停止' : ''}${sample.truncated ? '，仅采样已读取窗口首尾' : ''}）${sample.error ? `\n[该文件 Diff 未完整读取：${sample.error}]` : ''}\n`
    text += utf8Prefix(label + sample.text, available) + '\n'
  }
  text += `\n覆盖说明：${files.length} 个文件的状态与统计已读取，展示 ${shown} 条；采样 ${sampled} 个文本文件，其中 ${truncated} 个大 Diff 仅含已读取窗口首尾，${failures} 个读取失败。未采样文件和二进制文件只提供已知元数据。仅依据已知信息生成提交信息，不推测省略或不可读部分，不声称完整审阅或运行过测试。`
  return utf8Prefix(text, inputBudget)
}
