window.__ModuleLoader__.load({
  id: 'dsh-message-edit-retry',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const useSyncExternalStore = React.useSyncExternalStore
    const useMemo = React.useMemo
    const useEffect = React.useEffect
    const useState = React.useState
    const useRef = React.useRef
    const useLayoutEffect = React.useLayoutEffect
    const useCallback = React.useCallback

    const NS = 'dsh-message-edit-retry'
    /** Session reference source tag: `sessions.using` requires a caller-owned label. */
    const SOURCE = 'messageEditRetry'
    /** Polling budget for a cancelled turn to settle before we refuse to fork. */
    const STOP_TIMEOUT_MS = 5000
    const STOP_POLL_MS = 100
    /** Bound on the per-page prompt cache; transcripts are re-readable anyway. */
    const PROMPT_CACHE_LIMIT = 500

    //#region dictionaries
    const zh = {
      'action.copy': '复制',
      'action.copied': '已复制',
      'action.edit': '编辑消息',
      'action.edit.busy': '正在发送…',
      'edit.label': '编辑消息内容',
      'edit.cancel': '取消',
      'edit.send': '发送',
      'edit.fileHint': '文件附件不会随重发保留，图片会保留。',
      'action.continue': '继续',
      'action.continue.tip': '让助手接着上一轮继续输出',
      'action.retry': '重试',
      'action.retry.tip': '从这条消息重新开始：分叉新会话并重发原始提示词',
      'action.retry.fileHint': '（文件附件不会随重发保留）',
      'state.busy': '正在处理…',
      'state.running': '请先停止当前任务',
      'error.generic': '操作失败：',
      'error.empty': '消息内容为空，无法发送。',
      'error.noSessions': '会话服务不可用，请刷新页面后重试。',
      'error.noSession': '找不到原会话，无法继续。',
      'error.stopTimeout': '当前任务未能停止，请稍后重试。',
      'error.forkTarget': '无法定位该轮的起点，已取消分叉。',
      'error.attachment': '读取图片附件失败，已取消发送。',
      'error.create': '新建会话失败，已取消发送。',
      'error.fork': '分叉会话失败，原会话未改动。',
      'error.prompt': '发送失败：',
      'error.running': '会话正在运行，请先停止当前任务。',
      'clock.md': '{m}月{d}日',
      'clock.ymd': '{y}年{m}月{d}日',
    }

    const en = {
      'action.copy': 'Copy',
      'action.copied': 'Copied',
      'action.edit': 'Edit message',
      'action.edit.busy': 'Sending…',
      'edit.label': 'Edit message text',
      'edit.cancel': 'Cancel',
      'edit.send': 'Send',
      'edit.fileHint': 'File attachments are not carried over; images are kept.',
      'action.continue': 'Continue',
      'action.continue.tip': 'Ask the assistant to keep going from the last turn',
      'action.retry': 'Retry',
      'action.retry.tip': 'Restart from this message: fork a new session and resend the original prompt',
      'action.retry.fileHint': ' (file attachments are not carried over)',
      'state.busy': 'Working…',
      'state.running': 'Stop the running task first',
      'error.generic': 'Failed: ',
      'error.empty': 'The message is empty and cannot be sent.',
      'error.noSessions': 'The session service is unavailable. Refresh the page and try again.',
      'error.noSession': 'The source session is gone, so this cannot continue.',
      'error.stopTimeout': 'The running task could not be stopped. Try again shortly.',
      'error.forkTarget': 'The start of this turn could not be located; the fork was cancelled.',
      'error.attachment': 'An image attachment could not be read; sending was cancelled.',
      'error.create': 'Creating a new session failed; sending was cancelled.',
      'error.fork': 'Forking the session failed; the source session is unchanged.',
      'error.prompt': 'Sending failed: ',
      'error.running': 'The session is running. Stop the current task first.',
      'clock.md': '{m}/{d}',
      'clock.ymd': '{y}-{m}-{d}',
    }
    //#endregion

    //#region styles
    const CSS = [
      '.dsh-mer-row{display:flex;flex-direction:column;align-items:flex-end;gap:6px;min-width:0;max-width:100%}',
      '.dsh-mer-row[data-editing]{align-items:stretch}',
      '.dsh-mer-actions{height:calc(28px + var(--dsh-content-font-delta,0px));display:flex;align-items:center;gap:8px}',
      '.dsh-mer-time{font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-tertiary);white-space:nowrap;padding-right:12px}',
      '.dsh-mer-action{width:calc(28px + var(--dsh-content-font-delta,0px));height:calc(28px + var(--dsh-content-font-delta,0px));border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-tertiary);cursor:pointer;background:0 0;border:none;justify-content:center;align-items:center;padding:6px;display:inline-flex;box-sizing:border-box}',
      '.dsh-mer-action:hover:not([aria-disabled=true]){background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsh-mer-action[aria-disabled=true]{opacity:.5;cursor:default}',
      '.dsh-mer-action svg{width:calc(15px + var(--dsh-content-font-delta,0px));height:calc(15px + var(--dsh-content-font-delta,0px))}',
      '.dsh-mer-fallback{background:var(--dsw-specific-bubble);border-radius:var(--dsw-radius-xl);max-width:100%;font-size:var(--dsh-content-font-size,14px);line-height:calc(22px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-primary);white-space:pre-wrap;word-break:break-word;padding:10px 16px;box-sizing:border-box}',
      '@media (hover:hover){',
      '.dsh-mer-actions:not([data-pinned=true]){opacity:0;transition:opacity 80ms}',
      '.dsh-mer-row:hover .dsh-mer-actions:not([data-pinned=true]),',
      '.dsh-mer-row:focus-within .dsh-mer-actions:not([data-pinned=true]){opacity:1}',
      '}',
      '.dsh-mer-editor{display:flex;flex-direction:column;gap:8px;min-width:0;width:min(100%,calc(var(--dsh-chat-content-width,748px) * .702));box-sizing:border-box;align-self:flex-end}',
      '.dsh-mer-editorBox{background:var(--dsw-specific-bubble);border-radius:var(--dsw-radius-xl);padding:10px 16px;box-sizing:border-box;font-size:var(--dsh-content-font-size,14px);line-height:calc(22px + var(--dsh-content-font-delta,0px));color:var(--dsw-alias-label-primary)}',
      '.dsh-mer-editorBox textarea{display:block;width:100%;min-height:calc(22px + var(--dsh-content-font-delta,0px));max-height:40vh;resize:none;border:0;outline:none;background:transparent;color:inherit;font:inherit;line-height:inherit;padding:0;margin:0;box-sizing:border-box;white-space:pre-wrap;word-break:break-word}',
      '.dsh-mer-hint{color:var(--dsw-alias-label-tertiary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(18px + var(--dsh-content-font-delta-secondary,0px));text-align:right}',
      '.dsh-mer-editorActions{display:flex;align-items:center;justify-content:flex-end;gap:8px}',
      '.dsh-mer-textBtn{display:inline-flex;align-items:center;gap:6px;height:calc(28px + var(--dsh-content-font-delta,0px));padding:0 10px;border:0;border-radius:var(--dsw-radius-sm);background:0 0;color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:var(--dsh-content-font-size-secondary,13px);box-sizing:border-box}',
      '.dsh-mer-textBtn:hover:not([aria-disabled=true]){background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsh-mer-textBtn[aria-disabled=true]{opacity:.5;cursor:default}',
      '.dsh-mer-textBtn svg{width:calc(14px + var(--dsh-content-font-delta,0px));height:calc(14px + var(--dsh-content-font-delta,0px))}',
      '.dsh-mer-primary{color:var(--dsw-alias-label-primary);font-weight:500}',
      '.dsh-mer-alert{color:var(--dsw-alias-state-error-primary);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(18px + var(--dsh-content-font-delta-secondary,0px));text-align:right;overflow-wrap:anywhere}',
      '.dsh-mer-tail{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
    ].join('')

    function installStyles() {
      if (typeof document === 'undefined') return () => {}
      const key = `${NS}/styles`
      const selector = `style[data-dsh-style="${key}"]`
      for (const stale of document.querySelectorAll(selector)) stale.remove()
      const style = document.createElement('style')
      style.dataset.dshStyle = key
      style.textContent = CSS
      document.head.appendChild(style)
      return () => {
        style.remove()
      }
    }
    //#endregion

    //#region shared observable state
    /** Tiny subscribe/version pair: both stores only need "something changed". */
    function createVersionChannel() {
      const listeners = new Set()
      const channel = {
        version: 0,
        subscribe(listener) {
          listeners.add(listener)
          return () => {
            listeners.delete(listener)
          }
        },
        getVersion() {
          return channel.version
        },
        bump() {
          channel.version += 1
          for (const listener of [...listeners]) {
            try {
              listener()
            } catch (error) {
              console.warn(`[${NS}] store listener failed:`, error)
            }
          }
        },
      }
      return channel
    }

    /**
     * Module-level registry of the opening prompt behind each Turn.
     *
     * `conversation.chat.turnTail` already receives the full `TurnLocation`
     * (status and `end.data.reason.kind` included), so the interrupted/completed
     * split needs no fallback. What it does NOT receive is the user text or the
     * durable attachment blocks, and no public projection exposes them for a
     * reliable resend (the `turnOutline` prompt is a clipped preview). The keyed
     * `conversation.chat.node` renderers do see the durable content, so they
     * publish it here from an effect — never during render — and the tail
     * subscribes through `useSyncExternalStore`.
     *
     * Only the opening `user` message is registered (a steering note must never
     * become the retry seed). The earliest `anchorSeq` per (session, turn) wins.
     */
    const promptRegistry = (() => {
      const channel = createVersionChannel()
      const entries = new Map()

      return {
        subscribe: channel.subscribe,
        getVersion: channel.getVersion,
        write(sessionId, turn, entry) {
          if (typeof turn !== 'number' || turn < 0) return
          const key = `${String(sessionId)}\u0000${String(turn)}`
          const previous = entries.get(key)
          if (previous !== undefined && previous.anchorSeq <= entry.anchorSeq) return
          if (previous !== undefined) entries.delete(key)
          entries.set(key, entry)
          if (entries.size > PROMPT_CACHE_LIMIT) {
            const oldest = entries.keys().next()
            if (oldest.done !== true) entries.delete(oldest.value)
          }
          channel.bump()
        },
        read(sessionId, turn) {
          if (typeof turn !== 'number' || turn < 0) return undefined
          return entries.get(`${String(sessionId)}\u0000${String(turn)}`)
        },
      }
    })()

    /** Per-session in-flight guard: one fork/prompt round at a time per session. */
    const activity = (() => {
      const channel = createVersionChannel()
      const counts = new Map()
      return {
        subscribe: channel.subscribe,
        getVersion: channel.getVersion,
        isBusy(sessionId) {
          return (counts.get(sessionId) ?? 0) > 0
        },
        begin(sessionId) {
          counts.set(sessionId, (counts.get(sessionId) ?? 0) + 1)
          channel.bump()
        },
        end(sessionId) {
          const next = (counts.get(sessionId) ?? 1) - 1
          if (next <= 0) counts.delete(sessionId)
          else counts.set(sessionId, next)
          channel.bump()
        },
      }
    })()

    /** Localized, non-fatal failure carrying a dictionary key instead of a message. */
    class LocalizedError extends Error {
      constructor(key, params) {
        super(key)
        this.name = 'LocalizedError'
        this.key = key
        this.params = params
      }
    }

    /** A Remote failure keeps its own code/message and renders behind a prefix. */
    class RemoteFailureError extends Error {
      constructor(failure) {
        super(failure?.message ?? 'remote failure')
        this.name = 'RemoteFailureError'
        this.code = failure?.code
      }
    }
    //#endregion

    //#region content helpers
    const EMPTY_CONTENT = Object.freeze([])

    function textOf(content) {
      if (!Array.isArray(content)) return ''
      const pieces = []
      for (const block of content) {
        if (block?.type === 'text' && typeof block.text === 'string') pieces.push(block.text)
      }
      return pieces.join('')
    }

    function imageBlocksOf(content) {
      if (!Array.isArray(content)) return []
      return content.filter((block) => block?.type === 'image' && block.attachment?.attachmentId !== undefined)
    }

    function hasImage(content) {
      return imageBlocksOf(content).length > 0
    }

    function hasFileAttachment(content) {
      if (!Array.isArray(content)) return false
      return content.some((block) => block?.type === 'file' && block.attachment !== undefined)
    }

    /** Mirror of the shipped `contentParts` split so the Factory sees the same shape. */
    function attachmentsOf(content) {
      if (!Array.isArray(content)) return []
      const attachments = []
      for (const block of content) {
        if (block?.type === 'image' && block.attachment !== undefined) {
          attachments.push({ type: 'image', image: { attachment: block.attachment } })
        } else if (block?.type === 'file' && block.attachment !== undefined) {
          attachments.push({ type: 'file', file: block.attachment })
        }
      }
      return attachments
    }

    function extraBlocksOf(content) {
      if (!Array.isArray(content)) return []
      return content.filter((block) => {
        if (block?.type === 'text') return false
        if (block?.type === 'image' && block.attachment !== undefined) return false
        if (block?.type === 'file' && block.attachment !== undefined) return false
        return true
      })
    }

    /** Chunked base64 so a large screenshot cannot blow the argument stack. */
    function toBase64(bytes) {
      if (bytes instanceof Uint8Array === false) return ''
      const chunk = 0x8000
      let binary = ''
      for (let offset = 0; offset < bytes.length; offset += chunk) {
        binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunk))
      }
      return btoa(binary)
    }

    function newRequestId() {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
      return `mer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    }

    function translatorOf(t) {
      return typeof t === 'function' ? t : (key) => key
    }

    function describeError(error, tr) {
      if (error instanceof LocalizedError) return tr(error.key, error.params)
      if (error instanceof RemoteFailureError) {
        const code = error.code === undefined ? '' : ` (${String(error.code)})`
        return `${tr('error.generic')}${error.message}${code}`
      }
      const message = error instanceof Error ? error.message : String(error)
      return `${tr('error.generic')}${message}`
    }

    async function waitFor(predicate, timeoutMs) {
      const deadline = Date.now() + timeoutMs
      for (;;) {
        let settled = false
        try {
          settled = predicate() === true
        } catch {
          settled = false
        }
        if (settled) return true
        if (Date.now() >= deadline) return false
        await new Promise((resolve) => setTimeout(resolve, STOP_POLL_MS))
      }
    }
    //#endregion

    //#region execution
    function requireSessions(ctx) {
      const sessions = ctx.get('sessions')
      if (sessions === undefined || sessions === null) throw new LocalizedError('error.noSessions')
      return sessions
    }

    function runningOf(sessions, sessionId) {
      try {
        const binding = sessions.binding(sessionId)
        if (binding !== undefined && binding !== null) return binding.session.getSnapshot().running === true
        return sessions.list.getSnapshot().byId[sessionId]?.running === true
      } catch {
        return false
      }
    }

    function cwdOf(sessions, sessionId) {
      try {
        return sessions.list.getSnapshot().byId[sessionId]?.cwd
      } catch {
        return undefined
      }
    }

    /** Read every durable image of the source message through the SOURCE session. */
    async function readImageParts(sessions, sessionId, content) {
      const blocks = imageBlocksOf(content)
      if (blocks.length === 0) return []
      const binding = sessions.binding(sessionId)
      const session = binding?.session
      if (session === undefined) throw new LocalizedError('error.noSession')
      const parts = []
      for (const block of blocks) {
        let result
        try {
          result = await session.readAttachment(block.attachment.attachmentId)
        } catch (error) {
          console.warn(`[${NS}] readAttachment rejected:`, error)
          throw new LocalizedError('error.attachment')
        }
        if (result?.ok !== true) throw new LocalizedError('error.attachment')
        const mediaType = result.value?.attachment?.mediaType ?? block.attachment?.mediaType
        if (typeof mediaType !== 'string') throw new LocalizedError('error.attachment')
        const name = result.value?.attachment?.name ?? block.attachment?.name
        parts.push({
          type: 'image',
          mediaType,
          data: toBase64(result.value.data),
          ...(typeof name === 'string' && name.length > 0 ? { name } : {}),
        })
      }
      return parts
    }

    function buildPromptParts(text, imageParts) {
      const parts = []
      const source = typeof text === 'string' ? text : ''
      if (source.trim().length > 0) parts.push({ type: 'text', text: source })
      for (const part of imageParts) parts.push(part)
      if (parts.length === 0) throw new LocalizedError('error.empty')
      return parts
    }

    /** Stop the active turn of the source session and wait for it to settle. */
    async function stopIfRunning(sessions, sessionId) {
      if (runningOf(sessions, sessionId) === false) return
      const binding = sessions.binding(sessionId)
      if (binding === undefined) throw new LocalizedError('error.noSession')
      let result
      try {
        result = await binding.session.cancel()
      } catch (error) {
        console.warn(`[${NS}] cancel rejected:`, error)
        throw new LocalizedError('error.stopTimeout')
      }
      if (result?.ok === false) throw new RemoteFailureError(result.error)
      if ((await waitFor(() => runningOf(sessions, sessionId) === false, STOP_TIMEOUT_MS)) === false) {
        throw new LocalizedError('error.stopTimeout')
      }
    }

    /**
     * Fork (or create, when the message is the very first event) a child session
     * cut just before the target message, open it, and re-prompt the supplied
     * text plus the source message's images. File attachments are dropped by
     * design; the UI warns about that before the action runs.
     */
    async function promptInChildSession(ctx, sessionId, targetSeq, text, content, cwd) {
      const sessions = requireSessions(ctx)
      if (typeof targetSeq !== 'number' || targetSeq < 0) throw new LocalizedError('error.forkTarget')
      activity.begin(sessionId)
      try {
        // Attachments belong to the SOURCE session: read them before anything moves.
        const parts = buildPromptParts(text, await readImageParts(sessions, sessionId, content))
        await stopIfRunning(sessions, sessionId)

        let childId
        if (targetSeq >= 1) {
          try {
            childId = await sessions.fork({ sessionId, atSeq: targetSeq - 1, increaseTitle: true })
          } catch (error) {
            console.warn(`[${NS}] fork rejected:`, error)
            throw new LocalizedError('error.fork')
          }
        } else {
          const resolved = cwd ?? cwdOf(sessions, sessionId)
          try {
            childId = resolved === undefined ? await sessions.create({}) : await sessions.create({ cwd: resolved })
          } catch (error) {
            console.warn(`[${NS}] create rejected:`, error)
            throw new LocalizedError('error.create')
          }
        }

        try {
          ctx.get('uiWorkspace')?.openSession(childId)
        } catch (error) {
          console.warn(`[${NS}] openSession rejected:`, error)
        }

        await sessions.using(childId, { source: SOURCE }, async (reference) => {
          let result
          try {
            result = await reference.binding.session.prompt(parts, 'queue', undefined, newRequestId())
          } catch (error) {
            console.warn(`[${NS}] prompt rejected:`, error)
            throw new LocalizedError('error.prompt')
          }
          if (result?.ok !== true) throw new RemoteFailureError(result?.error)
        })
        return childId
      } finally {
        activity.end(sessionId)
      }
    }

    /** Send the localized "continue" sentinel into the CURRENT session. */
    async function promptInPlace(ctx, sessionId, text) {
      const sessions = requireSessions(ctx)
      activity.begin(sessionId)
      try {
        if (runningOf(sessions, sessionId)) throw new LocalizedError('error.running')
        await sessions.using(sessionId, { source: SOURCE }, async (reference) => {
          const session = reference.binding.session
          if (session.getSnapshot().running === true) throw new LocalizedError('error.running')
          const result = await session.prompt([{ type: 'text', text }], 'queue', undefined, newRequestId())
          if (result?.ok !== true) throw new RemoteFailureError(result?.error)
        })
      } finally {
        activity.end(sessionId)
      }
    }

    /**
     * Resolve one injected action, or fail loudly.
     *
     * The renderers receive `mer` through the slot `inject` seat. Optional
     * chaining here would turn a missing/broken seat into a silent no-op — most
     * visibly an editor that stays open and never sends — so a missing verb
     * surfaces the same localized failure path as any other error.
     */
    function requireAction(mer, name) {
      const action = mer?.[name]
      if (typeof action !== 'function') {
        console.warn(`[${NS}] injected action '${name}' is unavailable`)
        throw new LocalizedError('error.generic')
      }
      return action
    }

    /** Per-session action bundle handed to the renderers through the slot `inject` seat. */
    function createActions(ctx, sessionId) {
      return {
        isBusy: () => activity.isBusy(sessionId),
        editAndSend: ({ targetSeq, text, content, cwd }) => promptInChildSession(ctx, sessionId, targetSeq, text, content, cwd),
        retryTurn: ({ targetSeq, text, content, cwd }) => promptInChildSession(ctx, sessionId, targetSeq, text, content, cwd),
        continueTurn: ({ text }) => promptInPlace(ctx, sessionId, text),
      }
    }
    //#endregion

    //#region shared UI pieces
    /**
     * Primitives resolved once per activation. Every optional export is read
     * through `primitivesRef` at render time, so a missing icon or an older
     * primitives build degrades to plain markup instead of throwing.
     */
    let primitivesRef = {}

    function loadPrimitives(requireFn) {
      try {
        const value = requireFn('@deepseek-ai/dsh-client-ui-primitives')
        return value !== null && typeof value === 'object' ? value : {}
      } catch (error) {
        console.warn(`[${NS}] ui-primitives unavailable:`, error)
        return {}
      }
    }

    function Hint({ label, side = 'bottom', children }) {
      const Tooltip = primitivesRef.Tooltip
      if (typeof Tooltip !== 'function') return children
      return h(Tooltip, { label, side, children })
    }

    function Icon({ name }) {
      const Component = primitivesRef[name]
      if (typeof Component !== 'function') return null
      return h(Component, {})
    }

    /** Auto-growing textarea used only when the primitives editor is unavailable. */
    const FallbackEditor = React.memo(function FallbackEditor({ value, label, onChange, onSave, onCancel }) {
      const ref = useRef(null)
      useLayoutEffect(() => {
        const node = ref.current
        if (node === null) return
        node.style.height = 'auto'
        node.style.height = `${String(node.scrollHeight)}px`
      }, [value])
      const onKeyDown = (event) => {
        const native = event.nativeEvent
        const composing = native?.isComposing === true || native?.keyCode === 229
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onCancel()
          return
        }
        if (event.key === 'Enter' && event.shiftKey === false && composing === false) {
          event.preventDefault()
          onSave()
        }
      }
      return h('textarea', {
        ref,
        rows: 1,
        autoFocus: true,
        'aria-label': label,
        value,
        onChange: (event) => onChange(event.currentTarget.value),
        onKeyDown,
      })
    })

    /** Editor seat: primitives InlineEditor first, self-drawn textarea as the fallback. */
    function MessageEditor(props) {
      const InlineEditor = primitivesRef.InlineEditor
      return h(typeof InlineEditor === 'function' ? InlineEditor : FallbackEditor, props)
    }

    function Alert({ text }) {
      if (text === null || text === undefined) return null
      return h('div', { className: 'dsh-mer-alert', role: 'alert' }, text)
    }

    /**
     * One action button. `iconOnly` renders the shipped square icon button; the
     * label stays as the accessible name and tooltip text.
     */
    function ActionButton({ label, tip, iconName, onClick, disabled, iconOnly = false, primary = false }) {
      const handleClick = (event) => {
        // A pointer click cancels the row's default activation; an imperative
        // caller may pass nothing, so both calls stay optional.
        event?.preventDefault?.()
        event?.stopPropagation?.()
        if (disabled === true) return
        onClick(event)
      }
      const className = iconOnly
        ? 'dsh-mer-action'
        : primary
          ? 'dsh-mer-textBtn dsh-mer-primary'
          : 'dsh-mer-textBtn'
      return h(
        Hint,
        { label: tip ?? label },
        h(
          'button',
          {
            type: 'button',
            className,
            'aria-label': label,
            'aria-disabled': disabled === true ? true : undefined,
            onClick: handleClick,
          },
          h(Icon, { name: iconName }),
          iconOnly ? null : label,
        ),
      )
    }

    function useBusy(sessionId, mer) {
      useSyncExternalStore(activity.subscribe, activity.getVersion)
      return mer?.isBusy?.() === true
    }

    /** Always called with the same hook depth; a missing source yields `undefined`. */
    function useNoopSelector() {
      return undefined
    }

    function pad2(value) {
      return String(value).padStart(2, '0')
    }

    /**
     * Same algorithm as the shipped `formatMessageClock`: HH:MM for today, the
     * localized `clock.md` template plus HH:MM within this year, and the
     * `clock.ymd` template plus HH:MM for any other year. Placeholders are
     * `{y}` / `{m}` / `{d}`, matching the official templates.
     */
    function formatMessageClock(time, tr) {
      const date = new Date(time)
      if (Number.isNaN(date.getTime())) return ''
      const now = new Date()
      const clock = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
      if (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth() &&
        date.getDate() === now.getDate()
      ) {
        return clock
      }
      const params = { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() }
      const template = date.getFullYear() === now.getFullYear() ? tr('clock.md', params) : tr('clock.ymd', params)
      return `${template} ${clock}`
    }

    /** The shipped copy affordance, reproduced because this renderer replaces its owner. */
    function CopyAction({ text, tr }) {
      const [copied, setCopied] = useState(false)
      const pending = useRef(false)
      const timer = useRef(null)
      useEffect(
        () => () => {
          pending.current = false
          if (timer.current !== null) clearTimeout(timer.current)
        },
        [],
      )
      const onCopy = useCallback(
        (event) => {
          if (copied || pending.current) return
          pending.current = true
          const writeClipboard = primitivesRef.writeClipboard
          if (typeof writeClipboard !== 'function') {
            pending.current = false
            return
          }
          Promise.resolve(writeClipboard(text)).then(
            (ok) => {
              pending.current = false
              if (ok !== true) return
              setCopied(true)
              timer.current = window.setTimeout(() => {
                timer.current = null
                setCopied(false)
              }, 1000)
            },
            (error) => {
              pending.current = false
              console.warn(`[${NS}] clipboard write failed:`, error)
            },
          )
        },
        [copied, text],
      )
      const label = copied ? tr('action.copied') : tr('action.copy')
      return h(ActionButton, {
        label,
        tip: label,
        iconName: copied ? 'IconCheckOutlineRegular' : 'IconCopyOutlineRegular',
        iconOnly: true,
        onClick: onCopy,
      })
    }
    //#endregion

    //#region user / steering node renderer
    const ChatNodeView = React.memo(function ChatNodeView(props) {
      const { node, renderFactorySlot, loadImage, t, sessionId, useChat, cwd, mer } = props
      const tr = translatorOf(t)
      const data = node?.data
      const content = Array.isArray(data?.content) ? data.content : EMPTY_CONTENT
      const kind = node?.kind === 'steering' ? 'steering' : 'user'
      const location = node?.location
      const turnNumber = location?.kind === 'turn' || location?.kind === 'step' ? location.turn?.turn : undefined
      const anchorSeq =
        typeof node?.anchorSeq === 'number' ? node.anchorSeq : typeof data?.seq === 'number' ? data.seq : -1

      const text = useMemo(() => textOf(content), [content])
      const images = useMemo(() => hasImage(content), [content])
      const droppedFiles = useMemo(() => hasFileAttachment(content), [content])

      // The documented standard hook for this slot; the fallback keeps the hook
      // count stable if a composition ever omits it.
      const selectorHook = typeof useChat === 'function' ? useChat : useNoopSelector
      const latestTurn = selectorHook((snapshot) => {
        const order = snapshot?.timeline?.turnOrder
        return Array.isArray(order) && order.length > 0 ? order[order.length - 1] : undefined
      })
      // The newest turn stays visible: the editor has to be discoverable on first use.
      const pinned = turnNumber !== undefined && latestTurn === turnNumber

      const busy = useBusy(sessionId, mer)

      const [editing, setEditing] = useState(false)
      const [draft, setDraft] = useState(text)
      const [error, setError] = useState(null)

      // Publish the durable prompt for the Turn-tail actions. Effects, never render.
      // Only the opening `user` message qualifies: a steering note must never
      // become the retry seed, so it is not registered at all.
      useEffect(() => {
        if (kind !== 'user' || turnNumber === undefined || anchorSeq < 0) return
        promptRegistry.write(sessionId, turnNumber, {
          anchorSeq,
          text,
          content,
          cwd,
          hasFile: droppedFiles,
        })
      }, [sessionId, turnNumber, kind, anchorSeq, text, content, cwd, droppedFiles])

      const openEditor = useCallback(
        (event) => {
          event?.preventDefault?.()
          event?.stopPropagation?.()
          setDraft(text)
          setError(null)
          setEditing(true)
        },
        [text],
      )

      const cancelEdit = useCallback(() => {
        setEditing(false)
        setError(null)
      }, [])

      const canSend = draft.trim().length > 0 || images

      const submit = useCallback(() => {
        if (canSend === false || activity.isBusy(sessionId)) return
        setError(null)
        Promise.resolve()
          .then(() => requireAction(mer, 'editAndSend')({ targetSeq: anchorSeq, text: draft, content, cwd }))
          .then(
            () => {
              setEditing(false)
            },
            (failure) => {
              console.warn(`[${NS}] edit-and-send failed:`, failure)
              setError(describeError(failure, tr))
            },
          )
      }, [anchorSeq, canSend, content, cwd, draft, mer, sessionId, tr])

      const referenceLabels = data?.referenceLabels
      const skillNames = data?.skillNames
      const bubble = useMemo(
        () => renderUserBubble(renderFactorySlot, loadImage, content, text, data),
        [renderFactorySlot, loadImage, content, text, referenceLabels, skillNames],
      )

      if (editing) {
        return h(
          'div',
          { className: 'dsh-mer-row', 'data-editing': true, 'data-mer-kind': kind },
          h(
            'div',
            {
              className: 'dsh-mer-editor',
              onClick: (event) => event?.stopPropagation?.(),
            },
            h(
              'div',
              { className: 'dsh-mer-editorBox' },
              h(MessageEditor, {
                value: draft,
                label: tr('edit.label'),
                onChange: setDraft,
                onSave: submit,
                onCancel: cancelEdit,
              }),
            ),
            droppedFiles ? h('div', { className: 'dsh-mer-hint' }, tr('edit.fileHint')) : null,
            h(Alert, { text: error }),
            h(
              'div',
              { className: 'dsh-mer-editorActions' },
              h(ActionButton, {
                label: tr('edit.cancel'),
                tip: tr('edit.cancel'),
                onClick: cancelEdit,
                disabled: busy,
              }),
              h(ActionButton, {
                label: busy ? tr('action.edit.busy') : tr('edit.send'),
                tip: tr('edit.send'),
                iconName: 'IconSendOutlineRegular',
                primary: true,
                onClick: submit,
                disabled: busy || canSend === false,
              }),
            ),
          ),
        )
      }

      const clock = formatMessageClock(data?.time, tr)
      return h(
        'div',
        { className: 'dsh-mer-row', 'data-mer-kind': kind },
        bubble,
        h(
          'div',
          { className: 'dsh-mer-actions', 'data-pinned': pinned ? true : undefined },
          clock === '' ? null : h('span', { className: 'dsh-mer-time' }, clock),
          h(CopyAction, { text, tr }),
          h(ActionButton, {
            label: busy ? tr('action.edit.busy') : tr('action.edit'),
            tip: busy ? tr('state.busy') : tr('action.edit'),
            iconName: 'IconEditOutlineRegular',
            iconOnly: true,
            onClick: openEditor,
            disabled: busy || anchorSeq < 0,
          }),
        ),
        h(Alert, { text: error }),
      )
    })

    /**
     * Delegate to the shipped user-content Factory; fall back to pre-wrap text.
     *
     * `referenceLabels` / `skillNames` ride the node data of historical messages
     * (an `@session` mention or a `/skill` invocation). The shipped
     * `UserStyleBubble` forwards them into `content.referenceLabels` (rendering
     * the closing summary row) and into `facts.sessionLabels` / `facts.skillNames`
     * (resolving the inline chips), so they must be reproduced here or the row
     * loses that context. Absent values are omitted, never passed as undefined.
     */
    function renderUserBubble(renderFactorySlot, loadImage, content, text, data) {
      const referenceLabels = Array.isArray(data?.referenceLabels) && data.referenceLabels.length > 0
        ? data.referenceLabels
        : undefined
      const skillNames = data?.skillNames
      if (typeof renderFactorySlot === 'function') {
        try {
          return renderFactorySlot('conversation.chat.user.content', {
            content: {
              text,
              attachments: attachmentsOf(content),
              extraBlocks: extraBlocksOf(content),
              ...(referenceLabels === undefined ? {} : { referenceLabels }),
            },
            loadImage,
            facts: {
              ...(referenceLabels === undefined ? {} : { sessionLabels: referenceLabels }),
              ...(skillNames === undefined ? {} : { skillNames }),
            },
            interactive: true,
          })
        } catch (error) {
          console.warn(`[${NS}] user content factory failed; falling back to plain text:`, error)
        }
      }
      return h('div', { className: 'dsh-mer-fallback' }, text)
    }
    //#endregion

    //#region turn-tail actions
    const TurnTailActions = React.memo(function TurnTailActions(props) {
      const { turn, sessionId, t, useSession, mer } = props
      const tr = translatorOf(t)
      const busy = useBusy(sessionId, mer)
      const sessionHook = typeof useSession === 'function' ? useSession : useNoopSelector
      const running = sessionHook((snapshot) => snapshot?.running === true) === true
      useSyncExternalStore(promptRegistry.subscribe, promptRegistry.getVersion)
      const [error, setError] = useState(null)

      const closed = turn !== undefined && turn !== null && turn.status === 'closed'
      const reason = closed ? turn.end?.data?.reason?.kind : undefined
      // Anything that stopped short of a normal completion — including a `hook`
      // abort, an unknown future reason, or a missing end record — can continue.
      const incomplete = closed && reason !== 'completed'
      const prompt = closed ? promptRegistry.read(sessionId, turn.turn) : undefined

      const runContinue = useCallback(() => {
        if (activity.isBusy(sessionId) || running) return
        setError(null)
        Promise.resolve()
          .then(() => requireAction(mer, 'continueTurn')({ text: tr('action.continue') }))
          .catch((failure) => {
            console.warn(`[${NS}] continue failed:`, failure)
            setError(describeError(failure, tr))
          })
      }, [mer, running, sessionId, tr])

      const runRetry = useCallback(() => {
        if (activity.isBusy(sessionId) || prompt === undefined) return
        setError(null)
        Promise.resolve()
          .then(() => requireAction(mer, 'retryTurn')({
            targetSeq: prompt.anchorSeq,
            text: prompt.text,
            content: prompt.content,
            cwd: prompt.cwd,
          }))
          .catch((failure) => {
            console.warn(`[${NS}] retry failed:`, failure)
            setError(describeError(failure, tr))
          })
      }, [mer, prompt, sessionId, tr])

      if (closed === false) return null

      const continueTip = running ? tr('state.running') : tr('action.continue.tip')
      const retryTip = [
        running ? tr('state.running') : tr('action.retry.tip'),
        prompt?.hasFile === true ? tr('action.retry.fileHint') : '',
      ].join('')

      return h(
        'div',
        { className: 'dsh-mer-tail', 'data-mer-tail': '' },
        incomplete
          ? h(ActionButton, {
            label: tr('action.continue'),
            tip: continueTip,
            iconName: 'IconSendOutlineRegular',
            onClick: runContinue,
            disabled: busy || running,
          })
          : null,
        prompt === undefined
          ? null
          : h(ActionButton, {
            label: tr('action.retry'),
            tip: retryTip,
            iconName: 'IconRefreshOutlineRegular',
            onClick: runRetry,
            disabled: busy || running,
          }),
        h(Alert, { text: error }),
      )
    })
    //#endregion

    //#region plugin
    function registerChatNode(ctx, key) {
      ctx.slots.inject('conversation.chat.node', () => {
        try {
          return ctx.slots.register(
            {
              name: 'conversation.chat.node',
              key,
              priority: -1,
              locale: NS,
              inject: (sessionId) => ({ mer: createActions(ctx, sessionId) }),
            },
            ChatNodeView,
          )
        } catch (error) {
          console.warn(`[${NS}] '${key}' chat-node registration failed:`, error)
          return () => {}
        }
      })
    }

    function apply(ctx) {
      primitivesRef = loadPrimitives(require)

      ctx.effect(() => ctx.locale.register(NS, { zh, en }), `${NS}: dictionaries`)
      ctx.effect(() => installStyles(), `${NS}: styles`)

      registerChatNode(ctx, 'user')
      registerChatNode(ctx, 'steering')

      ctx.slots.inject('conversation.chat.turnTail', () => {
        try {
          return ctx.slots.register(
            {
              name: 'conversation.chat.turnTail',
              id: 'message-edit-retry',
              order: -10,
              locale: NS,
              inject: (sessionId) => ({ mer: createActions(ctx, sessionId) }),
            },
            TurnTailActions,
          )
        } catch (error) {
          console.warn(`[${NS}] turnTail registration failed:`, error)
          return () => {}
        }
      })
    }

    return {
      inject: ['slots', 'locale', 'sessions', 'uiWorkspace'],
      apply,
    }
    //#endregion
  },
})
