// Generated from src/; see THIRD_PARTY_NOTICES.md for MIT attribution.
const SIDEBAR_CHAT_PREFIX = "dsh-resource://subagentchat/session/";
const validAddress = (address) => address && typeof address.parentSessionId === "string" && address.parentSessionId.length > 0 && typeof address.childSessionId === "string" && address.childSessionId.length > 0 && ["one-shot", "continuable", "unknown"].includes(address.mode);
function sidebarChatAddress(address) {
  if (!validAddress(address)) return null;
  return `${SIDEBAR_CHAT_PREFIX}${encodeURIComponent(address.childSessionId)}?${new URLSearchParams({ parent: address.parentSessionId, mode: address.mode })}`;
}
function canonicalSidebarAddress(value) {
  try {
    const url = new URL(value);
    const parts = url.pathname.split("/").filter(Boolean);
    if (url.protocol !== "dsh-resource:" || url.hostname !== "subagentchat" || url.username || url.password || url.port || url.hash || parts.length !== 2 || parts[0] !== "session") return null;
    return sidebarChatAddress({
      parentSessionId: url.searchParams.get("parent"),
      childSessionId: decodeURIComponent(parts[1]),
      mode: url.searchParams.get("mode")
    });
  } catch {
    return null;
  }
}
function createSidebarNavigation(ctx) {
  const services = () => {
    try {
      const sidebar = ctx.get("sidebarRight");
      const tabs = ctx.get("sidebarRightTabs");
      return typeof sidebar?.openResource === "function" && typeof tabs?.candidates === "function" ? { sidebar, tabs } : null;
    } catch {
      return null;
    }
  };
  const accepted = (tabs, address) => address !== null && tabs.candidates(address).some((candidate) => candidate.kind === "subagentchat");
  const asideAddressOf = (row) => {
    const faces = services();
    if (!faces) return void 0;
    try {
      if (typeof row?.id !== "string" || !row.id) return null;
      const resolved = ctx.sessions?.subagentAddress?.(row.id);
      const address = resolved ?? {
        parentSessionId: row.parentId,
        childSessionId: row.id,
        mode: row.mode
      };
      if (address.childSessionId !== row.id) return null;
      const value = sidebarChatAddress(address);
      return accepted(faces.tabs, value) ? value : null;
    } catch (error) {
      console.warn("[dsh-subagent-sidebar-default] address unavailable", error);
      return null;
    }
  };
  const openAside = (value) => {
    try {
      const faces = services();
      const address = canonicalSidebarAddress(value);
      if (!faces || !accepted(faces.tabs, address)) return false;
      faces.sidebar.openResource(address, {
        kind: "subagentchat",
        preferNewPane: false,
        revealIfOpened: true
      });
      return true;
    } catch (error) {
      console.warn("[dsh-subagent-sidebar-default] sidebar open failed", error);
      return false;
    }
  };
  return {
    asideAddressOf,
    openAside,
    // Both the manager and its active float call this face. No main navigation,
    // view switching, split(), close(), or cancellation is part of opening.
    openDefault: (row) => {
      const address = asideAddressOf(row);
      return typeof address === "string" && openAside(address);
    }
  };
}
export {
  canonicalSidebarAddress,
  createSidebarNavigation,
  sidebarChatAddress
};
