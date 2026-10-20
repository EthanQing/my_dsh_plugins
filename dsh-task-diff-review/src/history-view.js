export function createHistoryBrowser(React, read) {
  const { createElement: h, useState, useEffect, useRef } = React
  return function HistoryBrowser({ sessionId, branch, onBranch, selected, onSelect, revision }) {
    const [query, setQuery] = useState(''), [draft, setDraft] = useState(''), [state, setState] = useState(), [error, setError] = useState(''), [loading, setLoading] = useState(false)
    const request = useRef(), current = useRef(), loadMore = useRef()
    const key = JSON.stringify([sessionId, branch, query, revision])
    useEffect(() => {
      let disposed = false
      current.current = undefined; setState(undefined); setError('')
      const load = async (more = false) => {
        if (request.current || (more && !current.current?.hasMore)) return
        const abort = new AbortController(); request.current = abort; setLoading(true)
        const previous = current.current
        try {
          const result = await read('history', { sessionId, branch, query, offset: String(more ? previous.nextOffset : 0), tip: more ? previous.tip : '' }, abort.signal)
          if (disposed) return
          const commits = more ? [...previous.commits, ...result.commits] : result.commits
          // Keep the user's selected commit stable while appending history pages.
          const next = { ...result, commits: [...new Map(commits.map(commit => [commit.hash, commit])).values()] }
          current.current = next; setState(next); setError('')
        } catch (error) { if (!disposed && !abort.signal.aborted) setError(error.message) }
        finally { if (request.current === abort) request.current = undefined; if (!disposed) setLoading(false) }
      }
      loadMore.current = () => load(true)
      void load()
      return () => { disposed = true; request.current?.abort(); request.current = undefined }
    }, [key])
    return h('div', { className: 'dtd-history' },
      h('div', { className: 'dtd-history-controls' }, h('label', null, '历史分支 ', h('select', { value: branch, onChange: event => onBranch(event.target.value) },
        h('option', { value: 'HEAD' }, '当前分支 (HEAD)'), (state?.branches ?? (branch === 'HEAD' ? [] : [branch])).map(name => h('option', { key: name, value: name }, name)))),
      h('form', { onSubmit: event => { event.preventDefault(); setQuery(draft.trim()) } }, h('input', { type: 'search', value: draft, maxLength: 200, placeholder: '搜索 Hash / 提交信息', 'aria-label': '搜索提交', onChange: event => setDraft(event.target.value) }), h('button', { type: 'submit' }, '搜索'))),
      h('div', { className: 'dtd-commit-list', onScroll: event => { const target = event.currentTarget; if (target.scrollHeight - target.scrollTop - target.clientHeight < 50 && !error) void loadMore.current?.() } },
        h('ul', { 'aria-label': '提交历史' }, (state?.commits ?? []).map(commit => h('li', { key: commit.hash }, h('button', { type: 'button', className: `dtd-commit-row ${selected === commit.hash ? 'dtd-selected' : ''}`, title: commit.hash, onClick: () => onSelect(commit.hash) },
          h('span', { className: 'dtd-commit-subject' }, commit.subject || '（无标题）'),
          h('span', { className: 'dtd-commit-meta' }, h('code', null, commit.hash.slice(0, 10)), ` · ${commit.author} · ${new Date(commit.date).toLocaleString()}`))))),
        !loading && !error && state?.commits.length === 0 && h('p', { className: 'dtd-muted' }, '没有匹配的提交'),
        error && h('p', { role: 'alert' }, error),
        loading && h('p', { role: 'status' }, '正在读取提交…'),
        state?.hasMore && h('button', { type: 'button', disabled: loading, onClick: () => loadMore.current?.() }, loading ? '正在加载…' : '加载更多')))
  }
}
