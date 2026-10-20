import { createViews } from './views.js'
import styles from './style.css'
import zh from '../locale/zh.json'
import en from '../locale/en.json'

window.__ModuleLoader__.load({
  id: 'dsh-task-diff-review',
  factory: require => {
    const React = require('react')
    return {
      inject: ['slots', 'locale', 'sidebarRight', 'sidebarRightTabs'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register('dsh-task-diff-review', { zh, en }))
        ctx.effect(() => {
          const style = document.createElement('style'); style.textContent = styles; document.head.append(style)
          return () => style.remove()
        })
        const open = (sessionId, index = 0) => ctx.sidebarRight.openResource(`dsh-resource://task-diff-review/session/${encodeURIComponent(sessionId)}`, {
          kind: 'task-diff-review', preferNewPane: false, revealIfOpened: true, params: { index, mode: 'task', taskId: '' },
        })
        const views = createViews(React, ctx, open)
        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: 'dsh-task-diff-review', kind: 'task-diff-review', patterns: ['dsh-resource://task-diff-review/session/**'],
          canOpen: value => /^dsh-resource:\/\/task-diff-review\/session\/[^/?#]+$/.test(value), title: () => '代码改动审查',
        }))
        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'dsh-task-diff-review' }, views.Dock))
        ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: 'dsh-task-diff-review' }, views.Review))
      },
    }
  },
})
