import test from 'node:test'
import { createIcons } from '../src/icons.js'
import assert from 'node:assert/strict'
import { base, scenarios, renderPill, nodes, text } from './git-status-fixture.mjs'

for (const [name, props, kinds] of scenarios) test(`footer ${name} uses accessible SVG indicators without status words`, () => {
  let clicks = 0
  const pill = renderPill({ ...props, onClick: () => clicks++ })
  const indicators = nodes(pill).filter(node => node.props.className?.startsWith('dtd-pill-indicator '))
  assert.equal(indicators.length, kinds.length)
  for (const [index, indicator] of indicators.entries()) {
    assert.ok(indicator.props.className.endsWith(`dtd-pill-${kinds[index]}`))
    assert.ok(nodes(indicator).some(node => node.type === 'svg'))
    assert.ok(indicator.props.title)
    assert.equal(indicator.props['aria-label'], indicator.props.title)
    assert.match(text(indicator), /^\d*$/)
  }
  assert.match(text(pill), /^(main)?\d*$/)
  assert.ok(pill.props['aria-label'].includes('Git 操作面板'))
  assert.equal(pill.props.title, pill.props['aria-label'])
  assert.ok(nodes(pill).filter(node => node.type === 'svg').every(node => node.props['aria-hidden'] === true))
  assert.ok(nodes(pill).some(node => node.props.className?.startsWith('dtd-pill-compact-state ')))
  pill.props.onClick(); assert.equal(clicks, 1)
})
test('branch names remain ordinary user content and expansion keeps its accessible state', () => {
  const branch = 'feature/修复-✓'
  const pill = renderPill({ state: { ...base, branch }, expanded: true })
  assert.equal(text(pill), branch)
  assert.equal(pill.props['aria-expanded'], true)
})

test('every file-status badge is an inline SVG without letter glyphs', () => {
  const React = { createElement: (type, props, ...children) => typeof type === 'function' ? type(props || {}) : ({ type, props: props || {}, children }) }
  const { FileStatusIcon } = createIcons(React)
  for (const status of ['A', 'M', 'D', 'R', 'C', 'T', 'U', '!', '?']) {
    const icon = FileStatusIcon({ status })
    assert.equal(icon.type, 'svg', status)
    assert.equal(icon.props['aria-hidden'], true)
    assert.equal(text(icon), '')
  }
})
