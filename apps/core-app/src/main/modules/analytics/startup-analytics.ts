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
  StartupMetrics,
} from './types'
import { randomUUID } from 'node:crypto'
import os from 'node:os'
import process from 'node:process'
import { getBooleanEnv, getEnvOrDefault, getTelemetryApiBase, normalizeBaseUrl } from '@talex-touch/utils/env'
import { app } from 'electron'
import { createLogger } from '../../utils/logger'
import { getAnalyticsMessageStore } from './message-store'
import { ReportQueueStore } from './report-queue-store'
import { databaseModule } from '../database'
import { getConfig, saveConfig } from '../storage'
import { getOrCreateTelemetryClientId } from './telemetry-client'

const analyticsLog = createLogger('StartupAnalytics')
const REPORT_QUEUE_FILE = 'startup-analytics-report-queue.json'
const REPORT_QUEUE_MAX_AGE = 14 * 24 * 60 * 60 * 1000
const REPORT_QUEUE_BACKOFF_BASE_MS = 30_000
const REPORT_QUEUE_BACKOFF_MAX_MS = 10 * 60_000

type FileReportQueueItem = {
  payload: any
  endpoint: string
  createdAt: number
  retryCount?: number
  lastAttemptAt?: number
  lastError?: string
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
      ...config,
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
      isPackaged: app.isPackaged,
    }

    analyticsLog.info('StartupAnalytics initialized', {
      meta: { sessionId: this.currentMetrics.sessionId },
    })
  }

  /**
   * Record main process metrics
   */
  setMainProcessMetrics(metrics: MainProcessMetrics): void {
    this.currentMetrics.mainProcess = metrics

    if (this.currentMetrics.renderer) {
      this.currentMetrics.totalStartupTime
        = this.currentMetrics.renderer.readyTime - metrics.processCreationTime
    }

    analyticsLog.debug('Main process metrics recorded', {
      meta: { modulesLoadTime: metrics.modulesLoadTime },
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
      this.currentMetrics.totalStartupTime
        = metrics.readyTime - this.currentMetrics.mainProcess.processCreationTime
    }

    analyticsLog.success('Renderer process metrics recorded', {
      meta: {
        totalStartupTime: this.currentMetrics.totalStartupTime,
        readyTime: metrics.readyTime - metrics.startTime,
      },
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
      order,
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
      // Import storage module dynamically to avoid circular dependencies
      const history = getConfig('startup-analytics.json') as StartupHistory

      if (history && Array.isArray(history.entries)) {
        return history
      }
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      analyticsLog.warn('Failed to load startup history', { meta: { error: errorMessage } })
    }

    return {
      entries: [],
      maxEntries: this.config.maxHistory,
      lastUpdated: Date.now(),
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

      saveConfig('startup-analytics.json', JSON.stringify(history, null, 2))

      analyticsLog.success('Metrics saved to history', {
        meta: {
          sessionId: metrics.sessionId,
          totalStartupTime: metrics.totalStartupTime,
          historyCount: history.entries.length,
        },
      })
    }
    catch (error) {
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
    if (!item.lastAttemptAt)
      return true
    const retryCount = item.retryCount ?? 0
    const backoffMs = this.getReportBackoffMs(retryCount)
    return Date.now() - item.lastAttemptAt >= backoffMs
  }

  private loadReportQueue(): FileReportQueueItem[] {
    try {
      const data = getConfig(REPORT_QUEUE_FILE) as unknown
      if (Array.isArray(data))
        return data as FileReportQueueItem[]
      if (typeof data === 'string') {
        const parsed = JSON.parse(data)
        if (Array.isArray(parsed))
          return parsed as FileReportQueueItem[]
      }
    }
    catch {
      // ignore parse errors, treat as empty
    }
    return []
  }

  private saveReportQueue(queue: FileReportQueueItem[]): void {
    const pruned = queue.filter(item => Date.now() - item.createdAt <= REPORT_QUEUE_MAX_AGE)
    saveConfig(REPORT_QUEUE_FILE, JSON.stringify(pruned, null, 2))
  }

  private getReportQueueStore(): ReportQueueStore | null {
    if (this.reportQueueStore)
      return this.reportQueueStore
    try {
      const db = databaseModule.getDb()
      this.reportQueueStore = new ReportQueueStore(db)
      return this.reportQueueStore
    }
    catch {
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
    if (!queue.length)
      return

    const freshQueue = queue.filter(item => Date.now() - item.createdAt <= REPORT_QUEUE_MAX_AGE)
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
          body: JSON.stringify(item.payload),
        })
        if (!response.ok) {
          const text = await response.text().catch(() => '')
          throw new Error(`Queued report failed: ${response.status} ${response.statusText} ${text}`.trim())
        }
        succeeded += 1
      }
      catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        firstError ||= errorMessage
        remaining.push({
          ...item,
          retryCount: (item.retryCount ?? 0) + 1,
          lastAttemptAt: Date.now(),
          lastError: errorMessage,
        })
      }
    }

    this.saveReportQueue(remaining)

    if (attempted === 0)
      return

    if (succeeded === attempted) {
      analyticsLog.success('Queued startup analytics flushed', {
        meta: { count: succeeded },
      })
      return
    }

    analyticsLog.warn('Queued startup analytics flush incomplete', {
      meta: {
        attempted,
        succeeded,
        skipped,
        error: firstError,
      },
    })
  }

  private async flushQueuedReportsFromDb(store: ReportQueueStore, endpoint: string): Promise<void> {
    const cutoff = Date.now() - REPORT_QUEUE_MAX_AGE
    const items = await store.list(cutoff)
    if (!items.length)
      return

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
          body: JSON.stringify(item.payload),
        })
        if (!response.ok) {
          const text = await response.text().catch(() => '')
          throw new Error(`Queued report failed: ${response.status} ${response.statusText} ${text}`.trim())
        }
        await store.remove(item.id)
        succeeded += 1
      }
      catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        await store.markAttempt(item.id, errorMessage)
        firstError ||= errorMessage
      }
    }

    await store.prune(cutoff)

    if (attempted === 0)
      return

    if (succeeded === attempted) {
      analyticsLog.success('Queued startup analytics flushed (db)', {
        meta: { count: succeeded },
      })
      return
    }

    analyticsLog.warn('Queued startup analytics flush incomplete (db)', {
      meta: {
        attempted,
        succeeded,
        skipped,
        error: firstError,
      },
    })
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
        const localBase = normalizeBaseUrl(getEnvOrDefault('NEXUS_API_BASE_LOCAL', 'http://localhost:3200'))
        url = `${localBase}/api/telemetry/record`
      }
      else {
        try {
          url = `${getTelemetryApiBase()}/api/telemetry/record`
        }
        catch {
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

    try {
      analyticsLog.info('Reporting metrics (anonymous)', {
        meta: { endpoint: url },
      })

      await this.flushQueuedReports(url)

      const memory = {
        total: os.totalmem(),
        free: os.freemem(),
      }

      const cpus = os.cpus()
      const cpu = {
        count: cpus.length,
        model: cpus[0]?.model,
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
          memory,
          cpu,
          uptime: os.uptime(),
          release: os.release(),
          type: os.type(),
        },
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(`Startup analytics report failed: ${response.status} ${response.statusText} ${text}`.trim())
      }

      analyticsLog.success('Metrics reported (anonymous)')
    }
    catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      analyticsLog.error('Failed to report metrics', { meta: { error: errorMessage } })
      try {
        getAnalyticsMessageStore().add({
          source: 'analytics',
          severity: 'error',
          title: 'Analytics report failed',
          message: errorMessage,
          meta: { endpoint: url },
        })
      }
      catch {
        // ignore message store failures
      }
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
            memory: {
              total: os.totalmem(),
              free: os.freemem(),
            },
            cpu: (() => {
              const cpus = os.cpus()
              return { count: cpus.length, model: cpus[0]?.model }
            })(),
            uptime: os.uptime(),
            release: os.release(),
            type: os.type(),
          },
        }

        const store = this.getReportQueueStore()
        if (store) {
          await store.insert({ payload, endpoint: url, createdAt: Date.now() })
          analyticsLog.info('Queued startup analytics for retry (db)', {
            meta: { endpoint: url },
          })
        }
        else {
          const queue = this.loadReportQueue()
          queue.push({ payload, endpoint: url, createdAt: Date.now() })
          this.saveReportQueue(queue)
          analyticsLog.info('Queued startup analytics for retry', {
            meta: { queueSize: queue.length, endpoint: url },
          })
        }
      }
      catch (queueError) {
        const queueMessage = queueError instanceof Error ? queueError.message : String(queueError)
        analyticsLog.warn('Failed to queue startup analytics', { meta: { error: queueMessage } })
      }
    }
  }

  private tryAutoFinalize(): void {
    if (this.autoFinalizePromise)
      return
    const metrics = this.getCurrentMetrics()
    if (!metrics)
      return

    this.autoFinalizePromise = (async () => {
      await this.saveToHistory()
      await this.reportMetrics()
    })().catch((error) => {
      const errorMessage = error instanceof Error ? error.message : String(error)
      analyticsLog.warn('Failed to auto finalize startup analytics', { meta: { error: errorMessage } })
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
    if (!metrics)
      return null

    const totalTime = metrics.totalStartupTime / 1000 // Convert to seconds
    const rendererTime = (metrics.renderer.readyTime - metrics.renderer.startTime) / 1000
    const mainProcessTime = metrics.mainProcess.modulesLoadTime / 1000

    let rating: 'excellent' | 'good' | 'fair' | 'poor'
    if (totalTime < 1)
      rating = 'excellent'
    else if (totalTime < 2)
      rating = 'good'
    else if (totalTime < 5)
      rating = 'fair'
    else rating = 'poor'

    return {
      totalTime,
      mainProcessTime,
      rendererTime,
      moduleCount: metrics.mainProcess.totalModules,
      rating,
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
