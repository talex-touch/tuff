import type { IpcMainEvent } from 'electron'
import { performance } from 'node:perf_hooks'
import { ipcMain } from 'electron'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { createLogger, formatDuration, type Primitive } from './logger'
import { getPerfContextSnapshot } from './perf-context'

export type RendererPerfReport = {
  kind:
    | 'channel.sendSync.slow'
    | 'channel.send.slow'
    | 'channel.send.timeout'
    | 'channel.send.errorReply'
  eventName: string
  durationMs: number
  at: number
  payloadPreview?: string
  stack?: string
  meta?: Record<string, unknown>
}

type IpcDirection = 'renderer->main' | 'main->renderer'

type PerfIncident = {
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

export type PerfSummary = {
  at: number
  total: number
  errorCount: number
  kinds: string
  topSlow: Array<{ name: string, durationMs: number }>
  topEvents: Array<{ key: string, count: number }>
}

type PerfAggregate = {
  count: number
  warnCount: number
  errorCount: number
  maxDurationMs: number
  lastAt: number
}

const perfLog = createLogger('Perf')
const ipcPerfLog = perfLog.child('IPC')
const loopPerfLog = perfLog.child('EventLoop')

const PERF_REPORT_CHANNEL = 'touch:perf-report'

const IPC_WARN_MS = 200
const IPC_ERROR_MS = 1_000

const LOOP_LAG_WARN_MS = 200
const LOOP_LAG_ERROR_MS = 2_000

const SUMMARY_INTERVAL_MS = 30_000
const MAX_INCIDENTS = 80
const PERF_LOOP_TASK_ID = 'perf-monitor.event-loop'
const PERF_SUMMARY_TASK_ID = 'perf-monitor.summary'

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

function toLogMeta(meta: Record<string, unknown> | undefined): Record<string, Primitive> | undefined {
  if (!meta)
    return undefined

  const safe: Record<string, Primitive> = {}
  for (const [key, value] of Object.entries(meta)) {
    if (
      value === null
      || value === undefined
      || typeof value === 'string'
      || typeof value === 'number'
      || typeof value === 'boolean'
    ) {
      safe[key] = value
      continue
    }

    try {
      const encoded = JSON.stringify(value)
      safe[key] = encoded.length > 300 ? `${encoded.slice(0, 300)}…` : encoded
    }
    catch {
      safe[key] = '[unserializable]'
    }
  }
  return safe
}

export class PerfMonitor {
  private incidents: PerfIncident[] = []
  private ipcAggregates = new Map<string, PerfAggregate>()
  private loopLagAggregate: PerfAggregate = {
    count: 0,
    warnCount: 0,
    errorCount: 0,
    maxDurationMs: 0,
    lastAt: 0,
  }

  private lastLoopTick = 0
  private lastSlowIpc: {
    kind: string
    eventName: string
    durationMs: number
    at: number
  } | null = null

  start(): void {
    if (!pollingService.isRegistered(PERF_LOOP_TASK_ID)) {
      this.lastLoopTick = performance.now()
      pollingService.register(
        PERF_LOOP_TASK_ID,
        () => {
          const now = performance.now()
          const expected = this.lastLoopTick + 100
          const lag = Math.max(0, now - expected)
          this.lastLoopTick = now

          if (lag >= LOOP_LAG_WARN_MS) {
            const severity = lag >= LOOP_LAG_ERROR_MS ? 'error' : 'warn'
            this.recordEventLoopLag(lag, severity)
          }
        },
        { interval: 100, unit: 'milliseconds' },
      )
    }

    if (!pollingService.isRegistered(PERF_SUMMARY_TASK_ID)) {
      pollingService.register(
        PERF_SUMMARY_TASK_ID,
        () => this.flushSummary(),
        { interval: SUMMARY_INTERVAL_MS, unit: 'milliseconds' },
      )
    }

    pollingService.start()
  }

  stop(): void {
    pollingService.unregister(PERF_LOOP_TASK_ID)
    pollingService.unregister(PERF_SUMMARY_TASK_ID)
  }

  recordIpcHandler(
    eventName: string,
    durationMs: number,
    meta: Record<string, unknown>,
  ): void {
    const now = Date.now()

    const severity = durationMs >= IPC_ERROR_MS ? 'error' : durationMs >= IPC_WARN_MS ? 'warn' : null
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
      meta,
    }
    this.pushIncident(incident)

    const message = `${eventName} handler took ${formatDuration(durationMs)}`
    if (severity === 'error') {
      ipcPerfLog.error(message, { meta: toLogMeta({ ...meta, durationMs: Math.round(durationMs) }) })
    }
    else {
      ipcPerfLog.warn(message, { meta: toLogMeta({ ...meta, durationMs: Math.round(durationMs) }) })
    }
    this.lastSlowIpc = {
      kind: 'ipc.handler.slow',
      eventName,
      durationMs,
      at: now,
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
      meta,
    }
    this.pushIncident(incident)
    ipcPerfLog.warn(`No handler for ${eventName}`, { meta: toLogMeta(meta) })
  }

  recordRendererReport(report: RendererPerfReport): void {
    const severity = report.kind === 'channel.send.timeout'
      ? 'error'
      : report.durationMs >= IPC_ERROR_MS
        ? 'error'
        : 'warn'

    const key = `renderer:${report.kind}:${report.eventName}`
    this.updateAggregate(key, report.at, report.durationMs, severity)

    const incident: PerfIncident = {
      kind: report.kind,
      severity,
      at: report.at,
      eventName: report.eventName,
      durationMs: report.durationMs,
      direction: 'renderer->main',
      meta: report.meta,
      payloadPreview: report.payloadPreview,
      stack: report.stack,
    }
    this.pushIncident(incident)

    const message = `[renderer] ${report.eventName} ${report.kind} ${formatDuration(report.durationMs)}`
    const logOptions = {
      meta: toLogMeta({
        kind: report.kind,
        durationMs: Math.round(report.durationMs),
        payload: report.payloadPreview,
        ...report.meta,
      }),
      error: severity === 'error' ? report.stack : undefined,
    }

    if (severity === 'error') {
      ipcPerfLog.error(message, logOptions)
    }
    else {
      ipcPerfLog.warn(message, logOptions)
    }
    this.lastSlowIpc = {
      kind: report.kind,
      eventName: report.eventName,
      durationMs: report.durationMs,
      at: report.at,
    }
  }

  private recordEventLoopLag(lagMs: number, severity: 'warn' | 'error'): void {
    const now = Date.now()
    this.loopLagAggregate.count += 1
    this.loopLagAggregate.lastAt = now
    this.loopLagAggregate.maxDurationMs = Math.max(this.loopLagAggregate.maxDurationMs, lagMs)
    if (severity === 'warn')
      this.loopLagAggregate.warnCount += 1
    else
      this.loopLagAggregate.errorCount += 1

    const incident: PerfIncident = {
      kind: 'event_loop.lag',
      severity,
      at: now,
      durationMs: lagMs,
    }
    this.pushIncident(incident)

    const message = `Event loop lag ${formatDuration(lagMs)}`
    const contexts = getPerfContextSnapshot(3)
    const pollingDiagnostics = pollingService.getDiagnostics()
    const pollingActive = pollingDiagnostics.activeTasks
      .slice(0, 4)
      .map(task => ({
        id: task.id,
        ageMs: Math.round(task.ageMs),
      }))
    const pollingRecent = pollingDiagnostics.recentTasks
      .sort((a, b) => b.lastDurationMs - a.lastDurationMs)
      .slice(0, 3)
      .map(task => ({
        id: task.id,
        durationMs: Math.round(task.lastDurationMs),
        ageMs: Math.max(0, now - task.lastEndAt),
      }))
    const lastSlowIpc = this.lastSlowIpc
      ? {
          kind: this.lastSlowIpc.kind,
          eventName: this.lastSlowIpc.eventName,
          durationMs: Math.round(this.lastSlowIpc.durationMs),
          ageMs: Math.max(0, now - this.lastSlowIpc.at),
        }
      : undefined
    const meta = toLogMeta({
      lagMs: Math.round(lagMs),
      contexts,
      pollingActive,
      pollingRecent,
      lastSlowIpc,
    })
    if (severity === 'error') {
      loopPerfLog.error(message, { meta })
    }
    else {
      loopPerfLog.warn(message, { meta })
    }
  }

  private pushIncident(incident: PerfIncident): void {
    pushWithCap(this.incidents, incident, MAX_INCIDENTS)
  }

  private updateAggregate(
    key: string,
    at: number,
    durationMs: number,
    severity: 'warn' | 'error' | null,
  ): void {
    const agg = this.ipcAggregates.get(key) ?? {
      count: 0,
      warnCount: 0,
      errorCount: 0,
      maxDurationMs: 0,
      lastAt: 0,
    }
    agg.count += 1
    agg.lastAt = at
    agg.maxDurationMs = Math.max(agg.maxDurationMs, durationMs)
    if (severity === 'warn')
      agg.warnCount += 1
    if (severity === 'error')
      agg.errorCount += 1
    this.ipcAggregates.set(key, agg)
  }

  flushSummary(): void {
    const snapshot = this.incidents.slice()
    if (snapshot.length === 0)
      return

    const errorCount = snapshot.filter(item => item.severity === 'error').length

    const byKind = new Map<string, number>()
    for (const incident of snapshot) {
      byKind.set(incident.kind, (byKind.get(incident.kind) ?? 0) + 1)
    }

    const kinds = Array.from(byKind.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([kind, count]) => `${kind}=${count}`)
      .join(' ')

    perfLog.warn(`Perf summary (last ${snapshot.length})`, { meta: { kinds } })

    // Show top slow incidents
    const slow = snapshot
      .filter(i => typeof i.durationMs === 'number')
      .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
      .slice(0, 5)

    for (const incident of slow) {
      const name = incident.eventName ?? incident.kind
      perfLog.warn(`Top slow: ${name} ${formatDuration(incident.durationMs ?? 0)}`)
    }

    const eventCounts = new Map<string, number>()
    for (const incident of snapshot) {
      if (!incident.eventName)
        continue
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

    perfSummaryReporter?.({
      at: Date.now(),
      total: snapshot.length,
      errorCount,
      kinds,
      topSlow: slow.map((incident) => ({
        name: incident.eventName ?? incident.kind,
        durationMs: Math.round(incident.durationMs ?? 0),
      })),
      topEvents,
    })

    // Reset snapshot window while keeping aggregates.
    this.incidents = []
  }
}

export const perfMonitor = new PerfMonitor()

export function registerPerfReportListener(): () => void {
  const handler = (_event: IpcMainEvent, report: RendererPerfReport) => {
    if (!report || typeof report !== 'object')
      return
    if (!report.eventName || typeof report.eventName !== 'string')
      return
    if (!Number.isFinite(report.durationMs))
      return
    if (!Number.isFinite(report.at))
      return

    perfMonitor.recordRendererReport(report)
  }

  ipcMain.on(PERF_REPORT_CHANNEL, handler)

  return () => {
    ipcMain.off(PERF_REPORT_CHANNEL, handler)
  }
}
