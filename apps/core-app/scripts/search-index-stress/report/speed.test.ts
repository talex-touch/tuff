import { describe, expect, it } from 'vitest'
import { prepare } from './results'
import { answerStats, indexingStats, STEADY_PHASE } from './speed'
import { absentOk, errored, found, missed } from './testing/builders'

const indexing = (results: Parameters<typeof prepare>[0]) => indexingStats(prepare(results, {}))
const answers = (results: Parameters<typeof prepare>[0]) => answerStats(prepare(results, {}))

const created = (count: number, since: (i: number) => number) =>
  Array.from({ length: count }, (_, i) =>
    found('create-image', i, { sinceStepsMs: since(i), maxPollGapMs: 300 })
  )

describe('indexingStats', () => {
  it('decides nothing without create-image checks and ignores other classes', () => {
    const stats = indexing([
      found('search-image', 1, { sinceStepsMs: 9_000 }),
      found('change-image', 1)
    ])
    expect(stats.decided).toBe(0)
    expect(stats.found).toBe(0)
    expect(stats.resolutionP95Ms).toBeNull()
  })

  it('measures the time from the last step to the file being found', () => {
    const stats = indexing(created(100, (i) => 1_000 + i * 10))
    expect(stats).toMatchObject({ decided: 100, found: 100, neverSearchable: 0 })
    expect(stats.sinceStepsMs.p50).toBe(1_490)
    expect(stats.censored).toEqual({ p50: 1_490, p95: 1_940, p99: 1_980 })
    expect(stats.resolutionP95Ms).toBe(300)
  })

  it('counts a hard check that never saw the file as infinite, which lifts the tail but not the median', () => {
    const stats = indexing([
      ...created(98, (i) => 1_000 + i),
      missed('create-image', 200),
      missed('create-image', 201)
    ])
    expect(stats).toMatchObject({ decided: 100, found: 98, neverSearchable: 2 })
    expect(stats.censored.p95).toBe(1_094)
    expect(stats.censored.p99).toBe(Infinity)
    expect(stats.sinceStepsMs.max).toBe(1_097)
  })

  it('does not blame speed for a soft miss, a file found below the requested rank, or a check that could not run', () => {
    const stats = indexing([
      ...created(10, () => 1_500),
      missed('create-image', 100, { tier: 'soft' }),
      missed('create-image', 101, { rank: 7, detail: 'found at rank 7, wanted 3' }),
      errored('create-image', 102),
      found('create-image', 103, { sinceStepsMs: null })
    ])
    expect(stats).toMatchObject({
      decided: 10,
      found: 10,
      neverSearchable: 0,
      softMissesExcluded: 1,
      rankMissesExcluded: 1,
      undecidedExcluded: 2
    })
    expect(stats.censored.p99).toBe(1_500)
  })

  it('leaves absent checks out entirely', () => {
    const stats = indexing([...created(5, () => 1_000), absentOk('create-image', 300)])
    expect(stats.decided).toBe(5)
  })

  it('has zeroed percentiles, not NaN, when nothing was decided', () => {
    const stats = indexing([])
    expect(stats.censored).toEqual({ p50: 0, p95: 0, p99: 0 })
  })
})

describe('answerStats', () => {
  it('judges the steady phase only once checks carry phase tags', () => {
    const stats = answers([
      found('search-file', 1, { answerMs: 50, phase: STEADY_PHASE }),
      found('search-file', 2, { answerMs: 70, phase: STEADY_PHASE }),
      found('search-file', 3, { answerMs: 4_000, phase: 'burst' }),
      found('search-file', 4, { answerMs: 9_000, phase: 'seed' })
    ])
    expect(stats.scope).toBe('steady')
    expect(stats.answerMs.count).toBe(2)
    expect(stats.answerMs.max).toBe(70)
    expect(stats.byPhase.map((entry) => entry.phase)).toEqual(['burst', 'seed', 'steady'])
    expect(stats.byPhase[0].answerMs.max).toBe(4_000)
  })

  it('pools everything when no check is tagged steady', () => {
    const stats = answers([
      found('search-file', 1, { answerMs: 50, phase: undefined }),
      found('search-file', 2, { answerMs: 70, phase: 'burst' }),
      found('search-file', 3, { answerMs: 90, phase: undefined })
    ])
    expect(stats.scope).toBe('all')
    expect(stats.answerMs.count).toBe(3)
    expect(stats.byPhase.map((entry) => entry.phase)).toEqual(['burst'])
  })

  it('counts a present check that was answered but missed, and nothing from absent or undecided checks', () => {
    const stats = answers([
      found('search-file', 1, { answerMs: 100 }),
      missed('search-file', 2, { answerMs: 900 }),
      absentOk('ignore-image', 3, { answerMs: 5 }),
      errored('search-file', 4, { answerMs: 7 })
    ])
    expect(stats.answerMs.count).toBe(2)
    expect(stats.answerMs.max).toBe(900)
  })

  it('is empty, not NaN, without answers', () => {
    const stats = answers([])
    expect(stats.scope).toBe('all')
    expect(stats.answerMs.count).toBe(0)
    expect(stats.byPhase).toEqual([])
  })
})
