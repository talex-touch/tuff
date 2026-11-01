import type {
  Breach,
  DbIntegrity,
  Distribution,
  GateResult,
  MonitorSummary,
  PhaseSummary,
  ReportInputs,
  RunMeta
} from '../../eval-types'
import { DEFAULT_THRESHOLDS } from '../../monitor/thresholds'
import { distribution } from '../../monitor/stats'
import type { CheckResult, ScenarioClass } from '../../types'
import { buildReport } from '../index'

export const T0 = Date.UTC(2026, 9, 30, 12, 0, 0)

export const dist = (...values: number[]): Distribution => distribution(values)

export const sid = (cls: ScenarioClass, n: number): string =>
  `${cls}-${n.toString(16).padStart(12, '0')}`

/** A passing present check: found at rank 1. */
export function found(cls: ScenarioClass, n: number, over: Partial<CheckResult> = {}): CheckResult {
  return {
    scenarioId: sid(cls, n),
    checkIndex: 0,
    class: cls,
    tier: 'hard',
    outcome: 'pass',
    latencyMs: 300,
    sinceStepsMs: 1_500,
    polls: 2,
    rank: 1,
    resultCount: 5,
    answerMs: 60,
    expect: 'present',
    phase: 'steady',
    ...over
  }
}

/** A present check whose target never showed up. */
export function missed(
  cls: ScenarioClass,
  n: number,
  over: Partial<CheckResult> = {}
): CheckResult {
  return found(cls, n, {
    outcome: 'fail',
    latencyMs: null,
    sinceStepsMs: null,
    rank: null,
    resultCount: 5,
    detail: 'target not found within 5000 ms',
    ...over
  })
}

/** An absent check that confirmed absence; `latencyMs` is the deadline, not a speed. */
export function absentOk(
  cls: ScenarioClass,
  n: number,
  over: Partial<CheckResult> = {}
): CheckResult {
  return found(cls, n, {
    latencyMs: 3_000,
    sinceStepsMs: 3_000,
    rank: null,
    resultCount: 4,
    answerMs: 50,
    expect: 'absent',
    ...over
  })
}

/** An absent check whose target appeared. */
export function absentBad(
  cls: ScenarioClass,
  n: number,
  over: Partial<CheckResult> = {}
): CheckResult {
  return absentOk(cls, n, {
    outcome: 'fail',
    latencyMs: null,
    sinceStepsMs: null,
    rank: 2,
    detail: 'target appeared although it must be absent',
    ...over
  })
}

export function errored(
  cls: ScenarioClass,
  n: number,
  over: Partial<CheckResult> = {}
): CheckResult {
  return found(cls, n, {
    outcome: 'error',
    latencyMs: null,
    sinceStepsMs: null,
    rank: null,
    resultCount: null,
    answerMs: null,
    detail: 'search driver lost the page',
    ...over
  })
}

export function skippedCheck(
  cls: ScenarioClass,
  n: number,
  over: Partial<CheckResult> = {}
): CheckResult {
  return errored(cls, n, {
    outcome: 'skipped',
    polls: 0,
    detail: 'required scenario failed',
    ...over
  })
}

const NO_SAMPLES: Distribution = dist()

export function phaseSummary(over: Partial<PhaseSummary> = {}): PhaseSummary {
  return {
    phase: 'steady',
    startedAt: T0,
    endedAt: T0 + 600_000,
    cpuPct: dist(30, 45, 60, 80, 100),
    mainCpuPct: dist(10, 20, 30),
    rendererCpuPct: dist(5, 10, 15),
    rssMb: dist(1_000, 1_200, 1_400),
    loopDelayMs: dist(2, 3, 5, 8, 12),
    loopMaxBlockMs: 40,
    rendererBlockMs: dist(2, 4, 8, 12),
    frames: {
      total: 72_000,
      over33ms: 120,
      over50ms: 20,
      over100ms: 0,
      worstMs: 90,
      visibleWindows: 1
    },
    breaches: [],
    ...over
  }
}

/** A phase the monitor watched but in which no visible window delivered frames. */
export const framelessPhase = (over: Partial<PhaseSummary> = {}): PhaseSummary =>
  phaseSummary({ frames: null, ...over })

/** A phase with no samples at all. */
export const emptyPhase = (over: Partial<PhaseSummary> = {}): PhaseSummary =>
  phaseSummary({
    cpuPct: NO_SAMPLES,
    mainCpuPct: NO_SAMPLES,
    rendererCpuPct: NO_SAMPLES,
    rssMb: NO_SAMPLES,
    loopDelayMs: NO_SAMPLES,
    loopMaxBlockMs: 0,
    rendererBlockMs: NO_SAMPLES,
    frames: null,
    ...over
  })

export function breach(over: Partial<Breach> = {}): Breach {
  return {
    at: T0 + 60_000,
    phase: 'steady',
    kind: 'main-loop-block',
    severity: 'fail',
    value: 400,
    limit: 250,
    ...over
  }
}

export function monitorSummary(over: Partial<MonitorSummary> = {}): MonitorSummary {
  return {
    startedAt: T0,
    endedAt: T0 + 600_000,
    phases: [phaseSummary()],
    breaches: [],
    blindMs: 0,
    samplesWritten: 600,
    timelineFile: '/private/tmp/evidence/timeline.ndjson',
    dbRepairMarkers: [],
    thresholds: structuredClone(DEFAULT_THRESHOLDS),
    intervalMs: 1_000,
    ...over
  }
}

export function runMeta(over: Partial<RunMeta> = {}): RunMeta {
  return {
    runId: 'run-0001',
    startedAt: T0,
    endedAt: T0 + 600_000,
    profile: 'full',
    seed: 1030,
    scenarioCount: 0,
    host: { os: 'darwin 27.0.0', cpus: 14, memGb: 48 },
    argv: ['run', '--profile', 'full', '--seed', '1030'],
    switches: { ui: 'visible', embedding: false },
    ...over
  }
}

export const cleanDb = (): DbIntegrity => ({
  checked: true,
  results: [{ file: 'modules/database/index.db', ok: true }]
})

const CLASSES: readonly ScenarioClass[] = [
  'search-app',
  'search-file',
  'search-image',
  'create-image',
  'change-image',
  'ignore-image',
  'search-created'
]

const PER_CLASS = 3

/** A run in which every gate passes; a test changes one thing and reads one gate. */
export function greenInputs(): ReportInputs {
  const results: CheckResult[] = []
  const dims: ReportInputs['dims'] = {}
  const planned: ReportInputs['planned'] = {}
  for (const cls of CLASSES) {
    planned[cls] = PER_CLASS
    for (let n = 0; n < PER_CLASS; n++) {
      results.push(cls === 'ignore-image' ? absentOk(cls, n) : found(cls, n))
      dims[sid(cls, n)] = { format: n % 2 === 0 ? 'png' : 'jpg', placement: 'root' }
    }
  }
  return {
    meta: runMeta({ scenarioCount: CLASSES.length * PER_CLASS }),
    results,
    monitor: monitorSummary(),
    db: cleanDb(),
    planned,
    dims,
    notRun: []
  }
}

/** Replaces every result of `cls`. */
export function withResults(
  inputs: ReportInputs,
  cls: ScenarioClass,
  results: CheckResult[]
): ReportInputs {
  return { ...inputs, results: [...inputs.results.filter((r) => r.class !== cls), ...results] }
}

/** Gives `cls` exactly `count` scenarios (one check each, built by `make`) and keeps the plan and `meta` in step. */
export function withScenarios(
  inputs: ReportInputs,
  cls: ScenarioClass,
  count: number,
  make: (n: number) => CheckResult = (n) =>
    cls === 'ignore-image' ? absentOk(cls, n) : found(cls, n)
): ReportInputs {
  const results = Array.from({ length: count }, (_, n) => make(n))
  const dims = { ...inputs.dims }
  for (const key of Object.keys(dims)) if (key.startsWith(`${cls}-`)) delete dims[key]
  for (let n = 0; n < count; n++)
    dims[sid(cls, n)] = { format: n % 2 === 0 ? 'png' : 'jpg', placement: 'root' }
  const planned = { ...inputs.planned, [cls]: count }
  const scenarioCount = Object.values(planned).reduce((sum, value) => sum + (value ?? 0), 0)
  return {
    ...withResults(inputs, cls, results),
    dims,
    planned,
    meta: { ...inputs.meta, scenarioCount }
  }
}

/** Replaces fields of the monitor summary. */
export function withMonitor(inputs: ReportInputs, over: Partial<MonitorSummary>): ReportInputs {
  return { ...inputs, monitor: { ...inputs.monitor, ...over } }
}

export const gateOf = (inputs: ReportInputs, id: string): GateResult => {
  const entry = buildReport(inputs).gates.find((candidate) => candidate.id === id)
  if (!entry) throw new Error(`no gate ${id}`)
  return entry
}

export const statusOf = (inputs: ReportInputs, id: string): GateResult['status'] =>
  gateOf(inputs, id).status
