import { existsSync, readFileSync, rmSync } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildReport } from './deps'
import { DriverError, RunRefused } from './errors'
import { CORPUS_MARKER } from './layout'
import type { StoredMeta } from './run-meta'
import { runRun } from './runner'
import { FakeWorld, runnerDeps, runOptions } from './test-support/fake-run'

let root = ''
const runDir = (): string => path.join(root, 'run-1')
const ownedCorpus = (): string => path.join(root, 'corpus-base', 'test-run-1')
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))
const json = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T
const meta = (): StoredMeta => json<StoredMeta>(path.join(runDir(), 'meta.json'))
const records = (): Array<Record<string, unknown>> =>
  readFileSync(path.join(runDir(), 'results.ndjson'), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Record<string, unknown>)

beforeEach(async () => {
  root = await mkdtemp('/private/tmp/tuff-runner-test-')
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('runRun', () => {
  it('runs a plan end to end, in order, and removes its scratch data after a pass', async () => {
    const world = new FakeWorld()
    const { deps, seen } = runnerDeps({ root, world })
    const outcome = await runRun(runOptions(root), deps)

    expect(outcome).toMatchObject({
      exitCode: 0,
      status: 'pass',
      verdict: 'pass',
      abortReason: null,
      problems: [],
      counts: { planned: 12, withResults: 12, notRun: 0 }
    })
    expect((await readdir(runDir())).sort()).toEqual([
      'db-integrity.json',
      'meta.json',
      'monitor-summary.json',
      'plan.json',
      'report.json',
      'report.md',
      'results.ndjson'
    ])
    expect(world.lifecycle).toEqual(['launch', 'monitor.start', 'monitor.stop', 'shutdown'])
    expect(world.phases).toEqual(['seed', 'steady', 'burst', 'drain'])
    expect(world.marks).toContain('seed:ready')
    expect(world.marks.some((mark) => mark.startsWith('scenario-batch:'))).toBe(true)

    const inputs = seen.reports[0]
    expect(inputs.results).toHaveLength(13)
    expect(inputs.results.every((result) => result.outcome === 'pass')).toBe(true)
    expect(inputs.results.find((result) => result.scenarioId === 'search-file-001')?.phase).toBe(
      'steady'
    )
    expect(inputs.results.find((result) => result.scenarioId === 'create-image-003')?.phase).toBe(
      'burst'
    )
    expect(inputs.notRun).toEqual([])
    expect(inputs.meta.switches).toMatchObject({
      nice: 10,
      embedding: 'off',
      qps: 500,
      appsUsed: 3,
      appsFound: 3,
      segments: 1,
      uncleanSegments: 0,
      seedReady: true
    })
    expect(() => buildReport(inputs)).not.toThrow()

    const lines = records()
    const created = lines.findIndex(
      (line) => line.kind === 'scenario-done' && line.scenarioId === 'create-image-001'
    )
    const dependent = lines.findIndex(
      (line) => line.kind === 'check' && line.scenarioId === 'search-created-001'
    )
    expect(created).toBeGreaterThanOrEqual(0)
    expect(created).toBeLessThan(dependent)

    expect(
      json<{ options: { apps: string[] } }>(path.join(runDir(), 'plan.json')).options.apps
    ).toEqual(['Calendar', 'Notes', 'Safari'])
    expect(meta()).toMatchObject({
      status: 'finished',
      argv: ['run', '--profile', 'smoke'],
      apps: { found: 3, used: 3 },
      segments: [{ index: 1, cleanShutdown: true, appPid: 4242 }]
    })
    expect(seen.preflight[0]).toMatchObject({ embedding: 'off', appCount: 3 })
    expect(seen.preflight[0].plannedBytes).toBeGreaterThan(0)
    expect(world.launches[0]).toMatchObject({
      nice: 10,
      ui: 'hidden',
      embedding: 'off',
      ports: { cdp: 9301, inspect: 9302, vite: 9303 }
    })

    expect(outcome.kept).toEqual([])
    expect(outcome.removed.sort()).toEqual([ownedCorpus(), path.join(runDir(), 'profile')].sort())
    expect(existsSync(ownedCorpus())).toBe(false)
    expect(existsSync(path.join(runDir(), 'profile'))).toBe(false)
    expect(seen.locks).toEqual(['test-run-1'])
    expect(seen.released).toEqual(['test-run-1'])
  })

  it('keeps corpus and profile with --keep, and never deletes a corpus root given on the command line', async () => {
    const kept = new FakeWorld()
    const first = await runRun(
      runOptions(root, { keep: true }),
      runnerDeps({ root, world: kept }).deps
    )
    expect(first.exitCode).toBe(0)
    expect(first.kept.sort()).toEqual([ownedCorpus(), path.join(runDir(), 'profile')].sort())
    expect(existsSync(ownedCorpus())).toBe(true)

    const own = path.join(root, 'my-corpus')
    const second = await runRun(
      runOptions(root, { runDir: path.join(root, 'run-2'), corpusRoot: own }),
      runnerDeps({ root, world: new FakeWorld(), runId: 'test-run-2' }).deps
    )
    expect(second).toMatchObject({ exitCode: 0, problems: [] })
    expect(second.kept).toEqual([own])
    expect(existsSync(own)).toBe(true)
    expect(existsSync(path.join(root, 'run-2', 'profile'))).toBe(false)
  })

  it('takes the app names from --apps-file and says so in the plan and the preflight', async () => {
    const world = new FakeWorld()
    const { deps, seen } = runnerDeps({ root, world })
    await runRun(runOptions(root, { appsFile: '/some/apps.json' }), deps)
    expect(
      json<{ options: { apps: string[] } }>(path.join(runDir(), 'plan.json')).options.apps
    ).toEqual(['Notes', 'Safari'])
    expect(meta().apps).toEqual({ found: null, used: 2 })
    expect(seen.preflight[0]).toMatchObject({ appCount: 2, appsFromFile: true })
  })

  it('exits 1 on a hard miss and keeps everything for inspection', async () => {
    const world = new FakeWorld({ hide: /new-shot-one/ })
    const { deps } = runnerDeps({ root, world })
    const outcome = await runRun(runOptions(root), deps)

    expect(outcome).toMatchObject({
      exitCode: 1,
      status: 'fail',
      verdict: 'fail',
      abortReason: null
    })
    expect(outcome.kept).toContain(ownedCorpus())
    expect(existsSync(ownedCorpus())).toBe(true)
    expect(existsSync(path.join(runDir(), 'profile'))).toBe(true)
    expect(existsSync(path.join(runDir(), 'report.json'))).toBe(true)
    expect(meta().status).toBe('finished')
  })

  it('refuses with exit 2 when the preflight says no, and leaves nothing behind', async () => {
    const world = new FakeWorld()
    const { deps, seen } = runnerDeps({
      root,
      world,
      preflight: async () => [
        {
          id: 'instances',
          status: 'refuse',
          title: 'no other Tuff instance running',
          detail: 'port 5173 has a listener'
        }
      ]
    })
    const failure = await runRun(runOptions(root), deps).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(RunRefused)
    expect((failure as RunRefused).message).toContain('port 5173 has a listener')
    expect(world.lifecycle).toEqual([])
    expect(existsSync(runDir())).toBe(false)
    expect(seen.released).toEqual(['test-run-1'])
  })

  it('ends through the usual shutdown and report when the driver stops working', async () => {
    const world = new FakeWorld()
    world.beforeSearch = () => {
      if (world.phase === 'steady') throw new DriverError('timeout', 'no answer in time')
    }
    const { deps, seen } = runnerDeps({ root, world })
    const outcome = await runRun(runOptions(root), deps)

    expect(outcome).toMatchObject({
      exitCode: 1,
      status: 'aborted',
      abortReason: 'driver-unhealthy'
    })
    expect(outcome.counts.notRun).toBeGreaterThan(0)
    expect(seen.reports[0].notRun.length).toBe(outcome.counts.notRun)
    expect(seen.reports[0].meta.switches.abortReason).toBe('driver-unhealthy')
    expect(String(seen.reports[0].meta.switches.abortDetail)).toContain('searches failed')
    expect(world.lifecycle.slice(-2)).toEqual(['monitor.stop', 'shutdown'])
    expect(existsSync(path.join(runDir(), 'report.json'))).toBe(true)
    expect(meta()).toMatchObject({ status: 'aborted', abortReason: 'driver-unhealthy' })
    expect(existsSync(path.join(runDir(), 'profile'))).toBe(true)
  })

  it('flags an app that did not quit cleanly, keeps its profile and skips the database check', async () => {
    const world = new FakeWorld({
      shutdown: {
        clean: false,
        how: 'left-running',
        leftPids: [4242],
        detail: 'the app ignored the quit request'
      }
    })
    const { deps, seen } = runnerDeps({ root, world })
    const outcome = await runRun(runOptions(root), deps)

    expect(outcome).toMatchObject({ exitCode: 1, status: 'fail', verdict: 'pass' })
    expect(outcome.problems.join('\n')).toContain('did not shut down cleanly')
    expect(meta().segments[0]).toMatchObject({ cleanShutdown: false, leftPids: [4242] })
    expect(seen.reports[0].meta.switches.uncleanSegments).toBe(1)
    expect(json<{ checked: boolean }>(path.join(runDir(), 'db-integrity.json')).checked).toBe(false)
    expect(existsSync(path.join(runDir(), 'profile'))).toBe(true)
    expect(existsSync(ownedCorpus())).toBe(true)
  })

  it('refuses to delete a corpus directory that has lost its marker', async () => {
    const world = new FakeWorld()
    world.beforeSearch = () => rmSync(path.join(world.corpusRoot, CORPUS_MARKER), { force: true })
    const { deps } = runnerDeps({ root, world })
    const outcome = await runRun(runOptions(root), deps)

    expect(outcome.exitCode).toBe(0)
    expect(outcome.problems.join('\n')).toContain(CORPUS_MARKER)
    expect(outcome.kept).toContain(ownedCorpus())
    expect(existsSync(path.join(ownedCorpus(), 'corpus', 'docs'))).toBe(true)
    expect(existsSync(path.join(runDir(), 'profile'))).toBe(false)
  })

  it("refuses to write into a corpus root that holds someone else's files", async () => {
    const own = path.join(root, 'precious')
    await mkdir(own, { recursive: true })
    await writeFile(path.join(own, 'notes.txt'), 'mine')
    const world = new FakeWorld()
    const { deps } = runnerDeps({ root, world })
    const outcome = await runRun(runOptions(root, { corpusRoot: own }), deps)

    expect(outcome).toMatchObject({ exitCode: 2, status: 'refused', abortReason: 'refused' })
    expect(world.lifecycle).toEqual([])
    expect(readFileSync(path.join(own, 'notes.txt'), 'utf8')).toBe('mine')
    expect(existsSync(path.join(runDir(), 'report.json'))).toBe(true)
  })

  it('stops releasing work on SIGINT, lets the running scenarios finish, and still reports', async () => {
    const controller = new AbortController()
    const world = new FakeWorld()
    const fired = { done: false }
    world.beforeSearch = async () => {
      if (world.phase === 'steady' && !fired.done) {
        fired.done = true
        controller.abort('SIGINT')
      }
      await wait(2)
    }
    const { deps, seen } = runnerDeps({ root, world, signal: controller.signal })
    const outcome = await runRun(runOptions(root), deps)

    expect(outcome).toMatchObject({ exitCode: 1, status: 'aborted', abortReason: 'interrupted' })
    expect(outcome.abortDetail).toContain('SIGINT')
    expect(outcome.counts.notRun).toBeGreaterThanOrEqual(6)
    expect(seen.reports[0].notRun).toHaveLength(outcome.counts.notRun)
    expect(world.lifecycle.slice(-2)).toEqual(['monitor.stop', 'shutdown'])
    expect(meta()).toMatchObject({ status: 'aborted', abortReason: 'interrupted' })
  })

  it("ends when the app's main process disappears", async () => {
    const world = new FakeWorld()
    world.beforeSearch = () => {
      if (world.phase !== 'steady') return undefined
      world.mainAlive = false
      return new Promise<void>(() => undefined)
    }
    const { deps, seen } = runnerDeps({ root, world })
    const outcome = await runRun(runOptions(root), deps)

    expect(outcome).toMatchObject({ exitCode: 1, status: 'aborted', abortReason: 'app-exited' })
    expect(outcome.abortDetail).toContain('4242')
    expect(seen.reports).toHaveLength(1)
    expect(outcome.counts.notRun).toBeGreaterThan(0)
  })

  it('gives up with a report when the seed corpus never becomes findable', async () => {
    const world = new FakeWorld({ hide: /./ })
    const { deps, seen } = runnerDeps({ root, world })
    const outcome = await runRun(runOptions(root, { seedTimeoutSec: 0.12 }), deps)

    expect(outcome).toMatchObject({
      exitCode: 1,
      status: 'aborted',
      abortReason: 'seed-timeout',
      counts: { planned: 12, notRun: 12 }
    })
    expect(outcome.abortDetail).toContain('seed corpus was not findable')
    expect(world.phases).toEqual(['seed'])
    expect(seen.reports[0].meta.switches).toMatchObject({
      seedReady: false,
      abortReason: 'seed-timeout'
    })
  })

  it('does not even start the app when it was told to stop beforehand', async () => {
    const controller = new AbortController()
    controller.abort('SIGTERM')
    const world = new FakeWorld()
    const { deps } = runnerDeps({ root, world, signal: controller.signal })
    const outcome = await runRun(runOptions(root), deps)

    expect(outcome).toMatchObject({
      exitCode: 1,
      status: 'aborted',
      abortReason: 'interrupted',
      counts: { notRun: 12 }
    })
    expect(world.lifecycle).toEqual([])
    expect(meta().segments[0]).toMatchObject({
      cleanShutdown: true,
      shutdownDetail: 'the app was not started'
    })
  })

  it('exits 2 when the app launch is refused and 3 when it breaks, with a report either way', async () => {
    const refused = await runRun(
      runOptions(root),
      runnerDeps({
        root,
        world: new FakeWorld({ launchError: new RunRefused('another Tuff instance is running') })
      }).deps
    )
    expect(refused).toMatchObject({ exitCode: 2, status: 'refused' })
    expect(existsSync(path.join(runDir(), 'report.json'))).toBe(true)

    const second = path.join(root, 'run-2')
    const broken = await runRun(
      runOptions(root, { runDir: second }),
      runnerDeps({
        root,
        world: new FakeWorld({ launchError: new Error('electron did not start') }),
        runId: 'test-run-2'
      }).deps
    )
    expect(broken).toMatchObject({
      exitCode: 3,
      status: 'error',
      abortReason: 'internal-error',
      error: 'electron did not start'
    })
    expect(existsSync(path.join(second, 'report.json'))).toBe(true)
  })

  it('holds new work while the monitor reports critical pressure and goes on when it clears', async () => {
    const world = new FakeWorld()
    world.onPhase = (phase) => {
      if (phase !== 'steady') return
      world.pressure = 'critical'
      setTimeout(() => {
        world.pressure = 'ok'
      }, 60)
    }
    const { deps, seen } = runnerDeps({ root, world })
    const outcome = await runRun(runOptions(root), deps)

    expect(outcome.exitCode).toBe(0)
    expect(world.marks).toEqual(expect.arrayContaining(['pacing:hold', 'pacing:resume']))
    expect(Number(seen.reports[0].meta.switches.criticalHolds)).toBeGreaterThanOrEqual(1)
  })

  it('prints a progress line on the ticker', async () => {
    const world = new FakeWorld()
    world.beforeSearch = () => wait(8)
    const { deps, seen } = runnerDeps({ root, world, tuning: { tickerMs: 15 } })
    await runRun(runOptions(root), deps)
    expect(seen.logs.some((line) => /^progress: (steady|burst) \d+\/12/.test(line))).toBe(true)
  })
})

describe('runRun --resume', () => {
  it('continues on a fresh profile without repeating what was finished or cut short', async () => {
    const controller = new AbortController()
    const first = new FakeWorld()
    const fired = { done: false }
    first.beforeSearch = async () => {
      if (first.phase === 'steady' && !fired.done) {
        fired.done = true
        controller.abort('SIGINT')
      }
      await wait(2)
    }
    const interrupted = await runRun(
      runOptions(root, { keep: true }),
      runnerDeps({ root, world: first, signal: controller.signal }).deps
    )
    expect(interrupted.status).toBe('aborted')

    const second = new FakeWorld()
    const harness = runnerDeps({ root, world: second })
    const resumed = await runRun(
      runOptions(root, { resume: runDir(), profile: 'full', seed: 9 }),
      harness.deps
    )

    expect(resumed).toMatchObject({
      exitCode: 0,
      status: 'pass',
      counts: { planned: 12, notRun: 0 }
    })
    expect(second.launches[0].segment.profileDir).toBe(path.join(runDir(), 'profile-2'))
    expect(second.launches[0].segment.evidenceDir).toBe(path.join(runDir(), 'evidence-2'))
    const stored = meta()
    expect(stored.segments).toHaveLength(2)
    expect(stored.segments[0]).toMatchObject({ abortReason: 'interrupted', cleanShutdown: true })
    expect(stored).toMatchObject({
      status: 'finished',
      profile: 'smoke',
      seed: 1,
      argv: ['run', '--profile', 'smoke']
    })
    expect(harness.seen.reports[0].meta.switches).toMatchObject({ segments: 2, uncleanSegments: 0 })
    expect(existsSync(path.join(runDir(), 'monitor-summary-2.json'))).toBe(true)

    const done = records().filter((line) => line.kind === 'scenario-done')
    expect(done).toHaveLength(12)
    expect(new Set(done.map((line) => line.scenarioId)).size).toBe(12)
    expect(harness.seen.locks).toEqual(['run-1'])
  })

  it('counts a segment the runner never finished as unclean', async () => {
    const first = new FakeWorld()
    const controller = new AbortController()
    first.beforeSearch = () => {
      if (first.phase === 'steady') controller.abort('SIGINT')
    }
    await runRun(
      runOptions(root, { keep: true }),
      runnerDeps({ root, world: first, signal: controller.signal }).deps
    )
    const stored = meta()
    stored.segments[0].endedAt = null
    stored.segments[0].cleanShutdown = null
    stored.status = 'running'
    await writeFile(path.join(runDir(), 'meta.json'), JSON.stringify(stored))

    const harness = runnerDeps({ root, world: new FakeWorld() })
    await runRun(runOptions(root, { resume: runDir() }), harness.deps)
    expect(meta().segments[0]).toMatchObject({ cleanShutdown: false })
    expect(String(meta().segments[0].shutdownDetail)).toContain('without finishing')
    expect(harness.seen.reports[0].meta.switches).toMatchObject({ segments: 2, uncleanSegments: 1 })
  })

  it('refuses a run that already finished and a directory that is not a run', async () => {
    const done = await runRun(
      runOptions(root, { keep: true }),
      runnerDeps({ root, world: new FakeWorld() }).deps
    )
    expect(done.exitCode).toBe(0)

    const again = await runRun(
      runOptions(root, { resume: runDir() }),
      runnerDeps({ root, world: new FakeWorld() }).deps
    ).catch((error: unknown) => error)
    expect(again).toBeInstanceOf(RunRefused)
    expect((again as RunRefused).message).toContain('already finished')

    const strange = await runRun(
      runOptions(root, { resume: root }),
      runnerDeps({ root, world: new FakeWorld() }).deps
    ).catch((error: unknown) => error)
    expect(strange).toBeInstanceOf(RunRefused)
    expect((strange as RunRefused).message).toContain('not a stress run')
  })
})
