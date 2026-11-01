import { existsSync, readFileSync, rmSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseArgs, USAGE, UsageError } from './args'
import {
  describeFailure,
  executeCommand,
  exitCodeFor,
  formatOutcome,
  formatPlanSummary
} from './commands'
import {
  describePlan,
  generatePlan,
  materializeCorpus,
  materializePayload,
  PROFILE_COUNTS,
  validatePlan
} from './deps'
import { RunAbort, RunRefused } from './errors'
import type { RunnerDeps } from './runner-deps'
import type { RunOutcome } from './runner-types'
import { FakeWorld, runnerDeps } from './test-support/fake-run'

let root = ''
const runDir = (): string => path.join(root, 'run-1')
const STRESS_ROOT = '/private/tmp/tuff-stress'

async function exec(
  argv: string[],
  deps: RunnerDeps
): Promise<{ code: number; out: string[]; err: string[] }> {
  const out: string[] = []
  const err: string[] = []
  const code = await executeCommand(parseArgs(argv), deps, {
    out: (line) => void out.push(line),
    err: (line) => void err.push(line)
  })
  return { code, out, err }
}

const runArgs = (): string[] => [
  'run',
  '--profile',
  'smoke',
  '--qps',
  '500',
  '--search-timeout',
  '1000',
  '--run-dir',
  runDir()
]
const realPlanTools = {
  generatePlan,
  validatePlan,
  materializePayload,
  materializeCorpus,
  profileCounts: PROFILE_COUNTS
}

beforeEach(async () => {
  root = await mkdtemp('/private/tmp/tuff-commands-test-')
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('run', () => {
  it('prints the verdict, the gates, the report location and what was cleaned up, and exits 0 on a pass', async () => {
    const { deps } = runnerDeps({ root, world: new FakeWorld() })
    const { code, out, err } = await exec(runArgs(), deps)
    expect(code).toBe(0)
    expect(err).toEqual([])
    expect(out[0]).toBe('run test-run-1: PASS')
    expect(out[1]).toBe('scenarios: 12 planned, 12 with results, 0 not run')
    expect(out).toContain('  PASS    G1 fake gate')
    expect(out).toContain(`report: ${runDir()}/report.md (${runDir()}/report.json)`)
    expect(out).toContain(`run directory: ${runDir()}`)
    expect(out.some((line) => line.startsWith('removed: '))).toBe(true)
    expect(out.some((line) => line.startsWith('continue with'))).toBe(false)
  })

  it('exits 1 when a hard check failed', async () => {
    const { deps } = runnerDeps({ root, world: new FakeWorld({ hide: /new-shot-one/ }) })
    const { code, out } = await exec(runArgs(), deps)
    expect(code).toBe(1)
    expect(out[0]).toBe('run test-run-1: FAIL')
    expect(out).toContain('  FAIL    G1 fake gate')
    expect(out.some((line) => line.startsWith('kept: '))).toBe(true)
  })

  it('exits 3 with the error, the run directory and the resume command when the app breaks', async () => {
    const { deps } = runnerDeps({
      root,
      world: new FakeWorld({ launchError: new Error('electron did not start') })
    })
    const { code, out } = await exec(runArgs(), deps)
    expect(code).toBe(3)
    expect(out[0]).toMatch(/^run test-run-1: ERROR \(internal-error: electron did not start\)$/)
    expect(out).toContain('error: electron did not start')
    expect(out).toContain(`run directory: ${runDir()}`)
    expect(out).toContain('continue with: pnpm search:stress run --resume test-run-1')
  })

  it('exits 2 and says why when the preflight refuses, before anything is written', async () => {
    const { deps } = runnerDeps({
      root,
      world: new FakeWorld(),
      preflight: async () => [
        { id: 'disk', status: 'refuse', title: 'Free disk space', detail: '1 GiB free' }
      ]
    })
    const { code, out, err } = await exec(runArgs(), deps)
    expect(code).toBe(2)
    expect(out).toEqual([])
    expect(err.join('\n')).toContain('Free disk space: 1 GiB free')
    expect(existsSync(runDir())).toBe(false)
  })
})

describe('doctor', () => {
  it('sizes the full profile, prints the checks and exits 0 when a run is allowed', async () => {
    const { deps } = runnerDeps({
      root,
      world: new FakeWorld(),
      preflight: async (input) => [
        { id: 'a', status: 'pass', title: 'Node', detail: 'v26' },
        { id: 'b', status: 'warn', title: 'Sample', detail: 'missing' },
        {
          id: 'c',
          status: 'pass',
          title: `Apps ${input.appCount}`,
          detail: `${input.plannedBytes > 0}`
        }
      ]
    })
    const counts: number[] = []
    const generate = deps.plan.generatePlan
    deps.plan = {
      ...deps.plan,
      generatePlan: (options) => {
        counts.push(options.count)
        return generate(options)
      }
    }
    const { code, out } = await exec(['doctor'], deps)
    expect(code).toBe(0)
    expect(counts).toEqual([10_000])
    expect(out.some((line) => line.startsWith('installed apps: 3 usable'))).toBe(true)
    expect(out).toContain('sizing the full profile (10000 scenarios) ...')
    expect(out).toContain('PASS   Node: v26')
    expect(out).toContain('WARN   Sample: missing')
    expect(out).toContain('PASS   Apps 3: true')
    expect(out).toContain('A run is allowed (1 warning(s)).')
  })

  it('exits 2 when a check refuses', async () => {
    const { deps } = runnerDeps({
      root,
      world: new FakeWorld(),
      preflight: async () => [
        {
          id: 'user',
          status: 'refuse',
          title: 'Your Tuff instance',
          detail: 'pid 92617 is running'
        }
      ]
    })
    const { code, out } = await exec(['doctor', '--embedding', 'on'], deps)
    expect(code).toBe(2)
    expect(out).toContain('REFUSE Your Tuff instance: pid 92617 is running')
    expect(out).toContain('1 check(s) refuse a run.')
  })
})

describe('gen', () => {
  it('generates with the real generator, prints the summary and writes the plan with --out', async () => {
    const { deps } = runnerDeps({ root, world: new FakeWorld() })
    deps.plan = realPlanTools
    const file = path.join(root, 'plan.json')
    const { code, out } = await exec(
      ['gen', '--seed', '3', '--count', '40', '--apps-file', '/x/apps.json', '--out', file],
      deps
    )
    expect(code).toBe(0)
    expect(out[0]).toBe('apps: 2 names from /x/apps.json')
    expect(out.some((line) => line.startsWith('plan: seed 3, 40 scenarios'))).toBe(true)
    expect(out).toContain('distinct: all 40 scenarios differ in id and in dimension values')
    expect(out.some((line) => line.startsWith('classes: '))).toBe(true)
    expect(out.some((line) => /^writes: .* MiB in total/.test(line))).toBe(true)
    expect(out).toContain(`plan written to ${file}`)
    const plan = JSON.parse(readFileSync(file, 'utf8')) as {
      scenarios: unknown[]
      options: { apps: string[] }
    }
    expect(plan.scenarios).toHaveLength(40)
    expect(plan.options.apps).toEqual(['Notes', 'Safari'])
  })

  it('picks the apps installed here when there is no --apps-file', async () => {
    const { deps } = runnerDeps({ root, world: new FakeWorld() })
    deps.plan = realPlanTools
    const { code, out } = await exec(['gen', '--count', '30'], deps)
    expect(code).toBe(0)
    expect(out[0]).toMatch(/^installed apps: 3 usable of 3 bundles/)
  })

  it('exits 3 and names the problem when the generator produced an invalid plan', async () => {
    const { deps } = runnerDeps({ root, world: new FakeWorld() })
    deps.plan = {
      ...realPlanTools,
      validatePlan: () => ['search-file-001 reads a path outside the corpus']
    }
    const { code, err } = await exec(['gen', '--count', '20'], deps)
    expect(code).toBe(3)
    expect(err[0]).toBe(
      'internal error: the generated plan is invalid (1 problem(s)): search-file-001 reads a path outside the corpus'
    )
  })
})

describe('report', () => {
  it('rebuilds report.md and report.json from the files a run left behind', async () => {
    const { deps } = runnerDeps({ root, world: new FakeWorld() })
    await exec(runArgs(), deps)
    rmSync(path.join(runDir(), 'report.md'))
    rmSync(path.join(runDir(), 'report.json'))

    const { code, out } = await exec(['report', runDir()], deps)
    expect(code).toBe(0)
    expect(out[0]).toBe('run test-run-1: finished, verdict PASS')
    expect(out).toContain(`report: ${runDir()}/report.md (${runDir()}/report.json)`)
    expect(readFileSync(path.join(runDir(), 'report.md'), 'utf8')).toContain(
      '# fake report test-run-1'
    )
    expect(existsSync(path.join(runDir(), 'report.json'))).toBe(true)
  })

  it('exits 1 for a run whose verdict is a fail', async () => {
    const { deps } = runnerDeps({ root, world: new FakeWorld({ hide: /new-shot-one/ }) })
    await exec(runArgs(), deps)
    const { code, out } = await exec(['report', runDir()], deps)
    expect(code).toBe(1)
    expect(out[0]).toBe('run test-run-1: finished, verdict FAIL')
  })

  it('exits 2 for a directory that is not a stress run and for a name that cannot be a run id', async () => {
    const { deps } = runnerDeps({ root, world: new FakeWorld() })
    const notARun = await exec(['report', root], deps)
    expect(notARun.code).toBe(2)
    expect(notARun.err[0]).toContain(`cannot report on ${root}`)

    const badName = await exec(['report', '/private/tmp/not a run'], deps)
    expect(badName.code).toBe(2)
    expect(badName.err[0]).toMatch(/^usage error: /)
  })
})

describe('probe and help', () => {
  it('dispatches probe and prints the findings of the eight searches', async () => {
    const id = `cmdtest-${process.pid}-${Date.now()}`
    const { deps } = runnerDeps({ root, world: new FakeWorld(), runId: id })
    try {
      const { code, out } = await exec(['probe'], deps)
      expect(code).toBe(0)
      expect(out.some((line) => line.startsWith('1. installed app "Safari"'))).toBe(true)
      expect(out.some((line) => line.startsWith('8. empty query ""'))).toBe(true)
    } finally {
      await rm(path.join(STRESS_ROOT, `probe-${id}`), { recursive: true, force: true })
    }
  })

  it('prints the usage for help', async () => {
    const { deps } = runnerDeps({ root, world: new FakeWorld() })
    const { code, out } = await exec(['help'], deps)
    expect(code).toBe(0)
    expect(out).toEqual([USAGE])
  })
})

describe('exit codes and messages', () => {
  it('maps refusals and bad usage to 2, a stopped run to 1 and everything else to 3', () => {
    expect(exitCodeFor(new UsageError('bad flag'))).toBe(2)
    expect(exitCodeFor(new RunRefused('no'))).toBe(2)
    expect(exitCodeFor(new RunAbort('interrupted', 'stop'))).toBe(1)
    expect(exitCodeFor(new Error('boom'))).toBe(3)
    expect(exitCodeFor('text')).toBe(3)
  })

  it('lists several refusal reasons one per line and keeps a stack for internal errors', () => {
    expect(describeFailure(new RunRefused('two problems', ['Disk: full', 'Port: taken']))).toEqual([
      'refused:',
      '  - Disk: full',
      '  - Port: taken'
    ])
    expect(describeFailure(new UsageError('--qps must be a number'))[0]).toBe(
      'usage error: --qps must be a number'
    )
    const internal = describeFailure(new Error('boom'))
    expect(internal[0]).toBe('internal error: boom')
    expect(internal.length).toBeGreaterThan(1)
    expect(describeFailure('plain text')).toEqual(['internal error: plain text'])
  })
})

describe('formatting', () => {
  const outcome: RunOutcome = {
    exitCode: 1,
    status: 'aborted',
    runId: 'r-1',
    runDir: '/x/r-1',
    abortReason: 'interrupted',
    abortDetail: 'the run was stopped on request (SIGINT)',
    verdict: 'fail',
    gates: [
      { id: 'G3', title: 'Event loop', status: 'warn', detail: 'p99 120 ms\nover two lines' }
    ],
    reportFiles: { jsonFile: '/x/r-1/report.json', markdownFile: '/x/r-1/report.md' },
    counts: { planned: 100, withResults: 40, notRun: 60 },
    problems: ['the app did not shut down cleanly (sigterm): slow'],
    kept: ['/x/corpus', '/x/r-1/profile'],
    removed: []
  }

  it('shows an aborted run with its reason, its problems and how to continue it', () => {
    expect(formatOutcome(outcome)).toEqual([
      'run r-1: ABORTED (interrupted: the run was stopped on request (SIGINT))',
      'scenarios: 100 planned, 40 with results, 60 not run',
      '  WARN    G3 Event loop - p99 120 ms over two lines',
      'problem: the app did not shut down cleanly (sigterm): slow',
      'report: /x/r-1/report.md (/x/r-1/report.json)',
      'run directory: /x/r-1',
      'kept: /x/corpus, /x/r-1/profile',
      'continue with: pnpm search:stress run --resume r-1'
    ])
  })

  it('summarises a plan, including a shortfall, uncovered values and values that are not all different', () => {
    const description = describePlan(
      generatePlan({ seed: 1, count: 30, apps: ['Notes', 'Safari'] })
    )
    const lines = formatPlanSummary({
      ...description,
      shortfall: { total: 3, short: { 'search-app': 3 }, reflowedInto: { 'search-file': 3 } },
      uncovered: { format: ['heic', 'tiff'] },
      distinct: { ...description.distinct, tuples: description.total - 1 }
    })
    expect(lines[0]).toBe(`plan: seed 1, ${description.total} scenarios`)
    expect(lines).toContain(
      `distinct: NOT all different - ${description.total} ids and ${description.total - 1} dimension tuples among ${description.total} scenarios`
    )
    expect(lines).toContain(
      'shortfall: 3 scenarios could not be built as asked (short: search-app 3; made up by: search-file 3)'
    )
    expect(lines).toContain('uncovered dimension values: format: heic, tiff')
  })
})
