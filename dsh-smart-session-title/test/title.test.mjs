import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cleanTitle,
  countCodePoints,
  decideTitle,
  isSameTopic,
  isTitleLengthValid,
  pickMessages,
  buildProviderInput,
  versionKeyOf,
  collectUserMessages,
  assistantTextAfter,
  isTurnRunning,
} from '../src/title.js'

test('cleanTitle keeps the first meaningful line and strips decoration', () => {
  assert.equal(cleanTitle('**修复 Remote 校验**'), '修复 Remote 校验')
  assert.equal(cleanTitle('标题：整理项目标题'), '整理项目标题')
  assert.equal(cleanTitle('```\n插件批量改名\n```'), '插件批量改名')
  assert.equal(cleanTitle('- “会话标题清洗”\n说明文字'), '会话标题清洗')
  assert.equal(cleanTitle('### 1. 会话标题清洗'), '会话标题清洗')
  assert.equal(cleanTitle('\n\n  \n'), '')
  assert.equal(cleanTitle('标题\u0000含控制符'), '标题含控制符')
  assert.equal(cleanTitle(undefined), '')
})

test('cleanTitle never fabricates a title from commentary alone', () => {
  assert.equal(cleanTitle('Here is the title:'), 'Here is the title:')
  assert.equal(cleanTitle('*'), '')
})

test('title length is measured in code points, not UTF-16 units', () => {
  assert.equal(countCodePoints('会话标题'), 4)
  // Four astral-plane emoji are four code points but eight UTF-16 units.
  assert.equal(countCodePoints('😀😀😀😀'), 4)
  assert.equal(isTitleLengthValid('五个汉字的标题'), true)
  assert.equal(isTitleLengthValid('短标题'), false)
  assert.equal(isTitleLengthValid('一二三四五六七八九十一二三四五六七'), false)
  assert.equal(isTitleLengthValid('一二三四五六七八九十一二三四五六'), true)
})

test('decideTitle enforces the 6..16 window and rejects empty output', () => {
  assert.deepEqual(decideTitle(''), { kind: 'reject', reason: 'empty' })
  assert.deepEqual(decideTitle('**短**'), { kind: 'reject', reason: 'length' })
  const accepted = decideTitle('修复插件批量改名')
  assert.equal(accepted.kind, 'accept')
  assert.equal(accepted.title, '修复插件批量改名')
})

test('decideTitle returns the standing title for a same-topic answer', () => {
  const decision = decideTitle('修复插件批量改名', { currentTitle: '修复 插件批量改名。' })
  assert.deepEqual(decision, { kind: 'accept', title: '修复 插件批量改名。', sameTopic: true })
})

test('isSameTopic ignores spacing, punctuation, case, and width', () => {
  assert.equal(isSameTopic('Fix Remote Gate', 'fix remote gate'), true)
  assert.equal(isSameTopic('会话标题清洗', '会话标题 清洗！'), true)
  assert.equal(isSameTopic('修复 Remote 校验', '整理项目标题'), false)
  assert.equal(isSameTopic('', ''), false)
})

test('collectUserMessages ignores provider text and blank prompts', () => {
  const events = [
    { type: 'user/message', seq: 0, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '第一条真人消息' }] } },
    { type: 'user/message', seq: 1, data: { source: { kind: 'provider' }, content: [{ type: 'text', text: '系统注入' }] } },
    { type: 'user/message', seq: 2, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '   ' }] } },
    { type: 'user/message', seq: 3, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '第三条真人消息' }] } },
  ]
  assert.deepEqual(collectUserMessages(events).map(message => message.seq), [0, 3])
})

test('assistantTextAfter keeps text only and stays bounded', () => {
  const events = [
    { type: 'assistant/message', seq: 1, data: { message: { content: [{ type: 'text', text: '前一轮' }] } } },
    { type: 'user/message', seq: 2, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '新问题' }] } },
    { type: 'assistant/message', seq: 3, data: { message: { content: [{ type: 'reasoning', text: '思考' }, { type: 'text', text: '本轮答案' }] } } },
    { type: 'turn/end', seq: 4, data: {} },
  ]
  assert.equal(assistantTextAfter(events, 2), '本轮答案')
  const long = 'x'.repeat(5000)
  const big = [
    { type: 'user/message', seq: 0, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '目标' }] } },
    { type: 'assistant/message', seq: 1, data: { message: { content: [{ type: 'text', text: long }] } } },
  ]
  assert.equal(assistantTextAfter(big, 0).length, 4000)
})

test('pickMessages always keeps the first message and honours the byte budget', () => {
  const messages = Array.from({ length: 40 }, (_, index) => ({ seq: index, text: `消息内容 ${String(index)}`.repeat(12) }))
  const selected = pickMessages(messages, 2048)
  assert.equal(selected[0].seq, 0)
  assert.ok(Buffer.byteLength(JSON.stringify(selected), 'utf8') <= 2048)
  assert.ok(selected.some(message => message.seq === 39))
  assert.deepEqual(selected.map(message => message.seq), [...selected.map(message => message.seq)].sort((a, b) => a - b))
})

test('buildProviderInput frames goal, assistant answer, and current title', () => {
  const built = buildProviderInput({
    messages: [{ seq: 0, text: '修复插件 Remote 校验' }],
    assistantText: '已补充身份校验',
    currentTitle: '旧标题',
    budgetBytes: 4096,
  })
  assert.deepEqual(built.messageSeqs, [0])
  assert.match(built.input, /"goal":\[/)
  assert.match(built.input, /已补充身份校验/)
  assert.match(built.input, /旧标题/)
})

test('versionKeyOf changes with content, title, or a new event', () => {
  const events = [
    { type: 'user/message', seq: 0, data: { source: { kind: 'user' }, content: [{ type: 'text', text: '目标 A' }] } },
    { type: 'assistant/message', seq: 1, data: { message: { content: [{ type: 'text', text: '答案' }] } } },
  ]
  const base = versionKeyOf('s1', events, 0)
  assert.equal(base, versionKeyOf('s1', [...events], 0))
  assert.notEqual(base, versionKeyOf('s1', events, 0) + 'x')
  assert.notEqual(base, versionKeyOf('s2', events, 0))
  // Committing a provider title (and its request record) never invalidates the key.
  const titled = [
    ...events,
    { type: 'session/title-llm-request', seq: 2, data: { titleProvider: 'p' } },
    { type: 'session/title', seq: 3, data: { title: '目标标题', source: { kind: 'provider', provider: 'p' } } },
  ]
  assert.equal(base, versionKeyOf('s1', titled, 0))
  // A USER title is significant: a preview taken before it cannot be confirmed.
  const userTitled = [...events, { type: 'session/title', seq: 2, data: { title: '手动标题', source: { kind: 'user' } } }]
  assert.notEqual(base, versionKeyOf('s1', userTitled, 0))
  assert.notEqual(
    versionKeyOf('s1', userTitled, 0),
    versionKeyOf('s1', [...events, { type: 'session/title', seq: 2, data: { title: '另一个手动标题', source: { kind: 'user' } } }], 0),
  )
  const changed = [...events, { type: 'turn/end', seq: 2, data: {} }]
  assert.notEqual(base, versionKeyOf('s1', changed, 0))
})

test('isTurnRunning follows the newest turn boundary', () => {
  assert.equal(isTurnRunning([]), false)
  assert.equal(isTurnRunning([{ type: 'turn/start' }, { type: 'turn/end' }]), false)
  assert.equal(isTurnRunning([{ type: 'turn/start' }, { type: 'turn/end' }, { type: 'turn/start' }]), true)
})
