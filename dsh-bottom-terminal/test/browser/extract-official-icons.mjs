import { readFile, writeFile } from 'node:fs/promises'
// The verified release bundles these SVGs in one const declaration. Split only at
// top-level commas; preserve each selected initializer byte-for-byte.
export async function extractOfficialIcons(sourcePath, outputPath) {
  const source = await readFile(sourcePath, 'utf8')
  const declarations = source.split('\n').filter(line => (line.startsWith('const zM = ') && line.includes('OT =')) || line.startsWith('const au = '))
  if (declarations.length !== 2) throw Error('Verified official icon declarations not found; review release mapping')
  const initializers = new Map()
  for (const declaration of declarations) {
  let start = 6, depth = 0, quote = '', escaped = false
  const consume = end => {
    const text = declaration.slice(start, end).trim()
    const match = text.match(/^(\w+)\s*=\s*([\s\S]+)$/)
    if (match) initializers.set(match[1], match[2])
    start = end + 1
  }
  for (let i = start; i < declaration.length; i++) {
    const c = declaration[i]
    if (quote) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === quote) quote = ''; continue }
    if ('\"\'`'.includes(c)) { quote = c; continue }
    if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) depth--
    else if (!depth && (c === ',' || c === ';')) consume(i)
  }
  }
  const names = ['IconPlusOutlineRegular', 'IconChevronDownOutlineRegular', 'IconChevronUpOutlineRegular', 'IconChevronRightOutlineRegular', 'IconCloseOutlineRegular', 'IconFullscreenOutlineRegular', 'IconCopyOutlineRegular', 'PluginArtworkTerminal']
  const exportLine = source.split('\n').find(line => line.startsWith('const zU = '))
  const mapping = names.map(name => {
    const variable = exportLine?.match(new RegExp(`\\b${name}: (\\w+)`))?.[1]
    if (!variable || !initializers.has(variable)) throw Error(`Missing official component ${name}: ${variable}`)
    return [name, variable]
  })
  const selected = new Map()
  const visit = id => {
    if (selected.has(id)) return
    const value = initializers.get(id)
    if (!value) throw Error(`Missing initializer ${id}`)
    selected.set(id, value)
    // Names inside string literals are paths/class names, never JS dependencies.
    const identifiers = value.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '').match(/\b[A-Za-z_$][\w$]*\b/g) || []
    for (const dependency of identifiers) if (dependency !== id && initializers.has(dependency)) visit(dependency)
  }
  for (const [, id] of mapping) visit(id)
  // Declarations are ordered as in the official bundle (aliases can read earlier constants).
  const lines = [...initializers].filter(([id]) => selected.has(id)).map(([id, value]) => `const ${id} = ${value};`)
  const output = `// TEST GENERATED from verified DSH release; do not edit SVG geometry.\nimport * as u from 'react/jsx-runtime';\nimport * as o from 'react';\n${lines.join('\n')}\nexport { ${mapping.map(([name,id]) => `${id} as ${name}`).join(', ')} };\n`
  await writeFile(outputPath, output)
  return { source: sourcePath, exports: Object.fromEntries(mapping), declarations: [...selected.keys()] }
}
