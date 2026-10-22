import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Development guard for authored UI, not terminal/user content or vendor code.
// It complements the manual UI audit; it cannot infer every string's meaning.
const root = fileURLToPath(new URL('../', import.meta.url))
const plugins = JSON.parse(await readFile(path.join(root, 'plugins.json'), 'utf8'))
const handAuthoredLib = new Set(['dsh-message-edit-retry', 'dsh-session-delete-manager'])
const glyph = /[\p{Extended_Pictographic}\u2190-\u2bff\u00d7\u2022]/gu
const findings = []
let inspected = 0
async function files(dir) {
  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(dir, entry.name)) : path.join(dir, entry.name)))).flat()
  } catch (error) { if (error.code === 'ENOENT') return []; throw error }
}
function decodeEscapes(line) {
  return line.replace(/\\u\{([\da-f]{1,6})\}|\\u([\da-f]{4})/gi, (match, extended, short) => {
    const code = parseInt(extended || short, 16)
    return code <= 0x10ffff ? String.fromCodePoint(code) : match
  }).replace(/&#(?:x([\da-f]+)|(\d+));/gi, (match, hex, decimal) => {
    const code = parseInt(hex || decimal, hex ? 16 : 10)
    return code <= 0x10ffff ? String.fromCodePoint(code) : match
  }).replace(/\\([\da-f]{4,6})(?:\s|(?=['"]))/gi, (match, hex) => {
    const code = parseInt(hex, 16)
    return code <= 0x10ffff ? String.fromCodePoint(code) : match
  })
}
for (const plugin of plugins) {
  const base = path.join(root, plugin.directory)
  const source = path.join(base, handAuthoredLib.has(plugin.name) ? 'lib' : 'src')
  if (!(await stat(source).catch(() => null))?.isDirectory()) throw new Error(`Authored source missing: ${plugin.directory}; run this check in the source checkout.`)
  const candidates = [...await files(source), ...await files(path.join(base, 'locale')), ...await files(path.join(base, 'presets')), path.join(base, 'icon.svg')]
  for (const file of candidates.filter(file => /\.(?:js|ts|css|json|yml|svg)$/.test(file))) {
    inspected++
    const relative = path.relative(root, file).replaceAll('\\', '/')
    const text = await readFile(file, 'utf8')
    for (const [index, raw] of text.split(/\r?\n/).entries()) {
      if (/^\s*(?:\/\/|\/\*|\*|#)/.test(raw)) continue
      let line = decodeEscapes(raw)
      // A mathematical count and a filename rename mapping are data, not icons.
      line = line.replace(/−(?=\$\{)/g, '')
      if (relative === 'dsh-task-diff-review/src/snapshots.js' && /(?:display:|file\.display\s*=)/.test(raw)) line = line.replaceAll('→', '')
      // This regex recognizes truncated incoming prompt text; it renders no icon.
      if (relative.endsWith('/prompt-view.ts') && raw.includes('const PROMPT_CLIPPED_MARK =')) line = line.replaceAll('⋯', '')
      const found = [...line.matchAll(glyph)].map(match => match[0])
      if (found.length) findings.push(`${relative}:${index + 1}: ${[...new Set(found)].join(' ')} — replace icon glyphs with SVG (or document a precise data-only exception).`)
      if (file.endsWith('.svg') && /<text\b/i.test(line)) findings.push(`${relative}:${index + 1}: SVG <text> must not substitute for vector artwork.`)
      if (/(?:children\s*:|textContent\s*=)\s*['"](?:[+<>×✕!?]|\.\.\.)['"]/.test(line)) findings.push(`${relative}:${index + 1}: Possible ASCII character icon; use SVG.`)
    }
  }
}
if (findings.length) { console.error(findings.join('\n')); process.exitCode = 1 }
else console.log(`SVG icon guard passed: ${plugins.length} plugins, ${inspected} authored source/locale/preset/icon files; vendor and user content excluded.`)
