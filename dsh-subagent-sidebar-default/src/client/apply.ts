import { NS, zh, en } from './i18n'
import { createSidebarNavigation } from './navigation'
import { css } from './styles'
import { Manager } from './manager'
import { PromptPreview } from './prompt-view'
import { retainReleaseAll } from './retain'
import type { LineageShadowProps, PluginCtx, UiWorkspaceRuntime } from './types'
// Lineage shadow. The manager reuses the stock ui-subagent plugin (its
// right-sidebar chat tab is what the new button opens), so that plugin stays
// enabled and this registration is what keeps its lineage dropdown invisible: a
// `single` slot renders its lowest-priority winner, and -1 outranks the stock
// registration's default 0 without colliding with it.
//
// The shadow renders no dropdown. It DOES re-render the breadcrumb title for a
// crumb that is itself a subagent session, because `renderSlot` REPLACES the
// caller's fallback once an entry exists (the conversation draws the title
// itself for every other crumb, so those must render nothing here): a literally
// empty shadow would delete the current subagent session's title from the
// header. The title is drawn with the conversation's own crumb metrics (see the
// dsh-ssd-lineage-* rules in styles.ts) and keeps the ancestor-crumb click that
// the fallback button had.
const LineageShadow=({displayTitle,lineageSessionId,useSessions,openTitle}:LineageShadowProps)=>{
  const isSubagent=typeof useSessions==='function'?useSessions(s=>s?.byId?.[lineageSessionId]?.origin==='subagent'):false
  if(!isSubagent||!displayTitle)return null
  const open=typeof openTitle==='function'?openTitle:null
  return jsx('button',{type:'button',className:open?'dsh-ssd-lineage-title':'dsh-ssd-lineage-title dsh-ssd-lineage-current',disabled:!open,title:displayTitle,onClick:open||undefined,children:displayTitle})
}
// Header-actions shadow. The stock ui-subagent plugin registers a SECOND entry
// into `conversation.session.header.actions` — `id: "subagent-catalog"`,
// `order: -30` — which draws the official "N subagents" count dropdown as soon
// as the current session's catalog projection is loaded. That registration
// arrived in dsh 0.1.7-rc.1 and never collided with the manager, because a `list`
// slot gives every `id` its own cell: the manager owns
// `subagent-workspace-manager` and the stock catalog owned its own, so both
// showed. The manager already covers this surface, so the declarative shadow is
// extended to it: a cell renders its lowest-priority live entry, and -1 outranks
// the stock registration's default 0 without colliding with it (the stock
// plugin's four other registrations, including the `subagentchat` right-sidebar
// tab the manager reuses, are untouched). This entry renders nothing.
const CatalogShadow=()=>null
// Shared by both shadows. The slots core rejects a second registration at a
// (cell, priority) pair that is already taken, so a host that later ships its
// own lineage entry or its own `subagent-catalog` at -1 must cost that shadow
// only. The inject callback runs inside the host's effect machinery, where an
// escaping throw tears down the injection — and the synchronous one from
// `inject` itself would fail the whole apply — so catch, warn, and leave the
// official entry visible instead.
const registerShadow=(ctx,slot,options,component)=>ctx.slots.inject(slot,()=>{
  try{return ctx.slots.register(options,component)}
  catch(error){console.warn('subagent-sidebar-default: unable to shadow',options.id??slot,error);return()=>{}}
})
export function apply(ctx:PluginCtx){
  sessionsRt=ctx.sessions
  ctx.effect(()=>{
    const tag=document.createElement('style')
    tag.dataset.pluginCss='dsh-subagent-sidebar-default'
    tag.textContent=css
    document.head.appendChild(tag)
    return()=>tag.remove()
  },'subagent-sidebar-default: styles')
  ctx.effect(()=>ctx.locale.register(NS,{zh,en}),'subagent-sidebar-default: dictionaries')
  // Plugin disposal is the last paired release: nothing may outlive the surfaces.
  ctx.effect(()=>()=>retainReleaseAll(),'subagent-sidebar-default: retained live bindings')
  // Catalog hooks are optional host capability, probed at every call and never
  // version-checked: dsh 0.1.7-rc.1 removed setSubagentCatalogOpen outright and
  // replaced refreshSubagents(parentSessionId) with refreshProjections(sessionId)
  // (same session argument, "load all Session projections once per connection"),
  // so an unguarded call threw out of the panel's open effect and the React error
  // boundary killed the whole header slot. Both stay plain functions (the manager
  // calls them unconditionally), turning into a no-op on a host that publishes
  // neither, and the refresh prefers the replacement so a 0.1.7 host still pulls
  // the parent catalog the panel needs. A projection read is fire-and-forget: the
  // UI re-reads the store, so a failed load already falls back to the existing
  // "type loading" text and must not surface as an unhandled rejection.
  const fireAndForget=pending=>{if(pending&&typeof pending.catch==='function')pending.catch(error=>console.warn('subagent-sidebar-default: unable to refresh session projections',error))},
    refreshCatalog=p=>{if(typeof ctx.sessions?.refreshProjections==='function'){fireAndForget(ctx.sessions.refreshProjections(p));return}if(typeof ctx.sessions?.refreshSubagents==='function')fireAndForget(ctx.sessions.refreshSubagents(p))}
  const navigation=createSidebarNavigation(ctx)
  const face=()=>({...navigation,refresh:refreshCatalog,setCatalogOpen:(p,o)=>{if(typeof ctx.sessions?.setSubagentCatalogOpen==='function')ctx.sessions.setSubagentCatalogOpen(p,o)}})
  ctx.slots.inject('conversation.session.header.actions',()=>ctx.slots.register({name:'conversation.session.header.actions',id:'subagent-sidebar-default-manager',order:100,locale:NS,inject:face},Manager))
  // g-023 prompt preview. A second, headless cell in the same list slot: the
  // component renders one hidden anchor and drives DOM injection into the chat
  // flow of the conversation it belongs to (see prompt-view.ts). A list cell of
  // its own keeps the official `conversation.chat.node` renderer untouched, and
  // the cell is inert on any host that renders no user nodes.
  ctx.slots.inject('conversation.session.header.actions',()=>ctx.slots.register({name:'conversation.session.header.actions',id:'subagent-sidebar-default-prompt-preview',order:101,locale:NS},PromptPreview))
  registerShadow(ctx,'conversation.session.header.actions',{name:'conversation.session.header.actions',id:'subagent-catalog',priority:-1},CatalogShadow)
  registerShadow(ctx,'conversation.session.header.lineage',{name:'conversation.session.header.lineage',priority:-1},LineageShadow)
}
