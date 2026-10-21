/**
 * Pure title helpers shared by the Host provider, the batch preview, and the
 * tests: output cleaning, length/topic rules, bounded input framing, and the
 * content version that freezes one confirmed candidate.
 *
 * Nothing here reads a Session, touches a service, or imports the runtime, so
 * the rules stay testable without a composed Harness.
 */

/** Accepted rendered length of one generated title, in Unicode code points. */
export const TITLE_MIN_CODE_POINTS = 6
/** Upper bound of one generated title, in Unicode code points. */
export const TITLE_MAX_CODE_POINTS = 16

/** Separator used when one message has several text blocks. */
const JOIN_NEWLINE = String.fromCharCode(10)

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/gu
const LEADING_CODE_FENCE = /^```[^\n]*\n?/u
const TRAILING_CODE_FENCE = /\n?```$/u
const LIST_MARKER = /^(?:[-*+]\s+|\d{1,3}[.)]\s+|#{1,6}\s+|>\s*)/u
const QUOTE_PAIRS = [
  ['"', '"'],
  ["'", "'"],
  ['`', '`'],
  ['\u201c', '\u201d'],
  ['\u2018', '\u2019'],
  ['\u300c', '\u300d'],
  ['\u300e', '\u300f'],
  ['\u300a', '\u300b'],
]
const EMPHASIS_MARKERS = /^\*{1,3}(.*?)\*{1,3}$/u
const TITLE_LABEL_PREFIX = /^(?:标题|会话标题|title)\s*[:：]\s*/iu

/**
 * Count rendered characters by code point.
 * @param text - arbitrary text.
 * @returns the number of Unicode code points.
 */
export function countCodePoints(text) {
  let count = 0
  for (const _ of text) count += 1
  return count
}

/**
 * Reduce one model line to a bare title.
 * @param line - one line of model output.
 * @returns the cleaned line, possibly empty.
 */
function cleanLine(line) {
  let text = line.replace(CONTROL_CHARACTERS, '').trim()
  text = text.replace(LEADING_CODE_FENCE, '').replace(TRAILING_CODE_FENCE, '').trim()
  // A heading may wrap an ordered-list marker (`### 1. Title`), so peel markers
  // repeatedly instead of assuming one layer.
  for (let pass = 0; pass < 3; pass += 1) {
    const stripped = text.replace(LIST_MARKER, '').trim()
    if (stripped === text) break
    text = stripped
  }
  text = text.replace(TITLE_LABEL_PREFIX, '').trim()
  const emphasis = EMPHASIS_MARKERS.exec(text)
  if (emphasis !== null) text = emphasis[1].trim()
  text = text.replace(/[*_~]+/gu, '').trim()
  for (const [open, close] of QUOTE_PAIRS) {
    if (text.length > close.length && text.startsWith(open) && text.endsWith(close)) {
      text = text.slice(open.length, text.length - close.length).trim()
    }
  }
  return text.replace(/\s+/gu, ' ').trim()
}

/**
 * Take the first non-empty line of model output as the title candidate.
 * @param raw - the model's text output.
 * @returns the cleaned candidate, or an empty string when none remains.
 */
export function cleanTitle(raw) {
  if (typeof raw !== 'string') return ''
  for (const line of raw.split(/\r?\n/u)) {
    const cleaned = cleanLine(line)
    if (cleaned.length > 0) return cleaned
  }
  return ''
}

/**
 * Whether a cleaned title satisfies the configured length window.
 * @param title - cleaned title.
 * @returns true when the code-point count is inside the window.
 */
export function isTitleLengthValid(title) {
  const count = countCodePoints(title)
  return count >= TITLE_MIN_CODE_POINTS && count <= TITLE_MAX_CODE_POINTS
}

/**
 * Compare a title for topic identity, ignoring spacing, punctuation, case,
 * and wrapping punctuation. Equal keys mean "same subject".
 * @param value - title text.
 * @returns the comparison key.
 */
export function titleTopicKey(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]+/gu, '')
}

/**
 * Whether two titles name the same subject.
 * @param left - first title.
 * @param right - second title.
 * @returns true when their topic keys are non-empty and equal.
 */
export function isSameTopic(left, right) {
  const key = titleTopicKey(left)
  return key.length > 0 && key === titleTopicKey(right)
}

/**
 * Accept a model title under the length/topic policy.
 * @param raw - model text output.
 * @param options - current title and acceptance mode.
 * @returns a decision: `{kind:'accept', title}` or `{kind:'reject', reason}`.
 */
export function decideTitle(raw, { currentTitle } = {}) {
  const title = cleanTitle(raw)
  if (title.length === 0) return { kind: 'reject', reason: 'empty' }
  if (!isTitleLengthValid(title)) return { kind: 'reject', reason: 'length' }
  if (typeof currentTitle === 'string' && currentTitle.length > 0 && isSameTopic(title, currentTitle)) {
    return { kind: 'accept', title: currentTitle, sameTopic: true }
  }
  return { kind: 'accept', title }
}

/**
 * Stable 32-bit FNV-1a hash of one string, rendered as hex.
 * @param text - input text.
 * @returns eight lowercase hex digits.
 */
export function hashText(text) {
  let hash = 0x811c9dc5
  for (const byte of Buffer.from(String(text), 'utf8')) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Build the content version of one Session snapshot.
 *
 * The key covers the newest content event, the last human message, and its
 * text — plus, only when it is a USER title, the manual name. Title
 * bookkeeping (`session/title` from a provider or the fallback, and the
 * `session/title-llm-request` record) never participates, because committing
 * the title this key authorized must not invalidate the version that produced
 * it. A manual rename still changes the key, so a preview taken before it can
 * never be confirmed after it.
 * @param sessionId - owning session id.
 * @param events - the session event log snapshot.
 * @param lastUserSeq - seq of the last eligible human message.
 * @returns an opaque version key.
 */
export function versionKeyOf(sessionId, events, lastUserSeq) {
  let userTitleSeq = -1
  let userTitle = ''
  let userText = ''
  let lastContentSeq = -1
  for (const event of events) {
    if (event.type === 'session/title') {
      if (event.data.source?.kind === 'user') {
        userTitleSeq = event.seq
        userTitle = event.data.title
      }
      continue
    }
    if (event.type === 'session/title-llm-request') continue
    lastContentSeq = event.seq
    if (event.type === 'user/message' && event.seq === lastUserSeq) {
      userText = event.data.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join(JOIN_NEWLINE)
    }
  }
  return `${sessionId}|${lastContentSeq}|${lastUserSeq}|${hashText(userText)}|${userTitleSeq}|${hashText(userTitle)}`
}

/**
 * Collect title-eligible human messages from a Session log.
 * @param events - session event log.
 * @returns messages with their seqs, in log order.
 */
export function collectUserMessages(events) {
  const messages = []
  for (const event of events) {
    if (event.type !== 'user/message') continue
    if (event.data.source?.kind !== 'user') continue
    const text = event.data.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim()
    if (text.length === 0) continue
    messages.push({ seq: event.seq, text })
  }
  return messages
}

/** Last assistant text captured for one turn. */
const ASSISTANT_EXCERPT_LIMIT = 4000

/**
 * Read the assistant text that completed one turn.
 * @param events - session event log.
 * @param afterSeq - last human message seq of the turn.
 * @param throughSeq - the turn boundary seq to stop at.
 * @returns plain assistant text, capped, or an empty string.
 */
export function assistantTextAfter(events, afterSeq, throughSeq) {
  const chunks = []
  for (const event of events) {
    if (event.seq <= afterSeq) continue
    if (throughSeq !== undefined && event.seq > throughSeq) break
    if (event.type !== 'assistant/message') continue
    const text = event.data.message.content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n')
      .trim()
    if (text.length > 0) chunks.push(text)
  }
  const joined = chunks.join('\n')
  return Array.from(joined).slice(-ASSISTANT_EXCERPT_LIMIT).join('')
}

/**
 * Frame the provider input: conversation goal, the turn's assistant answer,
 * and the standing title.
 * @param options - messages, assistant excerpt, current title, budget.
 * @returns the JSON-framed input text.
 */
const INPUT_PREFIX = '为下面的会话生成标题（JSON）：\n'

/** Fit a Unicode prefix to its JSON string-content byte allowance. */
function fitJsonText(text, bytes) {
  let result = ''
  for (const point of String(text ?? '')) {
    const cost = Buffer.byteLength(JSON.stringify(point), 'utf8') - 2
    if (cost > bytes) break
    result += point
    bytes -= cost
  }
  return result
}

export function buildProviderInput({ messages, assistantText, currentTitle, budgetBytes }) {
  if (!Number.isSafeInteger(budgetBytes) || budgetBytes < 0) throw new Error('smart-session-title: invalid input byte budget')
  const selected = messages.length === 0 ? [] : [messages[0]]
  const latest = messages.at(-1)
  if (latest && latest.seq !== selected[0].seq) selected.push(latest)
  const payload = {
    goal: selected.map(message => ({ seq: message.seq, text: '' })),
    assistant: '',
    currentTitle: '',
  }
  const serialize = () => `${INPUT_PREFIX}${JSON.stringify(payload)}`
  const remaining = () => budgetBytes - Buffer.byteLength(serialize(), 'utf8')
  if (remaining() < 0) throw new Error('smart-session-title: input byte budget cannot fit the JSON envelope')
  // Keep a short reply excerpt and divide the remaining goal space fairly.
  const available = remaining()
  payload.assistant = fitJsonText(assistantText, Math.min(600, Math.floor(available * 0.2)))
  payload.currentTitle = fitJsonText(typeof currentTitle === 'string' ? currentTitle : '', Math.min(192, Math.floor(available * 0.1)))
  const share = Math.floor(remaining() / Math.max(1, selected.length))
  for (let index = 0; index < selected.length; index += 1) {
    payload.goal[index].text = fitJsonText(selected[index].text, share)
  }
  for (let index = 0; index < selected.length; index += 1) {
    const existingBytes = Buffer.byteLength(JSON.stringify(payload.goal[index].text), 'utf8') - 2
    payload.goal[index].text = fitJsonText(selected[index].text, existingBytes + remaining())
  }
  for (let index = messages.length - 2; index > 0; index -= 1) {
    const message = messages[index]
    if (payload.goal.some(item => item.seq === message.seq)) continue
    // UTF-16 length is a cheap lower bound for JSON UTF-8 bytes: do not
    // serialize a huge intermediate message that cannot possibly fit.
    if (message.text.length > remaining()) continue
    const candidate = { seq: message.seq, text: message.text }
    payload.goal.splice(1, 0, candidate)
    if (remaining() < 0) payload.goal.splice(1, 1)
  }
  const input = serialize()
  if (Buffer.byteLength(input, 'utf8') > budgetBytes) throw new Error('smart-session-title: input exceeds byte budget')
  return { input, messageSeqs: payload.goal.map(message => message.seq) }
}

/**
 * Read the latest title snapshot from a Session log without a service call.
 * @param events - session event log.
 * @returns the latest `session/title` data, or undefined.
 */
export function latestTitleEvent(events) {
  return events.findLast(event => event.type === 'session/title')
}

/**
 * Whether the session currently has an unfinished turn.
 * @param events - session event log.
 * @returns true when the newest turn boundary is a start.
 */
export function isTurnRunning(events) {
  let running = false
  for (const event of events) {
    if (event.type === 'turn/start') running = true
    else if (event.type === 'turn/end') running = false
  }
  return running
}
