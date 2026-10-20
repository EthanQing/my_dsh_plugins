window.__ModuleLoader__.load({
  id: 'dsh-markdown-editor',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const useMemo = React.useMemo
    const useEffect = React.useEffect
    const useState = React.useState

    const NS = 'dsh-markdown-editor'

    /** Long user messages collapse past either bound: characters or display lines. */
    const COLLAPSE_CHARS = 1400
    const COLLAPSE_LINES = 18
    /** Hard ceilings: a huge paste must never turn into a per-character paint. */
    const MAX_SCAN_CHARS = 100000
    const MAX_INLINE_CHARS = 20000
    const MAX_RUNS = 4000
    /** Composer repaint budget; the brief caps it at 60 ms. */
    const HIGHLIGHT_DELAY_MS = 40

    //#region dictionaries
    const zh = {
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

    const en = {
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
    //#endregion

    //#region styles
    /*
     * The wrapper is the only thing this plugin styles inside the bubble: the
     * chat layout and `.bubble`'s `white-space:pre-wrap` stay untouched, and the
     * block container opts back into `normal` so MarkdownText's paragraphs and
     * lists are not collapsed into one run of literal spaces.
     *
     * `::highlight()` accepts a deliberately small property set (color,
     * background-color, text-decoration, text-shadow). That is why composer
     * emphasis is color-only: font-weight and font-size are simply unavailable
     * there. Every color below comes from a theme token, so light and dark
     * themes both resolve without a plugin-level palette.
     */
    /* Named STYLE_SHEET, not CSS: `CSS` is the browser global the Highlight
     * API lives on, and a module-level binding of that name would shadow it. */
    const STYLE_SHEET = [
      '.dsh-mde-block{display:block;min-width:0;max-width:100%;white-space:normal;color:inherit}',
      '.dsh-mde-clip{display:block;position:relative;min-width:0;max-width:100%}',
      '.dsh-mde-clip[data-collapsed]{max-height:calc((22px + var(--dsh-content-font-delta,0px)) * 18);overflow:hidden}',
      '.dsh-mde-fade{display:block;position:absolute;left:0;right:0;bottom:0;height:calc((22px + var(--dsh-content-font-delta,0px)) * 3);background:linear-gradient(to bottom,transparent,var(--dsw-specific-bubble,var(--dsw-alias-bg-base)));border-bottom-left-radius:var(--dsw-radius-xl);border-bottom-right-radius:var(--dsw-radius-xl);pointer-events:none}',
      '.dsh-mde-toggle{display:inline-flex;align-items:center;gap:4px;margin:4px 0 0;padding:2px 6px;border:0;border-radius:var(--dsw-radius-sm);background:0 0;color:var(--dsw-alias-state-business-primary);cursor:pointer;font:inherit;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(20px + var(--dsh-content-font-delta-secondary,0px))}',      '.dsh-mde-toggle:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsh-mde-toggle:focus-visible{outline:1.5px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:2px}',
      '.dsh-mde-plain{white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;color:inherit}',
      '.dsh-mde-inline{white-space:inherit}',
      // Inline (non-interactive) tones. Phrasing content only: the composer
      // queue preview keeps its single-line ellipsis, and no block box is added.
      '.dsh-mde-t-strong{font-weight:600}',
      '.dsh-mde-t-em{font-style:italic}',
      '.dsh-mde-t-del{text-decoration:line-through;color:var(--dsw-alias-label-tertiary)}',
      '.dsh-mde-t-code{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);background:var(--dsw-alias-markdown-code-block,var(--dsw-specific-input-major,transparent));border-radius:var(--dsw-radius-xs,3px);padding:0 2px}',
      '.dsh-mde-t-link{color:var(--dsw-alias-state-business-primary);text-decoration:underline;text-underline-offset:2px}',
      '.dsh-mde-t-heading{font-weight:600}',
      '.dsh-mde-t-marker{color:var(--dsw-alias-label-caption)}',
      // Composer Custom Highlight paint: color-only, theme-token driven.
      '::highlight(dsh-mde-md-strong){color:var(--dsw-alias-label-primary)}',
      '::highlight(dsh-mde-md-em){color:var(--dsw-alias-label-primary)}',
      '::highlight(dsh-mde-md-del){color:var(--dsw-alias-label-tertiary);text-decoration:line-through}',
      '::highlight(dsh-mde-md-code){color:var(--dsw-alias-label-primary);background-color:var(--dsw-alias-markdown-code-block,var(--dsw-specific-input-major,transparent))}',
      '::highlight(dsh-mde-md-link){color:var(--dsw-alias-state-business-primary)}',
      '::highlight(dsh-mde-md-heading){color:var(--dsw-alias-label-primary)}',
      '::highlight(dsh-mde-md-list){color:var(--dsw-alias-label-primary)}',
      '::highlight(dsh-mde-md-marker){color:var(--dsw-alias-label-caption)}',
    ].join('')

    /** One style tag per plugin, addressed by the same attributes the stock bundles use. */
    function installStyles() {
      if (typeof document === 'undefined') return () => {}
      const key = `${NS}/client.css`
      if (document.querySelector(`style[data-plugin-css="${key}"]`) !== null) return () => {}
      const style = document.createElement('style')
      style.dataset.plugin = NS
      style.dataset.pluginCss = key
      style.textContent = STYLE_SHEET
      document.head.appendChild(style)
      return () => {
        style.remove()
      }
    }
    //#endregion

    //#region shared helpers
    /**
     * The slot seat hands the component a locale-bound `t` because the cell
     * registration declares `locale: NS`. Keep a fallback so a composition that
     * omits the seat still shows Chinese copy instead of raw dictionary keys.
     */
    function translatorOf(t) {
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
    function markdownLabels(tr) {
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

    /**
     * Primitives resolved once per activation. `MarkdownText` and `UserTextRun`
     * are optional reads: an older primitives build must degrade to plain text,
     * never break the bubble.
     */
    let primitivesRef = {}

    /**
     * Is this slot in the primitives export actually renderable?
     *
     * A `typeof X === 'function'` test is wrong here: the shipped
     * `MarkdownText` is `React.memo(...)`, and `memo` returns a *plain object*
     * (`{ $$typeof: Symbol.for('react.memo'), type, compare }`), not the wrapped
     * function. Testing only for `'function'` therefore rejected the real
     * component and silently sent every block bubble down the plain-text path.
     * Accept both shapes, plus the forwardRef/lazy wrappers a future build may
     * hand us — every one of them is a legal `createElement` type.
     */
    const RENDERABLE_SYMBOLS = [
      'react.memo',
      'react.forward_ref',
      'react.lazy',
      'react.provider',
      'react.context',
      'react.consumer',
    ]

    function isRenderable(value) {
      if (typeof value === 'function') return true
      if (value === null || typeof value !== 'object') return false
      const tag = value.$$typeof
      if (typeof tag !== 'symbol') return false
      for (const name of RENDERABLE_SYMBOLS) {
        if (tag === Symbol.for(name)) return true
      }
      return false
    }

    function loadPrimitives(requireFn) {
      try {
        const value = requireFn('@deepseek-ai/dsh-client-ui-primitives')
        return value !== null && typeof value === 'object' ? value : {}
      } catch (error) {
        console.warn(`[${NS}] ui-primitives unavailable; user text stays plain:`, error)
        return {}
      }
    }

    function countLines(text) {
      let lines = 1
      for (let index = 0; index < text.length; index++) if (text.charCodeAt(index) === 10) lines++
      return lines
    }

    function isCollapsible(text) {
      return text.length > COLLAPSE_CHARS || countLines(text) > COLLAPSE_LINES
    }
    //#endregion

    //#region markdown scanning (shared by bubbles and the composer)
    /*
     * One scanner feeds both painted surfaces so a bubble and the composer can
     * never disagree about what counts as Markdown. It only *classifies
     * character ranges*: it never rewrites text, so the bubble's non-interactive
     * mode (composer queue preview, inline edit echo) still shows the literal
     * source with colored ranges rather than a lossy re-render.
     *
     * Ranges are claimed high-priority first and never overwrite an earlier
     * claim, which keeps nesting (`**bold in a heading**`) deterministic.
     */
    const HIGHLIGHT_NAMES = {
      strong: 'dsh-mde-md-strong',
      em: 'dsh-mde-md-em',
      del: 'dsh-mde-md-del',
      code: 'dsh-mde-md-code',
      link: 'dsh-mde-md-link',
      heading: 'dsh-mde-md-heading',
      list: 'dsh-mde-md-list',
      marker: 'dsh-mde-md-marker',
    }

    const INLINE_CLASSES = {
      strong: 'dsh-mde-t-strong',
      em: 'dsh-mde-t-em',
      del: 'dsh-mde-t-del',
      code: 'dsh-mde-t-code',
      link: 'dsh-mde-t-link',
      heading: 'dsh-mde-t-heading',
      list: 'dsh-mde-t-marker',
      marker: 'dsh-mde-t-marker',
    }

    /*
     * Every repetition below is length-bounded. The scanner runs on keystroke
     * (debounced) over text up to 100k characters, so an unbounded lazy body
     * would let a line full of `**` turn into quadratic work.
     */

    /** Character classification for one text run; `null` means "leave it alone". */
    function classifyMarkdown(text) {
      const classes = new Array(text.length).fill(null)
      const claim = (start, end, name) => {
        if (start < 0) start = 0
        if (end > text.length) end = text.length
        for (let index = start; index < end; index++) if (classes[index] === null) classes[index] = name
      }

      // 1. Inline code wins over everything: its body is literal.
      const codePattern = /`([^`\n]{1,1000})`/g
      for (let match = codePattern.exec(text); match !== null; match = codePattern.exec(text)) {
        const start = match.index
        const end = start + match[0].length
        claim(start, start + 1, 'marker')
        claim(start + 1, end - 1, 'code')
        claim(end - 1, end, 'marker')
      }

      // 2. Links: `[label](url)`. The label is link-colored, the rest is syntax.
      const linkPattern = /\[([^\]\n]{0,500})\]\(([^()\s]{1,2000})\)/g
      for (let match = linkPattern.exec(text); match !== null; match = linkPattern.exec(text)) {
        const start = match.index
        const labelStart = start + 1
        const labelEnd = labelStart + match[1].length
        const end = start + match[0].length
        claim(labelStart, labelEnd, 'link')
        claim(start, labelStart, 'marker')
        claim(labelEnd, end, 'marker')
      }

      // 3. Strong: `**x**` and `__x__`.
      const strongPatterns = [/\*\*([^\n]{1,800}?)\*\*/g, /__([^\n]{1,800}?)__/g]
      for (const pattern of strongPatterns) {
        for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
          const start = match.index
          const bodyStart = start + 2
          const bodyEnd = bodyStart + match[1].length
          const end = start + match[0].length
          claim(bodyStart, bodyEnd, 'strong')
          claim(start, bodyStart, 'marker')
          claim(bodyEnd, end, 'marker')
        }
      }

      // 4. Strikethrough: `~~x~~`.
      const delPattern = /~~([^\n]{1,800}?)~~/g
      for (let match = delPattern.exec(text); match !== null; match = delPattern.exec(text)) {
        const start = match.index
        const bodyStart = start + 2
        const bodyEnd = bodyStart + match[1].length
        const end = start + match[0].length
        claim(bodyStart, bodyEnd, 'del')
        claim(start, bodyStart, 'marker')
        claim(bodyEnd, end, 'marker')
      }

      // 5. Emphasis: `*x*` / `_x_`, with word-boundary guards so `snake_case`
      //    and `a * b` are not mistaken for emphasis.
      const emPatterns = [
        { pattern: /(^|[^*_\w])\*([^\s*\n][^*\n]{0,400}?)\*(?!\*)/g, lead: 1 },
        { pattern: /(^|[^*_\w])_([^\s_\n][^_\n]{0,400}?)_(?!_)/g, lead: 1 },
      ]
      for (const { pattern, lead } of emPatterns) {
        for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
          const markerStart = match.index + match[lead].length
          const bodyStart = markerStart + 1
          const bodyEnd = bodyStart + match[2].length
          const end = bodyEnd + 1
          if (end > text.length) continue
          claim(bodyStart, bodyEnd, 'em')
          claim(markerStart, bodyStart, 'marker')
          claim(bodyEnd, end, 'marker')
        }
      }

      // 6. Line-start block syntax. The composer cannot reflow these lines (no
      //    decorator API), so only the marker and the line body get color.
      const headingPattern = /^([ \t]*)(#{1,6})([ \t]+)(.*)$/gm
      for (let match = headingPattern.exec(text); match !== null; match = headingPattern.exec(text)) {
        const lineStart = match.index
        const markerStart = lineStart + match[1].length
        const bodyStart = markerStart + match[2].length + match[3].length
        const bodyEnd = lineStart + match[0].length
        claim(markerStart, bodyStart, 'marker')
        claim(bodyStart, bodyEnd, 'heading')
      }

      const listPattern = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)/gm
      for (let match = listPattern.exec(text); match !== null; match = listPattern.exec(text)) {
        const markerStart = match.index + match[1].length
        const markerEnd = markerStart + match[2].length
        claim(markerStart, markerEnd, 'list')
        claim(markerEnd, markerEnd + match[3].length, 'marker')
      }

      const quotePattern = /^([ \t]*)(>)([ \t]?)/gm
      for (let match = quotePattern.exec(text); match !== null; match = quotePattern.exec(text)) {
        const markerStart = match.index + match[1].length
        const markerEnd = markerStart + 1
        claim(markerStart, markerEnd, 'marker')
      }

      return classes
    }

    /** Collapse a per-character classification into the minimal run list. */
    function buildRuns(classes) {
      const runs = []
      let index = 0
      while (index < classes.length) {
        const name = classes[index]
        let next = index + 1
        while (next < classes.length && classes[next] === name) next++
        if (name !== null) runs.push({ name, start: index, end: next })
        index = next
      }
      return runs
    }

    /** Inline, phrasing-only paint for `interactive !== true`. */
    function renderInlineChildren(text) {
      if (text.length === 0) return []
      if (text.length > MAX_INLINE_CHARS) return [text]
      const runs = buildRuns(classifyMarkdown(text))
      if (runs.length === 0) return [text]
      const children = []
      let cursor = 0
      for (const run of runs) {
        if (run.start > cursor) children.push(text.slice(cursor, run.start))
        const className = INLINE_CLASSES[run.name]
        const body = text.slice(run.start, run.end)
        children.push(
          className === undefined ? body : h('span', { className, key: `${run.name}:${run.start}` }, body),
        )
        cursor = run.end
      }
      if (cursor < text.length) children.push(text.slice(cursor))
      return children
    }
    //#endregion

    //#region bubble rendering
    /**
     * Lightweight error boundary. A Markdown parse failure must cost the bubble's
     * formatting, never the message: the fallback is the same display text the
     * official renderer would have shown.
     */
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

    /** Non-interactive seat: inline only, so queue previews keep `ellipsis`. */
    const InlineUserText = React.memo(function InlineUserText({ text }) {
      const children = useMemo(() => renderInlineChildren(text), [text])
      return h('span', { className: 'dsh-mde-inline' }, children)
    })

    /**
     * Interactive seat: real block Markdown through the shipped primitives.
     *
     * Collapsing is presentation only — the string is never truncated, no prop
     * changes, nothing is written back to a store. Expansion is component state
     * keyed by the text itself, so a new message (or a re-rendered conversation)
     * starts collapsed again.
     */
    const BlockUserText = React.memo(function BlockUserText({ text, tr }) {
      const collapsible = useMemo(() => isCollapsible(text), [text])
      const [expanded, setExpanded] = useState(false)
      const labels = useMemo(() => markdownLabels(tr), [tr])
      const MarkdownText = primitivesRef.MarkdownText

      useEffect(() => {
        setExpanded(false)
      }, [text])

      const body = useMemo(() => {
        // Read the export at render time (not module load): the primitives seat
        // is resolved during `apply`, and this also keeps a hot-swapped module
        // from pinning a stale component. `isRenderable` covers memo objects.
        if (isRenderable(MarkdownText) === false) return h('span', { className: 'dsh-mde-plain' }, text)
        return h(MarkdownText, { text, labels })
      }, [MarkdownText, text, labels])

      const collapsed = collapsible === true && expanded === false
      /*
       * The parent factory declares this slot `inline: true` and wraps every
       * node cell in a `<span>`, so the surface stays a `span` even here; it is
       * made block-level by CSS only. MarkdownText itself emits a block `<div>`,
       * which the host already tolerates for other block-ish inline seats.
       */
      return h(
        'span',
        { className: 'dsh-mde-block', 'data-mde-block': '' },
        h(
          'span',
          {
            className: 'dsh-mde-clip',
            'data-mde-clip': '',
            ...(collapsed === true ? { 'data-collapsed': '' } : {}),
          },
          h(
            MarkdownBoundary,
            { resetKey: text, fallback: h('span', { className: 'dsh-mde-plain' }, text) },
            body,
          ),
          collapsed === true ? h('span', { className: 'dsh-mde-fade', 'aria-hidden': true }) : null,
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
              onClick: () => setExpanded((value) => value === false),
            },
            expanded === true ? tr('action.collapse') : tr('action.expand'),
          ),
      )
    })

    /**
     * Keyed `conversation.user.text.node` cell for `key: 'text'`.
     *
     * The stock cell is `priority: 100`; a keyed slot renders only the lowest
     * priority survivor per key, so `-1` takes the seat and `100` stays as the
     * fallback if this registration is ever dropped. Same key + same priority
     * is what throws, so `-1` can never collide with the official entry.
     *
     * Only the `text` cell is replaced: `session` references are segmented out
     * by the official `conversation.user.text` factory and keep their own chip
     * renderer, which is why `interactive` keeps meaning "chips stay chips".
     */
    const MarkdownUserText = React.memo(function MarkdownUserText(props) {
      const node = props.node
      const data = node !== null && node !== undefined && typeof node.data === 'object' && node.data !== null ? node.data : {}
      // `display` is the official collapse-whitespace projection; falling back to
      // `text` then `raw` keeps the component total for any node shape.
      const text =
        typeof data.display === 'string'
          ? data.display
          : typeof data.text === 'string'
            ? data.text
            : typeof props.raw === 'string'
              ? props.raw
              : ''
      const tr = translatorOf(props.t)
      if (props.interactive === true) return h(BlockUserText, { text, tr })
      return h(InlineUserText, { text })
    })
    //#endregion

    //#region composer highlighting
    /*
     * Tier A: the composer is a Lexical contenteditable with no decoration API
     * exposed to plugins, so this is the ceiling — source stays untouched, only
     * character ranges are tinted through the CSS Custom Highlight API.
     *
     * Deliberately NOT done: no DOM writes, no textContent/innerHTML/selection
     * changes, no `editor.update()` (it would pollute the undo stack), no
     * mirrored layer, no synthetic caret, no heading font-size or bold weight.
     * `::highlight()` cannot change glyph metrics anyway.
     */
    const BLOCK_TAGS = new Set(['DIV', 'P', 'LI', 'BLOCKQUOTE', 'UL', 'OL', 'PRE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'])

    /**
     * Flatten the editable subtree into one string plus the map that turns a
     * string offset back into a DOM position. Chips and line breaks become
     * sentinel newlines: they must neither be matched nor let a pattern span
     * across them.
     */
    function collectTextSegments(root) {
      const segments = []
      let text = ''
      const visit = (node) => {
        if (node.nodeType === 3) {
          const value = node.data
          if (value.length === 0) return
          const start = text.length
          text += value
          segments.push({ node, start, end: text.length })
          return
        }
        if (node.nodeType !== 1) return
        const element = node
        if (
          element.hasAttribute('data-composer-chip') ||
          element.hasAttribute('data-composer-command') ||
          element.hasAttribute('data-composer-text-ref')
        ) {
          text += '\n'
          return
        }
        if (element.tagName === 'BR') {
          text += '\n'
          return
        }
        for (const child of element.childNodes) {
          visit(child)
          if (child.nodeType === 1 && BLOCK_TAGS.has(child.tagName)) text += '\n'
        }
      }
      visit(root)
      return { text, segments }
    }

    /** Offset → DOM position inside the flattened editor text. */
    function positionAt(segments, offset) {
      let low = 0
      let high = segments.length - 1
      while (low <= high) {
        const middle = (low + high) >> 1
        const segment = segments[middle]
        if (offset < segment.start) high = middle - 1
        else if (offset > segment.end) low = middle + 1
        else {
          const local = Math.max(0, Math.min(segment.end - segment.start, offset - segment.start))
          return { node: segment.node, offset: local }
        }
      }
      if (segments.length === 0) return null
      // The offset fell in a sentinel gap: clamp to the nearest real boundary.
      if (low >= segments.length) {
        const last = segments[segments.length - 1]
        return { node: last.node, offset: last.end - last.start }
      }
      return { node: segments[low].node, offset: 0 }
    }

    function createComposerHighlighter() {
      const supported =
        typeof globalThis.CSS !== 'undefined' &&
        globalThis.CSS !== null &&
        typeof globalThis.CSS.highlights === 'object' &&
        globalThis.CSS.highlights !== null &&
        typeof globalThis.Highlight === 'function'
      if (supported === false) {
        // Silent degradation: an engine without the Highlight API keeps a fully
        // working composer, just without syntax tinting.
        return { start: () => {}, dispose: () => {} }
      }

      let editor = null
      let timer = 0
      let composing = false
      let lastText = null
      let lastHead = null
      let disposed = false
      const bound = []

      const listen = (target, type, handler, options) => {
        target.addEventListener(type, handler, options)
        bound.push(() => target.removeEventListener(type, handler, options))
      }

      function clearAll() {
        lastText = null
        lastHead = null
        for (const name of Object.values(HIGHLIGHT_NAMES)) {
          try {
            globalThis.CSS.highlights.delete(name)
          } catch (error) {
            console.warn(`[${NS}] unable to clear highlight '${name}':`, error)
          }
        }
      }

      function releaseEditor() {
        editor = null
        clearAll()
      }

      function resolveEditor() {
        const direct = document.querySelector('[data-composer-input][contenteditable="true"]')
        const scoped =
          direct !== null
            ? direct
            : document.querySelector('[data-conversation-content] [contenteditable="true"]')
        if (scoped !== null) return scoped
        for (const candidate of document.querySelectorAll('[contenteditable="true"]')) {
          if (candidate.__lexicalEditor !== undefined) return candidate
        }
        return null
      }

      /** Only the focused editor is painted; blur and conversation switches clear. */
      function activeEditor() {
        const candidate = resolveEditor()
        if (candidate === null) return null
        const active = document.activeElement
        if (active === null || active === document.body) return null
        return candidate.contains(active) ? candidate : null
      }

      function rangeFor(segments, start, end) {
        const from = positionAt(segments, start)
        const to = positionAt(segments, end)
        if (from === null || to === null) return null
        if (from.node === to.node && from.offset >= to.offset) return null
        const range = document.createRange()
        try {
          range.setStart(from.node, from.offset)
          range.setEnd(to.node, to.offset)
        } catch (error) {
          return null
        }
        return range
      }

      function refresh() {
        if (editor === null || editor.isConnected === false) {
          releaseEditor()
          return
        }
        const { text, segments } = collectTextSegments(editor)
        if (segments.length === 0) {
          releaseEditor()
          return
        }
        /*
         * Two cheap invalidation keys. The text itself catches edits; the first
         * text node's identity catches a Lexical re-render that swapped the DOM
         * under us without changing the content — the previous `Range`s would
         * still be alive but detached, and the paint would silently vanish.
         */
        const head = segments[0].node
        if (text === lastText && head === lastHead) return
        lastText = text
        lastHead = head

        if (text.length > MAX_SCAN_CHARS) {
          // Long-text guard: past 100k characters the repaint is not worth it.
          clearAll()
          lastText = text
          lastHead = head
          return
        }

        const runs = buildRuns(classifyMarkdown(text))
        const buckets = new Map()
        let count = 0
        for (const run of runs) {
          if (count >= MAX_RUNS) break
          const range = rangeFor(segments, run.start, run.end)
          if (range === null) continue
          count++
          let list = buckets.get(run.name)
          if (list === undefined) {
            list = []
            buckets.set(run.name, list)
          }
          list.push(range)
        }

        for (const [group, name] of Object.entries(HIGHLIGHT_NAMES)) {
          const list = buckets.get(group)
          if (list === undefined || list.length === 0) {
            globalThis.CSS.highlights.delete(name)
            continue
          }
          const highlight = new Highlight()
          for (const range of list) highlight.add(range)
          globalThis.CSS.highlights.set(name, highlight)
        }
      }

      function tick() {
        timer = 0
        if (disposed === true || composing === true) return
        const next = activeEditor()
        if (next !== editor) {
          if (editor !== null) clearAll()
          editor = next
        }
        if (editor === null) {
          clearAll()
          return
        }
        refresh()
      }

      function schedule() {
        if (disposed === true || composing === true || timer !== 0) return
        timer = window.setTimeout(tick, HIGHLIGHT_DELAY_MS)
      }

      function start() {
        if (disposed === true) return
        // Delegated at the document level: the composer's contenteditable host
        // is mounted and unmounted by the host shell, so binding to it directly
        // would leak a listener on every session switch.
        listen(document, 'selectionchange', schedule)
        listen(document, 'focusin', schedule, true)
        // Blur and conversation switches must clear the paint: the recompute in
        // `tick` resolves "no focused editor" to a full release.
        listen(document, 'focusout', schedule, true)
        listen(document, 'input', schedule, true)
        listen(document, 'compositionstart', () => {
          // An IME preedit must not be painted: the ranges would be recomputed
          // mid-composition and fight the candidate window.
          composing = true
        }, true)
        listen(document, 'compositionend', () => {
          composing = false
          schedule()
        }, true)
      }

      function dispose() {
        disposed = true
        composing = false
        if (timer !== 0) {
          window.clearTimeout(timer)
          timer = 0
        }
        clearAll()
        editor = null
        for (const off of bound.splice(0)) {
          try {
            off()
          } catch (error) {
            console.warn(`[${NS}] composer listener cleanup failed:`, error)
          }
        }
      }

      return { start, dispose }
    }
    //#endregion

    //#region composer rich text
    /*
     * The composer's node set is fixed by the shell (`dsh-composer`:
     * ReferenceChip, CommandChip, TextRef) and the loader exposes no `lexical`
     * seed, so there is no way to register a heading/list/quote/code node. Rich
     * text therefore has to be built out of two things that never change the
     * document text:
     *
     *   1. `TextNode.setStyle(css)` — Lexical applies the CSS itself through
     *      `createDOM`/`updateDOM`, and `getTextContent()` is untouched. Sending,
     *      detect offsets, the clipboard projection, selection mapping and IME
     *      all keep seeing the exact source string. This is the pivot of the
     *      whole feature.
     *   2. Capture-phase gestures (Enter, Tab, paste) that edit plain text: one
     *      `editor.update` per gesture, so one undo step.
     *
     * Everything here depends on shell-private surface (`__lexicalEditor`, the
     * EditorState's `_nodeMap`/`_selection`, `RangeSelection.insertParagraph`).
     * That dependency was approved explicitly; every touch is capability-probed
     * and degrades to the stock composer, never to a broken one.
     *
     * Deliberately NOT done: rewriting `getTextContent()`, replacing nodes or
     * the editor, changing the DOM structure, `require('lexical')`, hiding list
     * markers, renumbering sibling list items, or splitting non-focused blocks.
     */
    const FEATURE_FLAGS = {
      lineStyles: true,
      enterList: true,
      tabIndent: true,
      pasteMarkdown: true,
    }

    /** Approved behavior change: Tab inside a list item indents instead of leaving the field. */
    const INDENT_UNIT = 2
    /** Same burst budget as the highlighter: one style pass per typing burst. */
    const STYLE_DELAY_MS = 40
    /** Past this many source lines a Markdown paste goes to the stock handler. */
    const MAX_PASTE_LINES = 2000
    const MAX_STYLE_CACHE = 4000

    const CODE_LINE_STYLE =
      'font-family:var(--dsw-font-family-code,ui-monospace,monospace);background-color:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.08))'
    const QUOTE_LINE_STYLE = 'color:var(--dsw-alias-label-tertiary);font-weight:500'
    /** `#` … `######`; levels 4-6 share the body size and only keep the weight. */
    const HEADING_SCALE = ['1.35em', '1.22em', '1.12em', '1em', '1em', '1em']

    /**
     * Classify one source line.
     *
     * Pure and total: it runs over every block of the composer on each debounced
     * pass, so it must never throw on odd input (chips, lone markers, tabs) and
     * must not allocate per-character.
     */
    function classifyLine(line) {
      if (typeof line !== 'string' || line.trim() === '') return { kind: 'blank' }

      const fence = /^[ \t]*```([\w+-]*)[ \t]*$/.exec(line)
      if (fence !== null) return { kind: 'fence', info: fence[1] }

      // A heading owns the line only when `#` opens the line itself; indented
      // `#` stays literal text, which is also what the block scanner above does.
      const heading = /^(#{1,6})[ \t]+/.exec(line)
      if (heading !== null) return { kind: 'heading', level: heading[1].length }

      if (/^[ \t]*>[ \t]?/.test(line) === true) return { kind: 'quote' }

      const list = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)/.exec(line)
      if (list !== null) {
        const indent = list[1]
        const marker = list[2]
        const spacer = list[3]
        const ordered = /^\d/.test(marker) === true
        const bodyStart = indent.length + marker.length + spacer.length
        return {
          kind: 'list',
          indent,
          marker,
          spacer,
          ordered,
          number: ordered === true ? Number.parseInt(marker, 10) : 0,
          delimiter: ordered === true ? marker.slice(-1) : '',
          markerEnd: indent.length + marker.length,
          bodyStart,
          body: line.slice(bodyStart),
        }
      }

      return { kind: 'text' }
    }

    /**
     * Classify a whole block (a block's text may contain line breaks) and thread
     * the fenced-code state forward. The fence is the only block syntax with
     * memory, so document order is the input contract.
     */
    function classifyLines(text, inFence) {
      const items = []
      let fenced = inFence === true
      for (const line of String(text).split('\n')) {
        if (fenced === true) {
          const item = classifyLine(line)
          if (item.kind === 'fence') {
            items.push(item)
            fenced = false
          } else {
            items.push({ kind: 'code' })
          }
          continue
        }
        const item = classifyLine(line)
        if (item.kind === 'fence') fenced = true
        items.push(item)
      }
      return { items, inFence: fenced }
    }

    /** The CSS a line kind contributes to the text nodes of its block. */
    function lineStyleForItem(item) {
      if (item === null || item === undefined) return ''
      if (item.kind === 'heading') {
        const scale = HEADING_SCALE[item.level - 1]
        return `font-size:${scale === undefined ? '1em' : scale};font-weight:600`
      }
      if (item.kind === 'quote') return QUOTE_LINE_STYLE
      if (item.kind === 'code' || item.kind === 'fence') return CODE_LINE_STYLE
      // List lines get no style on purpose: the marker "fading" belongs to the
      // highlight painter, and writing the same property twice would fight it.
      return ''
    }

    /** Memoized classifier: a typing burst re-reads the same blocks repeatedly. */
    function createLineStyleState() {
      return { fingerprint: null, cache: new Map(), writing: false }
    }

    /**
     * Per-block style in document order, decided by each block's first line.
     * A block is a paragraph today, so its first line is the line the caret is
     * on for every block the user can see. The fence state threads through
     * blocks, so the cache key carries it.
     */
    function planBlockStyles(blockTexts, state) {
      const cache = state.cache
      const styles = []
      let inFence = false
      for (const text of blockTexts) {
        const key = `${inFence === true ? 'C' : 'N'}:${text}`
        let entry = cache.get(key)
        if (entry === undefined) {
          const classified = classifyLines(text, inFence)
          entry = { style: lineStyleForItem(classified.items[0]), fence: classified.inFence }
          if (cache.size > MAX_STYLE_CACHE) cache.clear()
          cache.set(key, entry)
        }
        inFence = entry.fence
        styles.push(entry.style)
      }
      return styles
    }

    /**
     * Live editor state.
     *
     * Inside `editor.update()` the pending state is the live one; outside it the
     * committed state is. Both the gesture plans and the style pass read nodes
     * through this, so a plan never resolves nodes against a stale state.
     */
    function activeState(editor) {
      if (editor === null || editor === undefined) return null
      const pending = editor._pendingEditorState
      if (pending !== undefined && pending !== null) return pending
      if (typeof editor.getEditorState !== 'function') return null
      const committed = editor.getEditorState()
      return committed === undefined ? null : committed
    }

    /**
     * The live range selection, or null.
     *
     * Read as a field, not through `$getSelection()`: the loader hands plugins no
     * lexical binding, and the approved fallback is this private field with a
     * shape check at every use site.
     */
    function selectionOf(state) {
      if (state === null || state === undefined) return null
      const selection = state._selection
      if (selection === undefined || selection === null) return null
      if (typeof selection.isCollapsed !== 'function') return null
      return selection
    }

    /** Root node of a state, or null when the private node map changed shape. */
    function rootOf(state) {
      if (state === null || state === undefined) return null
      const map = state._nodeMap
      if (map === undefined || map === null || typeof map.get !== 'function') return null
      const root = map.get('root')
      if (root === null || root === undefined || typeof root.getChildren !== 'function') return null
      return root
    }

    /** Run `fn` with the state's node context active (node accessors need it). */
    function readState(state, fn) {
      if (typeof state.read !== 'function') return null
      return state.read(() => fn(state))
    }

    /** Block texts in document order, or null when the editor cannot answer. */
    function readBlockTexts(editor) {
      const state = activeState(editor)
      if (state === null) return null
      try {
        return readState(state, () => {
          const root = rootOf(state)
          if (root === null) return null
          const blocks = root.getChildren()
          if (Array.isArray(blocks) === false) return null
          return blocks.map((block) => (typeof block.getTextContent === 'function' ? block.getTextContent() : ''))
        })
      } catch (error) {
        console.warn(`[${NS}] unable to read composer blocks:`, error)
        return null
      }
    }

    /**
     * Is an IME composition in flight?
     *
     * Two independent signals, because neither is reliable alone: the shell's
     * `data-composer-composing` attribute (which additionally survives the
     * Safari "compositionend before keydown" ordering) and the editor's own
     * `isComposing()` (Lexical tracks the composition key). Either one means
     * "leave the current DOM alone".
     */
    function isComposing(editor, rootElement) {
      if (rootElement !== null && rootElement !== undefined && typeof rootElement.hasAttribute === 'function') {
        if (rootElement.hasAttribute('data-composer-composing') === true) return true
      }
      if (editor !== null && editor !== undefined && typeof editor.isComposing === 'function') {
        try {
          if (editor.isComposing() === true) return true
        } catch (error) {
          // A private-shape change must not stop styling forever.
          console.warn(`[${NS}] unable to read composer composition state:`, error)
        }
      }
      return false
    }

    /**
     * Apply line styles: one update, only when the document fingerprint changed.
     *
     * `history-merge` keeps a styling pass out of the undo history — a heading
     * that appears while typing must not become its own undo step.
     */
    function applyLineStyles(editor, state, rootElement) {
      if (editor === null || editor === undefined) return
      if (FEATURE_FLAGS.lineStyles !== true) return
      // Re-entrancy lock: the update notifies listeners, and a synchronous
      // listener could otherwise start a second pass inside the first.
      if (state.writing === true) return
      // An IME preedit must not be repainted, exactly as in the highlighter: the
      // update would rewrite styles under the candidate window and fight it. The
      // fingerprint is not consumed, so the next listener tick (after
      // compositionend, which is itself an update) does the work instead.
      if (isComposing(editor, rootElement) === true) return
      state.writing = true
      try {
        const blockTexts = readBlockTexts(editor)
        if (blockTexts === null) return
        const fingerprint = blockTexts.join('\u0000')
        if (fingerprint === state.fingerprint) return
        const styles = planBlockStyles(blockTexts, state)
        editor.update(() => {
          const live = activeState(editor)
          if (live === null) return
          const root = rootOf(live)
          if (root === null) return
          const blocks = root.getChildren()
          if (Array.isArray(blocks) === false) return
          for (let index = 0; index < blocks.length; index += 1) {
            const style = styles[index]
            if (style === undefined) continue
            for (const node of collectLeafNodes(blocks[index])) {
              if (typeof node.isSimpleText !== 'function' || node.isSimpleText() !== true) continue
              // A `/skill` or `@file` token paints its own chrome from its class;
              // restyling it would fight that class, so entities stay untouched.
              if (typeof node.isTextEntity === 'function' && node.isTextEntity() === true) continue
              if (typeof node.getStyle !== 'function' || node.getStyle() === style) continue
              // The only write this region makes to a node: `__style` feeds
              // Lexical's own DOM write and leaves the text untouched.
              node.setStyle(style)
            }
          }
        }, { tag: 'history-merge' })
        // Committed only after the update returned: a failed pass keeps the old
        // fingerprint, so the next listener tick retries it.
        state.fingerprint = fingerprint
      } catch (error) {
        console.warn(`[${NS}] line styling failed; composer keeps the stock look:`, error)
      } finally {
        state.writing = false
      }
    }

    /** Leaf nodes of a block in document order (text, line breaks, chips). */
    function collectLeafNodes(block) {
      const leaves = []
      const visit = (node) => {
        if (node === null || node === undefined) return
        if (typeof node.getChildren === 'function') {
          const children = node.getChildren()
          if (Array.isArray(children) === true && children.length > 0) {
            for (const child of children) visit(child)
            return
          }
        }
        leaves.push(node)
      }
      visit(block)
      return leaves
    }

    /** Nearest ancestor that is a child of the document root. */
    function topLevelBlockOf(node) {
      let current = node
      let guard = 0
      while (current !== null && current !== undefined && guard < 100) {
        if (typeof current.getParent !== 'function') return null
        const parent = current.getParent()
        if (parent === null || parent === undefined) return current
        if (typeof parent.getType === 'function' && parent.getType() === 'root') return current
        current = parent
        guard += 1
      }
      return null
    }

    /** Character offset of `node` inside `block`, or -1 when it is not a descendant. */
    function offsetOfNode(block, node) {
      const key = typeof node.getKey === 'function' ? node.getKey() : null
      let offset = 0
      let found = false
      const visit = (current) => {
        if (found === true || current === null || current === undefined) return
        if (typeof current.getChildren === 'function') {
          const children = current.getChildren()
          if (Array.isArray(children) === true) {
            for (const child of children) {
              if (found === true) return
              visit(child)
            }
            return
          }
        }
        if (key !== null && typeof current.getKey === 'function' && current.getKey() === key) {
          found = true
          return
        }
        if (typeof current.getTextContent === 'function') offset += current.getTextContent().length
      }
      visit(block)
      return found === true ? offset : -1
    }

    /**
     * Caret facts for the gesture handlers, or null when the gesture must fall
     * through. Only a collapsed caret on a block's first line is actionable:
     * anything else (a selection, a chip caret, a caret on a later line) belongs
     * to the official behavior.
     */
    function readCaret(editor) {
      const state = activeState(editor)
      if (state === null) return null
      const selection = selectionOf(state)
      if (selection === null) return null
      try {
        if (selection.isCollapsed() !== true) return null
        return readState(state, () => {
          const anchor = selection.anchor
          if (anchor === null || anchor === undefined || anchor.type !== 'text') return null
          if (typeof anchor.getNode !== 'function') return null
          const node = anchor.getNode()
          if (node === null || node === undefined || typeof node.getTextContent !== 'function') return null
          const block = topLevelBlockOf(node)
          if (block === null || typeof block.getTextContent !== 'function') return null
          const text = block.getTextContent()
          const headOffset = offsetOfNode(block, node)
          if (headOffset < 0) return null
          const offset = headOffset + anchor.offset
          const lineBreak = text.indexOf('\n')
          const firstLine = lineBreak === -1 ? text : text.slice(0, lineBreak)
          if (offset < 0 || offset > firstLine.length) return null
          return {
            selection,
            block,
            text,
            firstLine,
            offset,
            item: classifyLine(firstLine),
          }
        })
      } catch (error) {
        console.warn(`[${NS}] unable to read the composer caret:`, error)
        return null
      }
    }

    /**
     * The follow-up of a list item, or null when the caret is not on one.
     * `exit` means "the item has no body": consume Enter and drop the marker.
     */
    function continuationOf(item) {
      if (item === null || item === undefined || item.kind !== 'list') return null
      if (item.body.trim() === '') return { mode: 'exit', removeEnd: item.markerEnd }
      // Ordered items increment; bullets and their delimiter/spacing are copied
      // verbatim, indentation included, so nested items keep their depth.
      const marker = item.ordered === true ? `${item.number + 1}${item.delimiter}` : item.marker
      return { mode: 'next', text: `${item.indent}${marker} ` }
    }

    /**
     * Reasons Enter must keep its official meaning. Any one of them is a hard
     * veto: IME, an open trigger menu, a disabled composer, or a modifier that
     * the shell already maps (Ctrl/Cmd+Enter accelerated submit, Shift+Enter soft
     * line break).
     */
    function enterMustPass(event, root) {
      if (event.isComposing === true || event.keyCode === 229) return true
      if (root !== null && root !== undefined && typeof root.hasAttribute === 'function') {
        if (root.hasAttribute('data-composer-composing') === true) return true
        if (root.getAttribute('aria-disabled') === 'true') return true
      }
      if (event.ctrlKey === true || event.metaKey === true || event.altKey === true || event.shiftKey === true) return true
      return composerMenuOpen(root)
    }

    /**
     * Is a composer popup open right now?
     *
     * The two probes below are the only dynamic ones available to a plugin:
     *
     * - `[data-trigger-menu]` is the mention/slash candidate menu. Its view
     *   returns `null` while closed (`ui-input-trigger` MenuView: `if (!state.open)
     *   return null`), so presence in the DOM *does* mean "open".
     * - `[role="listbox"]` inside the editable host is the same menu's viewport.
     *
     * Deliberately NOT used: `[data-composer-overlay]`. That node is a *permanent
     * anchor*, not a state flag — ui-conversation renders it whenever
     * `sessionId !== undefined` (a session-scoped prop that is always present in
     * a real conversation), and the popups inside it are the ones that come and
     * go. Probing the anchor would report "a menu is open" forever and veto every
     * Enter/Tab gesture.
     */
    function composerMenuOpen(root) {
      const owner = root !== null && root !== undefined && root.ownerDocument !== null && root.ownerDocument !== undefined
        ? root.ownerDocument
        : typeof document === 'undefined'
          ? null
          : document
      if (owner !== null && owner !== undefined && typeof owner.querySelector === 'function') {
        // The candidate menu mounts into the overlay anchor, outside the
        // editable host, so it is searched document-wide.
        if (owner.querySelector('[data-trigger-menu]') !== null) return true
      }
      if (root !== null && root !== undefined && typeof root.querySelector === 'function') {
        if (root.querySelector('[role="listbox"]') !== null) return true
      }
      return false
    }

    /**
     * Would the stock handler paste this text as plain text? Deliberately a
     * *pre-parse*: any Markdown shape (heading/list/quote/fence/inline) opts in,
     * prose stays with the official path.
     */
    function isMarkdownLike(text) {
      if (typeof text !== 'string' || text === '') return false
      if (/^[ \t]*#{1,6}[ \t]/m.test(text) === true) return true
      if (/^[ \t]*>[ \t]?/m.test(text) === true) return true
      if (/^[ \t]*[-*+][ \t]/m.test(text) === true) return true
      if (/^[ \t]*\d{1,9}[.)][ \t]/m.test(text) === true) return true
      if (/^[ \t]*```/m.test(text) === true) return true
      if (/`[^`\n]{1,1000}`/m.test(text) === true) return true
      if (/\*\*[^\n]{1,800}?\*\*/m.test(text) === true) return true
      if (/~~[^\n]{1,800}?~~/m.test(text) === true) return true
      if (/\[[^\]\n]{0,500}\]\([^()\s]{1,2000}\)/m.test(text) === true) return true
      return false
    }

    /**
     * Delete the list marker at the head of the caret's block by widening the
     * collapsed selection over it and letting Lexical delete the range — the
     * same path a manual selection delete takes, so undo stays one step.
     */
    function removeListMarker(selection, end) {
      if (selection === null || selection === undefined) return false
      const anchor = selection.anchor
      if (anchor === null || anchor === undefined || anchor.type !== 'text') return false
      if (typeof anchor.getNode !== 'function') return false
      const block = topLevelBlockOf(anchor.getNode())
      if (block === null) return false
      const leaves = collectLeafNodes(block).filter(
        (node) => typeof node.isSimpleText === 'function' && node.isSimpleText() === true,
      )
      if (leaves.length === 0) return false
      let remaining = end
      let to = null
      for (const node of leaves) {
        const length = node.getTextContent().length
        if (remaining <= length) {
          to = { node, offset: remaining }
          break
        }
        remaining -= length
      }
      if (to === null) return false
      if (typeof selection.anchor.set !== 'function' || typeof selection.focus.set !== 'function') return false
      selection.anchor.set(leaves[0].getKey(), 0, 'text')
      selection.focus.set(to.node.getKey(), to.offset, 'text')
      if (selection.isCollapsed() === true) return false
      selection.removeText()
      return true
    }

    /** Shift+Tab: remove up to `unit` spaces immediately before the caret. */
    function unindentBeforeCaret(selection, unit) {
      if (selection === null || selection === undefined) return false
      const anchor = selection.anchor
      if (anchor === null || anchor === undefined || anchor.type !== 'text') return false
      if (typeof anchor.getNode !== 'function') return false
      const node = anchor.getNode()
      if (node === null || node === undefined) return false
      if (typeof node.spliceText !== 'function' || typeof node.getTextContent !== 'function') return false
      const text = node.getTextContent()
      const offset = anchor.offset
      let count = 0
      while (count < unit && offset - count > 0 && text[offset - count - 1] === ' ') count += 1
      if (count === 0) return false
      const from = offset - count
      node.spliceText(from, count, '')
      anchor.set(node.getKey(), from, 'text')
      selection.focus.set(node.getKey(), from, 'text')
      return true
    }

    /**
     * Own the composer's rich-text behavior for the lifetime of one editor.
     *
     * The root element (not the editor) is where the shell attaches its own
     * Lexical listeners, and those are bubble-phase. Binding the gestures in the
     * capture phase means a handled gesture can stop the official command from
     * dispatching at all — no double Enter, no double send.
     */
    function createRichTextComposer() {
      let editor = null
      let rootElement = null
      let timer = 0
      let disposed = false
      let announced = false
      let warned = false
      let retrying = false
      const editorDisposers = []
      const rootDisposers = []
      const lineStyleState = createLineStyleState()

      const listen = (target, type, handler, options) => {
        target.addEventListener(type, handler, options)
        rootDisposers.push(() => target.removeEventListener(type, handler, options))
      }

      function warnDisabled(reason) {
        if (warned === true) return
        warned = true
        console.warn(`[${NS}] rich text disabled: ${reason}`)
      }

      function detachRoot() {
        for (const off of rootDisposers.splice(0)) {
          try {
            off()
          } catch (error) {
            console.warn(`[${NS}] composer root listener cleanup failed:`, error)
          }
        }
        rootElement = null
      }

      function bindRoot(root) {
        detachRoot()
        if (root === null || root === undefined) return false
        if (typeof root.addEventListener !== 'function') return false
        rootElement = root
        listen(root, 'keydown', onKeyDown, { capture: true })
        listen(root, 'paste', onPaste, { capture: true })
        // A new root means a new document: force one full style pass.
        lineStyleState.fingerprint = null
        schedule()
        return true
      }

      function schedule() {
        if (disposed === true || editor === null || timer !== 0) return
        timer = window.setTimeout(() => {
          timer = 0
          if (disposed === true || editor === null) return
          applyLineStyles(editor, lineStyleState, rootElement)
        }, STYLE_DELAY_MS)
      }

      function isEditable() {
        if (editor === null) return false
        if (typeof editor.isEditable === 'function' && editor.isEditable() !== true) return false
        if (rootElement !== null && typeof rootElement.getAttribute === 'function') {
          if (rootElement.getAttribute('aria-disabled') === 'true') return false
        }
        return true
      }

      function onKeyDown(event) {
        if (disposed === true || editor === null || rootElement === null) return
        if (event.key === 'Enter') {
          handleEnter(event)
          return
        }
        if (event.key === 'Tab') handleTab(event)
      }

      function handleEnter(event) {
        if (FEATURE_FLAGS.enterList !== true) return
        // Every veto is a hard pass: the official Enter path must keep working
        // for IME, menus, disabled composers and modified keys.
        if (enterMustPass(event, rootElement) === true) return
        if (isEditable() === false) return
        const facts = readCaret(editor)
        if (facts === null) return
        const next = continuationOf(facts.item)
        if (next === null) return
        let applied = false
        try {
          // One update per gesture: Lexical records exactly one undo step.
          editor.update(() => {
            const live = activeState(editor)
            const selection = selectionOf(live)
            if (selection === null || selection.isCollapsed() !== true) return
            if (next.mode === 'next') {
              if (typeof selection.insertParagraph !== 'function') return
              const paragraph = selection.insertParagraph()
              if (paragraph === null || paragraph === undefined) return
              selection.insertText(next.text)
              applied = true
              return
            }
            applied = removeListMarker(selection, next.removeEnd)
          }, { tag: 'history-push', discrete: true })
        } catch (error) {
          // Never let a private-API failure reach the user: the event is left
          // unclaimed, so the official Enter handler still runs.
          console.warn(`[${NS}] list continuation failed; Enter keeps its official behavior:`, error)
          return
        }
        if (applied !== true) return
        event.preventDefault()
        event.stopPropagation()
      }

      function handleTab(event) {
        if (FEATURE_FLAGS.tabIndent !== true) return
        if (event.isComposing === true || event.keyCode === 229) return
        if (event.ctrlKey === true || event.metaKey === true || event.altKey === true) return
        if (isEditable() === false) return
        // A trigger menu owns Tab for keyboard navigation while it is open.
        if (composerMenuOpen(rootElement) === true) return
        const facts = readCaret(editor)
        if (facts === null || facts.item.kind !== 'list') return
        // Shift+Tab is a whitespace *removal*: it is only well defined while the
        // caret still sits in the line's leading whitespace run, so a caret after
        // visible text keeps the official behavior (focus stays reachable).
        if (event.shiftKey === true && facts.firstLine.slice(0, facts.offset).trim() !== '') return
        let applied = false
        try {
          editor.update(() => {
            const live = activeState(editor)
            const selection = selectionOf(live)
            if (selection === null || selection.isCollapsed() !== true) return
            if (event.shiftKey === true) {
              applied = unindentBeforeCaret(selection, INDENT_UNIT)
              return
            }
            selection.insertText(' '.repeat(INDENT_UNIT))
            applied = true
          }, { tag: 'history-push', discrete: true })
        } catch (error) {
          console.warn(`[${NS}] list indentation failed; Tab keeps its official behavior:`, error)
          return
        }
        if (applied !== true) return
        event.preventDefault()
        event.stopPropagation()
      }

      function onPaste(event) {
        if (FEATURE_FLAGS.pasteMarkdown !== true) return
        if (disposed === true || editor === null || rootElement === null) return
        // Another handler (or a host layer) already claimed this paste: touching
        // it again would insert the text twice.
        if (event.defaultPrevented === true) return
        if (isEditable() === false) return
        const clipboard = event.clipboardData
        if (clipboard === null || clipboard === undefined || typeof clipboard.getData !== 'function') return
        // Files mean attachments: that route belongs to the shell, unconditionally.
        const files = clipboard.files
        if (files !== null && files !== undefined && typeof files.length === 'number' && files.length > 0) return
        let text = ''
        try {
          text = clipboard.getData('text/plain')
        } catch (error) {
          return
        }
        if (typeof text !== 'string' || text === '') return
        // Only line endings are normalized; every other character must survive.
        const normalized = text.replace(/\r\n?/g, '\n')
        if (isMarkdownLike(normalized) !== true) return
        const lines = normalized.split('\n')
        // A pathological paste (a 10k-line file) is left to the stock handler:
        // one block per line would be a lot of work for no formatting gain.
        if (lines.length > MAX_PASTE_LINES) return
        let applied = false
        try {
          // One update, tagged `paste`: the whole insertion is one undo step.
          // Any failure mid-way throws, which makes Lexical roll the whole
          // update back — the text is never half-written.
          editor.update(() => {
            const live = activeState(editor)
            if (live === null) throw new Error('composer state unavailable')
            let selection = selectionOf(live)
            if (selection === null) throw new Error('composer selection unavailable')
            if (selection.isCollapsed() !== true) {
              selection.removeText()
              selection = selectionOf(activeState(editor))
              if (selection === null) throw new Error('composer selection lost')
            }
            // One paragraph per source line: the block gap is exactly one
            // newline in the composer projection, so the pasted text is
            // reproduced character for character without newlines inside a text
            // node. An empty source line becomes an empty block (a blank line).
            for (let index = 0; index < lines.length; index += 1) {
              if (index > 0) {
                if (typeof selection.insertParagraph !== 'function') throw new Error('insertParagraph unavailable')
                const paragraph = selection.insertParagraph()
                if (paragraph === null || paragraph === undefined) throw new Error('paragraph not created')
              }
              if (lines[index] !== '') selection.insertText(lines[index])
            }
            applied = true
          }, { tag: 'paste', discrete: true })
        } catch (error) {
          // Lexical rolls a failed update back, so the text is still unclaimed:
          // falling through to the official paste handler loses nothing.
          console.warn(`[${NS}] markdown paste failed; falling back to the plain paste path:`, error)
          return
        }
        if (applied !== true) return
        event.preventDefault()
        event.stopPropagation()
      }

      /** Bind the composer editor once; report why when the private hook is missing. */
      function attach() {
        if (editor !== null || disposed === true) return 'bound'
        const candidate = findComposerRoot()
        if (candidate === null) return 'absent'
        const instance = candidate.__lexicalEditor
        if (instance === undefined || instance === null || typeof instance.registerRootListener !== 'function') {
          return 'unsupported'
        }
        try {
          editorDisposers.push(instance.registerRootListener((root, prevRoot) => {
            if (prevRoot !== null && prevRoot !== root) detachRoot()
            bindRoot(root)
          }))
          editorDisposers.push(instance.registerUpdateListener(() => schedule()))
        } catch (error) {
          editor = null
          for (const off of editorDisposers.splice(0)) {
            try {
              off()
            } catch (cleanupError) {
              console.warn(`[${NS}] composer listener cleanup failed:`, cleanupError)
            }
          }
          console.warn(`[${NS}] rich text disabled: composer editor refused the listeners:`, error)
          return 'unsupported'
        }
        editor = instance
        // `registerRootListener` fires synchronously *before* the assignment
        // above, so the root bind inside it could not schedule the first pass.
        schedule()
        if (announced === false) {
          announced = true
          console.info(`[${NS}] rich text enabled`)
        }
        return 'bound'
      }

      function onFocusIn() {
        if (disposed === true) return
        if (editor === null) {
          const result = attach()
          if (result === 'unsupported') warnDisabled('composer root is not a Lexical editor')
          // Bound now: the retry listener has done its job.
          if (result === 'bound') stopRetry()
          return
        }
        // A session switch detaches and re-attaches the same editor's root; the
        // listeners must follow it without waiting for a root-listener callback.
        if (rootElement === null && typeof editor.getRootElement === 'function') {
          const current = editor.getRootElement()
          if (current !== null && current !== undefined) bindRoot(current)
        }
        schedule()
      }

      function start() {
        if (disposed === true) return
        const result = attach()
        if (result === 'unsupported') {
          warnDisabled('composer root is not a Lexical editor')
          return
        }
        if (result === 'absent') {
          // The composer mounts after the plugin in hero/embedded views: retry on
          // focus instead of polling.
          if (typeof document === 'undefined') return
          document.addEventListener('focusin', onFocusIn, true)
          retrying = true
        }
      }

      function stopRetry() {
        if (retrying !== true || typeof document === 'undefined') return
        document.removeEventListener('focusin', onFocusIn, true)
        retrying = false
      }

      function dispose() {
        disposed = true
        if (timer !== 0) {
          window.clearTimeout(timer)
          timer = 0
        }
        detachRoot()
        stopRetry()
        for (const off of editorDisposers.splice(0)) {
          try {
            off()
          } catch (error) {
            console.warn(`[${NS}] composer listener cleanup failed:`, error)
          }
        }
        editor = null
        lineStyleState.fingerprint = null
        lineStyleState.cache.clear()
      }

      return { start, dispose }
    }

    /** The composer's contenteditable host, using the same selectors as the highlighter. */
    function findComposerRoot() {
      if (typeof document === 'undefined') return null
      const direct = document.querySelector('[data-composer-input][contenteditable="true"]')
      if (direct !== null) return direct
      const scoped = document.querySelector('[data-conversation-content] [contenteditable="true"]')
      if (scoped !== null) return scoped
      for (const candidate of document.querySelectorAll('[contenteditable="true"]')) {
        if (candidate.__lexicalEditor !== undefined && candidate.__lexicalEditor !== null) return candidate
      }
      return null
    }
    //#endregion

    //#region plugin
    function apply(ctx) {
      primitivesRef = loadPrimitives(require)

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), `${NS}: dictionaries`)
      ctx.effect(() => installStyles(), `${NS}: styles`)

      ctx.slots.inject('conversation.user.text.node', () => {
        try {
          return ctx.slots.register(
            {
              name: 'conversation.user.text.node',
              key: 'text',
              priority: -1,
              locale: NS,
            },
            MarkdownUserText,
          )
        } catch (error) {
          // Losing this seat only costs the formatting: the official
          // `PlainUserText` cell at priority 100 stays visible.
          console.warn(`[${NS}] user-text registration failed; official plain text stays in place:`, error)
          return () => {}
        }
      })

      /*
       * Why the "预览" (preview) button shows up on ordinary sessions:
       *
       * `dsh-subagent-workspace-ui` decides visibility with
       * `promptIsSubagent(sessionId)`, which treats *any* session whose summary
       * carries a `parentId` (or `origin === 'subagent'`) as a child session.
       * `fork()` — used by our own edit/retry flow and by anything else that
       * branches a conversation — records a `parentSession`, which the client
       * projects as `parentId`. A forked conversation therefore looks like a
       * subagent chat, and that plugin renders its prompt-preview header cell
       * (`id: 'subagent-prompt-preview'`, `order: 101`, default priority 0)
       * even though no subagent is involved.
       *
       * We do not patch the third-party plugin. Its cell is a `list` slot entry
       * keyed by `id`, so registering the same id one priority lower shadows
       * exactly that cell with a no-op component. The list slot dedupes by id
       * after sorting by priority, so priority -1 wins and a same-priority
       * collision is impossible. If a future host occupies the same
       * (id, priority) pair our registration throws and we simply warn: the
       * stray button reappears, nothing else in this plugin is affected.
       */
      ctx.slots.inject('conversation.session.header.actions', () => {
        try {
          return ctx.slots.register(
            {
              name: 'conversation.session.header.actions',
              id: 'subagent-prompt-preview',
              priority: -1,
            },
            () => null,
          )
        } catch (error) {
          console.warn(`[${NS}] unable to shadow the 'preview' header action; it may stay visible:`, error)
          return () => {}
        }
      })

      ctx.effect(() => {
        const highlighter = createComposerHighlighter()
        highlighter.start()
        return () => highlighter.dispose()
      }, `${NS}: composer markdown highlight`)

      /*
       * Rich text is a second, independent effect: the highlighter only paints,
       * while this one writes node styles and owns three gestures. Keeping them
       * apart means a failure here can never take the syntax coloring with it
       * (and vice versa) — both degrade to the stock composer on their own.
       */
      ctx.effect(() => {
        const richText = createRichTextComposer()
        try {
          richText.start()
        } catch (error) {
          console.warn(`[${NS}] rich text disabled: composer setup failed:`, error)
        }
        return () => richText.dispose()
      }, `${NS}: composer rich text`)
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    }
    //#endregion
  },
})
