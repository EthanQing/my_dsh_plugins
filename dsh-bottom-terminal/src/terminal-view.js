import { Terminal } from '../vendor/xterm/lib/xterm.mjs'
import { FitAddon } from '../vendor/addon-fit/lib/addon-fit.mjs'

const FONT_STACK = 'ui-monospace, "Cascadia Mono", "Cascadia Code", Consolas, monospace'
const LIGHT = { background: '#ffffff', foreground: '#202124', cursor: '#202124', selectionBackground: '#b8d8ff' }
const DARK = { background: '#17191d', foreground: '#e6e8ed', cursor: '#e6e8ed', selectionBackground: '#364d70' }

export function terminalAppearance(theme, node) {
  const mode = typeof theme === 'string' ? theme : theme?.mode ?? theme?.colorScheme
  const dark = mode === 'dark' || (mode !== 'light' && node.ownerDocument?.body?.hasAttribute('data-ds-dark-theme'))
  const palette = { ...(dark ? DARK : LIGHT) }
  if (theme && typeof theme === 'object') {
    for (const key of Object.keys(theme)) if (typeof theme[key] === 'string' && (key in palette || /^(?:bright)?(?:Black|Red|Green|Yellow|Blue|Magenta|Cyan|White)$/i.test(key) || key === 'selectionForeground' || key === 'cursorAccent')) palette[key] = theme[key]
  }
  const family = theme?.fontFamilies?.terminal
  return { theme: palette, fontFamily: family ? `${family}, ${FONT_STACK}` : FONT_STACK, fontSize: typeof theme?.fontSizes?.terminal === 'number' ? theme.fontSizes.terminal : 13 }
}

/** Own only DOM rendering; the official model owns PTY, transport and recovery. */
export function attachTerminalRenderer({ node, model, visible = true, theme, TerminalClass = Terminal, FitAddonClass = FitAddon, onError = () => {} }) {
  let disposed = false, frame, lastRevision = 0, parsing = false, pending, focusable = false
  let shown = visible, colors = theme, layoutKey = '', fitPending = false
  const view = node.ownerDocument?.defaultView ?? globalThis
  const xterm = new TerminalClass({ ...terminalAppearance(theme, node), cursorBlink: true, minimumContrastRatio: 4.5, allowTransparency: false, disableStdin: true, scrollback: model.state.getSnapshot().environment?.scrollback ?? 0 })
  const fit = new FitAddonClass()
  xterm.loadAddon(fit)
  xterm.open(node)
  xterm.textarea?.setAttribute('aria-label', '终端')
  const report = error => { if (!disposed) onError(error instanceof Error ? error.message : String(error)) }
  const measure = () => {
    frame = undefined
    const state = model.state.getSnapshot()
    if (disposed || parsing) return
    fitPending = false
    if (!shown || !state.writable || !node.clientWidth || !node.clientHeight) return
    const dimensions = fit.proposeDimensions()
    if (!dimensions || !state.environment) return
    const cols = Math.min(dimensions.cols, state.environment.maxCols)
    const rows = Math.min(dimensions.rows, state.environment.maxRows)
    if (!Number.isFinite(cols) || !Number.isFinite(rows) || cols < 2 || rows < 1) return
    if (xterm.cols !== cols || xterm.rows !== rows) xterm.resize(cols, rows)
    if (state.info?.cols !== cols || state.info?.rows !== rows) model.resize(cols, rows)
  }
  const scheduleFit = () => {
    if (disposed) return
    fitPending = true
    if (frame === undefined) frame = view.requestAnimationFrame(measure)
  }
  const drain = () => {
    if (disposed || parsing || !pending) return
    const render = pending
    pending = undefined
    parsing = true
    try {
      if (render.frame.type === 'snapshot') {
        xterm.reset()
        // Hidden views still need snapshot geometry to parse the saved ANSI screen.
        xterm.resize(render.frame.info.cols, render.frame.info.rows)
      }
      xterm.write(render.frame.type === 'snapshot' ? render.frame.screen : render.frame.data, () => {
        if (disposed) return
        parsing = false
        model.acknowledge(render.revision)
        drain()
        if (render.frame.type === 'snapshot' || fitPending) scheduleFit()
      })
    } catch (error) { parsing = false; report(error) }
  }
  const sync = () => {
    if (disposed) return
    const state = model.state.getSnapshot()
    xterm.options.disableStdin = !state.writable
    if (state.environment && xterm.options.scrollback !== (state.environment.scrollback ?? 0)) xterm.options.scrollback = state.environment.scrollback ?? 0
    const nextFocusable = shown && state.writable
    if (nextFocusable && !focusable) xterm.focus()
    focusable = nextFocusable
    if (!shown) xterm.blur()
    const render = state.render
    if (render && render.revision > lastRevision) {
      lastRevision = render.revision
      pending = render
      drain()
    }
    if (shown && !state.writable && !parsing && state.info && (xterm.cols !== state.info.cols || xterm.rows !== state.info.rows)) xterm.resize(state.info.cols, state.info.rows)
    const nextLayout = [shown, state.writable, state.info?.cols, state.info?.rows, state.environment?.maxCols, state.environment?.maxRows].join(':')
    if (nextLayout !== layoutKey) { layoutKey = nextLayout; scheduleFit() }
  }
  const input = xterm.onData(data => { if (!disposed && shown && model.state.getSnapshot().writable) model.write(data) })
  xterm.attachCustomKeyEventHandler(event => {
    if (event.type !== 'keydown' || !event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) return true
    const clipboard = view.navigator?.clipboard
    if (event.code === 'KeyC' && xterm.hasSelection() && clipboard?.writeText) {
      void clipboard.writeText(xterm.getSelection()).catch(report)
      event.preventDefault()
      return false
    }
    if (event.code === 'KeyV' && clipboard?.readText && shown && model.state.getSnapshot().writable) {
      void clipboard.readText().then(text => { if (!disposed && shown && model.state.getSnapshot().writable) xterm.paste(text) }).catch(report)
      event.preventDefault()
      return false
    }
    return true
  })
  const observer = new view.ResizeObserver(scheduleFit)
  observer.observe(node)
  const unsubscribe = model.state.subscribe(sync)
  const detach = model.mount()
  sync()
  const fonts = node.ownerDocument?.fonts
  fonts?.addEventListener?.('loadingdone', scheduleFit)
  return {
    update({ visible: nextVisible, theme: nextTheme }) {
      if (disposed) return
      shown = nextVisible
      if (colors !== nextTheme) {
        colors = nextTheme
        Object.assign(xterm.options, terminalAppearance(nextTheme, node))
        scheduleFit()
      }
      sync()
    },
    dispose() {
      if (disposed) return
      disposed = true
      unsubscribe()
      detach() // Detach the stream; never close the retained Host process.
      observer.disconnect()
      if (frame !== undefined) view.cancelAnimationFrame(frame)
      fonts?.removeEventListener?.('loadingdone', scheduleFit)
      input.dispose()
      pending = undefined
      xterm.dispose()
    },
  }
}

export function createTerminalView(React) {
  const { createElement: h, useRef, useState, useLayoutEffect, useSyncExternalStore, useCallback } = React
  return function TerminalView({ model, visible = true, theme }) {
    const node = useRef(null), renderer = useRef(null)
    const [renderError, setRenderError] = useState('')
    const subscribe = useCallback(listener => model.state.subscribe(listener), [model])
    const snapshot = useCallback(() => model.state.getSnapshot(), [model])
    const state = useSyncExternalStore(subscribe, snapshot, snapshot)
    useLayoutEffect(() => {
      setRenderError('')
      const attached = attachTerminalRenderer({ node: node.current, model, visible, theme, onError: setRenderError })
      renderer.current = attached
      return () => { attached.dispose(); if (renderer.current === attached) renderer.current = null }
    }, [model])
    useLayoutEffect(() => { renderer.current?.update({ visible, theme }) }, [visible, theme, model])
    const ended = state.phase === 'closed' || state.info?.state === 'exited'
    const retry = !ended && (Boolean(renderError) || state.phase === 'disconnected' || state.phase === 'failed')
    const status = state.phase === 'disconnected' ? '连接已断开' : state.phase === 'connecting' ? '正在连接终端…' : ['idle', 'loading', 'creating'].includes(state.phase) ? '正在准备终端…' : ended ? `终端已结束${state.info?.exitCode === undefined ? '' : `（${state.info.exitCode}）`}` : state.phase === 'connected' && !state.writable ? '只读终端' : ''
    const issue = state.issue === 'missingTerminal' ? '终端已不存在，请新建终端。' : state.error ?? state.info?.error
    return h('section', { className: 'dbt-terminal-view', hidden: !visible, style: { display: visible ? 'flex' : 'none', flexDirection: 'column', flex: '1 1 auto', minHeight: 0, minWidth: 0, height: '100%' } },
      (status || retry) && h('div', { className: 'dbt-terminal-status', role: 'status', style: { flex: 'none' } }, status,
        retry && state.issue !== 'missingTerminal' && h('button', { type: 'button', onClick: () => { setRenderError(''); if (state.info) model.connect(); else void model.refresh() } }, '重新连接'),
        state.phase === 'connected' && !state.writable && !ended && h('button', { type: 'button', onClick: () => model.connect() }, '获取控制权')),
      h('div', { className: 'dbt-terminal-screen', ref: node, style: { flex: '1 1 auto', minHeight: 0, minWidth: 0, overflow: 'hidden' } }),
      (renderError || issue) && h('div', { className: 'dbt-terminal-error', role: 'alert', style: { flex: 'none', overflowWrap: 'anywhere' } }, renderError || issue))
  }
}
