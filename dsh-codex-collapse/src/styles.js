// Styles are emitted by React inside the existing turn-process seat.
export const BASE_STYLE = `
.dcc-root{min-width:0;color:var(--dsw-alias-label-tertiary);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei UI",sans-serif;font-size:12px;line-height:1.5;margin:4px 0;position:relative}
.dcc-toggle{display:inline-flex;align-items:center;gap:6px;max-width:100%;height:30px;box-sizing:border-box;padding:0 10px;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,0.06));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,0.14));border-radius:8px;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1;text-align:start;cursor:pointer;transition:all .15s ease}
.dcc-toggle:focus-visible,.dcc-mode:focus-visible{outline:2px solid #3b82f6;outline-offset:1px}
.dcc-toggle:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,0.12));color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l1,rgba(128,128,128,0.25))}
.dcc-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:500}
.dcc-dot{width:14px;height:14px;flex:none;display:inline-flex;align-items:center;justify-content:center}
.dcc-chevron{flex:none;transition:transform .18s ease;display:inline-block;vertical-align:middle;opacity:.6}
.dcc-chevron.is-expanded{transform:rotate(90deg)}
.dcc-root[data-alert]{color:var(--dsw-alias-label-primary)}
.dcc-note{margin:4px 0;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:11.5px}
.dcc-mode{border:0;padding:2px 0;background:none;color:#3b82f6;font:inherit;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
.dcc-failure{white-space:normal;overflow-wrap:anywhere}
.dcc-spinner{animation:dcc-spin .8s linear infinite}
@keyframes dcc-spin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.dcc-chevron{transition:none}.dcc-spinner{animation:none}}
`

function quoted(value) {
  return '"' + String(value).replace(/[\\"\n\r\f\u0000-\u001f]/g, char => `\\${char.codePointAt(0).toString(16)} `) + '"'
}

export function hiddenStyle(scope, turn, rows) {
  if (!rows.length) return ''
  const flow = `[data-slot="conversation.chat.flow"]:has([data-dcc-scope=${quoted(scope)}])`
  const selectors = rows.map(row => `${flow} [data-chat-turn=${quoted(turn)}][data-chat-node-key=${quoted(row.key)}]${row.part ? `[data-chat-group-part=${quoted(row.part)}]` : ''}:not(:focus-within)`)
  return `${selectors.join(',\n')}{display:none!important}`
}
