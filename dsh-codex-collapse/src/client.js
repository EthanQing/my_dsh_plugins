import { createDisclosures } from './disclosure.js'
import { createController } from './view.js'
import zh from '../locale/zh.json'
import en from '../locale/en.json'

window.__ModuleLoader__.load({
  id: 'dsh-codex-collapse',
  factory: require => {
    const React = require('react')
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('dsh-codex-collapse', { zh, en }))
        let storage
        try { storage = globalThis.sessionStorage } catch { /* private mode */ }
        const disclosures = createDisclosures(storage)
        ctx.effect(() => () => disclosures.clear())
        const modeFace = () => {
          const entry = ctx.slots.entries('settings.general.item').find(item => item.options.id === 'transcript-view')
          return entry?.inject?.()
        }
        ctx.slots.inject('conversation.chat.node', () => {
          const original = ctx.slots.entries('conversation.chat.node').find(entry => entry.options.key === 'turn-process')
          if (!original || original.children || original.store) {
            console.warn('[dsh-codex-collapse] unsupported turn-process seat; native display retained')
            return () => {}
          }
          return ctx.slots.register({
            name: 'conversation.chat.node', key: 'turn-process',
            priority: (original.options.priority ?? 0) - 10,
            locale: original.locale ?? 'chat',
            ...(original.inject ? { inject: original.inject } : {}),
          }, createController(React, ctx, original, disclosures, modeFace))
        })
      },
    }
  },
})
