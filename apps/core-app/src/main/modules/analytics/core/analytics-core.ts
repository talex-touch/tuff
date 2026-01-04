import type {
  AnalyticsExportPayload,
  AnalyticsExportResult,
  AnalyticsRangeRequest,
  AnalyticsSnapshot,
  AnalyticsWindowType,
  CoreMetrics,
  FeatureStats,
  PluginStats,
} from '@talex-touch/utils/analytics'
import type { SystemSample } from '../collectors/system-sampler'
import type { DbStore } from '../storage/db-store'
import type { StartupMetrics } from '../types'
import { IpcTracer } from '../collectors/ipc-tracer'
import { PluginTracer } from '../collectors/plugin-tracer'
import { MemoryStore } from '../storage/memory-store'
import { TimeWindowCollector } from './time-window-collector'

function buildCsv(snapshots: AnalyticsSnapshot[]): string {
  if (!snapshots.length)
    return 'windowType,timestamp,metrics\n'
  const header = 'windowType,timestamp,metrics\n'
  const rows = snapshots.map((snapshot) => {
    return `${snapshot.windowType},${snapshot.timestamp},${JSON.stringify(snapshot.metrics)}`
  })
  return header + rows.join('\n')
}

interface AnalyticsCoreOptions {
  store?: MemoryStore
  collector?: TimeWindowCollector
  ipcTracer?: IpcTracer
  pluginTracer?: PluginTracer
  dbStore?: DbStore
}

/**
 * Core engine responsible for aggregating and serving analytics metrics.
 */
export class AnalyticsCore {
  private readonly store: MemoryStore
  private readonly collector: TimeWindowCollector
  private readonly ipcTracer: IpcTracer
  private readonly pluginTracer: PluginTracer
  private readonly dbStore?: DbStore
  private reportingEnabled = true
  private searchCount = 0
  private totalSearchDuration = 0

  private currentMetrics: CoreMetrics = {}

  constructor(options?: AnalyticsCoreOptions) {
    this.store = options?.store ?? new MemoryStore()
    this.collector = options?.collector ?? new TimeWindowCollector(this.store)
    this.ipcTracer = options?.ipcTracer ?? new IpcTracer()
    this.pluginTracer = options?.pluginTracer ?? new PluginTracer()
    this.dbStore = options?.dbStore
  }

  hydrateStartupMetrics(startup: StartupMetrics | null): void {
    if (!startup)
      return

    const modules: CoreMetrics['modules'] = {}
    for (const detail of startup.mainProcess.moduleDetails) {
      modules[detail.name] = {
        operationCount: 1,
        avgDuration: detail.loadTime,
        errorCount: 0,
      }
    }

    this.currentMetrics = {
      ...this.currentMetrics,
      modules,
    }

    void this.recordAndPersist(this.currentMetrics, '1m')
  }

  recordSystemSample(sample: SystemSample): AnalyticsSnapshot[] {
    this.currentMetrics = {
      ...this.currentMetrics,
      system: {
        cpuUsage: sample.cpuUsage,
        memoryUsed: sample.memoryUsed,
        memoryTotal: sample.memoryTotal,
        heapUsed: sample.heapUsed,
        heapTotal: sample.heapTotal,
      },
    }

    return this.recordAndPersist(this.currentMetrics, '1m')
  }

  trackIPC(durationMs: number, success = true): AnalyticsSnapshot[] {
    this.ipcTracer.track(durationMs, success)
    this.currentMetrics = {
      ...this.currentMetrics,
      ipc: this.ipcTracer.snapshot(),
    }

    return this.recordAndPersist(this.currentMetrics, '1m')
  }

  trackPluginEvent(pluginName: string, featureId?: string, _metadata?: Record<string, unknown>): AnalyticsSnapshot[] {
    this.pluginTracer.trackEvent(pluginName, featureId)
    this.currentMetrics = {
      ...this.currentMetrics,
      plugins: this.pluginTracer.snapshot(),
    }
    return this.recordAndPersist(this.currentMetrics, '1m')
  }

  trackPluginDuration(pluginName: string, featureId: string | undefined, durationMs: number): AnalyticsSnapshot[] {
    this.pluginTracer.trackDuration(pluginName, featureId, durationMs)
    this.currentMetrics = {
      ...this.currentMetrics,
      plugins: this.pluginTracer.snapshot(),
    }
    return this.recordAndPersist(this.currentMetrics, '1m')
  }

  incrementPluginCounter(pluginName: string, name: string, value?: number): void {
    this.pluginTracer.incrementCounter(pluginName, name, value)
    this.currentMetrics = { ...this.currentMetrics, plugins: this.pluginTracer.snapshot() }
    void this.recordAndPersist(this.currentMetrics, '1m')
  }

  setPluginGauge(pluginName: string, name: string, value: number): void {
    this.pluginTracer.setGauge(pluginName, name, value)
    this.currentMetrics = { ...this.currentMetrics, plugins: this.pluginTracer.snapshot() }
    void this.recordAndPersist(this.currentMetrics, '1m')
  }

  recordPluginHistogram(pluginName: string, name: string, value: number): void {
    this.pluginTracer.recordHistogram(pluginName, name, value)
    this.currentMetrics = { ...this.currentMetrics, plugins: this.pluginTracer.snapshot() }
    void this.recordAndPersist(this.currentMetrics, '1m')
  }

  recordSearchMetrics(totalDurationMs: number, providerTimings: Record<string, number>): AnalyticsSnapshot[] {
    this.searchCount += 1
    this.totalSearchDuration += totalDurationMs
    const avgDuration = this.searchCount > 0 ? this.totalSearchDuration / this.searchCount : 0

    this.currentMetrics = {
      ...this.currentMetrics,
      search: {
        totalSearches: this.searchCount,
        avgDuration,
        providerTimings,
      },
    }

    return this.recordAndPersist(this.currentMetrics, '1m')
  }

  getPluginStats(pluginName: string): PluginStats {
    return this.pluginTracer.getStats(pluginName)
  }

  getPluginFeatureStats(pluginName: string, featureId: string): FeatureStats {
    return this.pluginTracer.getFeatureStats(pluginName, featureId)
  }

  getTopPluginFeatures(pluginName: string, limit?: number) {
    return this.pluginTracer.getTopFeatures(pluginName, limit)
  }

  getSnapshot(windowType: AnalyticsWindowType): AnalyticsSnapshot {
    const latest = this.store.latest(windowType)
    if (latest)
      return latest

    return {
      windowType,
      timestamp: Date.now(),
      metrics: this.currentMetrics,
    }
  }

  async getRange(request: AnalyticsRangeRequest): Promise<AnalyticsSnapshot[]> {
    const fromMemory = this.store.range(request)
    if (!this.dbStore)
      return fromMemory

    const fromDb = await this.dbStore.getRange(request)
    const merged = new Map<string, AnalyticsSnapshot>()
    for (const item of [...fromMemory, ...fromDb]) {
      merged.set(`${item.windowType}-${item.timestamp}`, item)
    }
    return Array.from(merged.values()).sort((a, b) => a.timestamp - b.timestamp)
  }

  async exportSnapshots(payload: AnalyticsExportPayload): Promise<AnalyticsExportResult> {
    const snapshots = await this.getRange(payload)
    const format = payload.format ?? 'json'

    const content = format === 'csv'
      ? buildCsv(snapshots)
      : JSON.stringify(snapshots, null, 2)

    return {
      format,
      content,
      payload,
      exportedAt: Date.now(),
    }
  }

  setReporting(enabled: boolean): void {
    this.reportingEnabled = enabled
  }

  isReportingEnabled(): boolean {
    return this.reportingEnabled
  }

  private recordAndPersist(metrics: CoreMetrics, baseWindow: AnalyticsWindowType): AnalyticsSnapshot[] {
    const snapshots = this.collector.record(metrics, baseWindow)
    if (this.dbStore) {
      void this.dbStore.saveSnapshots(snapshots)
    }
    return snapshots
  }
}
