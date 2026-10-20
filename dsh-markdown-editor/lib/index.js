/**
 * Host half of dsh-markdown-editor.
 *
 * Everything this plugin does is browser-side: it shadows the keyed
 * `conversation.user.text.node` cell to render Markdown, collapses long user
 * messages in its own wrapper, drives the CSS Custom Highlight API on the
 * composer's contenteditable host, and shadows one stray header action cell.
 * None of that needs a route, a filesystem handle or a timer on the Host, so
 * this half registers nothing and keeps the package loadable in a Host-only
 * context (the bundle patch still inserts the row).
 */
export const name = 'dsh-markdown-editor'

/** Register nothing on the Host: the client bundle owns the entire feature. */
export function apply() {}
