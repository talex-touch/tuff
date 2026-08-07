#!/usr/bin/env node
/**
 * Asserts that every directory under plugins/ is reachable by `pnpm lint`.
 *
 * The root lint script reaches plugin code two ways, and a plugin has to be in one of them:
 *
 *   - `pnpm -r --filter "./plugins/*"` runs eslint inside each plugin *workspace*, which
 *     requires the directory to have a package.json.
 *   - a hand-maintained brace list names the package.json-less directories for the root pass.
 *
 * touch-dictation was in neither (#562), so `pnpm lint` reported clean while the Prelude the
 * app actually loads went unchecked. The omission is not interesting on its own — the list is
 * maintained by hand, so the next package.json-less plugin repeats it silently. This turns
 * that silence into a failing check.
 *
 * Read-only. `--self-test` proves the detector fires, because a coverage checker that matches
 * nothing looks exactly like full coverage.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PLUGINS_DIR = path.join(ROOT, 'plugins')

/** Directories that are deliberately not linted, with the reason. Empty today. */
const EXEMPT = {}

/**
 * The brace list inside the root `lint` script: `plugins/{a,b,c}/**`.
 * Returns null when the script no longer has that shape, which is itself worth failing on —
 * silently reading zero names would report every plugin as uncovered.
 */
export function parseBraceList(lintScript) {
  const match = /plugins\/\{([^}]+)\}/.exec(lintScript ?? '')
  if (!match)
    return null
  return match[1].split(',').map(name => name.trim()).filter(Boolean)
}

export function findUncovered(pluginDirs, braceList, hasPackageJson, exempt = EXEMPT) {
  const named = new Set(braceList)
  return pluginDirs
    .filter(dir => !(dir in exempt))
    .filter(dir => !hasPackageJson(dir) && !named.has(dir))
}

/** Names in the brace list that no longer exist — dead entries that hide real drift. */
export function findStaleEntries(pluginDirs, braceList) {
  const present = new Set(pluginDirs)
  return braceList.filter(name => !present.has(name))
}

function listPluginDirs() {
  if (!existsSync(PLUGINS_DIR))
    return []
  return readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort()
}

function readLintScript() {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  return manifest.scripts?.lint
}

function selfTest() {
  const cases = [
    {
      name: 'a package.json-less plugin missing from the brace list is caught',
      dirs: ['touch-dictation', 'touch-image'],
      brace: ['touch-image'],
      hasPkg: dir => dir === 'touch-image',
      expect: ['touch-dictation'],
    },
    {
      name: 'a workspace plugin needs no brace entry',
      dirs: ['touch-music'],
      brace: [],
      hasPkg: () => true,
      expect: [],
    },
    {
      name: 'a named plugin needs no package.json',
      dirs: ['touch-snipaste'],
      brace: ['touch-snipaste'],
      hasPkg: () => false,
      expect: [],
    },
    {
      name: 'an exempt directory is skipped',
      dirs: ['fixtures'],
      brace: [],
      hasPkg: () => false,
      exempt: { fixtures: 'test fixtures, not shipped plugin code' },
      expect: [],
    },
  ]

  let failures = 0
  for (const testCase of cases) {
    const found = findUncovered(testCase.dirs, testCase.brace, testCase.hasPkg, testCase.exempt)
    const ok = JSON.stringify(found) === JSON.stringify(testCase.expect)
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${testCase.name}`)
    if (!ok) {
      failures += 1
      console.log(`     expected ${JSON.stringify(testCase.expect)}, got ${JSON.stringify(found)}`)
    }
  }

  const stale = findStaleEntries(['touch-image'], ['touch-image', 'touch-deleted'])
  const staleOk = JSON.stringify(stale) === JSON.stringify(['touch-deleted'])
  console.log(`${staleOk ? 'ok  ' : 'FAIL'} a brace entry for a deleted plugin is reported`)
  if (!staleOk)
    failures += 1

  const noList = parseBraceList('eslint "src/**/*.ts"')
  console.log(`${noList === null ? 'ok  ' : 'FAIL'} a lint script without a brace list is rejected, not read as empty`)
  if (noList !== null)
    failures += 1

  const real = evaluate()
  console.log(`${real.problems.length === 0 ? 'ok  ' : 'FAIL'} the real tree is covered`)
  if (real.problems.length > 0) {
    failures += 1
    for (const problem of real.problems) console.log(`     ${problem}`)
  }

  return failures
}

function evaluate() {
  const problems = []
  const lintScript = readLintScript()
  const braceList = parseBraceList(lintScript)

  if (braceList === null) {
    problems.push(
      'The root `lint` script no longer contains a `plugins/{…}` brace list. If the plugin '
      + 'lint strategy changed, update this check; do not leave it reading nothing.',
    )
    return { problems, braceList: [], pluginDirs: [] }
  }

  const pluginDirs = listPluginDirs()
  const hasPackageJson = dir => existsSync(path.join(PLUGINS_DIR, dir, 'package.json'))

  for (const dir of findUncovered(pluginDirs, braceList, hasPackageJson)) {
    problems.push(
      `plugins/${dir} has no package.json and is not in the root lint script's brace list, `
      + `so \`pnpm lint\` never sees it. Add it to the list, or give the plugin a package.json.`,
    )
  }

  for (const name of findStaleEntries(pluginDirs, braceList)) {
    problems.push(
      `The brace list names plugins/${name}, which does not exist. Remove the entry.`,
    )
  }

  return { problems, braceList, pluginDirs }
}

if (process.argv.includes('--self-test')) {
  process.exit(selfTest() > 0 ? 1 : 0)
}

const { problems, braceList, pluginDirs } = evaluate()
if (problems.length > 0) {
  console.error('[plugin-lint-coverage] plugin directories `pnpm lint` cannot reach:\n')
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log(
  `[plugin-lint-coverage] ${pluginDirs.length} plugin directories covered `
  + `(${pluginDirs.length - braceList.length} as workspaces, ${braceList.length} by name)`,
)
