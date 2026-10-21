// Shared by independently bundled plugins. Ownership lives in the local DOM,
// not a module singleton, so unloading one plugin cannot remove another's tools.
export function attachComposerTool(anchor, { id, order = 0, shrink = true }) {
  if (!anchor || anchor.closest('[data-sidebar-right-session], [data-rightbar-col]')) return null
  const seat = anchor.closest('[data-composer-seat]')
  const content = seat?.closest('[data-conversation-content]')
  if (!seat || !content || !seat.closest('[data-conversation-scroll]')) return null
  let row = Array.from(seat.children).find(node => node.hasAttribute('data-dsh-composer-tools'))
  if (!row) {
    row = seat.ownerDocument.createElement('div')
    row.setAttribute('data-dsh-composer-tools', '')
    Object.assign(row.style, {
      position: 'relative', display: 'flex', flex: 'none', justifyContent: 'flex-end', alignItems: 'center',
      gap: '8px', minWidth: '0', maxWidth: '100%', boxSizing: 'border-box',
      width: 'min(var(--dsh-composer-card-max-width,100%),calc(100% - 2 * var(--dsh-composer-side-clearance,16px)))',
      margin: '0 auto', padding: '4px 0',
    })
    seat.appendChild(row)
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
    if (!row.children.length) row.remove()
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
