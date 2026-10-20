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
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    }
    //#endregion
  },
})
