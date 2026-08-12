#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
/**
 * Runs the per-plugin test suites — both the `index.test.cjs` ones and the vitest ones.
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
 *
 * The same hole existed one layer over. `touch-translation` and `clipboard-history` are real
 * workspace packages that declare a vitest `test` script, and between them they carry 8 test
 * files and 39 passing cases that no job ran either -- this script only knew about
 * `index.test.cjs`, and nothing else in CI runs `pnpm -r test`. Finding tests that pass and are
 * never executed twice in the same area is what makes discovery, not the runner, the thing worth
 * asserting on.
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
  const text = stripAnsi(stdout)
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
    .map(entry => ({
      name: entry.name,
      runner: 'node-test',
      dir: path.join(root, entry.name),
      file: path.join(root, entry.name, 'index.test.cjs'),
    }))
    .filter(suite => fs.existsSync(suite.file))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** True when a plugin's own `test` script hands the work to vitest rather than `node --test`. */
export function declaresVitestSuite(packageJsonText) {
  let parsed
  try {
    parsed = JSON.parse(String(packageJsonText ?? ''))
  }
  catch {
    return false
  }
  return typeof parsed?.scripts?.test === 'string' && /\bvitest\b/.test(parsed.scripts.test)
}

/**
 * Vitest plugins, found by their declared script rather than by a file pattern.
 *
 * The declaration is the contract — `touch-translation`'s script is a bare `vitest`, so the
 * runner below forces `run` rather than calling the script and inheriting watch mode.
 */
export function findVitestSuites(root = pluginsDir) {
  if (!fs.existsSync(root))
    return []
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => ({
      name: entry.name,
      runner: 'vitest',
      dir: path.join(root, entry.name),
      file: path.join(root, entry.name, 'package.json'),
    }))
    .filter((suite) => {
      if (!fs.existsSync(suite.file))
        return false
      return declaresVitestSuite(fs.readFileSync(suite.file, 'utf8'))
    })
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Decides a vitest suite. Same split as above: the exit code is the verdict, the counts report.
 *
 * `status === null` gets its own branch because that is what `spawnSync` returns when the binary
 * was never found — a missing pnpm would otherwise fall through whatever the count check decided.
 */
/**
 * Vitest colours its summary on CI, so the line arrives as
 * `Tests \x1B[22m \x1B[1m\x1B[32m20 passed`. Reading it raw made a passing suite report
 * "exit 0 but no test counts in output" on the runner while it parsed fine locally, where the
 * same command emitted no escapes at all.
 */
export function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return String(text ?? '').replace(/\x1B\[[0-9;]*[a-z]/gi, '')
}

export function classifyVitestRun({ status, stdout }) {
  const text = stripAnsi(stdout)
  if (status === null)
    return { ok: false, pass: null, reason: 'the runner could not be spawned' }
  const match = text.match(/Tests\s+(?:\d+ failed \| )?(\d+) passed/)
  const pass = match ? Number(match[1]) : null

  if (status !== 0)
    return { ok: false, pass, reason: `exited ${status}` }
  if (pass === null)
    return { ok: false, pass, reason: 'exit 0 but no test counts in output' }
  if (pass === 0)
    return { ok: false, pass, reason: 'exit 0 but ran no tests' }
  return { ok: true, pass, reason: null }
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
    {
      name: 'a vitest test script is recognised',
      actual: declaresVitestSuite('{"scripts":{"test":"vitest"}}'),
      expected: true,
    },
    {
      name: 'a vitest run script is recognised',
      actual: declaresVitestSuite('{"scripts":{"test":"vitest run"}}'),
      expected: true,
    },
    {
      name: 'a node --test script is not a vitest suite',
      actual: declaresVitestSuite('{"scripts":{"test":"node --test index.test.cjs"}}'),
      expected: false,
    },
    {
      name: 'a package with no test script is not a vitest suite',
      actual: declaresVitestSuite('{"scripts":{"build":"vitest-ish"}}'),
      expected: false,
    },
    {
      name: 'unparseable package.json is not a vitest suite',
      actual: declaresVitestSuite('{ not json'),
      expected: false,
    },
    {
      name: 'a passing vitest suite passes',
      actual: classifyVitestRun({ status: 0, stdout: ' Tests  19 passed (19)\n' }).ok,
      expected: true,
    },
    {
      name: 'vitest counts are read past a failed segment',
      actual: classifyVitestRun({ status: 1, stdout: ' Tests  1 failed | 18 passed (19)\n' }).pass,
      expected: 18,
    },
    {
      name: 'a failing vitest suite fails',
      actual: classifyVitestRun({ status: 1, stdout: ' Tests  1 failed | 18 passed (19)\n' }).ok,
      expected: false,
    },
    {
      name: 'vitest exit 0 with no counts fails rather than passing blind',
      actual: classifyVitestRun({ status: 0, stdout: 'No test files found' }).ok,
      expected: false,
    },
    {
      name: 'vitest exit 0 having run no tests fails',
      actual: classifyVitestRun({ status: 0, stdout: ' Tests  0 passed (0)\n' }).ok,
      expected: false,
    },
    {
      name: 'a runner that could not be spawned fails',
      actual: classifyVitestRun({ status: null, stdout: '' }).ok,
      expected: false,
    },
    {
      // The exact shape CI produced, which the first version of this parser could not read.
      name: 'the coloured summary CI emits is read',
      actual: classifyVitestRun({
        status: 0,
        stdout: '\x1B[2m      Tests \x1B[22m \x1B[1m\x1B[32m20 passed\x1B[39m\x1B[22m\x1B[90m (20)\x1B[39m',
      }).pass,
      expected: 20,
    },
    {
      name: 'a coloured node --test summary is read too',
      actual: classifySuiteRun({ status: 0, stdout: '\x1B[32mℹ pass 4\x1B[0m\n\x1B[32mℹ fail 0\x1B[0m\n' }).ok,
      expected: true,
    },
    {
      name: 'stripping colour leaves the text alone',
      actual: stripAnsi('\x1B[31mplain\x1B[0m'),
      expected: 'plain',
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

/**
 * Everything after this point runs the suites, so it must not fire on import.
 *
 * check-orphan-tests.mjs asks this module which plugins it would run rather than restating the
 * rule. Restating it would let the two drift in the dangerous direction — a runner that narrowed
 * its discovery while the guard still called those plugins covered.
 */
const invokedDirectly
  = process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (process.argv.includes('--self-test')) {
  process.exit(selfTest() > 0 ? 1 : 0)
}

function main() {
  /**
   * Plugin vite configs import built workspace packages.
   *
   * `touch-translation/vite.config.ts` imports `@talex-touch/unplugin-export-plugin/vite`, whose
   * `dist/` is gitignored, so a fresh checkout cannot load that config at all. Locally it was
   * already built from some earlier run and every suite came back green; the first CI run is what
   * said otherwise. Building it here rather than in the workflow step keeps a direct
   * `node scripts/test-plugins.mjs` behaving the same way as the pipeline.
   */
  const VITEST_PREREQUISITE_PACKAGES = ['@talex-touch/unplugin-export-plugin']

  function buildVitestPrerequisites() {
    for (const name of VITEST_PREREQUISITE_PACKAGES) {
      const build = spawnSync('pnpm', ['-F', name, 'run', 'build'], { encoding: 'utf8' })
      if (build.status !== 0) {
        console.error(
          `\n\x1B[31mCould not build ${name}, which the plugin vite configs import — `
          + `the vitest suites would fail to load their config.\x1B[0m`,
        )
        console.error(stripAnsi(`${build.stdout ?? ''}${build.stderr ?? ''}`).split('\n').slice(-15).join('\n'))
        process.exit(1)
      }
    }
  }

  const nodeTestSuites = findSuites()
  const vitestSuites = findVitestSuites()

  if (discoveryFoundNothing(nodeTestSuites)) {
    console.error(
      '\x1B[31mNo plugins/*/index.test.cjs found — this run would report success without executing a single plugin test.\x1B[0m\n',
    )
    process.exit(1)
  }

  /**
   * The vitest half gets the same treatment, separately.
   *
   * Folding both into one emptiness check would let either half disappear silently as long as the
   * other still found something, which is the shape that hid these suites in the first place.
   */
  if (discoveryFoundNothing(vitestSuites)) {
    console.error(
      '\x1B[31mNo plugins/*/package.json declares a vitest test script — either the packages moved or this half of the run checks nothing.\x1B[0m\n',
    )
    process.exit(1)
  }

  buildVitestPrerequisites()

  const suites = [...nodeTestSuites, ...vitestSuites]

  console.log(
    `\nRunning ${suites.length} plugin suites (${nodeTestSuites.length} node --test, ${vitestSuites.length} vitest)\n`,
  )

  let totalCases = 0
  const failed = []

  for (const suite of suites) {
    const run = suite.runner === 'vitest'
      // `exec` rather than `run test`: touch-translation's script is a bare `vitest`, which without
      // this would sit in watch mode and never return.
      ? spawnSync('pnpm', ['-C', suite.dir, 'exec', 'vitest', 'run'], { encoding: 'utf8' })
      : spawnSync(process.execPath, ['--test', 'index.test.cjs'], { cwd: suite.dir, encoding: 'utf8' })
    const output = `${run.stdout ?? ''}${run.stderr ?? ''}`
    const verdict = suite.runner === 'vitest'
      ? classifyVitestRun({ status: run.status, stdout: output })
      : classifySuiteRun({ status: run.status, stdout: output })
    if (verdict.ok) {
      totalCases += verdict.pass
      console.log(`\x1B[32m  ✓\x1B[0m ${suite.name.padEnd(28)} ${String(verdict.pass).padStart(3)} cases`)
    }
    else {
      failed.push({ suite, verdict, output })
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
}

if (invokedDirectly)
  main()
