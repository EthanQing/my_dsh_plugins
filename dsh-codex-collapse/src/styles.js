// Styles are emitted by React inside the existing turn-process seat.
export const BASE_STYLE = `
.dcc-root{min-width:0;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:var(--dsh-content-font-size-secondary,13px);line-height:1.5}
.dcc-toggle{display:flex;align-items:center;gap:8px;max-width:100%;padding:4px 0;background:none;border:0;color:inherit;font:inherit;text-align:start;cursor:pointer}
.dcc-toggle:focus-visible,.dcc-mode:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:3px;border-radius:var(--dsw-radius-xs,3px)}
.dcc-toggle:hover{color:var(--dsw-alias-label-primary)}
.dcc-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dcc-dot{width:12px;flex:none;display:inline-flex;justify-content:center}
.dcc-dot[data-live]{animation:dcc-pulse 1.4s ease-in-out infinite}
.dcc-chevron{flex:none;font-size:12px;transition:transform .12s}
.dcc-chevron[data-open]{transform:rotate(90deg)}
.dcc-root[data-alert]{color:var(--dsw-alias-label-primary)}
.dcc-note{margin:4px 0;color:var(--dsw-alias-label-tertiary);font:inherit}
.dcc-mode{border:0;padding:2px 0;background:none;color:var(--dsw-alias-state-business-primary);font:inherit;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.dcc-failure{white-space:normal;overflow-wrap:anywhere}
@keyframes dcc-pulse{50%{opacity:.35}}
@media(prefers-reduced-motion:reduce){.dcc-dot[data-live]{animation:none}.dcc-chevron{transition:none}}
`

function quoted(value) {
  // JSON quoting is close to CSS strings except literal newlines/control chars.
  return '"' + String(value).replace(/[\\"\n\r\f\u0000-\u001f]/g, char => `\\${char.codePointAt(0).toString(16)} `) + '"'
}

export function hiddenStyle(scope, turn, rows) {
  if (!rows.length) return ''
  const flow = `[data-slot="conversation.chat.flow"]:has([data-dcc-scope=${quoted(scope)}])`
  const selectors = rows.map(row => `${flow} [data-chat-turn=${quoted(turn)}][data-chat-node-key=${quoted(row.key)}]${row.part ? `[data-chat-group-part=${quoted(row.part)}]` : ''}:not(:focus-within)`)
  return `${selectors.join(',\n')}{display:none!important}`
}
