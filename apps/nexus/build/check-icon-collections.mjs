// Guards `i-<collection>-<name>` icon classes against the collections this app
// actually installs.
//
// UnoCSS's presetIcons silently emits nothing for a collection it cannot
// resolve: no build error, no console warning, no failing test — the element
// just renders with no mask image at 0x0, which reads as a blank box or, more
// often, as nothing at all. 78 classes across 41 files named `ri` and 13 named
// `simple-icons`, neither of which was ever a dependency here, and they had
// been drawing nothing for their whole lifetime — including the passkey mark on
// the sign-in page every visitor sees.
//
// The check is deliberately about the COLLECTION, not the icon name: a wrong
// name inside an installed collection is rare and obvious in review, while a
// wrong collection is invisible and systemic.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const appDir = fileURLToPath(new URL('../app', import.meta.url))
const nexusPkg = fileURLToPath(new URL('../package.json', import.meta.url))

const SCAN_EXTENSIONS = new Set(['.vue', '.ts', '.tsx', '.js', '.mjs'])
// `i-carbon-foo`, `i-logos-openai-icon`, … The trailing part may contain
// hyphens, so the collection is only ever the FIRST segment after `i-`.
const ICON_CLASS = /\bi-([a-z0-9]+(?:-[a-z0-9]+)*?)-[a-z0-9][a-z0-9-]*\b/g

function installedCollections() {
  const pkg = JSON.parse(readFileSync(nexusPkg, 'utf8'))
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  return new Set(
    Object.keys(deps)
      .filter(name => name.startsWith('@iconify-json/'))
      .map(name => name.slice('@iconify-json/'.length)),
  )
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.'))
      continue
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory())
      walk(full, out)
    else if (SCAN_EXTENSIONS.has(path.extname(entry)))
      out.push(full)
  }
  return out
}

function main() {
  const collections = installedCollections()
  if (collections.size === 0) {
    console.error('[check-icon-collections] no @iconify-json/* dependency found — the scan would pass vacuously')
    process.exit(1)
  }

  const offenders = new Map()
  for (const file of walk(appDir)) {
    const source = readFileSync(file, 'utf8')
    for (const match of source.matchAll(ICON_CLASS)) {
      const full = match[0]
      // Try progressively longer prefixes so multi-word collections
      // (`simple-icons`, `material-symbols`) resolve before single words do.
      const rest = full.slice(2)
      const segments = rest.split('-')
      let known = false
      for (let take = 1; take < segments.length; take++) {
        if (collections.has(segments.slice(0, take).join('-'))) {
          known = true
          break
        }
      }
      if (known)
        continue
      const key = full
      if (!offenders.has(key))
        offenders.set(key, new Set())
      offenders.get(key).add(path.relative(appDir, file))
    }
  }

  if (offenders.size === 0) {
    console.log(`[check-icon-collections] ok — installed: ${[...collections].sort().join(', ')}`)
    return
  }

  console.error('[check-icon-collections] icon classes from collections this app does not install:')
  console.error(`  installed: ${[...collections].sort().join(', ')}\n`)
  for (const [cls, files] of [...offenders].sort()) {
    const shown = [...files].sort().slice(0, 4)
    const more = files.size > shown.length ? ` (+${files.size - shown.length} more)` : ''
    console.error(`  ${cls}\n    ${shown.join('\n    ')}${more}`)
  }
  console.error('\nThese render as nothing. Remap them onto an installed collection, or add the dependency.')
  process.exit(1)
}

main()
