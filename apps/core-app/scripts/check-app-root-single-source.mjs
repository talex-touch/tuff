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

function findViolations(files, readFile = (f) => readFileSync(f, 'utf8')) {
  const violations = []
  for (const file of files) {
    const relative = path.relative(SRC_MAIN, file)
    if (Object.hasOwn(APPROVED_READERS, relative)) continue

    const lines = readFile(file).split('\n')
    lines.forEach((line, index) => {
      if (USER_DATA_READ.test(line) && APP_ROOT_FOLDER.test(line)) {
        violations.push({ file: relative, line: index + 1, text: line.trim() })
      }
    })
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

  console.log('[self-test] ok: flags root reconstruction, exempts the owner and unrelated reads')
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
