window.__ModuleLoader__.load({
  id: 'dsh-session-delete-manager',
  factory: (require) => {
    const React = require('react')
    const NS = 'dsh-session-delete-manager'
    const ROUTE = '/dsh-session-delete-manager'
    const TOKEN_ROUTE = '/dsh-session-delete-manager/token'
    const TOKEN_META = 'dsh-session-delete-manager-token'
    const TOKEN_HEADER = 'x-dsh-session-delete-manager-token'
    const CLIENT_HEADER = 'x-dsh-sdm-client'
    const TOKEN_SELECTOR = `meta[name="${TOKEN_META}"]`
    const CHUNK_SIZE = 100
    const REQUEST_TIMEOUT_MS = 60000
    const TOKEN_REQUEST_TIMEOUT_MS = 10000
    const INDEX_REQUEST_TIMEOUT_MS = 15000
    const h = React.createElement
    const useSyncExternalStore = React.useSyncExternalStore

    const zh = {
      untitled: '未命名会话',
      'menu.deleteSession': '删除会话',
      'menu.selectSessions': '多选会话',
      'menu.running': '会话运行中，无法删除',
      'batch.title': '当前项目：{name}',
      'batch.count': '已选 {selected}/{total}',
      'batch.running': '{count} 个运行中的会话不可选择',
      'batch.selectAll': '全选',
      'batch.deselectAll': '取消全选',
      'batch.deleteSelected': '删除所选',
      'batch.cancel': '取消',
      'batch.empty': '当前项目暂无可删除的会话',
      'batch.failed': '{failed} 个未删除',
      'batch.busy': '正在删除…',
      'select.session': '选择会话：{title}',
      'confirm.close': '关闭',
      'confirm.title.single': '删除会话',
      'confirm.title.batch': '删除所选会话',
      'confirm.desc.single': '将永久删除「{title}」的会话记录与投影缓存，此操作无法撤销。',
      'confirm.desc.batch': '将永久删除所选的 {count} 个会话记录与投影缓存，此操作无法撤销。',
      'confirm.current': '其中包含当前正在查看的会话；删除成功后会尝试回到新会话页面，若未自动切换请手动切换。',
      'confirm.cancel': '取消',
      'confirm.delete': '永久删除',
      'confirm.busy': '正在删除，请稍候…',
      'confirm.restoreFailed': '未能恢复会话的隐藏状态，请刷新页面后检查。',
      'error.invalid-id': '会话标识无效。',
      'error.running': '会话正在运行，请先停止后再删除。',
      'error.active': '会话仍有后台任务或待处理活动，请先停止后再删除。',
      'error.activityKinds': '活动：{kinds}。',
      'error.unknown': '会话已不存在或无法找到。',
      'error.archived': '该会话已归档，请先取消归档后再删除。',
      'error.rootMissing': '未找到会话存储目录。',
      'error.unsafe': '会话记录路径不安全，已拒绝删除。',
      'error.ambiguous': '找到多个同名会话记录，已拒绝删除。',
      'error.cacheLocked': '投影缓存被占用，请稍后重试。',
      'error.logLocked': '会话记录文件被占用，请切换会话后重试。',
      'error.archiveFailed': '无法暂时隐藏会话，删除已取消。',
      'error.internal': '删除时发生内部错误，请重试。',
      'error.internalDetail': '删除时发生内部错误（{code}）。{detail}',
      'error.token': '安全校验失败，请刷新页面后重试；若仍失败请重启 DSH。',
      'error.network': '无法连接后台服务，请检查连接后重试。',
    }

    const en = {
      untitled: 'Untitled session',
      'menu.deleteSession': 'Delete session',
      'menu.selectSessions': 'Select sessions',
      'menu.running': 'Session is running and cannot be deleted',
      'batch.title': 'Project: {name}',
      'batch.count': 'Selected {selected}/{total}',
      'batch.running': '{count} running session(s) cannot be selected',
      'batch.selectAll': 'Select all',
      'batch.deselectAll': 'Deselect all',
      'batch.deleteSelected': 'Delete selected',
      'batch.cancel': 'Cancel',
      'batch.empty': 'No deletable sessions in this project',
      'batch.failed': '{failed} not deleted',
      'batch.busy': 'Deleting…',
      'select.session': 'Select session: {title}',
      'confirm.close': 'Close',
      'confirm.title.single': 'Delete session',
      'confirm.title.batch': 'Delete selected sessions',
      'confirm.desc.single': 'This permanently deletes the session record and projection cache for “{title}”. This cannot be undone.',
      'confirm.desc.batch': 'This permanently deletes {count} selected session records and their projection caches. This cannot be undone.',
      'confirm.current': 'The current session is included. After a successful deletion the app will try to return to a new session page; if it does not switch automatically, switch manually.',
      'confirm.cancel': 'Cancel',
      'confirm.delete': 'Delete permanently',
      'confirm.busy': 'Deleting, please wait…',
      'confirm.restoreFailed': 'The session may remain hidden; refresh the page and check again.',
      'error.invalid-id': 'The session id is invalid.',
      'error.running': 'The session is running. Stop it before deleting.',
      'error.active': 'The session still has background work or pending activity. Stop it before deleting.',
      'error.activityKinds': 'Activity: {kinds}.',
      'error.unknown': 'The session no longer exists or cannot be found.',
      'error.archived': 'This session is archived. Unarchive it before deleting.',
      'error.rootMissing': 'The session storage directory was not found.',
      'error.unsafe': 'The session record path is unsafe; deletion was refused.',
      'error.ambiguous': 'Multiple session records share this name; deletion was refused.',
      'error.cacheLocked': 'The projection cache is locked. Try again later.',
      'error.logLocked': 'Session record files are locked. Switch sessions and try again.',
      'error.archiveFailed': 'The session could not be temporarily hidden, so deletion was cancelled.',
      'error.internal': 'An internal error occurred while deleting. Try again.',
      'error.internalDetail': 'Deletion failed with an internal error ({code}). {detail}',
      'error.token': 'Security verification failed. Refresh the page and try again; restart DSH if it persists.',
      'error.network': 'Unable to reach the host service. Check the connection and try again.',
    }

    const CSS = `
.dsh-sdm-menu-item-wrap{display:block}
.dsh-sdm-menu-item{display:flex;align-items:center;gap:6px;min-height:34px;padding:6px 8px;border:0;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;text-align:left;width:100%;cursor:pointer;box-sizing:border-box}
.dsh-sdm-menu-item:hover,.dsh-sdm-menu-item:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.dsh-sdm-menu-item-danger{color:var(--dsw-alias-state-error-primary)}
.dsh-sdm-menu-item-danger:hover,.dsh-sdm-menu-item-danger:focus-visible{background:var(--dsw-alias-interactive-bg-hover-danger)}
.dsh-sdm-menu-item:disabled{opacity:.55;cursor:not-allowed;background:transparent;color:var(--dsw-alias-label-secondary)}
.dsh-sdm-menu-icon{display:inline-flex;flex:none;width:14px;height:14px;align-items:center;justify-content:center;color:var(--dsw-alias-menu-icon)}
.dsh-sdm-menu-item-danger .dsh-sdm-menu-icon{color:var(--dsw-alias-state-error-primary)}
.dsh-sdm-menu-item:disabled .dsh-sdm-menu-icon{color:var(--dsw-alias-label-secondary)}
.dsh-sdm-menu-label{min-width:0;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-sdm-menu-separator{height:0.5px;margin:3px 2px;background:var(--dsw-alias-border-l2)}
.dsh-sdm-checkbox{width:14px;height:14px;margin:0 6px 0 0;flex:none;accent-color:#3b82f6;cursor:pointer;border-radius:3px;vertical-align:middle}
.dsh-sdm-checkbox:disabled{opacity:.55;cursor:not-allowed}
[data-dsh-sdm-has-native="1"]{width:auto!important;min-width:32px;justify-content:flex-start!important;gap:2px}
[data-dsh-sdm-selected="1"]{background:rgba(59,130,246,0.12)!important}
[data-dsh-sdm-target="1"]{cursor:pointer;user-select:none;display:flex!important;align-items:center!important}
[data-dsh-sdm-target="1"]>span:first-child{display:inline-flex!important;align-items:center!important}
.dsh-sdm-inline-bar{display:flex;align-items:center;justify-content:space-between;height:32px;box-sizing:border-box;padding:0 8px;margin:4px 6px;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,0.08));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,0.16));border-radius:6px;font-size:12px;line-height:1;color:var(--dsw-alias-label-primary);position:sticky;top:0;z-index:10;backdrop-filter:blur(8px)}
.dsh-sdm-inline-left{display:flex;align-items:center;gap:6px;min-width:0}
.dsh-sdm-inline-count{font-size:11.5px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsh-sdm-inline-right{display:flex;align-items:center;gap:4px}
.dsh-sdm-inline-btn{height:22px;padding:0 8px;border-radius:4px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,0.18));background:transparent;color:var(--dsw-alias-label-primary);font-size:11.5px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.dsh-sdm-inline-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dsh-sdm-inline-btn:disabled{opacity:.4;cursor:not-allowed}
.dsh-sdm-inline-btn-danger{color:var(--dsw-alias-state-error-primary,#dc2626);border-color:rgba(220,38,38,0.25);background:rgba(220,38,38,0.08)}
.dsh-sdm-inline-btn-danger:hover:not(:disabled){background:rgba(220,38,38,0.18);border-color:#dc2626}
.dsh-sdm-modal-root{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:24px;pointer-events:auto}
.dsh-sdm-modal-mask{position:absolute;inset:0;background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur)}
.dsh-sdm-modal{position:relative;z-index:1;width:min(420px,100%);box-sizing:border-box;display:flex;flex-direction:column;gap:20px;padding:0 0 24px;border-radius:var(--dsw-radius-panel);background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent);color:var(--dsw-alias-label-primary)}
.dsh-sdm-modal-header{padding:22px 14px 12px 24px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.dsh-sdm-modal-title{margin:0;font-size:16px;line-height:24px;font-weight:500;overflow-wrap:anywhere}
.dsh-sdm-modal-close{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;border:0;border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer}
.dsh-sdm-modal-close:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsh-sdm-modal-close:disabled{opacity:.4;cursor:not-allowed}
.dsh-sdm-modal-body{padding:0 24px;font-size:14px;line-height:22px;display:flex;flex-direction:column;gap:12px}
.dsh-sdm-modal-desc{margin:0;overflow-wrap:anywhere}
.dsh-sdm-modal-current{margin:0;color:var(--dsw-alias-state-warning-primary,var(--dsw-alias-label-secondary));overflow-wrap:anywhere}
.dsh-sdm-modal-error{margin:0;color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}
.dsh-sdm-modal-status{margin:0;color:var(--dsw-alias-label-secondary)}
.dsh-sdm-modal-footer{padding:0 24px;display:flex;justify-content:flex-end;gap:8px}
.dsh-sdm-modal-button{height:36px;padding:0 14px;border:0.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-md);background:transparent;color:inherit;font-size:14px;cursor:pointer;box-sizing:border-box}
.dsh-sdm-modal-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dsh-sdm-modal-button:disabled{opacity:.4;cursor:not-allowed}
.dsh-sdm-modal-button-danger{color:var(--dsw-alias-state-error-primary)}
.dsh-sdm-modal-button-danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}
`

    function TrashIcon() {
      return h('svg', {
        width: 14,
        height: 14,
        viewBox: '0 0 16 16',
        'aria-hidden': 'true',
        focusable: 'false',
      }, h('g', {
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.4,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
      },
      h('path', { d: 'M2.6 4.4h10.8' }),
      h('path', { d: 'M6.1 4.4l.5-2h2.8l.5 2' }),
      h('path', { d: 'M4.1 4.4l.6 8.7a1.4 1.4 0 0 0 1.4 1.3h3.8a1.4 1.4 0 0 0 1.4-1.3l.6-8.7' }),
      h('path', { d: 'M6.8 7.3v4.4M9.2 7.3v4.4' })))
    }

    function CloseIcon() {
      return h('svg', {
        width: 14,
        height: 14,
        viewBox: '0 0 16 16',
        'aria-hidden': 'true',
        focusable: 'false',
      }, h('path', {
        d: 'M3.4 3.4l9.2 9.2M12.6 3.4L3.4 12.6',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.5,
        strokeLinecap: 'round',
      }))
    }

    function useControllerState(controller) {
      if (typeof useSyncExternalStore === 'function') {
        return useSyncExternalStore(controller.subscribe, controller.getSnapshot)
      }
      const [snapshot, setSnapshot] = React.useState(() => controller.getSnapshot())
      React.useEffect(() => controller.subscribe(() => setSnapshot(controller.getSnapshot())), [controller])
      return snapshot
    }

    function createController({ sessions, workspaces, tr }) {
      let state = {
        mode: 'off',
        workspaceId: null,
        workspaceTitle: '',
        items: [],
        selected: new Set(),
        modal: null,
        busy: false,
        error: null,
        version: 0,
      }
      let dom = null
      const listeners = new Set()

      function subscribe(listener) {
        if (typeof listener !== 'function') return () => {}
        listeners.add(listener)
        return () => listeners.delete(listener)
      }

      function getSnapshot() {
        return state
      }

      function publish(patch) {
        state = { ...state, ...patch, version: state.version + 1 }
        for (const listener of Array.from(listeners)) {
          try {
            listener()
          } catch (error) {
            console.warn('[dsh-session-delete-manager] listener failed:', error)
          }
        }
      }

      function sessionSnapshot() {
        try {
          return sessions?.list?.getSnapshot?.() || { byId: {} }
        } catch {
          return { byId: {} }
        }
      }

      function workspaceSnapshot() {
        try {
          return workspaces?.list?.getSnapshot?.() || { items: [], archivedSessionIds: [] }
        } catch {
          return { items: [], archivedSessionIds: [] }
        }
      }

      function isCurrent(id) {
        const summary = sessionSnapshot().byId?.[id]
        return (summary?.retainedBy?.mainView ?? 0) > 0
      }

      function computeItems(workspaceId) {
        const snapshot = workspaceSnapshot()
        const workspace = Array.isArray(snapshot.items)
          ? snapshot.items.find((item) => item?.workspaceId === workspaceId)
          : undefined
        if (!workspace) return []
        const byId = sessionSnapshot().byId || {}
        const archived = new Set(Array.isArray(snapshot.archivedSessionIds) ? snapshot.archivedSessionIds : [])
        const items = []
        for (const id of Array.isArray(workspace.sessionIds) ? workspace.sessionIds : []) {
          const summary = byId[id]
          if (!summary || summary.blank === true || summary.origin === 'subagent' || archived.has(id)) continue
          items.push({
            id,
            title: summary.displayTitle || summary.title || id,
            running: summary.running === true,
            updatedAt: Number(summary.updatedAt) || 0,
          })
        }
        items.sort((left, right) => right.updatedAt - left.updatedAt)
        return items.map((item) => ({ id: item.id, title: item.title, running: item.running }))
      }

      function syncCheckboxes() {
        try {
          dom?.syncRows()
        } catch (error) {
          console.warn('[dsh-session-delete-manager] checkbox sync failed:', error)
        }
      }

      function startBatch(workspaceId) {
        if (state.mode !== 'off') return
        const snapshot = workspaceSnapshot()
        const workspace = Array.isArray(snapshot.items)
          ? snapshot.items.find((item) => item?.workspaceId === workspaceId)
          : undefined
        if (!workspace) return
        const items = computeItems(workspaceId)
        publish({
          mode: 'batch',
          workspaceId,
          workspaceTitle: workspace.title || '',
          items,
          selected: new Set(),
          modal: null,
          error: null,
        })
        try {
          dom?.onBatchStart(workspaceId)
        } catch (error) {
          console.warn('[dsh-session-delete-manager] batch start rendering failed:', error)
        }
        syncCheckboxes()
      }

      function stopBatch() {
        const wasActive = state.mode === 'batch'
        publish({
          mode: 'off',
          workspaceId: null,
          workspaceTitle: '',
          items: [],
          selected: new Set(),
          modal: null,
          error: null,
          busy: false,
        })
        if (wasActive) {
          try {
            dom?.onBatchStop()
          } catch (error) {
            console.warn('[dsh-session-delete-manager] batch cleanup failed:', error)
          }
        }
      }

      function refresh() {
        if (state.mode !== 'batch') return
        const snapshot = workspaceSnapshot()
        const workspace = Array.isArray(snapshot.items)
          ? snapshot.items.find((item) => item?.workspaceId === state.workspaceId)
          : undefined
        if (!workspace) {
          stopBatch()
          return
        }
        const items = computeItems(state.workspaceId)
        const byId = new Map(items.map((item) => [item.id, item]))
        const selected = new Set()
        for (const id of state.selected) {
          const item = byId.get(id)
          if (item && !item.running) selected.add(id)
        }
        let modal = state.modal
        if (modal !== null) {
          const ids = []
          const titles = []
          modal.ids.forEach((id, index) => {
            if (!byId.has(id)) return
            ids.push(id)
            titles.push(modal.titles[index] || tr('untitled'))
          })
          if (ids.length === 0) modal = null
          else if (ids.length !== modal.ids.length) {
            modal = {
              ...modal,
              ids,
              titles,
              count: ids.length,
              current: ids.some((id) => isCurrent(id)),
            }
          }
        }
        publish({ items, selected, modal })
        syncCheckboxes()
      }

      function toggle(id) {
        if (state.mode !== 'batch' || state.busy) return
        const item = state.items.find((candidate) => candidate.id === id)
        if (!item || item.running) return
        const selected = new Set(state.selected)
        if (selected.has(id)) selected.delete(id)
        else selected.add(id)
        publish({ selected })
        syncCheckboxes()
      }

      function selectAll() {
        if (state.mode !== 'batch' || state.busy) return
        const selectable = state.items.filter((item) => !item.running)
        const selected = new Set()
        if (state.selected.size !== selectable.length) {
          for (const item of selectable) selected.add(item.id)
        }
        publish({ selected })
        syncCheckboxes()
      }

      function openSingle(id, title) {
        if (state.mode === 'batch' || state.busy) return
        const status = sessionState(id)
        if (status.running || status.archived || status.subagent || status.blank) return
        const summary = sessionSnapshot().byId?.[id]
        if (!summary) return
        publish({
          modal: {
            kind: 'single',
            ids: [id],
            titles: [title || tr('untitled')],
            current: isCurrent(id),
            count: 1,
          },
          error: null,
        })
      }

      function openBatchConfirm() {
        if (state.mode !== 'batch' || state.busy || state.selected.size === 0) return
        const ids = state.items.filter((item) => state.selected.has(item.id)).map((item) => item.id)
        if (ids.length === 0) return
        const titles = ids.map((id) => state.items.find((item) => item.id === id)?.title || tr('untitled'))
        publish({
          modal: {
            kind: 'batch',
            ids,
            titles,
            current: ids.some((id) => isCurrent(id)),
            count: ids.length,
          },
          error: null,
        })
      }

      function closeModal() {
        if (state.busy) return
        if (state.modal === null && state.error === null) return
        publish({ modal: null, error: null })
      }

      function sessionState(id) {
        const summary = sessionSnapshot().byId?.[id]
        let archived = false
        try {
          const list = workspaceSnapshot().archivedSessionIds
          archived = Array.isArray(list) && list.includes(id)
        } catch {
          archived = false
        }
        const item = state.items.find((candidate) => candidate.id === id)
        return {
          running: item ? item.running : summary?.running === true,
          archived,
          subagent: summary?.origin === 'subagent',
          blank: summary?.blank === true,
          batch: state.mode === 'batch',
        }
      }

      function localizeError(code, detail, activity) {
        const keys = {
          'invalid-id': 'error.invalid-id',
          running: 'error.running',
          active: 'error.active',
          unknown: 'error.unknown',
          archived: 'error.archived',
          'root-missing': 'error.rootMissing',
          unsafe: 'error.unsafe',
          ambiguous: 'error.ambiguous',
          'cache-locked': 'error.cacheLocked',
          'log-locked': 'error.logLocked',
          'archive-failed': 'error.archiveFailed',
          internal: 'error.internal',
          forbidden: 'error.token',
          'token-missing': 'error.token',
          network: 'error.network',
        }
        const key = keys[code]
        if (key !== undefined) {
          let message = tr(key)
          if (code === 'active' && Array.isArray(activity) && activity.length > 0) {
            message += ` ${tr('error.activityKinds', { kinds: activity.map(String).join(', ') })}`
          }
          return message
        }
        const suffix = typeof detail === 'string' && detail !== '' ? detail.slice(0, 200) : ''
        return tr('error.internalDetail', { code: code || 'internal', detail: suffix })
      }

      function failureMessage(failures) {
        if (!Array.isArray(failures) || failures.length === 0) return tr('error.internal')
        const first = failures[0]
        let message = localizeError(first.code, first.detail, first.activity)
        if (failures.some((failure) => failure.restoreFailed === true)) {
          message += ` ${tr('confirm.restoreFailed')}`
        }
        return message
      }

      function forgetSessions(deletedIds, currentDeleted) {
        for (const id of deletedIds) {
          try {
            if (typeof sessions.handleSessionRemoved === 'function') sessions.handleSessionRemoved(id)
          } catch (error) {
            console.warn('[dsh-session-delete-manager] forgetting session failed:', error)
          }
        }
        if (currentDeleted && typeof sessions.clear === 'function') {
          try {
            sessions.clear()
          } catch (error) {
            console.warn('[dsh-session-delete-manager] clearing current session failed:', error)
          }
        }
        try {
          const pending = sessions.refresh?.()
          if (pending && typeof pending.then === 'function') pending.catch(() => {})
        } catch (error) {
          console.warn('[dsh-session-delete-manager] session refresh failed:', error)
        }
      }

      function extractTokenFromHtml(html) {
        if (typeof html !== 'string' || html === '') return null
        const metaPattern = /<meta\b[^>]*>/gi
        let tagMatch
        while ((tagMatch = metaPattern.exec(html)) !== null) {
          const tag = tagMatch[0]
          const nameMatch = /\bname\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag)
          const name = nameMatch?.[1] ?? nameMatch?.[2] ?? nameMatch?.[3]
          if (name !== TOKEN_META) continue
          const contentMatch = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag)
          const content = contentMatch?.[1] ?? contentMatch?.[2] ?? contentMatch?.[3]
          if (typeof content === 'string' && content !== '') return content
        }
        return null
      }

      function tokenValue() {
        try {
          const meta = document.querySelector(TOKEN_SELECTOR)
          const content = meta?.getAttribute('content')
          return typeof content === 'string' && content !== '' ? content : null
        } catch {
          return null
        }
      }

      async function fetchEndpointToken() {
        const abort = new AbortController()
        const timer = setTimeout(() => {
          try {
            abort.abort()
          } catch {
            // The request may already have settled.
          }
        }, TOKEN_REQUEST_TIMEOUT_MS)
        try {
          const response = await fetch(TOKEN_ROUTE, {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { [CLIENT_HEADER]: '1' },
            signal: abort.signal,
          })
          const text = await response.text()
          if (text === '') return null
          try {
            const data = JSON.parse(text)
            if (data && typeof data.token === 'string' && data.token !== '') return data.token
          } catch {
            // An older Host has no token route: the SPA fallback returns HTML.
          }
          return extractTokenFromHtml(text)
        } catch {
          return null
        } finally {
          clearTimeout(timer)
        }
      }

      async function fetchIndexToken() {
        const abort = new AbortController()
        const timer = setTimeout(() => {
          try {
            abort.abort()
          } catch {
            // The request may already have settled.
          }
        }, INDEX_REQUEST_TIMEOUT_MS)
        try {
          const response = await fetch(location.href, {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'no-store',
            signal: abort.signal,
          })
          if (!response.ok) return null
          return extractTokenFromHtml(await response.text())
        } catch {
          return null
        } finally {
          clearTimeout(timer)
        }
      }

      async function resolveToken() {
        const endpointToken = await fetchEndpointToken()
        if (endpointToken !== null) return endpointToken
        const indexToken = await fetchIndexToken()
        if (indexToken !== null) return indexToken
        return tokenValue()
      }

      async function postSessionsChunk(chunk, token) {
        const abort = new AbortController()
        const timer = setTimeout(() => {
          try {
            abort.abort()
          } catch {
            // The request may already have settled.
          }
        }, REQUEST_TIMEOUT_MS)
        try {
          const response = await fetch(ROUTE, {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
              'content-type': 'application/json',
              [TOKEN_HEADER]: token,
            },
            body: JSON.stringify({ sessionIds: chunk }),
            signal: abort.signal,
          })
          const text = await response.text()
          let data = null
          if (text !== '') {
            try {
              data = JSON.parse(text)
            } catch {
              data = null
            }
          }
          return { response, data }
        } finally {
          clearTimeout(timer)
        }
      }

      function failureFor(id, code, result) {
        return {
          id,
          code,
          ...(result && typeof result.detail === 'string' ? { detail: result.detail } : {}),
          ...(result && Array.isArray(result.activity) ? { activity: result.activity } : {}),
          ...(result && result.restoreFailed === true ? { restoreFailed: true } : {}),
        }
      }

      async function deleteSessions(ids) {
        const deleted = new Set()
        const failed = []
        if (!Array.isArray(ids) || ids.length === 0) return { deleted, failed }
        let token = await resolveToken()
        if (token === null) {
          return { deleted, failed: ids.map((id) => failureFor(id, 'token-missing')) }
        }
        const chunks = []
        for (let offset = 0; offset < ids.length; offset += CHUNK_SIZE) {
          chunks.push(ids.slice(offset, offset + CHUNK_SIZE))
        }
        const failFrom = (start, code) => {
          for (let index = start; index < chunks.length; index += 1) {
            for (const id of chunks[index]) failed.push(failureFor(id, code))
          }
          return { deleted, failed }
        }
        let tokenRetried = false
        for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
          const chunk = chunks[chunkIndex]
          let response = null
          let data = null
          try {
            ({ response, data } = await postSessionsChunk(chunk, token))
          } catch (error) {
            return failFrom(chunkIndex, 'network')
          }

          let results = data !== null && Array.isArray(data.results) && data.results.length > 0 ? data.results : null
          if (results === null && response !== null && response.ok === false && response.status === 403 && !tokenRetried) {
            tokenRetried = true
            const refreshedToken = await resolveToken()
            if (refreshedToken !== null) token = refreshedToken
            try {
              ({ response, data } = await postSessionsChunk(chunk, token))
            } catch (error) {
              return failFrom(chunkIndex, 'network')
            }
            results = data !== null && Array.isArray(data.results) && data.results.length > 0 ? data.results : null
          }

          if (results !== null) {
            const byId = new Map()
            for (const result of results) {
              if (result && typeof result.sessionId === 'string' && !byId.has(result.sessionId)) {
                byId.set(result.sessionId, result)
              }
            }
            for (const id of chunk) {
              const result = byId.get(id)
              if (!result) {
                failed.push(failureFor(id, 'internal'))
                continue
              }
              if (result.ok === true) {
                deleted.add(id)
                continue
              }
              failed.push(failureFor(id, typeof result.code === 'string' ? result.code : 'internal', result))
            }
            continue
          }

          if (response !== null && response.ok === false) {
            if (response.status === 403) return failFrom(chunkIndex, 'forbidden')
            const code = data && typeof data.code === 'string' ? data.code : `http-${response.status}`
            return failFrom(chunkIndex, code)
          }

          return failFrom(chunkIndex, 'internal')
        }
        return { deleted, failed }
      }

      async function confirmDelete() {
        if (state.busy) return
        const modal = state.modal
        if (modal === null) return
        const ids = [...modal.ids]
        const currentBefore = new Set(ids.filter((id) => isCurrent(id)))
        publish({ busy: true, error: null })
        syncCheckboxes()

        let outcome
        try {
          outcome = await deleteSessions(ids)
        } catch (error) {
          console.warn('[dsh-session-delete-manager] delete request failed:', error)
          outcome = { deleted: new Set(), failed: ids.map((id) => failureFor(id, 'internal')) }
        }

        const currentDeleted = [...outcome.deleted].some((id) => currentBefore.has(id))
        try {
          forgetSessions(outcome.deleted, currentDeleted)
        } catch (error) {
          console.warn('[dsh-session-delete-manager] list refresh failed:', error)
        }

        const failedIds = new Set(outcome.failed.map((failure) => failure.id))
        if (modal.kind === 'single') {
          if (outcome.failed.length === 0) {
            publish({ modal: null, error: null, busy: false })
            syncCheckboxes()
            return
          }
          const failures = outcome.failed.length > 0
            ? outcome.failed
            : [failureFor(ids[0], 'internal')]
          publish({ busy: false, error: failureMessage(failures) })
          syncCheckboxes()
          return
        }

        if (outcome.failed.length === 0) {
          publish({ busy: false })
          stopBatch()
          return
        }

        const remainingItems = state.items.filter((item) => !outcome.deleted.has(item.id))
        const selected = new Set()
        for (const item of remainingItems) {
          if (failedIds.has(item.id) && !item.running) selected.add(item.id)
        }
        publish({
          items: remainingItems,
          selected,
          modal: null,
          busy: false,
          error: tr('batch.failed', { failed: outcome.failed.length }),
        })
        syncCheckboxes()
        refresh()
      }

      function installDom() {
        if (dom !== null) {
          try {
            dom.cleanup()
          } catch {
            // A stale adapter must not block a fresh install.
          }
          dom = null
        }
        const adapter = createDomEnhancer({
          getState: getSnapshot,
          tr,
          workspaces,
          controller: {
            startBatch,
            toggle,
          },
        })
        dom = adapter
        return () => {
          if (dom === adapter) dom = null
          try {
            adapter.cleanup()
          } catch (error) {
            console.warn('[dsh-session-delete-manager] DOM cleanup failed:', error)
          }
        }
      }

      const controller = {
        subscribe,
        getSnapshot,
        installDom,
        syncCheckboxes,
        sessionState,
        startBatch,
        stopBatch,
        refresh,
        toggle,
        selectAll,
        openSingle,
        openBatchConfirm,
        closeModal,
        confirmDelete,
      }
      return controller
    }

    function createDomEnhancer({ getState, tr, workspaces, controller }) {
      const WORKSPACE_PREFIX = 'workspace:'
      const SESSION_PREFIX = 'session:'
      let disposed = false
      let pendingWorkspace = null
      let menuPoll = null
      let menuDeadline = null
      let rowScanTimer = null
      let menuObserver = null
      let rowObserver = null

      function warn(message, error) {
        try {
          console.warn(`[dsh-session-delete-manager] ${message}`, error ?? '')
        } catch {
          // Diagnostics are best effort.
        }
      }

      function isElement(value) {
        return typeof Element !== 'undefined' && value instanceof Element
      }

      function workspaceList() {
        try {
          return workspaces?.list?.getSnapshot?.() || null
        } catch {
          return null
        }
      }

      function clearPendingMenu() {
        pendingWorkspace = null
        if (menuPoll !== null) {
          clearInterval(menuPoll)
          menuPoll = null
        }
        if (menuDeadline !== null) {
          clearTimeout(menuDeadline)
          menuDeadline = null
        }
      }

      function rectDistance(left, right) {
        const dx = Math.max(left.left - right.right, right.left - left.right, 0)
        const dy = Math.max(left.top - right.bottom, right.top - left.bottom, 0)
        return Math.hypot(dx, dy)
      }

      function closeNativeMenu() {
        try {
          document.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            bubbles: true,
            cancelable: true,
          }))
        } catch (error) {
          warn('menu close failed', error)
        }
      }

      function createChecklistIcon() {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        svg.setAttribute('viewBox', '0 0 16 16')
        svg.setAttribute('width', '14')
        svg.setAttribute('height', '14')
        svg.setAttribute('aria-hidden', 'true')
        svg.setAttribute('focusable', 'false')
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g')
        group.setAttribute('fill', 'none')
        group.setAttribute('stroke', 'currentColor')
        group.setAttribute('stroke-width', '1.4')
        group.setAttribute('stroke-linecap', 'round')
        group.setAttribute('stroke-linejoin', 'round')
        for (const [check, line] of [
          ['M1.8 4.2l1.3 1.3L5.5 3', 'M7.3 4.6h6.4'],
          ['M1.8 8.2l1.3 1.3L5.5 7', 'M7.3 8.6h6.4'],
          ['M1.8 12.2l1.3 1.3L5.5 11', 'M7.3 12.6h6.4'],
        ]) {
          const checkPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          checkPath.setAttribute('d', check)
          const linePath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
          linePath.setAttribute('d', line)
          group.append(checkPath, linePath)
        }
        svg.append(group)
        return svg
      }

      function injectWorkspaceItem(menu, workspaceId) {
        const snapshot = workspaceList()
        if (!snapshot || !Array.isArray(snapshot.items)) return false
        if (!snapshot.items.some((workspace) => workspace?.workspaceId === workspaceId)) return false

        const viewport = menu.querySelector('[role="presentation"]') || menu
        const wrap = document.createElement('div')
        wrap.className = 'dsh-sdm-menu-item-wrap'
        wrap.setAttribute('data-dsh-sdm-menu-item', '1')

        const separator = document.createElement('div')
        separator.className = 'dsh-sdm-menu-separator'
        separator.setAttribute('role', 'separator')

        const button = document.createElement('button')
        button.type = 'button'
        button.className = 'dsh-sdm-menu-item'
        button.setAttribute('role', 'menuitem')
        button.setAttribute('data-dsh-sdm-menu-item', '1')

        const icon = document.createElement('span')
        icon.className = 'dsh-sdm-menu-icon'
        icon.setAttribute('aria-hidden', 'true')
        icon.append(createChecklistIcon())

        const label = document.createElement('span')
        label.className = 'dsh-sdm-menu-label'
        label.textContent = tr('menu.selectSessions')
        button.append(icon, label)

        button.addEventListener('pointerdown', (event) => {
          event.stopPropagation()
        })
        button.addEventListener('click', (event) => {
          event.preventDefault()
          event.stopPropagation()
          closeNativeMenu()
          try {
            controller.startBatch(workspaceId)
          } catch (error) {
            warn('start batch failed', error)
          }
        })

        wrap.append(separator, button)

        const nativeButtons = Array.from(viewport.querySelectorAll('button[role="menuitem"]'))
        const last = nativeButtons[nativeButtons.length - 1]
        let anchor = last || null
        while (anchor !== null && anchor.parentElement !== viewport) anchor = anchor.parentElement
        if (anchor !== null && anchor !== wrap) viewport.insertBefore(wrap, anchor)
        else viewport.append(wrap)
        return true
      }

      function scanMenus() {
        if (disposed || pendingWorkspace === null) return
        if (getState().mode !== 'off') {
          clearPendingMenu()
          return
        }
        const { workspaceId, trigger, existingMenus } = pendingWorkspace
        if (!isElement(trigger) || !trigger.isConnected) {
          clearPendingMenu()
          return
        }
        const triggerRect = trigger.getBoundingClientRect()
        const candidates = []
        for (const menu of document.querySelectorAll('[role="menu"]')) {
          if (!isElement(menu) || existingMenus.has(menu)) continue
          if (menu.querySelector('[data-dsh-sdm-menu-item]')) continue
          const rect = menu.getBoundingClientRect()
          if (rect.width <= 0) continue
          const buttons = menu.querySelectorAll('button[role="menuitem"]')
          if (buttons.length !== 2) continue
          if (rectDistance(rect, triggerRect) > 500) continue
          candidates.push(menu)
        }
        if (candidates.length === 0) return
        if (candidates.length > 1) {
          warn('multiple candidate menus; refusing to inject')
          clearPendingMenu()
          return
        }
        try {
          if (injectWorkspaceItem(candidates[0], workspaceId)) clearPendingMenu()
        } catch (error) {
          warn('menu injection failed', error)
          clearPendingMenu()
        }
      }

      function beginMenuWait(workspaceId, trigger) {
        clearPendingMenu()
        if (getState().mode !== 'off') return
        const snapshot = workspaceList()
        if (!snapshot || !Array.isArray(snapshot.items)) return
        if (!snapshot.items.some((workspace) => workspace?.workspaceId === workspaceId)) return
        pendingWorkspace = {
          workspaceId,
          trigger,
          existingMenus: new Set(document.querySelectorAll('[role="menu"]')),
        }
        menuDeadline = setTimeout(() => {
          menuDeadline = null
          clearPendingMenu()
        }, 1500)
        scanMenus()
        if (pendingWorkspace !== null && menuPoll === null) {
          menuPoll = setInterval(() => {
            if (disposed || pendingWorkspace === null) {
              if (menuPoll !== null) {
                clearInterval(menuPoll)
                menuPoll = null
              }
              return
            }
            scanMenus()
          }, 40)
        }
      }

      function onDocumentClick(event) {
        if (disposed) return
        const target = event.target
        if (!isElement(target)) return
        const row = target.closest('[data-row-key^="workspace:"]')
        if (!row) return
        const button = target.closest('button')
        if (!button) return
        const parent = button.parentElement
        if (!parent || !row.contains(parent)) return
        const buttons = parent.querySelectorAll('button')
        if (buttons.length === 0 || buttons[0] !== button) return
        const key = row.getAttribute('data-row-key') || ''
        if (!key.startsWith(WORKSPACE_PREFIX)) return
        const workspaceId = key.slice(WORKSPACE_PREFIX.length)
        if (workspaceId === '') return
        beginMenuWait(workspaceId, button)
      }

      function cleanupRow(row) {
        for (const checkbox of row.querySelectorAll('input[data-dsh-sdm-checkbox="1"]')) checkbox.remove()
        for (const element of row.querySelectorAll('[data-dsh-sdm-has-native]')) {
          delete element.dataset.dshSdmHasNative
        }
        delete row.dataset.dshSdmTarget
        delete row.dataset.dshSdmSelected
      }

      function cleanupAllRows() {
        for (const checkbox of document.querySelectorAll('input[data-dsh-sdm-checkbox="1"]')) checkbox.remove()
        for (const element of document.querySelectorAll('[data-dsh-sdm-has-native]')) {
          delete element.dataset.dshSdmHasNative
        }
        for (const row of document.querySelectorAll('[data-dsh-sdm-target], [data-dsh-sdm-selected]')) {
          delete row.dataset.dshSdmTarget
          delete row.dataset.dshSdmSelected
        }
        const bar = document.getElementById('dsh-sdm-inline-bar')
        if (bar) bar.remove()
      }

      function removeWorkspaceMenuItems() {
        for (const element of document.querySelectorAll('[data-dsh-sdm-menu-item]')) {
          try {
            element.remove()
          } catch {
            // A detached node is already gone.
          }
        }
      }

      function scanRows() {
        if (disposed) return
        const state = getState()
        if (state.mode !== 'batch') {
          cleanupAllRows()
          return
        }
        try {
          rowObserver?.takeRecords()
        } catch {
          // Taking records is only an optimization against self-triggered scans.
        }
        const items = new Map(state.items.map((item) => [item.id, item]))
        const rows = document.querySelectorAll('[data-row-key^="session:"]')
        for (const row of rows) {
          if (!isElement(row)) continue
          const key = row.getAttribute('data-row-key') || ''
          const id = key.slice(SESSION_PREFIX.length)
          const item = items.get(id)
          if (!item) {
            cleanupRow(row)
            continue
          }
          const slot = row.firstElementChild
          if (!slot || slot.tagName !== 'SPAN') continue
          row.dataset.dshSdmTarget = '1'
          const hasNative = Array.from(slot.childNodes).some((node) => {
            return !(typeof HTMLInputElement !== 'undefined' && node instanceof HTMLInputElement && node.dataset.dshSdmCheckbox === '1')
          })
          if (hasNative) slot.dataset.dshSdmHasNative = '1'
          else delete slot.dataset.dshSdmHasNative

          let checkbox = slot.querySelector('input[data-dsh-sdm-checkbox="1"]')
          if (!checkbox) {
            checkbox = document.createElement('input')
            checkbox.type = 'checkbox'
            checkbox.className = 'dsh-sdm-checkbox'
            checkbox.dataset.dshSdmCheckbox = '1'
            checkbox.addEventListener('click', (event) => event.stopPropagation())
            checkbox.addEventListener('mousedown', (event) => event.stopPropagation())
            checkbox.addEventListener('dblclick', (event) => event.stopPropagation())
            checkbox.addEventListener('change', (event) => {
              const target = event.currentTarget
              const sessionId = target?.dataset?.dshSdmSessionId
              if (typeof sessionId === 'string' && sessionId !== '') controller.toggle(sessionId)
            })
          }

          checkbox.dataset.dshSdmSessionId = id
          if (slot.firstChild !== checkbox) slot.insertBefore(checkbox, slot.firstChild)

          const selected = state.selected.has(id)
          checkbox.checked = selected
          checkbox.disabled = item.running || state.busy
          const label = tr('select.session', { title: item.title })
          if (checkbox.getAttribute('aria-label') !== label) checkbox.setAttribute('aria-label', label)
          if (item.running) checkbox.title = tr('menu.running')
          else checkbox.removeAttribute('title')
          if (selected) row.dataset.dshSdmSelected = '1'
          else delete row.dataset.dshSdmSelected

          if (!row.dataset.dshSdmClickAttached) {
            row.dataset.dshSdmClickAttached = '1'
            row.addEventListener('click', (event) => {
              if (getState().mode !== 'batch') return
              if (event.target.closest('button, [data-row-action], input[type="checkbox"]')) return
              event.preventDefault()
              event.stopPropagation()
              const rKey = row.getAttribute('data-row-key') || ''
              const rId = rKey.slice(SESSION_PREFIX.length)
              if (rId) controller.toggle(rId)
            }, true)
          }
        }

        if (state.mode === 'batch' && state.workspaceId) {
          const workspaceRow = document.querySelector('[data-row-key="' + WORKSPACE_PREFIX + state.workspaceId + '"]')
          if (workspaceRow) {
            let bar = document.getElementById('dsh-sdm-inline-bar')
            if (!bar) {
              bar = document.createElement('div')
              bar.id = 'dsh-sdm-inline-bar'
              bar.className = 'dsh-sdm-inline-bar'
              bar.setAttribute('role', 'toolbar')
            }
            if (workspaceRow.nextElementSibling !== bar) {
              workspaceRow.after(bar)
            }
            const selectableCount = state.items.filter((item) => !item.running).length
            const allSelected = selectableCount > 0 && state.selected.size === selectableCount

            bar.innerHTML = `
              <div class="dsh-sdm-inline-left">
                <input type="checkbox" class="dsh-sdm-checkbox" ${allSelected ? 'checked' : ''} ${state.busy || selectableCount === 0 ? 'disabled' : ''} title="${allSelected ? tr('batch.deselectAll') : tr('batch.selectAll')}" />
                <span class="dsh-sdm-inline-count">${tr('batch.count', { selected: state.selected.size, total: state.items.length })}</span>
              </div>
              <div class="dsh-sdm-inline-right">
                <button type="button" class="dsh-sdm-inline-btn dsh-sdm-inline-btn-danger" ${state.busy || state.selected.size === 0 ? 'disabled' : ''}>删除(${state.selected.size})</button>
                <button type="button" class="dsh-sdm-inline-btn" ${state.busy ? 'disabled' : ''}>${tr('batch.cancel')}</button>
              </div>
            `
            const selectAllBox = bar.querySelector('input[type="checkbox"]')
            if (selectAllBox) selectAllBox.onchange = () => controller.selectAll()
            const deleteBtn = bar.querySelector('.dsh-sdm-inline-btn-danger')
            if (deleteBtn) deleteBtn.onclick = () => controller.openBatchConfirm()
            const cancelBtn = bar.querySelector('.dsh-sdm-inline-btn:not(.dsh-sdm-inline-btn-danger)')
            if (cancelBtn) cancelBtn.onclick = () => controller.stopBatch()
          }
        }
      }

      function syncRows() {
        if (rowScanTimer !== null) {
          clearTimeout(rowScanTimer)
          rowScanTimer = null
        }
        scanRows()
      }

      function scheduleRowScan() {
        if (rowScanTimer !== null) return
        rowScanTimer = setTimeout(() => {
          rowScanTimer = null
          if (!disposed) scanRows()
        }, 50)
      }

      function expandWorkspace(workspaceId) {
        setTimeout(() => {
          if (disposed) return
          const targetKey = WORKSPACE_PREFIX + workspaceId
          const rows = document.querySelectorAll('[data-row-key^="workspace:"]')
          for (const row of rows) {
            if (row.getAttribute('data-row-key') !== targetKey) continue
            if (row.getAttribute('aria-expanded') === 'false') {
              try {
                row.click()
              } catch (error) {
                warn('workspace expansion failed', error)
              }
            }
            return
          }
        }, 0)
      }

      function onBatchStart(workspaceId) {
        expandWorkspace(workspaceId)
        syncRows()
        scheduleRowScan()
      }

      function onBatchStop() {
        cleanupAllRows()
        removeWorkspaceMenuItems()
        clearPendingMenu()
        if (rowScanTimer !== null) {
          clearTimeout(rowScanTimer)
          rowScanTimer = null
        }
      }

      function cleanup() {
        disposed = true
        document.removeEventListener('click', onDocumentClick, true)
        try {
          menuObserver?.disconnect()
        } catch {}
        try {
          rowObserver?.disconnect()
        } catch {}
        menuObserver = null
        rowObserver = null
        clearPendingMenu()
        if (rowScanTimer !== null) {
          clearTimeout(rowScanTimer)
          rowScanTimer = null
        }
        cleanupAllRows()
        removeWorkspaceMenuItems()
      }

      document.addEventListener('click', onDocumentClick, true)
      const observationRoot = document.body || document.documentElement
      if (observationRoot) {
        menuObserver = new MutationObserver(() => {
          if (!disposed && pendingWorkspace !== null) scanMenus()
        })
        menuObserver.observe(observationRoot, { childList: true, subtree: true })
        rowObserver = new MutationObserver(() => {
          if (!disposed && getState().mode === 'batch') scheduleRowScan()
        })
        rowObserver.observe(observationRoot, { childList: true, subtree: true })
      }

      return { syncRows, onBatchStart, onBatchStop, cleanup }
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-session-delete-manager: dictionaries')

      ctx.effect(() => {
        const style = document.createElement('style')
        style.setAttribute('data-plugin-css', NS)
        style.textContent = CSS
        document.head.append(style)
        return () => style.remove()
      }, 'dsh-session-delete-manager: styles')

      const tr = ctx.locale.bind(NS)
      const sessions = ctx.get('sessions')
      const workspaces = ctx.get('workspaces')
      if (!sessions || !workspaces) {
        console.warn('[dsh-session-delete-manager] sessions/workspaces services are unavailable')
        return
      }

      const controller = createController({ sessions, workspaces, tr })
      ctx.effect(() => controller.installDom(), 'dsh-session-delete-manager: DOM enhancement')

      ctx.effect(() => {
        const disposers = []
        try {
          if (typeof sessions.list?.subscribe === 'function') {
            disposers.push(sessions.list.subscribe(() => controller.refresh()))
          }
        } catch (error) {
          console.warn('[dsh-session-delete-manager] session list subscription failed:', error)
        }
        try {
          if (typeof workspaces.list?.subscribe === 'function') {
            disposers.push(workspaces.list.subscribe(() => controller.refresh()))
          }
        } catch (error) {
          console.warn('[dsh-session-delete-manager] workspace list subscription failed:', error)
        }
        return () => {
          for (const dispose of disposers) {
            try {
              dispose()
            } catch {
              // Disposal is best effort.
            }
          }
        }
      }, 'dsh-session-delete-manager: list subscriptions')

      function DeleteMenuItem(props) {
        const translate = typeof props.t === 'function' ? props.t : tr
        const menu = typeof props.useMenuOpenState === 'function' ? props.useMenuOpenState() : [false, () => {}]
        if (typeof props.sessionState !== 'function' || typeof props.requestSingle !== 'function') return null
        const status = props.sessionState(props.sessionId)
        if (status.batch || status.archived || status.subagent || status.blank) return null
        const setMenuOpen = typeof menu[1] === 'function' ? menu[1] : () => {}
        if (status.running) {
          return h('button', {
            type: 'button',
            role: 'menuitem',
            className: 'dsh-sdm-menu-item',
            disabled: true,
            title: translate('menu.running'),
          },
          h('span', { className: 'dsh-sdm-menu-icon' }, h(TrashIcon)),
          h('span', { className: 'dsh-sdm-menu-label' }, translate('menu.deleteSession')))
        }
        return h('div', { className: 'dsh-sdm-menu-item-wrap' },
          h('div', { className: 'dsh-sdm-menu-separator', role: 'separator' }),
          h('button', {
            type: 'button',
            role: 'menuitem',
            className: 'dsh-sdm-menu-item dsh-sdm-menu-item-danger',
            onClick: (event) => {
              event.preventDefault()
              event.stopPropagation()
              setMenuOpen(false)
              props.requestSingle(props.sessionId, props.displayTitle)
            },
          },
          h('span', { className: 'dsh-sdm-menu-icon' }, h(TrashIcon)),
          h('span', { className: 'dsh-sdm-menu-label' }, translate('menu.deleteSession'))))
      }

      function Overlay(props) {
        const t = typeof props.t === 'function' ? props.t : tr
        const state = useControllerState(controller)
        const modal = state.modal
        const cancelRef = React.useRef(null)
        const dialogRef = React.useRef(null)
        const restoreRef = React.useRef(null)
        const open = modal !== null

        React.useEffect(() => {
          if (!open) return undefined
          restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
          const focusTimer = setTimeout(() => {
            try {
              cancelRef.current?.focus()
            } catch {
              // Focus is best effort.
            }
          }, 0)
          const onKeyDown = (event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              if (!controller.getSnapshot().busy) controller.closeModal()
              return
            }
            if (event.key !== 'Tab') return
            const dialog = dialogRef.current
            if (!dialog) return
            const focusable = Array.from(dialog.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'))
              .filter((element) => element instanceof HTMLElement && element.getClientRects().length > 0)
            if (focusable.length === 0) {
              event.preventDefault()
              return
            }
            const first = focusable[0]
            const last = focusable[focusable.length - 1]
            const active = document.activeElement
            if (event.shiftKey && (active === first || !dialog.contains(active))) {
              event.preventDefault()
              last.focus()
            } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
              event.preventDefault()
              first.focus()
            }
          }
          document.addEventListener('keydown', onKeyDown, true)
          return () => {
            clearTimeout(focusTimer)
            document.removeEventListener('keydown', onKeyDown, true)
            const previous = restoreRef.current
            restoreRef.current = null
            if (previous && previous.isConnected) {
              try {
                previous.focus()
              } catch {
                // The previous target may have been removed with the menu.
              }
            }
          }
        }, [open])

        if (modal === null) return null

        const confirmModal = h('div', { className: 'dsh-sdm-modal-root', role: 'presentation' },
            h('div', {
              className: 'dsh-sdm-modal-mask',
              'aria-hidden': 'true',
              onClick: () => {
                if (!state.busy) controller.closeModal()
              },
            }),
            h('div', {
              ref: dialogRef,
              className: 'dsh-sdm-modal',
              role: 'dialog',
              'aria-modal': 'true',
              'aria-labelledby': 'dsh-sdm-modal-title',
              'aria-describedby': 'dsh-sdm-modal-desc',
            },
            h('div', { className: 'dsh-sdm-modal-header' },
              h('h2', { id: 'dsh-sdm-modal-title', className: 'dsh-sdm-modal-title' },
                modal.kind === 'single' ? t('confirm.title.single') : t('confirm.title.batch')),
              h('button', {
                type: 'button',
                className: 'dsh-sdm-modal-close',
                'aria-label': t('confirm.close'),
                disabled: state.busy,
                onClick: () => controller.closeModal(),
              }, h(CloseIcon))),
            h('div', { className: 'dsh-sdm-modal-body' },
              h('p', { id: 'dsh-sdm-modal-desc', className: 'dsh-sdm-modal-desc' },
                modal.kind === 'single'
                  ? t('confirm.desc.single', { title: modal.titles[0] || t('untitled') })
                  : t('confirm.desc.batch', { count: modal.count })),
              modal.current ? h('p', { className: 'dsh-sdm-modal-current' }, t('confirm.current')) : null,
              state.error === null ? null : h('p', { className: 'dsh-sdm-modal-error', role: 'alert' }, state.error),
              state.busy ? h('p', { className: 'dsh-sdm-modal-status', role: 'status' }, t('confirm.busy')) : null),
            h('div', { className: 'dsh-sdm-modal-footer' },
              h('button', {
                type: 'button',
                ref: cancelRef,
                className: 'dsh-sdm-modal-button',
                disabled: state.busy,
                onClick: () => controller.closeModal(),
              }, t('confirm.cancel')),
              h('button', {
                type: 'button',
                className: 'dsh-sdm-modal-button dsh-sdm-modal-button-danger',
                disabled: state.busy,
                onClick: () => {
                  Promise.resolve(controller.confirmDelete()).catch((error) => {
                    console.warn('[dsh-session-delete-manager] confirmation failed:', error)
                  })
                },
              }, t('confirm.delete')))))

        return confirmModal
      }

      try {
        ctx.slots.inject('shell.overlay', () => {
          try {
            return ctx.slots.register({
              name: 'shell.overlay',
              id: 'dsh-session-delete-manager-overlay',
              order: 1000,
              locale: NS,
            }, Overlay)
          } catch (error) {
            console.warn('[dsh-session-delete-manager] overlay registration failed:', error)
            return () => {}
          }
        })
      } catch (error) {
        console.warn('[dsh-session-delete-manager] overlay slot injection failed:', error)
      }

      try {
        ctx.slots.inject('sidebar.workspaces.session.menu.item', () => {
          try {
            return ctx.slots.register({
              name: 'sidebar.workspaces.session.menu.item',
              id: 'dsh-session-delete-manager-delete',
              order: 500,
              locale: NS,
              inject: () => ({
                sessionState: (id) => controller.sessionState(id),
                requestSingle: (id, title) => controller.openSingle(id, title),
              }),
            }, DeleteMenuItem)
          } catch (error) {
            console.warn('[dsh-session-delete-manager] menu item registration failed:', error)
            return () => {}
          }
        })
      } catch (error) {
        console.warn('[dsh-session-delete-manager] menu slot injection failed:', error)
      }
    }

    return { inject: ['slots', 'locale', 'sessions', 'workspaces'], apply }
  },
})
