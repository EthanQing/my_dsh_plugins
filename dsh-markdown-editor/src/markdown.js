import { classifyLines } from './lists.js'
export const HIGHLIGHT_NAMES = {
  strong: 'dsh-mde-md-strong',
  em: 'dsh-mde-md-em',
  del: 'dsh-mde-md-del',
  code: 'dsh-mde-md-code',
  link: 'dsh-mde-md-link',
  heading: 'dsh-mde-md-heading',
  list: 'dsh-mde-md-list',
  marker: 'dsh-mde-md-marker',
}

/*
 * Every repetition below is length-bounded. The scanner runs on keystroke
 * (debounced) over text up to 100k characters, so an unbounded lazy body
 * would let a line full of `**` turn into quadratic work.
 */

/** Character classification for one text run; `null` means "leave it alone". */
export function classifyMarkdown(text) {
  const classes = new Array(text.length).fill(null)
  const claim = (start, end, name) => {
    if (start < 0) start = 0
    if (end > text.length) end = text.length
    for (let index = start; index < end; index++) if (classes[index] === null) classes[index] = name
  }

  // Claim fenced code first, so inline patterns never interpret its contents.
  let offset = 0
  for (const line of classifyLines(text)) {
    if (line.kind === 'code' || line.kind === 'fence') claim(offset, offset + line.text.length, line.kind === 'fence' ? 'marker' : 'code')
    offset += line.text.length + 1
  }

  // 1. Inline code wins over everything: its body is literal.
  const codePattern = /`([^`\n]{1,1000})`/g
  for (let match = codePattern.exec(text); match !== null; match = codePattern.exec(text)) {
    const start = match.index
    const end = start + match[0].length
    claim(start, start + 1, 'marker')
    claim(start + 1, end - 1, 'code')
    claim(end - 1, end, 'marker')
  }

  // 2. Links: `[label](url)`. The label is link-colored, the rest is syntax.
  const linkPattern = /\[([^\]\n]{0,500})\]\(([^()\s]{1,2000})\)/g
  for (let match = linkPattern.exec(text); match !== null; match = linkPattern.exec(text)) {
    const start = match.index
    const labelStart = start + 1
    const labelEnd = labelStart + match[1].length
    const end = start + match[0].length
    claim(labelStart, labelEnd, 'link')
    claim(start, labelStart, 'marker')
    claim(labelEnd, end, 'marker')
  }

  // 3. Strong: `**x**` and `__x__`.
  const strongPatterns = [/\*\*([^\n]{1,800}?)\*\*/g, /__([^\n]{1,800}?)__/g]
  for (const pattern of strongPatterns) {
    for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
      const start = match.index
      const bodyStart = start + 2
      const bodyEnd = bodyStart + match[1].length
      const end = start + match[0].length
      claim(bodyStart, bodyEnd, 'strong')
      claim(start, bodyStart, 'marker')
      claim(bodyEnd, end, 'marker')
    }
  }

  // 4. Strikethrough: `~~x~~`.
  const delPattern = /~~([^\n]{1,800}?)~~/g
  for (let match = delPattern.exec(text); match !== null; match = delPattern.exec(text)) {
    const start = match.index
    const bodyStart = start + 2
    const bodyEnd = bodyStart + match[1].length
    const end = start + match[0].length
    claim(bodyStart, bodyEnd, 'del')
    claim(start, bodyStart, 'marker')
    claim(bodyEnd, end, 'marker')
  }

  // 5. Emphasis: `*x*` / `_x_`, with word-boundary guards so `snake_case`
  //    and `a * b` are not mistaken for emphasis.
  const emPatterns = [
    { pattern: /(^|[^*_\w])\*([^\s*\n][^*\n]{0,400}?)\*(?!\*)/g, lead: 1 },
    { pattern: /(^|[^*_\w])_([^\s_\n][^_\n]{0,400}?)_(?!_)/g, lead: 1 },
  ]
  for (const { pattern, lead } of emPatterns) {
    for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
      const markerStart = match.index + match[lead].length
      const bodyStart = markerStart + 1
      const bodyEnd = bodyStart + match[2].length
      const end = bodyEnd + 1
      if (end > text.length) continue
      claim(bodyStart, bodyEnd, 'em')
      claim(markerStart, bodyStart, 'marker')
      claim(bodyEnd, end, 'marker')
    }
  }

  // 6. Line-start block syntax. The composer cannot reflow these lines (no
  //    decorator API), so only the marker and the line body get color.
  const headingPattern = /^([ \t]*)(#{1,6})([ \t]+)(.*)$/gm
  for (let match = headingPattern.exec(text); match !== null; match = headingPattern.exec(text)) {
    const lineStart = match.index
    const markerStart = lineStart + match[1].length
    const bodyStart = markerStart + match[2].length + match[3].length
    const bodyEnd = lineStart + match[0].length
    claim(markerStart, bodyStart, 'marker')
    claim(bodyStart, bodyEnd, 'heading')
  }

  const listPattern = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)/gm
  for (let match = listPattern.exec(text); match !== null; match = listPattern.exec(text)) {
    const markerStart = match.index + match[1].length
    const markerEnd = markerStart + match[2].length
    claim(markerStart, markerEnd, 'list')
    claim(markerEnd, markerEnd + match[3].length, 'marker')
  }

  const quotePattern = /^([ \t]*)(>)([ \t]?)/gm
  for (let match = quotePattern.exec(text); match !== null; match = quotePattern.exec(text)) {
    const markerStart = match.index + match[1].length
    const markerEnd = markerStart + 1
    claim(markerStart, markerEnd, 'marker')
  }

  return classes
}

/** Collapse a per-character classification into the minimal run list. */
export function buildRuns(classes) {
  const runs = []
  let index = 0
  while (index < classes.length) {
    const name = classes[index]
    let next = index + 1
    while (next < classes.length && classes[next] === name) next++
    if (name !== null) runs.push({ name, start: index, end: next })
    index = next
  }
  return runs
}
