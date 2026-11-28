import type { TuffContainerLayout, TuffItem } from '@talex-touch/utils'
import type {
  IExecuteArgs,
  IExecuteOutcome,
  PluginRecommendCandidate,
  RecommendProvider,
  UsageBehaviorFacts
} from '@talex-touch/utils/core-box'
import type { ContextualSemanticFileHit } from '../../addon/files/file-recommendation-bridge'
import type { DbUtils } from '../../../../db/utils'
import type {
  ForegroundActivityView,
  ForegroundAppActivityReader
} from '../../../system/foreground-app-activity'
import type { ContextSignal, TimePattern } from './context-provider'
import type {
  AppActivityCatalog,
  CandidateItem,
  ItemCandidate,
  PassCandidateReadCache,
  ScoredItem
} from './recommendation-catalog-candidates'
import type { TrendingResult } from './recommendation-telemetry-trend'
import type { RecommendationSemanticProfile } from './semantic-profile'
import type { VolatileCandidate } from './volatile-context-matcher'
import { createHash } from 'node:crypto'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { i18nMsg } from '@talex-touch/utils/i18n'
import { desc, gt } from 'drizzle-orm'
import { shell } from 'electron'
import { APP_DESTINATION_PROVIDER_ID } from '../../../../../shared/app-destinations'
import { scheduleAuxWrite } from '../../../../db/db-write'
import { getStartupDegradeWindowRemainingMs } from '../../../../db/runtime-flags'
import * as schema from '../../../../db/schema'
import { appTaskGate } from '../../../../service/app-task-gate'
import { openValidatedExternalUrl } from '../../../../utils/external-url-policy'
import { createLogger } from '../../../../utils/logger'
import { enterPerfContext } from '../../../../utils/perf-context'
import { subscribeBoxToolUsageLimitsChanged } from '../../ports/ai-capability-port'
import { createAppRecommendationSource } from './app-recommendation-source'
import { createClipboardRecommendationSource } from './clipboard-recommendation-source'
import { ContextProvider, hashContextContent } from './context-provider'
import {
  createFileRecommendationSource,
  FILE_RECOMMENDATION_SOURCE_ID
} from './file-recommendation-source'
import { ItemRebuilder } from './item-rebuilder'
import { bindPluginRecommendationApi } from './plugin-recommendation-api'
import {
  BUILTIN_CLIPBOARD_URL_SOURCE_ID,
  builtinClipboardUrlTitle,
  createSnapshotRecommendationSource,
  pluginRecommendationSourceId,
  type PluginRecommendSnapshot
} from './plugin-recommendation-source'
import {
  admitExplorationWithinBudget,
  APP_ACTIVITY_CATALOG_TTL_MS,
  applyDiversityFilter,
  attachForegroundActivity,
  buildAppActivityCatalog,
  BUILTIN_DESTINATION_SCORE_MAX,
  calculateNoveltyFactor,
  COLD_START_BASE_SCORE,
  collectBuiltinDestinationCandidates,
  collectColdStartRecommendations,
  collectForegroundRecentCandidates,
  collectNewlyAddedFileItems,
  collectNewlyInstalledItems,
  collectTimeBasedTopItems,
  createPassCandidateReadCache,
  deduplicateCandidates,
  EMPTY_USAGE_STATS,
  hasAnyUsageHistory,
  NEWLY_ADDED_FILE_CANDIDATE_LIMIT,
  NEWLY_INSTALLED_CANDIDATE_LIMIT,
  NOVELTY_WEIGHT
} from './recommendation-catalog-candidates'
import {
  buildRecommendationContextCandidates,
  RECOMMENDATION_CONTEXT_SCORE_MAX
} from './recommendation-context-history'
import { recommendationExposureService } from './recommendation-exposure-service'
import { describeRecommendation } from './recommendation-presentation'
import {
  calculateContextualSemanticFileScore,
  isDefaultRecommendationSemanticSettings,
  loadRecommendationSemanticSettings,
  RecommendationSemanticScorer,
  SEMANTIC_LOCAL_WEIGHT,
  toSemanticCandidateInput,
  type RecommendationSemanticSettings
} from './recommendation-semantic-scorer'
import { recommendationSourceRegistry } from './recommendation-source-registry'
import {
  backfillTrendDay,
  buildTrendBackfillDays,
  createRecommendationUsageIdentityMigration,
  hasTrendDataForDay,
  queryTrendingItems,
  RECOMMENDATION_TELEMETRY_INTERVAL_MS,
  recordRecommendationPerfMetric,
  reportRecommendationTelemetrySnapshot,
  TREND_BACKFILL_INTERVAL_SECONDS,
  USAGE_IDENTITY_MIGRATION_INITIAL_DELAY_MS
} from './recommendation-telemetry-trend'
import {
  BEHAVIOR_SCORE_MAX,
  calculateBehaviorScore,
  calculatePluginPriorityContribution,
  calculateTimeContribution,
  resolveEvidenceBackedReason,
  resolveLastUsedAt,
  toErrorMeta,
  type UsageBehaviorRow
} from './recommendation-utils'
import {
  buildCandidateSemanticProfile,
  buildRecommendationSemanticProfile,
  calculateLocalSemanticScore
} from './semantic-profile'
import { calculateContextMatch, isSensitiveFilePath } from './volatile-context-matcher'

export { calculateNoveltyFactor, COLD_START_BASE_SCORE }
export type { ScoredItem }

const PLUGIN_PROVIDER_TIMEOUT_MS = 200
/** Preset matches may nudge by at most ten behaviour-equivalent points. */
const CONTEXT_MATCH_WEIGHT = 1e3
/** Band for host-generated contextual candidates (clipboard-URL card). */
const HOST_CONTEXT_PRIORITY_WEIGHT = 1e5
/** Band for plugin-declared `priority`. */
const PLUGIN_PRIORITY_WEIGHT = 1e4
/** Band for automatic behaviour + time ranking (100 * 1e4 = 1e6). */
const BEHAVIOR_SCORE_WEIGHT = 1e4
const PLUGIN_CANDIDATES_PER_PROVIDER_LIMIT = 5
const PLUGIN_CANDIDATES_TOTAL_LIMIT = 15
const GRID_TIER_COLUMNS = 5
const NEWLY_INSTALLED_EXPOSURE_TAG = 'newly-installed'
const RECOMMENDATION_APP_TASK_WAIT_MS = 300
const RECOMMENDATION_CACHE_SCHEMA_VERSION = 4

const recommendationLog = createLogger('RecommendationEngine')

function toExposureKey(item: TuffItem): string {
  const meta = item.meta as Record<string, unknown> | undefined
  const sourceId =
    typeof meta?._originalSourceId === 'string' ? meta._originalSourceId : item.source?.id
  const itemId = typeof meta?._originalItemId === 'string' ? meta._originalItemId : item.id
  return `${sourceId}:${itemId}`
}

export class RecommendationEngine {
  private contextProvider: ContextProvider
  private itemRebuilder: ItemRebuilder
  private readonly semanticScorer = new RecommendationSemanticScorer(recommendationLog)

  /** Bundle id ↔ usage identity over the app catalog; dropped on every invalidation. */
  private appActivityCatalog: AppActivityCatalog | null = null

  private recommendationCache: {
    items: TuffItem[]
    timestamp: number
    context: ContextSignal
    cacheKey: string
  } | null = null

  private cacheGeneration = 0
  private cacheInvalidatedAt = 0
  private disposeOwnedSources: Array<() => void> = []

  private readonly CACHE_DURATION_MS = 30 * 60 * 1000
  private readonly REFRESH_INTERVAL_MS = 15 * 60 * 1000
  private readonly REFRESH_JITTER_MS = 15 * 1000
  private readonly pollingService = PollingService.getInstance()
  private readonly refreshTaskId = 'recommendation.refresh'
  private refreshInFlight = false
  private readonly trendBackfillTaskId = 'recommendation.trend-backfill'
  private readonly telemetryTaskId = 'recommendation.telemetry-report'
  private trendBackfillQueue: number[] | null = null
  private trendBackfillCompleted = false
  private usageIdentityMigrationTimer: ReturnType<typeof setTimeout> | null = null
  private refreshJitterTimer: NodeJS.Timeout | null = null
  private usageIdentityMigrationScheduled = false

  private pluginProviders: Map<string, { pluginName: string; provider: RecommendProvider }> =
    new Map()

  private pluginSnapshots = new Map<string, Map<string, PluginRecommendSnapshot>>()
  private builtinClipboardSnapshots = new Map<string, PluginRecommendSnapshot>()

  constructor(
    private dbUtils: DbUtils,
    private appCatalogDbUtils: DbUtils = dbUtils,
    private readonly foregroundActivity: ForegroundAppActivityReader | null = null
  ) {
    this.contextProvider = new ContextProvider()
    this.itemRebuilder = new ItemRebuilder()

    this.disposeOwnedSources = [
      createClipboardRecommendationSource(dbUtils),
      createFileRecommendationSource(dbUtils, {
        onThumbnailLanded: () => this.invalidateCache()
      }),
      createAppRecommendationSource(appCatalogDbUtils),
      createSnapshotRecommendationSource(
        BUILTIN_CLIPBOARD_URL_SOURCE_ID,
        () => this.builtinClipboardSnapshots,
        (args) => this.executeBuiltinClipboardUrl(args)
      )
    ].map((source) => {
      recommendationSourceRegistry.unregister(source.sourceId)
      return recommendationSourceRegistry.registerSource(source)
    })
    this.disposeOwnedSources.push(bindPluginRecommendationApi(this))
    this.disposeOwnedSources.push(
      subscribeBoxToolUsageLimitsChanged(() => {
        if (this.semanticScorer.liftUsageLimitPause()) {
          this.invalidateCache()
        }
      })
    )

    this.startBackgroundRefresh()
    this.startTelemetryReport()
    this.scheduleUsageIdentityMigration()
  }

  public get semanticAiCooldownUntil(): number {
    return this.semanticScorer.cooldownUntil
  }

  public get semanticAiFailures(): number {
    return this.semanticScorer.failures
  }

  public isSemanticAiInCooldown(): boolean {
    return this.semanticScorer.isInCooldown()
  }

  private scheduleUsageIdentityMigration(): void {
    if (this.usageIdentityMigrationScheduled) return
    this.usageIdentityMigrationScheduled = true

    const delayMs = Math.max(
      USAGE_IDENTITY_MIGRATION_INITIAL_DELAY_MS,
      getStartupDegradeWindowRemainingMs()
    )
    this.usageIdentityMigrationTimer = setTimeout(() => {
      this.usageIdentityMigrationTimer = null
      void Promise.resolve()
        .then(() =>
          createRecommendationUsageIdentityMigration(this.dbUtils, recommendationLog).run()
        )
        .then((result) => {
          if (result.status === 'skipped') {
            recommendationLog.debug('Usage source identity migration skipped', {
              meta: { reason: result.reason }
            })
          }
        })
        .catch((error) => {
          recommendationLog.warn('Usage source identity migration failed', {
            meta: toErrorMeta(error)
          })
        })
    }, delayMs)
  }

  private startBackgroundRefresh(): void {
    if (this.pollingService.isRegistered(this.refreshTaskId)) {
      this.pollingService.unregister(this.refreshTaskId)
    }
    const initialDelayMs = 15_000 + Math.floor(Math.random() * this.REFRESH_JITTER_MS)
    this.pollingService.register(
      this.refreshTaskId,
      () => {
        if (this.refreshInFlight) {
          return
        }
        this.refreshInFlight = true
        const jitterMs = Math.floor(Math.random() * this.REFRESH_JITTER_MS)
        this.refreshJitterTimer = setTimeout(() => {
          this.refreshJitterTimer = null
          void this.runBackgroundRefresh()
        }, jitterMs)
      },
      { interval: this.REFRESH_INTERVAL_MS, unit: 'milliseconds', initialDelayMs }
    )
    this.pollingService.start()
  }

  private async runBackgroundRefresh(): Promise<void> {
    try {
      if (appTaskGate.isActive()) {
        await appTaskGate.waitForIdle()
      }
      await this.recommend({ forceRefresh: true })
    } catch (error) {
      recommendationLog.warn('Background refresh failed', { meta: toErrorMeta(error) })
    } finally {
      this.refreshInFlight = false
    }
  }

  private startTelemetryReport(): void {
    if (this.pollingService.isRegistered(this.telemetryTaskId)) {
      this.pollingService.unregister(this.telemetryTaskId)
    }
    this.pollingService.register(
      this.telemetryTaskId,
      async () => {
        try {
          await reportRecommendationTelemetrySnapshot(this.dbUtils, (eventType, metadata) =>
            this.recordRecommendationPerf(eventType, metadata)
          )
        } catch (error) {
          recommendationLog.warn('Telemetry report failed', { meta: toErrorMeta(error) })
        }
      },
      { interval: RECOMMENDATION_TELEMETRY_INTERVAL_MS, unit: 'milliseconds' }
    )
    this.pollingService.start()
  }

  private recordRecommendationPerf(eventType: string, metadata: Record<string, unknown>): void {
    recordRecommendationPerfMetric(eventType, metadata, recommendationLog)
  }

  private scheduleTrendBackfill(): void {
    if (this.trendBackfillQueue || this.trendBackfillCompleted) return

    this.trendBackfillQueue = buildTrendBackfillDays()

    if (this.pollingService.isRegistered(this.trendBackfillTaskId)) {
      this.pollingService.unregister(this.trendBackfillTaskId)
    }

    this.pollingService.register(
      this.trendBackfillTaskId,
      async () => {
        await this.processTrendBackfillTick()
      },
      { interval: TREND_BACKFILL_INTERVAL_SECONDS, unit: 'seconds', initialDelayMs: 15_000 }
    )
    this.pollingService.start()
  }

  private async processTrendBackfillTick(): Promise<void> {
    if (!this.trendBackfillQueue || this.trendBackfillQueue.length === 0) {
      this.pollingService.unregister(this.trendBackfillTaskId)
      this.trendBackfillQueue = null
      this.trendBackfillCompleted = true
      return
    }

    const day = this.trendBackfillQueue.shift()
    if (day == null) return

    const disposeTick = enterPerfContext('Recommendation.trendBackfill.tick', {
      day,
      queueLength: this.trendBackfillQueue.length
    })
    try {
      const hasData = await hasTrendDataForDay(this.dbUtils, day)
      if (!hasData) {
        await backfillTrendDay(this.dbUtils, day)
      }
    } catch (error) {
      recommendationLog.warn('Trend backfill failed', { meta: toErrorMeta(error) })
    } finally {
      disposeTick()
    }
  }

  public stopBackgroundRefresh(): void {
    for (const dispose of this.disposeOwnedSources) dispose()
    this.disposeOwnedSources = []
    this.pollingService.unregister(this.refreshTaskId)
    this.pollingService.unregister(this.trendBackfillTaskId)
    this.pollingService.unregister(this.telemetryTaskId)
    if (this.refreshJitterTimer) {
      clearTimeout(this.refreshJitterTimer)
      this.refreshJitterTimer = null
    }
    this.refreshInFlight = false
    if (this.usageIdentityMigrationTimer) {
      clearTimeout(this.usageIdentityMigrationTimer)
      this.usageIdentityMigrationTimer = null
    }
  }

  public registerPluginProvider(pluginName: string, provider: RecommendProvider): () => void {
    if (typeof provider.onExecute !== 'function') {
      throw new Error(
        `[RecommendationEngine] Plugin recommendation provider "${provider.id}" must implement onExecute`
      )
    }

    const disposeSource = recommendationSourceRegistry.registerSource(
      createSnapshotRecommendationSource(
        pluginRecommendationSourceId(provider.id),
        () => this.pluginSnapshots.get(provider.id),
        (args) => this.executePluginRecommend(provider.id, args)
      )
    )

    this.pluginProviders.set(provider.id, { pluginName, provider })
    this.invalidateCache()
    recommendationLog.debug('Registered plugin provider', {
      meta: { providerId: provider.id, pluginName }
    })
    return () => {
      if (this.pluginProviders.get(provider.id)?.provider !== provider) return
      disposeSource()
      this.pluginSnapshots.delete(provider.id)
      this.unregisterPluginProvider(pluginName, provider.id)
    }
  }

  private async executePluginRecommend(
    providerId: string,
    args: IExecuteArgs
  ): Promise<IExecuteOutcome> {
    const provider = this.pluginProviders.get(providerId)?.provider
    if (!provider?.onExecute) return { accepted: false }

    const meta = args.item.meta as Record<string, unknown> | undefined
    const itemId = typeof meta?._originalItemId === 'string' ? meta._originalItemId : args.item.id
    const candidate = this.pluginSnapshots.get(providerId)?.get(itemId)?.candidate
    if (!candidate) return { accepted: false }

    try {
      const result = await provider.onExecute(candidate, args)
      return { accepted: result !== false, activation: null }
    } catch (error) {
      recommendationLog.warn('Plugin recommendation execute failed', {
        meta: { providerId, itemId, ...toErrorMeta(error) }
      })
      return { accepted: false }
    }
  }

  private async executeBuiltinClipboardUrl(args: IExecuteArgs): Promise<IExecuteOutcome> {
    const meta = args.item.meta as Record<string, unknown> | undefined
    const itemId = typeof meta?._originalItemId === 'string' ? meta._originalItemId : args.item.id
    const url = this.builtinClipboardSnapshots.get(itemId)?.candidate.data?.url
    if (typeof url !== 'string' || !url) return { accepted: false }

    try {
      const decision = await openValidatedExternalUrl(url, { opener: shell.openExternal })
      return { accepted: decision.allowed === true, activation: null }
    } catch (error) {
      recommendationLog.warn('Builtin clipboard URL execute failed', {
        meta: { itemId, ...toErrorMeta(error) }
      })
      return { accepted: false }
    }
  }

  public unregisterPluginProvider(pluginName: string, providerId: string): boolean {
    const entry = this.pluginProviders.get(providerId)
    if (!entry || entry.pluginName !== pluginName) return false
    const removed = this.pluginProviders.delete(providerId)
    if (removed) {
      recommendationSourceRegistry.unregister(`plugin-recommend:${providerId}`)
      this.pluginSnapshots.delete(providerId)
      this.invalidateCache()
      recommendationLog.debug('Unregistered plugin provider', {
        meta: { providerId }
      })
    }
    return removed
  }

  public unregisterPluginProviders(pluginName: string): void {
    const toRemove: string[] = []
    for (const [id, entry] of this.pluginProviders) {
      if (entry.pluginName === pluginName) {
        toRemove.push(id)
      }
    }
    for (const id of toRemove) {
      this.pluginProviders.delete(id)
      recommendationSourceRegistry.unregister(`plugin-recommend:${id}`)
      this.pluginSnapshots.delete(id)
    }
    if (toRemove.length > 0) {
      this.invalidateCache()
      recommendationLog.debug('Unregistered plugin providers', {
        meta: { pluginName, providerCount: toRemove.length }
      })
    }
  }

  public invalidateCache(): void {
    this.recommendationCache = null
    this.appActivityCatalog = null
    this.cacheGeneration += 1
    this.cacheInvalidatedAt = Date.now()
    void scheduleAuxWrite(
      'recommendation.cache.invalidate',
      (db) => db.delete(schema.recommendationCache),
      { priority: 'best_effort', dropPolicy: 'drop' }
    ).catch((error) => {
      recommendationLog.debug('Failed to clear persisted recommendation cache', {
        meta: toErrorMeta(error)
      })
    })
  }

  async recommend(options: RecommendationOptions = {}): Promise<RecommendationResult> {
    const maxAttempts = 3
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const generation = this.cacheGeneration
      const result = await this.computeRecommendation(options)
      if (generation === this.cacheGeneration) return result
      recommendationLog.debug('Discarded recommendation result invalidated before publish', {
        meta: { attempt }
      })
    }
    return await this.computeRecommendation(options)
  }

  private async computeRecommendation(
    options: RecommendationOptions = {}
  ): Promise<RecommendationResult> {
    if (appTaskGate.isActive()) {
      await appTaskGate.waitForIdle(RECOMMENDATION_APP_TASK_WAIT_MS)
    }

    const startTime = performance.now()
    const cacheGeneration = this.cacheGeneration
    this.scheduleTrendBackfill()

    const contextStartedAt = performance.now()
    const context = await this.contextProvider.getCurrentContext()
    const semanticSettings = await this.getRecommendationSemanticSettings()
    const contextDuration = performance.now() - contextStartedAt

    const pinnedStartedAt = performance.now()
    const pinnedItems = await this.getPinnedItems()
    const pinnedDuration = performance.now() - pinnedStartedAt
    const pinnedCacheSignature = this.buildPinnedCacheSignature(pinnedItems)
    const contextCacheKey = this.buildRecommendationCacheKey(
      context,
      semanticSettings,
      pinnedCacheSignature
    )

    if (!options.forceRefresh && this.recommendationCache) {
      const cacheAge = Date.now() - this.recommendationCache.timestamp
      if (
        cacheAge < this.CACHE_DURATION_MS &&
        this.recommendationCache.cacheKey === contextCacheKey
      ) {
        recommendationLog.debug('Memory cache hit', {
          meta: {
            cacheAgeSeconds: Number((cacheAge / 1000).toFixed(1)),
            itemCount: this.recommendationCache.items.length
          }
        })
        const items = await this.applyVolatileContextRerank(
          this.recommendationCache.items,
          context,
          options.limit || 10
        )
        this.recordRecommendationPerf('recommendation.total', {
          cacheLayer: 'memory',
          durationMs: Math.round(performance.now() - startTime),
          contextMs: Math.round(contextDuration),
          pinnedMs: Math.round(pinnedDuration),
          itemsCount: items.length
        })
        return this.finalizeResult(options, items, context, startTime, true)
      }
    }

    const cached = options.forceRefresh
      ? null
      : await this.getCachedRecommendations(context, semanticSettings, pinnedCacheSignature)
    if (cached) {
      const items = await this.applyVolatileContextRerank(
        cached.items,
        context,
        options.limit || 10
      )
      this.recordRecommendationPerf('recommendation.total', {
        cacheLayer: 'db',
        durationMs: Math.round(performance.now() - startTime),
        contextMs: Math.round(contextDuration),
        pinnedMs: Math.round(pinnedDuration),
        itemsCount: items.length
      })
      return this.finalizeResult(options, items, context, startTime, true)
    }

    let pinnedTuffItems = await this.itemRebuilder.rebuildItems(
      pinnedItems.map((item) => ({
        ...item,
        source: 'pinned' as const,
        score: Number.MAX_SAFE_INTEGER
      }))
    )
    for (const item of pinnedTuffItems) {
      if (!item.meta) item.meta = {}
      item.meta.pinned = { isPinned: true, pinnedAt: Date.now() }
      item.meta.recommendation = describeRecommendation('pinned')
    }
    pinnedTuffItems = this.dedupeItems(pinnedTuffItems)

    const candidatesStartedAt = performance.now()
    const passCache = this.createCandidatePassCache()
    const { items: candidates, perf: candidatePerf } = await this.getCandidates(
      context,
      options,
      passCache
    )
    const candidatesDuration = performance.now() - candidatesStartedAt
    const limit = options.limit || 10

    if (candidates.length === 0) {
      const cachedItems = await this.buildFallbackCachedItems(pinnedTuffItems, limit, passCache)
      this.storeMemoryCache(cacheGeneration, cachedItems, context, contextCacheKey)
      const finalItems = await this.applyVolatileContextRerank(cachedItems, context, limit)
      this.recordUncachedPerf(
        startTime,
        contextDuration,
        pinnedDuration,
        candidatesDuration,
        candidatePerf,
        finalItems.length
      )
      return this.finalizeResult(options, finalItems, context, startTime, false)
    }

    const scored = await this.scoreAndRank(candidates, context, semanticSettings)
    const diversified = this.applyDiversityFilter(scored, limit)
    const items = await this.itemRebuilder.rebuildItems(diversified)

    if (items.length === 0 && diversified.length > 0) {
      const cachedItems = await this.buildFallbackCachedItems(pinnedTuffItems, limit, passCache)
      this.storeMemoryCache(cacheGeneration, cachedItems, context, contextCacheKey)
      const finalItems = await this.applyVolatileContextRerank(cachedItems, context, limit)
      this.recordUncachedPerf(
        startTime,
        contextDuration,
        pinnedDuration,
        candidatesDuration,
        candidatePerf,
        finalItems.length
      )
      return this.finalizeResult(options, finalItems, context, startTime, false)
    }

    const pinnedKeys = new Set(pinnedItems.map((p) => `${p.sourceId}:${p.itemId}`))
    const pinnedIdentityKeys = new Set(pinnedTuffItems.map((item) => this.getItemIdentity(item)))
    const filteredItems = this.dedupeItems(items).filter((item) => {
      const meta = item.meta as Record<string, unknown> | undefined
      const originalSourceId = meta?._originalSourceId
      const originalItemId = meta?._originalItemId
      const originalKey =
        typeof originalSourceId === 'string' && typeof originalItemId === 'string'
          ? `${originalSourceId}:${originalItemId}`
          : `${item.source.id}:${item.id}`
      const identityKey = this.getItemIdentity(item)
      return !pinnedKeys.has(originalKey) && !pinnedIdentityKeys.has(identityKey)
    })

    for (const item of filteredItems) {
      if (!item.meta) item.meta = {}
      const meta = item.meta as Record<string, unknown>
      if (!('recommendation' in meta)) {
        meta.recommendation = describeRecommendation('cold-start')
      }
    }

    const backfilledItems = await this.backfillShortfall(
      filteredItems,
      pinnedTuffItems,
      limit,
      passCache
    )
    const combinedItems = this.combineRecommendedWithPinned(backfilledItems, pinnedTuffItems, limit)

    if (this.storeMemoryCache(cacheGeneration, combinedItems, context, contextCacheKey)) {
      await this.cacheRecommendations(
        context,
        semanticSettings,
        pinnedCacheSignature,
        combinedItems
      )
    }

    const finalItems = await this.applyVolatileContextRerank(combinedItems, context, limit)
    const duration = performance.now() - startTime
    recommendationLog.debug('Generated recommendations', {
      meta: { durationMs: Math.round(duration), itemCount: finalItems.length }
    })

    this.recordUncachedPerf(
      startTime,
      contextDuration,
      pinnedDuration,
      candidatesDuration,
      candidatePerf,
      finalItems.length
    )

    return this.finalizeResult(options, finalItems, context, startTime, false)
  }

  private async buildFallbackCachedItems(
    pinnedTuffItems: TuffItem[],
    limit: number,
    passCache?: PassCandidateReadCache
  ): Promise<TuffItem[]> {
    const fallbackItems = await this.resolveFallbackItems(limit, passCache)
    const pinnedKeys = new Set(pinnedTuffItems.map((item) => this.getItemIdentity(item)))
    const filteredFallback = this.dedupeItems(fallbackItems).filter(
      (item) => !pinnedKeys.has(this.getItemIdentity(item))
    )
    return this.combineRecommendedWithPinned(filteredFallback, pinnedTuffItems, limit)
  }

  private recordUncachedPerf(
    startTime: number,
    contextDuration: number,
    pinnedDuration: number,
    candidatesDuration: number,
    candidatePerf: CandidateResult['perf'],
    itemsCount: number
  ): void {
    this.recordRecommendationPerf('recommendation.total', {
      cacheLayer: 'none',
      durationMs: Math.round(performance.now() - startTime),
      contextMs: Math.round(contextDuration),
      pinnedMs: Math.round(pinnedDuration),
      candidatesMs: Math.round(candidatesDuration),
      candidateCount: candidatePerf.totalCandidates,
      filteredCount: candidatePerf.filteredCount,
      itemsCount,
      trendingMs: candidatePerf.trendingDurationMs,
      trendingRows: candidatePerf.trendingRows,
      trendingCandidates: candidatePerf.trendingCandidates,
      trendingReady: candidatePerf.trendingReady
    })
  }

  private finalizeResult(
    options: RecommendationOptions,
    items: TuffItem[],
    context: ContextSignal,
    startTime: number,
    fromCache: boolean
  ): RecommendationResult {
    this.publishNoveltyExposureTags(items)

    return {
      items,
      context,
      duration: performance.now() - startTime,
      fromCache,
      containerLayout: this.buildContainerLayout(options, items)
    }
  }

  private publishNoveltyExposureTags(items: TuffItem[]): void {
    const keys = items
      .filter((item) => {
        const recommendation = (item.meta as Record<string, unknown> | undefined)?.recommendation
        return (recommendation as { source?: string } | undefined)?.source === 'newly-installed'
      })
      .map((item) => toExposureKey(item))

    recommendationExposureService.setTaggedKeys(NEWLY_INSTALLED_EXPOSURE_TAG, keys)
  }

  private storeMemoryCache(
    generation: number,
    items: TuffItem[],
    context: ContextSignal,
    cacheKey: string
  ): boolean {
    if (generation !== this.cacheGeneration) {
      recommendationLog.debug('Discarded recommendation result invalidated mid-flight', {
        meta: { itemCount: items.length }
      })
      return false
    }

    this.recommendationCache = {
      items,
      timestamp: Date.now(),
      context,
      cacheKey
    }
    return true
  }

  private buildContainerLayout(
    _options: RecommendationOptions,
    items: TuffItem[]
  ): TuffContainerLayout {
    const sections: TuffContainerLayout['sections'] = []
    const grid = items.slice(0, GRID_TIER_COLUMNS)
    const proposed = items.slice(GRID_TIER_COLUMNS)
    if (grid.length > 0) {
      sections.push({
        id: 'habitual',
        title: i18nMsg('coreBox.sections.habitual'),
        layout: 'grid',
        itemIds: grid.map((item) => item.id)
      })
    }
    if (proposed.length > 0) {
      sections.push({
        id: 'proposed',
        title: i18nMsg('coreBox.sections.proposed'),
        layout: 'list',
        itemIds: proposed.map((item) => item.id)
      })
    }
    return {
      mode: 'grid',
      grid: { columns: GRID_TIER_COLUMNS, gap: 12, itemSize: 'medium' },
      sections
    }
  }

  private combineRecommendedWithPinned(
    recommendItems: TuffItem[],
    pinnedItems: TuffItem[],
    limit: number
  ): TuffItem[] {
    if (limit <= 0) return []

    const visiblePinnedItems = this.dedupeItems(pinnedItems).slice(0, limit)
    const pinnedIdentityKeys = new Set(visiblePinnedItems.map((item) => this.getItemIdentity(item)))
    const visibleRecommendItems = this.orderByFinalScore(
      this.dedupeItems(recommendItems).filter(
        (item) => !pinnedIdentityKeys.has(this.getItemIdentity(item))
      )
    ).slice(0, Math.max(0, limit - visiblePinnedItems.length))

    return [...visiblePinnedItems, ...visibleRecommendItems]
  }

  private orderByFinalScore(items: TuffItem[]): TuffItem[] {
    return items
      .map((item, index) => ({ item, index, score: item.scoring?.final ?? 0 }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map(({ item }) => item)
  }

  private async backfillShortfall(
    recommendItems: TuffItem[],
    pinnedItems: TuffItem[],
    limit: number,
    passCache?: PassCandidateReadCache
  ): Promise<TuffItem[]> {
    const budget = Math.max(0, limit - Math.min(pinnedItems.length, limit))
    const shortfall = budget - recommendItems.length
    if (shortfall <= 0) return recommendItems

    const taken = new Set(
      [...recommendItems, ...pinnedItems].map((item) => this.getItemIdentity(item))
    )
    const backfill = this.dedupeItems(await this.resolveFallbackItems(budget, passCache))
      .filter((item) => !taken.has(this.getItemIdentity(item)))
      .slice(0, shortfall)
    if (backfill.length === 0) return recommendItems

    const lowestSurviving = recommendItems.reduce(
      (lowest, item) => Math.min(lowest, item.scoring?.final ?? 0),
      Number.POSITIVE_INFINITY
    )
    const ceiling = Math.min(
      Number.isFinite(lowestSurviving) ? lowestSurviving : 0,
      COLD_START_BASE_SCORE
    )
    backfill.forEach((item, index) => {
      item.scoring = { ...item.scoring, final: ceiling - 1 - index }
    })

    recommendationLog.debug('Backfilled a partial recommendation rebuild', {
      meta: { rebuilt: recommendItems.length, backfilled: backfill.length, budget }
    })

    return [...recommendItems, ...backfill]
  }

  private async getPinnedItems(): Promise<ItemCandidate[]> {
    try {
      const pinnedRecords = await this.dbUtils.getAllPinnedItems()
      if (pinnedRecords.length === 0) return []

      const keys = pinnedRecords.map((p) => ({ sourceId: p.sourceId, itemId: p.itemId }))
      const usageStatsMap = new Map(
        (await this.dbUtils.getUsageStatsBatch(keys)).map((stat) => [
          `${stat.sourceId}:${stat.itemId}`,
          stat
        ])
      )

      return pinnedRecords.map((record) => {
        const key = `${record.sourceId}:${record.itemId}`
        const usageStats = usageStatsMap.get(key)
        return {
          sourceId: record.sourceId,
          itemId: record.itemId,
          sourceType: record.sourceType,
          usageStats: usageStats || {
            sourceId: record.sourceId,
            itemId: record.itemId,
            sourceType: record.sourceType,
            searchCount: 0,
            executeCount: 0,
            cancelCount: 0,
            lastSearched: null,
            lastExecuted: null,
            lastCancelled: null,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        }
      })
    } catch (error) {
      recommendationLog.warn('Failed to get pinned items', { meta: toErrorMeta(error) })
      return []
    }
  }

  private async getFallbackRecommendations(limit: number): Promise<TuffItem[]> {
    try {
      const frequentItems = await this.getFrequentItems(limit * 2)
      if (frequentItems.length === 0) {
        recommendationLog.debug('No frequent items found in database')
        return []
      }

      const behaviorByKey = await this.loadUsageBehaviorByKey(
        frequentItems.map((item) => ({ sourceId: item.sourceId, itemId: item.itemId }))
      )

      const items = await this.itemRebuilder.rebuildItems(
        frequentItems.map((item) => {
          const behavior = behaviorByKey.get(`${item.sourceId}:${item.itemId}`)
          return {
            ...item,
            behavior,
            source: this.resolveHonestReasonLabel('frequent', behavior),
            score: behavior ? calculateBehaviorScore(behavior) : 0
          }
        })
      )

      return items.slice(0, limit)
    } catch (error) {
      recommendationLog.warn('Fallback recommendation failed', { meta: toErrorMeta(error) })
      return []
    }
  }

  private async resolveFallbackItems(
    limit: number,
    passCache?: PassCandidateReadCache
  ): Promise<TuffItem[]> {
    const fallbackItems = await this.getFallbackRecommendations(limit)
    if (fallbackItems.length > 0) return fallbackItems
    return await this.getColdStartRecommendations(limit, passCache)
  }

  private async getColdStartRecommendations(
    limit: number,
    passCache?: PassCandidateReadCache
  ): Promise<TuffItem[]> {
    return await collectColdStartRecommendations(
      this.appCatalogDbUtils,
      this.itemRebuilder,
      limit,
      recommendationLog,
      passCache
    )
  }

  private async getNewlyInstalledItems(
    limit: number,
    passCache?: PassCandidateReadCache
  ): Promise<CandidateItem[]> {
    return await collectNewlyInstalledItems(
      this.dbUtils,
      this.appCatalogDbUtils,
      limit,
      recommendationLog,
      passCache
    )
  }

  private createCandidatePassCache(): PassCandidateReadCache {
    const warmCatalog =
      this.appActivityCatalog &&
      Date.now() - this.appActivityCatalog.builtAt < APP_ACTIVITY_CATALOG_TTL_MS
        ? this.appActivityCatalog
        : null
    return createPassCandidateReadCache(
      this.appCatalogDbUtils,
      (keys) => this.loadUsageBehaviorByKey(keys),
      warmCatalog
    )
  }

  private async getCandidates(
    context: ContextSignal,
    _options: RecommendationOptions,
    existingPassCache?: PassCandidateReadCache
  ): Promise<CandidateResult> {
    const passCache = existingPassCache ?? this.createCandidatePassCache()

    const candidates: CandidateItem[] = []
    const foreground = this.foregroundActivity?.view() ?? null

    const frequentItems = await this.getFrequentItems(30)
    recommendationLog.debug('Loaded frequent candidates', {
      meta: { count: frequentItems.length }
    })
    candidates.push(...frequentItems.map((item) => ({ ...item, source: 'frequent' as const })))

    const recentItems = await this.getRecentItems(20, foreground, passCache)
    recommendationLog.debug('Loaded recent candidates', {
      meta: { count: recentItems.length }
    })
    candidates.push(...recentItems.map((item) => ({ ...item, source: 'recent' as const })))

    const timeBasedItems =
      context.timeAvailable === false
        ? []
        : await this.getTimeBasedTopItems(context.time, 20, passCache)
    recommendationLog.debug('Loaded time-based candidates', {
      meta: { count: timeBasedItems.length }
    })
    candidates.push(...timeBasedItems.map((item) => ({ ...item, source: 'time-based' as const })))

    const trending = await this.getTrendingItems(15)
    const trendingItems = trending.items
    recommendationLog.debug('Loaded trending candidates', {
      meta: {
        count: trendingItems.length,
        durationMs: Math.round(trending.perf.durationMs),
        ready: trending.perf.ready
      }
    })
    candidates.push(...trendingItems.map((item) => ({ ...item, source: 'trending' as const })))

    const pluginCandidates = await this.getPluginCandidates(context)
    recommendationLog.debug('Loaded plugin candidates', {
      meta: { count: pluginCandidates.length }
    })
    candidates.push(...pluginCandidates)

    const newlyInstalled = await this.getNewlyInstalledItems(
      NEWLY_INSTALLED_CANDIDATE_LIMIT,
      passCache
    )
    recommendationLog.debug('Loaded newly installed candidates', {
      meta: { count: newlyInstalled.length }
    })
    candidates.push(...newlyInstalled)

    const newlyAddedFiles = await this.getNewlyAddedFileItems(NEWLY_ADDED_FILE_CANDIDATE_LIMIT)
    recommendationLog.debug('Loaded newly added file candidates', {
      meta: { count: newlyAddedFiles.length }
    })
    candidates.push(...newlyAddedFiles)

    candidates.push(...this.getBuiltinDestinationCandidates())

    const sceneCandidates = buildRecommendationContextCandidates(
      await this.dbUtils.getRecommendationHistory(),
      context
    )
    if (sceneCandidates.length > 0) {
      const sceneStats = new Map(
        (await this.dbUtils.getUsageStatsBatch(sceneCandidates)).map((stat) => [
          `${stat.sourceId}:${stat.itemId}`,
          stat
        ])
      )
      for (const scene of sceneCandidates) {
        const usageStats = sceneStats.get(`${scene.sourceId}:${scene.itemId}`)
        if (!usageStats) continue
        candidates.push({
          sourceId: scene.sourceId,
          itemId: scene.itemId,
          sourceType: scene.sourceType,
          source: scene.source,
          usageStats,
          contextScore: scene.score,
          contextEvidence: scene.evidence
        })
      }
    }

    recommendationLog.debug('Collected candidates before dedupe', {
      meta: { count: candidates.length }
    })

    const totalCandidates = candidates.length
    const deduplicated = deduplicateCandidates(candidates)

    const behaviorByKey = await passCache.loadBehaviorByKey(
      deduplicated.map((item) => ({ sourceId: item.sourceId, itemId: item.itemId }))
    )
    for (const item of deduplicated) {
      item.behavior = behaviorByKey.get(`${item.sourceId}:${item.itemId}`)
    }
    if (foreground) {
      await attachForegroundActivity(deduplicated, foreground, () =>
        this.loadAppActivityCatalog(passCache)
      )
    }

    const coldStart = !hasAnyUsageHistory(behaviorByKey)
    const filtered = coldStart ? deduplicated : admitExplorationWithinBudget(deduplicated)

    const sourceDistribution = new Map<string, number>()
    for (const item of filtered) {
      sourceDistribution.set(item.sourceId, (sourceDistribution.get(item.sourceId) ?? 0) + 1)
    }
    recommendationLog.debug('Filtered candidate distribution', {
      meta: {
        filteredCount: filtered.length,
        coldStart,
        sourceDistribution: JSON.stringify(Object.fromEntries(sourceDistribution))
      }
    })

    return {
      items: filtered,
      perf: {
        totalCandidates,
        filteredCount: filtered.length,
        coldStart,
        trendingDurationMs: trending.perf.durationMs,
        trendingRows: trending.perf.rowCount,
        trendingCandidates: trendingItems.length,
        trendingReady: trending.perf.ready
      }
    }
  }

  private getBuiltinDestinationCandidates(): CandidateItem[] {
    return collectBuiltinDestinationCandidates()
  }

  private async loadUsageBehaviorByKey(
    keys: Array<{ sourceId: string; itemId: string }>
  ): Promise<Map<string, UsageBehaviorRow>> {
    if (keys.length === 0) return new Map()
    try {
      const rows = await this.dbUtils.getUsageBehaviorBatch(keys)
      return new Map(rows.map((row) => [`${row.sourceId}:${row.itemId}`, row]))
    } catch (error) {
      recommendationLog.warn('Failed to load usage behaviour batch', {
        meta: { keyCount: keys.length, ...toErrorMeta(error) }
      })
      return new Map()
    }
  }

  private async getFrequentItems(limit: number): Promise<ItemCandidate[]> {
    const db = this.dbUtils.getDb()
    const stats = await db
      .select()
      .from(schema.itemUsageStats)
      .where(gt(schema.itemUsageStats.executeCount, 0))
      .orderBy(desc(schema.itemUsageStats.executeCount))
      .limit(limit)
      .all()

    return stats.map((stat) => ({
      sourceId: stat.sourceId,
      itemId: stat.itemId,
      sourceType: stat.sourceType,
      usageStats: stat
    }))
  }

  private resolveHonestReasonLabel(
    source: ScoredItem['source'],
    behavior: UsageBehaviorFacts | undefined
  ): ScoredItem['source'] {
    return resolveEvidenceBackedReason(source, behavior)
  }

  private async getRecentItems(
    limit: number,
    foreground: ForegroundActivityView | null = null,
    passCache?: PassCandidateReadCache
  ): Promise<ItemCandidate[]> {
    const db = this.dbUtils.getDb()
    const stats = await db
      .select()
      .from(schema.itemUsageStats)
      .where(gt(schema.itemUsageStats.executeCount, 0))
      .orderBy(desc(schema.itemUsageStats.lastExecuted))
      .limit(limit * 3)
      .all()

    const statsKeys = stats.map((stat) => ({ sourceId: stat.sourceId, itemId: stat.itemId }))
    const behaviorByKey =
      statsKeys.length > 0
        ? passCache
          ? await passCache.loadBehaviorByKey(statsKeys)
          : await this.loadUsageBehaviorByKey(statsKeys)
        : new Map<string, UsageBehaviorRow>()

    const ranked = new Map<string, { candidate: ItemCandidate; lastUsedAt: number }>()
    for (const stat of stats) {
      const key = `${stat.sourceId}:${stat.itemId}`
      const lastExecutedAt = behaviorByKey.get(key)?.lastExecutedAt
      if (lastExecutedAt == null) continue
      ranked.set(key, {
        candidate: {
          sourceId: stat.sourceId,
          itemId: stat.itemId,
          sourceType: stat.sourceType,
          usageStats: stat
        },
        lastUsedAt: lastExecutedAt
      })
    }

    const foregroundCandidates = await collectForegroundRecentCandidates(
      this.dbUtils,
      foreground,
      () => this.loadAppActivityCatalog(passCache),
      recommendationLog
    )
    for (const entry of foregroundCandidates) {
      const key = `${entry.candidate.sourceId}:${entry.candidate.itemId}`
      const known = ranked.get(key)
      if (known) known.lastUsedAt = Math.max(known.lastUsedAt, entry.lastActiveAt)
      else ranked.set(key, { candidate: entry.candidate, lastUsedAt: entry.lastActiveAt })
    }

    return [...ranked.values()]
      .sort((left, right) => right.lastUsedAt - left.lastUsedAt)
      .slice(0, limit)
      .map(({ candidate }) => candidate)
  }

  private async loadAppActivityCatalog(
    passCache?: PassCandidateReadCache
  ): Promise<AppActivityCatalog> {
    const cached = this.appActivityCatalog
    if (cached && Date.now() - cached.builtAt < APP_ACTIVITY_CATALOG_TTL_MS) return cached

    const { catalog, ok } = await buildAppActivityCatalog(
      this.appCatalogDbUtils,
      recommendationLog,
      passCache
    )
    if (!ok) return cached ?? catalog

    this.appActivityCatalog = catalog
    return catalog
  }

  private async getTimeBasedTopItems(
    timePattern: TimePattern,
    limit: number,
    passCache?: PassCandidateReadCache
  ): Promise<ItemCandidate[]> {
    return await collectTimeBasedTopItems(
      this.dbUtils,
      timePattern,
      limit,
      passCache
        ? (keys) => passCache.loadBehaviorByKey(keys)
        : (keys) => this.loadUsageBehaviorByKey([...keys])
    )
  }

  private async getNewlyAddedFileItems(limit: number): Promise<CandidateItem[]> {
    return await collectNewlyAddedFileItems(this.dbUtils, limit, recommendationLog)
  }

  private async getPluginCandidates(context: ContextSignal): Promise<CandidateItem[]> {
    if (this.pluginProviders.size === 0) return []

    const settled = await Promise.all(
      Array.from(this.pluginProviders.values(), async ({ provider }) => {
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          const result = await Promise.race([
            (async () =>
              (await provider.canProvide(context)) ? provider.getCandidates(context) : [])(),
            new Promise<PluginRecommendCandidate[]>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error(`Provider ${provider.id} timed out`)),
                PLUGIN_PROVIDER_TIMEOUT_MS
              )
            })
          ])

          return result.slice(0, PLUGIN_CANDIDATES_PER_PROVIDER_LIMIT).map((candidate) => ({
            sourceId: `plugin-recommend:${provider.id}`,
            itemId: candidate.id,
            sourceType: 'plugin-recommend' as const,
            usageStats: EMPTY_USAGE_STATS,
            source: 'plugin' as const,
            pluginCandidate: {
              ...candidate,
              providerId: provider.id
            }
          }))
        } catch (error) {
          recommendationLog.warn('Plugin recommendation provider failed', {
            meta: { providerId: provider.id, ...toErrorMeta(error) }
          })
          return []
        } finally {
          if (timer) clearTimeout(timer)
        }
      })
    )

    const candidates = settled.flat().slice(0, PLUGIN_CANDIDATES_TOTAL_LIMIT)

    this.pluginSnapshots.clear()
    for (const candidate of candidates) {
      if (candidate.source !== 'plugin' || !candidate.pluginCandidate) continue
      const providerId = candidate.pluginCandidate.providerId
      if (!providerId) continue
      let snapshot = this.pluginSnapshots.get(providerId)
      if (!snapshot) {
        snapshot = new Map()
        this.pluginSnapshots.set(providerId, snapshot)
      }
      snapshot.set(candidate.itemId, { candidate: candidate.pluginCandidate })
    }

    return this.hydratePluginUsageStats(candidates)
  }

  private async hydratePluginUsageStats(candidates: CandidateItem[]): Promise<CandidateItem[]> {
    if (candidates.length === 0) return candidates

    try {
      const rows = await this.dbUtils.getUsageStatsBatch(
        candidates.map((candidate) => ({
          sourceId: candidate.sourceId,
          itemId: candidate.itemId
        }))
      )
      if (rows.length === 0) return candidates

      const byKey = new Map(rows.map((row) => [`${row.sourceId}:${row.itemId}`, row]))
      return candidates.map((candidate) => {
        const usageStats = byKey.get(`${candidate.sourceId}:${candidate.itemId}`)
        return usageStats ? { ...candidate, usageStats } : candidate
      })
    } catch (error) {
      recommendationLog.warn('Failed to hydrate plugin candidate usage stats', {
        meta: { candidateCount: candidates.length, ...toErrorMeta(error) }
      })
      return candidates
    }
  }

  private async getClipboardUrlCandidates(context: ContextSignal): Promise<CandidateItem[]> {
    this.builtinClipboardSnapshots.clear()

    if (!context.clipboard?.meta?.isUrl || !context.clipboard.content) return []

    const url = await this.readClipboardUrlMatching(context.clipboard.content)
    if (!url) return []

    const card: PluginRecommendCandidate = {
      id: `clipboard-url-open:${url}`,
      title: builtinClipboardUrlTitle(),
      subtitle: url.length > 60 ? `${url.substring(0, 57)}...` : url,
      icon: { type: 'class', value: 'i-ri-links-line' },
      priority: 95,
      action: 'open-url',
      data: { url }
    }
    this.builtinClipboardSnapshots.clear()
    this.builtinClipboardSnapshots.set(card.id, { candidate: card })

    return [
      {
        sourceId: BUILTIN_CLIPBOARD_URL_SOURCE_ID,
        itemId: card.id,
        sourceType: 'action',
        usageStats: EMPTY_USAGE_STATS,
        source: 'context',
        pluginCandidate: card
      }
    ]
  }

  private async readClipboardUrlMatching(expectedDigest: string): Promise<string | null> {
    try {
      const { clipboardModule } = await import('../../../clipboard')
      const latest = clipboardModule.getLatestItem()
      const content = latest?.content

      if (!content) return null
      return hashContextContent(content) === expectedDigest ? content : null
    } catch {
      return null
    }
  }

  private async getTrendingItems(limit: number): Promise<TrendingResult> {
    this.scheduleTrendBackfill()
    return await queryTrendingItems(this.dbUtils, limit, (eventType, metadata) =>
      this.recordRecommendationPerf(eventType, metadata)
    )
  }

  private async scoreAndRank(
    candidates: CandidateItem[],
    context: ContextSignal,
    semanticSettings: RecommendationSemanticSettings
  ): Promise<ScoredItem[]> {
    const scored: ScoredItem[] = []
    const semanticProfile =
      semanticSettings.localVectorEnabled ||
      semanticSettings.aiEmbeddingEnabled ||
      semanticSettings.aiRerankEnabled
        ? buildRecommendationSemanticProfile(context)
        : null

    for (const candidate of candidates) {
      const score = await this.calculateRecommendationScore(
        candidate,
        context,
        semanticSettings,
        semanticProfile
      )
      scored.push({ ...candidate, score })
    }

    const locallySorted = scored.sort((a, b) => b.score - a.score)
    const embedded = await this.semanticScorer.applyAiEmbeddingScores(
      locallySorted,
      semanticProfile,
      semanticSettings
    )
    return await this.semanticScorer.applyAiRerank(embedded, semanticProfile, semanticSettings)
  }

  private async calculateRecommendationScore(
    candidate: CandidateItem,
    context: ContextSignal,
    semanticSettings: RecommendationSemanticSettings,
    semanticProfile: RecommendationSemanticProfile | null
  ): Promise<number> {
    if (candidate.sourceId === BUILTIN_CLIPBOARD_URL_SOURCE_ID && candidate.pluginCandidate) {
      return (candidate.pluginCandidate.priority ?? 95) * HOST_CONTEXT_PRIORITY_WEIGHT
    }

    let score = 0

    if (candidate.source === 'plugin' && candidate.pluginCandidate) {
      score +=
        calculatePluginPriorityContribution(candidate.pluginCandidate.priority) *
        BEHAVIOR_SCORE_WEIGHT
    }

    if (candidate.sourceId === APP_DESTINATION_PROVIDER_ID && candidate.source === 'cold-start') {
      score += BUILTIN_DESTINATION_SCORE_MAX
    }

    const lastUsedAt = resolveLastUsedAt(
      candidate.behavior?.lastExecutedAt,
      candidate.lastActiveAt,
      Date.now()
    )
    const recencyBoost = lastUsedAt !== null ? this.calculateRecencyBoost(new Date(lastUsedAt)) : 0
    const timeContribution =
      candidate.behavior && context.timeAvailable !== false
        ? calculateTimeContribution(candidate.behavior, context.time)
        : 0
    const automaticBudget =
      (candidate.behavior ? calculateBehaviorScore(candidate.behavior) : 0) +
      timeContribution +
      recencyBoost
    score += Math.min(BEHAVIOR_SCORE_MAX, automaticBudget) * BEHAVIOR_SCORE_WEIGHT
    score +=
      Math.min(RECOMMENDATION_CONTEXT_SCORE_MAX, Math.max(0, candidate.contextScore ?? 0)) *
      BEHAVIOR_SCORE_WEIGHT

    if (candidate.firstSeenAt !== undefined && candidate.usageStats.executeCount === 0) {
      score += calculateNoveltyFactor(Date.now() - candidate.firstSeenAt) * NOVELTY_WEIGHT
    }

    if (semanticSettings.localVectorEnabled && semanticProfile) {
      const candidateProfile = buildCandidateSemanticProfile(toSemanticCandidateInput(candidate))
      score +=
        calculateLocalSemanticScore(semanticProfile, candidateProfile) * SEMANTIC_LOCAL_WEIGHT
    }

    return score
  }

  private calculateRecencyBoost(lastUsed: Date | null): number {
    if (!lastUsed) return 0
    const hoursSince = (Date.now() - lastUsed.getTime()) / (1000 * 60 * 60)
    return 10 * Math.exp(-0.1 * Math.max(0, hoursSince))
  }

  private applyDiversityFilter(scored: ScoredItem[], limit: number): ScoredItem[] {
    return applyDiversityFilter(scored, limit)
  }

  private async getRecommendationSemanticSettings(): Promise<RecommendationSemanticSettings> {
    return await loadRecommendationSemanticSettings(recommendationLog)
  }

  private buildRecommendationCacheKey(
    context: ContextSignal,
    semanticSettings: RecommendationSemanticSettings,
    pinnedCacheSignature = ''
  ): string {
    const baseKey = this.contextProvider.generateCacheKey(context)
    const segments = [
      `reco-v${RECOMMENDATION_CACHE_SCHEMA_VERSION}`,
      baseKey,
      `pin:${pinnedCacheSignature || 'none'}`
    ]
    if (!isDefaultRecommendationSemanticSettings(semanticSettings)) {
      segments.push(
        `sem:local${semanticSettings.localVectorEnabled ? 1 : 0}`,
        `aiEmb${semanticSettings.aiEmbeddingEnabled ? 1 : 0}`,
        `aiRank${semanticSettings.aiRerankEnabled ? 1 : 0}`
      )
    }

    return segments.join('|')
  }

  private buildPinnedCacheSignature(pinnedItems: ItemCandidate[]): string {
    if (pinnedItems.length === 0) return ''

    const signaturePayload = pinnedItems.map((item) => ({
      sourceId: item.sourceId,
      itemId: item.itemId,
      sourceType: item.sourceType
    }))

    return createHash('sha256').update(JSON.stringify(signaturePayload)).digest('hex').slice(0, 16)
  }

  private async applyVolatileContextRerank(
    items: TuffItem[],
    context: ContextSignal,
    limit: number
  ): Promise<TuffItem[]> {
    if (limit <= 0) return []

    const pinnedItems = items.filter((item) => item.meta?.pinned?.isPinned)
    const recommendItems = items.filter((item) => !item.meta?.pinned?.isPinned)

    const [clipboardCandidates, semanticHits] = await Promise.all([
      this.getClipboardUrlCandidates(context),
      this.semanticScorer.recallContextualFiles(context)
    ])

    const semanticScoreByPath = new Map<string, number>()
    for (const hit of semanticHits) {
      if (!isSensitiveFilePath(hit.path)) {
        semanticScoreByPath.set(hit.path, calculateContextualSemanticFileScore(hit.score))
      }
    }

    const rescored = recommendItems.map((item) => {
      const stableScore = this.readStableScore(item)
      const volatileCandidate = this.toVolatileCandidate(item)
      const baseVolatileBonus =
        Math.max(-100, Math.min(100, this.calculateContextMatch(volatileCandidate, context))) *
        CONTEXT_MATCH_WEIGHT
      const semanticTargetScore =
        semanticScoreByPath.get(volatileCandidate.itemId) ?? semanticScoreByPath.get(item.id)
      const volatileScore =
        semanticTargetScore !== undefined
          ? Math.max(baseVolatileBonus, semanticTargetScore - stableScore)
          : baseVolatileBonus
      return this.withScores(item, stableScore, volatileScore)
    })

    const volatileItems = await this.buildVolatileItems(context, items, {
      clipboardCandidates,
      semanticHits
    })
    const withVolatileCandidates = [...rescored, ...volatileItems]

    return this.combineRecommendedWithPinned(withVolatileCandidates, pinnedItems, limit)
  }

  private async buildVolatileItems(
    context: ContextSignal,
    existingItems: TuffItem[],
    preloaded?: {
      clipboardCandidates: CandidateItem[]
      semanticHits: ContextualSemanticFileHit[]
    }
  ): Promise<TuffItem[]> {
    const [clipboardCandidates, semanticHits] = preloaded
      ? [preloaded.clipboardCandidates, preloaded.semanticHits]
      : await Promise.all([
          this.getClipboardUrlCandidates(context),
          this.semanticScorer.recallContextualFiles(context)
        ])
    return await this.buildVolatileItemsFromSignals(
      clipboardCandidates,
      semanticHits,
      existingItems
    )
  }

  private async buildVolatileItemsFromSignals(
    clipboardCandidates: CandidateItem[],
    semanticHits: ContextualSemanticFileHit[],
    existingItems: TuffItem[]
  ): Promise<TuffItem[]> {
    const existingKeys = new Set(existingItems.map((item) => this.getItemIdentity(item)))
    const existingFilePaths = new Set<string>()
    for (const item of existingItems) {
      if (item.id) existingFilePaths.add(item.id)
      const origId = (item.meta as Record<string, unknown> | undefined)?._originalItemId
      if (typeof origId === 'string') existingFilePaths.add(origId)
    }

    const scoredCandidates: ScoredItem[] = clipboardCandidates.map((candidate) => ({
      ...candidate,
      score: (candidate.pluginCandidate?.priority ?? 95) * PLUGIN_PRIORITY_WEIGHT
    }))

    for (const hit of semanticHits) {
      if (isSensitiveFilePath(hit.path) || existingFilePaths.has(hit.path)) continue
      scoredCandidates.push({
        sourceId: FILE_RECOMMENDATION_SOURCE_ID,
        itemId: hit.path,
        sourceType: 'file',
        usageStats: EMPTY_USAGE_STATS,
        source: 'context',
        score: calculateContextualSemanticFileScore(hit.score)
      })
    }

    if (scoredCandidates.length === 0) return []

    try {
      const rebuilt = await this.itemRebuilder.rebuildItems(scoredCandidates)
      return rebuilt.filter((item) => {
        if (existingKeys.has(this.getItemIdentity(item))) return false
        const candidatePath =
          typeof (item.meta as Record<string, unknown> | undefined)?._originalItemId === 'string'
            ? ((item.meta as Record<string, unknown>)._originalItemId as string)
            : item.id
        return !isSensitiveFilePath(candidatePath)
      })
    } catch (error) {
      recommendationLog.debug('Failed to build volatile context items', {
        meta: toErrorMeta(error)
      })
      return []
    }
  }

  private readStableScore(item: TuffItem): number {
    const stableScore = item.meta?.recommendation?.stableScore
    if (typeof stableScore === 'number') return stableScore
    return item.scoring?.final ?? 0
  }

  private withScores(item: TuffItem, stableScore: number, volatileScore: number): TuffItem {
    const recommendation = item.meta?.recommendation ?? { source: 'frequent' as const }

    return {
      ...item,
      meta: {
        ...item.meta,
        recommendation: { ...recommendation, stableScore, volatileScore }
      },
      scoring: { ...item.scoring, final: stableScore + volatileScore }
    }
  }

  private toVolatileCandidate(item: TuffItem): VolatileCandidate {
    const meta = item.meta as Record<string, unknown> | undefined
    const originalSourceId = meta?._originalSourceId
    const originalItemId = meta?._originalItemId

    return {
      sourceId: typeof originalSourceId === 'string' ? originalSourceId : item.source.id,
      itemId: typeof originalItemId === 'string' ? originalItemId : item.id,
      sourceType: item.source.type
    }
  }

  private calculateContextMatch(candidate: VolatileCandidate, context: ContextSignal): number {
    return calculateContextMatch(candidate, context)
  }

  private getItemIdentity(item: TuffItem): string {
    const meta = item.meta
    const sourceId = item.source?.id || 'unknown'
    const appMeta = meta?.app
    if (appMeta?.bundleId) {
      return `${sourceId}:bundle:${appMeta.bundleId}`
    }
    if (appMeta?.path) {
      return `${sourceId}:path:${appMeta.path}`
    }
    const systemActionId = (meta?.raw as { systemActionId?: string } | undefined)?.systemActionId
    if (systemActionId) {
      return `${sourceId}:system:${systemActionId}`
    }
    const metaRecord = meta as Record<string, unknown> | undefined
    const originalSourceId = metaRecord?._originalSourceId
    const originalItemId = metaRecord?._originalItemId
    if (typeof originalSourceId === 'string' && typeof originalItemId === 'string') {
      return `${originalSourceId}:${originalItemId}`
    }
    if (item.id) {
      return `${sourceId}:${item.id}`
    }
    return sourceId
  }

  private dedupeItems(items: TuffItem[]): TuffItem[] {
    const seen = new Set<string>()
    const result: TuffItem[] = []

    for (const item of items) {
      const key = this.getItemIdentity(item)
      if (seen.has(key)) continue
      seen.add(key)
      result.push(item)
    }

    return result
  }

  private async getCachedRecommendations(
    context: ContextSignal,
    semanticSettings: RecommendationSemanticSettings,
    pinnedCacheSignature = ''
  ): Promise<{ items: TuffItem[] } | null> {
    const cacheKey = this.buildRecommendationCacheKey(
      context,
      semanticSettings,
      pinnedCacheSignature
    )
    const cached = await this.dbUtils.getRecommendationCache(cacheKey)

    if (!cached) return null
    if (cached.expiresAt.getTime() < Date.now()) return null
    if (cached.createdAt.getTime() < this.cacheInvalidatedAt) return null

    try {
      const items = JSON.parse(cached.recommendedItems)
      return { items: this.dedupeItems(items) }
    } catch (error) {
      recommendationLog.warn('Failed to parse cached recommendations', { meta: toErrorMeta(error) })
      return null
    }
  }

  private async cacheRecommendations(
    context: ContextSignal,
    semanticSettings: RecommendationSemanticSettings,
    pinnedCacheSignature: string,
    items: TuffItem[]
  ): Promise<void> {
    const cacheKey = this.buildRecommendationCacheKey(
      context,
      semanticSettings,
      pinnedCacheSignature
    )
    const expiresAt = new Date(Date.now() + this.CACHE_DURATION_MS)

    void this.dbUtils.setRecommendationCache(cacheKey, items, expiresAt).catch((error) => {
      recommendationLog.debug('Failed to persist recommendation cache', {
        meta: toErrorMeta(error)
      })
    })
  }
}

export interface RecommendationOptions {
  limit?: number
  forceRefresh?: boolean
  includeTypes?: string[]
  excludeTypes?: string[]
  layoutMode?: 'list' | 'grid'
}

export interface RecommendationResult {
  items: TuffItem[]
  context: ContextSignal
  duration: number
  fromCache: boolean
  containerLayout?: TuffContainerLayout
}

interface CandidateResult {
  items: CandidateItem[]
  perf: {
    totalCandidates: number
    filteredCount: number
    coldStart: boolean
    trendingDurationMs: number
    trendingRows: number
    trendingCandidates: number
    trendingReady: boolean
  }
}
