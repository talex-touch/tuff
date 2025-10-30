/**
 * Startup Analytics Module
 *
 * Collects and manages anonymous startup performance metrics
 */

import { randomUUID } from 'node:crypto'
import { app } from 'electron'
import type {
  StartupMetrics,
  StartupHistory,
  AnalyticsConfig,
  MainProcessMetrics,
  RendererProcessMetrics,
  ModuleLoadMetric
} from './types'
import { createLogger } from '../../utils/logger'

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
    this.config = {
      enabled: true,
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
    analyticsLog.debug('Main process metrics recorded', {
      meta: { modulesLoadTime: metrics.modulesLoadTime }
    })
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
      // Import storage module dynamically to avoid circular dependencies
      const { getConfig } = require('../storage')
      const history = getConfig('startup-analytics.json') as StartupHistory

      if (history && Array.isArray(history.entries)) {
        return history
      }
    } catch (error) {
      analyticsLog.warn('Failed to load startup history', { meta: { error } })
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
      // Import storage module dynamically to avoid circular dependencies
      const { saveConfig } = require('../storage')

      // Load existing history
      const history = this.getHistory()

      // Add new metrics to the beginning
      history.entries.unshift(metrics)

      // Keep only the most recent entries
      if (history.entries.length > this.config.maxHistory) {
        history.entries = history.entries.slice(0, this.config.maxHistory)
      }

      // Update timestamp
      history.lastUpdated = Date.now()

      // Save to storage
      saveConfig('startup-analytics.json', JSON.stringify(history, null, 2))

      analyticsLog.success('Metrics saved to history', {
        meta: {
          sessionId: metrics.sessionId,
          totalStartupTime: metrics.totalStartupTime,
          historyCount: history.entries.length
        }
      })
    } catch (error) {
      analyticsLog.error('Failed to save metrics to history', { meta: { error } })
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
    const url = endpoint || this.config.reportEndpoint
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
        meta: { endpoint: url }
      })

      // TODO: Implement actual HTTP request
      // For now, just log that we would report
      analyticsLog.success('Metrics report prepared (not sent in current implementation)')
    } catch (error) {
      analyticsLog.error('Failed to report metrics', { meta: { error } })
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

// Singleton instance
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

