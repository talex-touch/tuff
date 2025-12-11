import type {
  IGatherController,
  IProviderActivate,
  ISearchEngine,
  ISearchProvider,
  TalexTouch,
  TuffItem,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import type { StandardChannelData } from '@talex-touch/utils/channel'
import type { ModuleInitContext } from 'packages/utils/types/modules'
import type { TouchApp } from '../../../core/touch-app'
import type { DbUtils } from '../../../db/utils'
import type { ProviderContext } from './types'
import crypto from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { TuffInputType, TuffSearchResultBuilder } from '@talex-touch/utils'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import {
  ProviderDeactivatedEvent,
  TalexEvents,
  touchEventBus
} from '../../../core/eventbus/touch-event'
import { createDbUtils } from '../../../db/utils'
import { createLogger } from '../../../utils/logger'
import { databaseModule } from '../../database'
import PluginFeaturesAdapter from '../../plugin/adapters/plugin-features-adapter'
import { getSentryService } from '../../sentry'
import { storageModule } from '../../storage'
import { appProvider } from '../addon/apps/app-provider'
import { fileProvider } from '../addon/files/file-provider'
import { previewProvider } from '../addon/preview'
import { systemProvider } from '../addon/system/system-provider'
import { urlProvider } from '../addon/url/url-provider'
import { windowManager } from '../core-box/window'
import { QueryCompletionService } from './query-completion-service'
import { RecommendationEngine } from './recommendation/recommendation-engine'
import { gatherAggregator } from './search-gather'
import { SearchIndexService } from './search-index-service'
import { searchLogger } from './search-logger'
import { Sorter } from './sort/sorter'
import { tuffSorter } from './sort/tuff-sorter'
import { TimeStatsAggregator } from './time-stats-aggregator'
import { getUsageStatsBatchCached, UsageStatsCache } from './usage-stats-cache'
import { UsageStatsQueue } from './usage-stats-queue'
import { UsageSummaryService } from './usage-summary-service'

const searchEngineLog = createLogger('SearchEngineCore')
// import intelligenceSearchProvider from './providers/intelligence-provider' // Removed - 使用 internal-ai-plugin

/**
 * Generates a unique key for an activation request.
 * For the plugin adapter, it combines the provider ID with the plugin name
 * to ensure that each plugin's activation is unique.
 * @param activation The activation object.
 * @returns A unique string key.
 */
function getActivationKey(activation: IProviderActivate): string {
  if (activation.id === 'plugin-features' && activation.meta?.pluginName) {
    return `${activation.id}:${activation.meta.pluginName}`
  }
  return activation.id
}

export class SearchEngineCore
  implements ISearchEngine<ProviderContext>, TalexTouch.IModule<TalexEvents>
{
  private static _instance: SearchEngineCore

  readonly name = Symbol('search-engine-core')

  private providers: Map<string, ISearchProvider<ProviderContext>> = new Map()
  private providersToLoad: ISearchProvider<ProviderContext>[] = []
  private sorter: Sorter
  private activatedProviders: Map<string, IProviderActivate> | null = null
  private currentGatherController: IGatherController | null = null
  private dbUtils: DbUtils | null = null
  private searchIndexService: SearchIndexService | null = null
  private usageSummaryService: UsageSummaryService | null = null
  private queryCompletionService: QueryCompletionService | null = null
  private usageStatsCache: UsageStatsCache | null = null
  private usageStatsQueue: UsageStatsQueue | null = null
  private recommendationEngine: RecommendationEngine | null = null
  private timeStatsAggregator: TimeStatsAggregator | null = null
  private latestSessionId: string | null = null // 跟踪最新的搜索 session，防止竞态条件

  private touchApp: TouchApp | null = null
  private lastSearchQuery: string = '' // 记录最后一次搜索的查询，用于完成跟踪

  constructor() {
    if (SearchEngineCore._instance) {
      throw new Error('[SearchEngineCore] Singleton class cannot be instantiated more than once.')
    }

    SearchEngineCore._instance = this
    this.sorter = new Sorter()
  }

  private registerDefaults(): void {
    this.sorter.register(tuffSorter)

    this.registerProvider(appProvider)
    //  this.registerProvider(new ClipboardProvider())
    // TODO refractory - this provider costs a lot of time
    this.registerProvider(fileProvider)
    this.registerProvider(PluginFeaturesAdapter)
    this.registerProvider(systemProvider)
    this.registerProvider(previewProvider)
    this.registerProvider(urlProvider)
  }

  static getInstance(): SearchEngineCore {
    if (!this._instance) {
      this._instance = new SearchEngineCore()
    }

    return this._instance
  }

  registerProvider(provider: ISearchProvider<ProviderContext>): void {
    if (this.providers.has(provider.id)) {
      searchEngineLog.warn(`Search provider '${provider.id}' is already registered`)
      return
    }
    this.providers.set(provider.id, provider)
    searchEngineLog.success(`Search provider '${provider.id}' registered`)

    if (provider.onLoad) {
      this.providersToLoad.push(provider)
    }
  }

  private async loadProvider(provider: ISearchProvider<ProviderContext>): Promise<void> {
    if (!this.touchApp) {
      searchEngineLog.error('Core modules not available to load provider')
      return
    }
    if (!this.searchIndexService) {
      searchEngineLog.error('SearchIndexService not initialized')
      return
    }
    const startTime = Date.now()
    try {
      await provider.onLoad?.({
        touchApp: this.touchApp,
        databaseManager: databaseModule,
        storageManager: storageModule,
        searchIndex: this.searchIndexService
      })
      const duration = Date.now() - startTime
      searchEngineLog.success(`Provider '${provider.id}' loaded in ${duration}ms`)
    } catch (error) {
      const duration = Date.now() - startTime
      searchEngineLog.error(`Failed to load provider '${provider.id}' after ${duration}ms`, {
        error
      })
    }
  }

  unregisterProvider(providerId: string): void {
    if (!this.providers.has(providerId)) {
      searchEngineLog.warn(`Search provider '${providerId}' is not registered`)
      return
    }
    const provider = this.providers.get(providerId)
    provider?.onDeactivate?.()
    this.providers.delete(providerId)
    searchEngineLog.info(`Search provider '${providerId}' unregistered`)
  }

  activateProviders(activations: IProviderActivate[] | null): void {
    if (activations && activations.length > 0) {
      const uniqueProviders = new Map<string, IProviderActivate>()
      for (const activation of activations) {
        const key = getActivationKey(activation)
        if (!uniqueProviders.has(key)) {
          uniqueProviders.set(key, activation)
        }
      }
      this.activatedProviders = uniqueProviders.size > 0 ? uniqueProviders : null
      if (searchLogger.isEnabled()) {
        searchLogger.logSearchPhase(
          'Activate Providers',
          `SET: ${this.activatedProviders ? JSON.stringify(Array.from(this.activatedProviders.values())) : 'null'}`
        )
      }
    } else {
      this.deactivateProviders()
    }
  }

  deactivateProvider(uniqueKey: string): void {
    if (searchLogger.isEnabled()) {
      searchLogger.logSearchPhase('Deactivate Provider', `Called for key: ${uniqueKey}`)
    }
    if (this.activatedProviders && this.activatedProviders.has(uniqueKey)) {
      const deactivatedActivation = this.activatedProviders.get(uniqueKey)
      this.activatedProviders.delete(uniqueKey)
      if (searchLogger.isEnabled()) {
        searchLogger.logSearchPhase('Deactivate Provider', `Deactivated: ${uniqueKey}`)
      }

      // Emit event for provider deactivation
      const isPluginFeature = deactivatedActivation?.id === 'plugin-features'
      const allProvidersDeactivated = this.activatedProviders.size === 0
      touchEventBus.emit(
        TalexEvents.PROVIDER_DEACTIVATED,
        new ProviderDeactivatedEvent(uniqueKey, isPluginFeature, allProvidersDeactivated)
      )

      if (this.activatedProviders.size === 0) {
        this.activatedProviders = null
        if (searchLogger.isEnabled()) {
          searchLogger.logSearchPhase('Deactivate Provider', 'All providers deactivated')
        }
      }
    } else {
      if (searchLogger.isEnabled()) {
        searchLogger.logSearchPhase(
          'Deactivate Provider',
          `Provider with key ${uniqueKey} not found`
        )
      }
    }
  }

  deactivateProviders(): void {
    this.activatedProviders = null

    // Emit event to notify that all providers have been deactivated
    touchEventBus.emit(
      TalexEvents.PROVIDER_DEACTIVATED,
      new ProviderDeactivatedEvent('*', false, true)
    )
  }

  getActiveProviders(): ISearchProvider<ProviderContext>[] {
    if (!this.activatedProviders) {
      return Array.from(this.providers.values())
    }
    // Get unique provider IDs from the activation keys
    const providerIds = new Set(
      Array.from(this.activatedProviders.values()).map((activation) => activation.id)
    )

    return Array.from(providerIds)
      .map((id) => this.providers.get(id))
      .filter((p): p is ISearchProvider<ProviderContext> => !!p)
  }

  public getActivationState(): IProviderActivate[] | null {
    if (!this.activatedProviders) {
      return null
    }
    return Array.from(this.activatedProviders.values())
  }

  public getProvidersByIds(ids: string[]): ISearchProvider<ProviderContext>[] {
    return ids
      .map((id) => this.providers.get(id))
      .filter((p): p is ISearchProvider<ProviderContext> => !!p)
  }

  private _updateActivationState(newResults: TuffSearchResult[]): void {
    const allNewActivations = newResults.flatMap((res) => res.activate || [])

    if (allNewActivations.length > 0) {
      const merged = new Map<string, IProviderActivate>(this.activatedProviders || [])
      allNewActivations.forEach((activation) => {
        const key = getActivationKey(activation)
        merged.set(key, activation)
      })
      this.activatedProviders = merged
    }
  }

  public getCurrentGatherController(): IGatherController | null {
    return this.currentGatherController
  }

  public cancelSearch(searchId: string): void {
    if (this.currentGatherController) {
      if (searchLogger.isEnabled()) {
        searchLogger.logSearchPhase('Cancel Search', `Cancelling search with ID: ${searchId}`)
      }
      this.currentGatherController.abort()
      this.currentGatherController = null

      // 清理 latestSessionId，允许新搜索
      if (this.latestSessionId === searchId) {
        this.latestSessionId = null
      }

      // Notify the frontend that the search was cancelled
      const coreBoxWindow = windowManager.current?.window
      if (coreBoxWindow && !coreBoxWindow.isDestroyed()) {
        this.touchApp!.channel.sendTo(coreBoxWindow, ChannelType.MAIN, 'core-box:search-end', {
          searchId,
          cancelled: true,
          activate: this.getActivationState() ?? undefined,
          sources: []
        })
      }
    }
  }

  async search(query: TuffQuery): Promise<TuffSearchResult> {
    // Normalize query text: trim leading/trailing whitespace
    if (query.text) {
      query.text = query.text.trim()
    }

    const sessionId = crypto.randomUUID()
    searchLogger.searchSessionStart(query.text, sessionId)
    searchLogger.logSearchPhase(
      'Query Received',
      `Text: "${query.text}", Inputs: ${query.inputs?.length || 0}`
    )

    this.currentGatherController?.abort()

    this.latestSessionId = sessionId
    searchEngineLog.debug(`Starting search session ${sessionId}`)

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
            return new TuffSearchResultBuilder(query)
              .setItems([])
              .setDuration(0)
              .setSources([])
              .build()
          }

          const result = new TuffSearchResultBuilder(query)
            .setItems(recommendationResult.items)
            .setDuration(recommendationResult.duration)
            .setSources([])
            .build()

          result.sessionId = sessionId
          result.containerLayout = recommendationResult.containerLayout

          return result
        } catch (error) {
          searchEngineLog.error('Failed to generate recommendations', { error })

          // fallback to empty result
          return new TuffSearchResultBuilder(query)
            .setItems([])
            .setDuration(0)
            .setSources([])
            .build()
        }
      } else {
        return new TuffSearchResultBuilder(query).setItems([]).setDuration(0).setSources([]).build()
      }
    }

    this.lastSearchQuery = query.text || ''

    const startTime = Date.now()
    const sortingStartTime = { value: 0 }
    this._recordSearchUsage(sessionId, query)

    return new Promise((resolve) => {
      let isFirstUpdate = true
      let providersToSearch = this.getActiveProviders()

      // Smart routing: filter providers based on query.inputs types
      if (query.inputs && query.inputs.length > 0) {
        const inputTypes = query.inputs.map((i) => i.type)
        const hasNonTextInput = inputTypes.some((t) => t !== TuffInputType.Text)

        if (hasNonTextInput) {
          searchLogger.logSearchPhase(
            'Provider Filtering',
            `Non-text inputs detected: ${inputTypes.join(', ')}`
          )

          // Keep only providers that support these input types
          providersToSearch = providersToSearch.filter((provider) => {
            // PluginFeaturesAdapter always kept (it filters features internally)
            if (provider.id === 'plugin-features') {
              return true
            }

            // Other providers must declare supportedInputTypes
            if (!provider.supportedInputTypes) {
              // Default to text-only support
              return false
            }

            // Check if provider supports at least one of the input types
            return inputTypes.some((type) => provider.supportedInputTypes?.includes(type))
          })

          searchLogger.logSearchPhase(
            'Provider Filtered',
            `Active providers: ${providersToSearch.map((p) => p.id).join(', ')}`
          )
        }
      }

      searchLogger.searchProviders(providersToSearch.map((p) => p.id))

      const sendUpdateToFrontend = (itemsToSend: TuffItem[]): void => {
        const coreBoxWindow = windowManager.current?.window
        if (coreBoxWindow && !coreBoxWindow.isDestroyed()) {
          this.touchApp!.channel.sendTo(coreBoxWindow, ChannelType.MAIN, 'core-box:search-update', {
            items: itemsToSend,
            searchId: sessionId
          })
        }
      }

      searchLogger.logSearchPhase('Initialization', 'Setting up search aggregator')

      const gatherController = gatherAggregator(providersToSearch, query, async (update) => {
        searchLogger.searchUpdate(update.isDone, update.newResults.length)
        if (update.isDone) {
          // Handle final state and notify frontend
          const totalResults = update.newResults.reduce((acc, res) => acc + res.items.length, 0)
          searchLogger.searchSessionEnd(sessionId, totalResults)
          this.currentGatherController = null
          this._updateActivationState(update.newResults)
          const coreBoxWindow = windowManager.current?.window
          if (coreBoxWindow) {
            const finalActivationState = this.getActivationState() ?? undefined
            this.touchApp!.channel.sendTo(coreBoxWindow, ChannelType.MAIN, 'core-box:search-end', {
              searchId: sessionId,
              activate: finalActivationState,
              sources: update.sourceStats
            })
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

          // 批量获取使用统计并注入到 items 中
          await this._injectUsageStats(initialItems)

          // 注入查询完成权重
          await this.queryCompletionService?.injectCompletionWeights(query.text || '', initialItems)

          sortingStartTime.value = performance.now()
          const { sortedItems } = this.sorter.sort(initialItems, query, gatherController.signal)
          const sortingDuration = performance.now() - sortingStartTime.value

          this._updateActivationState(update.newResults)

          const totalDuration = Date.now() - startTime
          const initialResult = new TuffSearchResultBuilder(query)
            .setItems(sortedItems)
            .setDuration(totalDuration)
            .setSources(update.sourceStats || [])
            .build()
          initialResult.sessionId = sessionId
          initialResult.activate = this.getActivationState() ?? undefined

          // Record search metrics for Sentry
          this._recordSearchMetrics({
            sessionId,
            query,
            totalDuration,
            sortingDuration,
            sourceStats: update.sourceStats || [],
            resultCount: sortedItems.length
          })

          // 异步记录搜索结果统计（不阻塞返回）
          this._recordSearchResults(sessionId, sortedItems).catch((error) => {
            searchEngineLog.error('Failed to record search results', { error })
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

          resolve(initialResult)
        } else if (update.newResults.length > 0) {
          // This is a subsequent update
          const subsequentItems = update.newResults.flatMap((res) => res.items)

          // 批量获取使用统计并注入到 items 中
          await this._injectUsageStats(subsequentItems)

          const { sortedItems } = this.sorter.sort(subsequentItems, query, gatherController.signal)
          this._updateActivationState(update.newResults)
          sendUpdateToFrontend(sortedItems)
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
    if (!this.dbUtils) return

    try {
      await this.dbUtils.addUsageLog({
        sessionId,
        itemId: 'search_session', // Special ID for the search event itself
        source: 'system',
        action: 'search',
        keyword: query.text,
        timestamp: new Date(),
        context: JSON.stringify(query.context || {})
      })
      if (searchLogger.isEnabled()) {
        searchLogger.logSearchPhase('Usage Recording', `Recorded search session ${sessionId}`)
      }
    } catch (error) {
      searchEngineLog.error('Failed to record search usage', { error })
    }
  }

  /** Batch fetch usage stats and inject into items metadata before sorting */
  private async _injectUsageStats(items: TuffItem[]): Promise<void> {
    if (!this.dbUtils || items.length === 0) return

    const start = performance.now()

    try {
      const keys = items.map((item) => ({
        sourceId: item.source.id,
        itemId: item.id
      }))

      // Use cached batch query
      const stats = this.usageStatsCache
        ? await getUsageStatsBatchCached(this.dbUtils, this.usageStatsCache, keys)
        : await this.dbUtils.getUsageStatsBatch(keys)

      const statsMap = new Map(stats.map((s) => [`${s.sourceId}:${s.itemId}`, s]))

      let injectedCount = 0
      for (const item of items) {
        const key = `${item.source.id}:${item.id}`
        const stat = statsMap.get(key)

        if (stat) {
          if (!item.meta) item.meta = {}
          item.meta.usageStats = {
            executeCount: stat.executeCount,
            searchCount: stat.searchCount,
            cancelCount: stat.cancelCount,
            lastExecuted: stat.lastExecuted ? stat.lastExecuted.toISOString() : null,
            lastSearched: stat.lastSearched ? stat.lastSearched.toISOString() : null,
            lastCancelled: stat.lastCancelled ? stat.lastCancelled.toISOString() : null
          }
          injectedCount++
        }
      }

      if (searchLogger.isEnabled()) {
        const duration = performance.now() - start
        searchLogger.logSearchPhase(
          'Usage Stats Injection',
          `Injected ${injectedCount}/${items.length} stats in ${duration.toFixed(2)}ms`
        )
      }
    } catch (error) {
      searchEngineLog.error('Failed to inject usage stats', { error })
    }
  }

  /** Record search result display stats for top 10 items */
  private async _recordSearchResults(sessionId: string, items: TuffItem[]): Promise<void> {
    if (!this.dbUtils || items.length === 0) return

    const start = performance.now()

    try {
      const topItems = items.slice(0, 10)

      // Use queue for batch writes instead of direct database calls
      if (this.usageStatsQueue) {
        for (const item of topItems) {
          this.usageStatsQueue.enqueue(item.source.id, item.id, item.source.type, 'search')
        }
      } else {
        // Fallback to direct database calls if queue is not available
        const updatePromises = topItems.map((item) =>
          this.dbUtils!.incrementUsageStats(
            item.source.id,
            item.id,
            item.source.type,
            'search'
          ).catch((error) => {
            searchEngineLog.error(`Failed to update search stats for item ${item.id}`, {
              error
            })
            return null
          })
        )

        await Promise.allSettled(updatePromises)
      }

      if (searchLogger.isEnabled()) {
        const duration = performance.now() - start
        searchLogger.logSearchPhase(
          'Usage Recording',
          `Recorded ${topItems.length} items in ${duration.toFixed(2)}ms (session: ${sessionId})`
        )
      }
    } catch (error) {
      searchEngineLog.error('Failed to record search results', { error })
    }
  }

  /**
   * Record search metrics for Sentry analytics
   */
  private _recordSearchMetrics({
    sessionId,
    query,
    totalDuration,
    sortingDuration,
    sourceStats,
    resultCount
  }: {
    sessionId: string
    query: TuffQuery
    totalDuration: number
    sortingDuration: number
    sourceStats: Array<{
      providerId?: string
      provider?: string
      resultCount: number
      duration?: number
    }>
    resultCount: number
  }): void {
    try {
      const sentryService = getSentryService()
      if (!sentryService.isEnabled()) {
        return
      }

      // Extract provider timings and results from sourceStats
      const providerTimings: Record<string, number> = {}
      const providerResults: Record<string, number> = {}

      // sourceStats contains provider timing and result information
      for (const stat of sourceStats) {
        const providerId = stat.providerId || stat.provider || 'unknown'
        providerResults[providerId] = stat.resultCount || 0
        // Duration is in milliseconds, already tracked in gatherAggregator
        providerTimings[providerId] = stat.duration || 0
      }

      // Extract input types
      const inputTypes = query.inputs
        ? query.inputs.map((input) => input.type).filter(Boolean)
        : ['text']

      sentryService.recordSearchMetrics({
        totalDuration,
        providerTimings,
        providerResults,
        sortingDuration,
        queryText: query.text || '',
        inputTypes,
        resultCount,
        sessionId
      })
    } catch (error) {
      // Silently fail to not disrupt search flow
      searchEngineLog.debug('Failed to record search metrics for Sentry', { error })
    }
  }

  public async recordExecute(sessionId: string, item: TuffItem): Promise<void> {
    if (!this.dbUtils) return

    const itemId = this._getItemId(item)

    try {
      await this.dbUtils.addUsageLog({
        sessionId,
        itemId,
        source: item.source.type,
        action: 'execute',
        keyword: '', // Keyword is not relevant for an execute action
        timestamp: new Date(),
        context: JSON.stringify({
          scoring: item.scoring
        })
      })

      // 保持原有的 usageSummary 更新（向后兼容）
      await this.dbUtils.incrementUsageSummary(itemId)

      // 新增：更新基于 source + id 的组合键统计（使用队列批量写入）
      if (this.usageStatsQueue) {
        this.usageStatsQueue.enqueue(item.source.id, itemId, item.source.type, 'execute')
      } else {
        // Fallback to direct database call
        await this.dbUtils.incrementUsageStats(item.source.id, itemId, item.source.type, 'execute')
      }

      // Invalidate cache for this item
      this.usageStatsCache?.invalidate(item.source.id, itemId)

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
  }

  maintain(): void {
    // console.log(
    //   '[SearchEngineCore] Maintenance tasks can be triggered from here, but providers are now stateless.',
    // ) // Remove to reduce noise
    // TODO: The logic for refreshing indexes or caches should be handled
    // within the providers themselves, possibly triggered by a separate scheduler.
  }

  init(ctx: ModuleInitContext<TalexEvents>): void {
    const instance = SearchEngineCore.getInstance()

    instance.touchApp = ctx.app as TouchApp
    instance.registerDefaults()

    const db = databaseModule.getDb()
    instance.dbUtils = createDbUtils(db)
    instance.searchIndexService = new SearchIndexService(db)
    instance.queryCompletionService = new QueryCompletionService(instance.dbUtils)
    instance.usageStatsCache = new UsageStatsCache(10000, 15 * 60 * 1000) // 15 minutes TTL
    instance.usageStatsQueue = new UsageStatsQueue(db, 100) // 100ms flush interval
    searchEngineLog.debug('Initializing RecommendationEngine')
    instance.recommendationEngine = new RecommendationEngine(instance.dbUtils)
    instance.timeStatsAggregator = new TimeStatsAggregator(instance.dbUtils)

    // 初始化并启动使用统计汇总服务
    instance.usageSummaryService = new UsageSummaryService(instance.dbUtils, {
      retentionDays: 30,
      autoCleanup: true,
      summaryInterval: 24 * 60 * 60 * 1000 // 24 小时
    })

    touchEventBus.on(TalexEvents.ALL_MODULES_LOADED, async () => {
      // Load providers sequentially to avoid database lock contention
      // 串行加载 providers 以避免数据库锁竞争
      searchEngineLog.debug(`Loading ${instance.providersToLoad.length} providers sequentially...`)
      for (const provider of instance.providersToLoad) {
        await instance.loadProvider(provider)
      }
      instance.providersToLoad = []
      searchEngineLog.success('All providers loaded successfully')

      // 启动汇总服务
      instance.usageSummaryService?.start()
    })

    // Register IPC handlers
    const channel = this.touchApp!.channel
    channel.regChannel(ChannelType.MAIN, 'core-box:query', async ({ data }) => {
      return instance.search(data.query)
    })

    channel.regChannel(
      ChannelType.MAIN,
      'core-box:execute',
      async (channelData: StandardChannelData) => {
        const { reply } = channelData
        const { item, searchResult } = channelData.data as {
          item: TuffItem
          searchResult?: TuffSearchResult
        }
        const provider = instance.providers.get(item.source.id)
        if (!provider || !provider.onExecute) {
          return
        }

        const activationResult = await provider.onExecute({ item, searchResult })

        if (activationResult) {
          let activation: IProviderActivate
          if (typeof activationResult === 'object') {
            // If the provider returns a full activation object, use it directly.
            activation = activationResult
          } else {
            // Otherwise, create a default activation object.
            activation = {
              id: provider.id,
              name: provider.name,
              icon: provider.icon,
              meta: item.meta?.extension || {}
            }
          }
          instance.activateProviders([activation])

          // Trigger a search with an empty query to get the initial items.
          const query: TuffQuery = { text: '' }
          await instance.search(query)
        }

        reply(DataCode.SUCCESS, instance.getActivationState())
      }
    )

    channel.regChannel(ChannelType.MAIN, 'core-box:get-activated-providers', () => {
      return instance.getActivationState()
    })

    channel.regChannel(ChannelType.MAIN, 'core-box:deactivate-provider', ({ data }) => {
      instance.deactivateProvider(data.id)
      return instance.getActivationState()
    })

    channel.regChannel(ChannelType.MAIN, 'core-box:deactivate-providers', () => {
      instance.deactivateProviders()
      return instance.getActivationState()
    })

    channel.regChannel(ChannelType.MAIN, 'core-box:get-provider-details', ({ data }) => {
      const providers = instance.getProvidersByIds(data.providerIds)
      return providers.map((_p) => ({
        id: _p.id,
        name: _p.name,
        icon: _p.icon
      }))
    })

    channel.regChannel(ChannelType.MAIN, 'core-box:get-recommendations', async ({ data }) => {
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
          fromCache: result.fromCache
        }
      } catch (error) {
        searchEngineLog.error('Failed to get recommendations', { error })
        return { items: [], duration: 0, fromCache: false, error: String(error) }
      }
    })

    // 手动触发时间统计汇总
    channel.regChannel(ChannelType.MAIN, 'core-box:aggregate-time-stats', async () => {
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
    })

    // Pin/Unpin item
    channel.regChannel(ChannelType.MAIN, 'core-box:toggle-pin', async ({ data }) => {
      if (!instance.dbUtils) {
        return { success: false, error: 'Database not initialized' }
      }

      try {
        const { sourceId, itemId, sourceType } = data
        const isPinned = await instance.dbUtils.togglePin(sourceId, itemId, sourceType)
        return { success: true, isPinned }
      } catch (error) {
        searchEngineLog.error('Failed to toggle pin', { error })
        return { success: false, error: String(error) }
      }
    })

    // Check if item is pinned
    channel.regChannel(ChannelType.MAIN, 'core-box:is-pinned', async ({ data }) => {
      if (!instance.dbUtils) {
        return { success: false, isPinned: false }
      }

      try {
        const { sourceId, itemId } = data
        const isPinned = await instance.dbUtils.isPinned(sourceId, itemId)
        return { success: true, isPinned }
      } catch (error) {
        searchEngineLog.error('Failed to check pin status', { error })
        return { success: false, isPinned: false }
      }
    })
  }

  destroy(): void {
    if (searchLogger.isEnabled()) {
      searchLogger.logSearchPhase(
        'Destroy',
        'Destroying SearchEngineCore and aborting any ongoing search'
      )
    }
    this.currentGatherController?.abort()

    // 停止汇总服务
    this.usageSummaryService?.stop()

    // 强制刷新队列
    this.usageStatsQueue?.forceFlush().catch((error) => {
      searchEngineLog.error('Failed to flush usage stats queue on destroy', { error })
    })
  }
}

export default SearchEngineCore.getInstance()
