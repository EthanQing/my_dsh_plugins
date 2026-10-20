const READ = new Set(['read', 'read_file', 'read_text_file', 'read_multiple_files', 'read_image'])
const EDIT = new Set(['edit', 'write', 'write_file', 'edit_file', 'apply_patch'])
const SEARCH = new Set(['grep', 'glob', 'search', 'web_search', 'web_fetch'])
const COMMAND = new Set(['bash', 'pwsh', 'exec_command', 'write_stdin', 'run_code'])
const QUESTIONS = /(?:^|[._])(?:ask_user_question|request_user_input|request_user_input_async|ask_question|approval)(?:$|_)/
const INTERNAL = new Set(['context', 'system-prompt', 'command', 'compaction', 'manual-compaction', 'model-retry'])

export function turnOf(node) {
  const location = node?.location
  return location?.kind === 'turn' || location?.kind === 'step' ? location.turn : null
}

export function phaseOf(turn) {
  if (turn?.status !== 'closed') return 'running'
  const reason = turn.end?.data?.reason?.kind
  if (reason === 'aborted' || reason === 'interrupted') return 'stopped'
  if (reason === 'error') return 'failed'
  return reason === 'completed' ? 'completed' : 'incomplete'
}

export function toolKind(name = '') {
  const short = name.split(/[./]/).at(-1)
  if (QUESTIONS.test(name)) return 'question'
  if (READ.has(short)) return 'read'
  if (EDIT.has(short)) return 'edit'
  if (SEARCH.has(short) || short.endsWith('_inspect')) return 'search'
  if (COMMAND.has(short) || short.startsWith('terminal_')) return 'command'
  if (short === 'subagent' || short.startsWith('subagent_')) return 'subagent'
  return 'tool'
}

function arg(tool, key) {
  try { return tool.args?.value?.(key) ?? tool.args?.[key] } catch { return undefined }
}

export function toolName(tool) { return tool.name || tool.call?.name || '' }

export function needsAttention(tool, seen = new Set()) {
  if (!tool || seen.has(tool)) return false
  seen.add(tool)
  const kind = toolKind(toolName(tool))
  const live = tool.kind !== 'tool-result'
  return tool.isError === true || (live && (kind === 'question' || kind === 'tool'
    || arg(tool, 'sandbox_permissions') === 'require_escalated'
    || tool.meta?.requiresApproval === true || tool.meta?.waitingForInput === true))
    || (tool.subCalls ?? []).some(child => needsAttention(child, seen))
}

function pathsOf(tool) {
  const paths = []
  for (const key of ['file_path', 'path', 'file', 'paths']) {
    const value = arg(tool, key)
    for (const item of Array.isArray(value) ? value : [value]) {
      if (typeof item === 'string' && item.trim()) paths.push(item.replaceAll('\\', '/'))
    }
  }
  if (toolName(tool).endsWith('apply_patch')) {
    const patch = arg(tool, 'patch') ?? arg(tool, 'input')
    if (typeof patch === 'string') {
      for (const match of patch.matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm)) paths.push(match[1].trim())
    }
  }
  return paths
}

export function toolDetail(tool) {
  const value = pathsOf(tool)[0] ?? arg(tool, 'cmd') ?? arg(tool, 'command') ?? arg(tool, 'pattern') ?? arg(tool, 'query')
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 120) : toolName(tool)
}

export function isBuild(tool) {
  const command = arg(tool, 'cmd') ?? arg(tool, 'command')
  return typeof command === 'string' && /(?:\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:build|test|check)\b|\b(?:cargo|dotnet)\s+(?:build|test)\b|\b(?:make|cmake|msbuild)\b)/i.test(command)
}

export function describeTurn(nodes, turn) {
  const reads = new Set()
  const edits = new Set()
  const calls = new Map()
  const hidden = []
  let reasoning = 0
  let contexts = 0
  let last = null
  let active = null
  let waiting = false
  let errors = 0
  const visited = new Set()
  const visit = tool => {
    if (!tool || visited.has(tool)) return
    visited.add(tool)
    const id = tool.callId
    if (id && calls.has(id)) return
    const kind = toolKind(toolName(tool))
    const live = tool.kind !== 'tool-result'
    const item = { kind, detail: toolDetail(tool), build: kind === 'command' && isBuild(tool), time: tool.callTime ?? tool.time ?? 0 }
    if (id) calls.set(id, item)
    if (!last || item.time >= last.time) last = item
    if (live && (!active || item.time >= active.time)) active = item
    if (tool.isError) errors++
    if (live && (kind === 'question' || arg(tool, 'sandbox_permissions') === 'require_escalated'
      || tool.meta?.requiresApproval || tool.meta?.waitingForInput)) waiting = true
    if (!live && !tool.isError) {
      if (kind === 'read') for (const file of pathsOf(tool)) reads.add(file)
      if (kind === 'edit') for (const file of pathsOf(tool)) edits.add(file)
    }
    for (const child of tool.subCalls ?? []) visit(child)
  }
  for (const node of nodes) {
    if (turnOf(node)?.turn !== turn.turn) continue
    if (node.kind === 'tool-call') {
      visit(node.data.root)
      if (!needsAttention(node.data.root)) hidden.push({ key: node.key })
    } else if (node.kind === 'assistant-step') {
      const blocks = node.data.blocks ?? []
      if (blocks.some(block => block.kind === 'reasoning' && block.text?.trim())) {
        reasoning++
        // Only the host's reasoning-only portion. Never hide a mixed/prose row.
        hidden.push({ key: node.key, part: 'reasoning' })
      }
    } else if (INTERNAL.has(node.kind)) {
      // Unknown commands may contain interactive plugin UI: retain them.
      if (node.kind === 'command' || node.kind === 'manual-compaction' || node.kind === 'model-retry') continue
      contexts++
      hidden.push({ key: node.key })
    }
  }
  const phase = phaseOf(turn)
  return {
    phase, active: phase === 'running' ? active : null, last,
    waiting: phase === 'running' && waiting, errors,
    reads: reads.size, edits: edits.size, calls: calls.size, reasoning, contexts,
    workCount: calls.size + reasoning + contexts, hidden,
  }
}

export function summary(model, tr) {
  const pieces = [tr(model.waiting ? 'waiting' : model.phase)]
  if (model.phase === 'running' && !model.waiting) {
    const work = model.active
    pieces[0] = tr(work ? work.build ? 'doing.build' : `doing.${work.kind}` : 'doing.thinking')
    if (work?.detail) pieces.push(work.detail)
  } else {
    if (model.reads) pieces.push(tr('count.read', { n: model.reads }))
    if (model.edits) pieces.push(tr('count.edit', { n: model.edits }))
    if (model.calls && !model.reads && !model.edits) pieces.push(tr('count.calls', { n: model.calls }))
    if (model.phase === 'stopped' && model.last) pieces.push(tr('last', { detail: model.last.detail }))
  }
  if (model.errors) pieces.push(tr('count.errors', { n: model.errors }))
  return pieces.join(' · ')
}
