import test from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { installMessages } from '../src/messages.js'
import { isCollapsible } from '../src/collapse.js'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const h = React.createElement
const tick = () => new Promise(resolve => setImmediate(resolve))

function harness() {
  let changed
  const entries = []
  const calls = []
  const native = (name, props) => {
    calls.push({ name, props })
    return h('div', { 'data-native': name }, props.content?.text || '',
      ...(props.content?.attachments ?? []).map((a, i) => h('span', { key: i, 'data-attachment': a.type }, a.file?.name)),
      ...(props.content?.extraBlocks ?? []).map((b, i) => h('span', { key: `block${i}` }, b)),
      ...(props.content?.referenceLabels ?? []).map(label => h('span', { key: label }, label)))
  }
  const Row = ({ renderFactorySlot, owner, mer }) => h('section', null,
    h('button', null, mer?.label ?? 'native action'), renderFactorySlot('conversation.chat.user.content', owner))
  const register = (options, component) => {
    const entry = { options, component, locale: options.locale, inject: options.inject }
    entries.push(entry)
    changed?.('conversation.chat.node')
    return () => { const i = entries.indexOf(entry); if (i >= 0) entries.splice(i, 1); changed?.('conversation.chat.node') }
  }
  register({ key: 'user', priority: 0, locale: 'chat' }, Row)
  const ctx = {
    slots: { entries: () => entries, register, inject: (name, callback) => { callback(); return () => {} } },
    uiConversation: { userText: {
      subscribe: () => () => {}, getSnapshot: () => 0,
      createEvaluator: () => ({ text }) => [{ id: text.includes('@session') ? 'session' : 'text' }],
    } },
    locale: { bind: () => key => key, register: () => () => {} },
    effect: fn => fn(),
    on: (name, callback) => { changed = callback; return () => { changed = null } },
  }
  const primitives = { MarkdownText: React.memo(({ text }) => h('div', { 'data-official-markdown': true }, h('pre', null, text))) }
  const dispose = installMessages(ctx, React, primitives)
  const render = (text = '# hello', extras = {}, interactive = true, rowProps = {}) => {
    const entry = [...entries].filter(e => e.options.key === 'user').sort((a, b) => a.options.priority - b.options.priority)[0]
    return renderToStaticMarkup(h(entry.component, {
      renderFactorySlot: native,
      ...entry.inject?.('session1'),
      owner: { interactive, content: { text, attachments: [], extraBlocks: [], ...extras } },
      ...rowProps,
    }))
  }
  return { dispose, render, calls, register, Row, entries, ctx }
}

test('block Markdown stays outside inline slots; attachments and native extra blocks are delegated intact', async () => {
  const f = harness()
  await tick()
  const attachment = { type: 'file', file: { name: 'report.pdf' } }
  const html = f.render('# hi', { attachments: [attachment], extraBlocks: ['native-json'], referenceLabels: ['ref'] })
  assert.match(html, /data-official-markdown/)
  assert.doesNotMatch(html, /<span[^>]*><div/)
  assert.ok(html.indexOf('report.pdf') < html.indexOf('# hi'))
  assert.ok(html.indexOf('# hi') < html.indexOf('native-json'))
  assert.equal(f.calls[0].props.content.attachments[0], attachment)
  assert.ok(f.calls.every(c => c.name === 'conversation.chat.user.content'))
  f.dispose()
  assert.equal(f.entries.length, 1)
})

test('queue previews and session reference text retain original native surface', async () => {
  const f = harness()
  await tick()
  assert.doesNotMatch(f.render('# hi', {}, false), /data-official-markdown/)
  assert.doesNotMatch(f.render('hello @session'), /data-official-markdown/)
  assert.match(f.render('hello @session'), /hello @session/)
  f.dispose()
})

test('late edit/retry row replacement retains injected actions; unloading returns to official row', async () => {
  const f = harness()
  await tick()
  const removeRetry = f.register({ key: 'user', priority: -1, locale: 'retry', inject: () => ({ mer: { label: 'edit retry continue' } }) }, f.Row)
  await tick()
  const html = f.render()
  assert.match(html, /edit retry continue/)
  assert.match(html, /data-official-markdown/)
  removeRetry()
  await tick()
  assert.match(f.render(), /native action/)
  f.dispose()
})

test('collapse thresholds include long lines and multiline messages without truncating source', () => {
  assert.equal(isCollapsible('x'.repeat(1400)), false)
  assert.equal(isCollapsible('x'.repeat(1401)), true)
  assert.equal(isCollapsible('x\n'.repeat(18)), true)
})

test('existing edit/retry plugin loads unchanged and its real row retains edit and Markdown', async () => {
  const f = harness()
  let retryPlugin
  // The existing plugin has client-only stores; supply a server snapshot only
  // in this SSR fixture, leaving its source untouched.
  const clientReact = { ...React, useSyncExternalStore: (subscribe, getSnapshot) => React.useSyncExternalStore(subscribe, getSnapshot, getSnapshot) }
  vm.runInNewContext(readFileSync(new URL('../../dsh-message-edit-retry/lib/client.js', import.meta.url), 'utf8'), {
    window: { __ModuleLoader__: { load: ({ factory }) => { retryPlugin = factory(name => name === 'react' ? clientReact : {}) } } },
    console,
  })
  retryPlugin.apply(f.ctx)
  await tick()
  const html = f.render('', {}, true, {
    sessionId: 'session1',
    node: { kind: 'user', anchorSeq: 1, data: { content: [{ type: 'text', text: '# actual retry row' }] } },
  })
  assert.match(html, /data-official-markdown/)
  assert.match(html, /# actual retry row/)
  assert.match(html, /aria-label="action.edit"/)
  f.dispose()
})
