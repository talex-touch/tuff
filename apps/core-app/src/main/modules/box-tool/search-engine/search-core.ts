import type {
  IGatherController,
  IProviderActivate,
  ISearchEngine,
  ISearchProvider,
  TalexTouch,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import type { ModuleInitContext } from 'packages/utils/types/modules'
import type { TouchApp } from '../../../core/touch-app'
import type { DbUtils } from '../../../db/utils'
import type { ProviderContext } from './types'
import crypto from 'node:crypto'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import {
  StorageList,
  TuffInputType,
  TuffSearchResultBuilder,
  type TuffItem
} from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { CoreBoxEvents } from '@talex-touch/utils/transport/events'
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
import { getMainConfig, storageModule, subscribeMainConfig } from '../../storage'
import { appProvider } from '../addon/apps/app-provider'
import { everythingProvider } from '../addon/files/everything-provider'
import { fileProvider } from '../addon/files/file-provider'
import { previewProvider } from '../addon/preview'
import { mainWindowProvider } from '../addon/system/main-window-provider'
import { systemActionsProvider } from '../addon/system/system-actions-provider'
import { resolveClipboardInputs } from './utils/resolve-clipboard-inputs'
import { windowManager } from '../core-box/window'
import { QueryCompletionService } from './query-completion-service'
import { RecommendationEngine } from './recommendation/recommendation-engine'
import { gatherAggregator } from './search-gather'
import { markSearchActivity } from './search-activity'
import { SearchIndexService } from './search-index-service'
import { searchLogger } from './search-logger'
import { Sorter } from './sort/sorter'
import { tuffSorter } from './sort/tuff-sorter'
import { TimeStatsAggregator } from './time-stats-aggregator'
import { getUsageStatsBatchCached, UsageStatsCache } from './usage-stats-cache'
import { UsageStatsQueue } from './usage-stats-queue'
import { UsageSummaryService } from './usage-summary-service'

interface SearchCacheEntry {
  result: TuffSearchResult
  timestamp: number
}

const SEARCH_CACHE_TTL_MS = 5_000
const SEARCH_CACHE_MAX_SIZE = 100
const SEARCH_TRACE_SCHEMA = 'search-trace/v1'
const SEARCH_TRACE_SLOW_THRESHOLD_MS = 800

const searchEngineLog = getLogger('search-engine')
const resolveKeyManager = (channel: { keyManager?: unknown }): unknown =>
  channel.keyManager ?? channel
const coreBoxGetRecommendationsEvent = defineRawEvent<
  { limit?: number; forceRefresh?: boolean },
  { items: TuffItem[]; duration: number; fromCache: boolean; error?: string }
>('core-box:get-recommendations')
const coreBoxAggregateTimeStatsEvent = defineRawEvent<void, { success: boolean; error?: string }>(
  'core-box:aggregate-time-stats'
)
const coreBoxIsPinnedEvent = defineRawEvent<
  { sourceId: string; itemId: string },
  { success: boolean; isPinned: boolean }
>('core-box:is-pinned')

/**
 * Provider filter aliases for @xxx syntax
 */
const PROVIDER_ALIASES: Record<string, string[]> = {
  file: [
    'file-provider',
    'file-index',
    'files',
    'fs',
    'document',
    'everything-provider',
    'everything'
  ],
  app: ['app-provider', 'applications', 'apps'],
  plugin: ['plugin-features', 'plugins', 'extension', 'extensions'],
  preview: ['preview-provider']
}

const PROVIDER_CATEGORY_MAP: Record<string, string> = {
  'app-provider': 'app',
  'file-provider': 'file',
  'everything-provider': 'file',
  'plugin-features': 'plugin',
  'preview-provider': 'preview'
}

const EVERYTHING_PROVIDER_FILTERS = new Set(['everything', 'everything-provider'])
const FILE_PROVIDER_FILTERS = new Set(['file-provider', 'file-index'])
const FILE_CATEGORY_FILTERS = new Set(['file', 'files', 'fs', 'document'])

const PROVIDER_REFRACTORY_THRESHOLD = 2
const PROVIDER_REFRACTORY_BASE_MS = 30_000
const PROVIDER_REFRACTORY_MAX_MS = 5 * 60 * 1000
const PROVIDER_HEALTH_TTL_MS = 7 * 24 * 60 * 60 * 1000
const SEARCH_MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000
const SEARCH_MAINTENANCE_JITTER_MS = 10 * 60 * 1000

function resolveProviderCategory(providerId: string): string {
  if (PROVIDER_CATEGORY_MAP[providerId]) return PROVIDER_CATEGORY_MAP[providerId]
  if (providerId.includes('file')) return 'file'
  if (providerId.includes('app')) return 'app'
  if (providerId.includes('plugin')) return 'plugin'
  return 'other'
}

/**
 * Parsed query with optional provider filter
 */
interface ParsedSearchQuery {
  raw: string
  text: string
  providerFilter?: string
}

interface SearchPipelineStageDurations {
  parseDuration: number
  providerAggregationDuration: number
  mergeRankDuration: number
}

interface QueryOrchestrationResult {
  providerFilter?: string
  cacheKey: string
}

type ExtendedProviderStatus = 'success' | 'timeout' | 'error' | 'aborted'

type SearchTraceSourceStat = {
  providerId?: string
  provider?: string
  status?: ExtendedProviderStatus
  duration?: number
  resultCount?: number
}

interface SearchTraceProviderSummary {
  total: number
  byStatus: Partial<Record<ExtendedProviderStatus, number>>
  topSlow: Array<{ providerId: string; durationMs: number; status: string; resultCount: number }>
}

interface ProviderHealth {
  failureCount: number
  timeoutCount: number
  lastSeenAt: number
  lastStatus?: ExtendedProviderStatus
  lastDurationMs?: number
  lastResultCount?: number
  lastFailureAt?: number
  lastSuccessAt?: number
  blockedUntil?: number
}

/**
 * Parse search query for @xxx provider filter syntax
 */
function parseProviderFilter(input: string): ParsedSearchQuery {
  if (!input) return { raw: input, text: input }

  const filterMatch = input.match(/^@([\w-]+)\s*(.*)$/)
  if (filterMatch) {
    return {
      raw: input,
      providerFilter: filterMatch[1].toLowerCase(),
      text: filterMatch[2].trim()
    }
  }

  return { raw: input, text: input }
}

/**
 * Check if a provider matches the filter
 */
function matchesProviderFilter(providerId: string, filter: string): boolean {
  const normalizedId = providerId.toLowerCase()
  const normalizedFilter = filter.toLowerCase()

  // Exact match
  if (normalizedId === normalizedFilter) return true

  // Partial match
  if (normalizedId.includes(normalizedFilter)) return true

  // Alias match
  const aliases = PROVIDER_ALIASES[normalizedFilter]
  if (aliases?.some((alias) => normalizedId.includes(alias))) return true

  return false
}

function isExplicitEverythingProviderFilter(filter?: string): boolean {
  return typeof filter === 'string' && EVERYTHING_PROVIDER_FILTERS.has(filter.toLowerCase())
}

function isExplicitFileProviderFilter(filter?: string): boolean {
  return typeof filter === 'string' && FILE_PROVIDER_FILTERS.has(filter.toLowerCase())
}

function isExplicitFileCategoryFilter(filter?: string): boolean {
  return typeof filter === 'string' && FILE_CATEGORY_FILTERS.has(filter.toLowerCase())
}

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

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

function hashCachePart(value: unknown): string {
  return crypto.createHash('sha1').update(stableStringify(value)).digest('hex').slice(0, 16)
}

function buildSearchCacheKey(
  query: TuffQuery,
  providerFilter: string | undefined,
  activatedProviders: Map<string, IProviderActivate> | null
): string {
  const rawQuery = query as unknown as Record<string, unknown>
  const queryExtras: Record<string, unknown> = {}
  for (const key of Object.keys(rawQuery).sort()) {
    if (key === 'text' || key === 'inputs') {
      continue
    }
    queryExtras[key] = rawQuery[key]
  }

  const inputs = (query.inputs ?? []).map((input) => {
    const rawInput = input as unknown as Record<string, unknown>
    return {
      type: input.type,
      contentHash: hashCachePart(rawInput.content ?? ''),
      metaHash: hashCachePart(
        Object.fromEntries(Object.entries(rawInput).filter(([key]) => key !== 'content'))
      )
    }
  })

  return hashCachePart({
    text: query.text || '',
    providerFilter: providerFilter || '',
    activatedProviders: activatedProviders ? Array.from(activatedProviders.keys()).sort() : [],
    inputs,
    extras: queryExtras
  })
}

function roundDuration(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined
  }
  return Math.max(0, Math.round(value))
}

function toQueryHash(text: string): string {
  return crypto.createHash('sha1').update(text).digest('hex').slice(0, 12)
}

function buildProviderSummary(sourceStats: SearchTraceSourceStat[]): SearchTraceProviderSummary {
  const byStatus: Partial<Record<ExtendedProviderStatus, number>> = {}
  for (const stat of sourceStats) {
    const status = stat.status ?? 'success'
    byStatus[status] = (byStatus[status] ?? 0) + 1
  }

  const topSlow = sourceStats
    .map((stat) => ({
      providerId: stat.providerId || stat.provider || 'unknown',
      durationMs: roundDuration(stat.duration) ?? 0,
      status: stat.status ?? 'success',
      resultCount: typeof stat.resultCount === 'number' ? stat.resultCount : 0
    }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 3)

  return {
    total: sourceStats.length,
    byStatus,
    topSlow
  }
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
  private searchSessionStartTimes = new Map<string, number>()
  private pinnedCache: { fetchedAt: number; pinnedSet: Set<string> } | null = null
  private readonly pinnedCacheTtlMs = 10_000
  private readonly pollingService = PollingService.getInstance()
  private readonly maintenanceTaskId = 'search-engine.maintenance'
  private providerHealth = new Map<string, ProviderHealth>()
  private searchCache = new Map<string, SearchCacheEntry>()

  private touchApp: TouchApp | null = null
  private transport: ReturnType<typeof getTuffTransportMain> | null = null
  private lastSearchQuery: string = '' // 记录最后一次搜索的查询，用于完成跟踪
  private providersLoaded = false
  private providerLoadPromise: Promise<void> | null = null
  private startupServicesStarted = false
  private onboardingReadyUnsubscribe: (() => void) | null = null

  private cacheSearchResult(
    query: TuffQuery,
    providerFilter: string | undefined,
    result: TuffSearchResult
  ): void {
    const cacheKey = buildSearchCacheKey(query, providerFilter, this.activatedProviders)

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

  constructor() {
    if (SearchEngineCore._instance) {
      throw new Error('[SearchEngineCore] Singleton class cannot be instantiated more than once.')
    }

    SearchEngineCore._instance = this
    this.sorter = new Sorter()
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
    //  this.registerProvider(new ClipboardProvider())
    // NOTE: ClipboardProvider is intentionally disabled for now due to cost.

    // Windows: Use Everything for fast file search, fallback to file-provider for indexing
    // macOS/Linux: Use file-provider with full indexing
    if (process.platform === 'win32') {
      this.registerProvider(everythingProvider)
    }
    this.registerProvider(fileProvider)

    this.registerProvider(PluginFeaturesAdapter)
    this.registerProvider(previewProvider)
  }

  private hasCompletedOnboarding(setting?: AppSetting | null): boolean {
    const source =
      setting ??
      (() => {
        try {
          return getMainConfig(StorageList.APP_SETTING) as AppSetting
        } catch (error) {
          searchEngineLog.warn(
            'Failed to read app setting while checking onboarding state, fallback to ready',
            {
              error
            }
          )
          return { beginner: { init: true } } as AppSetting
        }
      })()

    if (!source?.beginner) {
      return false
    }

    return source.beginner.init === true
  }

  private startRuntimeServicesOnce(): void {
    if (this.startupServicesStarted) {
      return
    }
    this.startupServicesStarted = true
    this.usageSummaryService?.start()
    this.startMaintenance()
  }

  private clearOnboardingSubscription(): void {
    if (!this.onboardingReadyUnsubscribe) {
      return
    }
    this.onboardingReadyUnsubscribe()
    this.onboardingReadyUnsubscribe = null
  }

  private async ensureProvidersLoaded(reason: string): Promise<void> {
    if (this.providersLoaded) {
      this.startRuntimeServicesOnce()
      return
    }

    if (!this.providerLoadPromise) {
      this.providerLoadPromise = (async () => {
        const dispose = enterPerfContext('SearchEngine.loadProviders')
        try {
          // Load providers sequentially to avoid database lock contention
          // 串行加载 providers 以避免数据库锁竞争
          searchEngineLog.debug(
            `Loading ${this.providersToLoad.length} providers sequentially (reason: ${reason})...`
          )
          for (const provider of this.providersToLoad) {
            await this.loadProvider(provider)
            // 每加载一个 provider 后让出事件循环
            await new Promise<void>((resolve) => setImmediate(resolve))
          }
          this.providersToLoad = []
          this.providersLoaded = true
          searchEngineLog.info('All providers loaded successfully')
        } finally {
          dispose()
          this.providerLoadPromise = null
        }
      })()
    }

    await this.providerLoadPromise
    this.startRuntimeServicesOnce()
  }

  private deferProviderLoadingUntilOnboardingReady(): void {
    if (this.onboardingReadyUnsubscribe) {
      return
    }

    searchEngineLog.info('Onboarding not completed, deferring provider loading and index tasks')

    this.onboardingReadyUnsubscribe = subscribeMainConfig(
      StorageList.APP_SETTING,
      (nextSetting) => {
        if (!this.hasCompletedOnboarding(nextSetting as AppSetting)) {
          return
        }

        this.clearOnboardingSubscription()
        searchEngineLog.info('Onboarding completed, resuming provider loading')
        void this.ensureProvidersLoaded('onboarding-complete')
      }
    )
  }

  static getInstance(): SearchEngineCore {
    if (!this._instance) {
      this._instance = new SearchEngineCore()
    }

    return this._instance
  }

  /** Expose RecommendationEngine for plugin SDK integration */
  public getRecommendationEngine(): RecommendationEngine | null {
    return this.recommendationEngine
  }

  registerProvider(provider: ISearchProvider<ProviderContext>): void {
    if (this.providers.has(provider.id)) {
      searchEngineLog.warn(`Search provider '${provider.id}' is already registered`)
      return
    }
    this.providers.set(provider.id, provider)
    searchEngineLog.info(`Search provider '${provider.id}' registered`)

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
      searchEngineLog.info(`Provider '${provider.id}' loaded in ${duration}ms`)
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

      // Notify the frontend that the search was cancelled
      const coreBoxWindow = windowManager.current?.window
      if (coreBoxWindow && !coreBoxWindow.isDestroyed()) {
        const transport = this.getTransport()
        void transport
          .sendToWindow(coreBoxWindow.id, CoreBoxEvents.search.end, {
            searchId,
            cancelled: true,
            activate: this.getActivationState() ?? undefined,
            sources: []
          })
          .catch(() => {})
      }
    }
  }

  private async orchestrateSearchQuery(
    query: TuffQuery
  ): Promise<QueryOrchestrationResult & { durationMs: number }> {
    const startedAt = performance.now()
    const parseContext = enterPerfContext('Search.pipeline.parse', {
      queryLength: (query.text || '').length,
      inputCount: query.inputs?.length || 0
    })

    try {
      if (query.text) {
        query.text = query.text.trim()
      }

      const parsedQuery = parseProviderFilter(query.text || '')
      const providerFilter = parsedQuery.providerFilter

      if (providerFilter) {
        query.text = parsedQuery.text
        searchEngineLog.debug(
          `Provider filter detected: @${providerFilter}, query.len=${query.text?.length ?? 0}, query.hash=${toQueryHash(query.text || '')}`
        )
      }

      const resolved = await resolveClipboardInputs(query.inputs)
      if (resolved.resolvedCount > 0) {
        searchEngineLog.debug('Resolved clipboard inputs', {
          meta: { resolvedCount: resolved.resolvedCount, clipboardIds: resolved.clipboardIds }
        })
      }

      return {
        providerFilter,
        cacheKey: buildSearchCacheKey(query, providerFilter, this.activatedProviders),
        durationMs: performance.now() - startedAt
      }
    } finally {
      parseContext()
    }
  }

  private aggregateProvidersForQuery(
    providers: ISearchProvider<ProviderContext>[],
    query: TuffQuery,
    options: { providerFilter?: string }
  ): { providers: ISearchProvider<ProviderContext>[]; durationMs: number } {
    const startedAt = performance.now()
    const providerContext = enterPerfContext('Search.pipeline.providers', {
      providerCount: providers.length,
      inputCount: query.inputs?.length || 0,
      providerFilter: options.providerFilter || undefined
    })

    let providersToSearch = providers

    try {
      if (query.inputs && query.inputs.length > 0) {
        const inputTypes = query.inputs.map((i) => i.type)
        const hasNonTextInput = inputTypes.some((t) => t !== TuffInputType.Text)

        if (hasNonTextInput) {
          searchLogger.logSearchPhase(
            'Provider Filtering',
            `Non-text inputs detected: ${inputTypes.join(', ')}`
          )

          providersToSearch = providersToSearch.filter((provider) => {
            if (provider.id === 'plugin-features') {
              return true
            }

            if (!provider.supportedInputTypes) {
              return false
            }

            return inputTypes.some((type) => provider.supportedInputTypes?.includes(type))
          })

          searchLogger.logSearchPhase(
            'Provider Filtered',
            `Active providers: ${providersToSearch.map((p) => p.id).join(', ')}`
          )
        }
      }

      const providerFilter = options.providerFilter
      if (providerFilter) {
        const beforeCount = providersToSearch.length
        providersToSearch = providersToSearch.filter((provider) =>
          matchesProviderFilter(provider.id, providerFilter)
        )

        searchLogger.logSearchPhase(
          '@Provider Filter',
          `Filter: @${providerFilter}, matched ${providersToSearch.length}/${beforeCount} providers: ${providersToSearch.map((p) => p.id).join(', ') || 'none'}`
        )

        if (providersToSearch.length === 0) {
          searchEngineLog.warn(`No providers match filter @${providerFilter}`)
        }
      }

      const shouldApplyRefractory = !options.providerFilter && !this.activatedProviders?.size
      if (shouldApplyRefractory && providersToSearch.length > 0) {
        const refractoryIds = new Set<string>()
        providersToSearch = providersToSearch.filter((provider) => {
          const shouldSkip = this.shouldSkipProvider(provider.id)
          if (shouldSkip) {
            refractoryIds.add(provider.id)
          }
          return !shouldSkip
        })

        if (refractoryIds.size > 0) {
          searchEngineLog.debug(
            `Provider refractory active, skipping: ${Array.from(refractoryIds).join(', ')}`
          )
        }
      }

      providersToSearch = this.routeWindowsFileProviders(
        providersToSearch,
        query,
        options.providerFilter
      )

      return {
        providers: providersToSearch,
        durationMs: performance.now() - startedAt
      }
    } finally {
      providerContext()
    }
  }

  private routeWindowsFileProviders(
    providers: ISearchProvider<ProviderContext>[],
    query: TuffQuery,
    providerFilter?: string
  ): ISearchProvider<ProviderContext>[] {
    if (process.platform !== 'win32') {
      return providers
    }

    const everything = providers.find((provider) => provider.id === 'everything-provider')
    const file = providers.find((provider) => provider.id === 'file-provider')
    if (!everything && !file) {
      return providers
    }

    let selectedFileProviderId: 'everything-provider' | 'file-provider' | null = null

    if (isExplicitEverythingProviderFilter(providerFilter)) {
      selectedFileProviderId = everything ? 'everything-provider' : null
    } else if (isExplicitFileProviderFilter(providerFilter)) {
      selectedFileProviderId = file ? 'file-provider' : null
    } else if (isExplicitFileCategoryFilter(providerFilter)) {
      if (fileProvider.hasSearchFilters(query.text || '')) {
        selectedFileProviderId = file ? 'file-provider' : null
      } else if (everythingProvider.isSearchReady()) {
        selectedFileProviderId = everything ? 'everything-provider' : null
      } else {
        selectedFileProviderId = file ? 'file-provider' : null
      }
    } else if (fileProvider.hasSearchFilters(query.text || '')) {
      selectedFileProviderId = file ? 'file-provider' : null
    } else if (everythingProvider.isSearchReady()) {
      selectedFileProviderId = everything ? 'everything-provider' : null
    } else {
      selectedFileProviderId = file ? 'file-provider' : null
    }

    return providers.filter((provider) => {
      if (provider.id !== 'everything-provider' && provider.id !== 'file-provider') {
        return true
      }
      return provider.id === selectedFileProviderId
    })
  }

  private appendCompatibilityNotice(
    items: TuffItem[],
    query: TuffQuery,
    providerFilter?: string
  ): TuffItem[] {
    if (
      items.length > 0 ||
      process.platform !== 'win32' ||
      !(
        isExplicitEverythingProviderFilter(providerFilter) ||
        isExplicitFileProviderFilter(providerFilter) ||
        isExplicitFileCategoryFilter(providerFilter)
      )
    ) {
      return items
    }

    const notice = everythingProvider.buildUnavailableNotice(query)
    return notice ? [notice] : items
  }

  private async mergeAndRankItems({
    sessionId,
    query,
    items,
    signal,
    includeCompletion
  }: {
    sessionId: string
    query: TuffQuery
    items: TuffItem[]
    signal: AbortSignal
    includeCompletion: boolean
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
      includeCompletion
    })

    try {
      let usageStatsDuration = 0
      let completionDuration = 0

      if (includeCompletion) {
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
      } else {
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

      const sortingContext = enterPerfContext('Search.sort', {
        sessionId,
        itemCount: items.length
      })
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

  async search(query: TuffQuery): Promise<TuffSearchResult> {
    markSearchActivity()
    const pipelineDurations: SearchPipelineStageDurations = {
      parseDuration: 0,
      providerAggregationDuration: 0,
      mergeRankDuration: 0
    }
    const { providerFilter, cacheKey, durationMs } = await this.orchestrateSearchQuery(query)
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
        const coreBoxWindow = windowManager.current?.window
        if (coreBoxWindow && !coreBoxWindow.isDestroyed()) {
          const transport = this.getTransport()
          void transport
            .sendToWindow(coreBoxWindow.id, CoreBoxEvents.search.update, {
              items: itemsToSend,
              searchId: sessionId
            })
            .catch(() => {})
        }
      }

      searchLogger.logSearchPhase('Initialization', 'Setting up search aggregator')

      gatherController = gatherAggregator(providersToSearch, query, async (update) => {
        try {
          searchLogger.searchUpdate(update.isDone, update.newResults.length)
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
                  includeCompletion: true
                })
                pipelineDurations.mergeRankDuration = mergeRankDuration
                const sortedItems = this.appendCompatibilityNotice(
                  rawSortedItems,
                  query,
                  providerFilter
                )

                this._updateActivationState(update.newResults)

                const totalDuration = Date.now() - startTime
                const initialResult = new TuffSearchResultBuilder(query)
                  .setItems(sortedItems)
                  .setDuration(totalDuration)
                  .setSources(update.sourceStats || [])
                  .build()
                initialResult.sessionId = sessionId
                initialResult.activate = this.getActivationState() ?? undefined

                this._recordSearchMetrics({
                  sessionId,
                  query,
                  totalDuration,
                  sortingDuration,
                  usageStatsDuration,
                  completionDuration,
                  stageDurations: pipelineDurations,
                  sourceStats: update.sourceStats || [],
                  resultCount: sortedItems.length,
                  providerFilter
                })

                this._recordSearchResults(sessionId, sortedItems).catch((error) => {
                  searchEngineLog.error('Failed to record search results', { error })
                })
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
                  this.cacheSearchResult(query, providerFilter, initialResult)
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
              void transport
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
              includeCompletion: true
            })
            pipelineDurations.mergeRankDuration = mergeRankDuration
            const sortedItems = this.appendCompatibilityNotice(
              rawSortedItems,
              query,
              providerFilter
            )

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
              usageStatsDuration,
              completionDuration,
              stageDurations: pipelineDurations,
              sourceStats: update.sourceStats || [],
              resultCount: sortedItems.length,
              providerFilter
            })

            // 异步记录搜索结果统计（不阻塞返回）
            this._recordSearchResults(sessionId, sortedItems).catch((error) => {
              searchEngineLog.error('Failed to record search results', { error })
            })
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

            this.cacheSearchResult(query, providerFilter, initialResult)
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
              includeCompletion: false
            })
            this._updateActivationState(update.newResults)
            sendUpdateToFrontend(sortedItems)
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

  /** Batch fetch pinned state and inject into items metadata before sorting */
  private async _injectPinnedState(items: TuffItem[]): Promise<void> {
    if (!this.dbUtils || items.length === 0) return

    const start = performance.now()

    try {
      const pinnedSet = await this.getPinnedSet()
      if (pinnedSet.size === 0) return

      let injectedCount = 0
      for (const item of items) {
        const meta = item.meta as Record<string, unknown> | undefined
        const sourceId =
          typeof meta?._originalSourceId === 'string' ? meta._originalSourceId : item.source.id
        const itemId = typeof meta?._originalItemId === 'string' ? meta._originalItemId : item.id
        const key = `${sourceId}:${itemId}`
        const isPinned = pinnedSet.has(key)

        if (isPinned) {
          if (!item.meta) item.meta = {}
          item.meta.pinned = { isPinned: true, pinnedAt: Date.now() }
          injectedCount++
        } else {
          const pinnedMeta = meta?.pinned
          if (pinnedMeta && typeof pinnedMeta === 'object') {
            const pinned = pinnedMeta as { isPinned?: boolean }
            if (pinned.isPinned) {
              pinned.isPinned = false
            }
          }
        }
      }

      if (searchLogger.isEnabled()) {
        const duration = performance.now() - start
        searchLogger.logSearchPhase(
          'Pinned Injection',
          `Injected ${injectedCount}/${items.length} pinned flags in ${duration.toFixed(2)}ms`
        )
      }
    } catch (error) {
      searchEngineLog.error('Failed to inject pinned state', { error })
    }
  }

  private invalidatePinnedCache(): void {
    this.pinnedCache = null
  }

  private async getPinnedSet(): Promise<Set<string>> {
    if (!this.dbUtils) return new Set()

    const now = Date.now()
    if (this.pinnedCache && now - this.pinnedCache.fetchedAt < this.pinnedCacheTtlMs) {
      return this.pinnedCache.pinnedSet
    }

    const pinnedRecords = await this.dbUtils.getAllPinnedItems()
    const pinnedSet = new Set(pinnedRecords.map((p) => `${p.sourceId}:${p.itemId}`))

    this.pinnedCache = {
      fetchedAt: now,
      pinnedSet
    }

    return pinnedSet
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
    sortingDuration: number
    usageStatsDuration?: number
    completionDuration?: number
    stageDurations?: SearchPipelineStageDurations
    sourceStats: Array<{
      providerId?: string
      provider?: string
      resultCount: number
      duration?: number
    }>
    resultCount: number
    providerFilter?: string
  }): void {
    try {
      const sentryService = getSentryService()
      if (!sentryService.isTelemetryEnabled()) {
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

      const queryLength = (query.text || '').length
      const queryType = query.type || 'text'
      const hasFilters = Boolean(
        query.filters?.kinds?.length || query.filters?.sources?.length || query.filters?.date_range
      )
      const filterKinds = query.filters?.kinds?.length ? query.filters.kinds : undefined
      const filterSources = query.filters?.sources?.length ? query.filters.sources : undefined
      const searchScene = inputTypes.includes('files')
        ? 'clipboard-files'
        : inputTypes.includes('image')
          ? 'clipboard-image'
          : inputTypes.includes('html')
            ? 'clipboard-html'
            : queryType === 'voice'
              ? 'voice'
              : 'text'
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
      const now = new Date()
      await this.dbUtils.addUsageLog({
        sessionId,
        itemId,
        source: item.source.type,
        action: 'execute',
        keyword: '', // Keyword is not relevant for an execute action
        timestamp: now,
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

      void this.dbUtils.incrementUsageTrendDaily(item.source.id, itemId, now).catch((error) => {
        searchEngineLog.warn(`Failed to update trend stats for item ${itemId}`, { error })
      })

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
      const appMeta = meta?.app as { bundle_id?: string } | undefined
      const bundleId = typeof appMeta?.bundle_id === 'string' ? appMeta.bundle_id : ''
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
          'wechat',
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
    this.pruneProviderHealth()

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

  private pruneProviderHealth(): void {
    if (this.providerHealth.size === 0) return
    const now = Date.now()
    for (const [providerId, health] of this.providerHealth) {
      if (now - health.lastSeenAt > PROVIDER_HEALTH_TTL_MS) {
        this.providerHealth.delete(providerId)
      }
    }
  }

  private shouldSkipProvider(providerId: string): boolean {
    const health = this.providerHealth.get(providerId)
    if (!health?.blockedUntil) {
      return false
    }

    const now = Date.now()
    if (now < health.blockedUntil) {
      return true
    }

    health.blockedUntil = undefined
    health.failureCount = 0
    health.timeoutCount = 0
    return false
  }

  private updateProviderHealth(
    sourceStats: Array<{
      providerId?: string
      status?: ExtendedProviderStatus
      duration?: number
      resultCount?: number
    }>
  ): void {
    if (sourceStats.length === 0) return
    const now = Date.now()

    for (const stat of sourceStats) {
      const providerId = stat.providerId
      if (!providerId) continue

      const status = stat.status
      if (!status || status === 'aborted') {
        const existing = this.providerHealth.get(providerId)
        if (existing) {
          existing.lastSeenAt = now
        }
        continue
      }

      const entry =
        this.providerHealth.get(providerId) ??
        ({
          failureCount: 0,
          timeoutCount: 0,
          lastSeenAt: now
        } satisfies ProviderHealth)

      entry.lastSeenAt = now
      entry.lastStatus = status
      if (typeof stat.duration === 'number') {
        entry.lastDurationMs = stat.duration
      }
      if (typeof stat.resultCount === 'number') {
        entry.lastResultCount = stat.resultCount
      }

      if (status === 'success') {
        entry.failureCount = 0
        entry.timeoutCount = 0
        entry.blockedUntil = undefined
        entry.lastSuccessAt = now
      } else {
        entry.failureCount += 1
        entry.lastFailureAt = now
        if (status === 'timeout') {
          entry.timeoutCount += 1
        }

        if (entry.failureCount >= PROVIDER_REFRACTORY_THRESHOLD) {
          const backoffPower = Math.max(0, entry.failureCount - PROVIDER_REFRACTORY_THRESHOLD)
          const cooldownMs = Math.min(
            PROVIDER_REFRACTORY_MAX_MS,
            PROVIDER_REFRACTORY_BASE_MS * 2 ** backoffPower
          )
          const nextBlockedUntil = now + cooldownMs
          if (!entry.blockedUntil || nextBlockedUntil > entry.blockedUntil) {
            entry.blockedUntil = nextBlockedUntil
            searchEngineLog.warn(
              `Provider '${providerId}' entering refractory for ${Math.round(cooldownMs / 1000)}s`
            )
          }
        }
      }

      this.providerHealth.set(providerId, entry)
    }
  }

  init(ctx: ModuleInitContext<TalexEvents>): void {
    const instance = SearchEngineCore.getInstance()

    instance.touchApp = ctx.app as TouchApp
    instance.registerDefaults()

    const db = databaseModule.getDb()
    const auxDb = databaseModule.getAuxDb()
    instance.dbUtils = createDbUtils(db, auxDb)
    instance.searchIndexService = new SearchIndexService(db)
    void instance.searchIndexService.warmup().catch((error) => {
      searchEngineLog.warn('Search index warmup failed', { error })
    })
    instance.searchIndexService.preloadPinyin()
    instance.queryCompletionService = new QueryCompletionService(instance.dbUtils)
    instance.usageStatsCache = new UsageStatsCache(10000, 15 * 60 * 1000) // 15 minutes TTL
    instance.usageStatsQueue = new UsageStatsQueue(db, {
      searchFlushIntervalMs: 30 * 60 * 1000,
      actionFlushIntervalMs: 10 * 60 * 1000,
      searchFlushEventThreshold: 2000,
      actionFlushEventThreshold: 300
    })
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
      if (instance.hasCompletedOnboarding()) {
        await instance.ensureProvidersLoaded('all-modules-loaded')
        return
      }

      instance.deferProviderLoadingUntilOnboardingReady()
    })

    // Register IPC handlers
    // NOTE: 'core-box:query' is registered in core-box/ipc.ts via coreBoxManager.search()
    // Do NOT register it here to avoid duplicate handlers causing race conditions
    const transport = this.getTransport()

    transport.on(CoreBoxEvents.item.execute, async (payload) => {
      const { item, searchResult } = payload as {
        item: TuffItem
        searchResult?: TuffSearchResult
      }
      const provider = instance.providers.get(item.source.id)
      if (!provider || !provider.onExecute) {
        return instance.getActivationState()
      }

      const activationResult = await provider.onExecute({ item, searchResult })

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

        const query: TuffQuery = { text: '' }
        await instance.search(query)
      }

      return instance.getActivationState()
    })

    transport.on(coreBoxGetRecommendationsEvent, async (data) => {
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

    transport.on(coreBoxAggregateTimeStatsEvent, async () => {
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

    transport.on(CoreBoxEvents.item.togglePin, async (data) => {
      if (!instance.dbUtils) {
        return { success: false, error: 'Database not initialized' }
      }

      try {
        const { sourceId, itemId, sourceType } = data
        const isPinned = await instance.dbUtils.togglePin(sourceId, itemId, sourceType)
        instance.invalidatePinnedCache()
        return { success: true, isPinned }
      } catch (error) {
        searchEngineLog.error('Failed to toggle pin', { error })
        return { success: false, error: String(error) }
      }
    })

    transport.on(coreBoxIsPinnedEvent, async (data) => {
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
    this.clearOnboardingSubscription()

    // 停止汇总服务
    this.usageSummaryService?.stop()
    this.stopMaintenance()

    // 强制刷新队列
    this.usageStatsQueue?.forceFlush().catch((error) => {
      searchEngineLog.error('Failed to flush usage stats queue on destroy', { error })
    })
  }
}

export default SearchEngineCore.getInstance()
