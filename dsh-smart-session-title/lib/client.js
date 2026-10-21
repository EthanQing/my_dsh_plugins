window.__ModuleLoader__.load({
  id: 'dsh-smart-session-title',
  factory: (require) => {
    const React = require('react')
    const { z } = require('zod')
    const h = React.createElement
    const useEffect = React.useEffect
    const useRef = React.useRef
    const useSyncExternalStore = React.useSyncExternalStore

    const NS = 'dsh-smart-session-title'
    const PACKAGE = 'dsh-smart-session-title'
    const NAMESPACE = 'smartSessionTitle'

    //#region dictionaries
    const zh = {
      'meta.title': '智能会话标题',
      'meta.description': '按会话目标与 AI 回复自动生成中文标题，保护手动命名，并在项目内预览后确认批量整理。',
      'menu.rename': 'AI 重新命名',
      'menu.batch': '整理本项目标题…',
      'panel.title': '整理项目标题',
      'panel.subtitle': '{project} · 仅预览，不会直接修改标题',
      'panel.loading': '正在为项目内的会话生成候选标题…',
      'panel.empty': '当前项目没有可整理的会话。',
      'panel.selectAll': '全选可整理项',
      'panel.selected': '已选 {count} 项',
      'panel.confirm': '应用所选标题',
      'panel.cancel': '取消',
      'panel.close': '关闭',
      'panel.busy': '正在应用，请稍候…',
      'panel.done': '已完成：{ok} 项更新，{failed} 项未更新。',
      'panel.result': '结果',
      'panel.untitled': '（无标题）',
      'status.ready': '可整理',
      'status.archived': '已归档',
      'status.running': '运行中',
      'status.cold': '未打开',
      'status.user-locked': '手动命名，已保护',
      'status.insufficient': '内容不足',
      'status.limited': '超出本次上限',
      'status.failed': '生成失败',
      'status.renamed': '已更新',
      'status.skipped': '已跳过',
      'error.generic': '操作失败：',
      'error.remote': '批量确认需要桌面/Web 主界面的连接，当前连接无法确认。',
      'single.busy': '正在重新命名…',
      'single.locked': '该会话标题由你手动指定，自动命名不会覆盖它。',
      'single.running': '会话正在运行，请稍后再试。',
      'single.insufficient': '会话内容不足，暂不命名。',
    }

    const en = {
      'meta.title': 'Smart Session Titles',
      'meta.description': 'Name sessions from their goal and the assistant reply, protect manual renames, and confirm project-wide batches after a preview.',
      'menu.rename': 'Rename with AI',
      'menu.batch': 'Tidy project titles…',
      'panel.title': 'Tidy project titles',
      'panel.subtitle': '{project} · Preview only; no title is changed yet',
      'panel.loading': 'Generating candidate titles for the sessions in this project…',
      'panel.empty': 'This project has no session to tidy.',
      'panel.selectAll': 'Select all eligible',
      'panel.selected': '{count} selected',
      'panel.confirm': 'Apply selected titles',
      'panel.cancel': 'Cancel',
      'panel.close': 'Close',
      'panel.busy': 'Applying…',
      'panel.done': 'Done: {ok} updated, {failed} unchanged.',
      'panel.result': 'Result',
      'panel.untitled': '(untitled)',
      'status.ready': 'Eligible',
      'status.archived': 'Archived',
      'status.running': 'Running',
      'status.cold': 'Not open',
      'status.user-locked': 'Manually named',
      'status.insufficient': 'Too little content',
      'status.limited': 'Over this batch limit',
      'status.failed': 'Generation failed',
      'status.renamed': 'Updated',
      'status.skipped': 'Skipped',
      'error.generic': 'Failed: ',
      'error.remote': 'Batch confirmation needs the main desktop/web connection, which this connection cannot answer.',
      'single.busy': 'Renaming…',
      'single.locked': 'This session is manually named; automatic naming never overwrites it.',
      'single.running': 'The session is running; try again once it settles.',
      'single.insufficient': 'This session has too little content to name.',
    }
    //#endregion

    //#region wire contract
    /**
     * Compose the same strict schemas the Host registers. Both faces read this
     * one shape; the browser builds it from the seeded `zod` module.
     */
    function wireSchemas() {
      const id = () => z.string().min(1).max(200)
      const previewRow = z.strictObject({
        sessionId: id(),
        oldTitle: z.string().max(400),
        title: z.string().max(400),
        status: z.string().min(1).max(32),
      })
      const resultRow = z.strictObject({
        sessionId: id(),
        status: z.string().min(1).max(32),
        title: z.string().max(400).optional(),
        reason: z.string().max(64).optional(),
      })
      return {
        previewBatchInput: z.strictObject({ workspaceId: id() }),
        previewBatchResult: z.strictObject({
          previewId: id(),
          expiresAt: z.number(),
          rows: z.array(previewRow).max(50),
        }),
        confirmBatchInput: z.strictObject({
          previewId: id(),
          sessionIds: z.array(id()).min(1).max(50),
        }),
        confirmBatchResult: z.strictObject({
          previewId: id(),
          rows: z.array(resultRow).max(50),
        }),
        cancelBatchInput: z.strictObject({ previewId: id() }),
        cancelBatchResult: z.strictObject({ previewId: id(), cancelled: z.boolean() }),
        renameSessionInput: z.strictObject({ sessionId: id() }),
        renameSessionResult: z.strictObject({
          sessionId: id(),
          status: z.string().min(1).max(32),
          title: z.string().max(400),
        }),
      }
    }

    /**
     * Build the Client contribution mounted through `ctx.remote.$mount`.
     * @returns the contribution with shared descriptors.
     */
    function remoteContribution() {
      const s = wireSchemas()
      const codec = (name, create) => ({ mode: 'strict', typeSymbol: `${PACKAGE}#${name}`, create })
      const method = (name, inputName, resultName) => ({
        id: `${PACKAGE}#${NAMESPACE}/${name}`,
        service: NAMESPACE,
        namespace: NAMESPACE,
        method: name,
        invocation: { kind: 'direct' },
        parameters: [{ name: 'request', wire: 'request', source: 'json', codec: codec(inputName, () => s[inputName]) }],
        cancellation: { parameter: 'signal' },
        result: codec(resultName, () => s[resultName]),
      })
      return {
        package: PACKAGE,
        descriptors: [
          method('previewBatch', 'previewBatchInput', 'previewBatchResult'),
          method('confirmBatch', 'confirmBatchInput', 'confirmBatchResult'),
          method('cancelBatch', 'cancelBatchInput', 'cancelBatchResult'),
          method('renameSession', 'renameSessionInput', 'renameSessionResult'),
        ],
      }
    }
    //#endregion

    //#region controller
    /**
     * Minimal external store for the panel, so every mounted surface reads the
     * same snapshot without touching the DOM.
     */
    function createController() {
      let snapshot = {
        open: false,
        phase: 'idle',
        workspaceId: null,
        projectTitle: '',
        previewId: null,
        rows: [],
        results: null,
        selected: [],
        error: null,
        notes: null,
      }
      const listeners = new Set()
      let abort = null
      const requests = new Set()
      const timers = new Set()
      const decorations = new Set()
      let toastContainer = null
      const later = (callback, ms) => {
        const timer = setTimeout(() => {
          timers.delete(timer)
          if (!disposed) callback()
        }, ms)
        timers.add(timer)
      }
      let disposed = false
      let remote = null
      let workspaces = null
      let tr = key => key

      const publish = patch => {
        if (disposed) return
        snapshot = { ...snapshot, ...patch }
        for (const listener of [...listeners]) listener()
      }

      const failMessage = error => {
        const code = typeof error?.code === 'string' ? error.code : undefined
        const message = error instanceof Error ? error.message : String(error)
        if (code === 'USER_CONFIRMATION_REQUIRED') return tr('error.remote')
        return `${tr('error.generic')}${message}`
      }

      const requireRemote = () => {
        if (remote === null) throw new Error(tr('error.remote'))
        return remote
      }

      const call = async (method, request) => {
        if (disposed) throw new Error('plugin disposed')
        const namespace = requireRemote()
        const controller = new AbortController()
        const panel = method !== 'renameSession'
        if (panel) {
          abort?.abort(new Error('title panel request superseded'))
          abort = controller
        }
        requests.add(controller)
        try {
          const result = await namespace[method](request, controller.signal)
          controller.signal.throwIfAborted()
          if (!result.ok) throw result.error
          return result.value
        } catch (error) {
          if (controller.signal.aborted) {
            const cancelled = new Error('title request cancelled')
            cancelled.name = 'AbortError'
            throw cancelled
          }
          throw error
        } finally {
          requests.delete(controller)
          if (abort === controller) abort = null
        }
      }

      const close = () => {
        abort?.abort(new Error('title panel closed'))
        abort = null
        publish({
          open: false,
          phase: 'idle',
          workspaceId: null,
          projectTitle: '',
          previewId: null,
          rows: [],
          results: null,
          selected: [],
          error: null,
          notes: null,
        })
      }

      const projectTitleOf = workspaceId => {
        if (workspaces === null) return ''
        try {
          const items = workspaces.list?.getSnapshot?.()?.items ?? []
          const item = Array.isArray(items) ? items.find(entry => entry?.workspaceId === workspaceId) : undefined
          return typeof item?.title === 'string' ? item.title : ''
        } catch {
          return ''
        }
      }

      const preview = async workspaceId => {
        publish({
          open: true,
          phase: 'loading',
          workspaceId,
          projectTitle: projectTitleOf(workspaceId),
          previewId: null,
          rows: [],
          results: null,
          selected: [],
          error: null,
          notes: null,
        })
        try {
          const value = await call('previewBatch', { workspaceId })
          const selectable = value.rows.filter(row => row.status === 'ready').map(row => row.sessionId)
          publish({ phase: 'ready', previewId: value.previewId, rows: value.rows, selected: selectable })
        } catch (error) {
          if (disposed || !snapshot.open || error?.name === 'AbortError') return
          publish({ phase: 'error', error: failMessage(error) })
        }
      }

      const toggle = sessionId => {
        const selected = snapshot.selected.includes(sessionId)
          ? snapshot.selected.filter(id => id !== sessionId)
          : [...snapshot.selected, sessionId]
        publish({ selected })
      }

      const selectAll = enabled => {
        publish({ selected: enabled ? snapshot.rows.filter(row => row.status === 'ready').map(row => row.sessionId) : [] })
      }

      const confirm = async () => {
        if (snapshot.previewId === null || snapshot.selected.length === 0) return
        publish({ phase: 'applying', error: null })
        try {
          const value = await call('confirmBatch', { previewId: snapshot.previewId, sessionIds: snapshot.selected })
          const ok = value.rows.filter(row => row.status === 'renamed').length
          const failed = value.rows.length - ok
          publish({
            phase: 'done',
            results: value.rows,
            notes: tr('panel.done', { ok: String(ok), failed: String(failed) }),
          })
        } catch (error) {
          if (disposed || !snapshot.open || error?.name === 'AbortError') return
          publish({ phase: 'error', error: failMessage(error) })
        }
      }

      const cancel = async () => {
        const previewId = snapshot.previewId
        if (previewId !== null) {
          try {
            await call('cancelBatch', { previewId })
          } catch {
            // Closing is the user's intent; a failed cancellation must not trap the panel.
          }
        }
        close()
      }

      /** Non-blocking inline feedback helper: show lightweight toast for errors */
      const showToast = (message, type = 'info') => {
        if (disposed) return
        let container = toastContainer
        if (!container) {
          container = document.createElement('div')
          container.id = 'dsh-sst-toast-container'
          container.className = 'dsh-sst-toast-container'
          document.body.appendChild(container)
          toastContainer = container
        }
        const toast = document.createElement('div')
        toast.className = `dsh-sst-toast dsh-sst-toast-${type}`
        toast.setAttribute('role', type === 'error' ? 'alert' : 'status')
        toast.textContent = message
        container.appendChild(toast)
        later(() => {
          toast.classList.add('dsh-sst-toast-fadeout')
          later(() => {
            toast.remove()
            if (!container.firstElementChild) {
              container.remove()
              if (toastContainer === container) toastContainer = null
            }
          }, 300)
        }, 3200)
      }

      /** Non-blocking inline single session rename */
      const renameOne = async sessionId => {
        let row = null
        let spinner = null
        let check = null
        const cleanup = () => {
          spinner?.remove()
          check?.remove()
          row?.classList.remove('dsh-sst-session-renaming', 'dsh-sst-flash-green', 'dsh-sst-shake')
          decorations.delete(cleanup)
        }
        if (disposed) return
        decorations.add(cleanup)
        try {
          row = document.querySelector(`[data-row-key="session:${globalThis.CSS.escape(sessionId)}"]`)
          if (row) {
            row.classList.add('dsh-sst-session-renaming')
            spinner = document.createElement('span')
            spinner.className = 'dsh-sst-inline-spinner'
            spinner.title = tr('single.busy')
            spinner.innerHTML = '<svg class="dsh-sst-inline-spinner" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="8" r="6" stroke-opacity="0.25"/><path d="M14 8a6 6 0 0 0-6-6"/></svg>'
            const titleEl = row.querySelector('[class*="title"], [class*="name"]') || row.firstElementChild
            if (titleEl) titleEl.prepend(spinner)
            else row.prepend(spinner)
          }
          await call('renameSession', { sessionId })
          if (row) {
            row.classList.remove('dsh-sst-session-renaming')
            spinner?.remove()
            row.classList.add('dsh-sst-flash-green')
            check = document.createElement('span')
            check.className = 'dsh-sst-inline-check'
            check.innerHTML = '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6.5l2.5 2.5 4.5-5"/></svg>'
            const titleEl = row.querySelector('[class*="title"], [class*="name"]') || row.firstElementChild
            if (titleEl) titleEl.prepend(check)
            else row.prepend(check)
            later(cleanup, 1800)
          } else cleanup()
        } catch (error) {
          if (disposed) { cleanup(); return }
          if (row) {
            row.classList.remove('dsh-sst-session-renaming')
            spinner?.remove()
            row.classList.add('dsh-sst-shake')
            later(cleanup, 600)
          }
          if (!row) cleanup()
          const code = typeof error?.code === 'string' ? error.code : undefined
          let msg = failMessage(error)
          if (code === 'USER_TITLE_LOCKED') msg = tr('single.locked')
          else if (code === 'SESSION_RUNNING') msg = tr('single.running')
          else if (code === 'INSUFFICIENT_CONTENT') msg = tr('single.insufficient')
          showToast(msg, 'error')
        }
      }

      const subscribe = listener => {
        listeners.add(listener)
        return () => {
          listeners.delete(listener)
        }
      }

      return {
        getSnapshot: () => snapshot,
        subscribe,
        setRemote: value => {
          remote = value
        },
        setServices: value => {
          workspaces = value
        },
        setTranslate: value => {
          tr = value
        },
        projectTitleOf,
        preview,
        toggle,
        selectAll,
        confirm,
        cancel,
        close,
        renameOne,
        dispose: () => {
          disposed = true
          for (const controller of requests) controller.abort(new Error('plugin disposed'))
          requests.clear()
          abort = null
          for (const timer of timers) clearTimeout(timer)
          timers.clear()
          for (const cleanup of [...decorations]) cleanup()
          toastContainer?.remove()
          toastContainer = null
          remote = null
          workspaces = null
          listeners.clear()
        },
      }
    }
    //#endregion

    //#region styles
    const CSS = `
.dsh-sst-menu-item{display:flex;align-items:center;gap:6px;min-height:32px;padding:6px 8px;border:0;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;text-align:left;width:100%;cursor:pointer;box-sizing:border-box}
.dsh-sst-menu-item:hover,.dsh-sst-menu-item:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.dsh-sst-menu-item:disabled{opacity:.55;cursor:not-allowed;background:transparent;color:var(--dsw-alias-label-secondary)}
.dsh-sst-menu-icon{display:inline-flex;flex:none;width:14px;height:14px;align-items:center;justify-content:center;color:var(--dsw-alias-menu-icon)}
.dsh-sst-menu-separator{height:0.5px;margin:3px 2px;background:var(--dsw-alias-border-l2)}
.dsh-sst-mask{position:fixed;inset:0;z-index:1000;background:var(--dsw-alias-bg-mask,rgba(0,0,0,.35))}
.dsh-sst-dialog{position:fixed;z-index:1001;top:50%;left:50%;transform:translate(-50%,-50%);box-sizing:border-box;width:min(720px,calc(100vw - 32px));max-height:min(640px,calc(100vh - 64px));display:flex;flex-direction:column;padding:16px;border:1px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-panel);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}
.dsh-sst-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px}
.dsh-sst-title{margin:0;font-size:15px;line-height:22px;font-weight:600}
.dsh-sst-sub{margin:2px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dsh-sst-close{border:0;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font-size:16px;line-height:16px;padding:4px;border-radius:var(--dsw-radius-xs)}
.dsh-sst-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-sst-body{flex:1;min-height:64px;overflow:auto;margin:4px -4px 8px;padding:0 4px}
.dsh-sst-status{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;padding:8px 0}
.dsh-sst-error{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px;padding:8px 0;overflow-wrap:anywhere}
.dsh-sst-row{display:flex;align-items:flex-start;gap:8px;padding:8px;border-radius:var(--dsw-radius-md)}
.dsh-sst-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-sst-row input{margin:3px 0 0;flex:none;accent-color:var(--dsw-alias-brand-primary)}
.dsh-sst-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.dsh-sst-row-titles{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px}
.dsh-sst-old{color:var(--dsw-alias-label-tertiary);text-decoration:line-through;overflow-wrap:anywhere}
.dsh-sst-arrow{color:var(--dsw-alias-label-caption)}
.dsh-sst-new{color:var(--dsw-alias-label-primary);font-weight:600;overflow-wrap:anywhere}
.dsh-sst-row-meta{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;overflow-wrap:anywhere}
.dsh-sst-row-meta[data-error]{color:var(--dsw-alias-state-error-primary)}
.dsh-sst-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;border-top:0.5px solid var(--dsw-alias-border-l2);padding-top:12px}
.dsh-sst-foot-left{display:flex;align-items:center;gap:8px;color:var(--dsw-alias-label-secondary);font-size:12px}
.dsh-sst-foot-right{display:flex;align-items:center;gap:8px}
.dsh-sst-btn{height:28px;padding:0 12px;border:0.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;cursor:pointer;box-sizing:border-box}
.dsh-sst-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dsh-sst-btn:disabled{opacity:.55;cursor:not-allowed}
.dsh-sst-btn-primary{border-color:transparent;background:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-inverse, #fff)}
.dsh-sst-btn-primary:hover:not(:disabled){opacity:.9;background:var(--dsw-alias-state-business-primary)}
.dsh-sst-check{display:inline-flex;align-items:center;gap:6px;cursor:pointer;color:var(--dsw-alias-label-secondary)}
.dsh-sst-session-renaming{opacity:.65;transition:opacity .2s ease}
.dsh-sst-inline-spinner{display:inline-flex;align-items:center;justify-content:center;margin-right:6px;color:#3b82f6;animation:dsh-sst-spin .8s linear infinite;vertical-align:middle}
@keyframes dsh-sst-spin{to{transform:rotate(360deg)}}
.dsh-sst-inline-check{display:inline-flex;align-items:center;justify-content:center;margin-right:6px;color:#16a34a;font-weight:bold;animation:dsh-sst-pop .3s cubic-bezier(0.175,0.885,0.32,1.275);vertical-align:middle}
@keyframes dsh-sst-pop{0%{transform:scale(0.5);opacity:0}100%{transform:scale(1);opacity:1}}
.dsh-sst-flash-green{animation:dsh-sst-green-pulse .8s ease-out}
@keyframes dsh-sst-green-pulse{0%{background-color:rgba(22,163,74,0.22)}100%{background-color:transparent}}
.dsh-sst-shake{animation:dsh-sst-shake-anim .4s ease-in-out}
@keyframes dsh-sst-shake-anim{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-4px)}40%,80%{transform:translateX(4px)}}
.dsh-sst-toast-container{position:fixed;top:48px;right:20px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none}
.dsh-sst-toast{pointer-events:auto;box-sizing:border-box;max-width:340px;padding:8px 12px;border-radius:8px;background:var(--dsw-alias-bg-layer-2,#1e1e20);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,0.2));box-shadow:0 8px 24px -4px rgba(0,0,0,0.18),0 2px 6px -1px rgba(0,0,0,0.08);color:var(--dsw-alias-label-primary,#ffffff);font-size:12.5px;display:flex;align-items:center;gap:8px;backdrop-filter:blur(14px);animation:dsh-sst-toast-in .25s cubic-bezier(0.16,1,0.3,1);transition:opacity .3s ease,transform .3s ease}
.dsh-sst-toast-error{border-color:rgba(220,38,38,0.35);color:var(--dsw-alias-state-error-primary,#ef4444)}
.dsh-sst-toast-fadeout{opacity:0;transform:translateY(-8px)}
@keyframes dsh-sst-toast-in{from{opacity:0;transform:translateY(-10px) scale(0.95)}to{opacity:1;transform:translateY(0) scale(1)}}
`
    //#endregion

    //#region components
    /** Small sparkle glyph drawn in the plugin's own style. */
    function SparkIcon() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': 'true', fill: 'none' },
        h('path', { d: 'M8 1.8l1.5 3.9 3.9 1.5-3.9 1.5L8 12.6 6.5 8.7 2.6 7.2l3.9-1.5L8 1.8z', stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round' }))
    }

    /** Small layered-list glyph for the batch entry. */
    function LayersIcon() {
      return h('svg', { width: 14, height: 14, viewBox: '0 0 16 16', 'aria-hidden': 'true', fill: 'none' },
        h('path', { d: 'M2.2 5.4L8 2.4l5.8 3-5.8 3-5.8-3z', stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round' }),
        h('path', { d: 'M2.6 8.4L8 11.2l5.4-2.8M2.6 11.2L8 14l5.4-2.8', stroke: 'currentColor', strokeWidth: 1.2, strokeLinejoin: 'round' }))
    }

    /** Small linear close icon. */
    function CloseIcon() {
      return h('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', stroke: 'currentColor', strokeWidth: 1.75, strokeLinecap: 'round', 'aria-hidden': 'true' },
        h('path', { d: 'M2.5 2.5l7 7M9.5 2.5l-7 7' }))
    }

    /** Small right arrow icon. */
    function ArrowRightIcon() {
      return h('svg', { width: 12, height: 12, viewBox: '0 0 12 12', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', className: 'dsh-sst-arrow' },
        h('path', { d: 'M2.5 6h7M6.5 3l3 3-3 3' }))
    }

    /**
     * One sidebar menu row.
     * @param props - label key, icon, disabled state, selection callback.
     * @returns the row.
     */
    function MenuRow({ label, icon, disabled, onSelect, t }) {
      return h('button', {
        type: 'button',
        role: 'menuitem',
        className: 'dsh-sst-menu-item',
        disabled: disabled === true,
        onClick: event => {
          event.preventDefault()
          event.stopPropagation()
          if (disabled !== true) onSelect()
        },
      },
      h('span', { className: 'dsh-sst-menu-icon' }, icon),
      h('span', null, label))
    }

    /**
     * One preview/result row.
     * @param props - row, selection, and result lookup.
     * @returns the row.
     */
    function PreviewRow({ row, selected, result, t, onToggle }) {
      const status = result?.status ?? row.status
      const title = row.title
      const checkable = result === undefined && row.status === 'ready'
      const reason = result?.reason
      return h('div', { className: 'dsh-sst-row' },
        h('input', {
          type: 'checkbox',
          checked: selected,
          disabled: !checkable,
          'aria-label': title || row.sessionId,
          onChange: () => onToggle(row.sessionId),
        }),
        h('div', { className: 'dsh-sst-row-main' },
          h('div', { className: 'dsh-sst-row-titles' },
            h('span', { className: 'dsh-sst-old' }, row.oldTitle || t('panel.untitled')),
            h(ArrowRightIcon),
            h('span', { className: 'dsh-sst-new' }, title || t('panel.untitled'))),
          h('div', {
            className: 'dsh-sst-row-meta',
            'data-error': reason === undefined ? undefined : '',
          }, `${t('panel.result')}: ${t(`status.${status}`) === `status.${status}` ? status : t(`status.${status}`)}${reason === undefined ? '' : ` (${reason})`}`)))
    }

    /**
     * The `shell.overlay` panel for batch preview and confirmation.
     * @param props - controller snapshot, actions, and translator.
     * @returns the dialog or null.
     */
    function TitlePanel(props) {
      const state = props.state
      const t = props.t
      const closeRef = useRef(null)
      const open = state.open
      useEffect(() => {
        if (!open) return undefined
        const onKeyDown = event => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            if (state.phase !== 'applying') props.actions.cancel()
          }
        }
        window.addEventListener('keydown', onKeyDown, true)
        const timer = setTimeout(() => {
          try {
            closeRef.current?.focus()
          } catch {
            // Focus is best effort.
          }
        }, 0)
        return () => {
          window.removeEventListener('keydown', onKeyDown, true)
          clearTimeout(timer)
        }
      }, [open, state.phase, props.actions])

      if (!open) return null
      const results = new Map((state.results ?? []).map(row => [row.sessionId, row]))
      const eligible = state.rows.filter(row => row.status === 'ready').length
      const busy = state.phase === 'applying'
      const allSelected = eligible > 0 && state.selected.length >= eligible

      const footRight = h('div', { className: 'dsh-sst-foot-right' },
        h('button', {
          type: 'button',
          className: 'dsh-sst-btn',
          disabled: busy,
          onClick: () => props.actions.cancel(),
        }, t('panel.cancel')),
        state.phase === 'done'
          ? h('button', {
            type: 'button',
            className: 'dsh-sst-btn dsh-sst-btn-primary',
            onClick: () => props.actions.cancel(),
          }, t('panel.close'))
          : h('button', {
            type: 'button',
            className: 'dsh-sst-btn dsh-sst-btn-primary',
            disabled: busy || state.previewId === null || state.selected.length === 0,
            onClick: () => {
              void props.actions.confirm()
            },
          }, busy ? t('panel.busy') : t('panel.confirm')))

      const foot = h('div', { className: 'dsh-sst-foot' },
          h('div', { className: 'dsh-sst-foot-left' },
            h('label', { className: 'dsh-sst-check' },
              h('input', {
                type: 'checkbox',
                checked: allSelected,
                disabled: eligible === 0 || busy || state.phase === 'done',
                onChange: event => props.actions.selectAll(event.target.checked),
              }),
              t('panel.selectAll')),
            h('span', null, t('panel.selected', { count: String(state.selected.length) }))),
          footRight)


      return h(React.Fragment, null,
        h('div', { className: 'dsh-sst-mask', 'aria-hidden': 'true', onClick: () => { if (!busy) props.actions.cancel() } }),
        h('div', {
          className: 'dsh-sst-dialog',
          role: 'dialog',
          'aria-modal': 'true',
          'aria-labelledby': 'dsh-sst-title',
        },
        h('div', { className: 'dsh-sst-head' },
          h('div', null,
            h('h2', { id: 'dsh-sst-title', className: 'dsh-sst-title' }, t('panel.title')),
            h('p', { className: 'dsh-sst-sub' }, t('panel.subtitle', { project: state.projectTitle || '—' }))),
          h('button', {
            type: 'button',
            ref: closeRef,
            className: 'dsh-sst-close',
            'aria-label': t('panel.close'),
            disabled: busy,
            onClick: () => props.actions.cancel(),
          }, h(CloseIcon))),
        h('div', { className: 'dsh-sst-body' },
          state.error === null ? null : h('p', { className: 'dsh-sst-error', role: 'alert' }, state.error),
          state.notes === null ? null : h('p', { className: 'dsh-sst-status', role: 'status' }, state.notes),
          state.phase === 'loading' ? h('p', { className: 'dsh-sst-status', role: 'status' }, t('panel.loading')) : null,
          state.phase !== 'loading' && state.rows.length === 0 && state.error === null
            ? h('p', { className: 'dsh-sst-status' }, t('panel.empty'))
            : null,
          state.rows.map(row => h(PreviewRow, {
            key: row.sessionId,
            row,
            selected: state.selected.includes(row.sessionId),
            result: results.get(row.sessionId),
            t,
            onToggle: props.actions.toggle,
          }))),
        foot))
    }
    //#endregion

    //#region apply
    /**
     * Register the plugin's Client half.
     * @param ctx - Client plugin context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-smart-session-title: dictionaries')
      ctx.effect(() => {
        const style = document.createElement('style')
        style.setAttribute('data-plugin-css', NS)
        style.textContent = CSS
        document.head.append(style)
        return () => style.remove()
      }, 'dsh-smart-session-title: styles')

      const t = ctx.locale.bind(NS)
      const controller = createController()
      controller.setTranslate(t)
      controller.setServices(ctx.get('workspaces') ?? null)

      let disposeRemote = null
      let unmounted = false
      ctx.effect(() => () => {
        unmounted = true
        controller.dispose()
        void disposeRemote?.()
        disposeRemote = null
      }, 'dsh-smart-session-title: client lifetime')

      // The Remote namespace is optional: without it the menus stay visible and
      // the panel explains that this connection cannot confirm. The fiber is
      // owned by `apply`, so a late or replaced Gateway still mounts the face.
      ctx.inject(['remote'], remoteCtx => {
        const remoteService = remoteCtx.remote
        if (remoteService === undefined || typeof remoteService.$mount !== 'function') return
        let detached = false
        let release = null
        const cleanup = () => {
          detached = true
          controller.setRemote(null)
          if (disposeRemote === cleanup) disposeRemote = null
          const unmount = release
          release = null
          void unmount?.()
        }
        remoteCtx.effect(() => cleanup, 'dsh-smart-session-title: remote lifetime')
        void remoteService.$mount(remoteContribution()).then(unmount => {
          if (unmounted || detached) {
            void unmount()
            return
          }
          release = unmount
          disposeRemote = cleanup
          controller.setRemote(remoteCtx.get(`remote.${NAMESPACE}`) ?? null)
        }).catch(error => {
          console.warn(`[${NS}] Remote mount failed:`, error)
        })
      })

      const actions = {
        preview: workspaceId => controller.preview(workspaceId),
        toggle: sessionId => controller.toggle(sessionId),
        selectAll: enabled => controller.selectAll(enabled),
        confirm: () => controller.confirm(),
        cancel: () => { void controller.cancel() },
        close: () => controller.close(),
        renameOne: sessionId => { void controller.renameOne(sessionId) },
      }

      /**
       * Resolve the project that owns one session from the Workspace snapshot.
       * @param sessionId - session to locate.
       * @returns the workspace id, or undefined.
       */
      function workspaceOf(sessionId) {
        const workspaces = ctx.get('workspaces')
        try {
          const items = workspaces?.list?.getSnapshot?.()?.items ?? []
          const item = Array.isArray(items)
            ? items.find(entry => Array.isArray(entry?.sessionIds) && entry.sessionIds.includes(sessionId))
            : undefined
          return item?.workspaceId
        } catch {
          return undefined
        }
      }

      /**
       * One shared menu wrapper: the single-session row, the batch row that
       * appears when a project owns the session, and a separator.
       * @param props - menu props from the sidebar slot.
       * @returns the rows.
       */
      function SessionMenuItems(props) {
        const translate = typeof props.t === 'function' ? props.t : t
        const menu = typeof props.useMenuOpenState === 'function' ? props.useMenuOpenState() : [false, () => {}]
        const setMenuOpen = typeof menu[1] === 'function' ? menu[1] : () => {}
        const workspaceId = workspaceOf(props.sessionId)
        const row = key => h(MenuRow, {
          key,
          t: translate,
          icon: key === 'single' ? h(SparkIcon) : h(LayersIcon),
          label: key === 'single' ? translate('menu.rename') : translate('menu.batch'),
          onSelect: () => {
            setMenuOpen(false)
            if (key === 'single') actions.renameOne(props.sessionId)
            else actions.preview(workspaceId)
          },
        })
        return h(React.Fragment, null,
          h('div', { className: 'dsh-sst-menu-separator', role: 'separator' }),
          row('single'),
          workspaceId === undefined ? null : row('batch'))
      }
      SessionMenuItems.displayName = 'SmartSessionTitleMenuItems'

      /**
       * The overlay surface reads the shared controller snapshot.
       * @param props - overlay props from the shell slot.
       * @returns the panel.
       */
      function Overlay(props) {
        const translate = typeof props.t === 'function' ? props.t : t
        const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot)
        return h(TitlePanel, { state, actions, t: translate })
      }

      try {
        ctx.slots.inject('shell.overlay', () => {
          try {
            return ctx.slots.register({
              name: 'shell.overlay',
              id: 'dsh-smart-session-title-overlay',
              order: 1000,
              locale: NS,
            }, Overlay)
          } catch (error) {
            console.warn(`[${NS}] overlay registration failed:`, error)
            return () => {}
          }
        })
      } catch (error) {
        console.warn(`[${NS}] overlay slot injection failed:`, error)
      }

      try {
        ctx.slots.inject('sidebar.workspaces.session.menu.item', () => {
          try {
            return ctx.slots.register({
              name: 'sidebar.workspaces.session.menu.item',
              id: 'dsh-smart-session-title-menu',
              order: 470,
              locale: NS,
            }, SessionMenuItems)
          } catch (error) {
            console.warn(`[${NS}] menu item registration failed:`, error)
            return () => {}
          }
        })
      } catch (error) {
        console.warn(`[${NS}] menu slot injection failed:`, error)
      }
    }

    return { inject: ['slots', 'locale', 'workspaces'], apply }
    //#endregion
  },
})
