import {readFile,writeFile,mkdir} from 'node:fs/promises'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import assert from 'node:assert/strict'
import {launchBrowser} from '../dsh-bottom-terminal/test/browser/cdp.mjs'
import {attachComposerTool} from '../shared/composer-tools.js'
import {observeGitPopoverSpace} from '../dsh-task-diff-review/src/actions-view.js'
import {createGitStatusPill} from '../dsh-task-diff-review/src/git-status-pill.js'
const h=(type,props,...children)=>({type,props:props||{},children})
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')
function html(node){
 if(node==null||typeof node==='boolean')return ''
 if(Array.isArray(node))return node.map(html).join('')
 if(typeof node!=='object')return escape(node)
 if(typeof node.type==='function')return html(node.type({...node.props,children:node.children}))
 const attrs=Object.entries(node.props).filter(([key,value])=>!['key','children'].includes(key)&&!key.startsWith('on')&&value!=null).map(([key,value])=>` ${key==='className'?'class':key==='viewBox'?'viewBox':key.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())}="${escape(value)}"`).join('')
 return `<${node.type}${attrs}>${html(node.children)}</${node.type}>`
}
const gitPill=html(createGitStatusPill({createElement:h})({state:{repository:true,branch:'main',files:[]}}))
const fixtureIcon=path=>`<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true" style="vertical-align:middle"><path d="${path}"/></svg>`
const out=path.resolve('dsh-task-diff-review/.test-output/same-footer');await mkdir(out,{recursive:true});const css=await readFile('dsh-task-diff-review/src/style.css','utf8')
await writeFile(path.join(out,'same-footer.html'),`<!doctype html><meta charset="utf-8"><style>${css}
body{margin:20px;font:13px system-ui;color:#737780}#content{--dsh-composer-card-max-width:2000px;--dsh-composer-side-clearance:16px;width:1456px}#seat{display:flex;flex-direction:column}#input-root{display:flex;flex-direction:column;align-items:center;padding:0 16px 4px}.card{height:105px;box-sizing:border-box;border:1px solid #eee;border-radius:22px;width:100%;padding:15px;color:#aaa;box-shadow:0 3px 12px #00000005}.todo{margin:8px 32px;border:1px solid #eee;border-radius:16px;background:#fafafa;padding:9px 12px}.footer{display:flex;justify-content:center;align-items:center;gap:12px;max-width:100%;padding-top:4px}.info{display:flex;align-items:center;height:22px;white-space:nowrap}.info button{font:inherit;color:inherit;border:0;background:none;padding:0;display:block;text-overflow:ellipsis}.launcher{width:22px;height:22px;border:0;background:none;padding:0;display:flex;align-items:center;justify-content:center}.launcher svg{width:16px;height:16px}</style>
<div id="content" data-conversation-content><div data-conversation-scroll><div id="seat" data-composer-seat><div class="todo">${fixtureIcon('M3 4h1m2 0h7M3 8h1m2 0h7M3 12h1m2 0h7')}　任务　3 已完成</div><div class="todo">实时审查　14 个文件　<span style="color:green">+192</span> <span style="color:red">−35</span></div><div id="input-root"><div class="card">发消息或创建任务，/ 调用指令，@ 文件或对话</div><div class="footer" data-composer-dock><span style="display:contents"><span id="a" hidden></span><span class="info"><button>${fixtureIcon('M14 8a6 6 0 1 1-12 0 6 6 0 0 1 12 0M8 4v4l3 1')} 8 轮 498 步 · 55 tok/s</button></span><span class="info"><button>${fixtureIcon('M3 3h10v10H3zM3 6h10M3 10h10')} 50M tok · 缓存命中 98%</button></span></span><span class="info"><button>${fixtureIcon('M14 8a6 6 0 1 1-6-6v6z')} 34%</button></span></div></div></div></div></div>
<script>const attach=${attachComposerTool.toString()};const observeSpace=${observeGitPopoverSpace.toString()};const footer=document.querySelector('.footer'),seat=document.querySelector('#seat'),anchor=document.querySelector('#a');window.initial={height:seat.offsetHeight,style:footer.getAttribute('style')};window.git=attach(anchor,{id:'git',order:20});window.term=attach(anchor,{id:'terminal',order:10,shrink:false});term.member.innerHTML='<button class="launcher" aria-label="显示底部终端"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="m3 4 4 4-4 4m6 0h5"/></svg></button>';git.member.innerHTML=${JSON.stringify('<div class="dtd-actions-row"><div class="dtd-actions-container">'+gitPill+'</div></div>')};</script>`)
const browser=await launchBrowser('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',path.join(out,'same-footer-edge-'+process.pid))
try{
 const {targetId}=await browser.send('Target.createTarget',{url:'about:blank'}),{sessionId}=await browser.send('Target.attachToTarget',{targetId,flatten:true}),send=(m,p)=>browser.send(m,p,sessionId)
 const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception.description);return r.result.value}
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1496,height:320,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:pathToFileURL(path.join(out,'same-footer.html')).href});await evaluate('new Promise(r=>setTimeout(r,100))')
 let checks=0
 for(const width of [1456,800,380,220,1456]){
 await evaluate(`document.querySelector('#content').style.width='${width}px';new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`)
 const m=await evaluate(`(()=>{const f=footer.getBoundingClientRect(),i=[...document.querySelectorAll('.info')].map(n=>n.getBoundingClientRect()),t=term.member.querySelector('button').getBoundingClientRect(),g=git.member.querySelector('button').getBoundingClientRect();return {sameY:Math.abs(t.y+t.height/2-(i[0].y+i[0].height/2))<1,center:Math.abs((i[0].left+i[2].right)/2-(f.left+f.right)/2)<1,overlap:i[2].right>t.left-3,height:footer.offsetHeight,initial:26,right:Math.abs(g.right-f.right)<1,toolWidth:t.width}})()`)
 assert.ok(m.sameY,JSON.stringify(m));assert.ok(m.center,JSON.stringify(m));assert.equal(m.overlap,false,JSON.stringify(m));assert.equal(m.height,m.initial);assert.ok(m.right);assert.equal(m.toolWidth,22);checks+=6
 const pop=await evaluate(`(()=>{const c=document.querySelector('.dtd-actions-container'),p=document.createElement('div');p.className='dtd-git-popover';p.style.height='80px';c.append(p);const stop=observeSpace(c,h=>p.style.maxHeight=h+'px');const r=p.getBoundingClientRect(),f=footer.getBoundingClientRect();stop();p.remove();return {width:r.width,expected:Math.min(380,f.width),left:r.left,boundary:f.left}})()`)
 assert.equal(pop.width,pop.expected);assert.ok(pop.left>=pop.boundary-1);checks+=2
 }
 await evaluate(`document.querySelector('#content').style.width='1456px';new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`)
 const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(out,'same-footer.png'),Buffer.from(shot.data,'base64'))
 assert.equal(await evaluate(`(()=>{term.dispose();git.dispose();return footer.style.position===''&&footer.style.width===''&&seat.offsetHeight===initial.height&&!document.querySelector('[data-dsh-composer-tools]')})()`),true);checks++
 console.log(JSON.stringify({checks,screenshot:path.join(out,'same-footer.png'),exceptions:browser.events}))
}finally{await browser.close()}
