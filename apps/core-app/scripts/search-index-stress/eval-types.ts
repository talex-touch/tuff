/**
 * Contract between the runner (`run/`) and the evaluation side (`monitor/`, `report/`).
 *
 * The monitor watches the app under test while scenarios execute; the report turns the per-check
 * results plus the monitor summary into verdicts. The runner owns the app process and the
 * scenario timeline; the monitor never starts, stops or signals the app.
 * Existing fields may be extended with optional ones; do not change or remove them.
 */

import type { CheckResult, ScenarioClass } from './types'

export interface AppHandles {
  mainPid: number
  /** `--remote-debugging-port` of the app (browser-level CDP endpoint). */
  cdpPort: number
  /** Main-process `--inspect` port. */
  inspectPort: number
  profileDir: string
  logsDir: string
  /** Samples, profiles and timelines go here. Never inside the repository. */
  evidenceDir: string
}

export type Pressure = 'ok' | 'elevated' | 'critical'

export type BreachKind =
  | 'main-loop-block' // a single main-process event-loop block above the limit
  | 'main-loop-p99' // sustained event-loop delay in one window
  | 'cpu' // app-wide or per-process CPU above the limit
  | 'rss'
  | 'renderer-block' // renderer main-thread block (long task / probe round trip)
  | 'frame-drop' // visible window delivered frames too slowly
  | 'db-repair-marker' // log shows the index database being repaired, rebuilt or recreated
  | 'process-exit' // app or a helper exited while the run was in progress
  | 'monitor-blind' // a probe could not be read for too long; the verdict for that span is unknown

/** Which frame limit a `frame-drop` episode crossed. */
export type FrameMetric = 'over-20ms-share' | 'over-50ms-share' | 'worst-frame'

export interface Breach {
  /** Epoch ms. */
  at: number
  phase: string
  kind: BreachKind
  severity: 'warn' | 'fail'
  value: number
  limit: number
  /** Only on `frame-drop`; absent in summaries written before the 20 ms share existed (a ratio limit then means `over-50ms-share`, a millisecond one `worst-frame`). */
  metric?: FrameMetric
  detail?: string
  /** File written under `evidenceDir` (process sample, CPU profile, log excerpt) when one was captured. */
  evidence?: string
  /** The last `mark()` labels active at `at`, newest last; says what the runner was doing. */
  marks?: string[]
}

export interface StressMonitor {
  start(): Promise<void>
  /** Samples and breaches after this call belong to `phase` (e.g. `seed`, `steady`, `burst`). */
  setPhase(phase: string): void
  /** Timeline annotation, e.g. `scenario-batch:17` or `waiting-for-index-idle`. */
  mark(label: string): void
  /** Cheap, synchronous; the runner calls it before releasing more work. */
  pressure(): { level: Pressure; reason?: string }
  onBreach(listener: (breach: Breach) => void): () => void
  /** Idempotent. Stops probes, flushes the timeline, returns the summary. */
  stop(): Promise<MonitorSummary>
}

export interface Distribution {
  count: number
  min: number
  p50: number
  p90: number
  p95: number
  p99: number
  max: number
  mean: number
}

export interface PhaseSummary {
  phase: string
  startedAt: number
  endedAt: number
  /** Percentage of ONE core: 100 = one core fully busy. Summed over all app processes unless noted. */
  cpuPct: Distribution
  mainCpuPct: Distribution
  rendererCpuPct: Distribution
  rssMb: Distribution
  /** Main-process event-loop delay, ms, per probe window. */
  loopDelayMs: Distribution
  loopMaxBlockMs: number
  rendererBlockMs: Distribution
  /** Visible windows only. `null` when no window was visible, which the report must say rather than pass. */
  frames: null | {
    total: number
    over33ms: number
    over50ms: number
    over100ms: number
    worstMs: number
    visibleWindows: number
  }
  breaches: Breach[]
}

export interface MonitorSummary {
  startedAt: number
  endedAt: number
  phases: PhaseSummary[]
  breaches: Breach[]
  /** Spans where a probe could not be read, ms. Large values weaken every other number. */
  blindMs: number
  samplesWritten: number
  timelineFile: string
  dbRepairMarkers: string[]
  thresholds: Thresholds
  /** Lag the app's own perf monitor reported in its logs (with its attribution), for cross-checking the probes. */
  appReportedLag?: Array<{ at: number; lagMs: number; suspect?: string; contexts?: string[] }>
  /** Per probe family (`main-loop`, `cpu`, `renderer`), ms it could not be read; overlapping spans count once. */
  blindByProbe?: Record<string, number>
  /** Caveats the report must show: a probe that fell back to a cruder source, a page cap, and the like. */
  notes?: string[]
  /** CPU of the Node process that hosts the monitor (the runner included), percent of one core. */
  harnessCpuPct?: { avg: number; max: number }
  /** Every page the renderer probe saw: how long it was visible and how it performed while it was. */
  windows?: Array<{
    label: string
    visibleSeconds: number
    hiddenSeconds: number
    frames: number
    /** Frames slower than 20 ms; absent in summaries written before they were counted. */
    over20ms?: number
    over50ms: number
    worstFrameMs: number
    /** rAF intervals over 500 ms with no long task inside: a throttled window, not a block. */
    throttledIntervals: number
    worstBlockMs: number
  }>
  /** Timeline lines that did not fit the size cap; 0 means the timeline is complete. */
  timelineLinesDropped?: number
  /** Every database marker the log probe matched, including the benign ones; `repair` entries also appear in `dbRepairMarkers`. */
  logMarkers?: Array<{
    id: string
    cls: 'repair' | 'suspect' | 'expected-on-fresh-profile'
    count: number
    firstAt: number
    sample: string
  }>
  /** `*.corrupt` files that appeared under the profile directory during the run. */
  quarantineFiles?: string[]
  /** Probe period actually used, ms. */
  intervalMs?: number
}

/** Numbers are the defaults; the CLI can override each one. `fail` ends the run as failed, `warn` is reported. */
export interface Thresholds {
  mainLoopBlockMs: { warn: number; fail: number }
  mainLoopP99Ms: { warn: number; fail: number }
  rendererBlockMs: { warn: number; fail: number }
  /** Share of dropped frames (slower than 20 ms: two vsyncs at 120 Hz, one at 60 Hz) in any 10 s window of a visible window. */
  frameOver20msRatio: { warn: number; fail: number }
  /** Share of frames slower than 50 ms in any 10 s window of a visible window. */
  frameOver50msRatio: { warn: number; fail: number }
  frameWorstMs: { warn: number; fail: number }
  /** App-wide CPU, percent of one core, averaged over a 5 s window. */
  cpuPct: { warn: number; fail: number }
  rssMb: { warn: number; fail: number }
  /** Capture a process sample once a block lasts at least this long. */
  sampleOnBlockMs: number
}

// ---------------------------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------------------------

export interface RunMeta {
  runId: string
  startedAt: number
  endedAt: number
  profile: string
  seed: number
  scenarioCount: number
  host: { os: string; cpus: number; memGb: number }
  appVersion?: string
  gitSha?: string
  argv: string[]
  /** Free-form switches the runner applied (embedding on/off, ui mode, pacing). */
  switches: Record<string, string | number | boolean>
}

export interface DbIntegrity {
  /** Result of `PRAGMA quick_check` on the isolated databases after a clean shutdown. */
  checked: boolean
  results: Array<{ file: string; ok: boolean; detail?: string }>
}

export interface ReportInputs {
  meta: RunMeta
  results: CheckResult[]
  monitor: MonitorSummary
  db: DbIntegrity
  /** Counts by class of scenarios the plan contained; used to show coverage vs execution. */
  planned: Partial<Record<ScenarioClass, number>>
  /** scenario id -> its `dims`; lets the report compare cases (format, name style, write mode, ...). */
  dims: Record<string, Record<string, string | number | boolean>>
  /** Scenario ids the runner never started (aborted run). */
  notRun: string[]
  /** Overrides any subset of the report's gate limits. */
  limits?: Partial<ReportLimits>
}

/** Limits `buildReport` applies. G3/G4 are provisional until calibrated against real runs of the app. */
export interface ReportLimits {
  /** G3: warn when p95 of create-image `sinceStepsMs` is above this. */
  indexP95WarnMs: number
  /** G3: fail when p99 is above this; a created image that never became searchable counts as infinite. */
  indexP99FailMs: number
  /** G4: warn when p95 of `answerMs` over steady-state present checks is above this. */
  answerP95WarnMs: number
  /** G4: fail when p99 is above this. */
  answerP99FailMs: number
  /** G9: fail when the monitor was blind for more than this share of the run. */
  blindShareFail: number
  /** G2: fail when more than this share of checks ended in `error` or `skipped`. */
  undecidedShareFail: number
  /** G7: frames must have been measured for at least this share of the sampled time, else the gate is `unknown`. */
  frameCoverageMin: number
  /** Case comparison flags a dimension value whose p95 exceeds this multiple of the p95 of the rest of its class. */
  outlierFactor: number
}

export interface GateResult {
  id: string
  title: string
  status: 'pass' | 'fail' | 'warn' | 'unknown'
  detail: string
}

export interface Report {
  verdict: 'pass' | 'fail'
  gates: GateResult[]
  json: unknown
  markdown: string
}

// ---------------------------------------------------------------------------------------------
// Entry points the runner imports. `monitor/index.ts` exports `createMonitor`, `report/index.ts`
// exports `buildReport` and `writeReport`; tests of the runner use their own fake StressMonitor.
// ---------------------------------------------------------------------------------------------

export interface MonitorOptions {
  thresholds?: Partial<Thresholds>
  /** Probe period, default 1000. */
  intervalMs?: number
  /** One line per notable event; the runner prints it. */
  log?: (line: string) => void
  /** Injectable for tests. */
  now?: () => number
}

export type CreateMonitor = (handles: AppHandles, options?: MonitorOptions) => StressMonitor

export type BuildReport = (inputs: ReportInputs) => Report

export type WriteReport = (
  dir: string,
  report: Report
) => Promise<{ jsonFile: string; markdownFile: string }>
