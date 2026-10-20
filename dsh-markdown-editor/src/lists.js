// CommonMark-style fences: closing delimiter must match and be at least as long.
export function classifyLines(text) {
  let fence = null
  return text.split('\n').map(text => {
    // Be conservative for indented/list/quote-contained fences too: suppress
    // list gestures inside them instead of guessing at a block parser's layout.
    const direct = /^(?:[ \t]*>[ \t]*)*[ \t]*(`{3,}|~{3,})(.*)$/.exec(text)
    const match = direct
      ?? /^[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+(`{3,}|~{3,})(.*)$/.exec(text)
    if (fence) {
      if (direct && direct[1][0] === fence.char && direct[1].length >= fence.size && /^[ \t]*$/.test(direct[2])) {
        fence = null
        return { kind: 'fence', text }
      }
      return { kind: 'code', text }
    }
    if (match && !(match[1][0] === '`' && match[2].includes('`'))) {
      fence = { char: match[1][0], size: match[1].length }
      return { kind: 'fence', text }
    }
    const list = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)(.*)$/.exec(text)
    if (!list) return { kind: 'text', text }
    return { kind: 'list', text, indent: list[1], marker: list[2], spacer: list[3], body: list[4], bodyStart: list[1].length + list[2].length + list[3].length }
  })
}

export function planListEdit(text, caret, key, shift = false) {
  if (text.length > 100000 || caret < 0 || caret > text.length) return null
  const start = caret === 0 ? 0 : text.lastIndexOf('\n', caret - 1) + 1
  const newline = text.indexOf('\n', caret)
  const end = newline < 0 ? text.length : newline
  const item = classifyLines(text.slice(0, end)).at(-1)
  if (item?.kind !== 'list') return null
  if (key === 'Enter') {
    if (shift || caret < start + item.bodyStart) return null
    if (item.body.trim() === '') return { from: start, to: end, text: '', caret: start }
    const ordered = /^(\d+)([.)])$/.exec(item.marker)
    if (ordered && Number(ordered[1]) >= 999999999) return null
    const marker = ordered ? `${Number(ordered[1]) + 1}${ordered[2]}` : item.marker
    const next = `\n${item.indent}${marker}${item.spacer}`
    return { from: caret, to: caret, text: next, caret: caret + next.length }
  }
  if (key !== 'Tab') return null
  if (!shift) return { from: start, to: start, text: '  ', caret: caret + 2 }
  const count = item.indent.startsWith('\t') ? 1 : Math.min(2, item.indent.length)
  if (!count) return null
  return { from: start, to: start + count, text: '', caret: Math.max(start, caret - count) }
}
