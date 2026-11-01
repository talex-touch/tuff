import { describe, expect, it } from 'vitest'
import { distribution, round } from '../monitor/stats'
import type { CheckResult, ScenarioClass } from '../types'
import {
  compareCases,
  notable,
  slowestChecks,
  type ClassComparison,
  type DimensionReport
} from './compare'
import { prepare, type Dims } from './results'
import { absentBad, absentOk, found, missed, sid } from './testing/builders'

interface Group {
  value: string
  answers: number[]
  /** How many of the first checks miss instead of passing. */
  misses?: number
}

function build(
  cls: ScenarioClass,
  dim: string,
  groups: Group[]
): { results: CheckResult[]; dims: Record<string, Dims> } {
  const results: CheckResult[] = []
  const dims: Record<string, Dims> = {}
  let n = 0
  for (const group of groups) {
    group.answers.forEach((answerMs, index) => {
      n++
      const miss = index < (group.misses ?? 0)
      results.push(
        miss
          ? missed(cls, n, { answerMs })
          : found(cls, n, { answerMs, latencyMs: 300, sinceStepsMs: answerMs + 1_000 })
      )
      dims[sid(cls, n)] = { [dim]: group.value }
    })
  }
  return { results, dims }
}

const spreadOut = (count: number, low: number, high: number): number[] =>
  Array.from(
    { length: count },
    (_, i) => low + Math.round(((high - low) * i) / Math.max(1, count - 1))
  )

const same = (count: number, value: number): number[] => new Array<number>(count).fill(value)

function compare(cls: ScenarioClass, dim: string, groups: Group[], factor = 2): ClassComparison {
  const { results, dims } = build(cls, dim, groups)
  const [comparison] = compareCases(prepare(results, dims), factor)
  return comparison
}

const dimension = (comparison: ClassComparison, name: string): DimensionReport => {
  const entry = comparison.dimensions.find((candidate) => candidate.dim === name)
  if (!entry) throw new Error(`no dimension ${name}`)
  return entry
}

describe('compareCases', () => {
  it('flags a value whose p95 is more than the factor above the rest of its class', () => {
    const png = spreadOut(190, 40, 60)
    const comparison = compare('search-file', 'format', [
      { value: 'png', answers: png },
      { value: 'heic', answers: same(10, 500) }
    ])
    const ratio = round(500 / distribution(png).p95, 2)
    const format = dimension(comparison, 'format')
    expect(format.rows.map((row) => row.value)).toEqual(['heic', 'png'])
    expect(format.rows[0].flags).toEqual([{ metric: 'answerMs', ratio }])
    expect(format.rows[1].flags).toEqual([])
    expect(format.flagged).toBe(1)
    expect(format.worstRatio).toBe(ratio)
    expect(format.slowest).toEqual({ value: 'heic', p95: 500, ratio })
    expect(ratio).toBeGreaterThan(8)
  })

  it('still flags a slow value that makes up a tenth of the class, which a class-wide baseline would hide', () => {
    const comparison = compare('search-file', 'format', [
      { value: 'png', answers: spreadOut(180, 40, 60) },
      { value: 'heic', answers: same(20, 500) }
    ])
    expect(comparison.classWide.answerMs?.p95).toBe(500)
    const heic = dimension(comparison, 'format').rows[0]
    expect(heic.value).toBe('heic')
    expect(heic.flags).toHaveLength(1)
    expect(heic.flags[0].ratio).toBeGreaterThan(8)
  })

  it('compares against the rest, not against a baseline that includes the value itself', () => {
    const comparison = compare('search-file', 'format', [
      { value: 'a', answers: same(50, 100) },
      { value: 'b', answers: same(50, 200) }
    ])
    const rows = dimension(comparison, 'format').rows
    expect(rows.map((row) => [row.value, row.ratios.answerMs])).toEqual([
      ['b', 2],
      ['a', 0.5]
    ])
    expect(rows[0].flags).toEqual([])
  })

  it('flags only above the factor, not at it, and honours a custom factor', () => {
    const groups = [
      { value: 'a', answers: same(50, 100) },
      { value: 'b', answers: same(50, 250) }
    ]
    expect(dimension(compare('search-file', 'format', groups, 2), 'format').flagged).toBe(1)
    expect(dimension(compare('search-file', 'format', groups, 3), 'format').flagged).toBe(0)
  })

  it('never flags a group of fewer than five checks, however slow', () => {
    const comparison = compare('search-file', 'format', [
      { value: 'png', answers: spreadOut(196, 40, 60) },
      { value: 'rare', answers: same(4, 5_000) }
    ])
    const rare = dimension(comparison, 'format').rows.find((row) => row.value === 'rare')
    expect(rare?.flags).toEqual([])
    expect(rare?.ratios).toEqual({})
    expect(dimension(comparison, 'format').flagged).toBe(0)
  })

  it('never flags a p95 under 50 ms: that is noise, not a case difference', () => {
    const comparison = compare('search-file', 'format', [
      { value: 'fast', answers: same(100, 10) },
      { value: 'quick', answers: same(20, 45) }
    ])
    const quick = dimension(comparison, 'format').rows[0]
    expect(quick.value).toBe('quick')
    expect(quick.ratios.answerMs).toBe(4.5)
    expect(quick.flags).toEqual([])
  })

  it('has no baseline when the value is the whole class or the rest is too small', () => {
    const only = compare('search-file', 'format', [{ value: 'png', answers: same(30, 700) }])
    expect(dimension(only, 'format').rows[0].ratios).toEqual({})
    const nearlyAll = compare('search-file', 'format', [
      { value: 'png', answers: same(30, 700) },
      { value: 'rare', answers: same(4, 10) }
    ])
    expect(dimension(nearlyAll, 'format').rows.find((row) => row.value === 'png')?.ratios).toEqual(
      {}
    )
  })

  it('agrees with a brute-force p95 of everything outside the value', () => {
    let state = 12345
    const next = (): number => {
      state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0
      return state / 2 ** 32
    }
    const groups: Group[] = ['a', 'b', 'c', 'd'].map((value, index) => ({
      value,
      answers: Array.from({ length: 40 + index * 7 }, () =>
        Math.round(20 + next() * 400 * (index + 1))
      )
    }))
    const comparison = compare('search-file', 'format', groups)
    for (const row of dimension(comparison, 'format').rows) {
      const own = groups.find((group) => group.value === row.value)?.answers ?? []
      const rest = groups
        .filter((group) => group.value !== row.value)
        .flatMap((group) => group.answers)
      const expected = round(distribution(own).p95 / distribution(rest).p95, 2)
      expect(row.ratios.answerMs).toBe(expected)
    }
  })

  it('sorts rows by p95 descending, then lower pass rate, then more checks, then name', () => {
    const comparison = compare('search-file', 'format', [
      { value: 'zeta', answers: same(10, 300) },
      { value: 'beta', answers: same(10, 300), misses: 3 },
      { value: 'alpha', answers: same(20, 300) },
      { value: 'slow', answers: same(10, 900) },
      { value: 'quick', answers: same(10, 100) },
      { value: 'omega', answers: same(10, 300) }
    ])
    expect(dimension(comparison, 'format').rows.map((row) => row.value)).toEqual([
      'slow',
      'beta',
      'alpha',
      'omega',
      'zeta',
      'quick'
    ])
  })

  it('puts a value that never had a measurable check last', () => {
    const results = [
      ...same(10, 100).map((answerMs, i) => found('search-file', i, { answerMs })),
      missed('search-file', 100, { answerMs: null }),
      missed('search-file', 101, { answerMs: null })
    ]
    const dims = Object.fromEntries(
      results.map((r) => [r.scenarioId, { format: r.answerMs === null ? 'ghost' : 'png' }])
    )
    const [comparison] = compareCases(prepare(results, dims), 2)
    const format = dimension(comparison, 'format')
    expect(format.rows.map((row) => row.value)).toEqual(['png', 'ghost'])
    expect(format.rows[1].metrics).toEqual({})
    expect(format.rows[1].ratios).toEqual({})
  })

  it('reports pass rate per value and the weakest value among groups big enough to compare', () => {
    const comparison = compare('search-file', 'format', [
      { value: 'png', answers: same(20, 100) },
      { value: 'gif', answers: same(10, 100), misses: 4 },
      { value: 'tiny', answers: same(2, 100), misses: 2 }
    ])
    const format = dimension(comparison, 'format')
    const gif = format.rows.find((row) => row.value === 'gif')
    expect(gif).toMatchObject({ checks: 10, pass: 6, passRate: 0.6 })
    expect(format.weakest).toEqual({ value: 'gif', passRate: 0.6, checks: 10 })
    expect(comparison.passRate).toBeCloseTo(26 / 32)
    expect(notable(comparison, format)).toBe(true)
  })

  it('does not call a dimension notable without a flag or a clearly weaker pass rate', () => {
    const comparison = compare('search-file', 'format', [
      { value: 'png', answers: same(20, 100) },
      { value: 'gif', answers: same(20, 100), misses: 1 }
    ])
    expect(notable(comparison, dimension(comparison, 'format'))).toBe(false)
  })

  it('gives up on a dimension with more than 100 distinct values and says so', () => {
    const groups = Array.from({ length: 101 }, (_, i) => ({ value: `v${i}`, answers: [100] }))
    const comparison = compare('search-file', 'path', groups)
    const path = dimension(comparison, 'path')
    expect(path.skipped).toContain('100')
    expect(path.rows).toEqual([])
    expect(path.distinct).toBe(101)
    expect(comparison.checks).toBe(101)
  })

  it('keeps exactly 100 distinct values', () => {
    const groups = Array.from({ length: 100 }, (_, i) => ({ value: `v${i}`, answers: [100] }))
    const path = dimension(compare('search-file', 'path', groups), 'path')
    expect(path.skipped).toBeUndefined()
    expect(path.rows).toHaveLength(100)
  })

  it('ranks create-image by time since the last step and keeps absent-only classes free of latency', () => {
    const create = compare('create-image', 'writeMode', [
      { value: 'plain', answers: spreadOut(190, 40, 60) },
      { value: 'slow-writer', answers: same(10, 500) }
    ])
    expect(create.primary).toBe('sinceStepsMs')
    expect(create.shown).toEqual(['sinceStepsMs', 'answerMs'])
    expect(dimension(create, 'writeMode').rows[0]).toMatchObject({ value: 'slow-writer' })

    const results = [
      absentOk('ignore-image', 1),
      absentOk('ignore-image', 2),
      absentBad('ignore-image', 3),
      absentOk('ignore-image', 4)
    ]
    const dims = Object.fromEntries(
      results.map((r, i) => [r.scenarioId, { reason: i < 2 ? 'hidden' : 'symlink' }])
    )
    const [ignored] = compareCases(prepare(results, dims), 2)
    expect(ignored.primary).toBeNull()
    expect(ignored.shown).toEqual([])
    expect(ignored.classWide).toEqual({})
    expect(dimension(ignored, 'reason').rows.map((row) => [row.value, row.passRate])).toEqual([
      ['symlink', 0.5],
      ['hidden', 1]
    ])
  })

  it('covers every dimension of a scenario and keeps the classes in contract order', () => {
    const results = [found('search-created', 1), found('search-app', 1), found('search-app', 2)]
    const dims: Record<string, Dims> = {
      [sid('search-created', 1)]: { a: 1 },
      [sid('search-app', 1)]: { name: 'x', hidden: false },
      [sid('search-app', 2)]: { name: 'y', hidden: false }
    }
    const comparisons = compareCases(prepare(results, dims), 2)
    expect(comparisons.map((entry) => entry.class)).toEqual(['search-app', 'search-created'])
    expect(comparisons[0].dimensions.map((entry) => entry.dim)).toEqual(['hidden', 'name'])
    expect(dimension(comparisons[0], 'hidden').rows[0].value).toBe('false')
  })
})

describe('slowestChecks', () => {
  it('lists the slowest found and answered checks with their dimensions, ties broken by id', () => {
    const results = [
      found('create-image', 1, { sinceStepsMs: 3_000, answerMs: 90 }),
      found('create-image', 2, { sinceStepsMs: 9_000, answerMs: 40 }),
      found('create-image', 3, { sinceStepsMs: 3_000, answerMs: 70 }),
      missed('create-image', 4, { answerMs: 8_000 }),
      absentOk('ignore-image', 5, { answerMs: 99_999, sinceStepsMs: 99_999 })
    ]
    const dims = { [sid('create-image', 2)]: { format: 'heic' } }
    const slowest = slowestChecks(prepare(results, dims), 3)
    expect(slowest.bySinceSteps.map((entry) => entry.scenarioId)).toEqual([
      sid('create-image', 2),
      sid('create-image', 1),
      sid('create-image', 3)
    ])
    expect(slowest.bySinceSteps[0]).toMatchObject({
      sinceStepsMs: 9_000,
      tier: 'hard',
      outcome: 'pass',
      dims: { format: 'heic' }
    })
    expect(
      slowest.byAnswer.map((entry) => [entry.scenarioId, entry.answerMs, entry.outcome])
    ).toEqual([
      [sid('create-image', 4), 8_000, 'fail'],
      [sid('create-image', 1), 90, 'pass'],
      [sid('create-image', 3), 70, 'pass']
    ])
    expect(slowest.byAnswer[0].dims).toEqual({})
    expect(slowest.ranked).toEqual({ bySinceSteps: 3, byAnswer: 4 })
  })

  it('returns fewer rows than asked when there are fewer', () => {
    expect(slowestChecks(prepare([found('search-file', 1)], {}), 15).byAnswer).toHaveLength(1)
    expect(slowestChecks(prepare([], {}), 15)).toEqual({
      bySinceSteps: [],
      byAnswer: [],
      ranked: { bySinceSteps: 0, byAnswer: 0 }
    })
  })
})
