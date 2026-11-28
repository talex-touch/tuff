// Guards MDC block-component fences in apps/tuffex-docs/content/docs/**/*.mdc.
//
// remark-mdc requires a component's closing `:` run to be exactly as long as
// its opening one. Unbalanced fences silently swallow the rest of the file.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const appRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const contentRoot = join(appRoot, 'content', 'docs')

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

const files = walkMdcFiles(contentRoot).sort()
const offenders = files
  .map(file => ({ file: relative(appRoot, file), problems: checkFile(file) }))
  .filter(entry => entry.problems.length > 0)

if (offenders.length) {
  console.error('[tuffex-mdc-fences] unbalanced MDC component fences:')
  for (const { file, problems } of offenders) {
    console.error(`  ${file}`)
    for (const problem of problems)
      console.error(`    ${problem}`)
  }
  process.exit(1)
}

console.log(`[tuffex-mdc-fences] ok — ${files.length} docs checked, 0 unbalanced fences`)
