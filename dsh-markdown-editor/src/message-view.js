import { markdownLabels } from './locale.js'
import { useCollapsed } from './collapse.js'
export function createMessageView(React, primitives) {
  const NS = 'dsh-markdown-editor'
  const h = React.createElement
  const useMemo = React.useMemo
  const isRenderable = value => typeof value === 'function' || (value && ['react.memo', 'react.forward_ref', 'react.lazy'].some(tag => value.$$typeof === Symbol.for(tag)))
  class MarkdownBoundary extends React.Component {
    constructor(props) {
      super(props)
      this.state = { failed: false }
    }

    static getDerivedStateFromError() {
      return { failed: true }
    }

    componentDidCatch(error) {
      console.warn(`[${NS}] markdown rendering failed; falling back to plain user text:`, error)
    }

    componentDidUpdate(previous) {
      // A new text (or a re-render caused by a conversation switch) gets a
      // fresh attempt instead of sticking to the fallback forever.
      if (previous.resetKey !== this.props.resetKey && this.state.failed === true) this.setState({ failed: false })
    }

    render() {
      return this.state.failed === true ? this.props.fallback : this.props.children
    }
  }

  /**
   * Interactive seat: real block Markdown through the shipped primitives.
   *
   * Collapsing is presentation only — the string is never truncated, no prop
   * changes, nothing is written back to a store. Expansion is component state
   * keyed by the text itself, so a new message (or a re-rendered conversation)
   * starts collapsed again.
   */
  const BlockUserText = React.memo(function BlockUserText({ text, tr }) {
    const { collapsible, expanded, toggle } = useCollapsed(React, text)
    const labels = useMemo(() => markdownLabels(tr), [tr])
    const MarkdownText = primitives.MarkdownText


    const body = useMemo(() => {
      // Read the export at render time (not module load): the primitives seat
      // is resolved during `apply`, and this also keeps a hot-swapped module
      // from pinning a stale component. `isRenderable` covers memo objects.
      if (isRenderable(MarkdownText) === false) return h('div', { className: 'dsh-mde-plain' }, text)
      return h(MarkdownText, { text, labels })
    }, [MarkdownText, text, labels])

    const collapsed = collapsible === true && expanded === false
    return h(
      'div',
      { className: 'dsh-mde-block', 'data-mde-block': '' },
      h(
        'div',
        {
          className: 'dsh-mde-clip',
          'data-mde-clip': '',
          ...(collapsed === true ? { 'data-collapsed': '' } : {}),
        },
        h(
          MarkdownBoundary,
          { resetKey: text, fallback: h('div', { className: 'dsh-mde-plain' }, text) },
          body,
        ),
        collapsed === true ? h('div', { className: 'dsh-mde-fade', 'aria-hidden': true }) : null,
      ),
      collapsible === false
        ? null
        : h(
          'button',
          {
            type: 'button',
            className: 'dsh-mde-toggle',
            'data-mde-toggle': '',
            'aria-expanded': expanded === true,
            title: expanded === true ? tr('action.collapseTip') : tr('action.expandTip'),
            onClick: toggle,
          },
          expanded === true ? tr('action.collapse') : tr('action.expand'),
        ),
    )
  })


  return BlockUserText
}
