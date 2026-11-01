import { describe, expect, it } from 'vitest'
import { addOutcome, buildClassReports, emptyTally, passRate, sumTallies } from './classes'
import { prepare } from './results'
import { absentBad, absentOk, errored, found, missed, sid, skippedCheck } from './testing/builders'

const build = (results: Parameters<typeof prepare>[0], planned = {}, notRun: string[] = []) =>
  buildClassReports(prepare(results, {}), planned, notRun)

describe('tallies', () => {
  it('counts outcomes and sums them', () => {
    const a = emptyTally()
    addOutcome(a, 'pass')
    addOutcome(a, 'pass')
    addOutcome(a, 'fail')
    const b = emptyTally()
    addOutcome(b, 'error')
    addOutcome(b, 'skipped')
    expect(a).toEqual({ total: 3, pass: 2, fail: 1, error: 0, skipped: 0 })
    expect(sumTallies([a, b])).toEqual({ total: 5, pass: 2, fail: 1, error: 1, skipped: 1 })
    expect(passRate(a)).toBeCloseTo(2 / 3)
    expect(passRate(emptyTally())).toBe(0)
  })
})

describe('buildClassReports', () => {
  it('splits hard from soft and counts what passed', () => {
    const [report] = build([
      found('search-file', 1),
      found('search-file', 2, { tier: 'soft' }),
      missed('search-file', 3, { tier: 'soft' }),
      missed('search-file', 4)
    ])
    expect(report.class).toBe('search-file')
    expect(report.checks).toBe(4)
    expect(report.hard).toEqual({ total: 2, pass: 1, fail: 1, error: 0, skipped: 0 })
    expect(report.soft).toEqual({ total: 2, pass: 1, fail: 1, error: 0, skipped: 0 })
    expect(report.presentPass).toBe(2)
    expect(report.absentPass).toBe(0)
  })

  it('draws each speed distribution from the population it belongs to', () => {
    const [report] = build([
      found('create-image', 1, {
        latencyMs: 100,
        sinceStepsMs: 1_000,
        answerMs: 10,
        maxPollGapMs: 150
      }),
      found('create-image', 2, {
        latencyMs: 300,
        sinceStepsMs: 3_000,
        answerMs: 30,
        maxPollGapMs: 600
      }),
      absentOk('create-image', 3, { latencyMs: 9_999, sinceStepsMs: 9_999, answerMs: 9_999 }),
      missed('create-image', 4, { answerMs: 500 }),
      errored('create-image', 5)
    ])
    expect(report.latencyMs.count).toBe(2)
    expect(report.latencyMs.max).toBe(300)
    expect(report.sinceStepsMs.max).toBe(3_000)
    expect(report.answerMs.count).toBe(3)
    expect(report.answerMs.max).toBe(500)
    expect(report.pollGapMs.count).toBe(2)
    expect(report.pollGapMs.max).toBe(600)
    expect(report.absentPass).toBe(1)
  })

  it('counts executed scenarios, scenarios that were only skipped, and the ones never started', () => {
    const results = [
      found('search-file', 1),
      errored('search-file', 2),
      skippedCheck('search-file', 3),
      skippedCheck('search-file', 3, { checkIndex: 1 }),
      found('search-file', 4, { checkIndex: 0 }),
      skippedCheck('search-file', 4, { checkIndex: 1 })
    ]
    const [report] = build(results, { 'search-file': 10 }, [
      sid('search-file', 8),
      sid('search-file', 9)
    ])
    expect(report.executed).toBe(3)
    expect(report.skippedOnly).toBe(1)
    expect(report.notRun).toBe(2)
    expect(report.unaccounted).toBe(4)
    expect(report.planned).toBe(10)
  })

  it('never reports a negative unaccounted count', () => {
    const [report] = build([found('search-app', 1), found('search-app', 2)], { 'search-app': 1 })
    expect(report.unaccounted).toBe(0)
  })

  it('has no planned count when the plan did not list the class', () => {
    const [report] = build([found('search-app', 1)])
    expect(report.planned).toBeNull()
    expect(report.unaccounted).toBe(0)
  })

  it('lists a planned class nothing ran for, and one that exists only as a not-run id', () => {
    const reports = build([found('search-app', 1)], { 'search-app': 1, 'create-image': 4 }, [
      sid('change-image', 1)
    ])
    expect(reports.map((r) => r.class)).toEqual(['search-app', 'create-image', 'change-image'])
    const idle = reports[1]
    expect(idle).toMatchObject({ planned: 4, executed: 0, checks: 0, unaccounted: 4 })
    expect(reports[2]).toMatchObject({ planned: null, executed: 0, notRun: 1 })
  })

  it('orders classes as the contract does and omits classes with no trace', () => {
    const reports = build([
      found('search-created', 1),
      found('search-app', 1),
      absentBad('ignore-image', 1)
    ])
    expect(reports.map((r) => r.class)).toEqual(['search-app', 'ignore-image', 'search-created'])
  })
})
