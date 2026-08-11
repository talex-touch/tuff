#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
/**
 * Runs the per-plugin `index.test.cjs` suites.
 *
 * These suites existed and passed long before this script did -- 97 cases across 16 plugins --
 * but nothing executed them. `plugins/*` is in the pnpm workspace, yet most of these directories
 * ship no `package.json`, so they are not workspace packages and `pnpm -r test` never reaches
 * them; the ones that do declare `test: node --test index.test.cjs` are not covered by any CI job
 * either, because the App suites matrix is `[core-app, nexus]` and the only plugin step in CI is
 * `pnpm plugins:validate`, which reads manifests. The archived record for task 297 shows the way
 * they were actually run: `node --test plugins/touch-window-manager/index.test.cjs`, by hand, once.
 *
 * That matters because commit 911fe1c6f cut 2,274 lines from seven plugin suites in
 * `packages/test` while rewriting the plugin preludes those suites covered. The integration
 * baseline went green partly by moving coverage into files no gate reads (#330).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const pluginsDir = path.join(repoRoot, 'plugins')

/**
 * Discovery returning nothing is not a pass.
 *
 * Every assertion this script makes is per suite, so an empty list makes the run check nothing
 * while printing success and exiting 0 -- a renamed directory or a partial checkout is
 * indistinguishable from a clean sweep. Same rule, same reason, as validate-plugins.mjs (#1586).
 */
export function discoveryFoundNothing(suites) {
  return !Array.isArray(suites) || suites.length === 0
}

/**
 * Decides a single suite from what `node --test` actually returned.
 *
 * The exit code is the verdict; the counts are for the report. That split is deliberate. I first
 * wrote the aggregation the other way round, matching `# pass` from the TAP reporter when the
 * default reporter emits `ℹ pass`, and every one of the sixteen green suites was reported as
 * failing with no output to show for it. A parser that cannot read the output must not be the
 * thing that decides the verdict.
 *
 * A zero-test run is still a failure, and that is the case worth having. `node --test` exits 0
 * on a file whose tests have all been deleted or renamed out of collection, so exit-code-alone
 * would hand a green tick to a suite that stopped asserting anything -- which is the exact
 * failure mode that put #330 on the board.
 */
export function classifySuiteRun({ status, stdout }) {
  const text = String(stdout ?? '')
  const read = (label) => {
    const match = text.match(new RegExp(`(?:^|\\s)${label}\\s+(\\d+)`, 'm'))
    return match ? Number(match[1]) : null
  }
  const pass = read('pass')
  const fail = read('fail')

  if (status !== 0)
    return { ok: false, pass, fail, reason: `exited ${status}` }
  if (pass === null)
    return { ok: false, pass, fail, reason: 'exit 0 but no test counts in output' }
  if (pass === 0)
    return { ok: false, pass, fail, reason: 'exit 0 but ran no tests' }
  return { ok: true, pass, fail, reason: null }
}

export function findSuites(root = pluginsDir) {
  if (!fs.existsSync(root))
    return []
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => ({ name: entry.name, file: path.join(root, entry.name, 'index.test.cjs') }))
    .filter(suite => fs.existsSync(suite.file))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** Proves the verdict logic fires, so a refactor cannot quietly turn this gate into a no-op. */
function selfTest() {
  const cases = [
    { name: 'empty discovery is a failure', actual: discoveryFoundNothing([]), expected: true },
    { name: 'non-array discovery is a failure', actual: discoveryFoundNothing(null), expected: true },
    { name: 'a found suite is not empty discovery', actual: discoveryFoundNothing([{ name: 'x' }]), expected: false },
    {
      name: 'a passing suite passes',
      actual: classifySuiteRun({ status: 0, stdout: 'ℹ pass 4\nℹ fail 0\n' }).ok,
      expected: true,
    },
    {
      name: 'the TAP reporter shape is read too',
      actual: classifySuiteRun({ status: 0, stdout: '# pass 4\n# fail 0\n' }).ok,
      expected: true,
    },
    {
      name: 'a non-zero exit fails even when the counts look clean',
      actual: classifySuiteRun({ status: 1, stdout: 'ℹ pass 4\nℹ fail 0\n' }).ok,
      expected: false,
    },
    {
      name: 'exit 0 with unreadable output fails rather than passing blind',
      actual: classifySuiteRun({ status: 0, stdout: 'something else entirely' }).ok,
      expected: false,
    },
    {
      name: 'exit 0 having run no tests fails',
      actual: classifySuiteRun({ status: 0, stdout: 'ℹ pass 0\nℹ fail 0\n' }).ok,
      expected: false,
    },
  ]

  let failures = 0
  for (const testCase of cases) {
    const ok = testCase.actual === testCase.expected
    if (!ok)
      failures += 1
    console.log(`${ok ? '\x1B[32m  ok\x1B[0m' : '\x1B[31mFAIL\x1B[0m'}  ${testCase.name}`)
  }
  console.log(
    failures === 0
      ? `\n\x1B[32mSelf-test passed: ${cases.length} cases.\x1B[0m\n`
      : `\n\x1B[31mSelf-test failed: ${failures}/${cases.length} cases.\x1B[0m\n`,
  )
  return failures
}

if (process.argv.includes('--self-test')) {
  process.exit(selfTest() > 0 ? 1 : 0)
}

const suites = findSuites()

if (discoveryFoundNothing(suites)) {
  console.error(
    '\x1B[31mNo plugins/*/index.test.cjs found — this run would report success without executing a single plugin test.\x1B[0m\n',
  )
  process.exit(1)
}

console.log(`\nRunning ${suites.length} plugin suites\n`)

let totalCases = 0
const failed = []

for (const suite of suites) {
  const run = spawnSync(process.execPath, ['--test', 'index.test.cjs'], {
    cwd: path.dirname(suite.file),
    encoding: 'utf8',
  })
  const verdict = classifySuiteRun({ status: run.status, stdout: `${run.stdout ?? ''}${run.stderr ?? ''}` })
  if (verdict.ok) {
    totalCases += verdict.pass
    console.log(`\x1B[32m  ✓\x1B[0m ${suite.name.padEnd(28)} ${String(verdict.pass).padStart(3)} cases`)
  }
  else {
    failed.push({ suite, verdict, output: run.stdout ?? '' })
    console.log(`\x1B[31m  ✗\x1B[0m ${suite.name.padEnd(28)} ${verdict.reason}`)
  }
}

if (failed.length > 0) {
  for (const entry of failed) {
    console.error(`\n\x1B[31m--- ${entry.suite.name}: ${entry.verdict.reason} ---\x1B[0m`)
    console.error(entry.output.split('\n').slice(-25).join('\n'))
  }
  console.error(`\n\x1B[31m${failed.length}/${suites.length} plugin suites failed.\x1B[0m\n`)
  process.exit(1)
}

console.log(`\n\x1B[32mAll ${suites.length} plugin suites passed — ${totalCases} cases.\x1B[0m\n`)
