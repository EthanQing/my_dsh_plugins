import { HIGHLIGHT_NAMES, classifyMarkdown, buildRuns } from './markdown.js'
import { focusedComposerRoot } from './composer.js'
const NS = 'dsh-markdown-editor'
const MAX_SCAN_CHARS = 100000
const MAX_RUNS = 4000
const HIGHLIGHT_DELAY_MS = 40
const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'BLOCKQUOTE', 'UL', 'OL', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'])

/**
 * Flatten the editable subtree into one string plus the map that turns a
 * string offset back into a DOM position. Chips and line breaks become
 * sentinel newlines: they must neither be matched nor let a pattern span
 * across them.
 */
function collectTextSegments(root) {
  const segments = []
  let text = ''
  const visit = (node) => {
    if (node.nodeType === 3) {
      const value = node.data
      if (value.length === 0) return
      const start = text.length
      text += value
      segments.push({ node, start, end: text.length })
      return
    }
    if (node.nodeType !== 1) return
    const element = node
    if (
      element.getAttribute('contenteditable') === 'false' ||
      element.hasAttribute('data-composer-chip') ||
      element.hasAttribute('data-composer-command') ||
      element.hasAttribute('data-composer-text-ref')
    ) {
      text += '\n'
      return
    }
    if (element.tagName === 'BR') {
      text += '\n'
      return
    }
    for (const child of element.childNodes) {
      visit(child)
      if (child.nodeType === 1 && BLOCK_TAGS.has(child.tagName)) text += '\n'
    }
  }
  visit(root)
  return { text, segments }
}

/** Offset → DOM position inside the flattened editor text. */
function positionAt(segments, offset) {
  let low = 0
  let high = segments.length - 1
  while (low <= high) {
    const middle = (low + high) >> 1
    const segment = segments[middle]
    if (offset < segment.start) high = middle - 1
    else if (offset > segment.end) low = middle + 1
    else {
      const local = Math.max(0, Math.min(segment.end - segment.start, offset - segment.start))
      return { node: segment.node, offset: local }
    }
  }
  if (segments.length === 0) return null
  // The offset fell in a sentinel gap: clamp to the nearest real boundary.
  if (low >= segments.length) {
    const last = segments[segments.length - 1]
    return { node: last.node, offset: last.end - last.start }
  }
  return { node: segments[low].node, offset: 0 }
}

export function createComposerHighlighter() {
  const supported =
    typeof globalThis.CSS !== 'undefined' &&
    globalThis.CSS !== null &&
    typeof globalThis.CSS.highlights === 'object' &&
    globalThis.CSS.highlights !== null &&
    typeof globalThis.Highlight === 'function'
  if (supported === false) {
    // Silent degradation: an engine without the Highlight API keeps a fully
    // working composer, just without syntax tinting.
    return { start: () => {}, dispose: () => {} }
  }

  let editor = null
  let timer = 0
  let composing = false
  let lastText = null
  let lastSegments = []
  let disposed = false
  const bound = []
  let observer = null

  const listen = (target, type, handler, options) => {
    target.addEventListener(type, handler, options)
    bound.push(() => target.removeEventListener(type, handler, options))
  }

  function clearAll() {
    lastText = null
    lastSegments = []
    for (const name of Object.values(HIGHLIGHT_NAMES)) {
      try {
        globalThis.CSS.highlights.delete(name)
      } catch (error) {
        console.warn(`[${NS}] unable to clear highlight '${name}':`, error)
      }
    }
  }

  function releaseEditor() {
    editor = null
    clearAll()
  }

  function activeEditor() {
    return focusedComposerRoot(document)
  }

  function rangeFor(segments, start, end) {
    const from = positionAt(segments, start)
    const to = positionAt(segments, end)
    if (from === null || to === null) return null
    if (from.node === to.node && from.offset >= to.offset) return null
    const range = document.createRange()
    try {
      range.setStart(from.node, from.offset)
      range.setEnd(to.node, to.offset)
    } catch (error) {
      return null
    }
    return range
  }

  function refresh() {
    if (editor === null || editor.isConnected === false) {
      releaseEditor()
      return
    }
    const { text, segments } = collectTextSegments(editor)
    if (segments.length === 0) {
      releaseEditor()
      return
    }
    /*
     * Two cheap invalidation keys. The text itself catches edits; the first
     * text node's identity catches a Lexical re-render that swapped the DOM
     * under us without changing the content — the previous `Range`s would
     * still be alive but detached, and the paint would silently vanish.
     */
    if (text === lastText && segments.length === lastSegments.length && segments.every((s, i) => s.node === lastSegments[i].node && s.start === lastSegments[i].start && s.end === lastSegments[i].end)) return
    lastText = text
    lastSegments = segments

    if (text.length > MAX_SCAN_CHARS) {
      // Long-text guard: past 100k characters the repaint is not worth it.
      clearAll()
      lastText = text
      lastSegments = segments
      return
    }

    const runs = buildRuns(classifyMarkdown(text))
    const buckets = new Map()
    let count = 0
    for (const run of runs) {
      if (count >= MAX_RUNS) break
      const range = rangeFor(segments, run.start, run.end)
      if (range === null) continue
      count++
      let list = buckets.get(run.name)
      if (list === undefined) {
        list = []
        buckets.set(run.name, list)
      }
      list.push(range)
    }

    for (const [group, name] of Object.entries(HIGHLIGHT_NAMES)) {
      const list = buckets.get(group)
      if (list === undefined || list.length === 0) {
        globalThis.CSS.highlights.delete(name)
        continue
      }
      const highlight = new Highlight()
      for (const range of list) highlight.add(range)
      globalThis.CSS.highlights.set(name, highlight)
    }
  }

  function tick() {
    timer = 0
    if (disposed === true || composing === true) return
    const next = activeEditor()
    if (next !== editor) {
      if (editor !== null) clearAll()
      editor = next
    }
    if (editor === null) {
      clearAll()
      return
    }
    refresh()
  }

  function schedule() {
    if (disposed === true || composing === true || timer !== 0) return
    timer = window.setTimeout(tick, HIGHLIGHT_DELAY_MS)
  }

  function start() {
    if (disposed === true) return
    // Delegated at the document level: the composer's contenteditable host
    // is mounted and unmounted by the host shell, so binding to it directly
    // would leak a listener on every session switch.
    observer = new MutationObserver(schedule)
    observer.observe(document.body, { subtree: true, childList: true, characterData: true })
    listen(document, 'selectionchange', schedule)
    listen(document, 'focusin', schedule, true)
    // Blur and conversation switches must clear the paint: the recompute in
    // `tick` resolves "no focused editor" to a full release.
    listen(document, 'focusout', schedule, true)
    listen(document, 'input', schedule, true)
    listen(document, 'compositionstart', () => {
      // An IME preedit must not be painted: the ranges would be recomputed
      // mid-composition and fight the candidate window.
      composing = true
    }, true)
    listen(document, 'compositionend', () => {
      composing = false
      schedule()
    }, true)
  }

  function dispose() {
    disposed = true
    composing = false
    observer?.disconnect()
    if (timer !== 0) {
      window.clearTimeout(timer)
      timer = 0
    }
    clearAll()
    editor = null
    for (const off of bound.splice(0)) {
      try {
        off()
      } catch (error) {
        console.warn(`[${NS}] composer listener cleanup failed:`, error)
      }
    }
  }

  return { start, dispose }
}
