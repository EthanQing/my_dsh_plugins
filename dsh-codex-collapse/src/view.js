import { turnOf, describeTurn, summary } from './model.js'
import { BASE_STYLE, hiddenStyle } from './styles.js'

const EMPTY = Object.freeze([])
const KINDS = ['tool-call', 'assistant-step', 'context', 'system-prompt', 'compaction', 'turn-error', 'turn-max-tokens']

export function createController(React, ctx, original, disclosures, getModeFace) {
  const h = React.createElement
  const noopSubscribe = () => () => {}

  function useSource(source, fallback = EMPTY) {
    const sourceFace = React.useMemo(() => ({
      subscribe: source ? notify => source.subscribe(notify) : noopSubscribe,
      snapshot: source ? () => source.getSnapshot() : () => fallback,
    }), [source, fallback])
    return React.useSyncExternalStore(sourceFace.subscribe, sourceFace.snapshot, sourceFace.snapshot)
  }

  function Body(props) {
    const turn = turnOf(props.node)
    const id = React.useId()
    const key = JSON.stringify([props.sessionId, turn?.turn])
    const modeFace = getModeFace()
    const mode = useSource(modeFace?.hooks?.transcriptView, undefined)
    const snapshot = props.useChat?.(chat => chat.nodes)
    const keys = props.useChat?.(chat => chat.locations.getTurn(turn?.turn)) ?? EMPTY
    const supported = Boolean(typeof props.sessionId === 'string' && turn && snapshot?.turnDataSource && snapshot?.get)
    // Each subscription is turn-local and provided by Chat's own incremental
    // index. Unrelated Turns do not trigger summary recomputation.
    const sources = React.useMemo(() => KINDS.map(kind => supported ? snapshot.turnDataSource(turn.turn, kind) : null), [snapshot, turn?.turn, supported])
    const tools = useSource(sources[0])
    const assistants = useSource(sources[1])
    const contexts = useSource(sources[2])
    const prompts = useSource(sources[3])
    const compactions = useSource(sources[4])
    const errors = useSource(sources[5])
    const limits = useSource(sources[6])
    const model = React.useMemo(() => supported
      ? describeTurn(keys.map(nodeKey => snapshot.get(nodeKey)).filter(Boolean), turn) : null,
    [snapshot, keys, turn, supported, tools, assistants, contexts, prompts, compactions, errors, limits])
    const subscribe = React.useCallback(notify => disclosures.subscribe(key, notify), [key])
    const read = React.useCallback(() => disclosures.get(key), [key])
    const choice = React.useSyncExternalStore(subscribe, read, read)
    React.useEffect(() => {
      if (model) disclosures.observe(key, model.phase)
    }, [key, model?.phase])
    const tr = ctx.locale.bind('dsh-codex-collapse')
    const [modeError, setModeError] = React.useState('')
    const setFlat = () => {
      setModeError('')
      Promise.resolve().then(() => modeFace.setTranscriptView('verbose')).catch(error => {
        console.warn('[dsh-codex-collapse] unable to select native verbose mode:', error)
        setModeError(tr('mode.failed'))
      })
    }
    if (!supported || !model || mode !== 'verbose') {
      return h('div', { className: 'dcc-root' },
        h('style', null, BASE_STYLE),
        h(original.component, { ...props, t: ctx.locale.bind(original.locale ?? 'chat') }),
        h('p', { className: 'dcc-note' }, tr('mode.required'), ' ',
          typeof modeFace?.setTranscriptView === 'function'
            ? h('button', { className: 'dcc-mode', type: 'button', onClick: setFlat }, tr('mode.enable')) : null),
        modeError ? h('p', { role: 'alert' }, modeError) : null)
    }
    if (!model.workCount && model.phase === 'completed') return null
    const label = summary(model, tr)
    const css = !choice.expanded ? hiddenStyle(id, turn.turn, model.hidden) : ''
    const dotIcon = model.waiting
      ? h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' },
          h('circle', { cx: 8, cy: 8, r: 6.5 }), h('path', { d: 'M8 7v4.5M8 4.75v.5' }))
      : model.errors || model.phase === 'failed'
        ? h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' },
            h('path', { d: 'M8 2.5l6 11H2l6-11z' }), h('path', { d: 'M8 7v3.5M8 12.5v.5' }))
        : model.phase === 'running'
          ? h('svg', { width: 12, height: 12, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', className: 'dcc-spinner' },
              h('circle', { cx: 8, cy: 8, r: 6, strokeOpacity: 0.25 }), h('path', { d: 'M14 8a6 6 0 0 0-6-6' }))
          : model.phase === 'stopped'
            ? h('svg', { width: 9, height: 9, viewBox: '0 0 10 10', fill: 'currentColor' }, h('rect', { width: 10, height: 10, rx: 2 }))
            : h('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', stroke: '#16a34a', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
                h('path', { d: 'M2.5 6.5l2.5 2.5 4.5-5' }))

    const chevronIcon = h('svg', {
      width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', stroke: 'currentColor',
      strokeWidth: 1.75, strokeLinecap: 'round', strokeLinejoin: 'round',
      className: `dcc-chevron ${choice.expanded ? 'is-expanded' : ''}`,
      'aria-hidden': 'true',
    }, h('path', { d: 'M4.5 3L7.5 6L4.5 9' }))

    return h('div', { className: 'dcc-root', 'data-dcc-scope': id, 'data-alert': model.errors || model.phase === 'failed' || model.waiting ? '' : undefined },
      h('style', null, BASE_STYLE + css),
      h('button', {
        type: 'button', className: 'dcc-toggle', 'aria-expanded': choice.expanded,
        title: label, onClick: () => disclosures.toggle(key),
      },
      h('span', { className: 'dcc-dot', 'aria-hidden': true }, dotIcon),
      h('span', { className: 'dcc-label' }, label),
      chevronIcon),
      h('span', { role: 'status', 'aria-live': 'polite', className: 'dcc-note' },
        model.waiting ? tr('attention.visible') : model.phase === 'failed' ? tr('failed.visible') : null))
  }

  // If an API changes, remove the hiding stylesheet on failure and retain the
  // native disclosure. The rest of the transcript remains outside this boundary.
  class Boundary extends React.Component {
    constructor(props) { super(props); this.state = { failed: false } }
    static getDerivedStateFromError() { return { failed: true } }
    componentDidCatch(error) { console.warn('[dsh-codex-collapse] native display retained:', error) }
    render() {
      return this.state.failed
        ? h(original.component, { ...this.props, t: ctx.locale.bind(original.locale ?? 'chat') })
        : h(Body, this.props)
    }
  }
  return React.memo(Boundary)
}
