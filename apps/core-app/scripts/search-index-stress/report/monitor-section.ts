import type {
  Breach,
  BreachKind,
  DbIntegrity,
  FrameMetric,
  MonitorSummary,
  PhaseSummary,
  ReportInputs
} from '../eval-types'
import { APP_LAG_FLOOR_MS } from './limits'

export interface PhaseRow extends Omit<PhaseSummary, 'breaches'> {
  durationMs: number
  breachCount: number
}

export interface BreachRow extends Breach {
  /** Milliseconds since the monitor started. */
  offsetMs: number
}

export interface KindTally {
  warn: number
  fail: number
  /** Largest `value` seen, in the kind's own unit (ms, percent, MB, ratio). */
  max: number
}

export interface AttributionRow {
  label: string
  count: number
  maxLagMs: number
}

export interface LagCrossCheck {
  /** The app's own detector reports nothing below this. */
  appFloorMs: number
  appReported: number
  /** App-reported lags that fall inside a probe episode. */
  matched: number
  unmatched: number
  /** Unmatched ones at or above the main-loop fail limit: stalls the app saw and the probes missed. */
  unmatchedSevere: number
  unmatchedSample: Array<{ at: number; lagMs: number; suspect?: string; contexts?: string[] }>
  /** Probe main-loop episodes at or above the app's floor. */
  probeEpisodes: number
  probeOnly: number
  maxAppLagMs: number
  maxProbeBlockMs: number
  bySuspect: AttributionRow[]
  byContext: AttributionRow[]
}

export interface FrameTotals {
  total: number
  over33ms: number
  over50ms: number
  over100ms: number
  worstMs: number
  phasesMeasured: string[]
  phasesUnmeasured: string[]
  /** Share of sampled time that falls in phases where a visible window delivered frames. */
  coverage: number
}

export interface MonitorAggregate {
  cpu: { samples: number; mean: number; max: number; worstPhaseP95: number }
  rss: { samples: number; max: number }
  loop: { samples: number; maxBlockMs: number; worstWindowP99Ms: number }
  renderer: { samples: number; maxBlockMs: number }
  frames: FrameTotals
}

export interface MonitorSection {
  startedAt: number
  endedAt: number
  durationMs: number
  intervalMs: number | null
  thresholds: MonitorSummary['thresholds']
  phases: PhaseRow[]
  aggregate: MonitorAggregate
  breaches: {
    total: number
    byKind: Partial<Record<BreachKind, KindTally>>
    /** The `frame-drop` episodes split by the limit they crossed. */
    byFrameMetric: Partial<Record<FrameMetric, KindTally>>
    list: BreachRow[]
    omitted: number
  }
  blind: { ms: number; share: number; byProbe: Record<string, number> }
  windows: NonNullable<MonitorSummary['windows']>
  notes: string[]
  harnessCpuPct: MonitorSummary['harnessCpuPct'] | null
  timeline: { file: string; lines: number; linesDropped: number }
  lag: LagCrossCheck
}

export interface DatabaseSection {
  /** `PRAGMA quick_check` ran after a clean shutdown. */
  checked: boolean
  files: DbIntegrity['results']
  /** Repair markers the run triggered: the largest of the monitor's list, the repair-class log hits and the repair breaches. */
  repairCount: number
  repairMarkers: string[]
  quarantineFiles: string[]
  markers: NonNullable<MonitorSummary['logMarkers']>
}

const BREACHES_KEPT = 400

function span(
  monitor: MonitorSummary,
  inputs: ReportInputs
): { startedAt: number; endedAt: number } {
  if (monitor.endedAt > monitor.startedAt)
    return { startedAt: monitor.startedAt, endedAt: monitor.endedAt }
  return { startedAt: inputs.meta.startedAt, endedAt: inputs.meta.endedAt }
}

function aggregate(phases: readonly PhaseRow[]): MonitorAggregate {
  let cpuSamples = 0
  let cpuSum = 0
  let cpuMax = 0
  let cpuP95 = 0
  let rssSamples = 0
  let rssMax = 0
  let loopSamples = 0
  let loopBlock = 0
  let loopP99 = 0
  let rendererSamples = 0
  let rendererBlock = 0
  const frames: FrameTotals = {
    total: 0,
    over33ms: 0,
    over50ms: 0,
    over100ms: 0,
    worstMs: 0,
    phasesMeasured: [],
    phasesUnmeasured: [],
    coverage: 0
  }
  let sampledSpan = 0
  let measuredSpan = 0
  for (const phase of phases) {
    cpuSamples += phase.cpuPct.count
    cpuSum += phase.cpuPct.mean * phase.cpuPct.count
    cpuMax = Math.max(cpuMax, phase.cpuPct.max)
    cpuP95 = Math.max(cpuP95, phase.cpuPct.p95)
    rssSamples += phase.rssMb.count
    rssMax = Math.max(rssMax, phase.rssMb.max)
    loopSamples += phase.loopDelayMs.count
    loopBlock = Math.max(loopBlock, phase.loopMaxBlockMs)
    loopP99 = Math.max(loopP99, phase.loopDelayMs.max)
    rendererSamples += phase.rendererBlockMs.count
    rendererBlock = Math.max(rendererBlock, phase.rendererBlockMs.max)

    const sampled = phase.cpuPct.count > 0 || phase.loopDelayMs.count > 0 || phase.frames !== null
    if (sampled) sampledSpan += phase.durationMs
    if (phase.frames && phase.frames.total > 0) {
      frames.total += phase.frames.total
      frames.over33ms += phase.frames.over33ms
      frames.over50ms += phase.frames.over50ms
      frames.over100ms += phase.frames.over100ms
      frames.worstMs = Math.max(frames.worstMs, phase.frames.worstMs)
      frames.phasesMeasured.push(phase.phase)
      measuredSpan += phase.durationMs
    } else if (sampled) {
      frames.phasesUnmeasured.push(phase.phase)
    }
  }
  frames.coverage = sampledSpan > 0 ? Math.min(1, measuredSpan / sampledSpan) : 0
  return {
    cpu: {
      samples: cpuSamples,
      mean: cpuSamples > 0 ? cpuSum / cpuSamples : 0,
      max: cpuMax,
      worstPhaseP95: cpuP95
    },
    rss: { samples: rssSamples, max: rssMax },
    loop: { samples: loopSamples, maxBlockMs: loopBlock, worstWindowP99Ms: loopP99 },
    renderer: { samples: rendererSamples, maxBlockMs: rendererBlock },
    frames
  }
}

function tallyBreaches(breaches: readonly Breach[]): Partial<Record<BreachKind, KindTally>> {
  const byKind: Partial<Record<BreachKind, KindTally>> = {}
  for (const breach of breaches) {
    const tally = (byKind[breach.kind] ??= { warn: 0, fail: 0, max: 0 })
    tally[breach.severity]++
    tally.max = Math.max(tally.max, breach.value)
  }
  return byKind
}

/** Breaches written before the 20 ms share existed carry no metric: a ratio limit then belongs to the 50 ms share. */
export function frameMetricOf(breach: Breach): FrameMetric {
  return breach.metric ?? (breach.limit <= 1 ? 'over-50ms-share' : 'worst-frame')
}

function tallyFrameMetrics(breaches: readonly Breach[]): Partial<Record<FrameMetric, KindTally>> {
  const byMetric: Partial<Record<FrameMetric, KindTally>> = {}
  for (const breach of breaches) {
    if (breach.kind !== 'frame-drop') continue
    const tally = (byMetric[frameMetricOf(breach)] ??= { warn: 0, fail: 0, max: 0 })
    tally[breach.severity]++
    tally.max = Math.max(tally.max, breach.value)
  }
  return byMetric
}

function attribution(entries: Map<string, AttributionRow>, label: string, lagMs: number): void {
  const row = entries.get(label)
  if (row) {
    row.count++
    row.maxLagMs = Math.max(row.maxLagMs, lagMs)
  } else {
    entries.set(label, { label, count: 1, maxLagMs: lagMs })
  }
}

const TOP_ATTRIBUTIONS = 8

function topRows(entries: Map<string, AttributionRow>): AttributionRow[] {
  return [...entries.values()]
    .sort((a, b) => b.count - a.count || b.maxLagMs - a.maxLagMs || (a.label < b.label ? -1 : 1))
    .slice(0, TOP_ATTRIBUTIONS)
}

/** First index in an ascending array whose value is >= `bound`. */
function lowerBound(sorted: readonly number[], bound: number): number {
  let lo = 0
  let hi = sorted.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (sorted[mid] < bound) lo = mid + 1
    else hi = mid
  }
  return lo
}

export function crossCheckLag(monitor: MonitorSummary): LagCrossCheck {
  const lags = monitor.appReportedLag ?? []
  const tolerance = Math.max(2_000, 2 * (monitor.intervalMs ?? 1_000))
  const episodes = monitor.breaches
    .filter((breach) => breach.kind === 'main-loop-block' || breach.kind === 'main-loop-p99')
    .sort((a, b) => a.at - b.at)
  const starts = episodes.map((episode) => episode.at)
  const seenByApp = new Set<number>()
  const bySuspect = new Map<string, AttributionRow>()
  const byContext = new Map<string, AttributionRow>()
  const severeLimit = monitor.thresholds.mainLoopBlockMs.fail
  const unmatchedSample: LagCrossCheck['unmatchedSample'] = []
  let matched = 0
  let unmatchedSevere = 0
  let maxAppLag = 0

  for (const lag of lags) {
    maxAppLag = Math.max(maxAppLag, lag.lagMs)
    attribution(bySuspect, lag.suspect ?? 'unattributed', lag.lagMs)
    for (const context of new Set(lag.contexts ?? [])) attribution(byContext, context, lag.lagMs)
    const low = lowerBound(starts, lag.at - lag.lagMs - tolerance)
    const high = lowerBound(starts, lag.at + tolerance + 1)
    if (high > low) {
      matched++
      for (let index = low; index < high; index++) seenByApp.add(index)
    } else {
      if (lag.lagMs >= severeLimit) unmatchedSevere++
      if (unmatchedSample.length < 10) unmatchedSample.push(lag)
    }
  }

  let probeEpisodes = 0
  let probeOnly = 0
  let maxProbe = 0
  episodes.forEach((episode, index) => {
    if (episode.kind !== 'main-loop-block') return
    maxProbe = Math.max(maxProbe, episode.value)
    if (episode.value < APP_LAG_FLOOR_MS) return
    probeEpisodes++
    if (!seenByApp.has(index)) probeOnly++
  })

  return {
    appFloorMs: APP_LAG_FLOOR_MS,
    appReported: lags.length,
    matched,
    unmatched: lags.length - matched,
    unmatchedSevere,
    unmatchedSample,
    probeEpisodes,
    probeOnly,
    maxAppLagMs: maxAppLag,
    maxProbeBlockMs: maxProbe,
    bySuspect: topRows(bySuspect),
    byContext: topRows(byContext)
  }
}

export function buildMonitorSection(inputs: ReportInputs): MonitorSection {
  const { monitor } = inputs
  const { startedAt, endedAt } = span(monitor, inputs)
  const durationMs = Math.max(0, endedAt - startedAt)
  const phases: PhaseRow[] = monitor.phases.map(({ breaches, ...phase }) => ({
    ...phase,
    durationMs: Math.max(0, phase.endedAt - phase.startedAt),
    breachCount: breaches.length
  }))
  const ordered = [...monitor.breaches].sort(
    (a, b) => Number(b.severity === 'fail') - Number(a.severity === 'fail') || a.at - b.at
  )
  const list = ordered
    .slice(0, BREACHES_KEPT)
    .map((breach) => ({ ...breach, offsetMs: Math.max(0, breach.at - startedAt) }))
  return {
    startedAt,
    endedAt,
    durationMs,
    intervalMs: monitor.intervalMs ?? null,
    thresholds: monitor.thresholds,
    phases,
    aggregate: aggregate(phases),
    breaches: {
      total: monitor.breaches.length,
      byKind: tallyBreaches(monitor.breaches),
      byFrameMetric: tallyFrameMetrics(monitor.breaches),
      list,
      omitted: Math.max(0, ordered.length - list.length)
    },
    blind: {
      ms: monitor.blindMs,
      share: durationMs > 0 ? monitor.blindMs / durationMs : 0,
      byProbe: monitor.blindByProbe ?? {}
    },
    windows: monitor.windows ?? [],
    notes: monitor.notes ?? [],
    harnessCpuPct: monitor.harnessCpuPct ?? null,
    timeline: {
      file: monitor.timelineFile,
      lines: monitor.samplesWritten,
      linesDropped: monitor.timelineLinesDropped ?? 0
    },
    lag: crossCheckLag(monitor)
  }
}

export function buildDatabaseSection(monitor: MonitorSummary, db: DbIntegrity): DatabaseSection {
  const markers = monitor.logMarkers ?? []
  const repairHits = markers
    .filter((marker) => marker.cls === 'repair')
    .reduce((sum, marker) => sum + marker.count, 0)
  const repairBreaches = monitor.breaches.filter(
    (breach) => breach.kind === 'db-repair-marker' && breach.severity === 'fail'
  ).length
  return {
    checked: db.checked,
    files: db.results,
    repairCount: Math.max(monitor.dbRepairMarkers.length, repairHits, repairBreaches),
    repairMarkers: monitor.dbRepairMarkers.slice(0, 50),
    quarantineFiles: monitor.quarantineFiles ?? [],
    markers
  }
}
