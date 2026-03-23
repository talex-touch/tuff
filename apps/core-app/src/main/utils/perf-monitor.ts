import type { IpcMainEvent } from 'electron'
import type { Primitive } from './logger'
import { performance } from 'node:perf_hooks'
import { formatPayloadPreview } from '@talex-touch/utils/common/utils/payload-preview'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { ipcMain, powerMonitor } from 'electron'
import { getSentryService } from '../modules/sentry/sentry-service'
import { createLogger, formatDuration } from './logger'
import {
  IPC_ERROR_MS,
  IPC_LOG_THROTTLE_MS,
  IPC_WARN_MS,
  LOOP_DIAGNOSTIC_ERROR_THROTTLE_MS,
  LOOP_DIAGNOSTIC_WARN_THROTTLE_MS,
  LOOP_LAG_ERROR_MS,
  LOOP_LAG_WARN_MS,
  LOOP_LOG_THROTTLE_MS,
  LOOP_SLEEP_SKIP_LOG_THROTTLE_MS,
  MAIN_ERROR_MS,
  MAIN_WARN_MS,
  MAX_INCIDENTS,
  PERF_SUMMARY_LOG_SLOW_MS,
  PERF_SUMMARY_LOG_TOP_LIMIT,
  PERF_SUMMARY_TOP_SLOW_MIN_MS,
  RENDERER_LOG_THROTTLE_MS,
  resolveUiThreshold,
  SEVERE_LAG_BURST_COOLDOWN_MS,
  SEVERE_LAG_BURST_THRESHOLD_MS,
  SEVERE_LAG_BURST_TRIGGER_COUNT,
  SEVERE_LAG_BURST_WINDOW_MS,
  SUMMARY_INTERVAL_MS,
  SYSTEM_SLEEP_THRESHOLD_MS
} from './perf-monitor-config'
import { getPerfContextSnapshot } from './perf-context'
import { appendWorkflowDebugLog } from './workflow-debug'
import { getHeapStatistics } from 'node:v8'

export interface RendererPerfReport {
  kind:
    | 'channel.sendSync.slow'
    | 'channel.send.slow'
    | 'channel.send.timeout'
    | 'channel.send.errorReply'
    | 'ui.route.navigate'
    | 'ui.route.render'
    | 'ui.route.transition'
    | 'ui.details.fetch'
    | 'ui.details.render'
    | 'ui.details.total'
    | 'ui.component.load'
  eventName: string
  durationMs: number
  at: number
  level?: 'warn' | 'error'
  payloadPreview?: string
  stack?: string
  meta?: Record<string, unknown>
}

export interface MainPerfReport {
  kind: string
  eventName?: string
  durationMs: number
  at?: number
  level?: 'warn' | 'error'
  meta?: Record<string, unknown>
}

type IpcDirection = 'renderer->main' | 'main->renderer'

interface PerfIncident {
  kind: string
  severity: 'warn' | 'error'
  at: number
  eventName?: string
  durationMs?: number
  direction?: IpcDirection
  meta?: Record<string, unknown>
  payloadPreview?: string
  stack?: string
}

export interface PerfSummary {
  at: number
  total: number
  errorCount: number
  kinds: string
  topSlow: Array<{ name: string; durationMs: number }>
  topEvents: Array<{ key: string; count: number }>
  topPhaseCodes: Array<{ code: string; count: number; maxDurationMs: number }>
}

interface PerfAggregate {
  count: number
  warnCount: number
  errorCount: number
  maxDurationMs: number
  lastAt: number
}

export interface EventLoopLagSnapshot {
  lagMs: number
  severity: 'warn' | 'error'
  at: number
}

export interface SevereLagBurstEvent {
  thresholdMs: number
  windowMs: number
  cooldownMs: number
  triggerCount: number
  latestLagMs: number
  at: number
}

type SevereLagBurstListener = (event: SevereLagBurstEvent) => void

const perfLog = createLogger('Perf')
const ipcPerfLog = perfLog.child('IPC')
const loopPerfLog = perfLog.child('EventLoop')
const powerMonitorAvailable = typeof powerMonitor?.on === 'function'

const PERF_REPORT_CHANNEL = 'touch:perf-report'
const PERF_LOOP_TASK_ID = 'perf-monitor.event-loop'
const PERF_SUMMARY_TASK_ID = 'perf-monitor.summary'
const PERF_HEAP_TASK_ID = 'perf-monitor.heap'

const pollingService = PollingService.getInstance()

let perfSummaryReporter: ((summary: PerfSummary) => void) | null = null

export function setPerfSummaryReporter(reporter: ((summary: PerfSummary) => void) | null): void {
  perfSummaryReporter = reporter
}

function pushWithCap<T>(arr: T[], item: T, cap: number): void {
  arr.push(item)
  if (arr.length > cap) {
    arr.splice(0, arr.length - cap)
  }
}

function toLogMeta(
  meta: Record<string, unknown> | undefined
): Record<string, Primitive> | undefined {
  if (!meta) return undefined

  const MAX_META_STRING_CHARS = 300
  const safe: Record<string, Primitive> = {}
  for (const [key, value] of Object.entries(meta)) {
    if (
      value === null ||
      value === undefined ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      if (typeof value === 'string') {
        safe[key] =
          value.length > MAX_META_STRING_CHARS ? `${value.slice(0, MAX_META_STRING_CHARS)}…` : value
      } else {
        safe[key] = value
      }
      continue
    }

    try {
      const encoded = JSON.stringify(value)
      safe[key] = encoded.length > 300 ? `${encoded.slice(0, 300)}…` : encoded
    } catch {
      safe[key] = '[unserializable]'
    }
  }
  return safe
}

function shouldSendToNexus(incident: PerfIncident): boolean {
  if (incident.severity === 'error') {
    return true
  }
  if (!incident.durationMs) {
    return false
  }
  switch (incident.kind) {
    case 'ui.component.load':
      return incident.durationMs >= 300
    case 'ui.route.navigate':
      return incident.durationMs >= 400
    case 'ui.route.transition':
      return incident.durationMs >= 600
    case 'ui.route.render':
      return incident.durationMs >= 700
    case 'ui.details.fetch':
    case 'ui.details.total':
      return incident.durationMs >= 1_000
    default:
      return false
  }
}

function queueNexusPerformance(incident: PerfIncident): void {
  if (!shouldSendToNexus(incident)) {
    return
  }
  try {
    const sentryService = getSentryService()
    if (!sentryService.isTelemetryEnabled()) {
      return
    }
    sentryService.queueNexusTelemetry({
      eventType: 'performance',
      metadata: {
        kind: incident.kind,
        severity: incident.severity,
        eventName: incident.eventName,
        durationMs:
          typeof incident.durationMs === 'number' ? Math.round(incident.durationMs) : undefined,
        direction: incident.direction,
        meta: incident.meta ? toLogMeta(incident.meta) : undefined
      }
    })
  } catch {
    // ignore nexus telemetry failures
  }
}

export class PerfMonitor {
  private incidents: PerfIncident[] = []
  private ipcAggregates = new Map<string, PerfAggregate>()
  private loopLagAggregate: PerfAggregate = {
    count: 0,
    warnCount: 0,
    errorCount: 0,
    maxDurationMs: 0,
    lastAt: 0
  }

  private lastLoopTick = 0
  private lastSlowIpc: {
    kind: string
    eventName: string
    durationMs: number
    at: number
  } | null = null

  private logThrottle = new Map<string, number>()
  private lastHeapSnapshotAt = 0
  private readonly heapSnapshotIntervalMs = 10_000
  private lastLoopDiagnosticKey = ''
  private lastEventLoopLag: EventLoopLagSnapshot | null = null
  private severeLagWindowHits: number[] = []
  private lastSevereLagBurstAt = 0
  private severeLagBurstListeners = new Set<SevereLagBurstListener>()
  private loopMonitorTimer: NodeJS.Timeout | null = null

  /** Timestamp (Date.now) of the most recent system resume, or 0 if none. */
  private systemResumedAt = 0
  /** Grace window after resume during which lags are attributed to sleep. */
  private static readonly RESUME_GRACE_MS = 5_000
  private powerListeners: Array<() => void> = []

  private shouldLog(key: string, throttleMs: number, now: number): boolean {
    const lastAt = this.logThrottle.get(key) ?? 0
    if (now - lastAt < throttleMs) {
      return false
    }
    this.logThrottle.set(key, now)
    return true
  }

  onSevereLagBurst(listener: SevereLagBurstListener): () => void {
    this.severeLagBurstListeners.add(listener)
    return () => {
      this.severeLagBurstListeners.delete(listener)
    }
  }

  getRecentEventLoopLagSnapshot(): EventLoopLagSnapshot | null {
    if (!this.lastEventLoopLag) return null
    return { ...this.lastEventLoopLag }
  }

  start(): void {
    this.registerPowerMonitorListeners()

    if (!this.loopMonitorTimer) {
      this.lastLoopTick = performance.now()
      this.loopMonitorTimer = setInterval(() => {
        const now = performance.now()
        const expected = this.lastLoopTick + 100
        const lag = Math.max(0, now - expected)
        this.lastLoopTick = now

        if (this.isLagFromSystemSleep(lag)) {
          const durationSec = Math.round(lag / 1000)
          const nowAt = Date.now()
          const shouldLogSleep = this.shouldLog(
            'event_loop.sleep_skip',
            LOOP_SLEEP_SKIP_LOG_THROTTLE_MS,
            nowAt
          )
          if (shouldLogSleep) {
            loopPerfLog.info(
              `System sleep/suspend detected (${durationSec}s) — skipping event loop lag report`
            )
          }
          return
        }

        if (lag >= LOOP_LAG_WARN_MS) {
          const severity = lag >= LOOP_LAG_ERROR_MS ? 'error' : 'warn'
          this.recordEventLoopLag(lag, severity)
        }
      }, 100)
    }

    if (!pollingService.isRegistered(PERF_SUMMARY_TASK_ID)) {
      pollingService.register(PERF_SUMMARY_TASK_ID, () => this.flushSummary(), {
        interval: SUMMARY_INTERVAL_MS,
        unit: 'milliseconds',
        lane: 'maintenance',
        backpressure: 'coalesce',
        dedupeKey: PERF_SUMMARY_TASK_ID,
        maxInFlight: 1,
        timeoutMs: 5000
      })
    }

    if (!pollingService.isRegistered(PERF_HEAP_TASK_ID)) {
      pollingService.register(
        PERF_HEAP_TASK_ID,
        () => {
          const heap = getHeapStatistics()
          const usedRatio = heap.used_heap_size / heap.heap_size_limit
          if (usedRatio > 0.85) {
            const usedMB = Math.round(heap.used_heap_size / 1024 / 1024)
            const totalMB = Math.round(heap.total_heap_size / 1024 / 1024)
            const limitMB = Math.round(heap.heap_size_limit / 1024 / 1024)
            perfLog.warn(
              `Heap pressure: ${usedMB}MB used / ${totalMB}MB allocated / ${limitMB}MB limit (${Math.round(usedRatio * 100)}%)`
            )
          }
        },
        {
          interval: 30_000,
          unit: 'milliseconds',
          initialDelayMs: 15_000,
          lane: 'maintenance',
          backpressure: 'latest_wins',
          dedupeKey: PERF_HEAP_TASK_ID,
          maxInFlight: 1,
          timeoutMs: 5000
        }
      )
    }

    pollingService.start()
  }

  stop(): void {
    pollingService.unregister(PERF_LOOP_TASK_ID)
    pollingService.unregister(PERF_SUMMARY_TASK_ID)
    pollingService.unregister(PERF_HEAP_TASK_ID)
    if (this.loopMonitorTimer) {
      clearInterval(this.loopMonitorTimer)
      this.loopMonitorTimer = null
    }
    for (const dispose of this.powerListeners) dispose()
    this.powerListeners = []
    this.severeLagWindowHits = []
  }

  /**
   * Listen to Electron powerMonitor suspend/resume events so we can
   * distinguish real event-loop blocking from system sleep.
   */
  private registerPowerMonitorListeners(): void {
    if (this.powerListeners.length > 0) return
    if (!powerMonitorAvailable) {
      loopPerfLog.warn('powerMonitor unavailable; skipping suspend/resume listeners')
      return
    }

    const onSuspend = () => {
      loopPerfLog.info('System suspending (powerMonitor)')
    }
    const onResume = () => {
      this.systemResumedAt = Date.now()
      // Reset the tick baseline so the first check after wake doesn't
      // produce a false positive lag equal to the sleep duration.
      this.lastLoopTick = performance.now()
      loopPerfLog.info('System resumed (powerMonitor)')
    }

    powerMonitor.on('suspend', onSuspend)
    powerMonitor.on('resume', onResume)

    this.powerListeners.push(
      () => powerMonitor.off('suspend', onSuspend),
      () => powerMonitor.off('resume', onResume)
    )
  }

  /**
   * Determine whether a detected lag is caused by system sleep rather than
   * real event-loop blocking.
   *
   * Two signals are used (either is sufficient):
   * 1. powerMonitor reported a recent resume (within RESUME_GRACE_MS)
   * 2. Fallback: lag exceeds SYSTEM_SLEEP_THRESHOLD_MS (for cases where
   *    powerMonitor events don't fire, e.g. forced hibernation)
   */
  private isLagFromSystemSleep(lagMs: number): boolean {
    // Signal 1: powerMonitor resume within grace window
    if (this.systemResumedAt > 0) {
      const sincResume = Date.now() - this.systemResumedAt
      if (sincResume < PerfMonitor.RESUME_GRACE_MS) {
        return true
      }
    }
    // Signal 2: threshold fallback
    return lagMs >= SYSTEM_SLEEP_THRESHOLD_MS
  }

  recordIpcHandler(eventName: string, durationMs: number, meta: Record<string, unknown>): void {
    const now = Date.now()

    const severity =
      durationMs >= IPC_ERROR_MS ? 'error' : durationMs >= IPC_WARN_MS ? 'warn' : null
    if (!severity) {
      this.updateAggregate(`handler:${eventName}`, now, durationMs, null)
      return
    }

    this.updateAggregate(`handler:${eventName}`, now, durationMs, severity)

    const incident: PerfIncident = {
      kind: 'ipc.handler.slow',
      severity,
      at: now,
      eventName,
      durationMs,
      direction: 'renderer->main',
      meta
    }
    this.pushIncident(incident)
    queueNexusPerformance(incident)

    const shouldLog = this.shouldLog(
      `ipc.handler.slow:${eventName}:${severity}`,
      IPC_LOG_THROTTLE_MS,
      now
    )
    if (shouldLog) {
      const message = `${eventName} handler took ${formatDuration(durationMs)}`
      const contexts = getPerfContextSnapshot(2)
      if (severity === 'error') {
        ipcPerfLog.error(message, {
          meta: toLogMeta({ ...meta, durationMs: Math.round(durationMs), contexts })
        })
      } else {
        ipcPerfLog.warn(message, {
          meta: toLogMeta({ ...meta, durationMs: Math.round(durationMs), contexts })
        })
      }
    }
    this.lastSlowIpc = {
      kind: 'ipc.handler.slow',
      eventName,
      durationMs,
      at: now
    }

    if (eventName === 'tuff:dashboard') {
      appendWorkflowDebugLog({
        hid: 'H1',
        loc: 'perf-monitor.recordIpcHandler',
        msg: 'ipc.handler.slow',
        data: {
          eventName,
          durationMs,
          severity,
          ...meta
        }
      })
    }
  }

  recordIpcNoHandler(eventName: string, meta: Record<string, unknown>): void {
    const now = Date.now()
    this.updateAggregate(`no_handler:${eventName}`, now, 0, 'warn')

    const incident: PerfIncident = {
      kind: 'ipc.no_handler',
      severity: 'warn',
      at: now,
      eventName,
      direction: 'renderer->main',
      meta
    }
    this.pushIncident(incident)
    ipcPerfLog.warn(`No handler for ${eventName}`, { meta: toLogMeta(meta) })
  }

  recordRendererReport(report: RendererPerfReport): void {
    const payloadPreview =
      report.payloadPreview === undefined
        ? undefined
        : formatPayloadPreview(report.payloadPreview, { maxOutputChars: 800 })

    const isUiSignal = typeof report.kind === 'string' && report.kind.startsWith('ui.')
    const thresholds = isUiSignal
      ? resolveUiThreshold(report.kind)
      : { warn: IPC_WARN_MS, error: IPC_ERROR_MS }

    const explicitLevel = report.level === 'warn' || report.level === 'error' ? report.level : null
    const severity =
      explicitLevel ??
      (report.kind === 'channel.send.timeout'
        ? 'error'
        : report.durationMs >= thresholds.error
          ? 'error'
          : report.durationMs >= thresholds.warn
            ? 'warn'
            : null)

    const key = `renderer:${report.kind}:${report.eventName}`
    this.updateAggregate(key, report.at, report.durationMs, severity)

    if (!severity) {
      return
    }

    const incident: PerfIncident = {
      kind: report.kind,
      severity,
      at: report.at,
      eventName: report.eventName,
      durationMs: report.durationMs,
      direction: 'renderer->main',
      meta: report.meta,
      payloadPreview,
      stack: report.stack
    }
    this.pushIncident(incident)
    queueNexusPerformance(incident)

    const shouldLog = this.shouldLog(
      `renderer:${report.kind}:${report.eventName}:${severity}`,
      RENDERER_LOG_THROTTLE_MS,
      report.at
    )
    if (shouldLog) {
      const message = `[renderer] ${report.eventName} ${report.kind} ${formatDuration(report.durationMs)}`
      const logOptions = {
        meta: toLogMeta({
          kind: report.kind,
          durationMs: Math.round(report.durationMs),
          payload: payloadPreview,
          ...report.meta
        }),
        error: severity === 'error' ? report.stack : undefined
      }

      if (severity === 'error') {
        ipcPerfLog.error(message, logOptions)
      } else {
        ipcPerfLog.warn(message, logOptions)
      }
    }
    this.lastSlowIpc = {
      kind: report.kind,
      eventName: report.eventName,
      durationMs: report.durationMs,
      at: report.at
    }

    if (shouldLog && (report.eventName === 'tuff:dashboard' || isUiSignal)) {
      appendWorkflowDebugLog({
        hid: report.eventName === 'tuff:dashboard' ? 'H2' : 'H6',
        loc: 'perf-monitor.recordRendererReport',
        msg: report.kind,
        data: {
          eventName: report.eventName,
          durationMs: report.durationMs,
          at: report.at,
          payloadPreview,
          stack: report.stack,
          ...report.meta
        }
      })
    }
  }

  recordMainReport(report: MainPerfReport): void {
    if (!report || typeof report !== 'object') {
      return
    }

    const at = Number.isFinite(report.at) ? Number(report.at) : Date.now()
    const durationMs = Number.isFinite(report.durationMs) ? Number(report.durationMs) : 0
    const explicitLevel = report.level === 'warn' || report.level === 'error' ? report.level : null
    const severity =
      explicitLevel ??
      (durationMs >= MAIN_ERROR_MS ? 'error' : durationMs >= MAIN_WARN_MS ? 'warn' : null)

    const kind = report.kind ? `main.${report.kind}` : 'main.unknown'
    const eventName =
      typeof report.eventName === 'string' && report.eventName.trim().length > 0
        ? report.eventName.trim()
        : undefined

    const key = `main:${kind}:${eventName ?? 'none'}`
    this.updateAggregate(key, at, durationMs, severity)

    if (!severity) {
      return
    }

    const incident: PerfIncident = {
      kind,
      severity,
      at,
      eventName,
      durationMs,
      meta: report.meta
    }
    this.pushIncident(incident)
  }

  private evaluateSevereLagBurst(lagMs: number, now: number): void {
    if (lagMs < SEVERE_LAG_BURST_THRESHOLD_MS) {
      return
    }

    const windowStart = now - SEVERE_LAG_BURST_WINDOW_MS
    this.severeLagWindowHits = this.severeLagWindowHits.filter((ts) => ts >= windowStart)
    this.severeLagWindowHits.push(now)

    if (this.severeLagWindowHits.length < SEVERE_LAG_BURST_TRIGGER_COUNT) {
      return
    }

    if (now - this.lastSevereLagBurstAt < SEVERE_LAG_BURST_COOLDOWN_MS) {
      return
    }

    this.lastSevereLagBurstAt = now
    this.severeLagWindowHits = []

    const event: SevereLagBurstEvent = {
      thresholdMs: SEVERE_LAG_BURST_THRESHOLD_MS,
      windowMs: SEVERE_LAG_BURST_WINDOW_MS,
      cooldownMs: SEVERE_LAG_BURST_COOLDOWN_MS,
      triggerCount: SEVERE_LAG_BURST_TRIGGER_COUNT,
      latestLagMs: Math.round(lagMs),
      at: now
    }

    loopPerfLog.warn(
      `Severe event-loop lag window reached (${event.triggerCount}x >= ${event.thresholdMs}ms in ${Math.round(event.windowMs / 1000)}s)`
    )

    for (const listener of this.severeLagBurstListeners) {
      try {
        listener(event)
      } catch (error) {
        loopPerfLog.warn('Severe lag burst listener failed', { meta: toLogMeta({ error }) })
      }
    }
  }

  private recordEventLoopLag(lagMs: number, severity: 'warn' | 'error'): void {
    const now = Date.now()
    this.lastEventLoopLag = {
      lagMs: Math.round(lagMs),
      severity,
      at: now
    }
    this.evaluateSevereLagBurst(lagMs, now)
    this.loopLagAggregate.count += 1
    this.loopLagAggregate.lastAt = now
    this.loopLagAggregate.maxDurationMs = Math.max(this.loopLagAggregate.maxDurationMs, lagMs)
    if (severity === 'warn') this.loopLagAggregate.warnCount += 1
    else this.loopLagAggregate.errorCount += 1

    const incident: PerfIncident = {
      kind: 'event_loop.lag',
      severity,
      at: now,
      durationMs: lagMs
    }
    this.pushIncident(incident)

    const shouldLog = this.shouldLog(`event_loop.lag:${severity}`, LOOP_LOG_THROTTLE_MS, now)
    if (shouldLog || lagMs >= 500) {
      const contexts = getPerfContextSnapshot(3)
      const heapNow = Date.now()
      const heapStats =
        lagMs >= 500 && heapNow - this.lastHeapSnapshotAt >= this.heapSnapshotIntervalMs
          ? getHeapStatistics()
          : null
      if (heapStats) {
        this.lastHeapSnapshotAt = heapNow
      }
      const pollingDiagnostics = pollingService.getDiagnostics()
      const pollingActive = pollingDiagnostics.activeTasks.slice(0, 4).map((task) => ({
        id: task.id,
        ageMs: Math.round(task.ageMs),
        intervalMs: typeof task.intervalMs === 'number' ? Math.round(task.intervalMs) : undefined,
        lastDurationMs:
          typeof task.lastDurationMs === 'number' ? Math.round(task.lastDurationMs) : undefined,
        maxDurationMs:
          typeof task.maxDurationMs === 'number' ? Math.round(task.maxDurationMs) : undefined,
        count: task.count
      }))
      const pollingRecent = pollingDiagnostics.recentTasks
        .sort((a, b) => b.lastDurationMs - a.lastDurationMs)
        .slice(0, 3)
        .map((task) => ({
          id: task.id,
          durationMs: Math.round(task.lastDurationMs),
          ageMs: Math.max(0, now - task.lastEndAt),
          intervalMs: typeof task.intervalMs === 'number' ? Math.round(task.intervalMs) : undefined,
          maxDurationMs: Math.round(task.maxDurationMs),
          count: task.count,
          phaseDurations:
            typeof task.lastMeta === 'object' && task.lastMeta
              ? (task.lastMeta as { phaseDurations?: Record<string, number> }).phaseDurations
              : undefined
        }))
      const slowPollingRecent = pollingDiagnostics.recentTasks
        .filter((task) => now - task.lastEndAt <= 10000)
        .sort((a, b) => b.lastDurationMs - a.lastDurationMs)
        .slice(0, 3)
        .map((task) => ({
          id: task.id,
          durationMs: Math.round(task.lastDurationMs),
          ageMs: Math.max(0, now - task.lastEndAt),
          intervalMs: typeof task.intervalMs === 'number' ? Math.round(task.intervalMs) : undefined,
          maxDurationMs: Math.round(task.maxDurationMs),
          count: task.count,
          phaseDurations:
            typeof task.lastMeta === 'object' && task.lastMeta
              ? (task.lastMeta as { phaseDurations?: Record<string, number> }).phaseDurations
              : undefined
        }))
      const primaryContext = contexts[0]
        ? `${contexts[0].label} ${formatDuration(contexts[0].durationMs)}`
        : undefined
      const primaryPollingActive = pollingActive[0]
        ? `${pollingActive[0].id} ${formatDuration(pollingActive[0].ageMs)}`
        : undefined
      const primaryPollingRecent = pollingRecent[0]
        ? `${pollingRecent[0].id} ${formatDuration(pollingRecent[0].durationMs)}`
        : undefined
      const diagnosticKey = `${primaryContext ?? 'none'}|${primaryPollingRecent ?? 'none'}`
      const diagnosticCauseChanged = diagnosticKey !== this.lastLoopDiagnosticKey
      if (diagnosticCauseChanged) {
        this.lastLoopDiagnosticKey = diagnosticKey
      }
      const diagnosticThrottleMs =
        severity === 'error' ? LOOP_DIAGNOSTIC_ERROR_THROTTLE_MS : LOOP_DIAGNOSTIC_WARN_THROTTLE_MS
      const shouldLogDiagnostic =
        lagMs >= 500 &&
        (diagnosticCauseChanged ||
          (lagMs >= LOOP_LAG_ERROR_MS &&
            this.shouldLog(`event_loop.lag:diagnostic:${severity}`, diagnosticThrottleMs, now)))
      const messageHints = [
        primaryContext ? `context=${primaryContext}` : null,
        primaryPollingActive ? `polling=${primaryPollingActive}` : null,
        primaryPollingRecent ? `recent=${primaryPollingRecent}` : null
      ].filter(Boolean)
      const message = messageHints.length
        ? `Event loop lag ${formatDuration(lagMs)} (${messageHints.join(' | ')})`
        : `Event loop lag ${formatDuration(lagMs)}`
      const lastSlowIpc = this.lastSlowIpc
        ? {
            kind: this.lastSlowIpc.kind,
            eventName: this.lastSlowIpc.eventName,
            durationMs: Math.round(this.lastSlowIpc.durationMs),
            ageMs: Math.max(0, now - this.lastSlowIpc.at)
          }
        : undefined
      const meta = toLogMeta({
        lagMs: Math.round(lagMs),
        contexts,
        primaryContext,
        pollingActive,
        pollingRecent,
        primaryPollingActive,
        primaryPollingRecent,
        lastSlowIpc,
        slowPollingRecent,
        heap: heapStats
          ? {
              totalHeapSize: heapStats.total_heap_size,
              usedHeapSize: heapStats.used_heap_size,
              heapSizeLimit: heapStats.heap_size_limit
            }
          : undefined
      })
      if (shouldLog) {
        if (severity === 'error') {
          loopPerfLog.error(message, { meta })
        } else {
          loopPerfLog.warn(message, { meta })
        }
      }

      if (shouldLogDiagnostic) {
        loopPerfLog.warn(`Event loop lag diagnostics ${formatDuration(lagMs)}`, {
          meta: toLogMeta({ lagMs: Math.round(lagMs), slowPollingRecent })
        })
      }

      if (shouldLog) {
        appendWorkflowDebugLog({
          hid: 'H4',
          loc: 'perf-monitor.recordEventLoopLag',
          msg: 'event_loop.lag',
          data: {
            lagMs,
            severity,
            contexts,
            pollingActive,
            pollingRecent,
            lastSlowIpc,
            slowPollingRecent
          }
        })
      }
    }
  }

  private pushIncident(incident: PerfIncident): void {
    pushWithCap(this.incidents, incident, MAX_INCIDENTS)
  }

  private updateAggregate(
    key: string,
    at: number,
    durationMs: number,
    severity: 'warn' | 'error' | null
  ): void {
    const agg = this.ipcAggregates.get(key) ?? {
      count: 0,
      warnCount: 0,
      errorCount: 0,
      maxDurationMs: 0,
      lastAt: 0
    }
    agg.count += 1
    agg.lastAt = at
    agg.maxDurationMs = Math.max(agg.maxDurationMs, durationMs)
    if (severity === 'warn') agg.warnCount += 1
    if (severity === 'error') agg.errorCount += 1
    this.ipcAggregates.set(key, agg)
  }

  flushSummary(): void {
    const snapshot = this.incidents.slice()
    if (snapshot.length === 0) return

    const errorCount = snapshot.filter((item) => item.severity === 'error').length

    const byKind = new Map<string, number>()
    for (const incident of snapshot) {
      byKind.set(incident.kind, (byKind.get(incident.kind) ?? 0) + 1)
    }

    const kinds = Array.from(byKind.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([kind, count]) => `${kind}=${count}`)
      .join(' ')

    // Show top slow incidents
    const slow = snapshot
      .filter((i) => typeof i.durationMs === 'number')
      .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
      .slice(0, 5)

    const topSlowForLog = slow
      .filter((incident) => (incident.durationMs ?? 0) >= PERF_SUMMARY_TOP_SLOW_MIN_MS)
      .slice(0, PERF_SUMMARY_LOG_TOP_LIMIT)
    const shouldLogSummary =
      errorCount > 0 ||
      topSlowForLog.some((incident) => (incident.durationMs ?? 0) >= PERF_SUMMARY_LOG_SLOW_MS)

    if (shouldLogSummary) {
      perfLog.warn(`Perf summary (last ${snapshot.length})`, { meta: { kinds } })
      for (const incident of topSlowForLog) {
        const name = incident.eventName ?? incident.kind
        perfLog.warn(`Top slow: ${name} ${formatDuration(incident.durationMs ?? 0)}`)
      }
    }

    const eventCounts = new Map<string, number>()
    for (const incident of snapshot) {
      if (!incident.eventName) continue
      const channelType =
        incident.meta && typeof incident.meta.channelType === 'string'
          ? incident.meta.channelType
          : undefined
      const direction = incident.direction ? `:${incident.direction}` : ''
      const channel = channelType ? `:${channelType}` : ''
      const key = `${incident.kind}${direction}${channel}:${incident.eventName}`
      eventCounts.set(key, (eventCounts.get(key) ?? 0) + 1)
    }

    const topEvents = Array.from(eventCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([key, count]) => ({ key, count }))

    const phaseCodeStats = new Map<string, { count: number; maxDurationMs: number }>()
    for (const incident of snapshot) {
      const metaPhaseCode =
        incident.meta && typeof incident.meta.phaseAlertCode === 'string'
          ? incident.meta.phaseAlertCode
          : undefined
      const derivedPhaseCode =
        incident.kind.startsWith('main.clipboard.') &&
        typeof incident.eventName === 'string' &&
        incident.eventName.trim().length > 0
          ? incident.eventName.trim()
          : undefined

      const phaseCode = metaPhaseCode ?? derivedPhaseCode
      if (!phaseCode) {
        continue
      }

      const entry = phaseCodeStats.get(phaseCode) ?? { count: 0, maxDurationMs: 0 }
      entry.count += 1
      entry.maxDurationMs = Math.max(entry.maxDurationMs, Math.round(incident.durationMs ?? 0))
      phaseCodeStats.set(phaseCode, entry)
    }

    const topPhaseCodes = Array.from(phaseCodeStats.entries())
      .sort((a, b) => {
        if (b[1].count !== a[1].count) {
          return b[1].count - a[1].count
        }
        return b[1].maxDurationMs - a[1].maxDurationMs
      })
      .slice(0, 6)
      .map(([code, value]) => ({
        code,
        count: value.count,
        maxDurationMs: value.maxDurationMs
      }))

    perfSummaryReporter?.({
      at: Date.now(),
      total: snapshot.length,
      errorCount,
      kinds,
      topSlow: slow.map((incident) => ({
        name: incident.eventName ?? incident.kind,
        durationMs: Math.round(incident.durationMs ?? 0)
      })),
      topEvents,
      topPhaseCodes
    })

    // Reset snapshot window while keeping aggregates.
    this.incidents = []
  }
}

export const perfMonitor = new PerfMonitor()

export function registerPerfReportListener(): () => void {
  const handler = (_event: IpcMainEvent, report: RendererPerfReport) => {
    if (!report || typeof report !== 'object') return
    if (!report.eventName || typeof report.eventName !== 'string') return
    if (!Number.isFinite(report.durationMs)) return
    if (!Number.isFinite(report.at)) return

    perfMonitor.recordRendererReport(report)
  }

  ipcMain.on(PERF_REPORT_CHANNEL, handler)

  return () => {
    ipcMain.off(PERF_REPORT_CHANNEL, handler)
  }
}
