import test from 'node:test'
import assert from 'node:assert/strict'
import { attachComposerTool } from './composer-tools.js'

class Element {
  constructor() { this.children = []; this.attrs = new Map(); this.style = {}; this.ownerDocument = { createElement: () => new Element() } }
  setAttribute(k, v) { this.attrs.set(k, v) }
  getAttribute(k) { return this.attrs.get(k) ?? null }
  hasAttribute(k) { return this.attrs.has(k) }
  appendChild(node) { this.insertBefore(node, null); return node }
  insertBefore(node, next) { node.remove(); this.children.splice(next ? this.children.indexOf(next) : this.children.length, 0, node); node.parentElement = this }
  remove() { if (this.parentElement) { const siblings = this.parentElement.children; siblings.splice(siblings.indexOf(this), 1); this.parentElement = null } }
  closest(selector) { const attrs = [...selector.matchAll(/\[([^\]]+)\]/g)].map(m => m[1]); for (let node = this; node; node = node.parentElement) if (attrs.some(attr => node.hasAttribute(attr))) return node; return null }
}
function fixture(right = false) {
  const content = new Element(); content.setAttribute('data-conversation-content', '')
  if (right) content.setAttribute('data-sidebar-right-session', 'same-session')
  const scroll = content.appendChild(new Element()); scroll.setAttribute('data-conversation-scroll', '')
  const seat = scroll.appendChild(new Element()); seat.setAttribute('data-composer-seat', '')
  const native = seat.appendChild(new Element())
  const anchor = native.appendChild(new Element())
  return { seat, native, anchor }
}
for (const first of ['terminal', 'git']) test(`independent member ownership and cleanup, ${first} unmounts first`, () => {
  const { seat, native, anchor } = fixture()
  const original = [...native.children]
  const git = attachComposerTool(anchor, { id: 'git', order: 20 })
  const terminal = attachComposerTool(anchor, { id: 'terminal', order: 10, shrink: false })
  assert.equal(git.row, terminal.row)
  assert.equal(terminal.member.style.flex, 'none')
  assert.equal(git.member.style.flex, '0 1 auto')
  assert.deepEqual(seat.children, [native, git.row])
  assert.deepEqual(git.row.children, [terminal.member, git.member])
  assert.deepEqual(native.children, original)
  assert.equal(attachComposerTool(anchor, { id: 'git', order: 20 }), null)
  const mounts = { git, terminal }
  mounts[first].dispose(); mounts[first].dispose()
  const remaining = first === 'git' ? terminal : git
  assert.deepEqual(seat.children, [native, remaining.row])
  assert.deepEqual(remaining.row.children, [remaining.member])
  remaining.dispose()
  assert.deepEqual(seat.children, [native])
  assert.deepEqual(native.children, original)
})
test('right sidebar sessions and anchors outside the conversation do not mount', () => {
  const right = fixture(true)
  assert.equal(attachComposerTool(right.anchor, { id: 'git' }), null)
  assert.deepEqual(right.seat.children, [right.native])
  assert.equal(attachComposerTool(new Element(), { id: 'terminal' }), null)
})
test('members reattach after full cleanup without retaining stale hosts', () => {
  const { seat, anchor } = fixture()
  const one = attachComposerTool(anchor, { id: 'terminal', order: 10, shrink: false }); one.dispose()
  const two = attachComposerTool(anchor, { id: 'terminal', order: 10, shrink: false })
  assert.notEqual(one.row, two.row)
  assert.equal(seat.children.length, 2)
  two.dispose(); assert.equal(seat.children.length, 1)
})
