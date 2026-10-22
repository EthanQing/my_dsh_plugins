import { NOOP } from './runtime'
import { liveBindingFor, retainOwned, retainSettled, retainSubscribe } from './retain'
import { liveFromEvents, liveTextLines } from './live-events'
import type { LiveLine } from './live-events'
import { toolDetail } from './detail'
import { catalogEntryOf, sidebarIcon, sidebarLabel } from './format'
import type { LiveOutputProps, Tr } from './types'

export function legacyLiveLines(tr:Tr,chat:any,running:boolean|undefined):LiveLine[]{
  const blocks=chat?.legacy?.partial?.blocks||[],runningCalls=chat?.legacy?.runningCalls||[],nodes=chat?.legacy?.nodes||[]
  const activity:LiveLine[]=runningCalls.slice(-2).map(c=>({icon:'play',text:`${c.name||tr('toolCall')}${c.argsRaw?` · ${toolDetail(c.argsRaw)}`:''}`}))
  if(!activity.length)nodes.slice(-8).filter(n=>n.kind==='context'||n.kind==='tool-result'||n.kind==='command').slice(-2).forEach(n=>{
    if(n.kind==='context')activity.push({text:tr('contextInjection',{name:`${n.provenance?.label||n.form||'context'}`})})
    else if(n.kind==='tool-result')activity.push({icon:n.isError?'error':'success',text:`${n.call?.name||tr('toolCall')}${n.call?.argsRaw?` · ${toolDetail(n.call.argsRaw)}`:''}`})
    else activity.push({icon:'command',text:tr('command.named',{name:`${n.name||tr('command')}`})})
  })
  const latest=(allowTool:boolean):LiveLine[]=>{
    for(let i=blocks.length-1;i>=0;i--){
      const b=blocks[i]
      if((b.kind==='text'||b.kind==='reasoning')&&b.text){
        const text=b.text.split('\n').map(x=>x.trim()).filter(Boolean).slice(-2).join('\n')
        if(text)return liveTextLines(text,b.kind==='reasoning'?'thought':undefined)
      }else if(allowTool&&b.kind==='tool-call'&&b.name)return [{icon:'settings',text:tr('callTool')+b.name}]
    }
    return []
  }
  const stream=latest(false)
  return runningCalls.length?activity:running&&stream.length?stream:activity.length?activity:latest(true)
}
export function trimLiveLines(lines:LiveLine[],limit=400):LiveLine[]{
  const result:LiveLine[]=[]
  for(let i=lines.length-1;i>=0&&limit>0;i--){const line=lines[i];result.unshift({...line,text:line.text.slice(-limit)});limit-=line.text.length+1}
  return result
}
export function LiveOutput({t:tr,parentId,childId,running,prefix=true,autoLoad=true,onLoad,live=true}:LiveOutputProps){
  const [loading,setLoading]=React.useState(false),[,bump]=React.useState(0),[retainTick,setRetainTick]=React.useState(0),[lastLines,setLastLines]=React.useState<LiveLine[]>([]),wantLive=live&&(running||autoLoad),binding=React.useMemo(()=>wantLive?liveBindingFor(childId):null,[childId,wantLive,retainTick]),session=binding?.session||null,feed=binding?.eventSource||null
  React.useEffect(()=>{if(!binding)return;let alive=true,timer=null,scheduled=false;const notify=()=>{if(!alive||scheduled)return;scheduled=true;timer=setTimeout(()=>{scheduled=false;timer=null;if(alive)bump(v=>v+1)},100)};const setup=async()=>{try{if(retainOwned(childId)){await retainSettled(childId)}else{if(parentId){const entry=catalogEntryOf(sessionsRt?.list?.getSnapshot?.(),parentId,childId);if(entry?.mode)session?.configureSubagent?.({parentSessionId:parentId,childSessionId:childId,mode:entry.mode})}await session?.open?.()}}catch{}finally{if(alive){setLoading(false);bump(v=>v+1)}}};setup();const source=feed||session,unsub=source?.subscribe?.(notify)||NOOP();return()=>{alive=false;if(timer)clearTimeout(timer);unsub()}},[binding,session,feed,parentId,childId])
  React.useEffect(()=>retainSubscribe(()=>setRetainTick(v=>v+1)),[])
  let lines:LiveLine[]=[],thinking=false
  if(feed){
    const win=feed.getSnapshot?.()
    if(win?.entries){
      const out=liveFromEvents(tr,win.entries,running)
      thinking=!!out.thinking
      lines=[...out.activity,...running&&!out.thinking?out.streamLines:[]]
      if(!lines.length)lines=out.finalLines
    }
  }else lines=legacyLiveLines(tr,session?.getSnapshot?.()?.chat,running)
  const signature=JSON.stringify(lines)
  React.useEffect(()=>{if(lines.length)setLastLines(lines)},[signature])
  if(!wantLive)return jsx('button',{type:'button',className:'dsh-ssd-load-live-btn',onClick:e=>{e.stopPropagation();setLoading(true);onLoad?.()},title:tr('loadHistoryTitle'),children:sidebarLabel(tr,loading?'loading':'loadLatest')})
  if(!session)return null
  const visible=trimLiveLines(thinking?lines:lines.length?lines:lastLines)
  return visible.length||(thinking&&running)?jsx('div',{className:`dsh-ssd-live ${running?'dsh-ssd-live-running':'dsh-ssd-live-final'}`,children:[
    prefix&&jsx('span',{className:'dsh-ssd-live-prefix',children:tr('liveOutputPrefix')}),
    thinking&&running&&jsx('span',{className:'dsh-ssd-thinking',children:[sidebarIcon('spinner'),tr('thinking')]}),
    ...visible.map((line,index)=>jsx('span',{className:index===visible.length-1?'dsh-ssd-live-latest':'dsh-ssd-live-old',children:[line.icon&&sidebarIcon(line.icon),line.text]},index)),
  ]}):null
}
