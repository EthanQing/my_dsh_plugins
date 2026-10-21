import { createViews } from './views.js'
import { createActionsPanel } from './actions-view.js'
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
        const ReviewIcon = ({ size = 24 }) => React.createElement('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, 'aria-hidden': true },
          React.createElement('path', { d: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zm0 0v6h6M8 13h4m-2-2v4m4 2h3', strokeLinecap: 'round', strokeLinejoin: 'round' }))
        function ReviewGuide({ sessionId, useTabInfo, title, description }) {
          const { tab } = useTabInfo()
          return React.createElement('button', {
            type: 'button', className: 'dtd-guide-entry', 'data-sidebar-right-guide-entry': 'task-diff-review',
            onClick: () => tab.actions.openResource(`dsh-resource://task-diff-review/session/${encodeURIComponent(sessionId)}`, {
              replaceTab: true, preferNewPane: false, revealIfOpened: true, params: { index: 0, mode: 'task', taskId: '' },
            }),
          }, React.createElement('span', { className: 'dtd-guide-icon' }, React.createElement(ReviewIcon, {})),
          React.createElement('span', { className: 'dtd-guide-copy' }, React.createElement('span', { className: 'dtd-guide-title' }, title),
            description && React.createElement('span', { className: 'dtd-guide-description' }, description)))
        }
        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: 'dsh-task-diff-review', kind: 'task-diff-review', patterns: ['dsh-resource://task-diff-review/session/**'],
          canOpen: value => /^dsh-resource:\/\/task-diff-review\/session\/[^/?#]+$/.test(value), title: () => '代码改动审查',
          guide: [{ id: 'review', title: () => '代码改动审查', description: () => '查看本轮、工作区和历史提交的代码差异', icon: ReviewIcon, order: 40 }],
        }))
        ctx.slots.inject('sidebar.right.tab.guide.entry', () => ctx.slots.register({ name: 'sidebar.right.tab.guide.entry', key: 'dsh-task-diff-review' }, ReviewGuide))
        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'dsh-task-diff-review', order: 10 }, views.Dock))
        ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'dsh-task-diff-review-actions', order: 100 }, createActionsPanel(React)))
        ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: 'dsh-task-diff-review' }, views.Review))
      },
    }
  },
})
