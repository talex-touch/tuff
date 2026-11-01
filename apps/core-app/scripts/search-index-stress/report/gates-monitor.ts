import type { BreachKind, FrameMetric, GateResult } from '../eval-types'
import {
  fmtCpu,
  fmtDuration,
  fmtMb,
  fmtMs,
  fmtPct,
  offset,
  plural,
  thousands,
  truncate
} from './format'
import { gate, type GateContext, type Status } from './gate-types'
import type { KindTally, MonitorSection } from './monitor-section'

function kindTotals(
  ctx: GateContext,
  kinds: readonly BreachKind[]
): { warn: number; fail: number } {
  const total = { warn: 0, fail: 0 }
  for (const kind of kinds) {
    const tally: KindTally | undefined = ctx.monitor.breaches.byKind[kind]
    if (!tally) continue
    total.warn += tally.warn
    total.fail += tally.fail
  }
  return total
}

const episodes = (counts: { warn: number; fail: number }): string =>
  `${counts.fail} fail + ${counts.warn} warn`

/** The monitor wrote nothing: nothing it would have reported can be believed absent. */
function monitorSilent(ctx: GateContext): boolean {
  return ctx.monitor.timeline.lines === 0 && ctx.monitor.phases.length === 0
}

/** G5: the main process event loop and the renderer main threads do not stall. */
export function responsiveness(ctx: GateContext): GateResult {
  const title = 'Main-thread responsiveness'
  const { monitor, inputs } = ctx
  const limit = monitor.thresholds.mainLoopBlockMs
  const loop = kindTotals(ctx, ['main-loop-block'])
  const p99 = kindTotals(ctx, ['main-loop-p99'])
  const renderer = kindTotals(ctx, ['renderer-block'])
  const lags = inputs.monitor.appReportedLag ?? []
  const appFail = lags.filter((lag) => lag.lagMs >= limit.fail)
  const appWarn = lags.filter((lag) => lag.lagMs >= limit.warn && lag.lagMs < limit.fail)
  const { loop: loopStats, renderer: rendererStats } = monitor.aggregate

  const detail =
    `main loop max block ${fmtMs(loopStats.maxBlockMs)} (warn ${fmtMs(limit.warn)} / fail ${fmtMs(limit.fail)}), worst per-window p99 ${fmtMs(loopStats.worstWindowP99Ms)}; ` +
    `episodes: blocks ${episodes(loop)}, p99 windows ${episodes(p99)}, renderer ${episodes(renderer)} (max ${fmtMs(rendererStats.maxBlockMs)}); ` +
    `app reported ${plural(appFail.length, 'lag')} >= ${fmtMs(limit.fail)} (max ${fmtMs(monitor.lag.maxAppLagMs)})`

  if (loop.fail + p99.fail + renderer.fail + appFail.length > 0)
    return gate('G5', title, 'fail', detail)
  if (loopStats.samples === 0 && monitor.lag.appReported === 0) {
    return gate(
      'G5',
      title,
      'unknown',
      `no main-loop sample was recorded, so responsiveness is unproven; ${detail}`
    )
  }
  const warned = loop.warn + p99.warn + renderer.warn + appWarn.length > 0
  return gate('G5', title, warned ? 'warn' : 'pass', detail)
}

/** G6: CPU and memory stay modest. */
export function resources(ctx: GateContext): GateResult {
  const title = 'CPU and memory'
  const { monitor } = ctx
  const cpuLimit = monitor.thresholds.cpuPct
  const rssLimit = monitor.thresholds.rssMb
  const cpu = kindTotals(ctx, ['cpu'])
  const rss = kindTotals(ctx, ['rss'])
  const { cpu: cpuStats, rss: rssStats } = monitor.aggregate
  const detail =
    `app CPU mean ${fmtCpu(cpuStats.mean)}, worst-phase p95 ${fmtCpu(cpuStats.worstPhaseP95)}, max ${fmtCpu(cpuStats.max)} of one core (warn ${fmtCpu(cpuLimit.warn)} / fail ${fmtCpu(cpuLimit.fail)} over 5 s); ` +
    `RSS max ${fmtMb(rssStats.max)} (warn ${fmtMb(rssLimit.warn)} / fail ${fmtMb(rssLimit.fail)}); episodes: cpu ${episodes(cpu)}, rss ${episodes(rss)}`
  if (cpu.fail + rss.fail > 0) return gate('G6', title, 'fail', detail)
  if (cpuStats.samples === 0 || rssStats.samples === 0) {
    const missing = cpuStats.samples === 0 ? 'CPU' : 'RSS'
    return gate(
      'G6',
      title,
      'unknown',
      `no ${missing} sample was recorded, so resource use is unproven; ${detail}`
    )
  }
  return gate('G6', title, cpu.warn + rss.warn > 0 ? 'warn' : 'pass', detail)
}

const FRAME_LIMITS: ReadonlyArray<{
  metric: FrameMetric
  label: string
  peak: (value: number) => string
}> = [
  { metric: 'over-20ms-share', label: '>20 ms share', peak: (value) => fmtPct(value) },
  { metric: 'over-50ms-share', label: '>50 ms share', peak: (value) => fmtPct(value) },
  { metric: 'worst-frame', label: 'worst frame', peak: (value) => fmtMs(value) }
]

/** "(>20 ms share 1 fail + 0 warn, peak 8.2%; ...)": which limit each frame-drop episode crossed. */
function dropBreakdown(monitor: MonitorSection): string {
  const parts: string[] = []
  for (const { metric, label, peak } of FRAME_LIMITS) {
    const tally = monitor.breaches.byFrameMetric[metric]
    if (tally) parts.push(`${label} ${episodes(tally)}, peak ${peak(tally.max)}`)
  }
  return parts.length > 0 ? ` (${parts.join('; ')})` : ''
}

/** Whole-run share of frames over 20 ms among the windows that counted them, e.g. "2.1% over 20 ms, ". */
function droppedShare(windows: MonitorSection['windows']): string {
  let frames = 0
  let slow = 0
  for (const entry of windows) {
    if (entry.over20ms === undefined) continue
    frames += entry.frames
    slow += entry.over20ms
  }
  return frames > 0 ? `${fmtPct(slow / frames)} over 20 ms, ` : ''
}

/** G7: a visible window kept delivering frames. Unknown when no window was visible. */
export function frames(ctx: GateContext): GateResult {
  const title = 'Frame delivery'
  const { monitor, limits } = ctx
  const drops = kindTotals(ctx, ['frame-drop'])
  const totals = monitor.aggregate.frames
  const {
    frameOver20msRatio: dropped,
    frameOver50msRatio: slow,
    frameWorstMs: worst
  } = monitor.thresholds
  const measured =
    totals.total > 0
      ? `${thousands(totals.total)} frames, ${droppedShare(monitor.windows)}${fmtPct(totals.over50ms / totals.total)} over 50 ms, worst ${fmtMs(totals.worstMs)}`
      : 'no frames measured'
  const lines =
    `limits per 10 s window: >20 ms share ${fmtPct(dropped.warn)} warn / ${fmtPct(dropped.fail)} fail, ` +
    `>50 ms share ${fmtPct(slow.warn)} / ${fmtPct(slow.fail)}, worst frame ${fmtMs(worst.warn)} / ${fmtMs(worst.fail)}`
  const episodesText = `frame-drop episodes ${episodes(drops)}${dropBreakdown(monitor)}`

  if (drops.fail > 0) return gate('G7', title, 'fail', `${episodesText}; ${measured}; ${lines}`)
  if (totals.total === 0) {
    return gate(
      'G7',
      title,
      'unknown',
      `no visible window delivered frames in any phase, so frame drops are unproven (run with a visible window); ${episodesText}`
    )
  }
  if (totals.coverage < limits.frameCoverageMin) {
    const unseen = totals.phasesUnmeasured.join(', ')
    return gate(
      'G7',
      title,
      'unknown',
      `frames were measured in ${fmtPct(totals.coverage, 0)} of sampled time (needs ${fmtPct(limits.frameCoverageMin, 0)}); no visible window in ${unseen}; ${measured}`
    )
  }
  return gate(
    'G7',
    title,
    drops.warn > 0 ? 'warn' : 'pass',
    `${measured}; ${episodesText}; ${lines}`
  )
}

/** G8: the run triggered no database repair and every database passes quick_check. */
export function database(ctx: GateContext): GateResult {
  const title = 'Database integrity'
  const { database: db } = ctx
  const repairs = db.markers.filter((marker) => marker.cls === 'repair')
  const suspects = db.markers.filter((marker) => marker.cls === 'suspect')
  const { repairCount } = db
  const badFiles = db.files.filter((file) => !file.ok)
  const detail =
    `${plural(repairCount, 'repair marker')}, ${plural(db.quarantineFiles.length, 'quarantined file')}, ` +
    `quick_check ok on ${db.files.length - badFiles.length} of ${db.files.length} files` +
    `${suspects.length > 0 ? `; ${suspects.length} suspect marker kinds (${suspects.map((marker) => marker.id).join(', ')})` : ''}` +
    `${repairs.length > 0 ? `; first: ${truncate(repairs[0].sample, 140)}` : ''}`
  if (repairCount > 0 || db.quarantineFiles.length > 0 || badFiles.length > 0) {
    const bad =
      badFiles.length > 0
        ? `; failing: ${badFiles
            .map((file) => file.file)
            .slice(0, 5)
            .join(', ')}`
        : ''
    return gate('G8', title, 'fail', `${detail}${bad}`)
  }
  if (!db.checked || db.files.length === 0) {
    return gate(
      'G8',
      title,
      'unknown',
      `quick_check did not run after shutdown, so integrity is unproven; ${detail}`
    )
  }
  return gate('G8', title, suspects.length > 0 ? 'warn' : 'pass', detail)
}

/** G9: the monitor could see the app for nearly the whole run. */
export function monitorIntegrity(ctx: GateContext): GateResult {
  const title = 'Monitor integrity'
  const { monitor, limits } = ctx
  if (monitorSilent(ctx))
    return gate(
      'G9',
      title,
      'unknown',
      'the monitor wrote 0 samples, so nothing it would have reported can be trusted'
    )
  const severe = monitor.lag.unmatchedSevere
  const detail =
    `blind ${fmtMs(monitor.blind.ms)} of ${fmtDuration(monitor.durationMs)} (${fmtPct(monitor.blind.share, 2)}, limit ${fmtPct(limits.blindShareFail)}); ` +
    `timeline ${thousands(monitor.timeline.lines)} lines, ${thousands(monitor.timeline.linesDropped)} dropped; ` +
    `${plural(severe, 'app-reported lag')} the probes missed; ${plural(monitor.notes.length, 'caveat')}`
  if (monitor.blind.share > limits.blindShareFail) return gate('G9', title, 'fail', detail)
  const status: Status = monitor.timeline.linesDropped > 0 || severe > 0 ? 'warn' : 'pass'
  return gate('G9', title, status, detail)
}

/** G10: the app stayed up for the whole run. */
export function processStability(ctx: GateContext): GateResult {
  const title = 'Process stability'
  const { monitor } = ctx
  const exits = ctx.inputs.monitor.breaches.filter((breach) => breach.kind === 'process-exit')
  if (exits.length > 0) {
    const first = exits[0]
    const when = `${offset(first.at, monitor.startedAt)} in ${first.phase}`
    return gate(
      'G10',
      title,
      'fail',
      `${plural(exits.length, 'exit')} observed, first at ${when}${first.detail ? `: ${truncate(first.detail, 160)}` : ''}`
    )
  }
  if (monitorSilent(ctx))
    return gate(
      'G10',
      title,
      'unknown',
      'the monitor wrote 0 samples, so process liveness is unproven'
    )
  return gate(
    'G10',
    title,
    'pass',
    `no process exit observed in ${fmtDuration(monitor.durationMs)}`
  )
}
