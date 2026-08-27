// Guards zh/en structural parity in content/docs/**/*.mdc.
//
// Every doc ships as a `<slug>.zh.mdc` / `<slug>.en.mdc` pair, and the two are
// meant to be the same document in two languages: same sections, same nesting,
// same order. When a section is added to one copy and not the other, readers of
// the shorter locale silently lose it — nothing fails, the page just renders
// without a chapter that its sibling has. `check:mdc-fences` catches broken
// syntax and `nuxt typecheck` never reads content at all, so this drift is
// invisible until someone reads both copies side by side.
//
// The check compares the *shape* — the sequence of heading depths — not the
// text, because the headings themselves are translated.
//
// The list emptied on 2026-08-27: the dev/api offenders (division-box's
// missing lifecycle chapter, flow-transfer's five missing sections,
// intelligence's missing example) were translated against source, so this is
// now wired into ci.yml as a job_nexus gate. A red run here means a section
// was added to one locale and not the other — write the counterpart, don't
// delete the section.
//
// Headings inside fenced code blocks are skipped: a `# comment` line in a shell
// example is not a section, and the two locales routinely differ there. MDC
// block scalars (`:::TuffCodeBlock` with `code: |`) indent their content, so
// their `##` lines never match the line-anchored pattern either — dev/api/
// intelligence has two such lines and is correctly not counted.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import process from 'node:process'

const nexusRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const docsRoot = join(nexusRoot, 'content', 'docs')

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

/** The sequence of heading depths, which is the part that should match. */
function headingShape(file) {
  const shape = []
  let insideFence = false
  const lines = readFileSync(file, 'utf8').split('\n')
  for (const line of lines) {
    if (line.startsWith('```')) {
      insideFence = !insideFence
      continue
    }
    if (insideFence)
      continue
    const match = /^(#{2,6})\s+\S/.exec(line)
    if (match)
      shape.push(match[1].length)
  }
  return shape
}

const problems = []
for (const file of walkMdcFiles(docsRoot).sort()) {
  if (!file.endsWith('.zh.mdc'))
    continue
  const counterpart = file.replace(/\.zh\.mdc$/, '.en.mdc')
  const zhShape = headingShape(file)
  let enShape
  try {
    enShape = headingShape(counterpart)
  }
  catch {
    problems.push(`${relative(nexusRoot, file)}: no .en.mdc counterpart`)
    continue
  }
  if (zhShape.length !== enShape.length) {
    problems.push(
      `${relative(nexusRoot, file).replace(/\.zh\.mdc$/, '')}: `
      + `zh has ${zhShape.length} headings, en has ${enShape.length}`,
    )
    continue
  }
  const divergesAt = zhShape.findIndex((depth, index) => depth !== enShape[index])
  if (divergesAt !== -1) {
    problems.push(
      `${relative(nexusRoot, file).replace(/\.zh\.mdc$/, '')}: `
      + `heading ${divergesAt + 1} is h${zhShape[divergesAt]} in zh but h${enShape[divergesAt]} in en`,
    )
  }
}

if (problems.length) {
  console.error('[nexus-doc-parity] zh/en docs have diverged:')
  for (const problem of problems)
    console.error(`  ${problem}`)
  process.exit(1)
}
