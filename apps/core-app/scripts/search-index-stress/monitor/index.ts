import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type {
  AppHandles,
  Breach,
  CreateMonitor,
  MonitorOptions,
  MonitorSummary,
  Pressure,
  StressMonitor,
  Thresholds
} from '../eval-types'
import { BlindTracker } from './blind'
import { findQuarantineFiles } from './db-markers'
import { Episodes } from './episodes'
import { PhaseBook } from './phases'
import { PressureGauge } from './pressure'
import type { ProbeContext } from './probes/context'
import { LogProbe, STDOUT_LOG } from './probes/logs'
import { MainLoopProbe } from './probes/main-loop'
import { ProcessProbe, type LookupName, type RunPs } from './probes/process-cpu'
import { RendererProbe } from './probes/renderer'
import { spawnMacSample, StallSampler, type SpawnSample } from './sample'
import { round } from './stats'
import { resolveThresholds } from './thresholds'
import { Timeline } from './timeline'

export {
  DEFAULT_THRESHOLDS,
  LEVEL_KEYS,
  resolveThresholds,
  type ThresholdOverrides
} from './thresholds'

const FAST_MS = 100
const MAX_MARKS = 5
const QUARANTINE_SCAN_MS = 10_000
const STOP_WAIT_MS = 3_000
const SAMPLE_WAIT_MS = 6_000
const MIN_PHASE_SPAN_MS = 2_000
const INITIAL_PHASE = 'unphased'

/** Test seam: timers and the shell-outs the monitor makes. Production code passes nothing. */
export interface Scheduler {
  /** Calls `fn` every `ms` until the returned function is called. */
  every(fn: () => void, ms: number): () => void
}

export interface MonitorDeps {
  scheduler?: Scheduler
  spawnSample?: SpawnSample
  runPs?: RunPs
  lookupName?: LookupName
}

const realScheduler: Scheduler = {
  every(fn, ms) {
    const timer = setInterval(fn, ms)
    timer.unref()
    return () => clearInterval(timer)
  }
}

function formatBreachLine(breach: Breach, change: 'open' | 'escalate'): string {
  const head = change === 'escalate' ? 'ESCALATED to FAIL' : breach.severity.toUpperCase()
  return `[monitor] ${head} ${breach.kind} [${breach.phase}] ${breach.detail ?? ''}`.trimEnd()
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

class Monitor implements StressMonitor {
  private readonly now: () => number
  private readonly intervalMs: number
  private readonly log: (line: string) => void
  private readonly thresholds: Thresholds
  private readonly episodes: Episodes
  private readonly blind: BlindTracker
  private readonly phases: PhaseBook
  private readonly gauge: PressureGauge
  private readonly timeline: Timeline
  private readonly sampler: StallSampler
  private readonly processProbe: ProcessProbe
  private readonly mainLoop: MainLoopProbe
  private readonly renderer: RendererProbe
  private readonly logs: LogProbe
  private readonly scheduler: Scheduler
  private readonly listeners = new Set<(breach: Breach) => void>()
  private readonly marks: string[] = []
  private readonly notes = new Set<string>()
  private readonly inflight = new Set<Promise<unknown>>()
  private readonly cancels: Array<() => void> = []
  private readonly quarantineSeen = new Set<string>()
  private readonly quarantineNew: string[] = []
  private readonly failures = new Map<string, number>()
  private readonly harness = { cpuUs: 0, wallMs: 0, maxPct: 0 }

  private startedAt = 0
  private started = false
  private exited = false
  private stopping: Promise<MonitorSummary> | null = null
  private lastQuarantineScanAt = -Infinity
  private lastCpu = process.cpuUsage()
  private lastWall = performance.now()

  constructor(
    private readonly handles: AppHandles,
    options: MonitorOptions,
    deps: MonitorDeps
  ) {
    this.now = options.now ?? Date.now
    this.intervalMs = options.intervalMs ?? 1_000
    if (!Number.isFinite(this.intervalMs) || this.intervalMs < FAST_MS) {
      throw new Error(`invalid intervalMs: ${this.intervalMs}`)
    }
    this.log = options.log ?? (() => undefined)
    this.thresholds = resolveThresholds(options.thresholds)
    this.scheduler = deps.scheduler ?? realScheduler

    this.episodes = new Episodes({
      now: this.now,
      phase: () => this.phases.name,
      marks: () => [...this.marks],
      emit: (breach, change) => this.onEpisode(breach, change)
    })
    this.blind = new BlindTracker(this.now, this.episodes)
    this.phases = new PhaseBook(INITIAL_PHASE, this.now())
    this.gauge = new PressureGauge(this.episodes, this.thresholds, this.now)
    this.timeline = new Timeline(join(handles.evidenceDir, 'timeline.ndjson'))
    this.sampler = new StallSampler({
      evidenceDir: handles.evidenceDir,
      mainPid: handles.mainPid,
      now: this.now,
      spawn: deps.spawnSample ?? spawnMacSample,
      log: this.log
    })

    const ctx: ProbeContext = {
      handles,
      thresholds: this.thresholds,
      intervalMs: this.intervalMs,
      now: this.now,
      log: this.log,
      episodes: this.episodes,
      blind: this.blind,
      phases: this.phases,
      timeline: (kind, record) =>
        this.timeline.write(kind, { t: this.now(), ph: this.phases.name, ...record }),
      note: (text) => {
        if (this.notes.has(text)) return
        this.notes.add(text)
        this.log(`[monitor] note: ${text}`)
      }
    }
    this.processProbe = new ProcessProbe(ctx, { runPs: deps.runPs, lookupName: deps.lookupName })
    this.mainLoop = new MainLoopProbe(ctx, this.sampler)
    this.renderer = new RendererProbe(ctx)
    this.logs = new LogProbe(ctx)
  }

  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    await mkdir(this.handles.evidenceDir, { recursive: true })
    await this.timeline.open()
    this.startedAt = this.now()
    for (const file of await findQuarantineFiles(this.handles.profileDir))
      this.quarantineSeen.add(file)
    this.event({
      k: 'start',
      pid: this.handles.mainPid,
      intervalMs: this.intervalMs,
      thresholds: this.thresholds
    })

    await Promise.allSettled([
      this.processProbe.poll(),
      this.mainLoop.connect(),
      this.renderer.refresh(),
      this.logs.poll()
    ])
    this.cancels.push(
      this.scheduler.every(() => this.fast(), FAST_MS),
      this.scheduler.every(() => this.tick(), this.intervalMs)
    )
  }

  setPhase(phase: string): void {
    this.phases.set(phase, this.now())
    this.event({ k: 'phase', phase })
  }

  mark(label: string): void {
    this.marks.push(label)
    if (this.marks.length > MAX_MARKS) this.marks.shift()
    this.event({ k: 'mark', label })
  }

  pressure(): { level: Pressure; reason?: string } {
    if (this.exited) return { level: 'critical', reason: 'the app process exited' }
    return this.gauge.read()
  }

  onBreach(listener: (breach: Breach) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  stop(): Promise<MonitorSummary> {
    this.stopping ??= this.finish()
    return this.stopping
  }

  private event(record: Record<string, unknown>): void {
    this.timeline.write('event', { t: this.now(), ph: this.phases.name, ...record })
  }

  private onEpisode(breach: Breach, change: 'open' | 'escalate'): void {
    this.event({
      k: change === 'open' ? 'breach' : 'breach-escalated',
      kind: breach.kind,
      severity: breach.severity,
      value: round(breach.value, 3),
      limit: breach.limit,
      detail: breach.detail,
      marks: breach.marks
    })
    this.log(formatBreachLine(breach, change))
    for (const listener of [...this.listeners]) {
      try {
        listener(breach)
      } catch (error) {
        this.log(`[monitor] breach listener threw: ${errorText(error)}`)
      }
    }
  }

  private track(work: Promise<unknown>, what: string): void {
    const tracked = work
      .catch((error: unknown) => {
        const seen = this.failures.get(what) ?? 0
        this.failures.set(what, seen + 1)
        if (seen < 3) this.log(`[monitor] ${what} failed: ${errorText(error)}`)
      })
      .finally(() => this.inflight.delete(tracked))
    this.inflight.add(tracked)
  }

  private fast(): void {
    if (this.exited) return
    this.mainLoop.watch()
    this.mainLoop.peek()
    this.renderer.watch()
  }

  private tick(): void {
    this.checkAlive()
    if (!this.exited) {
      this.track(
        this.processProbe.poll().then((cpu) => {
          if (cpu !== null) this.gauge.setCpu(cpu)
        }),
        'process probe'
      )
      this.track(this.mainLoop.tick(), 'main-loop probe')
      this.track(this.renderer.tick(), 'renderer probe')
      this.track(this.logs.poll(), 'log probe')
      if (this.now() - this.lastQuarantineScanAt >= QUARANTINE_SCAN_MS) {
        this.track(this.scanQuarantine(), 'quarantine scan')
      }
    }
    this.blind.evaluate()
    this.recordHarnessCost()
  }

  private checkAlive(): void {
    if (this.exited) return
    try {
      process.kill(this.handles.mainPid, 0)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') return
      this.exited = true
      this.episodes.point(
        'process-exit',
        'fail',
        1,
        0,
        `main process ${this.handles.mainPid} is gone`,
        {
          dedupeKey: 'process-exit'
        }
      )
      this.mainLoop.close()
      this.renderer.close()
      this.processProbe.close()
      this.blind.endAll()
    }
  }

  private async scanQuarantine(): Promise<void> {
    this.lastQuarantineScanAt = this.now()
    for (const file of await findQuarantineFiles(this.handles.profileDir)) {
      if (this.quarantineSeen.has(file)) continue
      this.quarantineSeen.add(file)
      this.quarantineNew.push(file)
      this.episodes.point(
        'db-repair-marker',
        'fail',
        1,
        0,
        `a quarantined database appeared: ${file}`,
        {
          dedupeKey: `quarantine:${file}`
        }
      )
    }
  }

  private recordHarnessCost(): void {
    const cpu = process.cpuUsage()
    const wall = performance.now()
    const cpuUs = cpu.user + cpu.system - (this.lastCpu.user + this.lastCpu.system)
    const wallMs = wall - this.lastWall
    this.lastCpu = cpu
    this.lastWall = wall
    if (wallMs <= 0) return
    const pct = (cpuUs / 1000 / wallMs) * 100
    this.harness.cpuUs += cpuUs
    this.harness.wallMs += wallMs
    if (wallMs >= this.intervalMs * 0.5) this.harness.maxPct = Math.max(this.harness.maxPct, pct)
    this.timeline.write('tick', {
      t: this.now(),
      ph: this.phases.name,
      k: 'harness',
      cpuPct: round(pct, 1)
    })
  }

  private async finish(): Promise<MonitorSummary> {
    for (const cancel of this.cancels.splice(0)) cancel()
    await this.settleWithin(Promise.allSettled([...this.inflight]), STOP_WAIT_MS)
    if (this.started && !this.exited) {
      await this.logs.poll(true).catch(() => undefined)
      await this.scanQuarantine().catch(() => undefined)
    }
    this.episodes.closeAll()
    await this.settleWithin(this.sampler.settle(), SAMPLE_WAIT_MS)
    const endedAt = this.now()
    this.mainLoop.close()
    this.renderer.close()
    this.processProbe.close()

    const breaches = [...this.episodes.all].sort((a, b) => a.at - b.at)
    const harnessAvg =
      this.harness.wallMs > 0 ? (this.harness.cpuUs / 1000 / this.harness.wallMs) * 100 : 0
    const summary: MonitorSummary = {
      startedAt: this.startedAt || endedAt,
      endedAt,
      phases: this.phases.summaries(breaches, endedAt, MIN_PHASE_SPAN_MS),
      breaches,
      blindMs: Math.round(this.blind.totalMs(endedAt)),
      samplesWritten: 0,
      timelineFile: this.timeline.file,
      dbRepairMarkers: [
        ...this.logs.repairMarkers,
        ...this.quarantineNew.map((file) => `quarantined: ${file}`)
      ],
      thresholds: this.thresholds,
      appReportedLag: this.logs.appReportedLag,
      blindByProbe: this.blind.byFamily(endedAt),
      notes: [...this.notes],
      harnessCpuPct: { avg: round(harnessAvg, 1), max: round(this.harness.maxPct, 1) },
      windows: this.renderer.windows().map((stats) => ({
        label: stats.label,
        visibleSeconds: round((stats.visibleReads * this.intervalMs) / 1000),
        hiddenSeconds: round((stats.hiddenReads * this.intervalMs) / 1000),
        frames: stats.frames,
        over20ms: stats.over20ms,
        over50ms: stats.over50ms,
        worstFrameMs: round(stats.worstFrameMs),
        throttledIntervals: stats.throttledIntervals,
        worstBlockMs: round(stats.worstBlockMs)
      })),
      timelineLinesDropped: 0,
      logMarkers: this.logs.markerCounts,
      quarantineFiles: [...this.quarantineNew],
      intervalMs: this.intervalMs
    }
    this.event({ k: 'stop', breaches: breaches.length, blindMs: summary.blindMs })
    await this.timeline.close()
    summary.samplesWritten = this.timeline.lines
    summary.timelineLinesDropped = this.timeline.dropped
    return summary
  }

  private async settleWithin(work: Promise<unknown>, ms: number): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const limit = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, ms)
    })
    try {
      await Promise.race([work.catch(() => undefined), limit])
    } finally {
      clearTimeout(timer)
    }
  }
}

export const createMonitorWith = (
  handles: AppHandles,
  options: MonitorOptions = {},
  deps: MonitorDeps = {}
): StressMonitor => new Monitor(handles, options, deps)

export const createMonitor: CreateMonitor = (handles, options) =>
  createMonitorWith(handles, options)

export { STDOUT_LOG }
