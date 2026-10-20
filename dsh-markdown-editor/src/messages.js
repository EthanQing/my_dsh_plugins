import { createMessageView } from './message-view.js'
import { translatorOf } from './locale.js'

export function installMessages(ctx, React, primitives) {
  const h = React.createElement
  const BlockUserText = createMessageView(React, primitives)
  const registry = ctx.uiConversation?.userText
  if (!registry?.createEvaluator || !ctx.slots.entries) return () => {}
  const ownComponents = new Set()
  const bindings = new Map()
  const subscribe = listener => registry.subscribe(listener)
  const getSnapshot = () => registry.getSnapshot()
  let disposed = false
  let scheduled = false

  function makeWrapper(original) {
    return React.memo(function MarkdownMessageRow(props) {
      React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
      const evaluate = React.useMemo(() => registry.createEvaluator(), [])
      const renderFactorySlot = (...args) => {
        const [name, owner] = args
        const content = owner?.content
        if (name !== 'conversation.chat.user.content' || owner.interactive !== true || owner.ellipsis ||
          !content || typeof content.text !== 'string' || !content.text ||
          !Array.isArray(content.attachments) || !Array.isArray(content.extraBlocks) ||
          content.skillNames?.length || Object.keys(owner.facts?.skillNames ?? {}).length > 0) return props.renderFactorySlot(...args)
        // Business nodes (session references and future custom nodes) belong to
        // DSH. Keep their entire native text surface rather than flattening chips.
        try {
          if (evaluate({ text: content.text, facts: owner.facts ?? {} }).some(node => node.id !== 'text')) {
            return props.renderFactorySlot(...args)
          }
        } catch { return props.renderFactorySlot(...args) }
        const native = next => props.renderFactorySlot(name, { ...owner, content: next }, ...args.slice(2))
        return h('div', { className: 'dsh-mde-user-stack' },
          content.attachments.length > 0 ? native({ ...content, text: '', extraBlocks: [], referenceLabels: [] }) : null,
          h('div', { className: 'dsh-mde-bubble' },
            h(BlockUserText, { text: content.text, tr: translatorOf(ctx.locale.bind('dsh-markdown-editor')) })),
          content.extraBlocks.length > 0 || content.referenceLabels?.length
            ? native({ ...content, text: '', attachments: [] }) : null)
      }
      // Keep the selected row's own controls, locale, injected actions and state.
      return h(original.component, { ...props, renderFactorySlot })
    })
  }

  function sync() {
    scheduled = false
    if (disposed) return
    for (const key of ['user', 'steering']) {
      const original = ctx.slots.entries('conversation.chat.node')
        .filter(entry => entry.options.key === key && !ownComponents.has(entry.component))
        .sort((a, b) => (a.options.priority ?? 0) - (b.options.priority ?? 0))[0]
      const previous = bindings.get(key)
      if (previous?.original === original) continue
      previous?.off()
      bindings.delete(key)
      // An unknown row with child-slot/store ownership cannot be wrapped safely.
      if (!original || original.children || original.store) continue
      const component = makeWrapper(original)
      ownComponents.add(component)
      try {
        const off = ctx.slots.register({
          name: 'conversation.chat.node', key,
          priority: (original.options.priority ?? 0) - 1,
          ...(original.locale ? { locale: original.locale } : {}),
          ...(original.inject ? { inject: original.inject } : {}),
        }, component)
        bindings.set(key, { original, off })
      } catch (error) {
        ownComponents.delete(component)
        console.warn('[dsh-markdown-editor] keeping native message row:', error)
      }
    }
  }
  const schedule = key => {
    if (key !== 'conversation.chat.node' || scheduled || disposed) return
    scheduled = true
    queueMicrotask(sync)
  }
  const offChanged = ctx.on('slots/changed', schedule)
  const offSlot = ctx.slots.inject('conversation.chat.node', () => { schedule('conversation.chat.node') })
  schedule('conversation.chat.node')
  return () => {
    disposed = true
    offChanged?.()
    offSlot?.()
    for (const binding of bindings.values()) binding.off()
    bindings.clear()
    ownComponents.clear()
  }
}
