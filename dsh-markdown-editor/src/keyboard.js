import { focusedComposerRoot, createComposerAdapter } from './composer.js'
import { planListEdit } from './lists.js'

export function mustPass(event, root, composingUntil = 0) {
  return event.defaultPrevented || event.isComposing || event.keyCode === 229 || Date.now() < composingUntil ||
    event.metaKey || event.altKey || event.getModifierState?.('AltGraph') ||
    (event.key === 'Enter' ? (!event.shiftKey && !event.ctrlKey) || (event.shiftKey && event.ctrlKey) : event.ctrlKey) ||
    root.hasAttribute('data-composer-composing') || root.getAttribute('aria-disabled') === 'true' ||
    root.ownerDocument.querySelector('[data-trigger-menu]') !== null ||
    root.getAttribute('aria-expanded') === 'true'
}

export function installKeyboard(document) {
  let composingUntil = 0
  let disabled = false
  const onStart = () => { composingUntil = Infinity }
  const onEnd = () => { composingUntil = Date.now() + 10 }
  const onKey = event => {
    if (!['Enter', 'Tab'].includes(event.key)) return
    const root = focusedComposerRoot(document)
    if (!root || !root.contains(event.target) || mustPass(event, root, composingUntil)) return
    const plainLineBreak = event.key === 'Enter' && event.ctrlKey
    // An unavailable adapter must never turn Ctrl+Enter back into a send.
    if (plainLineBreak) {
      event.preventDefault()
      event.stopPropagation()
    }
    if (disabled || (plainLineBreak && event.repeat)) return
    try {
      // Resolve the editor on every gesture, including when a root is reused
      // for a replacement instance. No stale editor listeners to rebind.
      const adapter = createComposerAdapter(root)
      if (plainLineBreak) {
        adapter?.insertLineBreak()
        return
      }
      const facts = adapter?.read()
      if (!facts) return
      const plan = planListEdit(facts.text, facts.caret, event.key, event.shiftKey)
      if (!plan || !adapter.canApply(facts, plan)) return
      event.preventDefault()
      event.stopPropagation()
      if (event.repeat) return
      // Once a write begins, never fall through to native Enter/send on error.
      adapter.apply(facts, plan)
    } catch (error) {
      disabled = true
      console.warn('[dsh-markdown-editor] list assistance disabled until reload:', error)
    }
  }
  document.addEventListener('keydown', onKey, true)
  document.addEventListener('compositionstart', onStart, true)
  document.addEventListener('compositionend', onEnd, true)
  return () => {
    document.removeEventListener('keydown', onKey, true)
    document.removeEventListener('compositionstart', onStart, true)
    document.removeEventListener('compositionend', onEnd, true)
  }
}
