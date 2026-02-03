/**
 * Startup Analytics Module
 *
 * Collects and manages anonymous startup performance metrics
 */

import type {
  AnalyticsConfig,
  MainProcessMetrics,
  ModuleLoadMetric,
  RendererProcessMetrics,
  StartupHistory,
  StartupMetrics
} from './types'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import process from 'node:process'
import { StorageList } from '@talex-touch/utils'
import {
  getBooleanEnv,
  getEnvOrDefault,
  getTelemetryApiBase,
  normalizeBaseUrl
} from '@talex-touch/utils/env'
import { app } from 'electron'
import { createLogger } from '../../utils/logger'
import { databaseModule } from '../database'
import { getMainConfig, saveMainConfig } from '../storage'
import { ReportQueueStore } from './report-queue-store'
import { getOrCreateTelemetryClientId } from './telemetry-client'

const analyticsLog = createLogger('StartupAnalytics')
const REPORT_QUEUE_FILE = StorageList.STARTUP_ANALYTICS_REPORT_QUEUE
const REPORT_QUEUE_MAX_AGE = 14 * 24 * 60 * 60 * 1000
const REPORT_QUEUE_MAX_COUNT = 120
const REPORT_QUEUE_BACKOFF_BASE_MS = 30_000
const REPORT_QUEUE_BACKOFF_MAX_MS = 10 * 60_000

export interface FileReportQueueItem {
  payload: Record<string, unknown>
  endpoint: string
  createdAt: number
  retryCount?: number
  lastAttemptAt?: number
}

/**
 * Startup Analytics Service
 * Tracks and stores startup performance metrics
 */
export class StartupAnalytics {
  private currentMetrics: Partial<StartupMetrics> = {}
  private moduleMetrics: ModuleLoadMetric[] = []
  private config: AnalyticsConfig
  private startTime: number
  private reportQueueStore?: ReportQueueStore
  private autoFinalizePromise: Promise<void> | null = null

  constructor(config?: Partial<AnalyticsConfig>) {
    const enabled = getBooleanEnv('TUFF_STARTUP_ANALYTICS_ENABLED', true)
    this.config = {
      enabled,
      maxHistory: 10,
      ...config
    }

    this.startTime = Date.now()

    // Initialize current session
    this.currentMetrics = {
      sessionId: randomUUID(),
      timestamp: this.startTime,
      platform: process.platform,
      arch: process.arch,
      version: app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      isPackaged: app.isPackaged
    }

    analyticsLog.info('StartupAnalytics initialized', {
      meta: { sessionId: this.currentMetrics.sessionId }
    })
  }

  /**
   * Record main process metrics
   */
  setMainProcessMetrics(metrics: MainProcessMetrics): void {
    this.currentMetrics.mainProcess = metrics

    if (this.currentMetrics.renderer) {
      this.currentMetrics.totalStartupTime =
        this.currentMetrics.renderer.readyTime - metrics.processCreationTime
    }

    analyticsLog.debug('Main process metrics recorded', {
      meta: { modulesLoadTime: metrics.modulesLoadTime }
    })

    this.tryAutoFinalize()
  }

  /**
   * Record renderer process metrics
   */
  setRendererProcessMetrics(metrics: RendererProcessMetrics): void {
    this.currentMetrics.renderer = metrics

    // Calculate total startup time
    if (this.currentMetrics.mainProcess) {
      this.currentMetrics.totalStartupTime =
        metrics.readyTime - this.currentMetrics.mainProcess.processCreationTime
    }

    analyticsLog.success('Renderer process metrics recorded', {
      meta: {
        totalStartupTime: this.currentMetrics.totalStartupTime,
        readyTime: metrics.readyTime - metrics.startTime
      }
    })

    this.tryAutoFinalize()
  }

  /**
   * Track module load time
   */
  trackModuleLoad(moduleName: string, loadTime: number, order: number): void {
    this.moduleMetrics.push({
      name: moduleName,
      loadTime,
      order
    })
  }

  /**
   * Get current startup metrics
   */
  getCurrentMetrics(): StartupMetrics | null {
    if (!this.currentMetrics.mainProcess || !this.currentMetrics.renderer) {
      return null
    }

    return this.currentMetrics as StartupMetrics
  }

  /**
   * Get startup history from storage
   */
  getHistory(): StartupHistory {
    try {
      // Load persisted history from storage
      const history = getMainConfig(StorageList.STARTUP_ANALYTICS) as StartupHistory

      if (history && Array.isArray(history.entries)) {
        return history
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      analyticsLog.warn('Failed to load startup history', { meta: { error: errorMessage } })
    }

    return {
      entries: [],
      maxEntries: this.config.maxHistory,
      lastUpdated: Date.now()
    }
  }

  /**
   * Save current metrics to history
   */
  async saveToHistory(): Promise<void> {
    const metrics = this.getCurrentMetrics()
    if (!metrics) {
      analyticsLog.warn('Cannot save incomplete metrics')
      return
    }

    try {
      const history = this.getHistory()

      history.entries.unshift(metrics)

      if (history.entries.length > this.config.maxHistory) {
        history.entries = history.entries.slice(0, this.config.maxHistory)
      }

      history.lastUpdated = Date.now()

      saveMainConfig(StorageList.STARTUP_ANALYTICS, history)

      analyticsLog.success('Metrics saved to history', {
        meta: {
          sessionId: metrics.sessionId,
          totalStartupTime: metrics.totalStartupTime,
          historyCount: history.entries.length
        }
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      analyticsLog.error('Failed to save metrics to history', { meta: { error: errorMessage } })
    }
  }

  /**
   * Export metrics as JSON
   */
  exportMetrics(): string {
    const metrics = this.getCurrentMetrics()
    return JSON.stringify(metrics, null, 2)
  }

  private getReportBackoffMs(retryCount: number): number {
    const exponent = Math.min(10, Math.max(0, retryCount))
    return Math.min(REPORT_QUEUE_BACKOFF_MAX_MS, REPORT_QUEUE_BACKOFF_BASE_MS * 2 ** exponent)
  }

  private isReportDue(item: Pick<FileReportQueueItem, 'lastAttemptAt' | 'retryCount'>): boolean {
    if (!item.lastAttemptAt) return true
    const retryCount = item.retryCount ?? 0
    const backoffMs = this.getReportBackoffMs(retryCount)
    return Date.now() - item.lastAttemptAt >= backoffMs
  }

  private loadReportQueue(): FileReportQueueItem[] {
    try {
      const data = getMainConfig(REPORT_QUEUE_FILE) as unknown
      if (Array.isArray(data)) return data as FileReportQueueItem[]
      if (typeof data === 'string') {
        const parsed = JSON.parse(data)
        if (Array.isArray(parsed)) return parsed as FileReportQueueItem[]
      }
    } catch {
      // ignore parse errors, treat as empty
    }
    return []
  }

  private saveReportQueue(queue: FileReportQueueItem[]): void {
    const now = Date.now()
    const cutoff = now - REPORT_QUEUE_MAX_AGE
    const pruned = queue
      .filter((item) => item.createdAt >= cutoff)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-REPORT_QUEUE_MAX_COUNT)
      .map((item) => ({
        payload: item.payload,
        endpoint: item.endpoint,
        createdAt: item.createdAt,
        retryCount: item.retryCount,
        lastAttemptAt: item.lastAttemptAt
      }))

    saveMainConfig(REPORT_QUEUE_FILE, pruned)
  }

  private getReportQueueStore(): ReportQueueStore | null {
    if (this.reportQueueStore) return this.reportQueueStore
    try {
      const db = databaseModule.getDb()
      this.reportQueueStore = new ReportQueueStore(db)
      return this.reportQueueStore
    } catch {
      return null
    }
  }

  private async flushQueuedReports(endpoint: string): Promise<void> {
    const dbStore = this.getReportQueueStore()
    if (dbStore) {
      await this.flushQueuedReportsFromDb(dbStore, endpoint)
      return
    }

    const queue = this.loadReportQueue()
    if (!queue.length) return

    const cutoff = Date.now() - REPORT_QUEUE_MAX_AGE
    const freshQueue = queue
      .filter((item) => item.createdAt >= cutoff)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-REPORT_QUEUE_MAX_COUNT)
    const remaining: typeof freshQueue = []
    let attempted = 0
    let succeeded = 0
    let skipped = 0
    let firstError: string | null = null

    for (const item of freshQueue) {
      if (!this.isReportDue(item)) {
        skipped += 1
        remaining.push(item)
        continue
      }

      attempted += 1
      try {
        const target = item.endpoint || endpoint
        const response = await fetch(target, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload)
        })
        if (!response.ok) {
          const text = await response.text().catch(() => '')
          throw new Error(
            `Queued report failed: ${response.status} ${response.statusText} ${text}`.trim()
          )
        }
        succeeded += 1
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        firstError ||= errorMessage
        remaining.push({
          ...item,
          retryCount: (item.retryCount ?? 0) + 1,
          lastAttemptAt: Date.now()
        })
      }
    }

    this.saveReportQueue(remaining)

    if (attempted === 0) return

    if (succeeded === attempted) {
      analyticsLog.success('Queued startup analytics flushed', {
        meta: { count: succeeded }
      })
      return
    }

    analyticsLog.warn('Queued startup analytics flush incomplete', {
      meta: {
        attempted,
        succeeded,
        skipped,
        error: firstError
      }
    })
  }

  private async flushQueuedReportsFromDb(store: ReportQueueStore, endpoint: string): Promise<void> {
    const cutoff = Date.now() - REPORT_QUEUE_MAX_AGE
    const allItems = await store.list(cutoff)
    if (allItems.length > REPORT_QUEUE_MAX_COUNT) {
      const dropCount = allItems.length - REPORT_QUEUE_MAX_COUNT
      const dropped = allItems.slice(0, dropCount)
      await Promise.allSettled(dropped.map((item) => store.remove(item.id)))
    }

    const items = allItems.slice(-REPORT_QUEUE_MAX_COUNT)
    if (!items.length) return

    let attempted = 0
    let succeeded = 0
    let skipped = 0
    let firstError: string | null = null

    for (const item of items) {
      if (!this.isReportDue(item)) {
        skipped += 1
        continue
      }

      attempted += 1
      try {
        const target = item.endpoint || endpoint
        const response = await fetch(target, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload)
        })
        if (!response.ok) {
          const text = await response.text().catch(() => '')
          throw new Error(
            `Queued report failed: ${response.status} ${response.statusText} ${text}`.trim()
          )
        }
        await store.remove(item.id)
        succeeded += 1
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        await store.markAttempt(item.id)
        firstError ||= errorMessage
      }
    }

    await store.prune(cutoff)

    if (attempted === 0) return

    if (succeeded === attempted) {
      analyticsLog.success('Queued startup analytics flushed (db)', {
        meta: { count: succeeded }
      })
      return
    }

    analyticsLog.warn('Queued startup analytics flush incomplete (db)', {
      meta: {
        attempted,
        succeeded,
        skipped,
        error: firstError
      }
    })
  }

  private computeStartupAverages(entries: StartupMetrics[]): {
    startupSummary: {
      samples: number
      avgTotalStartupTime: number
      avgModulesLoadTime: number
      avgRendererReadyTime: number
    }
    moduleSummary: Record<string, { avgLoadTime: number; count: number }>
  } {
    if (!entries.length) {
      return {
        startupSummary: {
          samples: 0,
          avgTotalStartupTime: 0,
          avgModulesLoadTime: 0,
          avgRendererReadyTime: 0
        },
        moduleSummary: {}
      }
    }

    let totalStartupSum = 0
    let totalStartupCount = 0
    let modulesLoadSum = 0
    let modulesLoadCount = 0
    let rendererReadySum = 0
    let rendererReadyCount = 0
    const moduleTotals = new Map<string, { total: number; count: number }>()

    for (const entry of entries) {
      if (typeof entry.totalStartupTime === 'number') {
        totalStartupSum += entry.totalStartupTime
        totalStartupCount += 1
      }

      const modulesLoadTime = entry.mainProcess?.modulesLoadTime
      if (typeof modulesLoadTime === 'number') {
        modulesLoadSum += modulesLoadTime
        modulesLoadCount += 1
      }

      if (
        entry.renderer &&
        typeof entry.renderer.readyTime === 'number' &&
        typeof entry.renderer.startTime === 'number'
      ) {
        rendererReadySum += entry.renderer.readyTime - entry.renderer.startTime
        rendererReadyCount += 1
      }

      for (const detail of entry.mainProcess?.moduleDetails ?? []) {
        if (!detail?.name) continue
        const record = moduleTotals.get(detail.name) ?? { total: 0, count: 0 }
        record.total += detail.loadTime
        record.count += 1
        moduleTotals.set(detail.name, record)
      }
    }

    const avg = (sum: number, count: number) => (count ? Math.round(sum / count) : 0)
    const moduleSummary: Record<string, { avgLoadTime: number; count: number }> = {}

    for (const [name, record] of moduleTotals.entries()) {
      moduleSummary[name] = {
        avgLoadTime: avg(record.total, record.count),
        count: record.count
      }
    }

    return {
      startupSummary: {
        samples: entries.length,
        avgTotalStartupTime: avg(totalStartupSum, totalStartupCount),
        avgModulesLoadTime: avg(modulesLoadSum, modulesLoadCount),
        avgRendererReadyTime: avg(rendererReadySum, rendererReadyCount)
      },
      moduleSummary
    }
  }

  /**
   * Report metrics to endpoint (anonymous)
   */
  async reportMetrics(endpoint?: string): Promise<void> {
    if (!this.config.enabled) {
      return
    }

    const isLocal = !app.isPackaged || process.env.NODE_ENV === 'development'

    let url = endpoint || this.config.reportEndpoint
    if (!url) {
      if (isLocal) {
        const localBase = normalizeBaseUrl(
          getEnvOrDefault('NEXUS_API_BASE_LOCAL', 'http://localhost:3200')
        )
        url = `${localBase}/api/telemetry/record`
      } else {
        try {
          url = `${getTelemetryApiBase()}/api/telemetry/record`
        } catch {
          url = undefined
        }
      }
    }
    if (!url) {
      analyticsLog.warn('No reporting endpoint configured')
      return
    }

    const metrics = this.getCurrentMetrics()
    if (!metrics) {
      analyticsLog.warn('Cannot report incomplete metrics')
      return
    }

    const history = this.getHistory()
    const entries = [
      metrics,
      ...history.entries.filter((entry) => entry.sessionId !== metrics.sessionId)
    ]
    const limitedEntries = entries.slice(0, this.config.maxHistory)
    const { startupSummary, moduleSummary } = this.computeStartupAverages(limitedEntries)

    try {
      analyticsLog.info('Reporting metrics (anonymous)', {
        meta: { endpoint: url }
      })

      await this.flushQueuedReports(url)

      const memory = {
        total: os.totalmem(),
        free: os.freemem()
      }

      const cpus = os.cpus()
      const cpu = {
        count: cpus.length,
        model: cpus[0]?.model
      }

      const payload = {
        eventType: 'visit',
        clientId: getOrCreateTelemetryClientId(),
        platform: metrics.platform,
        version: metrics.version,
        isAnonymous: true,
        metadata: {
          kind: 'startup',
          sessionId: metrics.sessionId,
          timestamp: metrics.timestamp,
          arch: metrics.arch,
          electronVersion: metrics.electronVersion,
          nodeVersion: metrics.nodeVersion,
          isPackaged: metrics.isPackaged,
          totalStartupTime: metrics.totalStartupTime,
          mainProcess: metrics.mainProcess,
          renderer: metrics.renderer,
          startupSummary,
          moduleSummary,
          memory,
          cpu,
          uptime: os.uptime(),
          release: os.release(),
          type: os.type()
        }
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(
          `Startup analytics report failed: ${response.status} ${response.statusText} ${text}`.trim()
        )
      }

      analyticsLog.success('Metrics reported (anonymous)')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      analyticsLog.error('Failed to report metrics', { meta: { error: errorMessage } })
      try {
        const payload = {
          eventType: 'visit',
          clientId: getOrCreateTelemetryClientId(),
          platform: metrics.platform,
          version: metrics.version,
          isAnonymous: true,
          metadata: {
            kind: 'startup',
            sessionId: metrics.sessionId,
            timestamp: metrics.timestamp,
            arch: metrics.arch,
            electronVersion: metrics.electronVersion,
            nodeVersion: metrics.nodeVersion,
            isPackaged: metrics.isPackaged,
            totalStartupTime: metrics.totalStartupTime,
            mainProcess: metrics.mainProcess,
            renderer: metrics.renderer,
            startupSummary,
            moduleSummary,
            memory: {
              total: os.totalmem(),
              free: os.freemem()
            },
            cpu: (() => {
              const cpus = os.cpus()
              return { count: cpus.length, model: cpus[0]?.model }
            })(),
            uptime: os.uptime(),
            release: os.release(),
            type: os.type()
          }
        }

        const store = this.getReportQueueStore()
        if (store) {
          await store.insert({ payload, endpoint: url, createdAt: Date.now() })
          analyticsLog.info('Queued startup analytics for retry (db)', {
            meta: { endpoint: url }
          })
        } else {
          const queue = this.loadReportQueue()
          queue.push({ payload, endpoint: url, createdAt: Date.now() })
          this.saveReportQueue(queue)
          analyticsLog.info('Queued startup analytics for retry', {
            meta: { queueSize: queue.length, endpoint: url }
          })
        }
      } catch (queueError) {
        const queueMessage = queueError instanceof Error ? queueError.message : String(queueError)
        analyticsLog.warn('Failed to queue startup analytics', { meta: { error: queueMessage } })
      }
    }
  }

  private tryAutoFinalize(): void {
    if (this.autoFinalizePromise) return
    const metrics = this.getCurrentMetrics()
    if (!metrics) return

    this.autoFinalizePromise = (async () => {
      await this.saveToHistory()
      await this.reportMetrics()
    })().catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error)
      analyticsLog.warn('Failed to auto finalize startup analytics', {
        meta: { error: errorMessage }
      })
    })
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary(): {
    totalTime: number
    mainProcessTime: number
    rendererTime: number
    moduleCount: number
    rating: 'excellent' | 'good' | 'fair' | 'poor'
  } | null {
    const metrics = this.getCurrentMetrics()
    if (!metrics) return null

    const totalTime = metrics.totalStartupTime / 1000 // Convert to seconds
    const rendererTime = (metrics.renderer.readyTime - metrics.renderer.startTime) / 1000
    const mainProcessTime = metrics.mainProcess.modulesLoadTime / 1000

    let rating: 'excellent' | 'good' | 'fair' | 'poor'
    if (totalTime < 1) rating = 'excellent'
    else if (totalTime < 2) rating = 'good'
    else if (totalTime < 5) rating = 'fair'
    else rating = 'poor'

    return {
      totalTime,
      mainProcessTime,
      rendererTime,
      moduleCount: metrics.mainProcess.totalModules,
      rating
    }
  }
}

let analyticsInstance: StartupAnalytics | null = null

/**
 * Get or create analytics instance
 */
export function getStartupAnalytics(config?: Partial<AnalyticsConfig>): StartupAnalytics {
  if (!analyticsInstance) {
    analyticsInstance = new StartupAnalytics(config)
  }
  return analyticsInstance
}

/**
 * Reset analytics instance (for testing)
 */
export function resetAnalytics(): void {
  analyticsInstance = null
}
