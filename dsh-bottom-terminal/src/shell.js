export function shellLabel(shell) {
  return /(?:^|[\\/])nu(?:\.exe)?$/i.test(shell.path) ? 'NuShell（nu）' : shell.name
}
