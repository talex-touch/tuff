/**
 * Sentry Service Module
 *
 * Handles error reporting, analytics, and user tracking with privacy controls
 */

import type { ModuleKey } from '@talex-touch/utils'
import crypto from 'node:crypto'
import os from 'node:os'
import * as Sentry from '@sentry/electron/main'
import { ChannelType } from '@talex-touch/utils/channel'
import { getTelemetryApiBase } from '@talex-touch/utils/env'
import { app } from 'electron'
import { createLogger } from '../../utils/logger'
import { getAppVersionSafe } from '../../utils/version-util'
import { BaseModule } from '../abstract-base-module'
import { storageModule } from '../storage'

// User type from Clerk
interface ClerkUser {
  id: string
  username?: string | null
  emailAddresses?: Array<{ emailAddress: string }>
}

const sentryLog = createLogger('SentryService')

// Sentry DSN
const SENTRY_DSN = 'https://f8019096132f03a7a66c879a53462a67@o4508024637620224.ingest.us.sentry.io/4510196503871488'

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
  eventType: 'search' | 'visit' | 'error' | 'feature_use'
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
  const components = [
    process.platform,
    os.arch(),
    os.hostname(),
    os.type(),
    os.release(),
  ]
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
    buildTimestamp: Date.now(),
  }
}

/**
 * Sentry Service Module
 */
export class SentryServiceModule extends BaseModule {
  static key: symbol = Symbol.for('SentryService')
  name: ModuleKey = SentryServiceModule.key

  private config: SentryConfig = { enabled: false, anonymous: true }
  private deviceFingerprint: string | null = null
  private searchCount = 0
  private searchMetricsBuffer: SearchMetrics[] = []
  private isInitialized = false
  
  private nexusTelemetryBuffer: NexusTelemetryEvent[] = []
  private nexusFlushTimer: NodeJS.Timeout | null = null
  private lastNexusUploadTime: number | null = null
  private totalNexusUploads = 0
  private failedNexusUploads = 0

  constructor() {
    super(SentryServiceModule.key)
  }

  async onInit(): Promise<void> {
    sentryLog.info('Initializing Sentry service')

    // Load configuration
    this.loadConfig()

    // Generate device fingerprint (but don't use it if anonymous)
    this.deviceFingerprint = generateDeviceFingerprint()

    // Initialize Sentry if enabled
    if (this.config.enabled) {
      this.initializeSentry()
    }
    else {
      sentryLog.info('Sentry is disabled by configuration')
    }

    
    this.setupIPCChannels()

    try {
      storageModule.subscribe('sentry-config.json', (data) => {
        const cfg = data as Partial<SentryConfig>
        this.saveConfig(cfg)
      })
    }
    catch (error) {
      sentryLog.warn('Failed to subscribe sentry-config changes', {
        meta: { error: error instanceof Error ? error.message : String(error) }
      })
    }
  }

  /**
   * Setup IPC channels for user context updates
   */
  private setupIPCChannels(): void {
    const channel = $app.channel
    if (!channel)
      return

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
      return this.getSearchCount()
    })

    channel.regChannel(ChannelType.MAIN, 'sentry:get-telemetry-stats', () => {
      return this.getTelemetryStats()
    })
  }

  async onDestroy(): Promise<void> {
    
    if (this.isInitialized) {
      
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    this.stopNexusTelemetryTimer()
  }

  /**
   * Load configuration from storage
   */
  private loadConfig(): void {
    try {
      const config = storageModule.getConfig('sentry-config.json') as Partial<SentryConfig> | undefined
      this.config = {
        enabled: config?.enabled ?? false,
        anonymous: config?.anonymous ?? true,
      }
      sentryLog.debug('Loaded Sentry config', { meta: { enabled: this.config.enabled, anonymous: this.config.anonymous } })
    }
    catch (error) {
      sentryLog.warn('Failed to load Sentry config, using defaults', {
        meta: { error: error instanceof Error ? error.message : String(error) },
      })
      // Use defaults: disabled by default for privacy
      this.config = { enabled: false, anonymous: true }
    }
  }

  /**
   * Save configuration to storage
   */
  saveConfig(config: Partial<SentryConfig>): void {
    this.config = { ...this.config, ...config }
    storageModule.saveConfig('sentry-config.json', JSON.stringify(this.config))
    sentryLog.info('Saved Sentry config', {
      meta: { enabled: this.config.enabled, anonymous: this.config.anonymous },
    })

    // Reinitialize if enabled state changed
    if (config.enabled !== undefined) {
      if (this.config.enabled && !this.isInitialized) {
        this.initializeSentry()
      }
      else if (!this.config.enabled && this.isInitialized) {
        this.shutdownSentry()
      }
    }

    // Update user context if anonymous state changed
    if (config.anonymous !== undefined && this.isInitialized) {
      this.updateUserContext()
    }
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
            environment: getEnvironmentContext(),
          }

          return event
        },
        // Before breadcrumb hook
        beforeBreadcrumb(breadcrumb) {
          return breadcrumb
        },
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
        },
      })
    }
    catch (error) {
      sentryLog.error('Failed to initialize Sentry', {
        meta: { error: error instanceof Error ? error.message : String(error) },
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
    if (!this.isInitialized) {
      return
    }

    if (this.config.anonymous) {
      // Anonymous mode: no user ID or fingerprint
      Sentry.setUser(null)
      sentryLog.debug('User context cleared (anonymous mode)')
      return
    }

    // Non-anonymous mode
    if (user && user.id) {
      const userContext: Sentry.User = {
        id: user.id,
        username: user.username || undefined,
        email: undefined, // Never send email
      }

      // Add device fingerprint if available
      if (this.deviceFingerprint) {
        userContext.ip_address = undefined // Clear IP
        // Add fingerprint as a tag instead of user field
        Sentry.setTag('device.fingerprint', this.deviceFingerprint)
      }

      Sentry.setUser(userContext)
      sentryLog.debug('User context updated', {
        meta: { userId: user.id, hasFingerprint: !!this.deviceFingerprint },
      })
    }
    else {
      // Not authenticated, but not anonymous mode - use device fingerprint only
      if (this.deviceFingerprint) {
        Sentry.setUser({
          id: `device:${this.deviceFingerprint}`,
          username: undefined,
          email: undefined,
        })
        Sentry.setTag('device.fingerprint', this.deviceFingerprint)
        sentryLog.debug('User context set to device fingerprint', {
          meta: { fingerprint: this.deviceFingerprint },
        })
      }
      else {
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
      const avgDuration
        = this.searchMetricsBuffer.reduce((sum, m) => sum + m.totalDuration, 0) / totalSearches
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
            Object.entries(providerTotalTimes).map(([p, t]) => [p, Math.round(t / totalSearches)]),
          ),
          sample_queries: this.searchMetricsBuffer.slice(-5).map(m => ({
            text: m.queryText.substring(0, 100), // Truncate for privacy
            inputTypes: m.inputTypes,
            duration: m.totalDuration,
            results: m.resultCount,
          })),
        })

        Sentry.captureMessage('Search analytics batch report', 'info')
      })

      // Clear buffer
      this.searchMetricsBuffer = []

      sentryLog.debug('Search analytics reported', {
        meta: {
          searchCount: this.searchCount,
          batchSize: totalSearches,
          avgDuration: avgDuration.toFixed(2),
        },
      })
    }
    catch (error) {
      sentryLog.error('Failed to report search analytics', {
        meta: { error: error instanceof Error ? error.message : String(error) },
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
  captureMessage(message: string, level: Sentry.SeverityLevel = 'info', context?: Record<string, unknown>): void {
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
   * Get search count
   */
  getSearchCount(): number {
    return this.searchCount
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
      apiBase: getTelemetryApiBase(),
      isEnabled: this.config.enabled,
      isAnonymous: this.config.anonymous,
    }
  }

  /**
   * Queue telemetry event for batch upload to Nexus
   */
  queueNexusTelemetry(event: Omit<NexusTelemetryEvent, 'isAnonymous'>): void {
    if (!this.config.enabled) return

    if (event.eventType === 'search') {
      this.searchCount++
    }

    const telemetryEvent: NexusTelemetryEvent = {
      ...event,
      deviceFingerprint: this.config.anonymous ? undefined : this.deviceFingerprint || undefined,
      platform: process.platform,
      version: getAppVersionSafe(),
      isAnonymous: this.config.anonymous,
    }

    this.nexusTelemetryBuffer.push(telemetryEvent)

    if (this.nexusTelemetryBuffer.length >= NEXUS_TELEMETRY_BATCH_SIZE) {
      this.flushNexusTelemetry()
    }

    // Set up periodic flush timer if not already running
    if (!this.nexusFlushTimer) {
      this.nexusFlushTimer = setInterval(() => {
        this.flushNexusTelemetry()
      }, NEXUS_TELEMETRY_FLUSH_INTERVAL)
    }
  }

  /**
   * Flush buffered telemetry events to Nexus
   */
  private async flushNexusTelemetry(): Promise<void> {
    if (this.nexusTelemetryBuffer.length === 0) return

    const events = [...this.nexusTelemetryBuffer]
    this.nexusTelemetryBuffer = []

    try {
      const apiBase = getTelemetryApiBase()
      const url = `${apiBase}/api/telemetry/batch`
      
      sentryLog.debug('Uploading telemetry batch', { meta: { count: events.length, url } })

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events }),
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error')
        this.failedNexusUploads++
        sentryLog.error('Telemetry upload failed', { 
          meta: { status: response.status, statusText: response.statusText, error: errorText } 
        })
        this.nexusTelemetryBuffer = [...events.slice(-50), ...this.nexusTelemetryBuffer].slice(0, 100)
      } else {
        this.totalNexusUploads++
        this.lastNexusUploadTime = Date.now()
        sentryLog.debug('Telemetry batch uploaded', { meta: { count: events.length } })
      }
    } catch (error) {
      this.failedNexusUploads++
      sentryLog.error('Telemetry upload exception', { 
        meta: { error: error instanceof Error ? error.message : String(error) } 
      })
      this.nexusTelemetryBuffer = [...events.slice(-50), ...this.nexusTelemetryBuffer].slice(0, 100)
    }
  }

  /**
   * Stop Nexus telemetry flush timer
   */
  stopNexusTelemetryTimer(): void {
    if (this.nexusFlushTimer) {
      clearInterval(this.nexusFlushTimer)
      this.nexusFlushTimer = null
    }
    // Flush remaining events
    this.flushNexusTelemetry()
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
