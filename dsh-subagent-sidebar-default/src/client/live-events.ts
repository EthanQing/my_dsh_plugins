import { toolDetail } from './detail'
import type { Tr, EventEntry, ToolCallRecord, ToolCallDone } from './types'
export type LiveLine={text:string;icon?:string}
export const liveTextLines=(text:string,icon?:string):LiveLine[]=>text.split('\n').filter(Boolean).map((text,index)=>({text,icon:index===0?icon:undefined}))
export const liveFromEvents=(tr:Tr,entries:EventEntry[],running:boolean|undefined)=>{
  const tail=(s:unknown)=>String(s||'').split('\n').map(x=>x.trim()).filter(Boolean).slice(-2).join('\n')
  const finalOf=(blocks:any[]):LiveLine[]=>{
    const list=Array.isArray(blocks)?blocks:[]
    for(let i=list.length-1;i>=0;i--){
      const b=list[i]
      if(b?.type==='text'||b?.type==='reasoning'){
        const text=tail(b.text)
        if(text)return liveTextLines(text,b.type==='reasoning'?'thought':undefined)
      }
      if(b?.type==='tool-call'&&b.name)return [{icon:'settings',text:tr('callTool')+b.name}]
    }
    return []
  }
  let text='',reasoning='',hasStream=false,lastKind='text',finalLines:LiveLine[]=[]
  const pending:ToolCallRecord[]=[],done:ToolCallDone[]=[],context:LiveLine[]=[],byCall=new Map<string,ToolCallRecord>()
  for(const entry of entries){
    if(!entry||entry.type!=='event')continue
    const e=entry.event
    if(!e||typeof e.type!=='string')continue
    switch(e.type){
      case 'assistant/chunk':{
        const c=e.data?.chunk
        if(!c)break
        if(c.type==='text-delta'){text+=c.text||'';hasStream=true;lastKind='text'}
        else if(c.type==='reasoning-delta'){reasoning+=c.text||'';hasStream=true;lastKind='reasoning'}
        else if(c.type==='tool-call-delta'&&c.id){
          let rec=byCall.get(c.id)
          if(!rec){rec={name:c.name||tr('toolCall'),args:'',complete:false,running:true};byCall.set(c.id,rec);pending.push(rec)}
          if(c.name)rec.name=c.name
          rec.args+=c.argumentsDelta||''
        }else if(c.type==='block-end'&&c.block?.type==='tool-call'){
          let rec=byCall.get(c.block.id)
          if(!rec){rec={name:c.block.name||tr('toolCall'),args:'',complete:false,running:true};byCall.set(c.block.id,rec);pending.push(rec)}
          if(c.block.name)rec.name=c.block.name
          rec.args=c.block.arguments||rec.args;rec.complete=true
        }
        break
      }
      case 'user/message':{
        const src=e.data?.source
        if(src?.kind==='plugin'||src?.kind==='relay'||src?.kind==='recall')context.push({text:tr('contextInjection',{name:`${src?.form||src?.plugin||src?.kind}`})})
        break
      }
      case 'assistant/message':finalLines=finalOf(e.data?.message?.content);text='';reasoning='';hasStream=false;break
      case 'tool/call':{
        let rec=byCall.get(e.data?.callId)
        if(!rec){rec={name:e.data?.name||tr('toolCall'),args:'',complete:false,running:true};byCall.set(e.data?.callId,rec);pending.push(rec)}
        if(e.data?.name)rec.name=e.data.name
        if(e.data?.arguments!=null){rec.args=e.data.arguments;rec.complete=true}
        rec.running=true;break
      }
      case 'tool/result':{
        const rec=byCall.get(e.data?.message?.source?.callId),block=e.data?.message?.content?.[0]
        if(rec){rec.running=false;done.push({name:rec.name,args:rec.args,complete:rec.complete,isError:block?.isError})}
        break
      }
    }
  }
  const open=pending.filter(r=>r.running!==false)
  const describe=(r:ToolCallRecord|ToolCallDone)=>`${r.name||tr('toolCall')}${r.complete&&r.args?` · ${toolDetail(r.args)}`:''}`
  return {
    pendingCount:open.length,
    activity:[...open.slice(-2).map(r=>({icon:'play',text:describe(r)})),...done.slice(-2).map(r=>({icon:r.isError?'error':'success',text:describe(r)})),...context.slice(-2)],
    streamLines:hasStream?liveTextLines(tail(lastKind==='reasoning'?reasoning:text),lastKind==='reasoning'?'thought':undefined):[],
    thinking:hasStream&&lastKind==='reasoning',finalLines,
  }
}
