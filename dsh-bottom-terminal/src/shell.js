export const SHELL_PREFERENCE_KEY = 'dsh-bottom-terminal.shell.v1'
export const isNuShell = shell => /(?:^|[\\/])nu(?:\.exe)?$/i.test(shell.path)
export function shellLabel(shell) {
  return isNuShell(shell) ? 'NuShell' : shell.name
}

export function createShellPreferences(terminals, storage) {
  let preference
  try { preference = storage?.getItem(SHELL_PREFERENCE_KEY) || undefined } catch {}
  return {
    async launchShells(sessionId, signal) {
      const choices = await terminals.launchShells(sessionId, signal)
      const rank = shell => isNuShell(shell) ? 0 : /(?:^|[\\/])pwsh(?:\.exe)?$/i.test(shell.path) ? 1 : /git bash/i.test(shell.name) ? 2 : /(?:^|[\\/])powershell(?:\.exe)?$/i.test(shell.path) ? 3 : /(?:^|[\\/])cmd(?:\.exe)?$/i.test(shell.path) ? 4 : 5
      const shells = [...choices.shells].sort((a, b) => rank(a) - rank(b))
      const saved = shells.find(shell => shell.path === preference)
      const selectedShell = saved?.path || shells.find(isNuShell)?.path || choices.selectedShell || shells[0]?.path
      return { ...choices, shells, selectedShell }
    },
    selectShell(path) {
      preference = path
      try { storage?.setItem(SHELL_PREFERENCE_KEY, path) } catch {}
    },
  }
}
