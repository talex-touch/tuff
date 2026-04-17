/**
 * Sentry Service Module
 *
 * Handles error reporting, analytics, and user tracking with privacy controls
 */

import type { ModuleKey } from '@talex-touch/utils'
import type { TelemetryUploadStatsRecord } from './telemetry-upload-stats-store'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import * as Sentry from '@sentry/electron/main'
import { StorageList } from '@talex-touch/utils'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { getEnvOrDefault, getTelemetryApiBase, normalizeBaseUrl } from '@talex-touch/utils/env'
import { getTuffTransportMain, SentryEvents } from '@talex-touch/utils/transport/main'
import { app, BrowserWindow } from 'electron'
import { innerRootPath } from '../../core/precore'
import { createLogger } from '../../utils/logger'
import {
  shouldDowngradeRemoteFailure,
  summarizeRemoteFailurePayload
} from '../../utils/network-log-noise'
import { getAppVersionSafe } from '../../utils/version-util'
import { BaseModule } from '../abstract-base-module'
import { getOrCreateTelemetryClientId } from '../analytics/telemetry-client'
import { ReportQueueStore } from '../analytics/report-queue-store'
import { databaseModule } from '../database'
import { getNetworkService } from '../network'
import { getMainConfig, saveMainConfig, subscribeMainConfig } from '../storage'
import { TelemetryUploadStatsStore } from './telemetry-upload-stats-store'

// User type from auth
interface AuthUserSnapshot {
  id: string
  username?: string | null
  emailAddresses?: Array<{ emailAddress: string }>
}

const sentryLog = createLogger('SentryService')
const SENTRY_PERF_TASK_ID = 'sentry.perf.flush'
const SENTRY_NEXUS_TASK_ID = 'sentry.nexus.flush'

const resolveKeyManager = (channel: { keyManager?: unknown }): unknown =>
  channel.keyManager ?? channel

// Sentry DSN
const SENTRY_DSN =
  'https://f8019096132f03a7a66c879a53462a67@o4508024637620224.ingest.us.sentry.io/4510196503871488'
const DEV_DISABLED_SENTRY_INTEGRATIONS = new Set(['ElectronNet', 'ElectronBreadcrumbs'])

export interface SentryConfig {
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
const NEXUS_TELEMETRY_OUTBOX_KIND = 'sentry.nexus.batch'
const NEXUS_TELEMETRY_OUTBOX_MAX_AGE = 14 * 24 * 60 * 60 * 1000
const NEXUS_TELEMETRY_OUTBOX_MAX_COUNT = 2000
const NEXUS_TELEMETRY_OUTBOX_BACKOFF_BASE_MS = 30_000
const NEXUS_TELEMETRY_OUTBOX_BACKOFF_MAX_MS = 10 * 60_000
const NEXUS_TELEMETRY_STARTUP_GRACE_MS = 45_000

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

type LogMetaPrimitive = string | number | boolean | null | undefined

function toLogMeta(meta?: Record<string, unknown>): Record<string, LogMetaPrimitive> | undefined {
  if (!meta) return undefined
  const normalized: Record<string, LogMetaPrimitive> = {}
  for (const [key, value] of Object.entries(meta)) {
    if (
      value === null ||
      value === undefined ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      normalized[key] = value
      continue
    }

    if (value instanceof Error) {
      normalized[key] = value.message
      continue
    }

    try {
      normalized[key] = JSON.stringify(value)
    } catch {
      normalized[key] = String(value)
    }
  }
  return normalized
}

function shouldDowngradeTelemetryFailure(message: string, meta?: Record<string, unknown>): boolean {
  const parts: unknown[] = [message]
  const error = meta?.error
  parts.push(error)
  const url = meta?.url
  parts.push(url)
  return shouldDowngradeRemoteFailure(...parts)
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

  private config: SentryConfig = { enabled: false, anonymous: false }
  private deviceFingerprint: string | null = null
  private clientId: string | null = null
  private currentUserId: string | null = null
  private authUser: AuthUserSnapshot | null = null
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
  private reportQueueStore: ReportQueueStore | null = null
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
          anonymous: parsed?.anonymous ?? false
        }
      } else {
        this.config = { enabled: true, anonymous: false }
      }
    } catch (error) {
      sentryLog.warn('Failed to pre-load Sentry config, using defaults', {
        meta: { error: error instanceof Error ? error.message : String(error) }
      })
      this.config = { enabled: true, anonymous: false }
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
      subscribeMainConfig(StorageList.SENTRY_CONFIG, (data) => {
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
    const keyManager = resolveKeyManager(channel as { keyManager?: unknown })
    const transport = getTuffTransportMain(channel, keyManager)

    // Listen for user context updates from renderer
    transport.on(SentryEvents.api.updateUser, (payload) => {
      if (payload && typeof payload === 'object') {
        const user = (payload.user as AuthUserSnapshot | null) || null
        this.updateUserContext(user)
      }
    })

    // Expose config getter
    transport.on(SentryEvents.api.getConfig, () => {
      return this.getConfig()
    })

    transport.on(SentryEvents.api.getSearchCount, () => {
      return this.getSearchCountFromDb()
    })

    transport.on(SentryEvents.api.getTelemetryStats, () => {
      return this.getTelemetryStatsFromDb()
    })

    transport.on(SentryEvents.api.recordPerformance, (payload) => {
      this.recordRendererPerformance(payload)
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
      const config = getMainConfig(StorageList.SENTRY_CONFIG) as Partial<SentryConfig> | undefined
      this.config = {
        enabled: config?.enabled ?? true,
        anonymous: config?.anonymous ?? false
      }
      sentryLog.debug('Loaded Sentry config', {
        meta: {
          enabled: this.config.enabled,
          anonymous: this.config.anonymous,
          effectiveAnonymous: this.resolveEffectiveAnonymous()
        }
      })
    } catch (error) {
      sentryLog.warn('Failed to load Sentry config, using defaults', {
        meta: { error: error instanceof Error ? error.message : String(error) }
      })
      this.config = { enabled: true, anonymous: false }
    }
  }

  private getTelemetryStatsStore(): TelemetryUploadStatsStore | null {
    if (this.telemetryStatsStore) return this.telemetryStatsStore
    try {
      this.telemetryStatsStore = new TelemetryUploadStatsStore({
        auxDb: databaseModule.getAuxDb(),
        coreDb: databaseModule.getDb()
      })
      return this.telemetryStatsStore
    } catch {
      return null
    }
  }

  private getReportQueueStore(): ReportQueueStore | null {
    if (this.reportQueueStore) return this.reportQueueStore
    try {
      this.reportQueueStore = new ReportQueueStore({
        auxDb: databaseModule.getAuxDb(),
        coreDb: databaseModule.getDb()
      })
      return this.reportQueueStore
    } catch {
      return null
    }
  }

  private getOutboxBackoffMs(retryCount: number): number {
    const exponent = Math.min(10, Math.max(0, retryCount))
    return Math.min(
      NEXUS_TELEMETRY_OUTBOX_BACKOFF_MAX_MS,
      NEXUS_TELEMETRY_OUTBOX_BACKOFF_BASE_MS * 2 ** exponent
    )
  }

  private isOutboxItemDue(item: { retryCount: number; lastAttemptAt?: number }): boolean {
    if (!item.lastAttemptAt) return true
    return Date.now() - item.lastAttemptAt >= this.getOutboxBackoffMs(item.retryCount)
  }

  private isNexusBatchPayload(payload: Record<string, unknown>): boolean {
    if (!payload || typeof payload !== 'object') return false
    // analytics_report_queue is shared by startup analytics and sentry telemetry.
    // Keep strict kind filtering to avoid cross-consuming unrelated outbox records.
    const metadata =
      payload.metadata && typeof payload.metadata === 'object'
        ? (payload.metadata as Record<string, unknown>)
        : null
    return metadata?.kind === NEXUS_TELEMETRY_OUTBOX_KIND
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
    saveMainConfig(StorageList.SENTRY_CONFIG, this.config)
    sentryLog.info('Saved Sentry config', {
      meta: {
        enabled: this.config.enabled,
        anonymous: this.config.anonymous,
        effectiveAnonymous: this.resolveEffectiveAnonymous()
      }
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
    this.pollingService.register(SENTRY_PERF_TASK_ID, () => this.flushPerformanceMetrics(), {
      interval: flushIntervalMs,
      unit: 'milliseconds',
      lane: 'maintenance',
      backpressure: 'coalesce',
      dedupeKey: SENTRY_PERF_TASK_ID,
      maxInFlight: 1,
      timeoutMs: 10_000,
      jitterMs: 300
    })
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
    return {
      ...this.config,
      anonymous: this.resolveEffectiveAnonymous()
    }
  }

  /**
   * Initialize Sentry
   */
  private initializeSentry(): void {
    if (this.isInitialized) {
      return
    }

    try {
      const isDevelopmentRuntime = !app.isPackaged || process.env.NODE_ENV === 'development'
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
        },
        ...(isDevelopmentRuntime
          ? {
              integrations(defaultIntegrations) {
                return defaultIntegrations.filter(
                  (integration) => !DEV_DISABLED_SENTRY_INTEGRATIONS.has(integration.name)
                )
              }
            }
          : {})
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
          anonymous: this.config.anonymous,
          effectiveAnonymous: this.resolveEffectiveAnonymous()
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
  private resolveEffectiveAnonymous(): boolean {
    return this.config.anonymous && !!this.authUser?.id
  }

  updateUserContext(user?: AuthUserSnapshot | null): void {
    if (user !== undefined) {
      this.authUser = user?.id ? user : null
    }

    const effectiveAnonymous = this.resolveEffectiveAnonymous()

    if (effectiveAnonymous) {
      this.currentUserId = null
      // Anonymous mode: no user ID or fingerprint
      if (this.isInitialized) {
        Sentry.setUser(null)
        sentryLog.debug('User context cleared (anonymous mode)')
      }
      return
    }

    // Non-anonymous mode
    if (this.authUser?.id) {
      this.currentUserId = this.authUser.id

      if (!this.isInitialized) return

      const userContext: Sentry.User = {
        id: this.authUser.id,
        username: this.authUser.username || undefined,
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
        meta: { userId: this.authUser.id, hasFingerprint: !!this.deviceFingerprint }
      })
    } else {
      this.currentUserId = null

      if (!this.isInitialized) return

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
      isAnonymous: this.resolveEffectiveAnonymous()
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
      isAnonymous: this.resolveEffectiveAnonymous()
    }
  }

  /**
   * Queue telemetry event for batch upload to Nexus
   */
  queueNexusTelemetry(event: Omit<NexusTelemetryEvent, 'isAnonymous'>): void {
    if (!this.config.enabled) return

    if (event.eventType === 'search') {
      this.searchCount++
      this.schedulePersistTelemetryStats()
    }

    const isAnonymous = this.resolveEffectiveAnonymous()
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
      void this.flushNexusTelemetry()
    }

    this.ensureNexusFlushTaskRegistered()
  }

  private ensureNexusFlushTaskRegistered(): void {
    if (this.pollingService.isRegistered(SENTRY_NEXUS_TASK_ID)) {
      return
    }

    this.pollingService.register(
      SENTRY_NEXUS_TASK_ID,
      () =>
        this.flushNexusTelemetry()
          .then(async () => {
            await this.flushQueuedNexusTelemetryOutbox()
          })
          .catch((error) => {
            this.recordTelemetryFailure('Nexus telemetry flush task failed', {
              error: error instanceof Error ? error.message : String(error)
            })
          }),
      {
        interval: NEXUS_TELEMETRY_FLUSH_INTERVAL,
        unit: 'milliseconds',
        runImmediately: false,
        initialDelayMs: NEXUS_TELEMETRY_STARTUP_GRACE_MS + Math.floor(Math.random() * 5_000),
        lane: 'io',
        backpressure: 'latest_wins',
        dedupeKey: SENTRY_NEXUS_TASK_ID,
        maxInFlight: 1,
        timeoutMs: 15_000,
        jitterMs: 1000
      }
    )
    this.pollingService.start()
  }

  /**
   * Flush buffered telemetry events to persistent outbox.
   */
  private async flushNexusTelemetry(): Promise<void> {
    if (this.nexusTelemetryBuffer.length === 0) return

    const events = [...this.nexusTelemetryBuffer]
    this.nexusTelemetryBuffer = []
    const apiBase = resolveTelemetryApiBase()
    const url = `${apiBase}/api/telemetry/batch`
    const payload: Record<string, unknown> = {
      eventType: 'telemetry_batch',
      metadata: {
        kind: NEXUS_TELEMETRY_OUTBOX_KIND,
        idempotencyKey: `sentry:${Date.now()}:${events.length}`,
        count: events.length
      },
      events
    }

    const store = this.getReportQueueStore()
    if (!store) {
      this.nexusTelemetryBuffer = [...events.slice(-50), ...this.nexusTelemetryBuffer].slice(0, 100)
      this.recordTelemetryFailure('Telemetry outbox unavailable', {
        count: events.length
      })
      return
    }

    try {
      await store.insert({
        payload,
        endpoint: url,
        createdAt: Date.now()
      })
      sentryLog.debug('Telemetry batch queued to outbox', {
        meta: { count: events.length, url }
      })
    } catch (error) {
      this.nexusTelemetryBuffer = [...events.slice(-50), ...this.nexusTelemetryBuffer].slice(0, 100)
      this.recordTelemetryFailure('Telemetry outbox enqueue failed', {
        error: error instanceof Error ? error.message : String(error),
        count: events.length
      })
      this.failedNexusUploads++
      this.schedulePersistTelemetryStats()
    }
  }

  private async flushQueuedNexusTelemetryOutbox(): Promise<void> {
    const store = this.getReportQueueStore()
    if (!store) return
    if (this.telemetryCooldownUntil && Date.now() < this.telemetryCooldownUntil) {
      return
    }

    const cutoff = Date.now() - NEXUS_TELEMETRY_OUTBOX_MAX_AGE
    const listed = await store.list(cutoff)
    if (listed.length > NEXUS_TELEMETRY_OUTBOX_MAX_COUNT) {
      const dropCount = listed.length - NEXUS_TELEMETRY_OUTBOX_MAX_COUNT
      const dropped = listed.slice(0, dropCount)
      await Promise.allSettled(dropped.map((item) => store.remove(item.id)))
    }
    const items = listed.slice(-NEXUS_TELEMETRY_OUTBOX_MAX_COUNT)
    if (!items.length) return

    for (const item of items) {
      if (!this.isNexusBatchPayload(item.payload)) {
        continue
      }
      if (!this.isOutboxItemDue(item)) {
        continue
      }

      try {
        const payload = item.payload as {
          events?: unknown
          metadata?: unknown
        }
        const events = Array.isArray(payload.events) ? payload.events : []
        const metadata =
          payload.metadata && typeof payload.metadata === 'object'
            ? (payload.metadata as Record<string, unknown>)
            : undefined
        const idempotencyKey =
          metadata && typeof metadata.idempotencyKey === 'string'
            ? metadata.idempotencyKey
            : undefined
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (idempotencyKey) {
          headers['X-Idempotency-Key'] = idempotencyKey
        }
        const response = await getNetworkService().request<string>({
          method: 'POST',
          url: item.endpoint,
          headers,
          body: JSON.stringify({
            events,
            metadata
          }),
          responseType: 'text',
          validateStatus: Array.from({ length: 500 }, (_, index) => index + 100)
        })

        if (response.status < 200 || response.status >= 300) {
          const errorText = summarizeRemoteFailurePayload(response.data) ?? 'Unknown error'
          if (response.status === 403) {
            this.telemetryCooldownUntil = Date.now() + 60 * 60_000
          } else if (response.status === 429) {
            this.telemetryCooldownUntil = Date.now() + 5 * 60_000
          }
          this.failedNexusUploads++
          this.schedulePersistTelemetryStats()
          this.recordTelemetryFailure('Telemetry upload failed', {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
            url: item.endpoint
          })
          await store.markAttempt(item.id, `${response.status}:${errorText}`)
          continue
        }

        await store.remove(item.id)
        this.telemetryCooldownUntil = null
        this.totalNexusUploads++
        this.lastNexusUploadTime = Date.now()
        this.schedulePersistTelemetryStats()
      } catch (error) {
        this.failedNexusUploads++
        this.schedulePersistTelemetryStats()
        this.telemetryCooldownUntil = Date.now() + 5 * 60_000
        const errorMessage = error instanceof Error ? error.message : String(error)
        this.recordTelemetryFailure('Telemetry upload exception', {
          error: errorMessage,
          url: item.endpoint
        })
        await store.markAttempt(item.id, errorMessage)
      }
    }
  }

  private recordTelemetryFailure(message: string, meta?: Record<string, unknown>): boolean {
    const now = Date.now()
    const throttleWindow = 10 * 60 * 1000
    if (this.lastTelemetryFailureAt && now - this.lastTelemetryFailureAt < throttleWindow) {
      if (this.lastTelemetryFailureMessage === message) return false
    }

    this.lastTelemetryFailureAt = now
    this.lastTelemetryFailureMessage = message
    this.schedulePersistTelemetryStats()
    const logMeta = toLogMeta(meta)
    if (shouldDowngradeTelemetryFailure(message, meta)) {
      sentryLog.info(message, logMeta ? { meta: logMeta } : undefined)
    } else {
      sentryLog.warn(message, logMeta ? { meta: logMeta } : undefined)
    }

    return true
  }

  /**
   * Stop Nexus telemetry flush timer
   */
  async stopNexusTelemetryTimer(): Promise<void> {
    this.pollingService.unregister(SENTRY_NEXUS_TASK_ID)
    await this.flushNexusTelemetry()
    await this.flushQueuedNexusTelemetryOutbox()
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
