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
import { app } from 'electron'
import { getBooleanEnv, getTelemetryApiBase } from '@talex-touch/utils/env'
import { createLogger } from '../../utils/logger'
import { getConfig, saveConfig } from '../storage'

const analyticsLog = createLogger('StartupAnalytics')

/**
 * Startup Analytics Service
 * Tracks and stores startup performance metrics
 */
export class StartupAnalytics {
  private currentMetrics: Partial<StartupMetrics> = {}
  private moduleMetrics: ModuleLoadMetric[] = []
  private config: AnalyticsConfig
  private startTime: number

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
    analyticsLog.debug('Main process metrics recorded', {
      meta: { modulesLoadTime: metrics.modulesLoadTime },
    })
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

  /**
   * Report metrics to endpoint (anonymous)
   */
  async reportMetrics(endpoint?: string): Promise<void> {
    if (!this.config.enabled) {
      return
    }

    let url = endpoint || this.config.reportEndpoint
    if (!url) {
      try {
        url = `${getTelemetryApiBase()}/api/telemetry/record`
      }
      catch {
        url = undefined
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
          hostname: os.hostname(),
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
    }
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
