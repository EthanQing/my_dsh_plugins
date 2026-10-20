import { zh, en } from './locale.js'
import { installStyles } from './styles.js'
import { installMessages } from './messages.js'
import { createComposerHighlighter } from './highlighter.js'
import { installKeyboard } from './keyboard.js'

window.__ModuleLoader__.load({
  id: 'dsh-markdown-editor',
  factory: require => {
    const React = require('react')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    return {
      inject: ['slots', 'locale', 'uiConversation'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('dsh-markdown-editor', { zh, en }))
        ctx.effect(installStyles)
        ctx.effect(() => installMessages(ctx, React, primitives))
        ctx.effect(() => {
          const highlighter = createComposerHighlighter()
          highlighter.start()
          return () => highlighter.dispose()
        })
        ctx.effect(() => installKeyboard(document))
      },
    }
  },
})
