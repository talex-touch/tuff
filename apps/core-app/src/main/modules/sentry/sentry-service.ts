/**
 * Sentry Service Module
 *
 * Handles error reporting, analytics, and user tracking with privacy controls
 */

import type { ModuleKey } from '@talex-touch/utils'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import * as Sentry from '@sentry/electron/main'
import { ChannelType } from '@talex-touch/utils/channel'
import { getEnvOrDefault, getTelemetryApiBase, normalizeBaseUrl } from '@talex-touch/utils/env'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { BrowserWindow, app } from 'electron'
import { innerRootPath } from '../../core/precore'
import { createLogger } from '../../utils/logger'
import { getAppVersionSafe } from '../../utils/version-util'
import { BaseModule } from '../abstract-base-module'
import { getOrCreateTelemetryClientId } from '../analytics/telemetry-client'
import { databaseModule } from '../database'
import { storageModule } from '../storage'
import {
  TelemetryUploadStatsStore,
  type TelemetryUploadStatsRecord
} from './telemetry-upload-stats-store'

// User type from Clerk
interface ClerkUser {
  id: string
  username?: string | null
  emailAddresses?: Array<{ emailAddress: string }>
}

const sentryLog = createLogger('SentryService')
const SENTRY_PERF_TASK_ID = 'sentry.perf.flush'
const SENTRY_NEXUS_TASK_ID = 'sentry.nexus.flush'

// Sentry DSN
const SENTRY_DSN =
  'https://f8019096132f03a7a66c879a53462a67@o4508024637620224.ingest.us.sentry.io/4510196503871488'

interface SentryConfig {
  enabled: boolean
  anonymous: boolean
}

interface SearchMetrics {
  totalDuration: number
  providerTimings: Record<string, number>
  providerResults: Record<string, number>
  sortingDuration: number
  queryText: string
  inputTypes: string[]
  resultCount: number
  sessionId: string
}

// Nexus telemetry batch upload settings
const NEXUS_TELEMETRY_BATCH_SIZE = 20
const NEXUS_TELEMETRY_FLUSH_INTERVAL = 60000

interface NexusTelemetryEvent {
  eventType: 'search' | 'visit' | 'error' | 'feature_use' | 'performance'
  clientId?: string
  userId?: string
  deviceFingerprint?: string
  platform?: string
  version?: string
  region?: string
  searchQuery?: string
  searchDurationMs?: number
  searchResultCount?: number
  providerTimings?: Record<string, number>
  inputTypes?: string[]
  metadata?: Record<string, unknown>
  isAnonymous: boolean
}

/**
 * Generate device fingerprint based on system information
 */
function generateDeviceFingerprint(): string {
  const components = [process.platform, os.arch(), os.hostname(), os.type(), os.release()]
  const hash = crypto.createHash('sha256')
  hash.update(components.join('|'))
  return hash.digest('hex').substring(0, 16)
}

/**
 * Get environment context (always included)
 */
function getEnvironmentContext(): Record<string, unknown> {
  const buildType = process.env.BUILD_TYPE || 'release'
  const isDev = !app.isPackaged
  const channel = isDev ? 'dev' : buildType

  return {
    version: getAppVersionSafe(),
    buildType,
    channel,
    platform: process.platform,
    arch: process.arch,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    isPackaged: app.isPackaged,
    buildTimestamp: Date.now()
  }
}

function resolveTelemetryApiBase(): string {
  const isLocal = !app.isPackaged || process.env.NODE_ENV === 'development'
  if (isLocal) {
    return normalizeBaseUrl(getEnvOrDefault('NEXUS_API_BASE_LOCAL', 'http://localhost:3200'))
  }
  return getTelemetryApiBase()
}

/**
 * Sentry Service Module
 */
export class SentryServiceModule extends BaseModule {
  static key: symbol = Symbol.for('SentryService')
  name: ModuleKey = SentryServiceModule.key

  private config: SentryConfig = { enabled: false, anonymous: true }
  private deviceFingerprint: string | null = null
  private clientId: string | null = null
  private currentUserId: string | null = null
  private searchCount = 0
  private searchMetricsBuffer: SearchMetrics[] = []
  private isInitialized = false

  private nexusTelemetryBuffer: NexusTelemetryEvent[] = []
  private lastNexusUploadTime: number | null = null
  private totalNexusUploads = 0
  private failedNexusUploads = 0
  private telemetryCooldownUntil: number | null = null
  private lastTelemetryFailureAt: number | null = null
  private lastTelemetryFailureMessage: string | null = null
  private telemetryStatsStore: TelemetryUploadStatsStore | null = null
  private telemetryStatsPersistTimer: NodeJS.Timeout | null = null

  private eventLoopDelay?: ReturnType<typeof monitorEventLoopDelay>
  private unresponsiveAt = new Map<number, number>()
  private unresponsiveStats = { count: 0, totalMs: 0, maxMs: 0 }
  private windowPerfListenersReady = false
  private readonly pollingService = PollingService.getInstance()

  private preInitAttempted = false

  constructor() {
    super(SentryServiceModule.key)
  }

  /**
   * Pre-initialize Sentry before Electron `ready` (required by @sentry/electron).
   *
   * NOTE: This should be called from the main entry before `app.whenReady()`.
   */
  preInitBeforeReady(): void {
    if (this.preInitAttempted) return
    this.preInitAttempted = true

    // Best-effort: load persisted config without relying on StorageModule.
    try {
      const configPath = path.join(innerRootPath, 'modules', 'config', 'sentry-config.json')
      if (fs.existsSync(configPath)) {
        const raw = fs.readFileSync(configPath, 'utf8')
        const parsed = JSON.parse(raw) as Partial<SentryConfig>
        this.config = {
          enabled: parsed?.enabled ?? true,
          anonymous: parsed?.anonymous ?? true
        }
      } else {
        this.config = { enabled: true, anonymous: true }
      }
    } catch (error) {
      sentryLog.warn('Failed to pre-load Sentry config, using defaults', {
        meta: { error: error instanceof Error ? error.message : String(error) }
      })
      this.config = { enabled: true, anonymous: true }
    }

    if (!this.config.enabled) {
      return
    }

    this.deviceFingerprint = generateDeviceFingerprint()
    this.initializeSentry()
  }

  async onInit(): Promise<void> {
    sentryLog.info('Initializing Sentry service')

    // Load configuration
    this.loadConfig()

    // Generate device fingerprint (but don't use it if anonymous)
    this.deviceFingerprint = generateDeviceFingerprint()
    this.clientId = getOrCreateTelemetryClientId()

    await this.hydrateTelemetryStats()

    // Initialize Sentry if enabled
    if (this.config.enabled) {
      if (!this.isInitialized) {
        this.initializeSentry()
      } else {
        this.updateUserContext()
        Sentry.setContext('environment', getEnvironmentContext())
      }
    } else {
      sentryLog.info('Sentry is disabled by configuration')
    }

    this.setupIPCChannels()

    try {
      storageModule.subscribe('sentry-config.json', (data) => {
        const cfg = data as Partial<SentryConfig>
        this.saveConfig(cfg)
      })
    } catch (error) {
      sentryLog.warn('Failed to subscribe sentry-config changes', {
        meta: { error: error instanceof Error ? error.message : String(error) }
      })
    }

    this.syncPerformanceMonitors()
  }

  /**
   * Setup IPC channels for user context updates
   */
  private setupIPCChannels(): void {
    const channel = $app.channel
    if (!channel) return

    // Listen for user context updates from renderer
    channel.regChannel(ChannelType.MAIN, 'sentry:update-user', ({ data }) => {
      if (data && typeof data === 'object') {
        const user = (data.user as ClerkUser | null) || null
        this.updateUserContext(user)
      }
    })

    // Expose config getter
    channel.regChannel(ChannelType.MAIN, 'sentry:get-config', () => {
      return this.getConfig()
    })

    channel.regChannel(ChannelType.MAIN, 'sentry:get-search-count', () => {
      return this.getSearchCountFromDb()
    })

    channel.regChannel(ChannelType.MAIN, 'sentry:get-telemetry-stats', () => {
      return this.getTelemetryStatsFromDb()
    })

    channel.regChannel(ChannelType.MAIN, 'sentry:record-performance', ({ data }) => {
      this.recordRendererPerformance(data)
      return { success: true }
    })
  }

  async onDestroy(): Promise<void> {
    if (this.isInitialized) {
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    await this.stopNexusTelemetryTimer()
    this.stopPerformanceMonitors()
    await this.flushTelemetryStats()
  }

  /**
   * Load configuration from storage
   */
  private loadConfig(): void {
    try {
      const config = storageModule.getConfig('sentry-config.json') as
        | Partial<SentryConfig>
        | undefined
      this.config = {
        enabled: config?.enabled ?? true,
        anonymous: config?.anonymous ?? true
      }
      sentryLog.debug('Loaded Sentry config', {
        meta: { enabled: this.config.enabled, anonymous: this.config.anonymous }
      })
    } catch (error) {
      sentryLog.warn('Failed to load Sentry config, using defaults', {
        meta: { error: error instanceof Error ? error.message : String(error) }
      })
      this.config = { enabled: true, anonymous: true }
    }
  }

  private getTelemetryStatsStore(): TelemetryUploadStatsStore | null {
    if (this.telemetryStatsStore) return this.telemetryStatsStore
    try {
      const db = databaseModule.getDb()
      this.telemetryStatsStore = new TelemetryUploadStatsStore(db)
      return this.telemetryStatsStore
    } catch {
      return null
    }
  }

  private schedulePersistTelemetryStats(): void {
    if (this.telemetryStatsPersistTimer) return
    this.telemetryStatsPersistTimer = setTimeout(() => {
      this.telemetryStatsPersistTimer = null
      void this.persistTelemetryStats()
    }, 1500)
  }

  private async flushTelemetryStats(): Promise<void> {
    if (this.telemetryStatsPersistTimer) {
      clearTimeout(this.telemetryStatsPersistTimer)
      this.telemetryStatsPersistTimer = null
    }
    await this.persistTelemetryStats()
  }

  private async persistTelemetryStats(): Promise<void> {
    const store = this.getTelemetryStatsStore()
    if (!store) return
    try {
      await store.upsert({
        searchCount: this.searchCount,
        totalUploads: this.totalNexusUploads,
        failedUploads: this.failedNexusUploads,
        lastUploadTime: this.lastNexusUploadTime,
        lastFailureAt: this.lastTelemetryFailureAt,
        lastFailureMessage: this.lastTelemetryFailureMessage,
        updatedAt: Date.now()
      })
    } catch (error) {
      sentryLog.debug('Failed to persist telemetry upload stats', {
        meta: { error: error instanceof Error ? error.message : String(error) }
      })
    }
  }

  private async hydrateTelemetryStats(): Promise<void> {
    const store = this.getTelemetryStatsStore()
    if (!store) return
    try {
      const record = await store.get()
      if (!record) return
      this.searchCount = record.searchCount
      this.totalNexusUploads = record.totalUploads
      this.failedNexusUploads = record.failedUploads
      this.lastNexusUploadTime = record.lastUploadTime
      this.lastTelemetryFailureAt = record.lastFailureAt
      this.lastTelemetryFailureMessage = record.lastFailureMessage
    } catch (error) {
      sentryLog.warn('Failed to hydrate telemetry upload stats', {
        meta: { error: error instanceof Error ? error.message : String(error) }
      })
    }
  }

  /**
   * Save configuration to storage
   */
  saveConfig(config: Partial<SentryConfig>): void {
    this.config = { ...this.config, ...config }
    storageModule.saveConfig('sentry-config.json', JSON.stringify(this.config))
    sentryLog.info('Saved Sentry config', {
      meta: { enabled: this.config.enabled, anonymous: this.config.anonymous }
    })

    // Reinitialize if enabled state changed
    if (config.enabled !== undefined) {
      if (this.config.enabled && !this.isInitialized) {
        this.initializeSentry()
      } else if (!this.config.enabled && this.isInitialized) {
        this.shutdownSentry()
      }

      this.syncPerformanceMonitors()
    }

    // Update user context if anonymous state changed
    if (config.anonymous !== undefined && this.isInitialized) {
      this.updateUserContext()
    }
  }

  private syncPerformanceMonitors(): void {
    if (this.config.enabled) {
      this.startPerformanceMonitors()
    } else {
      this.stopPerformanceMonitors()
    }
  }

  private startPerformanceMonitors(): void {
    if (this.pollingService.isRegistered(SENTRY_PERF_TASK_ID)) return

    this.ensureWindowPerformanceListeners()

    try {
      this.eventLoopDelay = monitorEventLoopDelay({ resolution: 20 })
      this.eventLoopDelay.enable()
    } catch {
      this.eventLoopDelay = undefined
    }

    const flushIntervalMs = 60_000
    this.pollingService.register(
      SENTRY_PERF_TASK_ID,
      () => this.flushPerformanceMetrics(),
      { interval: flushIntervalMs, unit: 'milliseconds' },
    )
    this.pollingService.start()
  }

  private stopPerformanceMonitors(): void {
    this.pollingService.unregister(SENTRY_PERF_TASK_ID)
    if (this.eventLoopDelay) {
      try {
        this.eventLoopDelay.disable()
      } catch (error) {
        sentryLog.debug('Failed to disable event loop delay monitor', {
          meta: { error: error instanceof Error ? error.message : String(error) }
        })
      }
      this.eventLoopDelay = undefined
    }
    this.unresponsiveAt.clear()
    this.unresponsiveStats = { count: 0, totalMs: 0, maxMs: 0 }
  }

  private ensureWindowPerformanceListeners(): void {
    if (this.windowPerfListenersReady) return
    this.windowPerfListenersReady = true

    const attach = (win: BrowserWindow) => {
      const wcId = win.webContents.id

      win.on('unresponsive', () => {
        this.unresponsiveAt.set(wcId, Date.now())
      })

      win.on('responsive', () => {
        const startedAt = this.unresponsiveAt.get(wcId)
        if (!startedAt) return
        this.unresponsiveAt.delete(wcId)
        const durationMs = Math.max(0, Date.now() - startedAt)
        this.unresponsiveStats.count += 1
        this.unresponsiveStats.totalMs += durationMs
        this.unresponsiveStats.maxMs = Math.max(this.unresponsiveStats.maxMs, durationMs)
      })

      win.on('closed', () => {
        this.unresponsiveAt.delete(wcId)
      })
    }

    app.on('browser-window-created', (_event, win) => {
      attach(win)
    })

    for (const win of BrowserWindow.getAllWindows()) {
      attach(win)
    }
  }

  private flushPerformanceMetrics(): void {
    const metadata: Record<string, unknown> = { perfSource: 'main' }

    if (this.eventLoopDelay) {
      const p95 = Number(this.eventLoopDelay.percentile(95)) / 1e6
      const max = Number(this.eventLoopDelay.max) / 1e6
      if (Number.isFinite(p95)) {
        metadata.eventLoopDelayP95Ms = Math.round(p95)
      }
      if (Number.isFinite(max)) {
        metadata.eventLoopDelayMaxMs = Math.round(max)
      }
      this.eventLoopDelay.reset()
    }

    if (this.unresponsiveStats.count > 0) {
      metadata.unresponsiveCount = this.unresponsiveStats.count
      metadata.unresponsiveTotalMs = Math.round(this.unresponsiveStats.totalMs)
      metadata.unresponsiveMaxMs = Math.round(this.unresponsiveStats.maxMs)
      this.unresponsiveStats = { count: 0, totalMs: 0, maxMs: 0 }
    }

    const hasPayload = Object.keys(metadata).some((key) => key !== 'perfSource')
    if (!hasPayload) return

    this.queueNexusTelemetry({
      eventType: 'performance',
      metadata
    })
  }

  private recordRendererPerformance(payload: unknown): void {
    if (!payload || typeof payload !== 'object') return

    const data = payload as Record<string, unknown>
    const pickMs = (key: string): number | undefined => {
      const value = data[key]
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
      return Math.min(Math.round(value), 60 * 60 * 1000)
    }
    const pickCount = (key: string): number | undefined => {
      const value = data[key]
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
      return Math.min(Math.round(value), 1_000_000)
    }

    const metadata: Record<string, unknown> = { perfSource: 'renderer' }
    const longTaskTotalMs = pickMs('longTaskTotalMs')
    const longTaskMaxMs = pickMs('longTaskMaxMs')
    const rafJankTotalMs = pickMs('rafJankTotalMs')
    const rafJankMaxMs = pickMs('rafJankMaxMs')
    const longTaskCount = pickCount('longTaskCount')
    const rafJankCount = pickCount('rafJankCount')

    if (longTaskTotalMs !== undefined) metadata.longTaskTotalMs = longTaskTotalMs
    if (longTaskCount !== undefined) metadata.longTaskCount = longTaskCount
    if (longTaskMaxMs !== undefined) metadata.longTaskMaxMs = longTaskMaxMs
    if (rafJankTotalMs !== undefined) metadata.rafJankTotalMs = rafJankTotalMs
    if (rafJankCount !== undefined) metadata.rafJankCount = rafJankCount
    if (rafJankMaxMs !== undefined) metadata.rafJankMaxMs = rafJankMaxMs

    const hasPayload = Object.keys(metadata).some((key) => key !== 'perfSource')
    if (!hasPayload) return

    this.queueNexusTelemetry({ eventType: 'performance', metadata })
  }

  /**
   * Get current configuration
   */
  getConfig(): SentryConfig {
    return { ...this.config }
  }

  /**
   * Initialize Sentry
   */
  private initializeSentry(): void {
    if (this.isInitialized) {
      return
    }

    try {
      Sentry.init({
        dsn: SENTRY_DSN,
        environment: process.env.BUILD_TYPE || (app.isPackaged ? 'production' : 'development'),
        // Release information
        release: `${getAppVersionSafe()}@${process.env.BUILD_TYPE || 'release'}`,
        // Sample rate for performance monitoring
        tracesSampleRate: 1.0,
        // Before send hook to filter sensitive data
        beforeSend(event) {
          // Always include environment context
          event.contexts = {
            ...event.contexts,
            environment: getEnvironmentContext()
          }

          return event
        },
        // Before breadcrumb hook
        beforeBreadcrumb(breadcrumb) {
          return breadcrumb
        }
        // Error handling is done by Sentry automatically
      })

      // Set initial user context
      this.updateUserContext()

      // Set environment context
      Sentry.setContext('environment', getEnvironmentContext())

      // Setup global error handlers
      this.setupErrorHandlers()

      this.isInitialized = true
      sentryLog.success('Sentry initialized', {
        meta: {
          environment: process.env.BUILD_TYPE || (app.isPackaged ? 'production' : 'development'),
          anonymous: this.config.anonymous
        }
      })
    } catch (error) {
      sentryLog.error('Failed to initialize Sentry', {
        meta: { error: error instanceof Error ? error.message : String(error) }
      })
    }
  }

  /**
   * Shutdown Sentry
   */
  private shutdownSentry(): void {
    if (!this.isInitialized) {
      return
    }

    // Note: Sentry Electron main process doesn't have close method
    // Just mark as uninitialized
    this.isInitialized = false
    sentryLog.info('Sentry shutdown')
  }

  /**
   * Setup global error handlers
   */
  private setupErrorHandlers(): void {
    // Uncaught exceptions are handled by Sentry integration
    // Unhandled rejections are handled by Sentry integration

    // Log that handlers are set up
    sentryLog.debug('Global error handlers setup complete')
  }

  /**
   * Update user context based on authentication and privacy settings
   */
  updateUserContext(user?: ClerkUser | null): void {
    if (this.config.anonymous) {
      this.currentUserId = null
      // Anonymous mode: no user ID or fingerprint
      if (this.isInitialized) {
        Sentry.setUser(null)
        sentryLog.debug('User context cleared (anonymous mode)')
      }
      return
    }

    // Non-anonymous mode
    if (user && user.id) {
      this.currentUserId = user.id

      if (!this.isInitialized)
        return

      const userContext: Sentry.User = {
        id: user.id,
        username: user.username || undefined,
        email: undefined // Never send email
      }

      // Add device fingerprint if available
      if (this.deviceFingerprint) {
        userContext.ip_address = undefined // Clear IP
        // Add fingerprint as a tag instead of user field
        Sentry.setTag('device.fingerprint', this.deviceFingerprint)
      }

      Sentry.setUser(userContext)
      sentryLog.debug('User context updated', {
        meta: { userId: user.id, hasFingerprint: !!this.deviceFingerprint }
      })
    } else {
      this.currentUserId = null

      if (!this.isInitialized)
        return

      // Not authenticated, but not anonymous mode - use device fingerprint only
      if (this.deviceFingerprint) {
        Sentry.setUser({
          id: `device:${this.deviceFingerprint}`,
          username: undefined,
          email: undefined
        })
        Sentry.setTag('device.fingerprint', this.deviceFingerprint)
        sentryLog.debug('User context set to device fingerprint', {
          meta: { fingerprint: this.deviceFingerprint }
        })
      } else {
        Sentry.setUser(null)
      }
    }
  }

  /**
   * Record search metrics
   */
  recordSearchMetrics(metrics: SearchMetrics): void {
    if (!this.config.enabled || !this.isInitialized) {
      return
    }

    this.searchCount++
    this.searchMetricsBuffer.push(metrics)

    // Report every 20 searches
    if (this.searchCount % 20 === 0) {
      this.reportSearchAnalytics()
    }
  }

  /**
   * Report search analytics to Sentry
   */
  private reportSearchAnalytics(): void {
    if (this.searchMetricsBuffer.length === 0) {
      return
    }

    try {
      // Calculate aggregated metrics
      const totalSearches = this.searchMetricsBuffer.length
      const avgDuration =
        this.searchMetricsBuffer.reduce((sum, m) => sum + m.totalDuration, 0) / totalSearches
      const totalResults = this.searchMetricsBuffer.reduce((sum, m) => sum + m.resultCount, 0)
      const avgResults = totalResults / totalSearches

      // Calculate provider timing percentages
      const providerTotalTimes: Record<string, number> = {}
      const providerTotalResults: Record<string, number> = {}

      for (const metrics of this.searchMetricsBuffer) {
        for (const [provider, time] of Object.entries(metrics.providerTimings)) {
          providerTotalTimes[provider] = (providerTotalTimes[provider] || 0) + time
        }
        for (const [provider, count] of Object.entries(metrics.providerResults)) {
          providerTotalResults[provider] = (providerTotalResults[provider] || 0) + count
        }
      }

      const totalProviderTime = Object.values(providerTotalTimes).reduce((sum, t) => sum + t, 0)
      const providerPercentages: Record<string, number> = {}
      for (const [provider, time] of Object.entries(providerTotalTimes)) {
        providerPercentages[provider] = totalProviderTime > 0 ? (time / totalProviderTime) * 100 : 0
      }

      // Create event with search analytics data
      Sentry.withScope((scope) => {
        scope.setTag('analytics.type', 'search_batch')
        scope.setLevel('info')
        scope.setContext('search_analytics', {
          search_count: this.searchCount,
          batch_size: totalSearches,
          avg_duration_ms: Math.round(avgDuration),
          avg_results: Math.round(avgResults),
          total_results: totalResults,
          provider_timing_percentages: providerPercentages,
          provider_total_results: providerTotalResults,
          provider_avg_times_ms: Object.fromEntries(
            Object.entries(providerTotalTimes).map(([p, t]) => [p, Math.round(t / totalSearches)])
          ),
          sample_queries: this.searchMetricsBuffer.slice(-5).map((m) => ({
            text: m.queryText.substring(0, 100), // Truncate for privacy
            inputTypes: m.inputTypes,
            duration: m.totalDuration,
            results: m.resultCount
          }))
        })

        Sentry.captureMessage('Search analytics batch report', 'info')
      })

      // Clear buffer
      this.searchMetricsBuffer = []

      sentryLog.debug('Search analytics reported', {
        meta: {
          searchCount: this.searchCount,
          batchSize: totalSearches,
          avgDuration: avgDuration.toFixed(2)
        }
      })
    } catch (error) {
      sentryLog.error('Failed to report search analytics', {
        meta: { error: error instanceof Error ? error.message : String(error) }
      })
    }
  }

  /**
   * Report error to Sentry
   */
  captureException(error: Error, context?: Record<string, unknown>): void {
    if (!this.config.enabled || !this.isInitialized) {
      return
    }

    Sentry.withScope((scope) => {
      if (context) {
        scope.setContext('extra', context)
      }
      scope.setContext('environment', getEnvironmentContext())
      Sentry.captureException(error)
    })
  }

  /**
   * Capture message
   */
  captureMessage(
    message: string,
    level: Sentry.SeverityLevel = 'info',
    context?: Record<string, unknown>
  ): void {
    if (!this.config.enabled || !this.isInitialized) {
      return
    }

    Sentry.withScope((scope) => {
      scope.setLevel(level)
      if (context) {
        scope.setContext('extra', context)
      }
      scope.setContext('environment', getEnvironmentContext())
      Sentry.captureMessage(message)
    })
  }

  /**
   * Check if Sentry is initialized and enabled
   */
  isEnabled(): boolean {
    return this.config.enabled && this.isInitialized
  }

  /**
   * Check if telemetry upload is enabled (independent of Sentry init).
   */
  isTelemetryEnabled(): boolean {
    return this.config.enabled
  }

  /**
   * Get search count
   */
  getSearchCount(): number {
    return this.searchCount
  }

  private telemetryStatsSnapshot(): TelemetryUploadStatsRecord {
    return {
      searchCount: this.searchCount,
      totalUploads: this.totalNexusUploads,
      failedUploads: this.failedNexusUploads,
      lastUploadTime: this.lastNexusUploadTime,
      lastFailureAt: this.lastTelemetryFailureAt,
      lastFailureMessage: this.lastTelemetryFailureMessage,
      updatedAt: Date.now()
    }
  }

  private async readTelemetryStatsRecord(): Promise<TelemetryUploadStatsRecord> {
    const store = this.getTelemetryStatsStore()
    if (!store) return this.telemetryStatsSnapshot()

    await this.flushTelemetryStats()
    const record = await store.get()
    return record ?? this.telemetryStatsSnapshot()
  }

  private async getSearchCountFromDb(): Promise<number> {
    const record = await this.readTelemetryStatsRecord()
    return record.searchCount
  }

  private async getTelemetryStatsFromDb(): Promise<{
    searchCount: number
    bufferSize: number
    lastUploadTime: number | null
    totalUploads: number
    failedUploads: number
    lastFailureAt: number | null
    lastFailureMessage: string | null
    apiBase: string
    isEnabled: boolean
    isAnonymous: boolean
  }> {
    const record = await this.readTelemetryStatsRecord()
    return {
      searchCount: record.searchCount,
      bufferSize: this.nexusTelemetryBuffer.length,
      lastUploadTime: record.lastUploadTime,
      totalUploads: record.totalUploads,
      failedUploads: record.failedUploads,
      lastFailureAt: record.lastFailureAt,
      lastFailureMessage: record.lastFailureMessage,
      apiBase: resolveTelemetryApiBase(),
      isEnabled: this.config.enabled,
      isAnonymous: this.config.anonymous
    }
  }

  getTelemetryStats(): {
    searchCount: number
    bufferSize: number
    lastUploadTime: number | null
    totalUploads: number
    failedUploads: number
    apiBase: string
    isEnabled: boolean
    isAnonymous: boolean
  } {
    return {
      searchCount: this.searchCount,
      bufferSize: this.nexusTelemetryBuffer.length,
      lastUploadTime: this.lastNexusUploadTime,
      totalUploads: this.totalNexusUploads,
      failedUploads: this.failedNexusUploads,
      apiBase: resolveTelemetryApiBase(),
      isEnabled: this.config.enabled,
      isAnonymous: this.config.anonymous
    }
  }

  /**
   * Queue telemetry event for batch upload to Nexus
   */
  queueNexusTelemetry(event: Omit<NexusTelemetryEvent, 'isAnonymous'>): void {
    if (!this.config.enabled) return

    if (this.telemetryCooldownUntil && Date.now() < this.telemetryCooldownUntil) {
      return
    }

    if (event.eventType === 'search') {
      this.searchCount++
      this.schedulePersistTelemetryStats()
    }

    const isAnonymous = this.config.anonymous
    const telemetryEvent: NexusTelemetryEvent = {
      ...event,
      clientId: this.clientId || undefined,
      userId: isAnonymous ? undefined : this.currentUserId || undefined,
      searchQuery: isAnonymous ? undefined : event.searchQuery,
      deviceFingerprint: isAnonymous ? undefined : this.deviceFingerprint || undefined,
      platform: process.platform,
      version: getAppVersionSafe(),
      isAnonymous
    }

    this.nexusTelemetryBuffer.push(telemetryEvent)

    if (this.nexusTelemetryBuffer.length >= NEXUS_TELEMETRY_BATCH_SIZE) {
      this.flushNexusTelemetry()
    }

    // Set up periodic flush timer if not already running
    if (!this.pollingService.isRegistered(SENTRY_NEXUS_TASK_ID)) {
      this.pollingService.register(
        SENTRY_NEXUS_TASK_ID,
        () => this.flushNexusTelemetry(),
        { interval: NEXUS_TELEMETRY_FLUSH_INTERVAL, unit: 'milliseconds' },
      )
      this.pollingService.start()
    }
  }

  /**
   * Flush buffered telemetry events to Nexus
   */
  private async flushNexusTelemetry(): Promise<void> {
    if (this.nexusTelemetryBuffer.length === 0) return
    if (this.telemetryCooldownUntil && Date.now() < this.telemetryCooldownUntil) return

    const events = [...this.nexusTelemetryBuffer]
    this.nexusTelemetryBuffer = []
    let url: string | undefined

    try {
      const apiBase = resolveTelemetryApiBase()
      url = `${apiBase}/api/telemetry/batch`

      sentryLog.debug('Uploading telemetry batch', { meta: { count: events.length, url } })

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events })
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        if (response.status === 403) {
          this.telemetryCooldownUntil = Date.now() + 60 * 60_000
          sentryLog.warn('Telemetry blocked by server', { meta: { status: response.status, url } })
          this.recordTelemetryFailure('Telemetry blocked by server', {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
            url
          })
          return
        }
        if (response.status === 429) {
          this.telemetryCooldownUntil = Date.now() + 5 * 60_000
        }
        this.failedNexusUploads++
        this.schedulePersistTelemetryStats()
        sentryLog.error('Telemetry upload failed', {
          meta: { status: response.status, statusText: response.statusText, error: errorText }
        })
        this.recordTelemetryFailure('Telemetry upload failed', {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          url,
          count: events.length
        })
        this.nexusTelemetryBuffer = [...events.slice(-50), ...this.nexusTelemetryBuffer].slice(
          0,
          100
        )
      } else {
        this.telemetryCooldownUntil = null
        this.totalNexusUploads++
        this.lastNexusUploadTime = Date.now()
        this.schedulePersistTelemetryStats()
        sentryLog.debug('Telemetry batch uploaded', { meta: { count: events.length } })
      }
    } catch (error) {
      this.failedNexusUploads++
      this.schedulePersistTelemetryStats()
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.telemetryCooldownUntil = Date.now() + 5 * 60_000
      const recorded = this.recordTelemetryFailure('Telemetry upload exception', {
        error: errorMessage,
        url,
        count: events.length,
        cooldownMs: 5 * 60_000
      })
      if (recorded) {
        sentryLog.warn('Telemetry upload exception', {
          meta: { error: errorMessage, cooldownMs: 5 * 60_000 }
        })
      }
      this.nexusTelemetryBuffer = [...events.slice(-50), ...this.nexusTelemetryBuffer].slice(0, 100)
    }
  }

  private recordTelemetryFailure(message: string, meta?: Record<string, unknown>): boolean {
    void meta
    const now = Date.now()
    const throttleWindow = 10 * 60 * 1000
    if (this.lastTelemetryFailureAt && now - this.lastTelemetryFailureAt < throttleWindow) {
      if (this.lastTelemetryFailureMessage === message) return false
    }

    this.lastTelemetryFailureAt = now
    this.lastTelemetryFailureMessage = message
    this.schedulePersistTelemetryStats()

    return true
  }

  /**
   * Stop Nexus telemetry flush timer
   */
  async stopNexusTelemetryTimer(): Promise<void> {
    this.pollingService.unregister(SENTRY_NEXUS_TASK_ID)
    // Flush remaining events
    await this.flushNexusTelemetry()
  }
}

let sentryServiceInstance: SentryServiceModule | null = null

/**
 * Get Sentry service instance
 */
export function getSentryService(): SentryServiceModule {
  if (!sentryServiceInstance) {
    sentryServiceInstance = new SentryServiceModule()
  }
  return sentryServiceInstance
}

export function setSentryServiceInstance(instance: SentryServiceModule): void {
  sentryServiceInstance = instance
}
