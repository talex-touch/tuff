import chalk from 'chalk'
import { storageModule } from '../../storage'
// import { appSettings } from '@talex-touch/utils/renderer/storage/app-settings'

/**
 * Search Engine Logger
 * Provides unified logging for search engine components with configurable output
 */
export class SearchLogger {
  private static instance: SearchLogger
  private enabled: boolean = false
  // private readonly storageKey = 'search-engine-logs-enabled'
  // private currentSession: string | null = null
  private searchStartTime: number = 0
  private searchSteps: Array<{ step: string; timestamp: number; duration?: number }> = []

  private constructor() {
    this.loadSettings()
    this.setupSettingsWatcher()
  }

  /**
   * Setup watcher for settings changes
   */
  private setupSettingsWatcher(): void {
    // Watch for app settings changes
    setInterval(async () => {
      try {
        const appSettingsData = await storageModule.getConfig('app-setting.ini') as unknown as string
        if (appSettingsData) {
          const parsed = JSON.parse(appSettingsData as unknown as string)
          const newEnabled = parsed.searchEngine?.logsEnabled === true
          if (newEnabled !== this.enabled) {
            this.enabled = newEnabled
            console.log(`[SearchLogger] Settings changed: logging ${this.enabled ? 'enabled' : 'disabled'}`)
          }
        }
      } catch (error) {
        // Ignore errors during periodic checks
      }
    }, 1000) // Check every second
  }

  static getInstance(): SearchLogger {
    if (!SearchLogger.instance) {
      SearchLogger.instance = new SearchLogger()
    }
    return SearchLogger.instance
  }

  /**
   * Load settings from storage
   */
  private async loadSettings(): Promise<void> {
    try {
      // Try to get from app settings first
      const appSettingsData = await storageModule.getConfig('app-setting.ini')
      if (appSettingsData) {
        const parsed = JSON.parse(appSettingsData as unknown as string)
        this.enabled = parsed.searchEngine?.logsEnabled === true
        return
      }

      // Fallback to legacy setting
      const settings = await storageModule.getConfig('search-engine-logs-enabled')
      this.enabled = (settings as unknown as string) === 'true'
    } catch (error) {
      console.debug('[SearchLogger] Failed to load settings, using default:', error)
      this.enabled = false
    }
  }

  /**
   * Enable or disable search engine logging
   */
  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled
    try {
      // Update app settings
      const appSettingsData = await storageModule.getConfig('app-setting.ini')
      if (appSettingsData) {
        const parsed = JSON.parse(appSettingsData as unknown as string)
        if (!parsed.searchEngine) {
          parsed.searchEngine = {}
        }
        parsed.searchEngine.logsEnabled = enabled
        await storageModule.saveConfig('app-setting.ini', JSON.stringify(parsed))
      } else {
        // Fallback to legacy setting
        await storageModule.saveConfig('search-engine-logs-enabled', JSON.stringify(enabled))
      }
      console.log(`[SearchLogger] Search engine logging ${enabled ? 'enabled' : 'disabled'}`)
    } catch (error) {
      console.error('[SearchLogger] Failed to save settings:', error)
    }
  }

  /**
   * Check if logging is enabled
   */
  isEnabled(): boolean {
    return this.enabled
  }

  /**
   * Log search session start with clear separators
   */
  searchSessionStart(query: string, sessionId: string): void {
    if (!this.enabled) return

    // this.currentSession = sessionId
    this.searchStartTime = Date.now()
    this.searchSteps = []

    console.log('\n' + '='.repeat(80))
    console.log(
      chalk.bold.blue('🚀 SEARCH SESSION STARTED') +
      chalk.gray(` [${new Date().toLocaleTimeString()}]`)
    )
    console.log(
      chalk.cyan('📝 Query: ') +
      chalk.white.bold(`"${query}"`)
    )
    console.log(
      chalk.cyan('🆔 Session ID: ') +
      chalk.white(sessionId)
    )
    console.log('='.repeat(80) + '\n')
  }

  /**
   * Log search session end with summary
   */
  searchSessionEnd(sessionId: string, totalResults: number): void {
    if (!this.enabled) return

    const totalDuration = Date.now() - this.searchStartTime

    console.log('\n' + '='.repeat(80))
    console.log(
      chalk.bold.green('✅ SEARCH SESSION COMPLETED') +
      chalk.gray(` [${new Date().toLocaleTimeString()}]`)
    )
    console.log(
      chalk.cyan('🆔 Session ID: ') +
      chalk.white(sessionId)
    )
    console.log(
      chalk.cyan('📊 Total Results: ') +
      chalk.white.bold(`${totalResults}`)
    )
    console.log(
      chalk.cyan('⏱️ Total Duration: ') +
      chalk.white.bold(`${totalDuration}ms`)
    )

    // Log search steps summary
    if (this.searchSteps.length > 0) {
      console.log(chalk.cyan('📋 Search Steps:'))
      this.searchSteps.forEach((step, index) => {
        const duration = step.duration ? ` (${step.duration}ms)` : ''
        console.log(
          chalk.gray(`  ${index + 1}. `) +
          chalk.white(step.step) +
          chalk.gray(duration)
        )
      })
    }

    console.log('='.repeat(80) + '\n')

    // Reset session data
    // this.currentSession = null
    this.searchStartTime = 0
    this.searchSteps = []
  }

  /**
   * Log search step with timing
   */
  logSearchStep(step: string, duration?: number): void {
    if (!this.enabled) return

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
    if (!this.enabled) return
    console.log(
      chalk.blue.bold('[SearchEngine]') +
      chalk.cyan(' 🔍 Search started: ') +
      chalk.white(`"${query}"`) +
      chalk.gray(` (${sessionId})`)
    )
  }

  searchProviders(providers: string[]): void {
    if (!this.enabled) return
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
    if (!this.enabled) return
    console.log(
      chalk.blue.bold('[SearchEngine]') +
      chalk.cyan(' 🔤 Keyword Analysis:')
    )
    console.log(
      chalk.gray('  📝 Original Query: ') +
      chalk.white(`"${query}"`)
    )
    console.log(
      chalk.gray('  🔍 Search Terms: ') +
      chalk.white(`[${terms.join(', ')}]`)
    )
    console.log(
      chalk.gray('  🏷️ Type Filters: ') +
      chalk.white(`${typeFilters}`)
    )
    this.logSearchStep(`Analyzed keywords: ${terms.length} terms, ${typeFilters} filters`)
  }

  /**
   * Log search phase transitions
   */
  logSearchPhase(phase: string, details?: string): void {
    if (!this.enabled) return
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
    if (!this.enabled) return
    console.log(
      chalk.blue.bold('[SearchEngine]') +
      chalk.cyan(' 🔍 Provider Search: ') +
      chalk.white(providerId) +
      chalk.gray(` (${searchType})`)
    )
    console.log(
      chalk.gray('  📝 Query: ') +
      chalk.white(`"${query}"`)
    )
    this.logSearchStep(`${providerId} ${searchType} search started`)
  }

  searchUpdate(isDone: boolean, newResults: number): void {
    if (!this.enabled) return
    console.log(
      chalk.blue.bold('[SearchEngine]') +
      chalk.magenta(' 📊 Search update: ') +
      chalk.white(`isDone=${isDone}`) +
      chalk.gray(`, newResults=${newResults}`)
    )
  }

  searchComplete(duration: number): void {
    if (!this.enabled) return
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
    if (!this.enabled) return
    console.log(
      chalk.cyan.bold('[SearchGatherer]') +
      chalk.blue(' 🚀 Starting search aggregator: ') +
      chalk.white(`${providers} providers`) +
      chalk.gray(` for "${query}"`)
    )
  }

  workerStart(workerId: number): void {
    if (!this.enabled) return
    console.log(
      chalk.cyan.bold('[SearchGatherer]') +
      chalk.yellow(' 👷 Worker ') +
      chalk.white(`${workerId}`) +
      chalk.gray(' started processing tasks')
    )
  }

  workerProcessing(workerId: number, providerId: string): void {
    if (!this.enabled) return
    console.log(
      chalk.cyan.bold('[SearchGatherer]') +
      chalk.blue(' 🔄 Worker ') +
      chalk.white(`${workerId}`) +
      chalk.gray(' processing provider: ') +
      chalk.white(providerId)
    )
  }

  providerCall(providerId: string): void {
    if (!this.enabled) return
    console.log(
      chalk.cyan.bold('[SearchGatherer]') +
      chalk.blue(' ⏱️ Calling provider: ') +
      chalk.white(providerId)
    )
  }

  providerResult(providerId: string, resultCount: number): void {
    if (!this.enabled) return
    console.log(
      chalk.cyan.bold('[SearchGatherer]') +
      chalk.green(' ✅ Provider ') +
      chalk.white(providerId) +
      chalk.gray(' returned ') +
      chalk.white(`${resultCount} results`)
    )
  }

  providerTimeout(providerId: string, timeoutMs: number): void {
    if (!this.enabled) return
    console.log(
      chalk.cyan.bold('[SearchGatherer]') +
      chalk.red(' ⏰ Provider ') +
      chalk.white(providerId) +
      chalk.gray(' timed out after ') +
      chalk.white(`${timeoutMs}ms`)
    )
  }

  providerError(providerId: string, error: string): void {
    if (!this.enabled) return
    console.log(
      chalk.cyan.bold('[SearchGatherer]') +
      chalk.red(' ❌ Provider ') +
      chalk.white(providerId) +
      chalk.gray(' failed: ') +
      chalk.red(error)
    )
  }

  workerComplete(workerId: number): void {
    if (!this.enabled) return
    console.log(
      chalk.cyan.bold('[SearchGatherer]') +
      chalk.green(' 🏁 Worker ') +
      chalk.white(`${workerId}`) +
      chalk.gray(' completed all tasks')
    )
  }

  resultReceived(resultCount: number): void {
    if (!this.enabled) return
    console.log(
      chalk.cyan.bold('[SearchGatherer]') +
      chalk.magenta(' 📥 Received provider result: ') +
      chalk.white(`${resultCount} items`)
    )
  }

  firstBatch(graceMs: number): void {
    if (!this.enabled) return
    console.log(
      chalk.cyan.bold('[SearchGatherer]') +
      chalk.yellow(' 🎯 First batch result, flushing in ') +
      chalk.white(`${graceMs}ms`)
    )
  }

  allProvidersComplete(): void {
    if (!this.enabled) return
    console.log(
      chalk.cyan.bold('[SearchGatherer]') +
      chalk.green(' ✅ All providers completed, performing final flush')
    )
  }

  /**
   * Log file provider events
   */
  fileSearchStart(query: string): void {
    if (!this.enabled) return
    console.log(
      chalk.green.bold('[FileProvider]') +
      chalk.blue(' 🔍 Starting file search: ') +
      chalk.white(`"${query}"`)
    )
  }

  fileSearchNotInitialized(): void {
    if (!this.enabled) return
    console.log(
      chalk.green.bold('[FileProvider]') +
      chalk.red(' ❌ Database utils or search index not initialized')
    )
  }

  fileSearchText(searchText: string, typeFilters: number): void {
    if (!this.enabled) return
    console.log(
      chalk.green.bold('[FileProvider]') +
      chalk.cyan(' 📝 Search text: ') +
      chalk.white(`"${searchText}"`) +
      chalk.gray(`, type filters: ${typeFilters}`)
    )
  }

  filePreciseSearch(terms: string[]): void {
    if (!this.enabled) return
    console.log(
      chalk.green.bold('[FileProvider]') +
      chalk.blue(' 🔎 Starting precise keyword search: ') +
      chalk.white(terms.join(', '))
    )
  }

  filePreciseQueries(queryCount: number): void {
    if (!this.enabled) return
    console.log(
      chalk.green.bold('[FileProvider]') +
      chalk.cyan(' 📊 Executing ') +
      chalk.white(`${queryCount}`) +
      chalk.gray(' precise queries')
    )
  }

  filePreciseResults(matches: number[]): void {
    if (!this.enabled) return
    console.log(
      chalk.green.bold('[FileProvider]') +
      chalk.green(' 📈 Precise queries completed, matches per term: ') +
      chalk.white(matches.join(', '))
    )
  }

  fileFtsQuery(query: string): void {
    if (!this.enabled) return
    console.log(
      chalk.green.bold('[FileProvider]') +
      chalk.blue(' 🔍 Building FTS query: ') +
      chalk.white(`"${query}"`)
    )
  }

  fileFtsResults(matches: number, duration: number): void {
    if (!this.enabled) return
    console.log(
      chalk.green.bold('[FileProvider]') +
      chalk.green(' 📊 FTS search completed: ') +
      chalk.white(`${matches} matches`) +
      chalk.gray(`, ${duration}ms`)
    )
  }

  fileDataFetch(candidateCount: number): void {
    if (!this.enabled) return
    console.log(
      chalk.green.bold('[FileProvider]') +
      chalk.cyan(' 📥 Starting candidate file data fetch: ') +
      chalk.white(`${candidateCount} paths`)
    )
  }

  fileDataResults(rows: number, duration: number): void {
    if (!this.enabled) return
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
    if (!this.enabled) return
    console.log(
      chalk.magenta.bold('[SearchIndex]') +
      chalk.blue(' 🔍 Starting FTS search: ') +
      chalk.white(`provider=${providerId}`) +
      chalk.gray(`, query="${query}", limit=${limit}`)
    )
  }

  indexSearchEmpty(): void {
    if (!this.enabled) return
    console.log(
      chalk.magenta.bold('[SearchIndex]') +
      chalk.red(' ❌ Query is empty, returning empty results')
    )
  }

  indexSearchExecuting(): void {
    if (!this.enabled) return
    console.log(
      chalk.magenta.bold('[SearchIndex]') +
      chalk.cyan(' 📊 Executing SQL query')
    )
  }

  indexSearchComplete(matches: number, duration: number): void {
    if (!this.enabled) return
    console.log(
      chalk.magenta.bold('[SearchIndex]') +
      chalk.green(' ✅ FTS search completed: ') +
      chalk.white(`${matches} matches`) +
      chalk.gray(`, ${duration}ms`)
    )
  }
}

export const searchLogger = SearchLogger.getInstance()
