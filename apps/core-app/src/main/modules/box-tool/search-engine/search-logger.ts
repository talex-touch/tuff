import crypto from 'node:crypto'
import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import { StorageList } from '@talex-touch/utils/common/storage/constants'
import { loggerManager } from '@talex-touch/utils/common/logger'
import chalk from 'chalk'
import { TalexEvents, touchEventBus } from '../../../core/eventbus/touch-event'
import {
  getMainConfig,
  isMainStorageReady,
  saveMainConfig,
  subscribeMainConfig
} from '../../storage'

const SEARCH_LOGGER_BURST_MIN_MS = 1000
const SEARCH_LOGGER_BURST_MAX_MS = 5 * 60 * 1000

/**
 * Search Engine Logger
 * Provides unified logging for search engine components with configurable output.
 * Integrated with LoggerManager for centralized control.
 */
export class SearchLogger {
  private static instance: SearchLogger
  private manualEnabled: boolean = false
  private burstUntil = 0
  private burstReason: string | null = null
  private burstTimer: NodeJS.Timeout | null = null
  private searchStartTime: number = 0
  private searchSteps: Array<{ step: string; timestamp: number; duration?: number }> = []
  private unsubscribe?: () => void
  private initialized = false
  private storageReadyHooked = false

  private constructor() {
    // Register with LoggerManager for centralized control
    loggerManager.getLogger('search-engine', { enabled: this.manualEnabled, color: 'cyan' })
    this.setupStorageReadyHook()
  }

  /**
   * Initialize settings and subscribe after storage is ready.
   */
  async init(): Promise<void> {
    if (this.initialized) return
    if (!isMainStorageReady()) {
      this.setupStorageReadyHook()
      return
    }
    this.initialized = true
    await this.loadSettings()
    this.setupSettingsWatcher()
  }

  /**
   * Setup watcher for settings changes using subscription
   */
  private setupSettingsWatcher(): void {
    if (this.unsubscribe) return
    // Subscribe to app settings changes instead of polling
    try {
      // Subscribe to configuration changes
      this.unsubscribe = subscribeMainConfig(StorageList.APP_SETTING, (data) => {
        try {
          const settings = data as AppSetting
          const newEnabled = settings.searchEngine?.logsEnabled === true

          if (newEnabled !== this.manualEnabled) {
            this.manualEnabled = newEnabled
            console.debug(
              `[SearchLogger] Settings changed: logging ${this.manualEnabled ? 'enabled' : 'disabled'}`
            )
          }
        } catch (error) {
          // Ignore parsing errors
          console.error('[SearchLogger] Error processing settings update:', error)
        }
      })
    } catch (error) {
      console.error('[SearchLogger] Failed to setup settings watcher:', error)
      // Fallback to disabled state
      this.manualEnabled = false
    }
  }

  private setupStorageReadyHook(): void {
    if (this.storageReadyHooked) return
    this.storageReadyHooked = true

    if (isMainStorageReady()) {
      void this.init()
      return
    }

    touchEventBus.once(TalexEvents.ALL_MODULES_LOADED, () => {
      void this.init()
    })
  }

  static getInstance(): SearchLogger {
    if (!SearchLogger.instance) {
      SearchLogger.instance = new SearchLogger()
    }
    return SearchLogger.instance
  }

  /**
   * Cleanup and destroy the logger instance
   * Unsubscribes from settings changes
   */
  destroy(): void {
    if (this.unsubscribe) {
      this.unsubscribe()
      this.unsubscribe = undefined
    }
    this.clearBurstTimer()
    this.burstUntil = 0
    this.burstReason = null
    this.initialized = false
  }

  /**
   * Load settings from storage
   */
  private async loadSettings(): Promise<void> {
    try {
      // Try to get from app settings first
      const appSettingsData = getMainConfig(StorageList.APP_SETTING) as AppSetting
      const enabledFromAppSettings = appSettingsData?.searchEngine?.logsEnabled
      if (typeof enabledFromAppSettings === 'boolean') {
        this.manualEnabled = enabledFromAppSettings
        return
      }

      // Fallback to legacy setting
      const settings = getMainConfig(StorageList.SEARCH_ENGINE_LOGS_ENABLED)
      this.manualEnabled = settings === true
    } catch {
      // Silently fail if storage is not ready yet
      this.manualEnabled = false
    }
  }

  /**
   * Enable or disable search engine logging
   */
  async setEnabled(enabled: boolean): Promise<void> {
    this.manualEnabled = enabled
    try {
      // Update app settings
      const appSettingsData = getMainConfig(StorageList.APP_SETTING) as AppSetting
      const parsed =
        typeof appSettingsData === 'object' && appSettingsData
          ? { ...appSettingsData }
          : ({} as AppSetting)
      if (!parsed.searchEngine) {
        parsed.searchEngine = { logsEnabled: enabled }
      } else {
        parsed.searchEngine.logsEnabled = enabled
      }
      saveMainConfig(StorageList.APP_SETTING, parsed)
      console.log(`[SearchLogger] Search engine logging ${enabled ? 'enabled' : 'disabled'}`)
    } catch (error) {
      console.error('[SearchLogger] Failed to save settings:', error)
    }
  }

  /**
   * Check if logging is enabled
   */
  isEnabled(): boolean {
    return this.manualEnabled || Date.now() < this.burstUntil
  }

  /**
   * Enable temporary high-signal diagnostics logging.
   * This state is in-memory only and never persisted.
   */
  enableBurst(durationMs: number, reason = 'unspecified'): void {
    const normalizedDuration = Math.max(
      SEARCH_LOGGER_BURST_MIN_MS,
      Math.min(SEARCH_LOGGER_BURST_MAX_MS, Math.round(durationMs))
    )
    const now = Date.now()
    const nextUntil = now + normalizedDuration
    this.burstUntil = Math.max(this.burstUntil, nextUntil)
    this.burstReason = reason
    this.refreshBurstTimer()
    console.warn(
      `[SearchLogger] Burst logging enabled for ${normalizedDuration}ms (reason: ${reason})`
    )
  }

  getBurstState(): { active: boolean; until: number; reason: string | null } {
    return {
      active: Date.now() < this.burstUntil,
      until: this.burstUntil,
      reason: this.burstReason
    }
  }

  private clearBurstTimer(): void {
    if (!this.burstTimer) return
    clearTimeout(this.burstTimer)
    this.burstTimer = null
  }

  private refreshBurstTimer(): void {
    this.clearBurstTimer()
    const remaining = this.burstUntil - Date.now()
    if (remaining <= 0) {
      this.burstUntil = 0
      this.burstReason = null
      return
    }
    this.burstTimer = setTimeout(() => {
      if (Date.now() >= this.burstUntil) {
        this.burstUntil = 0
        this.burstReason = null
      }
      this.clearBurstTimer()
    }, remaining)
  }

  private summarizeQuery(query: string): string {
    const normalized = typeof query === 'string' ? query : ''
    const digest = crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 12)
    return `len=${normalized.length}, hash=${digest}`
  }

  /**
   * Log search session start with clear separators
   */
  searchSessionStart(query: string, sessionId: string): void {
    if (!this.isEnabled()) {
      return
    }

    // this.currentSession = sessionId
    this.searchStartTime = Date.now()
    this.searchSteps = []

    console.log(`\n${'='.repeat(80)}`)
    console.log(
      chalk.bold.blue('🚀 SEARCH SESSION STARTED') +
        chalk.gray(` [${new Date().toLocaleTimeString()}]`)
    )
    console.log(chalk.cyan('📝 Query: ') + chalk.white.bold(this.summarizeQuery(query)))
    console.log(chalk.cyan('🆔 Session ID: ') + chalk.white(sessionId))
    console.log(`${'='.repeat(80)}\n`)
  }

  /**
   * Log search session end with summary
   */
  searchSessionEnd(sessionId: string, totalResults: number): void {
    if (!this.isEnabled()) return

    const totalDuration = Date.now() - this.searchStartTime

    console.log(`\n${'='.repeat(80)}`)
    console.log(
      chalk.bold.green('✅ SEARCH SESSION COMPLETED') +
        chalk.gray(` [${new Date().toLocaleTimeString()}]`)
    )
    console.log(chalk.cyan('🆔 Session ID: ') + chalk.white(sessionId))
    console.log(chalk.cyan('📊 Total Results: ') + chalk.white.bold(`${totalResults}`))
    console.log(chalk.cyan('⏱️ Total Duration: ') + chalk.white.bold(`${totalDuration}ms`))

    // Log search steps summary
    if (this.searchSteps.length > 0) {
      console.log(chalk.cyan('📋 Search Steps:'))
      this.searchSteps.forEach((step, index) => {
        const duration = step.duration ? ` (${step.duration}ms)` : ''
        console.log(chalk.gray(`  ${index + 1}. `) + chalk.white(step.step) + chalk.gray(duration))
      })
    }

    console.log(`${'='.repeat(80)}\n`)

    // Reset session data
    // this.currentSession = null
    this.searchStartTime = 0
    this.searchSteps = []
  }

  /**
   * Log search step with timing
   */
  logSearchStep(step: string, duration?: number): void {
    if (!this.isEnabled()) return

    const timestamp = Date.now()
    this.searchSteps.push({ step, timestamp, duration })

    const timeStr = duration ? ` (${duration}ms)` : ''
    console.log(
      chalk.blue.bold('[SearchEngine]') +
        chalk.cyan(' 📋 Step: ') +
        chalk.white(step) +
        chalk.gray(timeStr)
    )
  }

  /**
   * Log search engine core events
   */
  searchStart(query: string, sessionId: string): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.blue.bold('[SearchEngine]') +
        chalk.cyan(' 🔍 Search started: ') +
        chalk.white(this.summarizeQuery(query)) +
        chalk.gray(` (${sessionId})`)
    )
  }

  searchProviders(providers: string[]): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.blue.bold('[SearchEngine]') +
        chalk.yellow(' 🎯 Active providers: ') +
        chalk.white(`${providers.length}`) +
        chalk.gray(` [${providers.join(', ')}]`)
    )
    this.logSearchStep(`Initialized ${providers.length} search providers`)
  }

  /**
   * Log keyword analysis and processing
   */
  logKeywordAnalysis(query: string, terms: string[], typeFilters: number): void {
    if (!this.isEnabled()) return
    console.log(chalk.blue.bold('[SearchEngine]') + chalk.cyan(' 🔤 Keyword Analysis:'))
    console.log(chalk.gray('  📝 Original Query: ') + chalk.white(this.summarizeQuery(query)))
    console.log(chalk.gray('  🔍 Search Terms: ') + chalk.white(`count=${terms.length}`))
    console.log(chalk.gray('  🏷️ Type Filters: ') + chalk.white(`${typeFilters}`))
    this.logSearchStep(`Analyzed keywords: ${terms.length} terms, ${typeFilters} filters`)
  }

  /**
   * Log search phase transitions
   */
  logSearchPhase(phase: string, details?: string): void {
    if (!this.isEnabled()) return
    const detailsStr = details ? ` - ${details}` : ''
    console.log(
      chalk.blue.bold('[SearchEngine]') +
        chalk.magenta(' 🔄 Phase: ') +
        chalk.white.bold(phase) +
        chalk.gray(detailsStr)
    )
    this.logSearchStep(`Phase: ${phase}${detailsStr}`)
  }

  /**
   * Log provider-specific search details
   */
  logProviderSearch(providerId: string, query: string, searchType: string): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.blue.bold('[SearchEngine]') +
        chalk.cyan(' 🔍 Provider Search: ') +
        chalk.white(providerId) +
        chalk.gray(` (${searchType})`)
    )
    console.log(chalk.gray('  📝 Query: ') + chalk.white(this.summarizeQuery(query)))
    this.logSearchStep(`${providerId} ${searchType} search started`)
  }

  searchUpdate(isDone: boolean, newResults: number): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.blue.bold('[SearchEngine]') +
        chalk.magenta(' 📊 Search update: ') +
        chalk.white(`isDone=${isDone}`) +
        chalk.gray(`, newResults=${newResults}`)
    )
  }

  searchComplete(duration: number): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.blue.bold('[SearchEngine]') +
        chalk.green(' ✅ Search completed in ') +
        chalk.white(`${duration}ms`)
    )
  }

  /**
   * Log search gatherer events
   */
  gathererStart(providers: number, query: string): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.cyan.bold('[SearchGatherer]') +
        chalk.blue(' 🚀 Starting search aggregator: ') +
        chalk.white(`${providers} providers`) +
        chalk.gray(` for ${this.summarizeQuery(query)}`)
    )
  }

  workerStart(workerId: number): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.cyan.bold('[SearchGatherer]') +
        chalk.yellow(' 👷 Worker ') +
        chalk.white(`${workerId}`) +
        chalk.gray(' started processing tasks')
    )
  }

  workerProcessing(workerId: number, providerId: string): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.cyan.bold('[SearchGatherer]') +
        chalk.blue(' 🔄 Worker ') +
        chalk.white(`${workerId}`) +
        chalk.gray(' processing provider: ') +
        chalk.white(providerId)
    )
  }

  providerCall(providerId: string): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.cyan.bold('[SearchGatherer]') +
        chalk.blue(' ⏱️ Calling provider: ') +
        chalk.white(providerId)
    )
  }

  providerResult(providerId: string, resultCount: number): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.cyan.bold('[SearchGatherer]') +
        chalk.green(' ✅ Provider ') +
        chalk.white(providerId) +
        chalk.gray(' returned ') +
        chalk.white(`${resultCount} results`)
    )
  }

  providerTimeout(providerId: string, timeoutMs: number): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.cyan.bold('[SearchGatherer]') +
        chalk.red(' ⏰ Provider ') +
        chalk.white(providerId) +
        chalk.gray(' timed out after ') +
        chalk.white(`${timeoutMs}ms`)
    )
  }

  providerError(providerId: string, error: string): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.cyan.bold('[SearchGatherer]') +
        chalk.red(' ❌ Provider ') +
        chalk.white(providerId) +
        chalk.gray(' failed: ') +
        chalk.red(error)
    )
  }

  workerComplete(workerId: number): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.cyan.bold('[SearchGatherer]') +
        chalk.green(' 🏁 Worker ') +
        chalk.white(`${workerId}`) +
        chalk.gray(' completed all tasks')
    )
  }

  resultReceived(resultCount: number): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.cyan.bold('[SearchGatherer]') +
        chalk.magenta(' 📥 Received provider result: ') +
        chalk.white(`${resultCount} items`)
    )
  }

  firstBatch(graceMs: number): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.cyan.bold('[SearchGatherer]') +
        chalk.yellow(' 🎯 First batch result, flushing in ') +
        chalk.white(`${graceMs}ms`)
    )
  }

  allProvidersComplete(): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.cyan.bold('[SearchGatherer]') +
        chalk.green(' ✅ All providers completed, performing final flush')
    )
  }

  /**
   * Log file provider events
   */
  fileSearchStart(query: string): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.green.bold('[FileProvider]') +
        chalk.blue(' 🔍 Starting file search: ') +
        chalk.white(this.summarizeQuery(query))
    )
  }

  fileSearchNotInitialized(): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.green.bold('[FileProvider]') +
        chalk.red(' ❌ Database utils or search index not initialized')
    )
  }

  fileSearchText(searchText: string, typeFilters: number): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.green.bold('[FileProvider]') +
        chalk.cyan(' 📝 Search text: ') +
        chalk.white(this.summarizeQuery(searchText)) +
        chalk.gray(`, type filters: ${typeFilters}`)
    )
  }

  filePreciseSearch(terms: string[]): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.green.bold('[FileProvider]') +
        chalk.blue(' 🔎 Starting precise keyword search: ') +
        chalk.white(terms.join(', '))
    )
  }

  filePreciseQueries(queryCount: number): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.green.bold('[FileProvider]') +
        chalk.cyan(' 📊 Executing ') +
        chalk.white(`${queryCount}`) +
        chalk.gray(' precise queries')
    )
  }

  filePreciseResults(matches: number[]): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.green.bold('[FileProvider]') +
        chalk.green(' 📈 Precise queries completed, matches per term: ') +
        chalk.white(matches.join(', '))
    )
  }

  fileFtsQuery(query: string): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.green.bold('[FileProvider]') +
        chalk.blue(' 🔍 Building FTS query: ') +
        chalk.white(this.summarizeQuery(query))
    )
  }

  fileFtsResults(matches: number, duration: number): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.green.bold('[FileProvider]') +
        chalk.green(' 📊 FTS search completed: ') +
        chalk.white(`${matches} matches`) +
        chalk.gray(`, ${duration}ms`)
    )
  }

  fileDataFetch(candidateCount: number): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.green.bold('[FileProvider]') +
        chalk.cyan(' 📥 Starting candidate file data fetch: ') +
        chalk.white(`${candidateCount} paths`)
    )
  }

  fileDataResults(rows: number, duration: number): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.green.bold('[FileProvider]') +
        chalk.green(' 📊 Retrieved ') +
        chalk.white(`${rows} rows`) +
        chalk.gray(`, ${duration}ms`)
    )
  }

  /**
   * Log search index service events
   */
  indexSearchStart(providerId: string, query: string, limit: number): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.magenta.bold('[SearchIndex]') +
        chalk.blue(' 🔍 Starting FTS search: ') +
        chalk.white(`provider=${providerId}`) +
        chalk.gray(`, query=${this.summarizeQuery(query)}, limit=${limit}`)
    )
  }

  indexSearchEmpty(): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.magenta.bold('[SearchIndex]') + chalk.red(' ❌ Query is empty, returning empty results')
    )
  }

  indexSearchExecuting(): void {
    if (!this.isEnabled()) return
    console.log(chalk.magenta.bold('[SearchIndex]') + chalk.cyan(' 📊 Executing SQL query'))
  }

  indexSearchComplete(matches: number, duration: number): void {
    if (!this.isEnabled()) return
    console.log(
      chalk.magenta.bold('[SearchIndex]') +
        chalk.green(' ✅ FTS search completed: ') +
        chalk.white(`${matches} matches`) +
        chalk.gray(`, ${duration}ms`)
    )
  }
}

export const searchLogger = SearchLogger.getInstance()
