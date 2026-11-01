import { describe, expect, it } from 'vitest'
import type { ReportInputs } from '../eval-types'
import { buildReport } from './index'
import { NOT_RUN_IDS_SHOWN, REPORT_SCHEMA_VERSION } from './model'
import {
  T0,
  breach,
  framelessPhase,
  greenInputs,
  missed,
  monitorSummary,
  runMeta,
  sid,
  withMonitor,
  withResults
} from './testing/builders'
import { numbersIn } from './testing/json'

const jsonOf = (inputs: ReportInputs) => buildReport(inputs).json

describe('the JSON report', () => {
  it('carries a schema version, the verdict and the gates', () => {
    const json = jsonOf(greenInputs())
    expect(REPORT_SCHEMA_VERSION).toBe(1)
    expect(json.schemaVersion).toBe(1)
    expect(json.verdict).toBe('pass')
    expect(json.gates).toHaveLength(11)
    expect(json.attention).toEqual([])
  })

  it('describes the run, with ISO times and the command that repeats it', () => {
    const { run } = jsonOf(greenInputs())
    expect(run).toMatchObject({
      id: 'run-0001',
      profile: 'full',
      seed: 1030,
      scenarioCount: 21,
      startedAtIso: '2026-10-30T12:00:00Z',
      endedAtIso: '2026-10-30T12:10:00Z',
      durationMs: 600_000,
      host: { os: 'darwin 27.0.0', cpus: 14, memGb: 48 },
      switches: { ui: 'visible', embedding: false },
      command: 'pnpm search:stress run --profile full --seed 1030'
    })
    expect(run).not.toHaveProperty('appVersion')
    expect(run).not.toHaveProperty('gitSha')
  })

  it('states the app version and commit when the runner knew them', () => {
    const { run } = jsonOf({
      ...greenInputs(),
      meta: runMeta({ appVersion: '2.9.0', gitSha: 'abc1234', scenarioCount: 21 })
    })
    expect(run).toMatchObject({ appVersion: '2.9.0', gitSha: 'abc1234' })
  })

  it('names the gates that need attention: fail first, then unknown, then warn, each group in gate order', () => {
    const base = withResults(greenInputs(), 'search-file', [
      missed('search-file', 0),
      missed('search-file', 1),
      missed('search-file', 2)
    ])
    const noisy = withMonitor(base, {
      phases: [framelessPhase()],
      dbRepairMarkers: ['repair'],
      breaches: [breach({ kind: 'cpu', severity: 'warn', value: 180, limit: 150 })]
    })
    const json = jsonOf(noisy)
    expect(json.attention.map((entry) => [entry.id, entry.status])).toEqual([
      ['G1', 'fail'],
      ['G8', 'fail'],
      ['G7', 'unknown'],
      ['G6', 'warn']
    ])
    expect(json.attention[0]).toEqual({ id: 'G1', status: 'fail', title: 'Hard-check correctness' })
    expect(json.gates.map((entry) => entry.id)).toEqual([
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
  })

  it('gives the number of scenarios the runner never started and the first twenty of them', () => {
    const notRun = Array.from({ length: 35 }, (_, n) => sid('create-image', 100 + n))
    const { coverage } = jsonOf({ ...greenInputs(), notRun })
    expect(NOT_RUN_IDS_SHOWN).toBe(20)
    expect(coverage.notRun.total).toBe(35)
    expect(coverage.notRun.ids).toEqual(notRun.slice(0, 20))
    expect(coverage).toMatchObject({
      duplicates: 0,
      withoutDims: 0,
      planned: greenInputs().planned
    })
  })

  it('counts repeated results and results without dimensions', () => {
    const inputs = {
      ...greenInputs(),
      results: [...greenInputs().results, greenInputs().results[0]],
      dims: {}
    }
    expect(jsonOf(inputs).coverage).toMatchObject({ duplicates: 1, withoutDims: 21 })
  })

  it('writes a percentile beyond the deadline as null, never as a non-finite number', () => {
    const inputs = withResults(greenInputs(), 'create-image', [
      missed('create-image', 0),
      missed('create-image', 1)
    ])
    const { indexing } = jsonOf(inputs)
    expect(indexing.neverSearchable).toBe(2)
    expect(indexing.censored).toEqual({ p50: null, p95: null, p99: null })
  })

  it('writes only finite numbers, in the best case, the worst case and the empty case', () => {
    const worst = withMonitor(
      withResults(greenInputs(), 'create-image', [
        missed('create-image', 0),
        missed('create-image', 1)
      ]),
      { phases: [framelessPhase()], breaches: [breach()] }
    )
    const empty: ReportInputs = {
      ...greenInputs(),
      results: [],
      planned: {},
      dims: {},
      monitor: monitorSummary({ phases: [], samplesWritten: 0 })
    }
    for (const inputs of [greenInputs(), worst, empty]) {
      const offenders = numbersIn(jsonOf(inputs)).filter(([, value]) => !Number.isFinite(value))
      expect(offenders).toEqual([])
    }
  })

  it('survives a JSON round trip unchanged', () => {
    const inputs = withResults(greenInputs(), 'create-image', [missed('create-image', 0)])
    const json = jsonOf(inputs)
    expect(JSON.parse(JSON.stringify(json))).toEqual(json)
  })

  it('carries the limits the gates were judged against', () => {
    const json = jsonOf({ ...greenInputs(), limits: { indexP95WarnMs: 4_000 } })
    expect(json.limits).toMatchObject({
      indexP95WarnMs: 4_000,
      indexP99FailMs: 15_000,
      outlierFactor: 2
    })
  })

  it('takes the run times from the run meta', () => {
    const inputs = {
      ...greenInputs(),
      meta: runMeta({ startedAt: T0 + 1_000, endedAt: T0 + 5_000, scenarioCount: 21 })
    }
    expect(jsonOf(inputs).run).toMatchObject({ startedAt: T0 + 1_000, durationMs: 4_000 })
  })
})
