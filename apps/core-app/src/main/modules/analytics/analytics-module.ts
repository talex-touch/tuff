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
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
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
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { app } from 'electron'
import { getStartupAnalytics } from '.'
import { setIpcTracer } from '../../core/channel-core'
import { dbWriteScheduler } from '../../db/db-write-scheduler'
import { createLogger } from '../../utils/logger'
import { setPerfSummaryReporter } from '../../utils/perf-monitor'
import { BaseModule } from '../abstract-base-module'
import { getAuthToken, subscribeAuthState } from '../auth'
import { databaseModule } from '../database'
import { getNetworkService } from '../network'
import { pluginModule } from '../plugin/plugin-module'
import { getMainConfig } from '../storage'
import { SystemSampler } from './collectors/system-sampler'
import { AnalyticsCore } from './core/analytics-core'
import { getAnalyticsMessageStore } from './message-store'
import { DbStore } from './storage/db-store'
import { DEFAULT_RETENTION_MS } from './storage/memory-store'

const analyticsLog = createLogger('Analytics')
const MESSAGE_REPORT_BASE_DELAY_MS = 2 * 60_000
const MESSAGE_REPORT_MAX_DELAY_MS = 10 * 60_000
const MESSAGE_REPORT_MAX_QUEUE = 120
const MESSAGE_REPORT_BATCH_SIZE = 25
const MESSAGE_REPORT_MAX_AGE_MS = 24 * 60 * 60 * 1000
const MESSAGE_REPORT_JITTER_RATIO = 0.2
const MESSAGE_REPORT_FAILURE_LOG_THROTTLE_MS = 3 * 60_000
const MESSAGE_REPORT_CIRCUIT_OPEN_AFTER_FAILURES = 3
const MESSAGE_REPORT_CIRCUIT_BASE_COOLDOWN_MS = 10 * 60_000
const MESSAGE_REPORT_CIRCUIT_MAX_COOLDOWN_MS = 60 * 60_000
const MESSAGE_REPORT_HEALTH_LOG_INTERVAL_MS = 5 * 60_000
const ANALYTICS_REPORT_HEALTH_TASK_ID = 'analytics.report-health'
const SDK_EVENT_SAMPLE_QUEUE_HIGH_WATERMARK = 8
const SDK_EVENT_SAMPLE_QUEUE_CRITICAL_WATERMARK = 16
const SDK_EVENT_SAMPLE_QUEUE_OVERLOAD_WATERMARK = 24

type StartupPerformanceSummary = {
  totalTime: number
  mainProcessTime: number
  rendererTime: number
  moduleCount: number
  rating: 'excellent' | 'good' | 'fair' | 'poor'
}

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
  firstSeenAt: number
  lastSeenAt: number
  avgIntervalMs: number
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
  private messageReportConsecutiveFailures = 0
  private messageReportCircuitOpenUntil = 0
  private messageReportSuppressedFailures = 0
  private messageReportLastFailureLogAt = 0
  private messageReportLastError = ''
  private messageReportObservedCount = 0
  private messageReportDroppedCount = 0
  private messageReportAttemptCount = 0
  private messageReportFailureCount = 0
  private messageReportAttemptedItems = 0
  private messageReportSucceededItems = 0
  private sdkEventSampleAcceptedCount = 0
  private sdkEventSampledOutCount = 0
  private reportHealthWindowStartedAt = Date.now()
  private isSignedIn = false

  constructor() {
    super(AnalyticsModule.key, {
      create: true,
      dirName: 'analytics'
    })
  }

  onInit(ctx: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    this.isSignedIn = Boolean(getAuthToken())
    this.disposers.push(
      subscribeAuthState((state) => {
        this.isSignedIn = Boolean(state.isSignedIn)
      })
    )

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
    this.startReportHealthLogging()

    // 将非关键操作延迟到启动窗口之后，避免在启动高峰期触发 DB 写入和采样
    // hydrateStartupMetrics → recordAndPersist → DB INSERT
    // sampler.start → collect → recordSystemSample → DB INSERT
    // startCleanup → DB DELETE
    // 这三个操作在启动期同时触发会导致 dbWriteScheduler 队列积压 + SQLite WAL checkpoint
    setTimeout(() => {
      const startup = getStartupAnalytics().getCurrentMetrics()
      this.core.hydrateStartupMetrics(startup)

      // SystemSampler 首次采样延迟 15 秒，给启动任务留出空间
      this.sampler.start({ initialDelayMs: 15_000 })
      this.startCleanup()
      analyticsLog.info('Analytics deferred startup tasks executed')
    }, 3_000)

    analyticsLog.success('Analytics module initialized with TuffTransport handlers')
  }

  onDestroy(): MaybePromise<void> {
    this.sampler.stop()
    setIpcTracer(null)
    pollingService.unregister(ANALYTICS_CLEANUP_TASK_ID)
    pollingService.unregister(ANALYTICS_REPORT_HEALTH_TASK_ID)
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
          const lowerName = payload.eventName.toLowerCase()
          const forceKeep = /error|fail|timeout|crash|exception/.test(lowerName)
          if (!this.shouldSampleSdkEvent(forceKeep)) {
            return { ok: true }
          }
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
          const forceKeep = payload.durationMs >= 1_500
          if (!this.shouldSampleSdkEvent(forceKeep)) {
            return { ok: true }
          }
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
          if (!this.shouldSampleSdkEvent(false)) {
            return { ok: true }
          }
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
          if (!this.shouldSampleSdkEvent(false)) {
            return { ok: true }
          }
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
          if (!this.shouldSampleSdkEvent(false)) {
            return { ok: true }
          }
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
    const legacySummaryEvent = defineRawEvent<void, StartupPerformanceSummary | null>(
      'analytics:get-summary'
    )
    const legacyExportEvent = defineRawEvent<void, string>('analytics:export')

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
      this.transport.on<void, StartupPerformanceSummary | null>(legacySummaryEvent, () =>
        startupAnalytics.getPerformanceSummary()
      )
    )

    this.disposers.push(
      this.transport.on<void, string>(legacyExportEvent, () => startupAnalytics.exportMetrics())
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
    const anonymous = config?.anonymous ?? false
    return {
      enabled: true,
      anonymous: anonymous && this.isSignedIn
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
    this.messageReportObservedCount += 1
    const key = this.buildMessageReportKey(message)
    const existing = this.messageReportIndex.get(key)
    if (existing) {
      const intervalMs = Math.max(0, now - existing.lastSeenAt)
      const intervalSamples = Math.max(0, existing.count - 1)
      existing.avgIntervalMs =
        intervalSamples <= 0
          ? intervalMs
          : (existing.avgIntervalMs * intervalSamples + intervalMs) / (intervalSamples + 1)
      existing.lastSeenAt = now
      existing.count += 1
      existing.message.createdAt = Math.max(existing.message.createdAt, message.createdAt)
      existing.message.meta = {
        ...existing.message.meta,
        count: existing.count,
        firstAt: existing.firstSeenAt,
        lastAt: existing.lastSeenAt,
        avgIntervalMs: Math.round(existing.avgIntervalMs)
      }
      return
    }

    const entry: QueuedMessageReport = {
      key,
      message,
      createdAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      avgIntervalMs: 0,
      attempts: 0,
      count: 1
    }

    this.messageReportQueue.push(entry)
    this.messageReportIndex.set(key, entry)

    if (this.messageReportQueue.length > MESSAGE_REPORT_MAX_QUEUE) {
      const dropped = this.messageReportQueue.shift()
      if (dropped) {
        this.messageReportIndex.delete(dropped.key)
        this.messageReportDroppedCount += 1
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

    const jitteredDelay = this.applyReportDelayJitter(delayMs)

    this.messageReportTimer = setTimeout(() => {
      this.messageReportTimer = null
      void this.flushMessageReportQueue()
    }, jitteredDelay)
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
      this.messageReportConsecutiveFailures = 0
      this.messageReportCircuitOpenUntil = 0
      return
    }

    const now = Date.now()
    if (this.messageReportCircuitOpenUntil > now) {
      this.scheduleMessageReportFlush(this.messageReportCircuitOpenUntil - now, true)
      return
    }

    const endpoint = this.resolveMessageEndpoint()
    if (!endpoint) {
      this.messageReportBackoffMs = Math.min(
        this.messageReportBackoffMs * 2,
        MESSAGE_REPORT_MAX_DELAY_MS
      )
      this.logMessageReportFailure('endpoint unavailable', {
        batchSize: 0,
        attempt: 0,
        nextRetryMs: this.messageReportBackoffMs
      })
      this.scheduleMessageReportFlush(this.messageReportBackoffMs, true)
      return
    }

    this.pruneMessageReportQueue(now)
    if (this.messageReportQueue.length === 0) {
      this.messageReportBackoffMs = MESSAGE_REPORT_BASE_DELAY_MS
      this.messageReportConsecutiveFailures = 0
      return
    }

    const batch = this.messageReportQueue.slice(0, MESSAGE_REPORT_BATCH_SIZE)
    if (!batch.length) {
      return
    }

    this.messageReportInFlight = true
    try {
      this.messageReportAttemptCount += 1
      this.messageReportAttemptedItems += batch.length
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
                firstAt: entry.firstSeenAt,
                lastAt: entry.lastSeenAt,
                avgIntervalMs: Math.round(entry.avgIntervalMs),
                lastAttemptAt: entry.lastAttemptAt ?? entry.createdAt
              },
          status: entry.message.status,
          createdAt: entry.message.createdAt,
          platform: process.platform,
          version: app.getVersion(),
          isAnonymous: config.anonymous
        }))
      }

      await getNetworkService().request<string>({
        method: 'POST',
        url: endpoint,
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        responseType: 'text'
      })

      for (const entry of batch) {
        this.messageReportIndex.delete(entry.key)
      }
      this.messageReportQueue = this.messageReportQueue.filter(
        (entry) => !batch.some((done) => done.key === entry.key)
      )
      this.messageReportSucceededItems += batch.length
      this.messageReportBackoffMs = MESSAGE_REPORT_BASE_DELAY_MS
      this.messageReportConsecutiveFailures = 0
      this.messageReportCircuitOpenUntil = 0
      this.messageReportSuppressedFailures = 0
      this.messageReportLastFailureLogAt = 0
      this.messageReportLastError = ''
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.messageReportFailureCount += 1
      for (const entry of batch) {
        entry.attempts += 1
        entry.lastAttemptAt = now
        entry.message.meta = {
          ...entry.message.meta,
          lastError: errorMessage
        }
      }
      this.messageReportConsecutiveFailures += 1
      this.messageReportBackoffMs = Math.min(
        this.messageReportBackoffMs * 2,
        MESSAGE_REPORT_MAX_DELAY_MS
      )
      const cooldownMs =
        this.messageReportConsecutiveFailures >= MESSAGE_REPORT_CIRCUIT_OPEN_AFTER_FAILURES
          ? this.getCircuitCooldownMs(this.messageReportConsecutiveFailures)
          : 0
      if (cooldownMs > 0) {
        this.messageReportCircuitOpenUntil = now + cooldownMs
      }

      const nextRetryMs =
        this.messageReportCircuitOpenUntil > now
          ? Math.max(this.messageReportBackoffMs, this.messageReportCircuitOpenUntil - now)
          : this.messageReportBackoffMs

      this.logMessageReportFailure(errorMessage, {
        batchSize: batch.length,
        attempt: batch[0]?.attempts ?? 0,
        nextRetryMs,
        circuitCooldownMs: cooldownMs > 0 ? cooldownMs : undefined
      })
    } finally {
      this.messageReportInFlight = false
      if (this.messageReportQueue.length > 0) {
        const now = Date.now()
        const nextDelayMs =
          this.messageReportCircuitOpenUntil > now
            ? Math.max(this.messageReportBackoffMs, this.messageReportCircuitOpenUntil - now)
            : this.messageReportBackoffMs
        this.scheduleMessageReportFlush(nextDelayMs, true)
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

  private applyReportDelayJitter(delayMs: number): number {
    const safeDelay = Math.max(1_000, delayMs)
    const jitterRange = safeDelay * MESSAGE_REPORT_JITTER_RATIO
    const jittered = safeDelay - jitterRange + Math.random() * jitterRange * 2
    return Math.round(Math.max(1_000, jittered))
  }

  private getCircuitCooldownMs(failureCount: number): number {
    const exponent = Math.max(0, failureCount - MESSAGE_REPORT_CIRCUIT_OPEN_AFTER_FAILURES)
    return Math.min(
      MESSAGE_REPORT_CIRCUIT_BASE_COOLDOWN_MS * 2 ** exponent,
      MESSAGE_REPORT_CIRCUIT_MAX_COOLDOWN_MS
    )
  }

  private logMessageReportFailure(
    error: string,
    meta: {
      batchSize: number
      attempt: number
      nextRetryMs: number
      circuitCooldownMs?: number
    }
  ): void {
    const now = Date.now()
    const shouldLogNow =
      now - this.messageReportLastFailureLogAt >= MESSAGE_REPORT_FAILURE_LOG_THROTTLE_MS

    if (!shouldLogNow) {
      this.messageReportSuppressedFailures += 1
      this.messageReportLastError = error
      return
    }

    analyticsLog.warn('Failed to report analytics messages', {
      error,
      meta: {
        ...meta,
        suppressedFailures:
          this.messageReportSuppressedFailures > 0
            ? this.messageReportSuppressedFailures
            : undefined,
        lastSuppressedError:
          this.messageReportSuppressedFailures > 0 ? this.messageReportLastError : undefined
      }
    })

    this.messageReportLastFailureLogAt = now
    this.messageReportSuppressedFailures = 0
    this.messageReportLastError = ''
  }

  private shouldSampleSdkEvent(forceKeep: boolean): boolean {
    if (forceKeep) {
      this.sdkEventSampleAcceptedCount += 1
      return true
    }

    const sampleRate = this.resolveSdkEventSampleRate()
    if (sampleRate >= 1 || Math.random() <= sampleRate) {
      this.sdkEventSampleAcceptedCount += 1
      return true
    }

    this.sdkEventSampledOutCount += 1
    return false
  }

  private resolveSdkEventSampleRate(): number {
    const queueDepth = dbWriteScheduler.getStats().queued
    if (queueDepth >= SDK_EVENT_SAMPLE_QUEUE_OVERLOAD_WATERMARK) return 0.1
    if (queueDepth >= SDK_EVENT_SAMPLE_QUEUE_CRITICAL_WATERMARK) return 0.25
    if (queueDepth >= SDK_EVENT_SAMPLE_QUEUE_HIGH_WATERMARK) return 0.5
    return 1
  }

  private startReportHealthLogging(): void {
    pollingService.register(ANALYTICS_REPORT_HEALTH_TASK_ID, () => this.logReporterHealth(), {
      interval: MESSAGE_REPORT_HEALTH_LOG_INTERVAL_MS,
      unit: 'milliseconds',
      initialDelayMs: MESSAGE_REPORT_HEALTH_LOG_INTERVAL_MS
    })
    pollingService.start()
  }

  private logReporterHealth(): void {
    const now = Date.now()
    const elapsedMs = Math.max(1, now - this.reportHealthWindowStartedAt)
    const elapsedMinutes = elapsedMs / 60_000
    const attempts = this.messageReportAttemptCount
    const failures = this.messageReportFailureCount
    const queueDepth = this.messageReportQueue.length
    const observed = this.messageReportObservedCount
    const dropped = this.messageReportDroppedCount
    const requestsPerMin = attempts / elapsedMinutes
    const failRate = attempts > 0 ? failures / attempts : 0
    const dropRate = observed > 0 ? dropped / observed : 0
    const avgBatchSize = attempts > 0 ? this.messageReportAttemptedItems / attempts : 0
    const deliveryRate =
      this.messageReportAttemptedItems > 0
        ? this.messageReportSucceededItems / this.messageReportAttemptedItems
        : 1
    const sampledTotal = this.sdkEventSampleAcceptedCount + this.sdkEventSampledOutCount
    const sampleDropRate = sampledTotal > 0 ? this.sdkEventSampledOutCount / sampledTotal : 0
    const sampleRate = this.resolveSdkEventSampleRate()

    const logFn =
      failRate >= 0.5 || dropRate >= 0.3 || queueDepth >= MESSAGE_REPORT_MAX_QUEUE / 2
        ? analyticsLog.warn.bind(analyticsLog)
        : analyticsLog.info.bind(analyticsLog)

    logFn('Analytics reporter health', {
      meta: {
        windowMinutes: Math.round(elapsedMinutes * 10) / 10,
        requestsPerMin: Number(requestsPerMin.toFixed(2)),
        queueDepth,
        failRate: Number((failRate * 100).toFixed(1)),
        dropRate: Number((dropRate * 100).toFixed(1)),
        avgBatchSize: Number(avgBatchSize.toFixed(1)),
        deliveryRate: Number((deliveryRate * 100).toFixed(1)),
        sdkSampleRate: Number((sampleRate * 100).toFixed(0)),
        sdkSampleDropRate: Number((sampleDropRate * 100).toFixed(1))
      }
    })

    this.reportHealthWindowStartedAt = now
    this.messageReportObservedCount = 0
    this.messageReportDroppedCount = 0
    this.messageReportAttemptCount = 0
    this.messageReportFailureCount = 0
    this.messageReportAttemptedItems = 0
    this.messageReportSucceededItems = 0
    this.sdkEventSampleAcceptedCount = 0
    this.sdkEventSampledOutCount = 0
  }

  private startCleanup(): void {
    if (!this.dbStore) return
    // 清理操作不需要立即执行，注册定时任务即可
    // 首次清理延迟 5 分钟，避免在启动期增加 DB 负载
    pollingService.register(
      ANALYTICS_CLEANUP_TASK_ID,
      () =>
        this.dbStore
          ?.cleanup(DEFAULT_RETENTION_MS, () => Date.now())
          .catch((error) => {
            const message = error instanceof Error ? error.message : String(error)
            analyticsLog.warn('Analytics DB cleanup failed', { error: message })
          }),
      {
        interval: 60 * 60 * 1000,
        unit: 'milliseconds',
        initialDelayMs: 5 * 60 * 1000
      }
    )
    pollingService.start()
  }

  recordSearchMetrics(totalDurationMs: number, providerTimings: Record<string, number>): void {
    this.core.recordSearchMetrics(totalDurationMs, providerTimings)
  }
}

export const analyticsModule = new AnalyticsModule()
