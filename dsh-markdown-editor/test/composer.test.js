import test from 'node:test'
import assert from 'node:assert/strict'
import { createHeadlessEditor } from '@lexical/headless'
import { $getRoot, $createParagraphNode, $createTextNode, $createLineBreakNode, $getSelection, UNDO_COMMAND, REDO_COMMAND } from 'lexical'
import { registerHistory, createEmptyHistoryState } from '@lexical/history'
import { createComposerAdapter } from '../src/composer.js'
import { planListEdit, classifyLines } from '../src/lists.js'
import { classifyMarkdown } from '../src/markdown.js'
import { mustPass, installKeyboard } from '../src/keyboard.js'

function fixture(text, caret = text.length, soft = false) {
  const editor = createHeadlessEditor({ namespace: 'dsh-composer', onError: e => { throw e } })
  const root = { __lexicalEditor: editor }
  editor.getRootElement = () => root
  editor.isComposing = () => false
  const history = createEmptyHistoryState()
  registerHistory(editor, history, 1000)
  editor.update(() => {
    const doc = $getRoot()
    let global = 0
    let paragraph = $createParagraphNode()
    doc.append(paragraph)
    const lines = text.split('\n')
    for (const [i, line] of lines.entries()) {
      if (i) {
        if (soft) paragraph.append($createLineBreakNode())
        else { paragraph = $createParagraphNode(); doc.append(paragraph) }
        global++
      }
      const node = $createTextNode(line)
      paragraph.append(node)
      if (caret >= global && caret <= global + line.length) node.select(caret - global, caret - global)
      global += line.length
    }
  }, { discrete: true, tag: 'history-push' })
  const adapter = createComposerAdapter(root)
  assert.ok(adapter, `Lexical version ${editor.constructor.version} must be supported`)
  const readText = () => editor.getEditorState().read(() => $getRoot().getChildren().map(n => n.getTextContent()).join('\n'))
  const edit = (key, shift = key === 'Enter') => {
    const facts = adapter.read()
    const plan = facts && planListEdit(facts.text, facts.caret, key, shift)
    if (!plan) return false
    assert.ok(adapter.canApply(facts, plan))
    return adapter.apply(facts, plan)
  }
  return { editor, adapter, edit, readText, history }
}

test('real Lexical: Shift+Enter continues lists; plain Enter does not edit', () => {
  assert.equal(fixture('- abc').edit('Enter', false), false)
  for (const [text, expected] of [['- abc', '- abc\n- '], ['  9) abc', '  9) abc\n  10) '], ['+ abc', '+ abc\n+ '], ['-   ', ''], ['  2. \t ', '']]) {
    const f = fixture(text)
    assert.equal(f.edit('Enter'), true)
    assert.equal(f.readText(), expected)
  }
  const f = fixture('- abcd', 4)
  assert.equal(f.edit('Enter'), true)
  assert.equal(f.readText(), '- ab\n- cd')
  assert.equal(f.adapter.read().caret, 7)
})

test('real Lexical: Tab changes prefix and preserves body caret, across soft and block lines', () => {
  for (const soft of [false, true]) {
    const f = fixture('intro\n- abcd', 10, soft)
    assert.equal(f.edit('Tab'), true)
    assert.equal(f.readText(), 'intro\n  - abcd')
    assert.equal(f.adapter.read().caret, 12)
    assert.equal(f.edit('Tab', true), true)
    assert.equal(f.readText(), 'intro\n- abcd')
    assert.equal(f.adapter.read().caret, 10)
  }
})

test('real Lexical: one gesture undoes and redoes as one change', async () => {
  const f = fixture('- hello')
  f.edit('Enter')
  f.editor.dispatchCommand(UNDO_COMMAND)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.readText(), '- hello')
  f.editor.dispatchCommand(REDO_COMMAND)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(f.readText(), '- hello\n- ')
})

test('fences shield all inline syntax and list gestures until matching closer', () => {
  for (const opening of ['````js', '~~~python', '  ```c++', '- ```js', '> ```js']) {
    const text = `${opening}\n- **literal**\n\`\`\n1. x`
    assert.equal(planListEdit(text, text.length, 'Enter', true), null)
    const colors = classifyMarkdown(text)
    const start = text.indexOf('**literal**')
    assert.ok(colors.slice(start, start + 11).every(c => c === 'code'))
  }
  assert.equal(classifyLines('```js\n~~~\n- x\n```\n- y').at(-1).kind, 'list')
  assert.equal(classifyLines('```\n- ```\n- still code').at(-1).kind, 'code')
  assert.equal(planListEdit('```\n- x', 7, 'Tab'), null)
  const f = fixture('```\n- x')
  assert.equal(f.edit('Enter'), false)
})

test('unknown Lexical version/namespace and reference nodes disable writes', () => {
  const f = fixture('- abc')
  assert.equal(createComposerAdapter({ __lexicalEditor: { constructor: { version: '0.50.0' } } }), null)
  f.editor._config.namespace = 'other-editor'
  assert.equal(createComposerAdapter({ __lexicalEditor: f.editor }), null)
  f.editor._config.namespace = 'dsh-composer'
  f.editor.update(() => { $getSelection().anchor.getNode().setMode('token') }, { discrete: true })
  assert.equal(f.adapter.read(), null)
})

test('native IME, modified keys, menu and disabled gestures pass', () => {
  const root = { hasAttribute: () => false, getAttribute: () => null, ownerDocument: { querySelector: () => null } }
  for (const event of [{ isComposing: true }, { keyCode: 229 }, { key: 'Tab', ctrlKey: true }, { altKey: true }, { metaKey: true }, { key: 'Enter' }, { key: 'Enter', ctrlKey: true, shiftKey: true }, { defaultPrevented: true }, { getModifierState: () => true }]) assert.ok(mustPass(event, root))
  assert.equal(Boolean(mustPass({ key: 'Enter', shiftKey: true }, root)), false)
  assert.equal(Boolean(mustPass({ key: 'Enter', ctrlKey: true }, root)), false)
  root.ownerDocument.querySelector = () => ({})
  assert.ok(mustPass({ key: 'Tab' }, root))
})

test('delegated keyboard resolves replacement editor; repeated Enter and write errors never send', () => {
  const handlers = new Map()
  const document = { addEventListener: (type, fn) => handlers.set(type, fn), removeEventListener: type => handlers.delete(type), querySelector: () => null }
  const a = fixture('- first')
  const b = fixture('- replacement')
  const root = { ...a.editor.getRootElement(), ownerDocument: document, contains: () => true, hasAttribute: () => false, getAttribute: () => null }
  a.editor.getRootElement = () => root
  b.editor.getRootElement = () => root
  document.activeElement = { closest: () => root }
  const off = installKeyboard(document)
  const key = (repeat = false) => {
    const event = { key: 'Enter', shiftKey: true, repeat, preventDefault() { this.defaultPrevented = true }, stopPropagation() { this.stopped = true } }
    handlers.get('keydown')(event)
    return event
  }
  assert.ok(key().defaultPrevented)
  assert.equal(a.readText(), '- first\n- ')
  root.__lexicalEditor = b.editor
  assert.ok(key(true).defaultPrevented)
  assert.equal(b.readText(), '- replacement')
  assert.ok(key().defaultPrevented)
  assert.equal(b.readText(), '- replacement\n- ')
  const c = fixture('- safe')
  c.editor.getRootElement = () => root
  root.__lexicalEditor = c.editor
  c.editor.update = () => { throw new Error('simulated transaction failure') }
  const originalWarn = console.warn
  try {
    console.warn = () => {}
    assert.ok(key().defaultPrevented)
    assert.equal(c.readText(), '- safe')
  } finally { console.warn = originalWarn }
  off()
  assert.equal(handlers.size, 0)
})

test('keyboard shortcuts: Enter passes, Shift+Enter continues, Ctrl+Enter only breaks', () => {
  const handlers = new Map()
  const document = { addEventListener: (type, fn) => handlers.set(type, fn), removeEventListener: type => handlers.delete(type), querySelector: () => null }
  const f = fixture('1. first')
  const root = { __lexicalEditor: f.editor, ownerDocument: document, contains: () => true, hasAttribute: () => false, getAttribute: () => null }
  f.editor.getRootElement = () => root
  document.activeElement = { closest: () => root }
  const off = installKeyboard(document)
  const press = modifiers => {
    const event = { key: 'Enter', ...modifiers, preventDefault() { this.defaultPrevented = true }, stopPropagation() { this.stopped = true } }
    handlers.get('keydown')(event)
    return event
  }
  assert.equal(press({}).defaultPrevented, undefined)
  assert.equal(f.readText(), '1. first')
  assert.ok(press({ shiftKey: true }).defaultPrevented)
  assert.equal(f.readText(), '1. first\n2. ')
  assert.ok(press({ ctrlKey: true }).defaultPrevented)
  assert.equal(f.readText(), '1. first\n2. \n')
  f.editor.update(() => { $getRoot().clear().append($createParagraphNode()).selectEnd() }, { discrete: true })
  assert.ok(press({ ctrlKey: true }).defaultPrevented)
  assert.equal(f.readText(), '\n')
  f.editor.update(() => {
    $getRoot().clear()
    const node = $createTextNode('- abcd')
    $getRoot().append($createParagraphNode().append(node))
    node.select(2, 4)
  }, { discrete: true })
  press({ ctrlKey: true })
  assert.equal(f.readText(), '- \ncd')
  root.__lexicalEditor = null
  assert.ok(press({ ctrlKey: true }).defaultPrevented, 'unsupported adapter must not accidentally send')
  document.querySelector = () => ({})
  assert.equal(press({ ctrlKey: true }).defaultPrevented, undefined, 'menu retains ownership')
  off()
})
