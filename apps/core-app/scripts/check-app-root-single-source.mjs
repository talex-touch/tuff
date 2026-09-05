#!/usr/bin/env node
/**
 * Guards the single-source contract for the app data root.
 *
 * `userData` is rewritten twice during startup — once deliberately for startup benchmarking
 * (`precore.ts`, immediately before the root is first resolved) and once by `polyfills.ts` to give
 * Chromium a separate dev profile. Anything that derives the app root from `app.getPath('userData')`
 * therefore gets a different answer depending on when it asks.
 *
 * That is not hypothetical: `getAllowedDownloadRoots` re-derived the root at download time and
 * disagreed with the root the update system had written under, so every update download in a dev
 * build was rejected as `destination-outside-roots`.
 *
 * `resolveRuntimeRootPath` now memoizes, which makes the first resolution authoritative — but only
 * for callers that go through it. A new call site reading `getPath('userData')` and joining a
 * folder name itself would reintroduce the split with nothing to catch it. This scanner is that
 * catch.
 *
 * Read-only. `--self-test` proves the detector fires on a synthetic violation, because a scanner
 * that silently matches nothing looks exactly like a clean repository.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const CORE_APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC_MAIN = path.join(CORE_APP, 'src', 'main')

/**
 * Files allowed to reconstruct the app root, and why.
 * Paths are relative to apps/core-app/src/main.
 */
const APPROVED_READERS = {
  'utils/app-root-path.ts':
    'Owns the resolution and memoizes it; every other caller must come through here.'
}

/**
 * A line that both reads `userData` and names an app-root folder is rebuilding the root by hand.
 *
 * Reading `userData` on its own is fine and common — wallpapers, temp files and host backups all
 * live directly under it. The contract is narrower than that: only the *app data root*
 * (`<userData>/tuff` or `<userData>/tuff-dev`) has to come from one place, because only it is
 * compared against on both sides of the download policy.
 */
const USER_DATA_READ = /\.getPath\(\s*['"`]userData['"`]\s*\)/
const APP_ROOT_FOLDER =
  /(['"`]tuff-dev['"`]|['"`]tuff['"`]|\bAPP_FOLDER_NAME\b|\bDEV_APP_FOLDER_NAME\b|\/tuff\b)/

function listSourceFiles(dir) {
  const found = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) {
      found.push(...listSourceFiles(full))
    } else if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      found.push(full)
    }
  }
  return found
}

/**
 * Folds newlines that sit inside parentheses into spaces, so a call split across lines becomes one
 * logical line. A `path.join(\n  app.getPath('userData'),\n  'tuff'\n)` reconstructs the root just
 * as much as the single-line form, and matching physical lines would miss it entirely.
 *
 * Each logical line keeps the physical line number it started on, so reports still point somewhere
 * useful. Quotes are tracked because a paren inside a string literal must not open a region.
 */
function toLogicalLines(text) {
  const logical = []
  let current = ''
  let startLine = 1
  let physicalLine = 1
  let depth = 0
  let quote = null

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]
    const prev = text[i - 1]

    if (quote) {
      if (ch === quote && prev !== '\\') quote = null
    } else if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch
    } else if (ch === '(') {
      depth += 1
    } else if (ch === ')') {
      depth = Math.max(0, depth - 1)
    }

    if (ch === '\n') {
      physicalLine += 1
      if (depth > 0 && !quote) {
        current += ' '
        continue
      }
      logical.push({ text: current, line: startLine })
      current = ''
      startLine = physicalLine
      continue
    }

    current += ch
  }

  if (current.trim()) logical.push({ text: current, line: startLine })
  return logical
}

function findViolations(files, readFile = (f) => readFileSync(f, 'utf8')) {
  const violations = []
  for (const file of files) {
    const relative = path.relative(SRC_MAIN, file)
    if (Object.hasOwn(APPROVED_READERS, relative)) continue

    for (const { text, line } of toLogicalLines(readFile(file))) {
      if (USER_DATA_READ.test(text) && APP_ROOT_FOLDER.test(text)) {
        violations.push({ file: relative, line, text: text.trim().replace(/\s+/g, ' ') })
      }
    }
  }
  return violations
}

function selfTest() {
  const synthetic = '/synthetic/modules/rogue-root.ts'
  const violations = findViolations(
    [synthetic],
    () => "const root = path.join(app.getPath('userData'), 'tuff')\n"
  )
  if (violations.length !== 1) {
    console.error('[self-test] FAIL: the scanner did not flag a synthetic violation')
    process.exitCode = 1
    return
  }

  // Same reconstruction, split across lines. Matching physical lines misses this.
  const multiline = findViolations(
    ['/synthetic/modules/rogue-root-multiline.ts'],
    () => "const root = path.join(\n  app.getPath('userData'),\n  APP_FOLDER_NAME\n)\n"
  )
  if (multiline.length !== 1) {
    console.error('[self-test] FAIL: the scanner missed a multiline reconstruction')
    process.exitCode = 1
    return
  }
  if (multiline[0].line !== 1) {
    console.error(
      `[self-test] FAIL: multiline violation reported line ${multiline[0].line}, want 1`
    )
    process.exitCode = 1
    return
  }

  const approved = findViolations(
    [path.join(SRC_MAIN, 'utils/app-root-path.ts')],
    () => "return path.join(appLike.getPath('userData'), APP_FOLDER_NAME)\n"
  )
  if (approved.length !== 0) {
    console.error('[self-test] FAIL: the scanner flagged an approved reader')
    process.exitCode = 1
    return
  }

  // Reading userData for something that is not the app root stays legitimate.
  const unrelated = findViolations(
    ['/synthetic/service/temp-file.service.ts'],
    () => "this.baseDir = path.join(app.getPath('userData'), 'temp')\n"
  )
  if (unrelated.length !== 0) {
    console.error('[self-test] FAIL: the scanner flagged an unrelated userData read')
    process.exitCode = 1
    return
  }

  // Two unrelated statements must not be folded together into a false positive.
  const separate = findViolations(
    ['/synthetic/service/two-statements.ts'],
    () => "const tmp = app.getPath('userData')\nconst label = 'tuff'\n"
  )
  if (separate.length !== 0) {
    console.error('[self-test] FAIL: the scanner joined two unrelated statements')
    process.exitCode = 1
    return
  }

  console.log(
    '[self-test] ok: flags same-line and multiline reconstruction, exempts the owner, ' +
      'leaves unrelated reads and separate statements alone'
  )
}

function main() {
  if (process.argv.includes('--self-test')) {
    selfTest()
    return
  }

  const violations = findViolations(listSourceFiles(SRC_MAIN))
  if (violations.length === 0) {
    console.log('app root single-source: ok')
    return
  }

  console.error('app root single-source: violations found\n')
  console.error(
    'These read `userData` directly. Derive the app root through `resolveRuntimeRootPath`\n' +
      'instead — reading `userData` yourself makes the answer depend on when you ask.\n'
  )
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.text}`)
  }
  console.error('\nIf a new reader is legitimate, add it to APPROVED_READERS with a reason.')
  process.exitCode = 1
}

main()
