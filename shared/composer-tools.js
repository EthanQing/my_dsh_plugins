// Shared by independently bundled plugins. Ownership lives in the local DOM,
// not a module singleton, so unloading one plugin cannot remove another's tools.
export function attachComposerTool(anchor, { id, order = 0, shrink = true }) {
  if (!anchor || anchor.closest('[data-sidebar-right-session], [data-rightbar-col]')) return null
  const seat = anchor.closest('[data-composer-seat]')
  const content = seat?.closest('[data-conversation-content]')
  const footer = anchor.closest('[data-composer-dock]')
  if (!seat || !content || !footer || !seat.closest('[data-conversation-scroll]')) return null
  let row = Array.from(footer.children).find(node => node.hasAttribute('data-dsh-composer-tools'))
  if (!row) {
    row = seat.ownerDocument.createElement('div')
    row.setAttribute('data-dsh-composer-tools', '')
    const saved = new Map()
    const set = (node, values) => {
      if (!saved.has(node)) saved.set(node, {})
      const original = saved.get(node)
      for (const [key, value] of Object.entries(values)) {
        if (!(key in original)) original[key] = node.style[key]
        node.style[key] = value
      }
    }
    set(footer, { position: 'relative', width: '100%', maxWidth: 'var(--dsh-composer-card-max-width,100%)', boxSizing: 'border-box' })
    Object.assign(row.style, {
      position: 'absolute', right: '0', top: 'calc(50% + 2px)', transform: 'translateY(-50%)',
      display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', minWidth: '0',
    })
    footer.appendChild(row)
    const nativeItems = node => Array.from(node.children).flatMap(child => {
      if (child === row || child.hidden) return []
      const display = getComputedStyle(child).display
      return display === 'contents' ? nativeItems(child) : display === 'none' ? [] : [child]
    })
    let frame
    const measure = () => {
      frame = undefined
      const items = nativeItems(footer)
      // The native items stay in place. Only constrain them when the right tools
      // cannot fit beside the centered information at the current column width.
      for (const item of items) set(item, { minWidth: '0', flexShrink: '1' })
      const nativeWidth = items.reduce((sum, item) => sum + Math.max(item.scrollWidth, item.getBoundingClientRect().width), 0) + Math.max(0, items.length - 1) * 12
      const available = Math.max(0, (footer.clientWidth - nativeWidth) / 2 - 8)
      const compact = available < 130
      row.toggleAttribute('data-tools-compact', compact)
      const reserve = compact ? (row.children.length > 1 ? 58 : 28) : Math.min(220, available)
      row.style.maxWidth = `${reserve}px`
      set(footer, { paddingInline: `${reserve + 8}px` })
      const room = Math.max(0, footer.clientWidth - 2 * (reserve + 8) - Math.max(0, items.length - 1) * 12)
      for (const item of items) {
        set(item, { maxWidth: compact ? `${room * Math.max(item.scrollWidth, item.getBoundingClientRect().width) / Math.max(1, nativeWidth - Math.max(0, items.length - 1) * 12)}px` : '' })
        for (const button of [item, ...item.querySelectorAll('button')].filter(node => node.tagName === 'BUTTON')) set(button, { maxWidth: '100%', minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })
      }
    }
    const schedule = () => { if (frame === undefined) frame = requestAnimationFrame(measure) }
    const resize = new ResizeObserver(schedule)
    resize.observe(footer)
    const mutation = new MutationObserver(schedule)
    mutation.observe(footer, { childList: true, subtree: true, characterData: true })
    row.__dshToolsCleanup = () => {
      resize.disconnect(); mutation.disconnect()
      if (frame !== undefined) cancelAnimationFrame(frame)
      for (const [node, values] of saved) Object.assign(node.style, values)
    }
    schedule()
  }
  if (Array.from(row.children).some(node => node.getAttribute('data-dsh-composer-tool') === id)) return null
  const member = seat.ownerDocument.createElement('div')
  member.setAttribute('data-dsh-composer-tool', id)
  member.setAttribute('data-dsh-composer-tool-order', String(order))
  Object.assign(member.style, { display: 'flex', alignItems: 'center', minWidth: '0', maxWidth: '100%', flex: shrink ? '0 1 auto' : 'none' })
  const next = Array.from(row.children).find(node => Number(node.getAttribute('data-dsh-composer-tool-order')) > order)
  row.insertBefore(member, next || null)
  let disposed = false
  return { member, row, dispose() {
    if (disposed) return
    disposed = true
    member.remove()
    if (!row.children.length) { row.__dshToolsCleanup?.(); row.remove() }
  } }
}

export function createComposerTool(React, createPortal, options, Component) {
  const { createElement: h, useLayoutEffect, useRef, useState } = React
  return function ComposerTool(props) {
    const anchor = useRef(null)
    const [member, setMember] = useState(null)
    useLayoutEffect(() => {
      const mount = attachComposerTool(anchor.current, options)
      setMember(mount?.member || null)
      return () => mount?.dispose()
    }, [props.sessionId])
    return h(React.Fragment, null,
      h('span', { ref: anchor, hidden: true, 'aria-hidden': true, 'data-dsh-composer-tool-anchor': options.id }),
      member && createPortal(h(Component, props), member))
  }
}
