// Discover only DSH's marked composer, never unrelated contenteditables.
export function focusedComposerRoot(document) {
  const active = document.activeElement
  return active?.closest?.('[data-composer-input][contenteditable="true"]') ?? null
}

const METHODS = ['getEditorState', 'getRootElement', 'update', 'isEditable', 'isComposing']

// All private Lexical access stays here. Verified against Desktop 0.2.1-rc.2,
// which embeds Lexical 0.49.0. Unknown versions fail closed to native behavior.
export function createComposerAdapter(root) {
  const editor = root?.__lexicalEditor
  const version = editor?.constructor?.version
  if (!/^0\.49\.0(?:\+.*)?$/.test(version ?? '') || editor?._config?.namespace !== 'dsh-composer') return null
  if (!METHODS.every(name => typeof editor[name] === 'function') || editor.getRootElement() !== root) return null
  if (!editor.isEditable() || editor.isComposing()) return null

  function snapshot(state) {
    const selection = state?._selection
    const doc = state?._nodeMap?.get('root')
    if (!doc || !selection?.isCollapsed?.() || selection.anchor?.type !== 'text') return null
    if (!['insertText', 'insertRawText', 'removeText'].every(name => typeof selection[name] === 'function')) return null
    if (typeof selection.anchor.set !== 'function' || typeof selection.focus?.set !== 'function') return null
    const anchor = selection.anchor
    let text = ''
    let caret = -1
    const segments = []
    const blocks = doc.getChildren()
    for (const [i, block] of blocks.entries()) {
      if (block.getType() !== 'paragraph') return null
      if (i) text += '\n'
      for (const node of block.getChildren()) {
        const type = node.getType()
        if (type === 'linebreak') { text += '\n'; continue }
        // Do not modify documents containing commands, references or entities.
        if (type !== 'text' || !node.isSimpleText?.() || node.isTextEntity?.()) return null
        const value = node.getTextContent()
        const start = text.length
        const segment = { node, start, end: start + value.length }
        segments.push(segment)
        if (node.getKey() === anchor.key) caret = start + anchor.offset
        text += value
        if (text.length > 100000) return null
      }
    }
    if (caret < 0 || caret > text.length) return null
    return { text, caret, selection, segments }
  }

  function pointAt(facts, offset) {
    // Prefer the next text node at a boundary. Never cross a paragraph gap.
    const segment = facts.segments.find(s => s.start === offset) ?? facts.segments.find(s => s.start <= offset && offset <= s.end)
    return segment ? { key: segment.node.getKey(), offset: offset - segment.start } : null
  }

  function read() {
    const state = editor.getEditorState()
    return state.read(() => snapshot(state))
  }

  function apply(expected, plan) {
    let changed = false
    editor.update(() => {
      const facts = snapshot(editor._pendingEditorState)
      if (!facts || facts.text !== expected.text || facts.caret !== expected.caret) return
      const from = pointAt(facts, plan.from)
      const to = pointAt(facts, plan.to)
      if (!from || !to) return
      const { selection } = facts
      selection.anchor.set(from.key, from.offset, 'text')
      selection.focus.set(to.key, to.offset, 'text')
      if (plan.text) selection.insertRawText(plan.text)
      else selection.removeText()
      // Tab edits the line prefix; restore the caret relative to the item body.
      const after = snapshot(editor._pendingEditorState)
      if (after) {
        const caret = pointAt(after, plan.caret)
        if (caret) {
          selection.anchor.set(caret.key, caret.offset, 'text')
          selection.focus.set(caret.key, caret.offset, 'text')
        }
      }
      changed = true
    }, { tag: 'history-push', discrete: true })
    return changed
  }
  return { read, apply, canApply: (facts, plan) => Boolean(pointAt(facts, plan.from) && pointAt(facts, plan.to)) }
}
