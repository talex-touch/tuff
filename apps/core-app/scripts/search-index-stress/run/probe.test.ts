import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DriverError, RunRefused } from './errors'
import type { ProbeOptions } from './probe'
import { cannedSearches, formatFinding, runProbe, withTypo } from './probe'
import { FakeWorld, runnerDeps, testPlan } from './test-support/fake-run'

let root = ''
const runDir = (): string => path.join(root, 'probe-run')
const ownedCorpus = (): string => path.join(root, 'corpus-base', 'probe-test-run-1')
const options = (overrides: Partial<ProbeOptions> = {}): ProbeOptions => ({
  embedding: 'off',
  ui: 'hidden',
  keep: false,
  nice: 10,
  runDir: runDir(),
  seedTimeoutMs: 2_000,
  ...overrides
})

beforeEach(async () => {
  root = await mkdtemp('/private/tmp/tuff-probe-test-')
})
afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('runProbe', () => {
  it('runs the eight searches on a seeded corpus and removes its scratch data after a clean stop', async () => {
    const world = new FakeWorld()
    const { deps, seen } = runnerDeps({ root, world })
    const lines: string[] = []
    const result = await runProbe(options(), deps, (line) => lines.push(line))

    expect(result).toMatchObject({
      exitCode: 0,
      problems: [],
      seed: { ready: true },
      shutdown: { clean: true }
    })
    expect(result.findings.map((finding) => finding.label)).toEqual([
      'installed app',
      'seeded file',
      'seeded image',
      'name with a typo',
      'nonsense',
      'very short query',
      'CJK query',
      'empty query'
    ])
    expect(result.findings[0]).toMatchObject({
      query: 'Safari',
      rank: 1,
      endSignalSeen: true,
      top: ['Safari']
    })
    expect(result.findings[1]).toMatchObject({ query: 'alpha-report.txt', rank: 1 })
    expect(result.findings[2]).toMatchObject({ query: 'sunset-beach.png', rank: 1 })
    expect(result.findings[3]).toMatchObject({ query: 'snuset-beach', rank: null, rows: 0 })
    expect(result.findings[4]).toMatchObject({ rows: 0 })
    expect(result.findings[4]).not.toHaveProperty('rank')
    expect(result.findings[7].rows).toBeGreaterThan(2)
    expect(result.findings[7].top).toHaveLength(3)

    expect(world.lifecycle).toEqual(['launch', 'shutdown'])
    expect(world.launches[0]).toMatchObject({ nice: 10, ui: 'hidden', embedding: 'off' })
    expect(seen.locks).toEqual(['probe-test-run-1'])
    expect(seen.released).toEqual(['probe-test-run-1'])
    expect(seen.preflight[0]).toMatchObject({ embedding: 'off', appCount: 3 })
    expect(existsSync(runDir())).toBe(false)
    expect(existsSync(ownedCorpus())).toBe(false)
    expect(result.removed.sort()).toEqual([ownedCorpus(), runDir()].sort())
    expect(lines).toContain(
      '1. installed app "Safari": 1 rows in 2 ms, end signal seen, target at rank 1; top: Safari'
    )
    expect(lines.some((line) => line.startsWith('seed: findable'))).toBe(true)
    expect(lines.some((line) => line.startsWith('shutdown: clean (ipc)'))).toBe(true)
  })

  it('keeps everything with --keep', async () => {
    const world = new FakeWorld()
    const { deps } = runnerDeps({ root, world })
    const result = await runProbe(options({ keep: true }), deps, () => undefined)
    expect(result.exitCode).toBe(0)
    expect(result.removed).toEqual([])
    expect(result.kept.sort()).toEqual([ownedCorpus(), runDir()].sort())
    expect(existsSync(runDir())).toBe(true)
    expect(existsSync(ownedCorpus())).toBe(true)
  })

  it('still runs the searches and keeps the evidence when the seeded files never become findable', async () => {
    const world = new FakeWorld({ hide: /./ })
    const { deps } = runnerDeps({ root, world })
    const result = await runProbe(options({ seedTimeoutMs: 60 }), deps, () => undefined)
    expect(result.exitCode).toBe(1)
    expect(result.seed).toMatchObject({ ready: false })
    expect(result.problems[0]).toMatch(/seeded corpus was not findable/)
    expect(result.findings).toHaveLength(8)
    expect(result.shutdown?.clean).toBe(true)
    expect(existsSync(runDir())).toBe(true)
    expect(existsSync(ownedCorpus())).toBe(true)
  })

  it('reports a search that could not be observed and fails the probe', async () => {
    const world = new FakeWorld()
    world.beforeSearch = (query) => {
      if (query === '') throw new DriverError('cdp', 'connection lost')
    }
    const { deps } = runnerDeps({ root, world })
    const lines: string[] = []
    const result = await runProbe(options(), deps, (line) => lines.push(line))
    expect(result.exitCode).toBe(1)
    expect(result.findings[7]).toMatchObject({ label: 'empty query', error: 'connection lost' })
    expect(result.problems).toEqual(['empty query "" failed: connection lost'])
    expect(lines).toContain('8. empty query "": FAILED connection lost')
    expect(existsSync(runDir())).toBe(true)
  })

  it('fails and keeps its data when the app does not stop cleanly', async () => {
    const world = new FakeWorld({
      shutdown: {
        clean: false,
        how: 'left-running',
        leftPids: [4242],
        detail: 'still alive after SIGTERM'
      }
    })
    const { deps } = runnerDeps({ root, world })
    const result = await runProbe(options(), deps, () => undefined)
    expect(result.exitCode).toBe(1)
    expect(result.problems).toEqual([
      'the app did not shut down cleanly (left-running): still alive after SIGTERM'
    ])
    expect(result.kept.sort()).toEqual([ownedCorpus(), runDir()].sort())
    expect(existsSync(runDir())).toBe(true)
  })

  it('stops on request between searches, still shuts the app down and says so', async () => {
    const controller = new AbortController()
    const world = new FakeWorld()
    world.beforeSearch = (query) => {
      if (query === 'snuset-beach') controller.abort(new Error('SIGINT'))
    }
    const { deps } = runnerDeps({ root, world, signal: controller.signal })
    const result = await runProbe(options(), deps, () => undefined)
    expect(result.exitCode).toBe(1)
    expect(result.findings).toHaveLength(3)
    expect(result.problems.join(' ')).toMatch(/stopped on request/)
    expect(world.lifecycle).toEqual(['launch', 'shutdown'])
    expect(result.shutdown?.clean).toBe(true)
  })

  it('removes what it wrote when the launch is refused, keeps it when the launch breaks', async () => {
    const refused = runnerDeps({
      root,
      world: new FakeWorld({ launchError: new RunRefused('your dev instance is running') })
    })
    await expect(runProbe(options(), refused.deps, () => undefined)).rejects.toBeInstanceOf(
      RunRefused
    )
    expect(existsSync(runDir())).toBe(false)
    expect(existsSync(ownedCorpus())).toBe(false)
    expect(refused.seen.released).toEqual(['probe-test-run-1'])

    const broken = runnerDeps({
      root,
      world: new FakeWorld({ launchError: new Error('launch exploded') })
    })
    await expect(runProbe(options(), broken.deps, () => undefined)).rejects.toThrow(
      'launch exploded'
    )
    expect(existsSync(runDir())).toBe(true)
    expect(broken.seen.released).toEqual(['probe-test-run-1'])
  })

  it('writes nothing and starts nothing when the preflight refuses', async () => {
    const world = new FakeWorld()
    const { deps, seen } = runnerDeps({
      root,
      world,
      preflight: async () => [
        { id: 'disk', status: 'refuse', title: 'Free disk space', detail: '1 GiB free' }
      ]
    })
    await expect(runProbe(options(), deps, () => undefined)).rejects.toThrow(
      /Free disk space: 1 GiB free/
    )
    expect(world.lifecycle).toEqual([])
    expect(existsSync(runDir())).toBe(false)
    expect(seen.released).toEqual(['probe-test-run-1'])
  })

  it('takes the app names from --apps-file and tells the preflight', async () => {
    const world = new FakeWorld()
    const { deps, seen } = runnerDeps({ root, world })
    const lines: string[] = []
    await runProbe(options({ appsFile: '/some/apps.json' }), deps, (line) => lines.push(line))
    expect(lines).toContain('apps: 2 names from /some/apps.json')
    expect(seen.preflight[0]).toMatchObject({ appCount: 2, appsFromFile: true })
  })
})

describe('cannedSearches', () => {
  it('derives the CJK query from a CJK-named corpus file and aims the searches at it', () => {
    const plan = testPlan()
    plan.corpus.files.push({
      path: 'pictures/截屏 2026-10-30.png',
      payload: { kind: 'png', bytes: 24, seed: 9 }
    })
    const searches = cannedSearches(plan, ['Notes'])
    const cjk = searches.find((entry) => entry.label === 'CJK query')
    expect(cjk).toMatchObject({
      query: '截屏',
      target: { kind: 'file', path: 'pictures/截屏 2026-10-30.png' }
    })
    expect(searches.find((entry) => entry.label === 'installed app')).toMatchObject({
      query: 'Notes'
    })
  })

  it('falls back to fixed queries when the corpus has no document, image or CJK name, and skips hidden files', () => {
    const plan = testPlan()
    plan.corpus.files = [{ path: 'docs/.hidden.png', payload: { kind: 'png', bytes: 24, seed: 1 } }]
    const searches = cannedSearches(plan, [])
    expect(searches.map((entry) => entry.query)).toEqual([
      'Safari',
      'readme',
      'image',
      'Sfaari',
      'zzqxjv-no-such-thing-0',
      'sa',
      '截图',
      ''
    ])
    expect(searches.find((entry) => entry.label === 'seeded file')).not.toHaveProperty('target')
  })
})

describe('withTypo and formatFinding', () => {
  it('swaps two neighbouring different letters, or appends one to short words', () => {
    expect(withTypo('sunset-beach')).toBe('snuset-beach')
    expect(withTypo('aabbcc')).toBe('ababcc')
    expect(withTypo('ab')).toBe('abx')
  })

  it('prints rank, signal and top names', () => {
    const base = {
      label: 'seeded file',
      query: 'a b',
      rows: 4,
      answerMs: 31,
      endSignalSeen: true,
      top: ['a', 'b']
    }
    expect(formatFinding({ ...base, rank: 2 }, 1)).toBe(
      '2. seeded file "a b": 4 rows in 31 ms, end signal seen, target at rank 2; top: a | b'
    )
    expect(formatFinding({ ...base, rank: null, endSignalSeen: false, top: [] }, 0)).toBe(
      '1. seeded file "a b": 4 rows in 31 ms, cut at the timeout, target not in the rows'
    )
  })
})
