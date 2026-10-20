import test from 'node:test'
import assert from 'node:assert/strict'
import { sidebarChatAddress, canonicalSidebarAddress, createSidebarNavigation } from '../lib/navigation.js'

function fixture() {
  const calls = []
  const fail = () => { throw new Error('Main navigation or execution mutation is forbidden') }
  let available = true, resolved
  const ctx = {
    sessions: { subagentAddress: () => resolved, open: fail, openSubagent: fail, cancel: fail },
    get: name => !available ? undefined : name === 'sidebarRight' ? {
      openResource: (...args) => calls.push(args), split: fail, close: fail, toggleExpanded: fail,
    } : name === 'sidebarRightTabs' ? {
      candidates: () => [{ kind: 'subagentchat' }],
    } : undefined,
  }
  return { ctx, calls, nav: createSidebarNavigation(ctx),
    setAvailable: value => { available = value }, setResolved: value => { resolved = value } }
}

test('canonical resource preserves exact parent, child and routing mode', () => {
  for (const mode of ['one-shot', 'continuable', 'unknown']) {
    const address = sidebarChatAddress({ parentSessionId: 'parent & 中文', childSessionId: 'child /?#%', mode })
    const parsed = new URL(address)
    assert.equal(decodeURIComponent(parsed.pathname.slice('/session/'.length)), 'child /?#%')
    assert.equal(parsed.searchParams.get('parent'), 'parent & 中文')
    assert.equal(parsed.searchParams.get('mode'), mode)
    assert.equal(canonicalSidebarAddress(address), address)
  }
  assert.equal(sidebarChatAddress({ parentSessionId: '', childSessionId: 'c', mode: 'one-shot' }), null)
  for (const value of ['https://example.org/', 'dsh-resource://subagentchat/session/c?parent=p&mode=invalid',
    'dsh-resource://subagentchat/session/%zz?parent=p&mode=one-shot',
    'dsh-resource://subagentchat/session/c?parent=p&mode=one-shot#extra']) {
    assert.equal(canonicalSidebarAddress(value), null)
  }
})

test('both modes open native resources without splitting, replacing tabs or navigating the main view', () => {
  const { nav, calls } = fixture()
  for (const mode of ['one-shot', 'continuable']) {
    assert.equal(nav.openDefault({ id: `child-${mode}`, parentId: 'parent', mode }), true)
  }
  assert.equal(calls.length, 2)
  for (const [address, options] of calls) {
    assert.match(address, /^dsh-resource:\/\/subagentchat\/session\//)
    assert.deepEqual(options, { kind: 'subagentchat', preferNewPane: false, revealIfOpened: true })
  }
})

test('repeated clicks request the same canonical native tab identity', () => {
  const { nav, calls } = fixture()
  const row = { id: 'child', parentId: 'parent', mode: 'continuable' }
  nav.openDefault(row)
  nav.openDefault(row)
  nav.openAside('dsh-resource://subagentchat/session/child?mode=continuable&parent=parent')
  assert.equal(calls.length, 3)
  assert.ok(calls.every(call => call[0] === calls[0][0] && call[1].revealIfOpened === true))
})

test('services and durable subagent address are resolved again for every click', () => {
  const f = fixture()
  const row = { id: 'child' }
  f.setAvailable(false)
  assert.equal(f.nav.openDefault(row), false)
  f.setAvailable(true)
  assert.equal(f.nav.openDefault(row), false)
  f.setResolved({ parentSessionId: 'actual-parent', childSessionId: 'child', mode: 'one-shot' })
  assert.equal(f.nav.openDefault(row), true)
  assert.equal(new URL(f.calls[0][0]).searchParams.get('parent'), 'actual-parent')
  f.setResolved({ parentSessionId: 'other', childSessionId: 'different-child', mode: 'one-shot' })
  assert.equal(f.nav.openDefault(row), false)
  assert.equal(f.calls.length, 1)
})

test('unclaimed resources and service failures do not fall back to the main window', () => {
  const f = fixture()
  f.ctx.get = () => { throw new Error('Service unavailable') }
  assert.equal(f.nav.openDefault({ id: 'c', parentId: 'p', mode: 'one-shot' }), false)
  f.ctx.get = name => name === 'sidebarRight' ? { openResource: () => assert.fail('must not open') }
    : { candidates: () => [{ kind: 'unrelated' }] }
  assert.equal(f.nav.openDefault({ id: 'c', parentId: 'p', mode: 'one-shot' }), false)
  assert.equal(f.calls.length, 0)
})
