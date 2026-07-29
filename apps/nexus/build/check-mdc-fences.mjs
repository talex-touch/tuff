// Guards MDC block-component fences in content/**/*.mdc.
//
// remark-mdc requires a component's closing `:` run to be exactly as long as
// its opening one. When they differ the container never closes and silently
// swallows the rest of the file as its own children, so every heading and
// paragraph below it disappears from the rendered page. Nothing else catches
// this: eslint, `nuxt typecheck` and vitest all stay green while a doc page
// renders half its content inside a demo box.
//
// The rule is open-depth == close-depth, NOT "always use three colons". A survey
// of all 236 component docs found 130 balanced depth-2 blocks across 22
// components (~19%), paired consistently between the zh and en copies and used
// for demos, props tables and doc tables alike — it is a deliberate convention,
// not legacy. Depth-3 is merely the majority (592 blocks) and depth-4 is used
// when a container nests another. Normalising everything to `:::` would rewrite
// 130 perfectly correct blocks, so this check deliberately says nothing about
// which depth to pick.
//
// A stray closing run is the other half of the same failure: it usually means
// VitePress admonition syntax (`::: warning Title`, with a space) leaked into
// an MDC file. MDC needs the name flush against the colons, so the block is
// parsed as a paragraph and readers see the literal `:::` on the page.
//
// The check is a plain fence-depth stack rather than a real remark-mdc parse so
// that it stays dependency-free. It was validated against remark-mdc 3.11.1 (the
// copy @nuxt/content 3.15.0 resolves) over all 446 content files: both agree on
// exactly the same set of offenders.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = dirname(fileURLToPath(import.meta.url))
const nexusRoot = join(currentDir, '..')
const contentRoot = join(nexusRoot, 'content')

const openPattern = /^(:{2,})([A-Za-z][\w-]*)/
const closePattern = /^(:{2,})\s*$/

function walkMdcFiles(dir) {
  const files = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      files.push(...walkMdcFiles(fullPath))
      continue
    }
    if (entry.endsWith('.mdc'))
      files.push(fullPath)
  }
  return files
}

function checkFile(file) {
  const problems = []
  const open = []
  // Markdown code fences may contain colon runs that are not MDC syntax.
  let inCodeFence = false

  const lines = readFileSync(file, 'utf8').split('\n')
  lines.forEach((line, index) => {
    const lineNumber = index + 1

    if (line.startsWith('```')) {
      inCodeFence = !inCodeFence
      return
    }
    if (inCodeFence)
      return

    const opened = openPattern.exec(line)
    if (opened) {
      open.push({ depth: opened[1].length, name: opened[2], lineNumber })
      return
    }

    const closed = closePattern.exec(line)
    if (!closed)
      return

    const depth = closed[1].length
    const current = open.at(-1)

    if (!current) {
      problems.push(
        `L${lineNumber}: stray closing "${':'.repeat(depth)}" with no open component `
        + `(a "::: warning Title" style admonition? MDC needs the name flush against the colons)`,
      )
      return
    }

    if (current.depth !== depth) {
      open.pop()
      problems.push(
        `L${current.lineNumber}: "${':'.repeat(current.depth)}${current.name}" is closed by `
        + `"${':'.repeat(depth)}" on L${lineNumber} — depths must match, or the component `
        + `swallows the rest of the file`,
      )
      return
    }

    open.pop()
  })

  for (const { depth, name, lineNumber } of open)
    problems.push(`L${lineNumber}: "${':'.repeat(depth)}${name}" is never closed`)

  return problems
}

const offenders = walkMdcFiles(contentRoot)
  .sort()
  .map(file => ({ file: relative(nexusRoot, file), problems: checkFile(file) }))
  .filter(entry => entry.problems.length > 0)

if (offenders.length) {
  console.error('[nexus-mdc-fences] unbalanced MDC component fences:')
  for (const { file, problems } of offenders) {
    console.error(`  ${file}`)
    for (const problem of problems)
      console.error(`    ${problem}`)
  }
  process.exit(1)
}
