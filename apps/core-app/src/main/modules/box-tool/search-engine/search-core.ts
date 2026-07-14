import type {
  IGatherController,
  IProviderActivate,
  ISearchEngine,
  ISearchProvider,
  TalexTouch,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import type { ModuleInitContext } from 'packages/utils/types/modules'
import type { TouchApp } from '../../../core/touch-app'
import type { DbUtils } from '../../../db/utils'
import type { ProviderContext } from './types'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { TuffSearchResultBuilder, type TuffItem } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { CoreBoxEvents, CoreBoxRetainedEvents } from '@talex-touch/utils/transport/events'
import {
  ProviderDeactivatedEvent,
  TalexEvents,
  touchEventBus
} from '../../../core/eventbus/touch-event'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import { createDbUtils } from '../../../db/utils'
import { appTaskGate } from '../../../service/app-task-gate'
import { enterPerfContext } from '../../../utils/perf-context'
import { perfMonitor } from '../../../utils/perf-monitor'
import { databaseModule } from '../../database'
import PluginFeaturesAdapter from '../../plugin/adapters/plugin-features-adapter'
import { getSentryService } from '../../sentry'
import { appProvider } from '../addon/apps/app-provider'
import { everythingProvider } from '../addon/files/everything-provider'
import { fileProvider } from '../addon/files/file-provider'
import { FILE_INDEXED_SOURCE_ID } from './file-indexed-source'
import {
  linuxNativeFileProvider,
  macSpotlightFileProvider
} from '../addon/files/native-file-search-provider'
import { previewProvider } from '../addon/preview'
import { mainWindowProvider } from '../addon/system/main-window-provider'
import { systemActionsProvider } from '../addon/system/system-actions-provider'
import { windowsShellFileProvider } from '../addon/system/windows-shell-file-provider'
import { windowManager } from '../core-box/window'
import { indexingRuntime, type IndexingRuntime } from './indexing-runtime'
import { registerCoreIndexedSources } from './indexing-runtime-sources'
import { SearchIndexStoreAdapter } from './indexing-store-adapter'
import { SqliteIndexingTaskStateStore } from './indexing-task-state-store'
import { QueryCompletionService } from './query-completion-service'
import { RecommendationEngine } from './recommendation/recommendation-engine'
import { gatherAggregator } from './search-gather'
import { markSearchActivity } from './search-activity'
import { SearchIndexService } from './search-index-service'
import { searchLogger } from './search-logger'
import { Sorter } from './sort/sorter'
import { tuffSorter } from './sort/tuff-sorter'
import { TimeStatsAggregator } from './time-stats-aggregator'
import { UsageSummaryService } from './usage-summary-service'
import { IndexedSourceEventRouter } from './indexed-source-event-router'
import { SearchProviderRegistry } from './search-provider-registry'
import { SearchQueryOrchestrator } from './search-query-orchestrator'
import { ProviderHealthService } from './provider-health-service'
import { SearchUsageService } from './search-usage-service'
import {
  buildProviderSummary,
  buildProviderTelemetry,
  buildSearchCacheKey,
  roundDuration,
  resolveProviderCategory,
  resolveSearchScene,
  toQueryHash
} from './search-core-utils'
import type { SearchTraceSourceStat } from './search-core-utils'

interface SearchCacheEntry {
  result: TuffSearchResult
  timestamp: number
}

const SEARCH_CACHE_TTL_MS = 5_000
const SEARCH_CACHE_MAX_SIZE = 100
const SEARCH_FRONTEND_ITEM_LIMIT = 80
const SEARCH_TRACE_SCHEMA = 'search-trace/v1'
const SEARCH_TRACE_SLOW_THRESHOLD_MS = 800

const searchEngineLog = getLogger('search-engine')
const resolveKeyManager = (channel: { keyManager?: unknown }): unknown =>
  channel.keyManager ?? channel
const SEARCH_MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000
const SEARCH_MAINTENANCE_JITTER_MS = 10 * 60 * 1000

function hasConcreteActivationFeature(activation: IProviderActivate): boolean {
  const meta = activation.meta
  return Boolean(meta && typeof meta === 'object' && 'feature' in meta && meta.feature)
}

interface SearchPipelineStageDurations {
  parseDuration: number
  providerAggregationDuration: number
  mergeRankDuration: number
}

interface QueryOrchestrationResult {
  providerFilter?: string
  cacheKey: string
  providerConfigSignature: string
}

interface SearchFirstResultMetrics {
  firstResultMs: number
  firstResultCount: number
  sortingDuration: number
  usageStatsDuration?: number
  completionDuration?: number
  stageDurations: SearchPipelineStageDurations
}

export class SearchEngineCore
  implements ISearchEngine<ProviderContext>, TalexTouch.IModule<TalexEvents>
{
  private static _instance: SearchEngineCore

  readonly name = Symbol('search-engine-core')

  private sorter: Sorter
  private readonly providerRegistry: SearchProviderRegistry
  private readonly indexedSourceEventRouter: IndexedSourceEventRouter
  private readonly queryOrchestrator: SearchQueryOrchestrator
  private readonly searchUsageService: SearchUsageService
  private currentGatherController: IGatherController | null = null
  private dbUtils: DbUtils | null = null
  private searchIndexService: SearchIndexService | null = null
  private usageSummaryService: UsageSummaryService | null = null
  private queryCompletionService: QueryCompletionService | null = null
  private recommendationEngine: RecommendationEngine | null = null
  private timeStatsAggregator: TimeStatsAggregator | null = null
  private indexingRuntime: IndexingRuntime | null = null
  private latestSessionId: string | null = null // 跟踪最新的搜索 session，防止竞态条件
  private searchSessionStartTimes = new Map<string, number>()
  private readonly pollingService = PollingService.getInstance()
  private readonly maintenanceTaskId = 'search-engine.maintenance'
  private readonly providerHealthService = new ProviderHealthService()
  private searchCache = new Map<string, SearchCacheEntry>()
  private searchFirstResultMetrics = new Map<string, SearchFirstResultMetrics>()

  private touchApp: TouchApp | null = null
  private transport: ReturnType<typeof getTuffTransportMain> | null = null
  private lastSearchQuery: string = '' // 记录最后一次搜索的查询，用于完成跟踪
  private startupServicesStarted = false

  private cacheSearchResult(
    query: TuffQuery,
    providerFilter: string | undefined,
    result: TuffSearchResult,
    providerConfigSignature = this.getSearchProviderConfigSignature()
  ): void {
    const cacheKey = buildSearchCacheKey(
      query,
      providerFilter,
      this.providerRegistry.getActivationMap(),
      { providerConfigSignature }
    )

    // Evict oldest entries if cache is full
    if (this.searchCache.size >= SEARCH_CACHE_MAX_SIZE) {
      let oldestKey: string | null = null
      let oldestTime = Infinity
      for (const [key, entry] of this.searchCache) {
        if (entry.timestamp < oldestTime) {
          oldestTime = entry.timestamp
          oldestKey = key
        }
      }
      if (oldestKey) this.searchCache.delete(oldestKey)
    }

    this.searchCache.set(cacheKey, { result, timestamp: Date.now() })
  }

  private limitFrontendItems(items: TuffItem[]): TuffItem[] {
    return items.length > SEARCH_FRONTEND_ITEM_LIMIT
      ? items.slice(0, SEARCH_FRONTEND_ITEM_LIMIT)
      : items
  }

  private getSearchProviderConfigSignature(): string {
    return this.providerRegistry.getConfigSignature()
  }
  constructor() {
    if (SearchEngineCore._instance) {
      throw new Error('[SearchEngineCore] Singleton class cannot be instantiated more than once.')
    }

    SearchEngineCore._instance = this
    this.sorter = new Sorter()
    this.providerRegistry = new SearchProviderRegistry({
      getTouchApp: () => this.touchApp,
      getSearchIndexService: () => this.searchIndexService,
      onProvidersReady: () => this.startRuntimeServicesOnce(),
      onProviderDeactivated: (key, isPluginFeature, allDeactivated) => {
        touchEventBus.emit(
          TalexEvents.PROVIDER_DEACTIVATED,
          new ProviderDeactivatedEvent(key, isPluginFeature, allDeactivated)
        )
      }
    })
    this.indexedSourceEventRouter = new IndexedSourceEventRouter(() => this.indexingRuntime)
    this.queryOrchestrator = new SearchQueryOrchestrator({
      getProviderConfigSignature: () => this.getSearchProviderConfigSignature(),
      getActivations: () => this.providerRegistry.getActivationMap(),
      shouldSkipProvider: (providerId) => this.shouldSkipProvider(providerId)
    })
    this.searchUsageService = new SearchUsageService({
      getDbUtils: () => this.dbUtils
    })
  }

  private getTransport(): ReturnType<typeof getTuffTransportMain> {
    if (!this.touchApp) {
      throw new Error('[SearchEngineCore] TouchApp not initialized')
    }
    if (!this.transport) {
      const channel = this.touchApp.channel
      const keyManager = resolveKeyManager(channel as { keyManager?: unknown })
      this.transport = getTuffTransportMain(channel, keyManager)
    }
    return this.transport
  }

  private registerDefaults(): void {
    this.sorter.register(tuffSorter)

    this.registerProvider(mainWindowProvider)
    this.registerProvider(systemActionsProvider)
    this.registerProvider(appProvider)

    // Native providers provide fast first-frame candidates; file-provider remains the index/enrichment layer.
    if (process.platform === 'win32') {
      this.registerProvider(windowsShellFileProvider)
      this.registerProvider(everythingProvider)
    } else if (process.platform === 'darwin') {
      this.registerProvider(macSpotlightFileProvider)
    } else if (process.platform === 'linux') {
      this.registerProvider(linuxNativeFileProvider)
    }
    this.registerProvider(fileProvider)

    this.registerProvider(PluginFeaturesAdapter)
    this.registerProvider(previewProvider)
  }

  private startRuntimeServicesOnce(): void {
    if (this.startupServicesStarted) return
    this.startupServicesStarted = true
    this.usageSummaryService?.start()
    this.startMaintenance()
  }

  static getInstance(): SearchEngineCore {
    if (!this._instance) this._instance = new SearchEngineCore()
    return this._instance
  }

  /** Expose RecommendationEngine for plugin SDK integration */
  public getRecommendationEngine(): RecommendationEngine | null {
    return this.recommendationEngine
  }

  registerProvider(provider: ISearchProvider<ProviderContext>): void {
    this.providerRegistry.register(provider)
  }

  unregisterProvider(providerId: string): void {
    this.providerRegistry.unregister(providerId)
  }

  activateProviders(activations: IProviderActivate[] | null): void {
    this.providerRegistry.activate(activations)
  }

  deactivateProvider(uniqueKey: string): void {
    this.providerRegistry.deactivate(uniqueKey)
  }

  deactivateProviders(): void {
    this.providerRegistry.deactivateAll()
  }

  getActiveProviders(): ISearchProvider<ProviderContext>[] {
    return this.providerRegistry.getActive()
  }

  public getActivationState(): IProviderActivate[] | null {
    return this.providerRegistry.getActivationState()
  }

  public getProvidersByIds(ids: string[]): ISearchProvider<ProviderContext>[] {
    return this.providerRegistry.getByIds(ids)
  }
  private logSearchTrace(params: {
    event:
      | 'ipc.query.received'
      | 'session.start'
      | 'first.result'
      | 'session.end'
      | 'session.cancel'
      | 'session.error'
    sessionId: string
    query: TuffQuery
    timings?: Partial<{
      parseMs: number
      providerSelectMs: number
      mergeRankMs: number
      totalMs: number
    }>
    result?: Partial<{ firstCount: number; totalCount: number }>
    sourceStats?: SearchTraceSourceStat[]
    includeDetails?: boolean
    cancelled?: boolean
    providerFilter?: string
    error?: unknown
  }): void {
    if (!searchLogger.isEnabled()) return

    const queryText = params.query.text || ''
    const inputTypes = (params.query.inputs ?? []).map((input) => String(input.type))
    const providerSummary = buildProviderSummary(params.sourceStats ?? [])
    const dbQueue = dbWriteScheduler.getStats()
    const loopLag = perfMonitor.getRecentEventLoopLagSnapshot()
    const appTaskSnapshot = appTaskGate.getSnapshot()

    const payload: Record<string, unknown> = {
      schema: SEARCH_TRACE_SCHEMA,
      event: params.event,
      sessionId: params.sessionId,
      ts: Date.now(),
      query: {
        len: queryText.length,
        hash: toQueryHash(queryText)
      },
      inputCount: (params.query.inputs ?? []).length,
      inputTypes,
      timing: {
        parseMs: roundDuration(params.timings?.parseMs),
        providerSelectMs: roundDuration(params.timings?.providerSelectMs),
        mergeRankMs: roundDuration(params.timings?.mergeRankMs),
        totalMs: roundDuration(params.timings?.totalMs)
      },
      result: {
        firstCount: params.result?.firstCount,
        totalCount: params.result?.totalCount
      },
      providers: {
        summary: params.includeDetails
          ? providerSummary
          : { total: providerSummary.total, byStatus: providerSummary.byStatus }
      },
      contention: {
        dbQueue: {
          queued: dbQueue.queued,
          processing: dbQueue.processing,
          currentTaskLabel: dbQueue.currentTaskLabel ?? undefined
        },
        loopLag:
          loopLag === null
            ? null
            : {
                lagMs: loopLag.lagMs,
                severity: loopLag.severity,
                at: loopLag.at
              },
        appTaskGate: appTaskSnapshot
      },
      cancelled: params.cancelled === true ? true : undefined,
      providerFilter: params.providerFilter ?? undefined
    }

    if (params.error) {
      payload.error =
        params.error instanceof Error ? params.error.message : String(params.error ?? 'unknown')
    }

    try {
      searchEngineLog.info(`[${SEARCH_TRACE_SCHEMA}] ${JSON.stringify(payload)}`)
    } catch (error) {
      searchEngineLog.warn('Failed to serialize search trace payload', {
        meta: { event: params.event, sessionId: params.sessionId, error: String(error) }
      })
    }
  }

  private _updateActivationState(newResults: TuffSearchResult[]): void {
    this.providerRegistry.mergeActivations(newResults)
  }

  public getCurrentGatherController(): IGatherController | null {
    return this.currentGatherController
  }

  public cancelSearch(searchId: string): void {
    if (this.currentGatherController) {
      if (searchLogger.isEnabled()) {
        searchLogger.logSearchPhase('Cancel Search', `Cancelling search with ID: ${searchId}`)
      }
      this.logSearchTrace({
        event: 'session.cancel',
        sessionId: searchId,
        query: { text: this.lastSearchQuery, inputs: [] },
        cancelled: true,
        includeDetails: true
      })
      this.currentGatherController.abort()
      this.currentGatherController = null

      // 清理 latestSessionId，允许新搜索
      if (this.latestSessionId === searchId) {
        this.latestSessionId = null
      }
    }
  }

  private async orchestrateSearchQuery(
    query: TuffQuery
  ): Promise<QueryOrchestrationResult & { durationMs: number }> {
    return await this.queryOrchestrator.orchestrate(query)
  }

  private aggregateProvidersForQuery(
    providers: ISearchProvider<ProviderContext>[],
    query: TuffQuery,
    options: { providerFilter?: string }
  ): { providers: ISearchProvider<ProviderContext>[]; durationMs: number } {
    return this.queryOrchestrator.aggregate(providers, query, options)
  }

  private appendCompatibilityNotice(
    items: TuffItem[],
    query: TuffQuery,
    providerFilter?: string
  ): TuffItem[] {
    return this.queryOrchestrator.appendCompatibilityNotice(items, query, providerFilter)
  }

  private async mergeAndRankItems({
    sessionId,
    query,
    items,
    signal,
    includeCompletion,
    enrichmentMode = 'full'
  }: {
    sessionId: string
    query: TuffQuery
    items: TuffItem[]
    signal: AbortSignal
    includeCompletion: boolean
    enrichmentMode?: 'base' | 'full'
  }): Promise<{
    sortedItems: TuffItem[]
    sortingDuration: number
    usageStatsDuration: number
    completionDuration: number
    mergeRankDuration: number
  }> {
    const startedAt = performance.now()
    const mergeRankContext = enterPerfContext('Search.pipeline.merge-rank', {
      sessionId,
      itemCount: items.length,
      includeCompletion,
      enrichmentMode
    })

    try {
      let usageStatsDuration = 0
      let completionDuration = 0

      if (enrichmentMode === 'full' && includeCompletion) {
        const usageStatsStartedAt = performance.now()
        const usageStatsContext = enterPerfContext('Search.usageStats', {
          sessionId,
          itemCount: items.length
        })
        const usageStatsPromise = this._injectUsageStats(items).finally(() => {
          usageStatsDuration = performance.now() - usageStatsStartedAt
          usageStatsContext()
        })

        const pinnedContext = enterPerfContext('Search.pinned', {
          sessionId,
          itemCount: items.length
        })
        const pinnedPromise = this._injectPinnedState(items).finally(() => {
          pinnedContext()
        })

        let completionPromise: Promise<void> = Promise.resolve()
        if (this.queryCompletionService) {
          const completionStartedAt = performance.now()
          const completionContext = enterPerfContext('Search.completion', {
            sessionId,
            queryLength: (query.text || '').length
          })
          completionPromise = this.queryCompletionService
            .injectCompletionWeights(query.text || '', items)
            .finally(() => {
              completionDuration = performance.now() - completionStartedAt
              completionContext()
            })
        }

        await Promise.all([usageStatsPromise, pinnedPromise, completionPromise])
      } else if (enrichmentMode === 'full') {
        const usageStatsStartedAt = performance.now()
        const usageStatsContext = enterPerfContext('Search.usageStats', {
          sessionId,
          itemCount: items.length
        })
        await this._injectUsageStats(items)
        usageStatsDuration = performance.now() - usageStatsStartedAt
        usageStatsContext()

        const pinnedContext = enterPerfContext('Search.pinned', {
          sessionId,
          itemCount: items.length
        })
        await this._injectPinnedState(items)
        pinnedContext()
      }

      const sortingContext = enterPerfContext(
        'Search.sort',
        {
          sessionId,
          itemCount: items.length,
          enrichmentMode
        },
        { mode: 'blocking' }
      )
      const sortingStartedAt = performance.now()
      let sortedItems: TuffItem[] = []
      try {
        ;({ sortedItems } = this.sorter.sort(items, query, signal))
      } finally {
        sortingContext()
      }
      const sortingDuration = performance.now() - sortingStartedAt

      return {
        sortedItems,
        sortingDuration,
        usageStatsDuration,
        completionDuration,
        mergeRankDuration: performance.now() - startedAt
      }
    } finally {
      mergeRankContext()
    }
  }

  private enrichAndPushSearchItems(
    sessionId: string,
    query: TuffQuery,
    items: TuffItem[],
    signal: AbortSignal,
    sendUpdateToFrontend: (itemsToSend: TuffItem[]) => void
  ): void {
    if (items.length === 0 || signal.aborted) {
      return
    }

    void this.mergeAndRankItems({
      sessionId,
      query,
      items,
      signal,
      includeCompletion: true,
      enrichmentMode: 'full'
    })
      .then(({ sortedItems }) => {
        if (signal.aborted || this.latestSessionId !== sessionId) {
          return
        }
        sendUpdateToFrontend(sortedItems)
      })
      .catch((error) => {
        searchEngineLog.debug('Search enrichment skipped', {
          error,
          meta: { sessionId, itemCount: items.length }
        })
      })
  }

  async search(query: TuffQuery): Promise<TuffSearchResult> {
    markSearchActivity()
    const pipelineDurations: SearchPipelineStageDurations = {
      parseDuration: 0,
      providerAggregationDuration: 0,
      mergeRankDuration: 0
    }
    const { providerFilter, cacheKey, durationMs, providerConfigSignature } =
      await this.orchestrateSearchQuery(query)
    pipelineDurations.parseDuration = durationMs

    const cachedEntry = this.searchCache.get(cacheKey)
    if (cachedEntry && Date.now() - cachedEntry.timestamp < SEARCH_CACHE_TTL_MS) {
      const cacheSessionId = cachedEntry.result.sessionId || crypto.randomUUID()
      const cachedItems = cachedEntry.result.items?.length ?? 0
      this.logSearchTrace({
        event: 'ipc.query.received',
        sessionId: cacheSessionId,
        query,
        timings: {
          parseMs: pipelineDurations.parseDuration,
          totalMs: pipelineDurations.parseDuration
        }
      })
      this.logSearchTrace({
        event: 'session.start',
        sessionId: cacheSessionId,
        query,
        timings: {
          parseMs: pipelineDurations.parseDuration,
          totalMs: pipelineDurations.parseDuration
        }
      })
      this.logSearchTrace({
        event: 'first.result',
        sessionId: cacheSessionId,
        query,
        timings: {
          parseMs: pipelineDurations.parseDuration,
          totalMs: pipelineDurations.parseDuration
        },
        result: { firstCount: cachedItems, totalCount: cachedItems }
      })
      this.logSearchTrace({
        event: 'session.end',
        sessionId: cacheSessionId,
        query,
        timings: {
          parseMs: pipelineDurations.parseDuration,
          totalMs: pipelineDurations.parseDuration
        },
        result: { firstCount: cachedItems, totalCount: cachedItems },
        sourceStats: (cachedEntry.result.sources as SearchTraceSourceStat[] | undefined) ?? [],
        providerFilter,
        includeDetails: false
      })
      searchEngineLog.debug(
        `Cache hit for query len=${query.text?.length ?? 0}, hash=${toQueryHash(query.text || '')}`
      )
      return cachedEntry.result
    }

    const sessionId = crypto.randomUUID()
    this.searchSessionStartTimes.set(sessionId, Date.now())
    if (this.searchSessionStartTimes.size > 200) {
      const oldest = this.searchSessionStartTimes.keys().next().value
      if (oldest) this.searchSessionStartTimes.delete(oldest)
    }
    searchLogger.searchSessionStart(query.text, sessionId)
    searchLogger.logSearchPhase(
      'Query Received',
      `len=${query.text?.length ?? 0}, hash=${toQueryHash(query.text || '')}, inputs=${query.inputs?.length || 0}`
    )
    this.logSearchTrace({
      event: 'ipc.query.received',
      sessionId,
      query,
      timings: { parseMs: pipelineDurations.parseDuration }
    })
    this.logSearchTrace({
      event: 'session.start',
      sessionId,
      query,
      timings: { parseMs: pipelineDurations.parseDuration }
    })

    this.currentGatherController?.abort()

    this.latestSessionId = sessionId
    searchEngineLog.debug(`Starting search session ${sessionId}`)
    const startTime = Date.now()

    // Empty query detection: return recommendations
    if ((!query.text || query.text === '') && (!query.inputs || query.inputs.length === 0)) {
      searchEngineLog.debug('Empty query detected, generating recommendations')

      if (this.recommendationEngine) {
        try {
          const recommendationResult = await this.recommendationEngine.recommend({ limit: 10 })

          searchLogger.logSearchPhase(
            'Recommendation',
            `Generated ${recommendationResult.items.length} recommendations in ${recommendationResult.duration.toFixed(2)}ms`
          )

          if (this.latestSessionId !== sessionId) {
            searchEngineLog.debug(
              `Discarding stale recommendation result ${sessionId} (latest: ${this.latestSessionId})`
            )
            const staleResult = new TuffSearchResultBuilder(query)
              .setItems([])
              .setDuration(0)
              .setSources([])
              .build()
            staleResult.sessionId = sessionId
            this.logSearchTrace({
              event: 'session.end',
              sessionId,
              query,
              timings: { parseMs: pipelineDurations.parseDuration, totalMs: 0 },
              result: { firstCount: 0, totalCount: 0 },
              includeDetails: false
            })
            return staleResult
          }

          const result = new TuffSearchResultBuilder(query)
            .setItems(recommendationResult.items)
            .setDuration(recommendationResult.duration)
            .setSources([])
            .build()

          result.sessionId = sessionId
          result.containerLayout = recommendationResult.containerLayout

          // If no recommendations, notify CoreBox to shrink
          if (recommendationResult.items.length === 0) {
            const coreBoxWindow = windowManager.current?.window
            if (coreBoxWindow && !coreBoxWindow.isDestroyed()) {
              const transport = this.getTransport()
              void transport
                .sendToWindow(coreBoxWindow.id, CoreBoxEvents.search.noResults, {
                  shouldShrink: true
                })
                .catch(() => {})
            }
          }

          const totalDuration = Date.now() - startTime
          const detail = totalDuration >= SEARCH_TRACE_SLOW_THRESHOLD_MS
          this.logSearchTrace({
            event: 'first.result',
            sessionId,
            query,
            timings: {
              parseMs: pipelineDurations.parseDuration,
              totalMs: totalDuration
            },
            result: {
              firstCount: recommendationResult.items.length,
              totalCount: recommendationResult.items.length
            }
          })
          this.logSearchTrace({
            event: 'session.end',
            sessionId,
            query,
            timings: {
              parseMs: pipelineDurations.parseDuration,
              totalMs: totalDuration
            },
            result: {
              firstCount: recommendationResult.items.length,
              totalCount: recommendationResult.items.length
            },
            includeDetails: detail
          })
          return result
        } catch (error) {
          searchEngineLog.error('Failed to generate recommendations', { error })
          this.logSearchTrace({
            event: 'session.error',
            sessionId,
            query,
            timings: {
              parseMs: pipelineDurations.parseDuration,
              totalMs: Date.now() - startTime
            },
            includeDetails: true,
            error
          })

          // fallback to empty result
          const fallbackResult = new TuffSearchResultBuilder(query)
            .setItems([])
            .setDuration(0)
            .setSources([])
            .build()
          fallbackResult.sessionId = sessionId
          return fallbackResult
        }
      } else {
        const emptyResult = new TuffSearchResultBuilder(query)
          .setItems([])
          .setDuration(0)
          .setSources([])
          .build()
        emptyResult.sessionId = sessionId
        this.logSearchTrace({
          event: 'session.end',
          sessionId,
          query,
          timings: { parseMs: pipelineDurations.parseDuration, totalMs: Date.now() - startTime },
          result: { firstCount: 0, totalCount: 0 },
          includeDetails: false
        })
        return emptyResult
      }
    }

    this.lastSearchQuery = query.text || ''
    this._recordSearchUsage(sessionId, query)

    return new Promise((resolve) => {
      let isFirstUpdate = true
      let didResolveInitial = false
      let providersToSearch = this.getActiveProviders()
      let gatherController: IGatherController | null = null

      const finalizeWithError = (error: unknown): void => {
        searchEngineLog.error('Search gather pipeline failed', {
          error,
          meta: {
            sessionId,
            queryLen: query.text?.length ?? 0,
            queryHash: toQueryHash(query.text || '')
          }
        })

        try {
          gatherController?.abort()
        } catch {
          // ignore
        }

        const totalDuration = Date.now() - startTime
        this.logSearchTrace({
          event: 'session.error',
          sessionId,
          query,
          timings: {
            parseMs: pipelineDurations.parseDuration,
            providerSelectMs: pipelineDurations.providerAggregationDuration,
            mergeRankMs: pipelineDurations.mergeRankDuration,
            totalMs: totalDuration
          },
          includeDetails: true,
          providerFilter,
          error
        })
        const failedResult = new TuffSearchResultBuilder(query)
          .setItems([])
          .setDuration(totalDuration)
          .setSources([])
          .build()
        failedResult.sessionId = sessionId
        failedResult.activate = this.getActivationState() ?? undefined

        if (!didResolveInitial) {
          didResolveInitial = true
          resolve(failedResult)
        }

        this.currentGatherController = null
        const coreBoxWindow = windowManager.current?.window
        if (coreBoxWindow) {
          const finalActivationState = this.getActivationState() ?? undefined
          const transport = this.getTransport()
          void transport
            .sendToWindow(coreBoxWindow.id, CoreBoxEvents.search.end, {
              searchId: sessionId,
              activate: finalActivationState,
              sources: []
            })
            .catch(() => {})
        }
      }

      const providerAggregation = this.aggregateProvidersForQuery(providersToSearch, query, {
        providerFilter
      })
      providersToSearch = providerAggregation.providers
      pipelineDurations.providerAggregationDuration = providerAggregation.durationMs

      searchLogger.searchProviders(providersToSearch.map((p) => p.id))

      const sendUpdateToFrontend = (itemsToSend: TuffItem[]): void => {
        if (gatherController?.signal.aborted || this.latestSessionId !== sessionId) {
          return
        }

        const coreBoxWindow = windowManager.current?.window
        if (coreBoxWindow && !coreBoxWindow.isDestroyed()) {
          const frontendItems = this.limitFrontendItems(itemsToSend)
          if (frontendItems.length === 0) return

          const transport = this.getTransport()
          void transport
            .sendToWindow(coreBoxWindow.id, CoreBoxEvents.search.update, {
              items: frontendItems,
              searchId: sessionId
            })
            .catch(() => {})
        }
      }

      searchLogger.logSearchPhase('Initialization', 'Setting up search aggregator')

      gatherController = gatherAggregator(providersToSearch, query, async (update) => {
        try {
          searchLogger.searchUpdate(update.isDone, update.newResults.length)
          if (update.isDone && update.cancelled) {
            this.updateProviderHealth(update.sourceStats || [])
            const totalDuration = Date.now() - startTime

            if (!didResolveInitial) {
              didResolveInitial = true
              isFirstUpdate = false
              const cancelledResult = new TuffSearchResultBuilder(query)
                .setItems([])
                .setDuration(totalDuration)
                .setSources(update.sourceStats || [])
                .build()
              cancelledResult.sessionId = sessionId
              cancelledResult.activate = this.getActivationState() ?? undefined
              resolve(cancelledResult)
            }

            searchLogger.searchSessionEnd(sessionId, update.totalCount)
            this.searchFirstResultMetrics.delete(sessionId)
            this.logSearchTrace({
              event: 'session.end',
              sessionId,
              query,
              timings: {
                parseMs: pipelineDurations.parseDuration,
                providerSelectMs: pipelineDurations.providerAggregationDuration,
                mergeRankMs: pipelineDurations.mergeRankDuration,
                totalMs: totalDuration
              },
              result: { totalCount: update.totalCount },
              sourceStats: (update.sourceStats ?? []) as SearchTraceSourceStat[],
              providerFilter,
              cancelled: true,
              includeDetails: totalDuration >= SEARCH_TRACE_SLOW_THRESHOLD_MS
            })

            const coreBoxWindow = windowManager.current?.window
            if (coreBoxWindow && !coreBoxWindow.isDestroyed()) {
              const transport = this.getTransport()
              await transport
                .sendToWindow(coreBoxWindow.id, CoreBoxEvents.search.end, {
                  searchId: sessionId,
                  cancelled: true,
                  activate: this.getActivationState() ?? undefined,
                  sources: update.sourceStats ?? []
                })
                .catch(() => {})
            }
            searchLogger.logSearchPhase(
              'Search End',
              `Cancelled with activation state: ${JSON.stringify(this.getActivationState())}`
            )
            return
          }

          if (update.isDone) {
            this.updateProviderHealth(update.sourceStats || [])
            if (!didResolveInitial) {
              didResolveInitial = true

              if (isFirstUpdate) {
                isFirstUpdate = false
                const initialItems = update.newResults.flatMap((res) => res.items)

                const {
                  sortedItems: rawSortedItems,
                  sortingDuration,
                  usageStatsDuration,
                  completionDuration,
                  mergeRankDuration
                } = await this.mergeAndRankItems({
                  sessionId,
                  query,
                  items: initialItems,
                  signal: gatherController!.signal,
                  includeCompletion: false,
                  enrichmentMode: 'base'
                })
                pipelineDurations.mergeRankDuration = mergeRankDuration
                const sortedItems = this.appendCompatibilityNotice(
                  rawSortedItems,
                  query,
                  providerFilter
                )

                this._updateActivationState(update.newResults)

                const totalDuration = Date.now() - startTime
                const frontendItems = this.limitFrontendItems(sortedItems)
                const initialResult = new TuffSearchResultBuilder(query)
                  .setItems(frontendItems)
                  .setDuration(totalDuration)
                  .setSources(update.sourceStats || [])
                  .build()
                initialResult.sessionId = sessionId
                initialResult.activate = this.getActivationState() ?? undefined

                this.searchFirstResultMetrics.set(sessionId, {
                  firstResultMs: totalDuration,
                  firstResultCount: sortedItems.length,
                  sortingDuration,
                  usageStatsDuration,
                  completionDuration,
                  stageDurations: { ...pipelineDurations }
                })

                this._recordSearchResults(sessionId, sortedItems).catch((error) => {
                  searchEngineLog.error('Failed to record search results', { error })
                })
                this.enrichAndPushSearchItems(
                  sessionId,
                  query,
                  sortedItems,
                  gatherController!.signal,
                  sendUpdateToFrontend
                )
                this.logSearchTrace({
                  event: 'first.result',
                  sessionId,
                  query,
                  timings: {
                    parseMs: pipelineDurations.parseDuration,
                    providerSelectMs: pipelineDurations.providerAggregationDuration,
                    mergeRankMs: pipelineDurations.mergeRankDuration,
                    totalMs: totalDuration
                  },
                  result: { firstCount: sortedItems.length, totalCount: sortedItems.length },
                  sourceStats: (update.sourceStats ?? []) as SearchTraceSourceStat[],
                  providerFilter
                })

                if (this.latestSessionId !== sessionId) {
                  const staleResult = new TuffSearchResultBuilder(query)
                    .setItems([])
                    .setDuration(0)
                    .setSources([])
                    .build()
                  staleResult.sessionId = sessionId
                  resolve(staleResult)
                } else {
                  this.cacheSearchResult(
                    query,
                    providerFilter,
                    initialResult,
                    providerConfigSignature
                  )
                  resolve(initialResult)
                }
              } else {
                const totalDuration = Date.now() - startTime
                const resolvedResult = new TuffSearchResultBuilder(query)
                  .setItems([])
                  .setDuration(totalDuration)
                  .setSources(update.sourceStats || [])
                  .build()
                resolvedResult.sessionId = sessionId
                resolvedResult.activate = this.getActivationState() ?? undefined
                resolve(resolvedResult)
              }
            }

            // Handle final state and notify frontend
            const totalResults =
              typeof update.totalCount === 'number'
                ? update.totalCount
                : update.newResults.reduce((acc, res) => acc + res.items.length, 0)
            searchLogger.searchSessionEnd(sessionId, totalResults)
            const totalDuration = Date.now() - startTime
            const firstResultMetrics = this.searchFirstResultMetrics.get(sessionId)
            this.searchFirstResultMetrics.delete(sessionId)
            if (firstResultMetrics) {
              this._recordSearchMetrics({
                sessionId,
                query,
                totalDuration,
                firstResultMs: firstResultMetrics.firstResultMs,
                firstResultCount: firstResultMetrics.firstResultCount,
                sortingDuration: firstResultMetrics.sortingDuration,
                usageStatsDuration: firstResultMetrics.usageStatsDuration,
                completionDuration: firstResultMetrics.completionDuration,
                stageDurations: firstResultMetrics.stageDurations,
                sourceStats: update.sourceStats || [],
                resultCount: totalResults,
                providerFilter
              })
            }
            this.logSearchTrace({
              event: 'session.end',
              sessionId,
              query,
              timings: {
                parseMs: pipelineDurations.parseDuration,
                providerSelectMs: pipelineDurations.providerAggregationDuration,
                mergeRankMs: pipelineDurations.mergeRankDuration,
                totalMs: totalDuration
              },
              result: { totalCount: totalResults },
              sourceStats: (update.sourceStats ?? []) as SearchTraceSourceStat[],
              providerFilter,
              includeDetails: totalDuration >= SEARCH_TRACE_SLOW_THRESHOLD_MS
            })
            this.currentGatherController = null
            this._updateActivationState(update.newResults)
            const coreBoxWindow = windowManager.current?.window
            if (coreBoxWindow) {
              const finalActivationState = this.getActivationState() ?? undefined
              const transport = this.getTransport()
              await transport
                .sendToWindow(coreBoxWindow.id, CoreBoxEvents.search.end, {
                  searchId: sessionId,
                  activate: finalActivationState,
                  sources: update.sourceStats
                })
                .catch(() => {})
            }
            searchLogger.logSearchPhase(
              'Search End',
              `Final activation state: ${JSON.stringify(this.getActivationState())}`
            )
            return
          }

          if (isFirstUpdate) {
            isFirstUpdate = false
            const initialItems = update.newResults.flatMap((res) => res.items)

            const {
              sortedItems: rawSortedItems,
              sortingDuration,
              usageStatsDuration,
              completionDuration,
              mergeRankDuration
            } = await this.mergeAndRankItems({
              sessionId,
              query,
              items: initialItems,
              signal: gatherController!.signal,
              includeCompletion: false,
              enrichmentMode: 'base'
            })
            if (gatherController!.signal.aborted || this.latestSessionId !== sessionId) {
              return
            }
            pipelineDurations.mergeRankDuration = mergeRankDuration
            const sortedItems = this.appendCompatibilityNotice(
              rawSortedItems,
              query,
              providerFilter
            )

            this._updateActivationState(update.newResults)

            const totalDuration = Date.now() - startTime
            const frontendItems = this.limitFrontendItems(sortedItems)
            const initialResult = new TuffSearchResultBuilder(query)
              .setItems(frontendItems)
              .setDuration(totalDuration)
              .setSources(update.sourceStats || [])
              .build()
            initialResult.sessionId = sessionId
            initialResult.activate = this.getActivationState() ?? undefined

            this.searchFirstResultMetrics.set(sessionId, {
              firstResultMs: totalDuration,
              firstResultCount: sortedItems.length,
              sortingDuration,
              usageStatsDuration,
              completionDuration,
              stageDurations: { ...pipelineDurations }
            })

            // 异步记录搜索结果统计（不阻塞返回）
            this._recordSearchResults(sessionId, sortedItems).catch((error) => {
              searchEngineLog.error('Failed to record search results', { error })
            })
            this.enrichAndPushSearchItems(
              sessionId,
              query,
              sortedItems,
              gatherController!.signal,
              sendUpdateToFrontend
            )
            this.logSearchTrace({
              event: 'first.result',
              sessionId,
              query,
              timings: {
                parseMs: pipelineDurations.parseDuration,
                providerSelectMs: pipelineDurations.providerAggregationDuration,
                mergeRankMs: pipelineDurations.mergeRankDuration,
                totalMs: totalDuration
              },
              result: { firstCount: sortedItems.length, totalCount: sortedItems.length },
              sourceStats: (update.sourceStats ?? []) as SearchTraceSourceStat[],
              providerFilter
            })

            // 在返回前检查是否仍是最新搜索
            if (this.latestSessionId !== sessionId) {
              searchEngineLog.debug(
                `Discarding stale search result ${sessionId} (latest: ${this.latestSessionId})`
              )
              // 返回空结果，前端会忽略旧的 sessionId
              const staleResult = new TuffSearchResultBuilder(query)
                .setItems([])
                .setDuration(0)
                .setSources([])
                .build()
              staleResult.sessionId = sessionId
              resolve(staleResult)
              return
            }

            this.cacheSearchResult(query, providerFilter, initialResult, providerConfigSignature)
            resolve(initialResult)
            didResolveInitial = true
          } else if (update.newResults.length > 0) {
            // This is a subsequent update
            const subsequentItems = update.newResults.flatMap((res) => res.items)

            const { sortedItems } = await this.mergeAndRankItems({
              sessionId,
              query,
              items: subsequentItems,
              signal: gatherController!.signal,
              includeCompletion: false,
              enrichmentMode: 'base'
            })
            if (gatherController!.signal.aborted || this.latestSessionId !== sessionId) {
              return
            }
            this._updateActivationState(update.newResults)
            sendUpdateToFrontend(sortedItems)
            this.enrichAndPushSearchItems(
              sessionId,
              query,
              sortedItems,
              gatherController!.signal,
              sendUpdateToFrontend
            )
          }
        } catch (error) {
          finalizeWithError(error)
        }
      })

      this.currentGatherController = gatherController
    })
  }

  private _getItemId(item: TuffItem): string {
    if (!item.id) {
      searchEngineLog.error('Item is missing a required `id` for usage tracking.', { error: item })
      throw new Error('Item is missing a required `id` for usage tracking.')
    }
    return item.id
  }

  private async _recordSearchUsage(sessionId: string, query: TuffQuery): Promise<void> {
    await this.searchUsageService.recordSearch(sessionId, query)
  }

  private async _injectUsageStats(items: TuffItem[]): Promise<void> {
    await this.searchUsageService.injectUsageStats(items)
  }

  private async _injectPinnedState(items: TuffItem[]): Promise<void> {
    await this.searchUsageService.injectPinnedState(items)
  }

  private invalidatePinnedCache(): void {
    this.searchUsageService.invalidatePinnedCache()
  }

  private async _recordSearchResults(_sessionId: string, items: TuffItem[]): Promise<void> {
    await this.searchUsageService.recordDisplayedResults(items)
  }

  /**
   * Record search metrics for Sentry analytics
   */
  private _recordSearchMetrics({
    sessionId,
    query,
    totalDuration,
    firstResultMs,
    firstResultCount,
    sortingDuration,
    usageStatsDuration,
    completionDuration,
    stageDurations,
    sourceStats,
    resultCount,
    providerFilter
  }: {
    sessionId: string
    query: TuffQuery
    totalDuration: number
    firstResultMs?: number
    firstResultCount?: number
    sortingDuration: number
    usageStatsDuration?: number
    completionDuration?: number
    stageDurations?: SearchPipelineStageDurations
    sourceStats: SearchTraceSourceStat[]
    resultCount: number
    providerFilter?: string
  }): void {
    try {
      const sentryService = getSentryService()
      if (!sentryService.isTelemetryEnabled()) {
        return
      }

      const {
        providerTimings,
        providerResults,
        providerStatus,
        providerErrorCount,
        providerTimeoutCount
      } = buildProviderTelemetry(sourceStats)

      // Extract input types
      const inputTypes = query.inputs
        ? query.inputs.map((input) => input.type).filter(Boolean)
        : ['text']

      const queryLength = (query.text || '').length
      const queryType = query.type || 'text'
      const hasFilters = Boolean(
        query.filters?.kinds?.length || query.filters?.sources?.length || query.filters?.date_range
      )
      const filterKinds = query.filters?.kinds?.length ? query.filters.kinds : undefined
      const filterSources = query.filters?.sources?.length ? query.filters.sources : undefined
      const searchScene = resolveSearchScene(query, inputTypes)
      const resultCategories = Object.entries(providerResults).reduce<Record<string, number>>(
        (acc, [providerId, count]) => {
          const category = resolveProviderCategory(providerId)
          acc[category] = (acc[category] ?? 0) + count
          return acc
        },
        {}
      )

      if (sentryService.isEnabled()) {
        sentryService.recordSearchMetrics({
          totalDuration,
          providerTimings,
          providerResults,
          sortingDuration,
          queryText: '',
          inputTypes,
          resultCount,
          sessionId
        })
      }

      if (stageDurations) {
        searchEngineLog.debug('Search pipeline stage timings', {
          meta: {
            sessionId,
            parseDuration: Math.round(stageDurations.parseDuration),
            providerAggregationDuration: Math.round(stageDurations.providerAggregationDuration),
            mergeRankDuration: Math.round(stageDurations.mergeRankDuration)
          }
        })
      }

      // Also queue Nexus telemetry for dashboard
      try {
        sentryService.queueNexusTelemetry({
          eventType: 'search',
          searchQuery: undefined,
          searchDurationMs: Math.round(totalDuration),
          searchResultCount: resultCount,
          providerTimings,
          inputTypes,
          metadata: {
            sessionId,
            firstResultMs:
              typeof firstResultMs === 'number' ? Math.round(firstResultMs) : undefined,
            firstResultCount,
            totalDurationMs: Math.round(totalDuration),
            sortingDuration: Math.round(sortingDuration),
            usageStatsDuration: usageStatsDuration ? Math.round(usageStatsDuration) : undefined,
            completionDuration: completionDuration ? Math.round(completionDuration) : undefined,
            parseDuration: stageDurations ? Math.round(stageDurations.parseDuration) : undefined,
            providerAggregationDuration: stageDurations
              ? Math.round(stageDurations.providerAggregationDuration)
              : undefined,
            mergeRankDuration: stageDurations
              ? Math.round(stageDurations.mergeRankDuration)
              : undefined,
            queryLength,
            queryType,
            searchScene,
            hasFilters,
            filterKinds,
            filterSources,
            providerResults,
            providerStatus,
            providerErrorCount,
            providerTimeoutCount,
            resultCategories,
            providerFilter: providerFilter || undefined
          }
        })
      } catch {}
    } catch (error) {
      // Silently fail to not disrupt search flow
      searchEngineLog.debug('Failed to record search metrics for Sentry', { error })
    }
  }

  public async recordExecute(sessionId: string, item: TuffItem): Promise<void> {
    if (!this.dbUtils) {
      this.queueExecuteTelemetry(sessionId, item)
      return
    }

    const itemId = this._getItemId(item)

    try {
      await this.searchUsageService.recordExecute(sessionId, item, itemId)

      // 记录查询完成（如果有最后的搜索查询）
      if (this.lastSearchQuery && this.queryCompletionService) {
        await this.queryCompletionService.recordCompletion(this.lastSearchQuery, item)
      }

      if (searchLogger.isEnabled()) {
        searchLogger.logSearchPhase(
          'Usage Recording',
          `Recorded execute for item ${itemId} (source: ${item.source.id}) in session ${sessionId}`
        )
      }
    } catch (error) {
      searchEngineLog.error(`Failed to record execute usage for item ${itemId}`, { error })
    }

    this.queueExecuteTelemetry(sessionId, item)
  }

  private queueExecuteTelemetry(sessionId: string, item: TuffItem): void {
    try {
      const sentryService = getSentryService()
      if (!sentryService.isTelemetryEnabled()) {
        return
      }

      const startedAt = this.searchSessionStartTimes.get(sessionId)
      if (startedAt) {
        this.searchSessionStartTimes.delete(sessionId)
      }
      this.searchFirstResultMetrics.delete(sessionId)

      const meta = item.meta as Record<string, unknown> | undefined
      const metadata: Record<string, unknown> = {
        sessionId,
        action: 'execute',
        sourceType: item.source.type,
        sourceId: item.source.id,
        sourceName: item.source.name,
        sourceVersion: item.source.version,
        itemKind: item.kind
      }

      if (startedAt) {
        metadata.executeLatencyMs = Math.max(0, Math.round(Date.now() - startedAt))
      }

      const pluginName = typeof meta?.pluginName === 'string' ? meta.pluginName : undefined
      const featureId = typeof meta?.featureId === 'string' ? meta.featureId : undefined
      if (pluginName) metadata.pluginName = pluginName
      if (featureId) metadata.featureId = featureId

      const usageCategory = this.resolveTelemetryCategory(item, meta)
      metadata.usageCategoryL1 = usageCategory.level1
      metadata.usageCategoryL2 = usageCategory.level2

      sentryService.queueNexusTelemetry({
        eventType: 'feature_use',
        metadata
      })
    } catch {
      // ignore telemetry errors
    }
  }

  private resolveTelemetryCategory(
    item: TuffItem,
    meta?: Record<string, unknown>
  ): { level1: string; level2: string } {
    if (item.kind === 'app') {
      const appMeta = meta?.app as { bundleId?: string } | undefined
      const bundleId = typeof appMeta?.bundleId === 'string' ? appMeta.bundleId : ''
      const level2 = this.resolveAppUsageCategory(
        bundleId,
        item.render?.basic?.title,
        item.source.id
      )
      return { level1: 'app', level2 }
    }

    if (item.source.type === 'plugin') {
      return { level1: 'plugin', level2: 'others' }
    }

    if (item.kind === 'feature') {
      return { level1: 'feature', level2: 'others' }
    }

    const level1 =
      typeof item.source.type === 'string' && item.source.type ? item.source.type : 'others'

    return { level1, level2: 'others' }
  }

  private resolveAppUsageCategory(bundleId: string, title?: string, sourceId?: string): string {
    const fingerprint = `${bundleId}|${title || ''}|${sourceId || ''}`.toLowerCase()
    if (!fingerprint.trim()) {
      return 'others'
    }

    const rules: Array<{ category: string; keywords: string[] }> = [
      {
        category: 'developer_tools',
        keywords: [
          'code',
          'cursor',
          'codex',
          'warp',
          'iterm',
          'terminal',
          'xcode',
          'android-studio',
          'jetbrains',
          'intellij',
          'webstorm',
          'pycharm',
          'clion',
          'goland',
          'dev.',
          'devtools',
          'docker',
          'postman'
        ]
      },
      {
        category: 'browser',
        keywords: ['chrome', 'safari', 'firefox', 'edge', 'brave', 'arc', 'opera', 'browser']
      },
      {
        category: 'communication',
        keywords: [
          'chatapp',
          'qq',
          'telegram',
          'slack',
          'discord',
          'whatsapp',
          'teams',
          'zoom',
          'feishu',
          'lark',
          'im',
          'messenger'
        ]
      },
      {
        category: 'productivity',
        keywords: ['notion', 'obsidian', 'todo', 'evernote', 'calendar', 'notes', 'memo', 'notepad']
      },
      {
        category: 'media',
        keywords: [
          'music',
          'spotify',
          'netease',
          'qqmusic',
          'video',
          'vlc',
          'iina',
          'player',
          'podcast'
        ]
      },
      {
        category: 'design',
        keywords: [
          'figma',
          'sketch',
          'photoshop',
          'illustrator',
          'canva',
          'premiere',
          'finalcut',
          'affinity'
        ]
      },
      {
        category: 'system',
        keywords: [
          'activitymonitor',
          'systempreferences',
          'system settings',
          'finder',
          'explorer',
          'taskmgr'
        ]
      }
    ]

    for (const rule of rules) {
      if (rule.keywords.some((keyword) => fingerprint.includes(keyword))) {
        return rule.category
      }
    }

    return 'others'
  }

  maintain(): void {
    this.providerHealthService.prune()

    if (this.queryCompletionService) {
      void this.queryCompletionService.cleanupOldCompletions().catch((error) => {
        searchEngineLog.error('Failed to cleanup query completions', { error })
      })
    }
  }

  private startMaintenance(): void {
    if (this.pollingService.isRegistered(this.maintenanceTaskId)) {
      this.pollingService.unregister(this.maintenanceTaskId)
    }

    const initialDelayMs = 60_000 + Math.floor(Math.random() * SEARCH_MAINTENANCE_JITTER_MS)
    this.pollingService.register(
      this.maintenanceTaskId,
      () => {
        try {
          this.maintain()
        } catch (error) {
          searchEngineLog.error('SearchEngine maintenance failed', { error })
        }
      },
      { interval: SEARCH_MAINTENANCE_INTERVAL_MS, unit: 'milliseconds', initialDelayMs }
    )
    this.pollingService.start()
  }

  private stopMaintenance(): void {
    if (this.pollingService.isRegistered(this.maintenanceTaskId)) {
      this.pollingService.unregister(this.maintenanceTaskId)
    }
  }

  private shouldSkipProvider(providerId: string): boolean {
    return this.providerHealthService.shouldSkip(providerId)
  }

  private updateProviderHealth(sourceStats: SearchTraceSourceStat[]): void {
    this.providerHealthService.update(sourceStats)
  }

  init(ctx: ModuleInitContext<TalexEvents>): void {
    const instance = SearchEngineCore.getInstance()

    instance.touchApp = ctx.app as TouchApp
    instance.registerDefaults()

    const db = databaseModule.getDb()
    const auxDb = databaseModule.getAuxDb()
    instance.dbUtils = createDbUtils(db, auxDb)
    instance.searchIndexService = new SearchIndexService(db, { logger: searchLogger })
    void instance.searchIndexService.warmup().catch((error) => {
      searchEngineLog.warn('Search index warmup failed', { error })
    })
    instance.searchIndexService.preloadPinyin()
    indexingRuntime.setStore(new SearchIndexStoreAdapter(instance.searchIndexService))
    indexingRuntime.setTaskStateStore(new SqliteIndexingTaskStateStore(db))
    instance.queryCompletionService = new QueryCompletionService(instance.dbUtils)
    instance.searchUsageService.initialize(db)
    searchEngineLog.debug('Initializing RecommendationEngine')
    instance.recommendationEngine = new RecommendationEngine(instance.dbUtils)
    instance.timeStatsAggregator = new TimeStatsAggregator(instance.dbUtils)
    instance.indexingRuntime = indexingRuntime
    registerCoreIndexedSources(instance.indexingRuntime)
    fileProvider.setIndexedSourceRuntimeResetDelegate(
      async (request) =>
        await instance.indexingRuntime!.resetSourceRuntimeState(FILE_INDEXED_SOURCE_ID, request)
    )
    instance.indexedSourceEventRouter.subscribe()

    // 初始化并启动使用统计汇总服务
    instance.usageSummaryService = new UsageSummaryService(instance.dbUtils, {
      retentionDays: 30,
      autoCleanup: true,
      summaryInterval: 24 * 60 * 60 * 1000 // 24 小时
    })

    touchEventBus.on(TalexEvents.ALL_MODULES_LOADED, async () => {
      if (instance.providerRegistry.hasCompletedOnboarding()) {
        await instance.providerRegistry.ensureLoaded('all-modules-loaded')
        return
      }
      instance.providerRegistry.deferUntilOnboardingReady()
    })

    // Register IPC handlers
    // NOTE: 'core-box:query' is registered in core-box/ipc.ts via coreBoxManager.search()
    // Do NOT register it here to avoid duplicate handlers causing race conditions
    const transport = this.getTransport()

    transport.on(CoreBoxEvents.search.indexingDiagnostics, async () => {
      return await instance.indexingRuntime!.getDiagnostics()
    })

    transport.on(CoreBoxEvents.item.execute, async (payload) => {
      const { item, searchResult, actionId } = payload as {
        item: TuffItem
        searchResult?: TuffSearchResult
        actionId?: string
      }
      const provider = instance.providerRegistry.get(item.source.id)
      if (!provider || !provider.onExecute) {
        return instance.getActivationState()
      }

      const activationResult = await provider.onExecute({ item, searchResult, actionId })

      if (activationResult) {
        let activation: IProviderActivate
        if (typeof activationResult === 'object') {
          activation = activationResult
        } else {
          activation = {
            id: provider.id,
            name: provider.name,
            icon: provider.icon,
            meta: item.meta?.extension || {}
          }
        }
        instance.activateProviders([activation])

        if (!hasConcreteActivationFeature(activation)) {
          const query: TuffQuery = { text: '' }
          await instance.search(query)
        }
      }

      return instance.getActivationState()
    })

    const handleGetRecommendations = async (data?: { limit?: number; forceRefresh?: boolean }) => {
      if (!instance.recommendationEngine) {
        return { items: [], duration: 0, fromCache: false }
      }

      try {
        const options = {
          limit: data?.limit || 10,
          forceRefresh: data?.forceRefresh || false
        }
        const result = await instance.recommendationEngine.recommend(options)

        return {
          items: result.items,
          duration: result.duration,
          fromCache: result.fromCache,
          containerLayout: result.containerLayout
        }
      } catch (error) {
        searchEngineLog.error('Failed to get recommendations', { error })
        return { items: [], duration: 0, fromCache: false, error: String(error) }
      }
    }

    transport.on(CoreBoxEvents.recommendation.get, handleGetRecommendations)
    transport.on(CoreBoxRetainedEvents.legacy.getRecommendations, handleGetRecommendations)

    const handleAggregateTimeStats = async () => {
      if (!instance.timeStatsAggregator) {
        return { success: false, error: 'TimeStatsAggregator not initialized' }
      }

      try {
        await instance.timeStatsAggregator.aggregateTimeStats()
        return { success: true }
      } catch (error) {
        searchEngineLog.error('Failed to aggregate time stats', { error })
        return { success: false, error: String(error) }
      }
    }

    transport.on(CoreBoxEvents.recommendation.aggregateTimeStats, handleAggregateTimeStats)
    transport.on(CoreBoxRetainedEvents.legacy.aggregateTimeStats, handleAggregateTimeStats)

    transport.on(CoreBoxEvents.item.togglePin, async (data) => {
      if (!instance.dbUtils) {
        return { success: false, error: 'Database not initialized' }
      }

      try {
        const { sourceId, itemId, sourceType } = data
        const isPinned = await instance.dbUtils.togglePin(sourceId, itemId, sourceType)
        instance.invalidatePinnedCache()
        instance.searchCache.clear()
        instance.recommendationEngine?.invalidateCache()
        return { success: true, isPinned }
      } catch (error) {
        searchEngineLog.error('Failed to toggle pin', { error })
        return { success: false, error: String(error) }
      }
    })

    const handleIsPinned = async (data?: { sourceId?: string; itemId?: string }) => {
      if (!instance.dbUtils) {
        return { success: false, isPinned: false }
      }

      try {
        const sourceId = data?.sourceId
        const itemId = data?.itemId
        if (!sourceId || !itemId) {
          return { success: false, isPinned: false }
        }
        const isPinned = await instance.dbUtils.isPinned(sourceId, itemId)
        return { success: true, isPinned }
      } catch (error) {
        searchEngineLog.error('Failed to check pin status', { error })
        return { success: false, isPinned: false }
      }
    }

    transport.on(CoreBoxEvents.recommendation.isPinned, handleIsPinned)
    transport.on(CoreBoxRetainedEvents.legacy.isPinned, handleIsPinned)
  }

  destroy(): void {
    if (searchLogger.isEnabled()) {
      searchLogger.logSearchPhase(
        'Destroy',
        'Destroying SearchEngineCore and aborting any ongoing search'
      )
    }
    this.currentGatherController?.abort()
    this.providerRegistry.destroy()

    // 停止汇总服务
    this.usageSummaryService?.stop()
    this.stopMaintenance()
    this.indexedSourceEventRouter.unsubscribe()
    fileProvider.setIndexedSourceRuntimeResetDelegate(null)
    this.indexingRuntime?.clear()
    this.indexingRuntime = null

    void this.searchUsageService.flush().catch((error) => {
      searchEngineLog.error('Failed to flush usage stats queue on destroy', { error })
    })
  }
}

export default SearchEngineCore.getInstance()
