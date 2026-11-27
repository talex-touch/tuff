// Guards zh/en structural parity and internal link hygiene in
// apps/tuffex-docs/content/docs/**/*.mdc.
//
// Checks:
// 1. Bidirectional `.zh.mdc` <-> `.en.mdc` pairing (no orphan locale pages).
// 2. Identical heading depth sequence (`##`..`######`) outside fenced code blocks.
// 3. Zero unrewritten legacy `/docs/dev/(components|concepts|getting-started/tuffex-composition)`
//    or relative `./*.mdc` / `../*.mdc` links outside fenced code blocks.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const appRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const docsRoot = join(appRoot, 'content', 'docs')

const LEGACY_INTRA_LINK_RE = /\]\(\s*(?:\/(?:en|zh))?\/docs\/dev\/(?:components|concepts|getting-started\/tuffex-composition)(?:[/?#)]|$)/i
const RELATIVE_MDC_LINK_RE = /\]\(\s*\.{1,2}\/[^)\s]+\.mdc?(?:[?#][^)\s]*)?\s*\)/i

function walkMdcFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory())
      found.push(...walkMdcFiles(full))
    else if (entry.endsWith('.mdc'))
      found.push(full)
  }
  return found
}

function inspectFile(file) {
  const shape = []
  const legacyLinks = []
  let insideFence = false
  const lines = readFileSync(file, 'utf8').split('\n')

  lines.forEach((line, index) => {
    if (line.trimStart().startsWith('```')) {
      insideFence = !insideFence
      return
    }
    if (insideFence)
      return

    const heading = /^(#{2,6})\s+\S/.exec(line)
    if (heading)
      shape.push(heading[1].length)

    if (LEGACY_INTRA_LINK_RE.test(line))
      legacyLinks.push(`L${index + 1}: unrewritten legacy /docs/dev/... link`)
    if (RELATIVE_MDC_LINK_RE.test(line))
      legacyLinks.push(`L${index + 1}: unrewritten relative .mdc link`)
  })

  return { shape, legacyLinks }
}

const files = walkMdcFiles(docsRoot).sort()
const fileSet = new Set(files)
const problems = []
let pairCount = 0

for (const file of files) {
  const rel = relative(appRoot, file)
  const { shape, legacyLinks } = inspectFile(file)
  for (const issue of legacyLinks)
    problems.push(`${rel}: ${issue}`)

  if (file.endsWith('.en.mdc')) {
    const zhCounterpart = file.replace(/\.en\.mdc$/, '.zh.mdc')
    if (!fileSet.has(zhCounterpart))
      problems.push(`${rel}: no .zh.mdc counterpart`)
    continue
  }

  if (!file.endsWith('.zh.mdc')) {
    problems.push(`${rel}: expected .en.mdc or .zh.mdc locale suffix`)
    continue
  }

  const enCounterpart = file.replace(/\.zh\.mdc$/, '.en.mdc')
  if (!fileSet.has(enCounterpart)) {
    problems.push(`${rel}: no .en.mdc counterpart`)
    continue
  }

  pairCount += 1
  const enInfo = inspectFile(enCounterpart)
  if (shape.length !== enInfo.shape.length) {
    problems.push(
      `${rel.replace(/\.zh\.mdc$/, '')}: zh has ${shape.length} headings, en has ${enInfo.shape.length}`,
    )
    continue
  }

  const divergesAt = shape.findIndex((depth, index) => depth !== enInfo.shape[index])
  if (divergesAt !== -1) {
    problems.push(
      `${rel.replace(/\.zh\.mdc$/, '')}: heading ${divergesAt + 1} is h${shape[divergesAt]} in zh but h${enInfo.shape[divergesAt]} in en`,
    )
  }
}

if (problems.length) {
  console.error('[tuffex-doc-parity] checks failed:')
  for (const problem of problems)
    console.error(`  ${problem}`)
  process.exit(1)
}

console.log(`[tuffex-doc-parity] ok — ${files.length} docs (${pairCount} zh/en pairs), 0 parity gaps, 0 legacy links`)
