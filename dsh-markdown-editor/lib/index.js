/**
 * Host half of dsh-markdown-editor.
 *
 * Everything this plugin does is browser-side: it delegates user message
 * rendering at the block layer, collapses long user messages in its own
 * wrapper, and drives the CSS Custom Highlight API on the
 * composer's contenteditable host, with guarded Markdown list gestures.
 * None of that needs a route, a filesystem handle or a timer on the Host, so
 * this half registers nothing and keeps the package loadable in a Host-only
 * context (the bundle patch still inserts the row).
 */
export const name = 'dsh-markdown-editor'

/** Register nothing on the Host: the client bundle owns the entire feature. */
export function apply() {}
