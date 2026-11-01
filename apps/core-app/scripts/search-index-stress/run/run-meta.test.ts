import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { SegmentRecord, StoredMeta } from './run-meta'
import { lastSegment, readMeta, toRunMeta, writeMeta } from './run-meta'

const segment = (index: number, overrides: Partial<SegmentRecord> = {}): SegmentRecord => ({
  index,
  profileDir: `/p/profile-${index}`,
  startedAt: 1_000 * index,
  endedAt: 1_000 * index + 500,
  cleanShutdown: true,
  appPid: 100 + index,
  leftPids: [],
  abortReason: null,
  ...overrides
})

function stored(overrides: Partial<StoredMeta> = {}): StoredMeta {
  return {
    version: 1,
    runId: '20261030T010203Z-ab12',
    profile: 'smoke',
    seed: 7,
    count: 200,
    argv: ['run', '--profile', 'smoke'],
    startedAt: 1_000,
    endedAt: null,
    status: 'running',
    abortReason: null,
    options: {
      embedding: 'off',
      ui: 'hidden',
      qps: 4,
      nice: 10,
      concurrency: 6,
      burstConcurrency: 12,
      searchTimeoutMs: 8_000,
      seedTimeoutSec: 600
    },
    corpus: { root: '/Users/Shared/tuff-stress/x/corpus', owned: true },
    host: { os: 'darwin 27', cpus: 14, memGb: 48 },
    apps: { found: 83, used: 60 },
    switches: {},
    segments: [segment(1)],
    ...overrides
  }
}

describe('meta file', () => {
  let dir = ''
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), 'stress-meta-'))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('round-trips and leaves no temporary file behind', async () => {
    const file = path.join(dir, 'nested', 'meta.json')
    const meta = stored({ appVersion: '1.2.3', gitSha: 'abc' })
    await writeMeta(file, meta)
    expect(await readMeta(file)).toEqual(meta)
    expect(await readdir(path.dirname(file))).toEqual(['meta.json'])
  })

  it('answers null for a missing file, broken JSON and a foreign document', async () => {
    expect(await readMeta(path.join(dir, 'none.json'))).toBeNull()
    await writeFile(path.join(dir, 'broken.json'), '{"version":1,')
    expect(await readMeta(path.join(dir, 'broken.json'))).toBeNull()
    await writeFile(
      path.join(dir, 'other.json'),
      JSON.stringify({ version: 2, runId: 'x', segments: [] })
    )
    expect(await readMeta(path.join(dir, 'other.json'))).toBeNull()
    await writeFile(path.join(dir, 'plan.json'), JSON.stringify({ seed: 1, scenarios: [] }))
    expect(await readMeta(path.join(dir, 'plan.json'))).toBeNull()
  })
})

describe('lastSegment', () => {
  it('is the newest one, and undefined before the first start', () => {
    expect(lastSegment(stored({ segments: [segment(1), segment(2)] }))?.index).toBe(2)
    expect(lastSegment(stored({ segments: [] }))).toBeUndefined()
  })
})

describe('toRunMeta', () => {
  it('carries the run facts and every switch that shaped the numbers', () => {
    const meta = toRunMeta(stored({ gitSha: 'abc123' }), 200, 9_000)
    expect(meta).toMatchObject({
      runId: '20261030T010203Z-ab12',
      startedAt: 1_000,
      endedAt: 9_000,
      profile: 'smoke',
      seed: 7,
      scenarioCount: 200,
      gitSha: 'abc123'
    })
    expect(meta.host).toEqual({ os: 'darwin 27', cpus: 14, memGb: 48 })
    expect(meta.switches).toMatchObject({
      embedding: 'off',
      ui: 'hidden',
      qps: 4,
      nice: 10,
      concurrency: 6,
      burstConcurrency: 12,
      searchTimeoutMs: 8_000,
      appsUsed: 60,
      appsFound: 83,
      segments: 1,
      uncleanSegments: 0
    })
    expect(meta).not.toHaveProperty('appVersion')
  })

  it('counts unclean segments and names the abort reason', () => {
    const meta = toRunMeta(
      stored({
        abortReason: 'seed-timeout',
        segments: [
          segment(1, { cleanShutdown: false }),
          segment(2, { cleanShutdown: null }),
          segment(3, { cleanShutdown: true })
        ]
      }),
      10,
      5
    )
    expect(meta.switches).toMatchObject({
      segments: 3,
      uncleanSegments: 1,
      abortReason: 'seed-timeout'
    })
  })

  it('leaves out appsFound when the names came from a file, and lets recorded pacing switches through', () => {
    const meta = toRunMeta(
      stored({
        apps: { found: null, used: 12 },
        switches: { throttledSeconds: 41, 'pacing:limp': true }
      }),
      10,
      5
    )
    expect(meta.switches).not.toHaveProperty('appsFound')
    expect(meta.switches).toMatchObject({ appsUsed: 12, throttledSeconds: 41, 'pacing:limp': true })
  })
})
