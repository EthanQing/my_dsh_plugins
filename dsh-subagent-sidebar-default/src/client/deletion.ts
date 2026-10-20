// The private Host endpoint reuses the repository's guarded deletion backend.
// It returns per-session results: never mark an entire batch as deleted when
// only part of it succeeded. No deletion is triggered by navigation/tab close.
export async function deleteSidebarSubagents(ids: string[]) {
  const sessionIds = [...new Set(ids)]
  const deleted: string[] = [], failed: { sessionId: string, code: string }[] = []
  const tokenResponse = await fetch('/dsh-subagent-sidebar-default/token', {
    credentials: 'same-origin', cache: 'no-store', headers: { 'x-dsh-ssd-client': '1' },
  })
  const token = await tokenResponse.json()
  if (!tokenResponse.ok || typeof token.token !== 'string' || !token.token) throw new Error('token-missing')
  for (let offset = 0; offset < sessionIds.length; offset += 200) {
    const chunk = sessionIds.slice(offset, offset + 200)
    try {
      const response = await fetch('/dsh-subagent-sidebar-default', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'content-type': 'application/json', 'x-dsh-subagent-sidebar-default-token': token.token },
        body: JSON.stringify({ sessionIds: chunk }),
      })
      const data = await response.json()
      for (const sessionId of chunk) {
        const result = response.ok && Array.isArray(data.results)
          ? data.results.find(item => item.sessionId === sessionId) : undefined
        if (result?.ok === true) deleted.push(sessionId)
        else failed.push({ sessionId, code: result?.code || data.code || 'unconfirmed' })
      }
    } catch {
      // The server may already have committed part of this chunk. Leave its
      // outcome unconfirmed and let the user refresh, rather than auto-retry.
      failed.push(...chunk.map(sessionId => ({ sessionId, code: 'unconfirmed' })))
    }
  }
  return { deleted, failed }
}
