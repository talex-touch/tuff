#!/usr/bin/env node
/**
 * Fails when a test file exists that no CI job executes.
 *
 * This is the third time the same defect has been found by hand in a month, each time by someone
 * happening to count: #924 (623 core-app and 180 nexus files in no workflow), #1629 (16 plugin
 * suites, 97 cases), #1670 (8 vitest files in two plugin packages, 39 cases). Every one of them
 * had been passing the whole time, which is why nothing complained — a test that never runs looks
 * exactly like a test that always passes.
 *
 * Finding them takes a directory walk and a set difference. Leaving that to whoever next thinks
 * to look is the actual problem, so this asserts it on every PR.
 *
 * The map below is the whole design. Coverage is declared per directory, and each entry names the
 * workflow and the command that runs it. The script checks the claim rather than trusting it: a
 * declared runner whose workflow no longer contains that command fails, and so does a declared
 * root with no test files under it. A map that can only be edited to add exemptions is a map that
 * stops meaning anything within a month.
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { findSuites, findVitestSuites } from './test-plugins.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const SKIP_DIRECTORIES = new Set([
  '.git',
  '.nuxt',
  '.output',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
])

const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/

/**
 * Directory -> the workflow command that runs its tests.
 *
 * `root` is matched as a path prefix, longest first, so a narrower entry can carve an exception
 * out of a wider one. `workflow` and `command` are verified against the file on disk.
 */
export const COVERAGE = [
  // `${{ matrix.app }}` is GitHub Actions syntax being matched literally, not a JS template.
  /* eslint-disable no-template-curly-in-string */
  {
    root: 'apps/core-app',
    workflow: '.github/workflows/ci.yml',
    command: 'pnpm -C "apps/${{ matrix.app }}" exec vitest run',
  },
  {
    root: 'apps/nexus',
    workflow: '.github/workflows/ci.yml',
    command: 'pnpm -C "apps/${{ matrix.app }}" exec vitest run',
  },
  /* eslint-enable no-template-curly-in-string */
  {
    root: 'packages/test',
    workflow: '.github/workflows/ci.yml',
    command: 'pnpm -C "packages/test" exec vitest run',
  },
  { root: 'packages/utils', workflow: '.github/workflows/package-utils-ci.yml', command: 'test-command: pnpm test' },
  { root: 'packages/tuffex', workflow: '.github/workflows/package-tuffex-ci.yml', command: 'package-name: tuffex' },
  { root: 'packages/tuff-cli', workflow: '.github/workflows/package-tuff-cli-ci.yml', command: 'test-command: pnpm test' },
  { root: 'packages/tuff-cli-core', workflow: '.github/workflows/package-tuff-cli-ci.yml', command: 'test-command: pnpm test' },
  {
    root: 'packages/tuff-intelligence',
    workflow: '.github/workflows/package-tuff-intelligence-ci.yml',
    command: 'package-name: tuff-intelligence',
  },
  {
    root: 'packages/unplugin-export-plugin',
    workflow: '.github/workflows/package-unplugin-ci.yml',
    command: 'test-command: pnpm test',
  },
  // Two Windows-only files under a package otherwise covered by the protocol runs below.
  {
    root: 'packages/tuff-native/everything-resources.test.js',
    workflow: '.github/workflows/windows-everything-production.yml',
    command: 'node --test scripts/everything-selfcheck.test.js everything-resources.test.js',
  },
  {
    root: 'packages/tuff-native/scripts/everything-selfcheck.test.js',
    workflow: '.github/workflows/windows-everything-production.yml',
    command: 'node --test scripts/everything-selfcheck.test.js everything-resources.test.js',
  },
  {
    root: 'packages/tuff-native',
    workflow: '.github/workflows/native-protocol.yml',
    command: 'pnpm -C packages/tuff-native run test:protocol',
  },
  {
    root: 'packages/intelligence-uikit',
    workflow: '.github/workflows/package-intelligence-uikit-ci.yml',
    command: 'test-command: pnpm test',
  },
  {
    root: 'packages/pi-extension-tuff',
    workflow: '.github/workflows/package-pi-extension-ci.yml',
    command: 'test-command: pnpm test',
  },
  { root: 'scripts', workflow: '.github/workflows/ci.yml', command: 'pnpm test:scripts' },
  // Fixtures consumed by scripts/docs.test.mjs, not suites of their own.
  { root: '.trellis/tasks', workflow: '.github/workflows/ci.yml', command: 'mise run docs:verify' },
]

/**
 * Orphans that are known and not fixed here, each with the reason.
 *
 * This list ratchets in both directions. An entry naming a file that is no longer an orphan
 * fails, so it cannot outlive the problem it describes -- an exemption list that can only be
 * appended to is how a gate becomes decoration.
 */
export const KNOWN_ORPHANS = [
  {
    file: 'plugins/touch-music/src/components/music/word-lyric/WordLyricScroller.test.ts',
    reason:
      'The plugin declares no test script and the file cannot run: `Failed to resolve import '
      + '"@vue/test-utils"`, which is not among its two devDependencies. Wiring it in means adding '
      + 'a dependency and a script, which is a lockfile change and not this check\'s business. '
      + 'Untouched since c6de5d63d (2026-07-12).',
    issue: 330,
  },
]

export function partitionKnown(orphans, known = KNOWN_ORPHANS) {
  const knownFiles = new Set(known.map(entry => entry.file))
  return {
    unexpected: orphans.filter(file => !knownFiles.has(file)),
    staleEntries: known.filter(entry => !orphans.includes(entry.file)).map(entry => entry.file),
  }
}

/**
 * Plugin coverage is asked of the runner, not declared.
 *
 * `pnpm test:plugins` reaches a plugin only if it ships `index.test.cjs` or declares a vitest
 * `test` script. A blanket `plugins` entry in COVERAGE would call every plugin covered and hide
 * exactly the case this check is for -- `plugins/touch-music` has one test file, no test script
 * and no `index.test.cjs`, so nothing runs it, and a coarse entry said it was fine.
 */
export function pluginCoverage(root = repoRoot, discover = { findSuites, findVitestSuites }) {
  const pluginsDir = path.join(root, 'plugins')
  const covered = [...discover.findSuites(pluginsDir), ...discover.findVitestSuites(pluginsDir)]
  return covered.map(suite => ({
    root: `plugins/${suite.name}`,
    workflow: '.github/workflows/ci.yml',
    command: 'pnpm test:plugins',
  }))
}

export function findTestFiles(root, skip = SKIP_DIRECTORIES) {
  const found = []
  const walk = (dir) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    }
    catch {
      return
    }
    for (const entry of entries) {
      if (skip.has(entry.name))
        continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory())
        walk(full)
      else if (TEST_FILE.test(entry.name))
        found.push(path.relative(root, full))
    }
  }
  walk(root)
  return found.sort()
}

/** Longest prefix wins, so a single-file entry can override the package it sits in. */
export function coverageFor(file, coverage = COVERAGE) {
  return [...coverage]
    .sort((a, b) => b.root.length - a.root.length)
    .find(entry => file === entry.root || file.startsWith(`${entry.root}/`))
}

export function findOrphans(files, coverage = COVERAGE) {
  return files.filter(file => !coverageFor(file, coverage))
}

/**
 * A declared runner that no longer exists is the failure this map is most likely to develop.
 *
 * Renaming a workflow step would otherwise leave every file under that root marked covered by a
 * command nobody runs — the same silence the whole check exists to break, relocated into the
 * check itself.
 */
export function findBrokenClaims(coverage = COVERAGE, readFile = readWorkflow) {
  const broken = []
  for (const entry of coverage) {
    const text = readFile(entry.workflow)
    if (text === null) {
      broken.push({ ...entry, reason: 'the workflow file does not exist' })
      continue
    }
    if (!text.includes(entry.command))
      broken.push({ ...entry, reason: `the workflow no longer contains \`${entry.command}\`` })
  }
  return broken
}

/** A root that matches nothing means the directory moved and the entry is now decorative. */
export function findEmptyRoots(files, coverage = COVERAGE) {
  return coverage
    .filter(entry => !files.some(file => file === entry.root || file.startsWith(`${entry.root}/`)))
    .map(entry => entry.root)
}

function readWorkflow(relative) {
  try {
    return fs.readFileSync(path.join(repoRoot, relative), 'utf8')
  }
  catch {
    return null
  }
}

function selfTest() {
  const coverage = [
    { root: 'apps/a', workflow: 'w.yml', command: 'run a' },
    { root: 'apps/a/special.test.ts', workflow: 'other.yml', command: 'run special' },
  ]
  const workflows = { 'w.yml': 'steps:\n  run a\n', 'other.yml': 'steps:\n  run special\n' }
  const read = name => workflows[name] ?? null

  const cases = [
    {
      name: 'a file under a covered root is not an orphan',
      actual: findOrphans(['apps/a/one.test.ts'], coverage).length,
      expected: 0,
    },
    {
      name: 'a file outside every root is an orphan',
      actual: findOrphans(['packages/b/one.test.ts'], coverage)[0],
      expected: 'packages/b/one.test.ts',
    },
    {
      name: 'a root prefix does not match a sibling directory with the same start',
      actual: findOrphans(['apps/another/one.test.ts'], coverage)[0],
      expected: 'apps/another/one.test.ts',
    },
    {
      name: 'the longest matching root wins',
      actual: coverageFor('apps/a/special.test.ts', coverage).command,
      expected: 'run special',
    },
    { name: 'an intact claim is not broken', actual: findBrokenClaims(coverage, read).length, expected: 0 },
    {
      name: 'a claim whose workflow is gone fails',
      actual: findBrokenClaims([{ root: 'x', workflow: 'missing.yml', command: 'c' }], read)[0]?.reason,
      expected: 'the workflow file does not exist',
    },
    {
      name: 'a claim whose command is gone fails',
      actual: findBrokenClaims([{ root: 'x', workflow: 'w.yml', command: 'run renamed' }], read).length,
      expected: 1,
    },
    {
      name: 'a root matching no test file fails',
      actual: findEmptyRoots(['apps/a/one.test.ts'], coverage)[0],
      expected: 'apps/a/special.test.ts',
    },
    {
      name: 'a root that does match is not reported empty',
      actual: findEmptyRoots(['apps/a/special.test.ts'], coverage).includes('apps/a'),
      expected: false,
    },
    {
      name: 'a recorded orphan is not reported as unexpected',
      actual: partitionKnown(['a.test.ts'], [{ file: 'a.test.ts', reason: 'r', issue: 1 }]).unexpected.length,
      expected: 0,
    },
    {
      name: 'an unrecorded orphan is reported',
      actual: partitionKnown(['b.test.ts'], [{ file: 'a.test.ts', reason: 'r', issue: 1 }]).unexpected,
      expected: ['b.test.ts'],
    },
    {
      name: 'a record whose file stopped being an orphan fails, so the list cannot only grow',
      actual: partitionKnown([], [{ file: 'a.test.ts', reason: 'r', issue: 1 }]).staleEntries,
      expected: ['a.test.ts'],
    },
    {
      name: 'every recorded orphan carries a reason',
      actual: KNOWN_ORPHANS.every(entry => typeof entry.reason === 'string' && entry.reason.length > 40),
      expected: true,
    },
    {
      name: 'discovery finds the .cjs and .mjs shapes, not just .ts',
      actual: ['a.test.cjs', 'b.test.mjs', 'c.spec.tsx', 'd.ts'].filter(name => TEST_FILE.test(name)).length,
      expected: 3,
    },
  ]

  let failures = 0
  for (const testCase of cases) {
    const ok = JSON.stringify(testCase.actual) === JSON.stringify(testCase.expected)
    if (!ok) {
      failures += 1
      console.log(`\x1B[31mFAIL\x1B[0m  ${testCase.name} — got ${JSON.stringify(testCase.actual)}`)
    }
    else {
      console.log(`\x1B[32m  ok\x1B[0m  ${testCase.name}`)
    }
  }
  console.log(
    failures === 0
      ? `\n\x1B[32mSelf-test passed: ${cases.length} cases.\x1B[0m\n`
      : `\n\x1B[31mSelf-test failed: ${failures}/${cases.length} cases.\x1B[0m\n`,
  )
  return failures
}

if (process.argv.includes('--self-test'))
  process.exit(selfTest() > 0 ? 1 : 0)

const files = findTestFiles(repoRoot)

// Finding nothing is not a pass. A moved repo root or a broken walk would otherwise report a
// clean sweep, which is precisely the failure shape this script exists to detect.
if (files.length === 0) {
  console.error('\n\x1B[31mNo test files found at all — this check read nothing.\x1B[0m\n')
  process.exit(1)
}

const coverage = [...COVERAGE, ...pluginCoverage()]
const orphans = findOrphans(files, coverage)
const { unexpected, staleEntries } = partitionKnown(orphans)
const broken = findBrokenClaims(coverage)
const empty = findEmptyRoots(files, coverage)

if (unexpected.length > 0) {
  console.error(`\n\x1B[31m${unexpected.length} test file(s) no CI job runs:\x1B[0m`)
  for (const file of unexpected)
    console.error(`  ${file}`)
  console.error(
    '\nEither wire them into a workflow and add the root to COVERAGE in this script, or delete them.\n',
  )
}

if (staleEntries.length > 0) {
  console.error('\n\x1B[31mKNOWN_ORPHANS names files that are no longer orphans — remove them:\x1B[0m')
  for (const file of staleEntries)
    console.error(`  ${file}`)
  console.error('')
}

if (broken.length > 0) {
  console.error('\n\x1B[31mCOVERAGE claims a runner that is not there:\x1B[0m')
  for (const entry of broken)
    console.error(`  ${entry.root} — ${entry.reason} (${entry.workflow})`)
  console.error('')
}

if (empty.length > 0) {
  console.error('\n\x1B[31mCOVERAGE roots matching no test file — the directory moved:\x1B[0m')
  for (const root of empty)
    console.error(`  ${root}`)
  console.error('')
}

if (unexpected.length > 0 || staleEntries.length > 0 || broken.length > 0 || empty.length > 0)
  process.exit(1)

console.log(
  `\n\x1B[32m${files.length} test files, every one reachable by a CI job `
  + `(${COVERAGE.length} declared roots, ${coverage.length - COVERAGE.length} plugin suites, `
  + `${KNOWN_ORPHANS.length} recorded orphan).\x1B[0m\n`,
)
