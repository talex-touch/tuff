import type { MaybePromise, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type {
  AnalyticsExportPayload,
  AnalyticsExportResult,
  AnalyticsMessage,
  AnalyticsMessageListRequest,
  AnalyticsMessageUpdateRequest,
  AnalyticsSnapshot,
  CounterPayload,
  FeatureStats,
  GaugePayload,
  HistogramPayload,
  PluginStats,
  TrackDurationPayload,
  TrackEventPayload
} from '@talex-touch/utils/analytics'
import type { ITuffTransportMain } from '@talex-touch/utils/transport'
import type {
  AnalyticsRangeRequest,
  AnalyticsSnapshotRequest,
  AnalyticsToggleRequest,
  CurrentMetrics,
  PerformanceHistoryEntry,
  PerformanceSummary,
  ReportMetricsRequest,
  ReportMetricsResponse
} from '@talex-touch/utils/transport/events/types'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import type { PerfSummary } from '../../utils/perf-monitor'
import type { AnalyticsMessageStore } from './message-store'
import type { StartupHistory, StartupMetrics } from './types'
import process from 'node:process'
import { StorageList } from '@talex-touch/utils'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { getEnvOrDefault, getTelemetryApiBase, normalizeBaseUrl } from '@talex-touch/utils/env'
import { getTuffTransportMain } from '@talex-touch/utils/transport'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { app } from 'electron'
import { getStartupAnalytics } from '.'
import { setIpcTracer } from '../../core/channel-core'
import { createLogger } from '../../utils/logger'
import { setPerfSummaryReporter } from '../../utils/perf-monitor'
import { BaseModule } from '../abstract-base-module'
import { databaseModule } from '../database'
import { pluginModule } from '../plugin/plugin-module'
import { getMainConfig } from '../storage'
import { SystemSampler } from './collectors/system-sampler'
import { AnalyticsCore } from './core/analytics-core'
import { getAnalyticsMessageStore } from './message-store'
import { DbStore } from './storage/db-store'
import { DEFAULT_RETENTION_MS } from './storage/memory-store'

const analyticsLog = createLogger('Analytics')
const MESSAGE_REPORT_BASE_DELAY_MS = 30_000
const MESSAGE_REPORT_MAX_DELAY_MS = 5 * 60_000
const MESSAGE_REPORT_MAX_QUEUE = 120
const MESSAGE_REPORT_BATCH_SIZE = 10
const MESSAGE_REPORT_MAX_AGE_MS = 24 * 60 * 60 * 1000

const getKeyManager = (value: unknown): unknown => {
  if (!value || typeof value !== 'object') return undefined
  if (!('keyManager' in value)) return undefined
  return (value as { keyManager?: unknown }).keyManager
}
const ANALYTICS_CLEANUP_TASK_ID = 'analytics.cleanup'

const pollingService = PollingService.getInstance()

interface QueuedMessageReport {
  key: string
  message: AnalyticsMessage
  createdAt: number
  lastAttemptAt?: number
  attempts: number
  count: number
}

export class AnalyticsModule extends BaseModule {
  static key: symbol = Symbol.for('AnalyticsModule')
  name: ModuleKey = AnalyticsModule.key

  private transport: ITuffTransportMain | null = null
  private disposers: Array<() => void> = []
  private core!: AnalyticsCore
  private sampler!: SystemSampler
  private dbStore?: DbStore
  private messageStore?: AnalyticsMessageStore
  private messageReportQueue: QueuedMessageReport[] = []
  private messageReportIndex = new Map<string, QueuedMessageReport>()
  private messageReportTimer: NodeJS.Timeout | null = null
  private messageReportInFlight = false
  private messageReportBackoffMs = MESSAGE_REPORT_BASE_DELAY_MS

  constructor() {
    super(AnalyticsModule.key, {
      create: true,
      dirName: 'analytics'
    })
  }

  onInit(ctx: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    this.dbStore = new DbStore(databaseModule.getDb())
    this.core = new AnalyticsCore({ dbStore: this.dbStore })
    this.sampler = new SystemSampler((sample) => this.core.recordSystemSample(sample))
    this.messageStore = getAnalyticsMessageStore()
    if (this.messageStore) {
      this.disposers.push(this.messageStore.onMessage((message) => this.reportMessage(message)))
    }
    setPerfSummaryReporter((summary) => this.handlePerfSummary(summary))

    const channel =
      (ctx.app as { channel?: unknown } | undefined)?.channel ??
      ($app as { channel?: unknown } | undefined)?.channel
    if (channel) {
      this.transport = getTuffTransportMain(channel, getKeyManager(channel) ?? channel)
    }

    setIpcTracer((_eventName, durationMs, success) => {
      this.core.trackIPC(durationMs, success)
    })

    this.registerHandlers()

    const startup = getStartupAnalytics().getCurrentMetrics()
    this.core.hydrateStartupMetrics(startup)

    this.sampler.start()
    this.startCleanup()
    analyticsLog.success('Analytics module initialized with TuffTransport handlers')
  }

  onDestroy(): MaybePromise<void> {
    this.sampler.stop()
    setIpcTracer(null)
    pollingService.unregister(ANALYTICS_CLEANUP_TASK_ID)
    if (this.messageReportTimer) {
      clearTimeout(this.messageReportTimer)
      this.messageReportTimer = null
    }
    setPerfSummaryReporter(null)
    for (const dispose of this.disposers) {
      try {
        dispose()
      } catch {
        // ignore cleanup errors
      }
    }
    this.disposers = []
  }

  private registerHandlers(): void {
    if (!this.transport) return

    this.disposers.push(
      this.transport.on<AnalyticsSnapshotRequest, AnalyticsSnapshot>(
        AppEvents.analytics.getSnapshot,
        ({ windowType }) => this.core.getSnapshot(windowType ?? '1m')
      )
    )

    this.disposers.push(
      this.transport.on<AnalyticsRangeRequest, AnalyticsSnapshot[]>(
        AppEvents.analytics.getRange,
        (payload) =>
          this.core.getRange({
            windowType: payload?.windowType ?? '1m',
            from: payload?.from ?? 0,
            to: payload?.to ?? Date.now()
          })
      )
    )

    this.disposers.push(
      this.transport.on<AnalyticsExportPayload, AnalyticsExportResult>(
        AppEvents.analytics.export,
        (payload) =>
          this.core.exportSnapshots({
            windowType: payload?.windowType ?? '1m',
            from: payload?.from ?? 0,
            to: payload?.to ?? Date.now(),
            format: payload?.format,
            dimensions: payload?.dimensions
          })
      )
    )

    this.disposers.push(
      this.transport.on<AnalyticsToggleRequest, { enabled: boolean }>(
        AppEvents.analytics.toggleReporting,
        ({ enabled }) => {
          this.core.setReporting(enabled)
          return { enabled }
        }
      )
    )

    this.disposers.push(
      this.transport.on<AnalyticsMessageListRequest, AnalyticsMessage[]>(
        AppEvents.analytics.messages.list,
        (payload) => this.messageStore?.list(payload) ?? []
      )
    )

    this.disposers.push(
      this.transport.on<AnalyticsMessageUpdateRequest, AnalyticsMessage | null>(
        AppEvents.analytics.messages.mark,
        (payload) => this.messageStore?.updateStatus(payload.id, payload.status) ?? null
      )
    )

    this.disposers.push(
      this.transport.on<TrackEventPayload, { ok: true }>(
        AppEvents.analytics.sdk.trackEvent,
        async (payload, context) => {
          const { pluginName, pluginVersion } = this.resolvePluginInfo(payload, context)
          if (!pluginName) return { ok: true }
          this.core.trackPluginEvent(pluginName, payload.featureId, payload.metadata)
          await this.dbStore?.insertPluginEvent({
            pluginName,
            pluginVersion,
            featureId: payload.featureId,
            eventType: payload.eventName,
            metadata: payload.metadata,
            timestamp: Date.now()
          })
          return { ok: true }
        }
      )
    )

    this.disposers.push(
      this.transport.on<TrackDurationPayload, { ok: true }>(
        AppEvents.analytics.sdk.trackDuration,
        async (payload, context) => {
          const { pluginName, pluginVersion } = this.resolvePluginInfo(payload, context)
          if (!pluginName) return { ok: true }
          this.core.trackPluginDuration(pluginName, payload.featureId, payload.durationMs)
          await this.dbStore?.insertPluginEvent({
            pluginName,
            pluginVersion,
            featureId: payload.featureId,
            eventType: payload.operationName,
            metadata: { durationMs: payload.durationMs },
            timestamp: Date.now()
          })
          return { ok: true }
        }
      )
    )

    this.disposers.push(
      this.transport.on<{ pluginName?: string }, PluginStats>(
        AppEvents.analytics.sdk.getStats,
        (payload) => {
          const pluginName = this.resolvePluginName(payload)
          if (!pluginName) {
            return {
              featureCalls: {},
              totalCalls: 0,
              avgResponseTime: 0,
              topFeatures: [],
              counters: {},
              gauges: {},
              histograms: {}
            }
          }
          return this.core.getPluginStats(pluginName)
        }
      )
    )

    this.disposers.push(
      this.transport.on<{ pluginName?: string; featureId: string }, FeatureStats>(
        AppEvents.analytics.sdk.getFeatureStats,
        (payload) => {
          const pluginName = this.resolvePluginName(payload)
          if (!pluginName) return { count: 0, avgDuration: 0 }
          return this.core.getPluginFeatureStats(pluginName, payload.featureId)
        }
      )
    )

    this.disposers.push(
      this.transport.on<
        { pluginName?: string; limit?: number },
        Array<{ id: string; count: number }>
      >(AppEvents.analytics.sdk.getTopFeatures, (payload) => {
        const pluginName = this.resolvePluginName(payload)
        if (!pluginName) return []
        return this.core.getTopPluginFeatures(pluginName, payload.limit)
      })
    )

    this.disposers.push(
      this.transport.on<CounterPayload, { ok: true }>(
        AppEvents.analytics.sdk.incrementCounter,
        async (payload, context) => {
          const { pluginName, pluginVersion } = this.resolvePluginInfo(payload, context)
          if (!pluginName) return { ok: true }
          this.core.incrementPluginCounter(pluginName, payload.name, payload.value)
          await this.dbStore?.insertPluginEvent({
            pluginName,
            pluginVersion,
            eventType: 'counter',
            metadata: { name: payload.name, value: payload.value },
            timestamp: Date.now()
          })
          return { ok: true }
        }
      )
    )

    this.disposers.push(
      this.transport.on<GaugePayload, { ok: true }>(
        AppEvents.analytics.sdk.setGauge,
        async (payload, context) => {
          const { pluginName, pluginVersion } = this.resolvePluginInfo(payload, context)
          if (!pluginName) return { ok: true }
          this.core.setPluginGauge(pluginName, payload.name, payload.value)
          await this.dbStore?.insertPluginEvent({
            pluginName,
            pluginVersion,
            eventType: 'gauge',
            metadata: { name: payload.name, value: payload.value },
            timestamp: Date.now()
          })
          return { ok: true }
        }
      )
    )

    this.disposers.push(
      this.transport.on<HistogramPayload, { ok: true }>(
        AppEvents.analytics.sdk.recordHistogram,
        async (payload, context) => {
          const { pluginName, pluginVersion } = this.resolvePluginInfo(payload, context)
          if (!pluginName) return { ok: true }
          this.core.recordPluginHistogram(pluginName, payload.name, payload.value)
          await this.dbStore?.insertPluginEvent({
            pluginName,
            pluginVersion,
            eventType: 'histogram',
            metadata: { name: payload.name, value: payload.value },
            timestamp: Date.now()
          })
          return { ok: true }
        }
      )
    )

    // Compatibility handlers for existing analytics events
    const startupAnalytics = getStartupAnalytics()

    this.disposers.push(
      this.transport.on<void, CurrentMetrics>(AppEvents.analytics.getCurrent, () =>
        this.toCurrentMetrics(startupAnalytics.getCurrentMetrics())
      )
    )

    this.disposers.push(
      this.transport.on<void, PerformanceHistoryEntry[]>(AppEvents.analytics.getHistory, () =>
        this.toHistory(startupAnalytics.getHistory())
      )
    )

    this.disposers.push(
      this.transport.on<void, PerformanceSummary>(AppEvents.analytics.getSummary, () =>
        this.toSummary(startupAnalytics.getHistory())
      )
    )

    this.disposers.push(
      this.transport.on<ReportMetricsRequest, ReportMetricsResponse>(
        AppEvents.analytics.report,
        async ({ endpoint }) => {
          try {
            await startupAnalytics.reportMetrics(endpoint)
            return { success: true }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            analyticsLog.error('Failed to report startup metrics', { error: message })
            return { success: false }
          }
        }
      )
    )
  }

  private toCurrentMetrics(startup: StartupMetrics | null): CurrentMetrics {
    if (!startup) return {}

    return {
      startupTime: startup.totalStartupTime,
      memoryUsage: startup.renderer?.domContentLoaded,
      cpuUsage: undefined
    }
  }

  private toHistory(history: StartupHistory): PerformanceHistoryEntry[] {
    const entries = history?.entries ?? []
    return entries.map((item) => ({
      timestamp: item.timestamp,
      metrics: {
        startupTime: item.totalStartupTime
      }
    }))
  }

  private toSummary(history: StartupHistory): PerformanceSummary {
    const entries = history?.entries ?? []
    if (!entries.length) {
      return { sampleCount: 0 }
    }

    const total = entries.reduce((acc, cur) => acc + (cur.totalStartupTime || 0), 0)
    const timestamps = entries.map((item) => item.timestamp)

    return {
      sampleCount: entries.length,
      avgStartupTime: total / entries.length,
      timeRange: {
        start: Math.min(...timestamps),
        end: Math.max(...timestamps)
      }
    }
  }

  private resolvePluginName(
    payload: { pluginName?: string },
    context?: { plugin?: { name?: string } }
  ): string | undefined {
    return this.resolvePluginInfo(payload, context).pluginName
  }

  private resolvePluginInfo(
    payload: { pluginName?: string; pluginVersion?: string },
    context?: { plugin?: { name?: string } }
  ): { pluginName?: string; pluginVersion?: string } {
    const pluginName = payload.pluginName || context?.plugin?.name
    const pluginVersion =
      payload.pluginVersion ||
      (pluginName ? pluginModule.pluginManager?.getPluginByName(pluginName)?.version : undefined)
    return { pluginName, pluginVersion }
  }

  private getMessageReportConfig(): { enabled: boolean; anonymous: boolean } {
    const config = getMainConfig(StorageList.SENTRY_CONFIG) as
      | { enabled?: boolean; anonymous?: boolean }
      | undefined
    return {
      enabled: true,
      anonymous: config?.anonymous ?? true
    }
  }

  private resolveMessageEndpoint(): string | null {
    const isLocal = !app.isPackaged || process.env.NODE_ENV === 'development'
    if (isLocal) {
      return `${normalizeBaseUrl(getEnvOrDefault('NEXUS_API_BASE_LOCAL', 'http://localhost:3200'))}/api/telemetry/messages`
    }
    try {
      return `${getTelemetryApiBase()}/api/telemetry/messages`
    } catch {
      return null
    }
  }

  private handlePerfSummary(summary: PerfSummary): void {
    if (!this.messageStore) {
      return
    }

    const shouldReport =
      summary.errorCount > 0 ||
      summary.kinds.includes('ipc.no_handler') ||
      summary.kinds.includes('channel.send.timeout') ||
      summary.kinds.includes('channel.send.errorReply')

    if (!shouldReport) {
      return
    }

    const severity = summary.errorCount > 0 ? 'error' : 'warn'
    this.messageStore.add({
      source: 'system',
      severity,
      title: 'Perf summary',
      message: summary.kinds,
      meta: {
        total: summary.total,
        errorCount: summary.errorCount,
        topEvents: summary.topEvents,
        topSlow: summary.topSlow
      }
    })
  }

  private reportMessage(message: AnalyticsMessage): void {
    this.enqueueMessageReport(message)
  }

  private enqueueMessageReport(message: AnalyticsMessage): void {
    const now = Date.now()
    const key = this.buildMessageReportKey(message)
    const existing = this.messageReportIndex.get(key)
    if (existing) {
      existing.count += 1
      existing.message.createdAt = Math.max(existing.message.createdAt, message.createdAt)
      existing.message.meta = {
        ...existing.message.meta,
        count: existing.count,
        lastAt: now
      }
      return
    }

    const entry: QueuedMessageReport = {
      key,
      message,
      createdAt: now,
      attempts: 0,
      count: 1
    }

    this.messageReportQueue.push(entry)
    this.messageReportIndex.set(key, entry)

    if (this.messageReportQueue.length > MESSAGE_REPORT_MAX_QUEUE) {
      const dropped = this.messageReportQueue.shift()
      if (dropped) {
        this.messageReportIndex.delete(dropped.key)
      }
    }

    this.pruneMessageReportQueue(now)
    this.scheduleMessageReportFlush(MESSAGE_REPORT_BASE_DELAY_MS, true)
  }

  private scheduleMessageReportFlush(delayMs: number, reset: boolean): void {
    if (this.messageReportTimer) {
      if (!reset) {
        return
      }
      clearTimeout(this.messageReportTimer)
    }

    this.messageReportTimer = setTimeout(() => {
      this.messageReportTimer = null
      void this.flushMessageReportQueue()
    }, delayMs)
  }

  private async flushMessageReportQueue(): Promise<void> {
    if (this.messageReportInFlight || this.messageReportQueue.length === 0) {
      return
    }

    const config = this.getMessageReportConfig()
    if (!config.enabled) {
      this.messageReportQueue = []
      this.messageReportIndex.clear()
      this.messageReportBackoffMs = MESSAGE_REPORT_BASE_DELAY_MS
      return
    }

    const endpoint = this.resolveMessageEndpoint()
    if (!endpoint) {
      this.scheduleMessageReportFlush(this.messageReportBackoffMs, false)
      return
    }

    const now = Date.now()
    this.pruneMessageReportQueue(now)
    if (this.messageReportQueue.length === 0) {
      this.messageReportBackoffMs = MESSAGE_REPORT_BASE_DELAY_MS
      return
    }

    const batch = this.messageReportQueue.slice(0, MESSAGE_REPORT_BATCH_SIZE)
    if (!batch.length) {
      return
    }

    this.messageReportInFlight = true
    try {
      const payload = {
        messages: batch.map((entry) => ({
          id: entry.message.id,
          source: entry.message.source,
          severity: entry.message.severity,
          title: entry.message.title,
          message: entry.message.message,
          meta: config.anonymous
            ? undefined
            : {
                ...entry.message.meta,
                count: entry.count,
                lastAt: entry.lastAttemptAt ?? entry.createdAt
              },
          status: entry.message.status,
          createdAt: entry.message.createdAt,
          platform: process.platform,
          version: app.getVersion(),
          isAnonymous: config.anonymous
        }))
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(
          `Message report failed: ${response.status} ${response.statusText} ${text}`.trim()
        )
      }

      for (const entry of batch) {
        this.messageReportIndex.delete(entry.key)
      }
      this.messageReportQueue = this.messageReportQueue.filter(
        (entry) => !batch.some((done) => done.key === entry.key)
      )
      this.messageReportBackoffMs = MESSAGE_REPORT_BASE_DELAY_MS
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      for (const entry of batch) {
        entry.attempts += 1
        entry.lastAttemptAt = now
        entry.message.meta = {
          ...entry.message.meta,
          lastError: errorMessage
        }
      }
      this.messageReportBackoffMs = Math.min(
        this.messageReportBackoffMs * 2,
        MESSAGE_REPORT_MAX_DELAY_MS
      )
      analyticsLog.warn('Failed to report analytics messages', { error: errorMessage })
    } finally {
      this.messageReportInFlight = false
      if (this.messageReportQueue.length > 0) {
        this.scheduleMessageReportFlush(this.messageReportBackoffMs, true)
      }
    }
  }

  private pruneMessageReportQueue(now: number): void {
    const cutoff = now - MESSAGE_REPORT_MAX_AGE_MS
    const nextQueue = this.messageReportQueue.filter((entry) => entry.createdAt >= cutoff)
    if (nextQueue.length === this.messageReportQueue.length) {
      return
    }
    this.messageReportQueue = nextQueue
    this.messageReportIndex = new Map(nextQueue.map((entry) => [entry.key, entry]))
  }

  private buildMessageReportKey(message: AnalyticsMessage): string {
    return [message.source, message.severity, message.title, message.message].join('|')
  }

  private startCleanup(): void {
    if (!this.dbStore) return
    const run = () =>
      this.dbStore
        ?.cleanup(DEFAULT_RETENTION_MS, () => Date.now())
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error)
          analyticsLog.warn('Analytics DB cleanup failed', { error: message })
        })

    run()
    pollingService.register(ANALYTICS_CLEANUP_TASK_ID, () => run(), {
      interval: 60 * 60 * 1000,
      unit: 'milliseconds'
    })
    pollingService.start()
  }

  recordSearchMetrics(totalDurationMs: number, providerTimings: Record<string, number>): void {
    this.core.recordSearchMetrics(totalDurationMs, providerTimings)
  }
}

export const analyticsModule = new AnalyticsModule()
