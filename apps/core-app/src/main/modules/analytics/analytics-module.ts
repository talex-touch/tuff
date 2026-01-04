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
  TrackEventPayload,
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
  ReportMetricsResponse,
} from '@talex-touch/utils/transport/events/types'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import type { StartupHistory, StartupMetrics } from './types'
import { getTuffTransportMain } from '@talex-touch/utils/transport'
import { AppEvents } from '@talex-touch/utils/transport/events'
import { getStartupAnalytics } from '.'
import { setIpcTracer } from '../../core/channel-core'
import { createLogger } from '../../utils/logger'
import { BaseModule } from '../abstract-base-module'
import { databaseModule } from '../database'
import { pluginModule } from '../plugin/plugin-module'
import { getAnalyticsMessageStore, type AnalyticsMessageStore } from './message-store'
import { SystemSampler } from './collectors/system-sampler'
import { AnalyticsCore } from './core/analytics-core'
import { DbStore } from './storage/db-store'
import { DEFAULT_RETENTION_MS } from './storage/memory-store'

const analyticsLog = createLogger('Analytics')

export class AnalyticsModule extends BaseModule {
  static key: symbol = Symbol.for('AnalyticsModule')
  name: ModuleKey = AnalyticsModule.key

  private transport: ITuffTransportMain | null = null
  private disposers: Array<() => void> = []
  private core!: AnalyticsCore
  private sampler!: SystemSampler
  private dbStore?: DbStore
  private cleanupTimer?: NodeJS.Timeout
  private messageStore?: AnalyticsMessageStore

  constructor() {
    super(AnalyticsModule.key, {
      create: true,
      dirName: 'analytics',
    })
  }

  onInit(ctx: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    this.dbStore = new DbStore(databaseModule.getDb())
    this.core = new AnalyticsCore({ dbStore: this.dbStore })
    this.sampler = new SystemSampler(sample => this.core.recordSystemSample(sample))
    this.messageStore = getAnalyticsMessageStore()

    this.transport = getTuffTransportMain(
      ctx.app.channel as any,
      (ctx.app.channel as any)?.keyManager ?? ctx.app.channel,
    )

    setIpcTracer((eventName, durationMs, success) => {
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
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
    }
    for (const dispose of this.disposers) {
      try {
        dispose()
      }
      catch {
        // ignore cleanup errors
      }
    }
    this.disposers = []
  }

  private registerHandlers(): void {
    if (!this.transport)
      return

    this.disposers.push(
      this.transport.on<AnalyticsSnapshotRequest, AnalyticsSnapshot>(
        AppEvents.analytics.getSnapshot,
        ({ windowType }) => this.core.getSnapshot(windowType ?? '1m'),
      ),
    )

    this.disposers.push(
      this.transport.on<AnalyticsRangeRequest, AnalyticsSnapshot[]>(
        AppEvents.analytics.getRange,
        payload => this.core.getRange({
          windowType: payload?.windowType ?? '1m',
          from: payload?.from ?? 0,
          to: payload?.to ?? Date.now(),
        }),
      ),
    )

    this.disposers.push(
      this.transport.on<AnalyticsExportPayload, AnalyticsExportResult>(
        AppEvents.analytics.export,
        payload => this.core.exportSnapshots({
          windowType: payload?.windowType ?? '1m',
          from: payload?.from ?? 0,
          to: payload?.to ?? Date.now(),
          format: payload?.format,
          dimensions: payload?.dimensions,
        }),
      ),
    )

    this.disposers.push(
      this.transport.on<AnalyticsToggleRequest, { enabled: boolean }>(
        AppEvents.analytics.toggleReporting,
        ({ enabled }) => {
          this.core.setReporting(enabled)
          return { enabled }
        },
      ),
    )

    this.disposers.push(
      this.transport.on<AnalyticsMessageListRequest, AnalyticsMessage[]>(
        AppEvents.analytics.messages.list,
        payload => this.messageStore?.list(payload) ?? [],
      ),
    )

    this.disposers.push(
      this.transport.on<AnalyticsMessageUpdateRequest, AnalyticsMessage | null>(
        AppEvents.analytics.messages.mark,
        payload => this.messageStore?.updateStatus(payload.id, payload.status) ?? null,
      ),
    )

    this.disposers.push(
      this.transport.on<TrackEventPayload, { ok: true }>(
        AppEvents.analytics.sdk.trackEvent,
        async (payload, context) => {
          const { pluginName, pluginVersion } = this.resolvePluginInfo(payload, context)
          if (!pluginName)
            return { ok: true }
          this.core.trackPluginEvent(pluginName, payload.featureId, payload.metadata)
          await this.dbStore?.insertPluginEvent({
            pluginName,
            pluginVersion,
            featureId: payload.featureId,
            eventType: payload.eventName,
            metadata: payload.metadata,
            timestamp: Date.now(),
          })
          return { ok: true }
        },
      ),
    )

    this.disposers.push(
      this.transport.on<TrackDurationPayload, { ok: true }>(
        AppEvents.analytics.sdk.trackDuration,
        async (payload, context) => {
          const { pluginName, pluginVersion } = this.resolvePluginInfo(payload, context)
          if (!pluginName)
            return { ok: true }
          this.core.trackPluginDuration(pluginName, payload.featureId, payload.durationMs)
          await this.dbStore?.insertPluginEvent({
            pluginName,
            pluginVersion,
            featureId: payload.featureId,
            eventType: payload.operationName,
            metadata: { durationMs: payload.durationMs },
            timestamp: Date.now(),
          })
          return { ok: true }
        },
      ),
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
              histograms: {},
            }
          }
          return this.core.getPluginStats(pluginName)
        },
      ),
    )

    this.disposers.push(
      this.transport.on<{ pluginName?: string, featureId: string }, FeatureStats>(
        AppEvents.analytics.sdk.getFeatureStats,
        (payload) => {
          const pluginName = this.resolvePluginName(payload)
          if (!pluginName)
            return { count: 0, avgDuration: 0 }
          return this.core.getPluginFeatureStats(pluginName, payload.featureId)
        },
      ),
    )

    this.disposers.push(
      this.transport.on<{ pluginName?: string, limit?: number }, Array<{ id: string, count: number }>>(
        AppEvents.analytics.sdk.getTopFeatures,
        (payload) => {
          const pluginName = this.resolvePluginName(payload)
          if (!pluginName)
            return []
          return this.core.getTopPluginFeatures(pluginName, payload.limit)
        },
      ),
    )

    this.disposers.push(
      this.transport.on<CounterPayload, { ok: true }>(
        AppEvents.analytics.sdk.incrementCounter,
        async (payload, context) => {
          const { pluginName, pluginVersion } = this.resolvePluginInfo(payload, context)
          if (!pluginName)
            return { ok: true }
          this.core.incrementPluginCounter(pluginName, payload.name, payload.value)
          await this.dbStore?.insertPluginEvent({
            pluginName,
            pluginVersion,
            eventType: 'counter',
            metadata: { name: payload.name, value: payload.value },
            timestamp: Date.now(),
          })
          return { ok: true }
        },
      ),
    )

    this.disposers.push(
      this.transport.on<GaugePayload, { ok: true }>(
        AppEvents.analytics.sdk.setGauge,
        async (payload, context) => {
          const { pluginName, pluginVersion } = this.resolvePluginInfo(payload, context)
          if (!pluginName)
            return { ok: true }
          this.core.setPluginGauge(pluginName, payload.name, payload.value)
          await this.dbStore?.insertPluginEvent({
            pluginName,
            pluginVersion,
            eventType: 'gauge',
            metadata: { name: payload.name, value: payload.value },
            timestamp: Date.now(),
          })
          return { ok: true }
        },
      ),
    )

    this.disposers.push(
      this.transport.on<HistogramPayload, { ok: true }>(
        AppEvents.analytics.sdk.recordHistogram,
        async (payload, context) => {
          const { pluginName, pluginVersion } = this.resolvePluginInfo(payload, context)
          if (!pluginName)
            return { ok: true }
          this.core.recordPluginHistogram(pluginName, payload.name, payload.value)
          await this.dbStore?.insertPluginEvent({
            pluginName,
            pluginVersion,
            eventType: 'histogram',
            metadata: { name: payload.name, value: payload.value },
            timestamp: Date.now(),
          })
          return { ok: true }
        },
      ),
    )

    // Compatibility handlers for existing analytics events
    const startupAnalytics = getStartupAnalytics()

    this.disposers.push(
      this.transport.on<void, CurrentMetrics>(
        AppEvents.analytics.getCurrent,
        () => this.toCurrentMetrics(startupAnalytics.getCurrentMetrics()),
      ),
    )

    this.disposers.push(
      this.transport.on<void, PerformanceHistoryEntry[]>(
        AppEvents.analytics.getHistory,
        () => this.toHistory(startupAnalytics.getHistory()),
      ),
    )

    this.disposers.push(
      this.transport.on<void, PerformanceSummary>(
        AppEvents.analytics.getSummary,
        () => this.toSummary(startupAnalytics.getHistory()),
      ),
    )

    this.disposers.push(
      this.transport.on<ReportMetricsRequest, ReportMetricsResponse>(
        AppEvents.analytics.report,
        async ({ endpoint }) => {
          try {
            await startupAnalytics.reportMetrics(endpoint)
            return { success: true }
          }
          catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            analyticsLog.error('Failed to report startup metrics', { error: message })
            return { success: false }
          }
        },
      ),
    )
  }

  private toCurrentMetrics(startup: StartupMetrics | null): CurrentMetrics {
    if (!startup)
      return {}

    return {
      startupTime: startup.totalStartupTime,
      memoryUsage: startup.renderer?.domContentLoaded,
      cpuUsage: undefined,
    }
  }

  private toHistory(history: StartupHistory): PerformanceHistoryEntry[] {
    const entries = history?.entries ?? []
    return entries.map(item => ({
      timestamp: item.timestamp,
      metrics: {
        startupTime: item.totalStartupTime,
      },
    }))
  }

  private toSummary(history: StartupHistory): PerformanceSummary {
    const entries = history?.entries ?? []
    if (!entries.length) {
      return { sampleCount: 0 }
    }

    const total = entries.reduce((acc, cur) => acc + (cur.totalStartupTime || 0), 0)
    const timestamps = entries.map(item => item.timestamp)

    return {
      sampleCount: entries.length,
      avgStartupTime: total / entries.length,
      timeRange: {
        start: Math.min(...timestamps),
        end: Math.max(...timestamps),
      },
    }
  }

  private resolvePluginName(
    payload: { pluginName?: string },
    context?: { plugin?: { name?: string } },
  ): string | undefined {
    return this.resolvePluginInfo(payload, context).pluginName
  }

  private resolvePluginInfo(
    payload: { pluginName?: string, pluginVersion?: string },
    context?: { plugin?: { name?: string } },
  ): { pluginName?: string, pluginVersion?: string } {
    const pluginName = payload.pluginName || context?.plugin?.name
    const pluginVersion = payload.pluginVersion
      || (pluginName ? pluginModule.pluginManager?.getPluginByName(pluginName)?.version : undefined)
    return { pluginName, pluginVersion }
  }

  private startCleanup(): void {
    if (!this.dbStore)
      return
    const run = () =>
      this.dbStore?.cleanup(DEFAULT_RETENTION_MS, () => Date.now()).catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        analyticsLog.warn('Analytics DB cleanup failed', { error: message })
      })

    run()
    this.cleanupTimer = setInterval(run, 60 * 60 * 1000)
  }

  recordSearchMetrics(totalDurationMs: number, providerTimings: Record<string, number>): void {
    this.core.recordSearchMetrics(totalDurationMs, providerTimings)
  }
}

export const analyticsModule = new AnalyticsModule()
