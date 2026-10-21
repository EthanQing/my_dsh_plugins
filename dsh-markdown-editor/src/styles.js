const NS = 'dsh-markdown-editor'
const STYLE_SHEET = [
  '.dsh-mde-user-stack{display:flex;flex-direction:column;align-items:flex-end;gap:8px;min-width:0;max-width:min(calc(var(--dsh-chat-content-width,748px)*.702),82%)}',
  '.dsh-mde-user-stack>div{max-width:100%}',
  '.dsh-mde-bubble{box-sizing:border-box;max-width:100%;padding:10px 16px;border-radius:var(--dsw-radius-xl);background:var(--dsw-specific-bubble);color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size,14px);line-height:calc(22px + var(--dsh-content-font-delta,0px));overflow-wrap:anywhere}',
  '.dsh-mde-block{display:block;min-width:0;max-width:100%;white-space:normal;color:inherit}',
  '.dsh-mde-clip{display:block;position:relative;min-width:0;max-width:100%}',
  '.dsh-mde-clip[data-collapsed]{max-height:calc((22px + var(--dsh-content-font-delta,0px)) * 18);overflow:hidden}',
  '.dsh-mde-fade{display:block;position:absolute;left:0;right:0;bottom:0;height:48px;background:linear-gradient(to bottom,transparent,var(--dsw-specific-bubble,var(--dsw-alias-bg-base)));border-bottom-left-radius:var(--dsw-radius-xl);border-bottom-right-radius:var(--dsw-radius-xl);pointer-events:none}',
  '.dsh-mde-toggle{display:inline-flex;align-items:center;gap:6px;margin:6px 0 0;padding:3px 10px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,0.18));border-radius:14px;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,0.08));color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:12px;line-height:18px;backdrop-filter:blur(8px);transition:all .15s ease}',
  '.dsh-mde-toggle:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,0.15));color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l1,rgba(128,128,128,0.3))}',
  '.dsh-mde-chevron{transition:transform .18s ease;flex:none}',
  '.dsh-mde-chevron.is-expanded{transform:rotate(180deg)}',
  '.dsh-mde-toggle:focus-visible{outline:1.5px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
  '.dsh-mde-plain{white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;color:inherit}',
  // Composer Custom Highlight paint: color-only, theme-token driven.
  '::highlight(dsh-mde-md-strong){color:var(--dsw-alias-label-primary)}',
  '::highlight(dsh-mde-md-em){color:var(--dsw-alias-label-primary)}',
  '::highlight(dsh-mde-md-del){color:var(--dsw-alias-label-tertiary);text-decoration:line-through}',
  '::highlight(dsh-mde-md-code){color:var(--dsw-alias-label-primary);background-color:var(--dsw-alias-markdown-code-block,var(--dsw-specific-input-major,transparent))}',
  '::highlight(dsh-mde-md-link){color:var(--dsw-alias-state-business-primary)}',
  '::highlight(dsh-mde-md-heading){color:var(--dsw-alias-label-primary)}',
  '::highlight(dsh-mde-md-list){color:var(--dsw-alias-label-primary)}',
  '::highlight(dsh-mde-md-marker){color:var(--dsw-alias-label-caption)}',
].join('')

/** One style tag per plugin, addressed by the same attributes the stock bundles use. */
export function installStyles() {
  if (typeof document === 'undefined') return () => {}
  const key = `${NS}/client.css`
  if (document.querySelector(`style[data-plugin-css="${key}"]`) !== null) return () => {}
  const style = document.createElement('style')
  style.dataset.plugin = NS
  style.dataset.pluginCss = key
  style.textContent = STYLE_SHEET
  document.head.appendChild(style)
  return () => {
    style.remove()
  }
}
