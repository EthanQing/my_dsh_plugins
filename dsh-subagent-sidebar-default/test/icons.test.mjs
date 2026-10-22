import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import test from 'node:test'
const { transform } = await import(process.env.DSH_ESBUILD_MODULE || 'esbuild')
const root = new URL('../src/client/', import.meta.url)
const source = async name => (await readFile(new URL(`${name}.ts`, root), 'utf8')).split('\n').filter(line => !/^import\s.*\sfrom\s*['"]\./.test(line.trim())).map(line => line.replace(/^export /, '')).join('\n')
const modules = ['format', 'detail', 'live-events', 'live-output', 'i18n']
const code = (await transform((await Promise.all(modules.map(source))).join('\n')+'\n;({sidebarIcon,sidebarLabel,statsView,statsLine,liveFromEvents,legacyLiveLines,trimLiveLines,zh,en})', { loader: 'ts' })).code
const jsx = (type, props) => ({ type, props })
const api = vm.runInNewContext(code, { jsx, jsxs: jsx, React: { Fragment: 'fragment' } })
const tr = (key, values = {}) => (api.en[key] || key).replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match)
const plain = value => JSON.parse(JSON.stringify(value))
const event = (type, data) => ({ type: 'event', event: { type, data } })

test('every action and pending variant contains decorative inline SVG', () => {
  for (const key of ['continue','continuePending','pause','pauseAll','pausing','deleteTrash','hideShort','unhideShort','newCategory','oneShotBadge','loadLatest','loading','collapseFilters','expandFilters']) {
    const node = api.sidebarLabel(tr, key)
    const icon = node.props.children[0]
    assert.equal(icon.type, 'svg', key)
    assert.equal(icon.props['aria-hidden'], true)
    assert.ok(icon.props.children.props.d)
    if (['continuePending','pausing','loading'].includes(key)) assert.match(icon.props.className, /dsh-ssd-spin/)
  }
})
test('event tools keep distinct play, success and error SVG metadata', () => {
  const entries = [event('tool/call', {callId:'ok',name:'✓ user tool',arguments:'{}'}),event('tool/result',{message:{source:{callId:'ok'},content:[{isError:false}]}}),event('tool/call',{callId:'bad',name:'bad'}),event('tool/result',{message:{source:{callId:'bad'},content:[{isError:true}]}}),event('tool/call',{callId:'run',name:'run'})]
  const out = api.liveFromEvents(tr, entries, true)
  assert.deepEqual(plain(out.activity.map(line => line.icon)), ['play','success','error'])
  assert.match(out.activity[1].text, /^✓ user tool/)
  for(const line of out.activity) assert.equal(api.sidebarIcon(line.icon).type,'svg')
})
test('reasoning and final messages preserve user emoji without glyph parsing', () => {
  const content = '💭 user content\n✓ not a status'
  const stream = api.liveFromEvents(tr, [event('assistant/chunk',{chunk:{type:'reasoning-delta',text:content}})], true)
  assert.equal(stream.thinking,true)
  assert.deepEqual(plain(stream.streamLines),[{text:'💭 user content',icon:'thought'},{text:'✓ not a status'}])
  const final = api.liveFromEvents(tr,[event('assistant/message',{message:{content:[{type:'text',text:content}]}})],false)
  assert.deepEqual(plain(final.finalLines),[{text:'💭 user content'},{text:'✓ not a status'}])
})
test('legacy tool, command, reasoning and loading previews use structured states', () => {
  const legacy = data => ({legacy:data})
  assert.equal(api.legacyLiveLines(tr,legacy({runningCalls:[{name:'run'}]}),true)[0].icon,'play')
  for(const isError of [false,true])assert.equal(api.legacyLiveLines(tr,legacy({nodes:[{kind:'tool-result',isError,call:{name:'tool'}}]}),false)[0].icon,isError?'error':'success')
  assert.equal(api.legacyLiveLines(tr,legacy({nodes:[{kind:'command',name:'build'}]}),false)[0].icon,'command')
  const lines=api.legacyLiveLines(tr,legacy({partial:{blocks:[{kind:'reasoning',text:'💭 original'}]}}),false)
  assert.deepEqual(plain(lines),[{text:'💭 original',icon:'thought'}])
  assert.deepEqual(plain(api.trimLiveLines([{text:'123456',icon:'error'}],3)),[{text:'456',icon:'error'}])
})
test('usage directions render SVG while tooltip arithmetic remains readable', () => {
  const row = {projectionValues:{tokenUsage:{uncachedInputTokens:5,cacheReadTokens:3,cacheWriteTokens:2,outputTokens:4}}}
  assert.match(api.statsLine(tr,row), /^Input 10 \(uncached 5\) \/ Output 4/)
  const children = api.statsView(tr,row).props.children
  assert.equal(children.filter(child => child?.type === 'svg').length,2)
  assert.match(children.filter(child => typeof child === 'string').join(''), /10 \(uncached 5\) \/  4/)
})
test('all factory sources compile using the fixed module order', async () => {
  const names=['types','styles','bootstrap','format','runtime','retain','live-output','detail','markdown','live-events','active-float','navigation','deletion','manager','i18n','prompt-view','apply']
  const text=(await Promise.all(names.map(source))).join('\n')
  const result=await transform(`window.__ModuleLoader__.load({id:'test',factory:require=>{const React=require('react');const {jsx,jsxs}=require('react/jsx-runtime');${text}\nreturn {apply}}})`,{loader:'ts',target:'chrome120'})
  new vm.Script(result.code)
})
