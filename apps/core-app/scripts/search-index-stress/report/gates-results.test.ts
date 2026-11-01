import { describe, expect, it } from 'vitest'
import type { ReportInputs } from '../eval-types'
import { buildReport } from './index'
import {
  T0,
  absentBad,
  absentOk,
  breach,
  errored,
  found,
  gateOf,
  greenInputs,
  missed,
  sid,
  skippedCheck,
  statusOf,
  withMonitor,
  withResults,
  withScenarios
} from './testing/builders'

describe('a run that is fine', () => {
  it('passes all eleven gates, in order, each with a one-line detail that carries a number', () => {
    const report = buildReport(greenInputs())
    expect(report.gates.map((entry) => entry.id)).toEqual([
      'G1',
      'G2',
      'G3',
      'G4',
      'G5',
      'G6',
      'G7',
      'G8',
      'G9',
      'G10',
      'G11'
    ])
    expect(report.gates.map((entry) => entry.status)).toEqual(new Array(11).fill('pass'))
    expect(new Set(report.gates.map((entry) => entry.title)).size).toBe(11)
    for (const entry of report.gates) {
      expect(entry.detail, entry.id).toMatch(/\d/)
      expect(entry.detail, entry.id).not.toMatch(/[\r\n]/)
    }
    expect(report.verdict).toBe('pass')
  })

  it('still states a number in every detail when the run is empty or the worst possible', () => {
    const empty: ReportInputs = {
      ...greenInputs(),
      results: [],
      planned: {},
      dims: {},
      notRun: [],
      monitor: withMonitor(greenInputs(), { phases: [], samplesWritten: 0, breaches: [] }).monitor,
      db: { checked: false, results: [] }
    }
    const bad = withMonitor(
      withResults(greenInputs(), 'search-file', [
        missed('search-file', 0),
        errored('search-file', 1)
      ]),
      {
        breaches: [breach(), breach({ kind: 'process-exit', value: 1, limit: 0 })],
        dbRepairMarkers: ['repair'],
        quarantineFiles: ['index.db.corrupt'],
        appReportedLag: [{ at: T0, lagMs: 900 }]
      }
    )
    for (const inputs of [empty, bad]) {
      for (const entry of buildReport(inputs).gates) {
        expect(entry.detail, entry.id).toMatch(/\d/)
        expect(entry.detail, entry.id).not.toMatch(/[\r\n]|undefined|NaN|\[object/)
      }
    }
  })
})

describe('G1 hard-check correctness', () => {
  it('passes when every hard check passed and counts them', () => {
    expect(gateOf(greenInputs(), 'G1')).toMatchObject({
      status: 'pass',
      detail: '21 of 21 hard checks passed'
    })
  })

  it('fails on a missed present check and on an absent check whose file appeared, naming the scenarios', () => {
    const inputs = withResults(
      withResults(greenInputs(), 'search-file', [
        missed('search-file', 1),
        found('search-file', 2)
      ]),
      'ignore-image',
      [absentBad('ignore-image', 0), absentOk('ignore-image', 1)]
    )
    const result = gateOf(inputs, 'G1')
    expect(result.status).toBe('fail')
    expect(result.detail).toContain('2 failed in 2 scenarios')
    expect(result.detail).toContain(sid('search-file', 1))
    expect(result.detail).toContain(sid('ignore-image', 0))
  })

  it('lists at most twenty failing scenario ids and counts the rest', () => {
    const inputs = withScenarios(greenInputs(), 'search-file', 25, (n) => missed('search-file', n))
    const result = gateOf(inputs, 'G1')
    expect(result.status).toBe('fail')
    expect(result.detail).toContain(sid('search-file', 19))
    expect(result.detail).not.toContain(sid('search-file', 20))
    expect(result.detail).toContain('(+5 more)')
    expect(result.detail).toContain('25 failed in 25 scenarios')
  })

  it('is unknown when no hard check exists or a hard check could not be decided', () => {
    const softOnly = {
      ...greenInputs(),
      results: greenInputs().results.map((r) => ({ ...r, tier: 'soft' as const }))
    }
    expect(statusOf(softOnly, 'G1')).toBe('unknown')
    expect(gateOf(softOnly, 'G1').detail).toContain('0 hard-tier checks among 21 results')

    const undecided = withResults(greenInputs(), 'search-file', [
      errored('search-file', 0),
      skippedCheck('search-file', 1),
      found('search-file', 2)
    ])
    const result = gateOf(undecided, 'G1')
    expect(result.status).toBe('unknown')
    expect(result.detail).toContain('19 of 21 hard checks passed')
    expect(result.detail).toContain('2 undecided (1 errored, 1 skipped)')
  })

  it('reports a failure ahead of undecided checks and mentions them', () => {
    const inputs = withResults(greenInputs(), 'search-file', [
      missed('search-file', 0),
      errored('search-file', 1),
      found('search-file', 2)
    ])
    const result = gateOf(inputs, 'G1')
    expect(result.status).toBe('fail')
    expect(result.detail).toContain('; 1 more undecided')
  })

  it('does not count soft misses', () => {
    const inputs = withResults(greenInputs(), 'search-file', [
      missed('search-file', 0, { tier: 'soft' }),
      found('search-file', 1),
      found('search-file', 2)
    ])
    expect(gateOf(inputs, 'G1')).toMatchObject({
      status: 'pass',
      detail: '20 of 20 hard checks passed'
    })
  })
})

describe('G2 completeness', () => {
  it('passes when everything planned ran and nothing was undecided', () => {
    const result = gateOf(greenInputs(), 'G2')
    expect(result.status).toBe('pass')
    expect(result.detail).toContain('21 of 21 scenarios executed (21 checks); 0 not run')
    expect(result.detail).toContain('7 of 7 classes executed')
  })

  it('fails when the runner reports scenarios it never started', () => {
    const result = gateOf(
      { ...greenInputs(), notRun: [sid('create-image', 90), sid('create-image', 91)] },
      'G2'
    )
    expect(result.status).toBe('fail')
    expect(result.detail).toContain('2 not run')
  })

  it('fails when a planned class produced no check, and when planned scenarios are unaccounted for', () => {
    const inputs = withResults(greenInputs(), 'change-image', [])
    const result = gateOf(inputs, 'G2')
    expect(result.status).toBe('fail')
    expect(result.detail).toContain('no check ran for change-image')
    expect(result.detail).toContain('6 of 7 classes executed')
    expect(result.detail).toContain('3 planned scenarios unaccounted for')

    const short = { ...greenInputs(), planned: { ...greenInputs().planned, 'search-app': 5 } }
    const partial = gateOf(short, 'G2')
    expect(partial.status).toBe('fail')
    expect(partial.detail).toContain('2 planned scenarios unaccounted for')
  })

  it('fails when more than the allowed share of checks ended undecided, and only warns below it', () => {
    const undecided = (count: number) =>
      withScenarios(greenInputs(), 'search-file', 100, (n) =>
        n < count ? errored('search-file', n) : found('search-file', n)
      )
    const one = gateOf(undecided(1), 'G2')
    expect(one.status).toBe('warn')
    expect(one.detail).toContain('1 errored, 0 skipped (0.8%)')

    const five = gateOf(undecided(5), 'G2')
    expect(five.status).toBe('fail')
    expect(five.detail).toContain('5 errored, 0 skipped (4.2%)')
  })

  it('applies a custom undecided-share limit', () => {
    const one = withResults(greenInputs(), 'search-file', [
      errored('search-file', 0),
      found('search-file', 1),
      found('search-file', 2)
    ])
    expect(statusOf(one, 'G2')).toBe('fail')
    expect(statusOf({ ...one, limits: { undecidedShareFail: 0.2 } }, 'G2')).toBe('warn')
  })

  it('warns on repeated results, on a run that leaves a class out, and on a count that disagrees with the plan', () => {
    const repeated = {
      ...greenInputs(),
      results: [...greenInputs().results, greenInputs().results[0]]
    }
    const duplicate = gateOf(repeated, 'G2')
    expect(duplicate.status).toBe('warn')
    expect(duplicate.detail).toContain('1 repeated result ignored')

    const rest = { ...greenInputs().planned }
    delete rest['search-app']
    const narrowed = {
      ...greenInputs(),
      planned: rest,
      results: greenInputs().results.filter((r) => r.class !== 'search-app'),
      meta: { ...greenInputs().meta, scenarioCount: 18 }
    }
    const narrow = gateOf(narrowed, 'G2')
    expect(narrow.status).toBe('warn')
    expect(narrow.detail).toContain('not in this run: search-app')

    const disagreeing = { ...greenInputs(), meta: { ...greenInputs().meta, scenarioCount: 22 } }
    const mismatch = gateOf(disagreeing, 'G2')
    expect(mismatch.status).toBe('warn')
    expect(mismatch.detail).toContain('meta says 22 scenarios, classes sum to 21')
  })

  it('warns instead of failing when a scenario was skipped in a big enough run', () => {
    const skipped = withScenarios(greenInputs(), 'search-file', 100, (n) =>
      n === 0 ? skippedCheck('search-file', n) : found('search-file', n)
    )
    const result = gateOf(skipped, 'G2')
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('1 skipped')
  })

  it('fails when every scenario of a class was skipped, however small a share of the checks that is', () => {
    const big = withScenarios(greenInputs(), 'search-file', 300)
    const inputs = withResults(
      big,
      'change-image',
      [0, 1, 2].map((n) => skippedCheck('change-image', n))
    )
    const result = gateOf(inputs, 'G2')
    expect(result.status).toBe('fail')
    expect(result.detail).toContain('3 skipped (0.9%)')
    expect(result.detail).toContain('no check ran for change-image')
  })

  it('is unknown when the plan was not supplied, or when nothing was planned or run', () => {
    const noPlan = { ...greenInputs(), planned: {} }
    const unplanned = gateOf(noPlan, 'G2')
    expect(unplanned.status).toBe('unknown')
    expect(unplanned.detail).toContain('class counts were not supplied')

    const nothing = gateOf({ ...greenInputs(), planned: {}, results: [], dims: {} }, 'G2')
    expect(nothing.status).toBe('unknown')
    expect(nothing.detail).toContain('nothing was planned or executed')
  })
})

describe('G3 indexing speed', () => {
  const created = (sinceStepsMs: number[], over: Parameters<typeof found>[2] = {}) =>
    sinceStepsMs.map((value, n) =>
      found('create-image', n, { sinceStepsMs: value, latencyMs: value, ...over })
    )

  it('passes a fast run and states the percentiles and the provisional limits', () => {
    const result = gateOf(greenInputs(), 'G3')
    expect(result.status).toBe('pass')
    expect(result.detail).toContain('n=3: p50 1.5 s / p95 1.5 s / p99 1.5 s')
    expect(result.detail).toContain('provisional limits: p95 <= 6 s warn, p99 <= 15 s fail')
  })

  it('warns when p95 exceeds six seconds and fails when p99 exceeds fifteen', () => {
    const slow = withResults(greenInputs(), 'create-image', created([7_000, 7_000, 7_000]))
    expect(statusOf(slow, 'G3')).toBe('warn')
    const slower = withResults(greenInputs(), 'create-image', created([1_000, 1_000, 16_000]))
    expect(statusOf(slower, 'G3')).toBe('fail')
  })

  it('judges at the limit itself as still fine', () => {
    const edge = withResults(greenInputs(), 'create-image', created([6_000, 6_000, 6_000]))
    expect(statusOf(edge, 'G3')).toBe('pass')
    const edgeFail = withResults(greenInputs(), 'create-image', created([15_000, 15_000, 15_000]))
    expect(statusOf(edgeFail, 'G3')).toBe('warn')
  })

  it('fails on an image that never became searchable and says how many', () => {
    const inputs = withResults(greenInputs(), 'create-image', [
      ...created([1_500, 1_500]),
      missed('create-image', 2)
    ])
    const result = gateOf(inputs, 'G3')
    expect(result.status).toBe('fail')
    expect(result.detail).toContain('1 never searchable')
    expect(result.detail).toContain('never')
  })

  it('does not blame speed for soft misses, rank misses or undecided checks', () => {
    const inputs = withResults(greenInputs(), 'create-image', [
      ...created([1_500, 1_500]),
      missed('create-image', 2, { tier: 'soft' }),
      missed('create-image', 3, { rank: 9 }),
      errored('create-image', 4)
    ])
    const result = gateOf(inputs, 'G3')
    expect(result.status).toBe('pass')
    expect(result.detail).toContain('n=2')
    expect(result.detail).not.toContain('never searchable')
  })

  it('is unknown without any decided create-image check', () => {
    expect(statusOf(withResults(greenInputs(), 'create-image', []), 'G3')).toBe('unknown')
    expect(
      statusOf(withResults(greenInputs(), 'create-image', [errored('create-image', 0)]), 'G3')
    ).toBe('unknown')
  })

  it('takes its limits from the inputs', () => {
    expect(statusOf({ ...greenInputs(), limits: { indexP95WarnMs: 1_000 } }, 'G3')).toBe('warn')
    expect(
      statusOf({ ...greenInputs(), limits: { indexP95WarnMs: 1_000, indexP99FailMs: 1_400 } }, 'G3')
    ).toBe('fail')
    expect(gateOf({ ...greenInputs(), limits: { indexP95WarnMs: 1_000 } }, 'G3').detail).toContain(
      'p95 <= 1 s warn'
    )
  })

  it('shows how coarse the figures are when polls carry their gap', () => {
    const inputs = withResults(
      greenInputs(),
      'create-image',
      created([1_500, 1_500, 1_500], { maxPollGapMs: 400 })
    )
    expect(gateOf(inputs, 'G3').detail).toContain('poll gap p95 400 ms')
  })
})

describe('G4 search latency', () => {
  const answered = (values: number[], over: Parameters<typeof found>[2] = {}) =>
    values.map((value, n) => found('search-file', n, { answerMs: value, ...over }))

  it('passes a quick app and says it judged the steady state', () => {
    const result = gateOf(greenInputs(), 'G4')
    expect(result.status).toBe('pass')
    expect(result.detail).toContain('steady-state present checks')
    expect(result.detail).toContain('p95 <= 300 ms warn, p99 <= 1 s fail')
  })

  it('warns above 300 ms at p95 and fails above one second at p99', () => {
    expect(
      statusOf(withResults(greenInputs(), 'search-file', answered([400, 400, 400])), 'G4')
    ).toBe('warn')
    expect(
      statusOf(withResults(greenInputs(), 'search-file', answered([50, 50, 1_500])), 'G4')
    ).toBe('fail')
  })

  it('ignores phases other than the steady one when the steady one exists', () => {
    const inputs = withResults(greenInputs(), 'search-file', [
      ...answered([60, 60]),
      found('search-file', 9, { answerMs: 9_000, phase: 'burst' })
    ])
    const result = gateOf(inputs, 'G4')
    expect(result.status).toBe('pass')
    expect(result.detail).toContain('over 17 steady-state present checks')
  })

  it('pools every phase, and says so, when no check is tagged steady', () => {
    const untagged = {
      ...greenInputs(),
      results: greenInputs().results.map((r) => ({ ...r, phase: undefined }))
    }
    const result = gateOf(untagged, 'G4')
    expect(result.status).toBe('pass')
    expect(result.detail).toContain('all phases (none tagged steady)')
  })

  it('does not count absent checks as answers', () => {
    const onlyAbsent = {
      ...greenInputs(),
      results: [absentOk('ignore-image', 0, { answerMs: 90_000 })]
    }
    expect(statusOf(onlyAbsent, 'G4')).toBe('unknown')
  })

  it('is unknown without any answered present check', () => {
    expect(statusOf({ ...greenInputs(), results: [] }, 'G4')).toBe('unknown')
  })

  it('takes its limits from the inputs', () => {
    expect(statusOf({ ...greenInputs(), limits: { answerP95WarnMs: 40 } }, 'G4')).toBe('warn')
    expect(statusOf({ ...greenInputs(), limits: { answerP99FailMs: 50 } }, 'G4')).toBe('fail')
  })
})
