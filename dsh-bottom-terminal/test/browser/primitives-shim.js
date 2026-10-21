// TEST ONLY: Menu/Button below verify action wiring, not native popup placement.
// Public SVG components are generated unchanged from the verified official release.
import React from 'react'
import { createPortal } from 'react-dom'
const h = React.createElement
export function Button({ variant, children, className = '', ...props }) {
  return h('button', { type: 'button', ...props, className: `test-primitive-button ${className}`, 'data-test-primitive-shim': 'Button' }, children)
}
export { PluginArtworkTerminal, IconPlusOutlineRegular, IconChevronRightOutlineRegular, IconChevronDownOutlineRegular, IconChevronUpOutlineRegular, IconCloseOutlineRegular, IconFullscreenOutlineRegular, IconCopyOutlineRegular } from '../../.test-output/official-icons.js'
export function Menu({ open, anchor, items, onSelect, onClose, selectedId, className, listClassName, side }) {
  const ref = React.useRef(null)
  const [position, setPosition] = React.useState({ left: 0, top: 0 })
  React.useLayoutEffect(() => {
    if (open && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setPosition(side === 'right' ? { left: rect.right + 4, top: rect.top } : { left: rect.left - 150, top: rect.top - 150 })
    }
  }, [open, side])
  return h('span', { ref, className, 'data-test-primitive-shim': 'Menu' }, anchor,
    open && createPortal(h('div', { role: 'menu', className: `test-menu-list ${listClassName || ''}`, style: { position: 'fixed', ...position }, 'data-test-primitive-shim': 'Menu-popup', onKeyDown: event => { if (event.key === 'Escape') onClose() } },
      items.map(item => item.type === 'separator' ? h('hr', { key: item.id }) : h('button', { key: item.id, type: 'button', role: 'menuitem', disabled: item.disabled, 'data-menu-id': item.id, onClick: () => onSelect(item.id) }, selectedId === item.id && h('svg', { width: 12, height: 12, viewBox: '0 0 12 12', 'aria-hidden': true }, h('path', { d: 'M1 6l3 3 7-7', fill: 'none', stroke: 'currentColor' })), item.label))), document.body))
}
