const listeners = new Set()
export const subscribeGitRefresh = listener => { listeners.add(listener); return () => listeners.delete(listener) }
export const refreshGitViews = () => { for (const listener of listeners) listener() }
