export const zh = {
  'markdown.copy': '复制',
  'markdown.copied': '已复制',
  'markdown.code': '代码块',
  'markdown.wrap': '自动换行',
  'markdown.unwrap': '取消换行',
  'markdown.footnotes': '脚注',
  'action.expand': '展开全文',
  'action.collapse': '收起',
  'action.expandTip': '展开这条消息的完整内容',
  'action.collapseTip': '折叠这条消息',
}

export const en = {
  'markdown.copy': 'Copy',
  'markdown.copied': 'Copied',
  'markdown.code': 'Code',
  'markdown.wrap': 'Wrap lines',
  'markdown.unwrap': 'Unwrap lines',
  'markdown.footnotes': 'Footnotes',
  'action.expand': 'Show full message',
  'action.collapse': 'Collapse',
  'action.expandTip': 'Show the whole message',
  'action.collapseTip': 'Collapse this message',
}

export function translatorOf(t) {
  if (typeof t === 'function') return t
  // Module-level fallback: returning a fresh closure per render would break
  // the memo boundary on the block renderer for no benefit.
  return fallbackTranslator
}

function fallbackTranslator(key) {
  if (typeof zh[key] === 'string') return zh[key]
  return key
}

/** Same shape as ui-chat's `markdownLabels(t)`: the primitives build their chrome from it. */
export function markdownLabels(tr) {
  return {
    code: {
      copyLabel: tr('markdown.copy'),
      copiedLabel: tr('markdown.copied'),
      toolbarLabels: {
        codeLabel: tr('markdown.code'),
        wrapLabel: tr('markdown.wrap'),
        unwrapLabel: tr('markdown.unwrap'),
      },
    },
    footnotes: tr('markdown.footnotes'),
  }
}
