/**
 * Host half of dsh-message-edit-retry.
 *
 * The whole feature lives in the browser: the plugin shadows the user/steering
 * chat-node renderers to add an in-place editor, and adds a turn-tail action row
 * for continue/retry. Both act through the existing Client Session services
 * (`ctx.sessions`, `ctx.uiWorkspace`), so this half registers nothing — no
 * routes, no filesystem access, no timers, no side effects.
 */
export const name = 'dsh-message-edit-retry'

/** Register nothing on the Host: the client bundle owns the entire feature. */
export function apply() {}
