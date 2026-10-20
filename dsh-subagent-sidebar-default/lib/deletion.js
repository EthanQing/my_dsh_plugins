// Generated from src/; see THIRD_PARTY_NOTICES.md for MIT attribution.
async function deleteSidebarSubagents(ids) {
  const sessionIds = [...new Set(ids)];
  const deleted = [], failed = [];
  const tokenResponse = await fetch("/dsh-subagent-sidebar-default/token", {
    credentials: "same-origin",
    cache: "no-store",
    headers: { "x-dsh-ssd-client": "1" }
  });
  const token = await tokenResponse.json();
  if (!tokenResponse.ok || typeof token.token !== "string" || !token.token) throw new Error("token-missing");
  for (let offset = 0; offset < sessionIds.length; offset += 200) {
    const chunk = sessionIds.slice(offset, offset + 200);
    try {
      const response = await fetch("/dsh-subagent-sidebar-default", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "x-dsh-subagent-sidebar-default-token": token.token },
        body: JSON.stringify({ sessionIds: chunk })
      });
      const data = await response.json();
      for (const sessionId of chunk) {
        const result = response.ok && Array.isArray(data.results) ? data.results.find((item) => item.sessionId === sessionId) : void 0;
        if (result?.ok === true) deleted.push(sessionId);
        else failed.push({ sessionId, code: result?.code || data.code || "unconfirmed" });
      }
    } catch {
      failed.push(...chunk.map((sessionId) => ({ sessionId, code: "unconfirmed" })));
    }
  }
  return { deleted, failed };
}
export {
  deleteSidebarSubagents
};
