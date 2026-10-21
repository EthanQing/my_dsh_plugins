// Attach through an official conversation slot's DOM reference, never a global selector.
export function attachDockHost(anchor, onHeight) {
  const content = anchor?.closest('[data-conversation-content]')
  if (!content || content.closest('[data-sidebar-right-session], [data-rightbar-col]')) return
  const scroller = content.querySelector(':scope > [data-conversation-scroll]')
  if (!scroller || content.querySelector(':scope > [data-dbt-host]')) return
  const host = content.ownerDocument.createElement('div')
  host.className = 'dbt-host'
  host.dataset.dbtHost = ''
  host.dataset.conversationRegion = 'terminal'
  const previous = content.getAttribute('data-dbt-main')
  content.setAttribute('data-dbt-main', '')
  content.appendChild(host)
  const composer = anchor.closest('[data-composer-seat]')
  let lastHeight = -1, lastComposerHeight = -1
  const measure = () => {
    const height = Math.max(0, content.clientHeight)
    const composerHeight = Math.ceil(composer?.getBoundingClientRect().height || 0)
    if (height !== lastHeight || composerHeight !== lastComposerHeight) {
      lastHeight = height; lastComposerHeight = composerHeight; onHeight(height, composerHeight)
    }
  }
  const observer = new ResizeObserver(measure)
  observer.observe(content)
  if (composer) observer.observe(composer)
  measure()
  return { host, dispose() {
    observer.disconnect()
    host.remove()
    if (previous === null) content.removeAttribute('data-dbt-main')
    else content.setAttribute('data-dbt-main', previous)
  } }
}

export function createDockMount(React, createPortal, api, Dock) {
  return function DockMount({ sessionId }) {
    const anchor = React.useRef(null)
    const [host, setHost] = React.useState(null)
    const active = React.useSyncExternalStore(api.session.subscribe, api.session.getSnapshot, api.session.getSnapshot)
    React.useLayoutEffect(() => {
      if (!sessionId || sessionId !== active) return
      const mount = attachDockHost(anchor.current, (height, composerHeight) => api.viewport.set({ height, composerHeight }))
      if (!mount) return
      setHost(mount.host)
      api.setAvailable(true)
      return () => { setHost(null); api.setAvailable(false); mount.dispose() }
    }, [sessionId, active])
    return React.createElement(React.Fragment, null,
      React.createElement('span', { ref: anchor, hidden: true, 'data-dbt-mount-anchor': '' }),
      host && createPortal(React.createElement(Dock), host))
  }
}
