import type { TuffContainerLayout, TuffItem } from '@talex-touch/utils'
import type { PluginRecommendCandidate, RecommendProvider } from '@talex-touch/utils/core-box'
import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import type { DbUtils } from '../../../../db/utils'
import type { ParsedItemTimeStats } from '../time-stats-aggregator'
import type { ContextSignal, TimePattern } from './context-provider'
import { createHash } from 'node:crypto'
import { StorageList } from '@talex-touch/utils'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { appTaskGate } from '../../../../service/app-task-gate'
import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm'
import { scheduleAuxWrite, scheduleDbWrite } from '../../../../db/db-write'
import { getStartupDegradeWindowRemainingMs } from '../../../../db/runtime-flags'
import * as schema from '../../../../db/schema'
import { getSentryService } from '../../../sentry'
import { ContextProvider } from './context-provider'
import { ItemRebuilder } from './item-rebuilder'
import { isSameAppIdentity, matchesAppRule, type AppMatchRule } from './app-identity-match'
import { recommendationExposureService } from './recommendation-exposure-service'
import { enterPerfContext } from '../../../../utils/perf-context'
import { createLogger } from '../../../../utils/logger'
import {
  DAY_MS,
  calculateTimeRelevanceScore,
  toDayBucket,
  toErrorMeta,
  toPrimitive,
  type LogMeta
} from './recommendation-utils'
import {
  UsageSourceIdentityMigration,
  USAGE_SOURCE_IDENTITY_CONFIG_KEY,
  type ItemTimeStatsKey,
  type ItemTimeStatsMigrationPlan,
  type ItemTimeStatsRow,
  type UsageTrendKey,
  type UsageTrendMigrationPlan,
  type UsageTrendRow
} from '../usage-source-identity-migration'
import {
  buildCandidateSemanticProfile,
  buildRecommendationSemanticProfile,
  buildRecommendationUsageAvoidanceProfile,
  buildRecommendationUsagePreferenceProfile,
  calculateLocalSemanticScore,
  type RecommendationSemanticCandidateInput,
  type RecommendationSemanticProfile
} from './semantic-profile'

export { calculateTimeContextBoost, calculateTimeRelevanceScore } from './recommendation-utils'

const TREND_HISTORY_DAYS = 30
const TREND_RECENT_DAYS = 7
const TREND_BACKFILL_INTERVAL_SECONDS = 2
const RECOMMENDATION_PERF_WINDOW_MS = 60 * 60 * 1000
const RECOMMENDATION_PERF_SAMPLE_LIMIT = 2000
const RECOMMENDATION_TELEMETRY_INTERVAL_MS = 10 * 60 * 1000
const RECOMMENDATION_QUERY_BUDGET_MS = 50
const RECOMMENDATION_PERF_PLUGIN = 'core'
const PLUGIN_PROVIDER_TIMEOUT_MS = 200
const USAGE_IDENTITY_MIGRATION_INITIAL_DELAY_MS = 20_000
const CONTEXT_MATCH_WEIGHT = 1e6
const PLUGIN_PRIORITY_WEIGHT = 1e5
/**
 * A captured selection is the same privacy tier as the clipboard but a weaker
 * intent signal — it is often minutes old and was captured for another action.
 */
const SELECTION_CONTEXT_WEIGHT = 0.6
/** Cold-start items rank below anything with real usage but above nothing at all. */
const COLD_START_BASE_SCORE = 1e3
/**
 * Novelty channel for freshly installed apps. Frecency scores a brand-new item
 * at exactly zero, so without an explicit exploration channel an app the user
 * just installed can never outrank their habits. 1e7 clears the frequency term
 * (`executeCount * 1e4`) until ~1000 executes, and stays under the volatile
 * context match (~1e8) on purpose: an explicit clipboard intent outranks news.
 */
const NOVELTY_WEIGHT = 1e7
/** Full-strength window after install. */
const NOVELTY_FULL_WINDOW_MS = 48 * 60 * 60 * 1000
/** Novelty is gone past this age, and freshness gating uses the same horizon. */
const NOVELTY_MAX_AGE_MS = 7 * DAY_MS
/** Candidate slots reserved for the freshness dimension. */
const NEWLY_INSTALLED_CANDIDATE_LIMIT = 10
/**
 * `file_extensions` key holding the app's filesystem creation time, written
 * once by the app provider and never refreshed (a self-update rebuilds the
 * bundle and would otherwise read as a fresh install).
 */
const INSTALLED_AT_EXTENSION_KEY = 'installedAt'
/** Exposure slice tag for measuring the novelty channel separately. */
const NEWLY_INSTALLED_EXPOSURE_TAG = 'newly-installed'
const SEMANTIC_LOCAL_WEIGHT = 6e5
const SEMANTIC_USAGE_PREFERENCE_WEIGHT = 3.5e5
const SEMANTIC_USAGE_AVOIDANCE_WEIGHT = 5e5
const SEMANTIC_AI_EMBEDDING_WEIGHT = 4e5
const SEMANTIC_AI_RERANK_WEIGHT = 3e5
const SEMANTIC_AI_RERANK_ORDER_WEIGHT = 1e4
const SEMANTIC_AI_TIMEOUT_MS = 800
const AI_EMBEDDING_CANDIDATE_LIMIT = 8
const AI_RERANK_CANDIDATE_LIMIT = 12
const DEFAULT_RECOMMENDATION_SEMANTIC_SETTINGS: RecommendationSemanticSettings = {
  localVectorEnabled: true,
  aiRerankEnabled: false,
  aiEmbeddingEnabled: false
}
const recommendationLog = createLogger('RecommendationEngine')

/**
 * Category tables for context matching. `names` exist because candidate ids are
 * often absolute paths rather than bundle ids (see app-identity-match).
 */
const APP_MATCH_RULES = {
  browser: {
    bundleIds: [
      'com.google.Chrome',
      'com.apple.Safari',
      'org.mozilla.firefox',
      'com.microsoft.edgemac',
      'com.brave.Browser',
      'com.operasoftware.Opera'
    ],
    names: ['chrome', 'safari', 'firefox', 'microsoft edge', 'brave browser', 'opera', 'arc']
  },
  entertainment: {
    bundleIds: [
      'spotify',
      'music',
      'netease',
      'qqmusic',
      'youtube',
      'netflix',
      'discord',
      'telegram',
      'wechat',
      'slack',
      'twitter',
      'x.com'
    ],
    names: [
      'spotify',
      'music',
      '网易云音乐',
      'qq音乐',
      'youtube',
      'netflix',
      'discord',
      'telegram',
      'wechat',
      '微信',
      'slack'
    ]
  },
  editor: {
    bundleIds: [
      'com.microsoft.VSCode',
      'com.sublimetext',
      'com.jetbrains',
      'com.barebones.bbedit',
      'com.vim',
      'com.neovim',
      'com.textmate'
    ],
    names: ['visual studio code', 'vscodium', 'cursor', 'sublime text', 'bbedit', 'textmate', 'zed']
  },
  image: {
    bundleIds: [
      'com.adobe.Photoshop',
      'com.adobe.illustrator',
      'com.adobe.AfterEffects',
      'com.bohemiancoding.sketch',
      'com.figma.Desktop',
      'com.pixelmatorteam.pixelmator',
      'com.apple.Preview',
      'com.gimp',
      'com.serif.affinity.photo',
      'com.serif.affinity.designer',
      'com.krita',
      'com.procreate',
      'com.canva'
    ],
    names: [
      'photoshop',
      'illustrator',
      'after effects',
      'sketch',
      'figma',
      'pixelmator',
      'preview',
      '预览',
      'gimp',
      'affinity',
      'krita',
      'canva'
    ]
  },
  vscode: {
    bundleIds: ['com.microsoft.VSCode', 'VSCodium'],
    names: ['visual studio code', 'vscodium', 'code']
  },
  textEditor: {
    bundleIds: [
      'com.apple.TextEdit',
      'com.sublimetext',
      'com.barebones.bbedit',
      'com.coteditor.CotEditor',
      'com.typora'
    ],
    names: ['textedit', '文本编辑', 'sublime text', 'bbedit', 'coteditor', 'typora']
  },
  fileManager: {
    bundleIds: ['com.apple.finder', 'com.coderforart.MWeb', 'com.agilebits'],
    names: ['finder', '访达', 'mweb', 'forklift', 'path finder']
  },
  ide: {
    bundleIds: [
      'com.microsoft.VSCode',
      'com.jetbrains',
      'com.apple.dt.Xcode',
      'com.android.studio'
    ],
    names: [
      'visual studio code',
      'vscodium',
      'cursor',
      'xcode',
      'android studio',
      'intellij',
      'pycharm',
      'webstorm',
      'goland',
      'rider',
      'clion',
      'rustrover',
      'datagrip',
      'phpstorm'
    ]
  },
  terminal: {
    bundleIds: [
      'com.apple.Terminal',
      'com.googlecode.iterm2',
      'com.github.wez.wezterm',
      'io.alacritty',
      'net.kovidgoyal.kitty'
    ],
    names: ['terminal', '终端', 'iterm', 'wezterm', 'alacritty', 'kitty', 'warp', 'ghostty']
  },
  apiClient: {
    bundleIds: ['postman', 'insomnia'],
    names: ['postman', 'insomnia', 'apifox']
  },
  downloadTool: {
    bundleIds: ['download', 'aria'],
    names: ['downie', 'motrix', 'aria2', 'folx', 'free download manager', 'thunder', '迅雷']
  }
} as const satisfies Record<string, AppMatchRule>

/**
 * App candidates reach scoring with either source type: `item_usage_stats`
 * stores `item.source.type` (`'application'` for the app provider), while
 * plugin/builtin candidates and tests use the short `'app'`. Gating on one
 * spelling silently disabled context matching for every real app row.
 */
function isAppSourceType(sourceType: string): boolean {
  return sourceType === 'app' || sourceType === 'application'
}

/**
 * Newest-first ordering for the cold-start catalog. The app provider's
 * `installedAt` stamp is the real install moment; `ctime` (first indexed) and
 * `mtime` only approximate it — on a first full scan every row shares one
 * ctime batch, which made the cold-start order close to random.
 */
function resolveInstallTime(
  app: { ctime?: Date | null; mtime?: Date | null },
  installedAt?: number
): number {
  return installedAt ?? app.ctime?.getTime() ?? app.mtime?.getTime() ?? 0
}

/** Parse an `installedAt` extension value; anything unusable reads as absent. */
function parseInstalledAt(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/**
 * Full strength for the first 48h, then a linear fade to zero at 7 days.
 * Negative ages (clock skew) count as brand new rather than wrapping around.
 */
export function calculateNoveltyFactor(ageMs: number): number {
  if (ageMs <= NOVELTY_FULL_WINDOW_MS) return 1
  if (ageMs >= NOVELTY_MAX_AGE_MS) return 0
  return 1 - (ageMs - NOVELTY_FULL_WINDOW_MS) / (NOVELTY_MAX_AGE_MS - NOVELTY_FULL_WINDOW_MS)
}

/**
 * Exposure identity, mirroring what the renderer reports
 * (`_originalSourceId:_originalItemId`, falling back to the rendered ids) so a
 * tagged key matches the key the exposure service receives.
 */
function toExposureKey(item: TuffItem): string {
  const meta = item.meta as Record<string, unknown> | undefined
  const sourceId =
    typeof meta?._originalSourceId === 'string' ? meta._originalSourceId : item.source?.id
  const itemId = typeof meta?._originalItemId === 'string' ? meta._originalItemId : item.id
  return `${sourceId}:${itemId}`
}

const JETBRAINS_MATCH_RULES: Record<string, AppMatchRule> = {
  idea: { bundleIds: ['com.jetbrains.intellij'], names: ['intellij idea'] },
  pycharm: { bundleIds: ['com.jetbrains.pycharm'], names: ['pycharm'] },
  webstorm: { bundleIds: ['com.jetbrains.webstorm'], names: ['webstorm'] },
  'android-studio': { bundleIds: ['com.google.android.studio'], names: ['android studio'] },
  goland: { bundleIds: ['com.jetbrains.goland'], names: ['goland'] },
  rider: { bundleIds: ['com.jetbrains.rider'], names: ['rider'] }
}

function toLogMeta(meta?: Record<string, unknown>): LogMeta | undefined {
  if (!meta) return undefined
  return Object.fromEntries(Object.entries(meta).map(([key, value]) => [key, toPrimitive(value)]))
}

export class RecommendationEngine {
  private contextProvider: ContextProvider
  private itemRebuilder: ItemRebuilder

  private recommendationCache: {
    items: TuffItem[]
    timestamp: number
    context: ContextSignal
    cacheKey: string
  } | null = null

  /** Bumped by `invalidateCache`; in-flight `recommend()` calls compare against it. */
  private cacheGeneration = 0
  /** Persisted rows older than this were invalidated and must not be read back. */
  private cacheInvalidatedAt = 0

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
  private usageIdentityMigrationScheduled = false

  /** Plugin-registered recommendation providers */
  private pluginProviders: Map<string, { pluginName: string; provider: RecommendProvider }> =
    new Map()

  /**
   * Semantic-AI circuit breaker. A missing/broken provider makes embedding &
   * rerank invokes hang (~50s) and pile up across refreshes; after repeated
   * failures we skip semantic AI for a cooldown instead of re-hammering it.
   */
  private semanticAiFailures = 0
  private semanticAiCooldownUntil = 0
  private static readonly SEMANTIC_AI_FAILURE_THRESHOLD = 3
  private static readonly SEMANTIC_AI_COOLDOWN_MS = 5 * 60 * 1000

  /**
   * `appCatalogDbUtils` is a primary-bound handle for rebuilding APP items:
   * the app catalog stays on the primary db under the search split, while the
   * split-aware `dbUtils` reads FILE rows from the worker-owned search file.
   * Defaults to `dbUtils` (split off → identical).
   */
  constructor(
    private dbUtils: DbUtils,
    private appCatalogDbUtils: DbUtils = dbUtils
  ) {
    this.contextProvider = new ContextProvider()
    this.itemRebuilder = new ItemRebuilder(dbUtils, appCatalogDbUtils)

    this.startBackgroundRefresh()
    this.startTelemetryReport()
    this.scheduleUsageIdentityMigration()
  }

  /**
   * Boot-time maintenance writer (database-write-contracts §7): the one-time
   * source-identity repair waits out the startup degrade window so its writes
   * never join the startup write storm. The pass is idempotent and self-gated
   * on a config version, so a re-schedule is harmless.
   *
   * It may interleave with the trend backfill, which reads the same logs: the
   * pass re-keys `usage_logs` before it touches `usage_trend_daily`, so a tick
   * landing after that reads migrated rows, and a tick that finished before the
   * trend plan is loaded writes legacy-keyed rows the plan then folds in. One
   * tick can still straddle both (grouped its rows from pre-migration logs, and
   * upserted after the plan was read): that day's row stays legacy-keyed and is
   * simply never read again — `hasTrendDataForDay` stops it being rebuilt, and
   * the version key is already recorded.
   */
  private scheduleUsageIdentityMigration(): void {
    if (this.usageIdentityMigrationScheduled) return
    this.usageIdentityMigrationScheduled = true

    const delayMs = Math.max(
      USAGE_IDENTITY_MIGRATION_INITIAL_DELAY_MS,
      getStartupDegradeWindowRemainingMs()
    )
    this.usageIdentityMigrationTimer = setTimeout(() => {
      this.usageIdentityMigrationTimer = null
      // Built inside the chain: `getDb()` is synchronous, and a throw here would
      // otherwise escape the timer callback as an uncaught main-process error.
      void Promise.resolve()
        .then(() => this.createUsageIdentityMigration().run())
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

  private createUsageIdentityMigration(): UsageSourceIdentityMigration {
    const db = this.dbUtils.getDb()

    return new UsageSourceIdentityMigration({
      getAppliedVersion: async () => {
        const row = await db
          .select({ value: schema.config.value })
          .from(schema.config)
          .where(eq(schema.config.key, USAGE_SOURCE_IDENTITY_CONFIG_KEY))
          .get()
        if (!row?.value) return null
        const parsed = Number.parseInt(row.value, 10)
        return Number.isNaN(parsed) ? null : parsed
      },
      setAppliedVersion: async (version) => {
        await scheduleDbWrite(
          'usage.source-identity.version',
          async () => {
            await db
              .insert(schema.config)
              .values({ key: USAGE_SOURCE_IDENTITY_CONFIG_KEY, value: String(version) })
              .onConflictDoUpdate({
                target: schema.config.key,
                set: { value: String(version) }
              })
          },
          { priority: 'background', dropPolicy: 'none' }
        )
      },
      rewriteUsageLogSource: async (from, to) => {
        await scheduleDbWrite(
          'usage.source-identity.logs',
          async () => {
            await db
              .update(schema.usageLogs)
              .set({ source: to })
              .where(eq(schema.usageLogs.source, from))
          },
          { priority: 'background', dropPolicy: 'none' }
        )
      },
      loadLegacyTrendRows: async (legacySources) =>
        await db
          .select({
            sourceId: schema.usageTrendDaily.sourceId,
            itemId: schema.usageTrendDaily.itemId,
            day: schema.usageTrendDaily.day,
            executeCount: schema.usageTrendDaily.executeCount
          })
          .from(schema.usageTrendDaily)
          .where(inArray(schema.usageTrendDaily.sourceId, legacySources)),
      loadTrendRowsByKeys: (keys) => this.loadTrendRowsByKeys(keys),
      applyTrendMigration: (plan) => this.applyTrendMigration(plan),
      loadLegacyTimeStatsRows: async (legacySources) =>
        await db
          .select({
            sourceId: schema.itemTimeStats.sourceId,
            itemId: schema.itemTimeStats.itemId,
            hourDistribution: schema.itemTimeStats.hourDistribution,
            dayOfWeekDistribution: schema.itemTimeStats.dayOfWeekDistribution,
            timeSlotDistribution: schema.itemTimeStats.timeSlotDistribution
          })
          .from(schema.itemTimeStats)
          .where(inArray(schema.itemTimeStats.sourceId, legacySources)),
      loadTimeStatsRowsByKeys: (keys) => this.loadTimeStatsRowsByKeys(keys),
      applyTimeStatsMigration: (plan) => this.applyTimeStatsMigration(plan),
      logInfo: (message, meta) => recommendationLog.info(message, { meta: toLogMeta(meta) }),
      logWarn: (message, error, meta) =>
        recommendationLog.warn(message, { meta: { ...toLogMeta(meta), ...toErrorMeta(error) } })
    })
  }

  /**
   * Target rows for the id-keyed twins of the legacy rows. The coarse
   * source/item filter is narrowed to the exact triples in JS — SQLite has no
   * tuple IN and the affected set is small.
   */
  private async loadTrendRowsByKeys(keys: UsageTrendKey[]): Promise<UsageTrendRow[]> {
    if (keys.length === 0) return []
    const db = this.dbUtils.getDb()
    const wanted = new Set(keys.map((key) => `${key.sourceId} ${key.itemId} ${key.day}`))

    const rows = await db
      .select({
        sourceId: schema.usageTrendDaily.sourceId,
        itemId: schema.usageTrendDaily.itemId,
        day: schema.usageTrendDaily.day,
        executeCount: schema.usageTrendDaily.executeCount
      })
      .from(schema.usageTrendDaily)
      .where(
        and(
          inArray(schema.usageTrendDaily.sourceId, [...new Set(keys.map((key) => key.sourceId))]),
          inArray(schema.usageTrendDaily.itemId, [...new Set(keys.map((key) => key.itemId))])
        )
      )

    return rows.filter((row) => wanted.has(`${row.sourceId} ${row.itemId} ${row.day}`))
  }

  private async loadTimeStatsRowsByKeys(keys: ItemTimeStatsKey[]): Promise<ItemTimeStatsRow[]> {
    if (keys.length === 0) return []
    const db = this.dbUtils.getDb()
    const wanted = new Set(keys.map((key) => `${key.sourceId} ${key.itemId}`))

    const rows = await db
      .select({
        sourceId: schema.itemTimeStats.sourceId,
        itemId: schema.itemTimeStats.itemId,
        hourDistribution: schema.itemTimeStats.hourDistribution,
        dayOfWeekDistribution: schema.itemTimeStats.dayOfWeekDistribution,
        timeSlotDistribution: schema.itemTimeStats.timeSlotDistribution
      })
      .from(schema.itemTimeStats)
      .where(
        and(
          inArray(schema.itemTimeStats.sourceId, [...new Set(keys.map((key) => key.sourceId))]),
          inArray(schema.itemTimeStats.itemId, [...new Set(keys.map((key) => key.itemId))])
        )
      )

    return rows.filter((row) => wanted.has(`${row.sourceId} ${row.itemId}`))
  }

  private async applyTrendMigration(plan: UsageTrendMigrationPlan): Promise<void> {
    if (plan.rewrites.length === 0 && plan.merges.length === 0) return
    const db = this.dbUtils.getDb()

    await scheduleDbWrite(
      'usage.source-identity.trend',
      () =>
        db.transaction(async (tx) => {
          // Rewrites first (plan contract): a merge may target the row an
          // earlier rewrite creates, and no rewrite can collide with a legacy
          // row because legacy keys are types and targets are ids.
          for (const rewrite of plan.rewrites) {
            await tx
              .update(schema.usageTrendDaily)
              .set({ sourceId: rewrite.toSourceId })
              .where(this.trendRowFilter(rewrite.from))
          }
          for (const merge of plan.merges) {
            await tx
              .update(schema.usageTrendDaily)
              .set({ executeCount: merge.executeCount })
              .where(this.trendRowFilter(merge.into))
            await tx.delete(schema.usageTrendDaily).where(this.trendRowFilter(merge.from))
          }
        }),
      { priority: 'background', dropPolicy: 'none' }
    )
  }

  private async applyTimeStatsMigration(plan: ItemTimeStatsMigrationPlan): Promise<void> {
    if (plan.rewrites.length === 0 && plan.merges.length === 0) return
    const db = this.dbUtils.getDb()
    const now = new Date()

    await scheduleDbWrite(
      'usage.source-identity.time-stats',
      () =>
        db.transaction(async (tx) => {
          // Rewrites first — same plan contract as the trend table.
          for (const rewrite of plan.rewrites) {
            await tx
              .update(schema.itemTimeStats)
              .set({ sourceId: rewrite.toSourceId })
              .where(this.timeStatsRowFilter(rewrite.from))
          }
          for (const merge of plan.merges) {
            await tx
              .update(schema.itemTimeStats)
              .set({
                hourDistribution: merge.hourDistribution,
                dayOfWeekDistribution: merge.dayOfWeekDistribution,
                timeSlotDistribution: merge.timeSlotDistribution,
                lastUpdated: now
              })
              .where(this.timeStatsRowFilter(merge.into))
            await tx.delete(schema.itemTimeStats).where(this.timeStatsRowFilter(merge.from))
          }
        }),
      { priority: 'background', dropPolicy: 'none' }
    )
  }

  private trendRowFilter(key: UsageTrendKey) {
    return and(
      eq(schema.usageTrendDaily.sourceId, key.sourceId),
      eq(schema.usageTrendDaily.itemId, key.itemId),
      eq(schema.usageTrendDaily.day, key.day)
    )
  }

  private timeStatsRowFilter(key: ItemTimeStatsKey) {
    return and(
      eq(schema.itemTimeStats.sourceId, key.sourceId),
      eq(schema.itemTimeStats.itemId, key.itemId)
    )
  }

  /** Start background refresh timer */
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
        setTimeout(() => {
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
          await this.reportRecommendationTelemetry()
        } catch (error) {
          recommendationLog.warn('Telemetry report failed', { meta: toErrorMeta(error) })
        }
      },
      { interval: RECOMMENDATION_TELEMETRY_INTERVAL_MS, unit: 'milliseconds' }
    )
    this.pollingService.start()
  }

  private recordRecommendationPerf(eventType: string, metadata: Record<string, unknown>): void {
    const payload = {
      pluginName: RECOMMENDATION_PERF_PLUGIN,
      eventType,
      metadata: JSON.stringify(metadata),
      timestamp: Date.now()
    }

    // plugin_analytics is aux-owned: resolve the handle at enqueue time instead
    // of via dbUtils' construction-time aux capture (see db/db-write.ts).
    void scheduleAuxWrite(
      'analytics.plugin',
      (db) => db.insert(schema.pluginAnalytics).values(payload),
      { priority: 'best_effort', dropPolicy: 'latest_wins', budgetKey: 'recommendation.perf' }
    ).catch((error) => {
      recommendationLog.debug('Failed to record perf metrics', { meta: toErrorMeta(error) })
    })
  }

  /**
   * Local diagnostics counter for hit-rate@k. It lands in the same aux
   * `plugin_analytics` table the other recommendation perf counters use — the
   * numbers stay on the device (they are deliberately NOT part of the Sentry
   * telemetry payload below).
   */
  private async recordExposureDiagnostics(): Promise<void> {
    const buckets = await recommendationExposureService.getHitRate()
    if (buckets.length === 0) return

    this.recordRecommendationPerf('recommendation.exposure', {
      windowDays: 7,
      buckets: buckets.map((bucket) => ({
        k: bucket.k,
        impressions: bucket.impressions,
        clicks: bucket.clicks,
        hitRate: Number(bucket.hitRate.toFixed(4))
      }))
    })
  }

  private async reportRecommendationTelemetry(): Promise<void> {
    await this.recordExposureDiagnostics()

    const sentryService = getSentryService()
    if (!sentryService.isTelemetryEnabled()) return

    const db = this.dbUtils.getAuxDb()
    const windowStart = Date.now() - RECOMMENDATION_PERF_WINDOW_MS

    const totalRows = await db
      .select({ metadata: schema.pluginAnalytics.metadata })
      .from(schema.pluginAnalytics)
      .where(
        and(
          eq(schema.pluginAnalytics.pluginName, RECOMMENDATION_PERF_PLUGIN),
          eq(schema.pluginAnalytics.eventType, 'recommendation.total'),
          gte(schema.pluginAnalytics.timestamp, windowStart)
        )
      )
      .orderBy(desc(schema.pluginAnalytics.timestamp))
      .limit(RECOMMENDATION_PERF_SAMPLE_LIMIT)

    const totalSamples = this.collectPerfSamples(totalRows)
    const totalStats = this.buildPerfStats(totalSamples.durationsByLayer.none ?? [])
    const totalAllStats = this.buildPerfStats(totalSamples.durations)
    const totalByCacheLayer = this.buildPerfStatsByLayer(totalSamples.durationsByLayer)

    const trendingRows = await db
      .select({ metadata: schema.pluginAnalytics.metadata })
      .from(schema.pluginAnalytics)
      .where(
        and(
          eq(schema.pluginAnalytics.pluginName, RECOMMENDATION_PERF_PLUGIN),
          eq(schema.pluginAnalytics.eventType, 'recommendation.trending'),
          gte(schema.pluginAnalytics.timestamp, windowStart)
        )
      )
      .orderBy(desc(schema.pluginAnalytics.timestamp))
      .limit(RECOMMENDATION_PERF_SAMPLE_LIMIT)

    const trendingSamples = this.collectPerfSamples(trendingRows)
    const trendingStats = this.buildPerfStats(trendingSamples.durations)

    if (!totalStats && !trendingStats) return

    sentryService.queueNexusTelemetry({
      eventType: 'performance',
      metadata: {
        kind: 'recommendation.aggregate',
        windowMs: RECOMMENDATION_PERF_WINDOW_MS,
        sampleLimit: RECOMMENDATION_PERF_SAMPLE_LIMIT,
        cacheLayerCounts: totalSamples.cacheLayers,
        total: totalStats ?? undefined,
        totalAll: totalAllStats ?? undefined,
        totalByCacheLayer:
          Object.keys(totalByCacheLayer).length > 0 ? totalByCacheLayer : undefined,
        trending: trendingStats ?? undefined
      }
    })
  }

  private collectPerfSamples(rows: Array<{ metadata: string | null }>): {
    durations: number[]
    cacheLayers: Record<string, number>
    durationsByLayer: Record<string, number[]>
  } {
    const durations: number[] = []
    const cacheLayers: Record<string, number> = { none: 0, memory: 0, db: 0, unknown: 0 }
    const durationsByLayer: Record<string, number[]> = {
      none: [],
      memory: [],
      db: [],
      unknown: []
    }

    for (const row of rows) {
      const parsed = this.parsePerfMetadata(row.metadata)
      if (!parsed) continue

      const cacheLayer = parsed.cacheLayer ?? 'unknown'
      cacheLayers[cacheLayer] = (cacheLayers[cacheLayer] ?? 0) + 1

      if (typeof parsed.durationMs !== 'number') continue
      durations.push(parsed.durationMs)
      if (!durationsByLayer[cacheLayer]) {
        durationsByLayer[cacheLayer] = []
      }
      durationsByLayer[cacheLayer].push(parsed.durationMs)
    }

    return { durations, cacheLayers, durationsByLayer }
  }

  private parsePerfMetadata(metadata: string | null): RecommendationPerfMetadata | null {
    if (!metadata) return null
    try {
      const parsed = JSON.parse(metadata) as Record<string, unknown>
      return {
        durationMs: this.toNumber(parsed.durationMs),
        cacheLayer: typeof parsed.cacheLayer === 'string' ? parsed.cacheLayer : undefined
      }
    } catch {
      return null
    }
  }

  private toNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
    return null
  }

  private buildPerfStats(durations: number[]): PerfStats | null {
    if (durations.length === 0) return null
    const sorted = [...durations].sort((a, b) => a - b)
    const total = durations.reduce((sum, value) => sum + value, 0)
    const avg = total / durations.length
    const p50 = this.pickPercentile(sorted, 0.5)
    const p95 = this.pickPercentile(sorted, 0.95)
    const max = sorted[sorted.length - 1] ?? 0
    const overBudgetCount = durations.filter(
      (value) => value > RECOMMENDATION_QUERY_BUDGET_MS
    ).length

    return {
      samples: durations.length,
      avgMs: Math.round(avg),
      p50Ms: Math.round(p50),
      p95Ms: Math.round(p95),
      maxMs: Math.round(max),
      overBudgetMs: RECOMMENDATION_QUERY_BUDGET_MS,
      overBudgetCount
    }
  }

  private buildPerfStatsByLayer(
    durationsByLayer: Record<string, number[]>
  ): Record<string, PerfStats> {
    const result: Record<string, PerfStats> = {}
    for (const [layer, durations] of Object.entries(durationsByLayer)) {
      const stats = this.buildPerfStats(durations)
      if (stats) {
        result[layer] = stats
      }
    }
    return result
  }

  private pickPercentile(sorted: number[], percentile: number): number {
    if (sorted.length === 0) return 0
    const index = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(percentile * sorted.length) - 1)
    )
    return sorted[index]
  }

  private scheduleTrendBackfill(): void {
    if (this.trendBackfillQueue || this.trendBackfillCompleted) return

    const today = toDayBucket(Date.now())
    const startDay = today - (TREND_HISTORY_DAYS - 1)
    const days: number[] = []
    for (let day = startDay; day <= today; day++) {
      days.push(day)
    }

    this.trendBackfillQueue = days

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
      const hasData = await this.hasTrendDataForDay(day)
      if (!hasData) {
        await this.backfillTrendDay(day)
      }
    } catch (error) {
      recommendationLog.warn('Trend backfill failed', { meta: toErrorMeta(error) })
    } finally {
      disposeTick()
    }
  }

  private async hasTrendDataForDay(day: number): Promise<boolean> {
    const db = this.dbUtils.getDb()
    const row = await db
      .select({ day: schema.usageTrendDaily.day })
      .from(schema.usageTrendDaily)
      .where(eq(schema.usageTrendDaily.day, day))
      .limit(1)
      .get()
    return Boolean(row)
  }

  private async backfillTrendDay(day: number): Promise<void> {
    const db = this.dbUtils.getDb()
    const dayStart = new Date(day * DAY_MS)
    const dayEnd = new Date((day + 1) * DAY_MS)
    const dayBucket = day

    let rows: Array<{ sourceId: string; itemId: string; executeCount: number }> = []
    const disposeQuery = enterPerfContext('Recommendation.trendBackfill.query', { day })
    try {
      rows = await db
        .select({
          sourceId: schema.usageLogs.source,
          itemId: schema.usageLogs.itemId,
          executeCount: sql<number>`COUNT(*)`
        })
        .from(schema.usageLogs)
        .where(
          and(
            eq(schema.usageLogs.action, 'execute'),
            gte(schema.usageLogs.timestamp, dayStart),
            lt(schema.usageLogs.timestamp, dayEnd)
          )
        )
        .groupBy(schema.usageLogs.source, schema.usageLogs.itemId)
    } finally {
      disposeQuery()
    }

    if (rows.length === 0) return

    const now = new Date()
    const values = rows.map((row) => ({
      sourceId: row.sourceId,
      itemId: row.itemId,
      day: dayBucket,
      executeCount: Number(row.executeCount ?? 0),
      updatedAt: now
    }))

    const chunkSize = 500
    const disposeUpsert = enterPerfContext('Recommendation.trendBackfill.upsert', {
      day,
      rows: values.length
    })
    try {
      for (let i = 0; i < values.length; i += chunkSize) {
        const chunk = values.slice(i, i + chunkSize)
        // Every write to database.db goes through the single-writer scheduler
        // (database-write-contracts §3); a direct insert here competed with it
        // for the WAL writer lock.
        await scheduleDbWrite(
          'recommendation.trend-backfill',
          () =>
            db
              .insert(schema.usageTrendDaily)
              .values(chunk)
              .onConflictDoUpdate({
                target: [
                  schema.usageTrendDaily.sourceId,
                  schema.usageTrendDaily.itemId,
                  schema.usageTrendDaily.day
                ],
                set: {
                  executeCount: sql`excluded.execute_count`,
                  updatedAt: sql`excluded.updated_at`
                }
              }),
          { priority: 'background', dropPolicy: 'none' }
        )
        // 分块写入间让出事件循环
        if (i + chunkSize < values.length) {
          await new Promise<void>((resolve) => setImmediate(resolve))
        }
      }
    } finally {
      disposeUpsert()
    }
  }

  /** Stop background refresh timer */
  public stopBackgroundRefresh(): void {
    this.pollingService.unregister(this.refreshTaskId)
    this.pollingService.unregister(this.trendBackfillTaskId)
    this.pollingService.unregister(this.telemetryTaskId)
    if (this.usageIdentityMigrationTimer) {
      clearTimeout(this.usageIdentityMigrationTimer)
      this.usageIdentityMigrationTimer = null
    }
  }

  /**
   * Register a plugin recommendation provider.
   * @returns A dispose function to unregister the provider.
   */
  public registerPluginProvider(pluginName: string, provider: RecommendProvider): () => void {
    this.pluginProviders.set(provider.id, { pluginName, provider })
    this.invalidateCache()
    recommendationLog.debug('Registered plugin provider', {
      meta: { providerId: provider.id, pluginName }
    })
    return () => this.unregisterPluginProvider(provider.id)
  }

  /**
   * Unregister a plugin recommendation provider by its ID.
   */
  public unregisterPluginProvider(providerId: string): boolean {
    const removed = this.pluginProviders.delete(providerId)
    if (removed) {
      this.invalidateCache()
      recommendationLog.debug('Unregistered plugin provider', {
        meta: { providerId }
      })
    }
    return removed
  }

  /**
   * Unregister all providers from a specific plugin (for plugin unload cleanup).
   */
  public unregisterPluginProviders(pluginName: string): void {
    const toRemove: string[] = []
    for (const [id, entry] of this.pluginProviders) {
      if (entry.pluginName === pluginName) {
        toRemove.push(id)
      }
    }
    for (const id of toRemove) {
      this.pluginProviders.delete(id)
    }
    if (toRemove.length > 0) {
      this.invalidateCache()
      recommendationLog.debug('Unregistered plugin providers', {
        meta: { pluginName, providerCount: toRemove.length }
      })
    }
  }

  /**
   * Drop every cached ranking, both layers.
   *
   * Clearing only the in-memory copy is not enough: `recommend()` falls through
   * to `recommendation_cache`, whose rows live for 30 minutes, so the next call
   * would read back the very list we just invalidated. The generation counter
   * covers the other half of the race — a `recommend()` that started before
   * this call must not write its now-stale result into either layer.
   */
  public invalidateCache(): void {
    this.recommendationCache = null
    this.cacheGeneration += 1
    this.cacheInvalidatedAt = Date.now()

    // Cleanup only — the read guard above is what makes invalidation immediate.
    // This write is best-effort and droppable, and exists so invalidated rows
    // do not outlive the process that invalidated them.
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

  /** Generate recommendation list */
  async recommend(options: RecommendationOptions = {}): Promise<RecommendationResult> {
    // 启动期 appTaskGate 活跃时，先等待空闲再执行推荐计算，避免与启动任务竞争主线程
    if (appTaskGate.isActive()) {
      await appTaskGate.waitForIdle()
    }

    const startTime = performance.now()
    // Snapshot taken before any read: an invalidation landing while this call
    // computes means the result is already stale and must not be cached.
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

    const cached = await this.getCachedRecommendations(
      context,
      semanticSettings,
      pinnedCacheSignature
    )
    if (cached && !options.forceRefresh) {
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
      item.meta.recommendation = { source: 'pinned' }
    }
    pinnedTuffItems = this.dedupeItems(pinnedTuffItems)

    const candidatesStartedAt = performance.now()
    const { items: candidates, perf: candidatePerf } = await this.getCandidates(context, options)
    const candidatesDuration = performance.now() - candidatesStartedAt

    if (candidates.length === 0) {
      const fallbackItems = await this.resolveFallbackItems(options.limit || 10)
      const pinnedKeys = new Set(pinnedTuffItems.map((item) => this.getItemIdentity(item)))
      const filteredFallback = this.dedupeItems(fallbackItems).filter(
        (item) => !pinnedKeys.has(this.getItemIdentity(item))
      )
      const cachedItems = this.combineRecommendedWithPinned(
        filteredFallback,
        pinnedTuffItems,
        options.limit || 10
      )

      this.storeMemoryCache(cacheGeneration, cachedItems, context, contextCacheKey)

      const finalItems = await this.applyVolatileContextRerank(
        cachedItems,
        context,
        options.limit || 10
      )

      this.recordRecommendationPerf('recommendation.total', {
        cacheLayer: 'none',
        durationMs: Math.round(performance.now() - startTime),
        contextMs: Math.round(contextDuration),
        pinnedMs: Math.round(pinnedDuration),
        candidatesMs: Math.round(candidatesDuration),
        candidateCount: candidatePerf.totalCandidates,
        filteredCount: candidatePerf.filteredCount,
        itemsCount: finalItems.length,
        trendingMs: candidatePerf.trendingDurationMs,
        trendingRows: candidatePerf.trendingRows,
        trendingCandidates: candidatePerf.trendingCandidates,
        trendingReady: candidatePerf.trendingReady
      })

      return this.finalizeResult(options, finalItems, context, startTime, false)
    }

    const scored = await this.scoreAndRank(candidates, context, semanticSettings)
    const limit = options.limit || 10
    const diversified = this.applyDiversityFilter(scored, limit)
    const items = await this.itemRebuilder.rebuildItems(diversified)

    if (items.length === 0 && diversified.length > 0) {
      const fallbackItems = await this.resolveFallbackItems(limit)
      const pinnedKeys = new Set(pinnedTuffItems.map((item) => this.getItemIdentity(item)))
      const filteredFallback = this.dedupeItems(fallbackItems).filter(
        (item) => !pinnedKeys.has(this.getItemIdentity(item))
      )
      const cachedItems = this.combineRecommendedWithPinned(
        filteredFallback,
        pinnedTuffItems,
        limit
      )

      this.storeMemoryCache(cacheGeneration, cachedItems, context, contextCacheKey)

      const finalItems = await this.applyVolatileContextRerank(cachedItems, context, limit)

      this.recordRecommendationPerf('recommendation.total', {
        cacheLayer: 'none',
        durationMs: Math.round(performance.now() - startTime),
        contextMs: Math.round(contextDuration),
        pinnedMs: Math.round(pinnedDuration),
        candidatesMs: Math.round(candidatesDuration),
        candidateCount: candidatePerf.totalCandidates,
        filteredCount: candidatePerf.filteredCount,
        itemsCount: finalItems.length,
        trendingMs: candidatePerf.trendingDurationMs,
        trendingRows: candidatePerf.trendingRows,
        trendingCandidates: candidatePerf.trendingCandidates,
        trendingReady: candidatePerf.trendingReady
      })

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
        meta.recommendation = { source: 'frequent' }
      }
    }

    const combinedItems = this.combineRecommendedWithPinned(filteredItems, pinnedTuffItems, limit)

    // Both caches hold the STABLE ranking; the volatile stage runs on the way
    // out here exactly as it does on a cache hit, so a warm and a cold request
    // under the same context return the same order.
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

    this.recordRecommendationPerf('recommendation.total', {
      cacheLayer: 'none',
      durationMs: Math.round(duration),
      contextMs: Math.round(contextDuration),
      pinnedMs: Math.round(pinnedDuration),
      candidatesMs: Math.round(candidatesDuration),
      candidateCount: candidatePerf.totalCandidates,
      filteredCount: candidatePerf.filteredCount,
      itemsCount: finalItems.length,
      trendingMs: candidatePerf.trendingDurationMs,
      trendingRows: candidatePerf.trendingRows,
      trendingCandidates: candidatePerf.trendingCandidates,
      trendingReady: candidatePerf.trendingReady
    })

    return this.finalizeResult(options, finalItems, context, startTime, false)
  }

  /**
   * The single exit of `recommend()`: publishes the novelty exposure slice and
   * wraps the result. Cached and freshly computed lists leave through here
   * alike, so the slice is measured on every render, not only on cache misses.
   */
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

  /**
   * Flag the newly-installed ids in this result so exposures and clicks on them
   * also land in a `<surface>:newly-installed` counter row. Keys stay in memory;
   * only counts are persisted.
   */
  private publishNoveltyExposureTags(items: TuffItem[]): void {
    const keys = items
      .filter((item) => {
        const recommendation = (item.meta as Record<string, unknown> | undefined)?.recommendation
        return (recommendation as { source?: string } | undefined)?.source === 'newly-installed'
      })
      .map((item) => toExposureKey(item))

    recommendationExposureService.setTaggedKeys(NEWLY_INSTALLED_EXPOSURE_TAG, keys)
  }

  /**
   * Publish a stable ranking to the memory cache, unless an invalidation landed
   * while it was being computed. Returns whether the write happened, so the DB
   * layer can skip the same stale result.
   */
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

  /** Build container layout: Recommend on top, Pinned at bottom (if exists) */
  private buildContainerLayout(
    _options: RecommendationOptions,
    items: TuffItem[]
  ): TuffContainerLayout {
    const pinnedItems = items.filter((item) => item.meta?.pinned?.isPinned)
    const recommendItems = items.filter((item) => !item.meta?.pinned?.isPinned)
    const totalCount = items.length

    const sections: TuffContainerLayout['sections'] = []

    // Recommend section on top
    if (recommendItems.length > 0) {
      sections.push({
        id: 'recommendations',
        title: 'Recommend',
        layout: 'grid',
        itemIds: recommendItems.map((item) => item.id),
        meta: { intelligence: true }
      })
    }

    // Pinned section at bottom (only if has pinned items)
    if (pinnedItems.length > 0) {
      sections.push({
        id: 'pinned',
        title: 'Pinned',
        layout: 'grid',
        itemIds: pinnedItems.map((item) => item.id),
        meta: { pinned: true }
      })
    }

    return {
      mode: 'grid',
      grid: {
        columns: Math.min(8, totalCount || 8),
        gap: 12,
        itemSize: 'medium'
      },
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
    // Pinned items claim their slots first; the rest of the budget goes to the
    // highest-scored recommendations, so ordering must precede the slice or a
    // top-scored item silently falls off whenever anything is pinned.
    const visibleRecommendItems = this.orderByFinalScore(
      this.dedupeItems(recommendItems).filter(
        (item) => !pinnedIdentityKeys.has(this.getItemIdentity(item))
      )
    ).slice(0, Math.max(0, limit - visiblePinnedItems.length))

    return [...visibleRecommendItems, ...visiblePinnedItems]
  }

  /** Descending by `scoring.final` (written by the rebuilder), ties keep input order. */
  private orderByFinalScore(items: TuffItem[]): TuffItem[] {
    return items
      .map((item, index) => ({ item, index, score: item.scoring?.final ?? 0 }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .map(({ item }) => item)
  }

  /**
   * Get all pinned items from database
   */
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

  /**
   * Fallback recommendation strategy: simple usage count ordering
   */
  private async getFallbackRecommendations(limit: number): Promise<TuffItem[]> {
    try {
      const frequentItems = await this.getFrequentItems(limit * 2) // Get more to ensure we have enough after rebuild

      if (frequentItems.length === 0) {
        recommendationLog.debug('No frequent items found in database')
        return []
      }

      // 过滤掉文件类型的项目
      const filteredItems = frequentItems.filter(
        (item) => item.sourceId !== 'file-provider' && item.sourceType !== 'file'
      )

      const items = await this.itemRebuilder.rebuildItems(
        filteredItems.map((item) => ({
          ...item,
          source: 'frequent' as const,
          score: item.usageStats.executeCount
        }))
      )

      // Mark as recommendation (not pinned)
      for (const item of items) {
        if (!item.meta) item.meta = {}
        item.meta.recommendation = { source: 'frequent' }
      }

      return items.slice(0, limit)
    } catch (error) {
      recommendationLog.warn('Fallback recommendation failed', { meta: toErrorMeta(error) })
      return []
    }
  }

  /**
   * Usage-ranked fallback, or the cold-start catalog when there is no usage
   * history at all. Before this, a fresh install answered the empty query with
   * an empty grid: no usage rows meant no candidates, and the usage-ranked
   * fallback was empty for the same reason.
   */
  private async resolveFallbackItems(limit: number): Promise<TuffItem[]> {
    const fallbackItems = await this.getFallbackRecommendations(limit)
    if (fallbackItems.length > 0) return fallbackItems
    return await this.getColdStartRecommendations(limit)
  }

  /**
   * Cold start: the installed-app catalog, most recently installed first.
   * Files stay out — the recommendation grid excludes them everywhere else.
   */
  private async getColdStartRecommendations(limit: number): Promise<TuffItem[]> {
    try {
      const apps = await this.appCatalogDbUtils.getFilesByType('app')
      if (apps.length === 0) {
        recommendationLog.debug('Cold start found no apps in the catalog')
        return []
      }

      const installedAtByFileId = await this.loadInstalledAtByFileId(apps)
      const ranked = [...apps]
        .sort(
          (left, right) =>
            resolveInstallTime(right, installedAtByFileId.get(right.id)) -
            resolveInstallTime(left, installedAtByFileId.get(left.id))
        )
        .slice(0, limit * 2)

      const items = await this.itemRebuilder.rebuildItems(
        ranked.map((app, index) => ({
          sourceId: 'app-provider',
          itemId: app.path,
          sourceType: 'application',
          usageStats: EMPTY_USAGE_STATS,
          source: 'cold-start' as const,
          score: COLD_START_BASE_SCORE - index
        }))
      )

      return items.slice(0, limit)
    } catch (error) {
      recommendationLog.warn('Cold start recommendation failed', { meta: toErrorMeta(error) })
      return []
    }
  }

  /**
   * `installedAt` stamps for the given catalog rows, keyed by file id. The
   * stamp is an optional refinement over `ctime`, so a failed read degrades to
   * "no stamps" rather than failing the caller.
   */
  private async loadInstalledAtByFileId(apps: Array<{ id: number }>): Promise<Map<number, number>> {
    const installedAt = new Map<number, number>()
    if (apps.length === 0) return installedAt

    try {
      const extensions = await this.appCatalogDbUtils.getFileExtensionsByFileIds(
        apps.map((app) => app.id),
        [INSTALLED_AT_EXTENSION_KEY]
      )
      for (const extension of extensions) {
        const parsed = parseInstalledAt(extension.value)
        if (parsed !== null) installedAt.set(extension.fileId, parsed)
      }
    } catch (error) {
      recommendationLog.debug('Failed to read app install stamps', { meta: toErrorMeta(error) })
    }
    return installedAt
  }

  /**
   * Apps installed inside the novelty window (S1.1).
   *
   * Freshness is a DOUBLE gate — `installedAt` (filesystem creation time of the
   * bundle) AND `ctime` (when this row first entered the index) must both be
   * recent. Either one alone produces false positives that would flood the grid:
   * an app that self-updated has a new bundle but an old row, and a first full
   * scan on an old machine writes new rows for ancient apps.
   */
  private async getNewlyInstalledItems(limit: number): Promise<CandidateItem[]> {
    try {
      const now = Date.now()
      const apps = await this.appCatalogDbUtils.getFilesByType('app')
      // Gate 1 first: it is a plain field read and normally leaves nothing, so
      // the extension query below is skipped entirely on a steady-state install.
      const recentlyIndexed = apps.filter((app) => {
        const indexedAt = app.ctime?.getTime()
        return typeof indexedAt === 'number' && now - indexedAt <= NOVELTY_MAX_AGE_MS
      })
      if (recentlyIndexed.length === 0) return []

      const installedAtByFileId = await this.loadInstalledAtByFileId(recentlyIndexed)
      const fresh = recentlyIndexed
        .flatMap((app) => {
          const installedAt = installedAtByFileId.get(app.id)
          if (installedAt === undefined) return []
          // Gate 2. A future-dated stamp (clock skew) still counts as fresh.
          if (now - installedAt > NOVELTY_MAX_AGE_MS) return []
          return [{ app, installedAt }]
        })
        .sort((left, right) => right.installedAt - left.installedAt)
        .slice(0, limit)
      if (fresh.length === 0) return []

      const usageStatsMap = new Map(
        (
          await this.dbUtils.getUsageStatsBatch(
            fresh.map(({ app }) => ({ sourceId: 'app-provider', itemId: app.path }))
          )
        ).map((stat) => [`${stat.sourceId}:${stat.itemId}`, stat])
      )

      return fresh.map(({ app, installedAt }) => ({
        sourceId: 'app-provider',
        itemId: app.path,
        sourceType: 'application',
        usageStats: usageStatsMap.get(`app-provider:${app.path}`) ?? EMPTY_USAGE_STATS,
        source: 'newly-installed' as const,
        installedAt
      }))
    } catch (error) {
      recommendationLog.warn('Failed to collect newly installed candidates', {
        meta: toErrorMeta(error)
      })
      return []
    }
  }

  /**
   * 获取候选项目池
   */
  private async getCandidates(
    context: ContextSignal,
    _options: RecommendationOptions
  ): Promise<CandidateResult> {
    const candidates: CandidateItem[] = []

    // 维度 1: 全局高频项目 (Top 30)
    const frequentItems = await this.getFrequentItems(30)
    recommendationLog.debug('Loaded frequent candidates', {
      meta: { count: frequentItems.length }
    })
    candidates.push(
      ...frequentItems.map((item) => ({
        ...item,
        source: 'frequent' as const
      }))
    )

    // 维度 2: 最近使用 (Top 20)
    const recentItems = await this.getRecentItems(20)
    recommendationLog.debug('Loaded recent candidates', {
      meta: { count: recentItems.length }
    })
    candidates.push(
      ...recentItems.map((item) => ({
        ...item,
        source: 'recent' as const
      }))
    )

    // 维度 3: 时段热门 (Top 20)
    const timeBasedItems = await this.getTimeBasedTopItems(context.time, 20)
    recommendationLog.debug('Loaded time-based candidates', {
      meta: { count: timeBasedItems.length }
    })
    candidates.push(
      ...timeBasedItems.map((item) => ({
        ...item,
        source: 'time-based' as const
      }))
    )

    // 维度 4: 趋势项目 (Top 15)
    const trending = await this.getTrendingItems(15)
    const trendingItems = trending.items
    recommendationLog.debug('Loaded trending candidates', {
      meta: {
        count: trendingItems.length,
        durationMs: Math.round(trending.perf.durationMs),
        ready: trending.perf.ready
      }
    })
    candidates.push(
      ...trendingItems.map((item) => ({
        ...item,
        source: 'trending' as const
      }))
    )

    // 维度 5: 插件提供者
    const pluginCandidates = await this.getPluginCandidates(context)
    recommendationLog.debug('Loaded plugin candidates', {
      meta: { count: pluginCandidates.length }
    })
    candidates.push(...pluginCandidates)

    // 维度 6: 新安装的应用 (Top 10) —— 上面五个维度全部依赖使用历史，新装应用在其中
    // 恒为零分，只有这条通道能让它被看见。
    const newlyInstalled = await this.getNewlyInstalledItems(NEWLY_INSTALLED_CANDIDATE_LIMIT)
    recommendationLog.debug('Loaded newly installed candidates', {
      meta: { count: newlyInstalled.length }
    })
    candidates.push(...newlyInstalled)

    // 内置剪贴板 URL 推荐不在这里注入：候选池的产物会进缓存，而缓存键已不含剪贴板
    // (见 buildRecommendationCacheKey)，一旦入缓存，剪贴板换了之后旧的 URL 动作仍会
    // 被命中返回，并与新建的那条并存。它由易变阶段 buildVolatileItems 每次请求现建。

    recommendationLog.debug('Collected candidates before dedupe', {
      meta: { count: candidates.length }
    })

    const totalCandidates = candidates.length

    // 去重(同一 sourceId + itemId 只保留第一次出现)
    const deduplicated = this.deduplicateCandidates(candidates)

    // 过滤掉文件类型的项目，推荐列表不展示文件
    const filtered = deduplicated.filter(
      (item) => item.sourceId !== 'file-provider' && item.sourceType !== 'file'
    )

    // 统计各 source 的分布
    const sourceDistribution = new Map<string, number>()
    for (const item of filtered) {
      const key = item.sourceId
      sourceDistribution.set(key, (sourceDistribution.get(key) || 0) + 1)
    }
    recommendationLog.debug('Filtered candidate distribution', {
      meta: {
        filteredCount: filtered.length,
        sourceDistribution: JSON.stringify(Object.fromEntries(sourceDistribution))
      }
    })

    return {
      items: filtered,
      perf: {
        totalCandidates,
        filteredCount: filtered.length,
        trendingDurationMs: trending.perf.durationMs,
        trendingRows: trending.perf.rowCount,
        trendingCandidates: trendingItems.length,
        trendingReady: trending.perf.ready
      }
    }
  }

  /**
   * 获取全局高频项目
   */
  private async getFrequentItems(limit: number): Promise<ItemCandidate[]> {
    const db = this.dbUtils.getDb()

    const stats = await db
      .select()
      .from(schema.itemUsageStats)
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

  /**
   * 获取最近使用的项目
   */
  private async getRecentItems(limit: number): Promise<ItemCandidate[]> {
    const db = this.dbUtils.getDb()

    const stats = await db
      .select()
      .from(schema.itemUsageStats)
      .orderBy(desc(schema.itemUsageStats.lastExecuted))
      .limit(limit)
      .all()

    return stats
      .filter((stat) => stat.lastExecuted != null)
      .map((stat) => ({
        sourceId: stat.sourceId,
        itemId: stat.itemId,
        sourceType: stat.sourceType,
        usageStats: stat
      }))
  }

  /**
   * 获取当前时段的热门项目
   */
  private async getTimeBasedTopItems(
    timePattern: TimePattern,
    limit: number
  ): Promise<ItemCandidate[]> {
    const allTimeStats = await this.dbUtils.getAllItemTimeStats()
    const scored: Array<{ item: ItemCandidate; score: number }> = []

    // 获取对应的使用统计
    const keys = allTimeStats.map((stat) => ({
      sourceId: stat.sourceId,
      itemId: stat.itemId
    }))
    const usageStatsMap = new Map(
      (await this.dbUtils.getUsageStatsBatch(keys)).map((stat) => [
        `${stat.sourceId}:${stat.itemId}`,
        stat
      ])
    )

    for (let idx = 0; idx < allTimeStats.length; idx++) {
      const raw = allTimeStats[idx]
      const parsed: ParsedItemTimeStats = {
        sourceId: raw.sourceId,
        itemId: raw.itemId,
        hourDistribution: JSON.parse(raw.hourDistribution),
        dayOfWeekDistribution: JSON.parse(raw.dayOfWeekDistribution),
        timeSlotDistribution: JSON.parse(raw.timeSlotDistribution),
        lastUpdated: raw.lastUpdated
      }

      const timeScore = this.calculateTimeRelevance(parsed, timePattern)
      if (timeScore > 0) {
        const key = `${raw.sourceId}:${raw.itemId}`
        const usageStats = usageStatsMap.get(key)

        if (usageStats) {
          scored.push({
            item: {
              sourceId: raw.sourceId,
              itemId: raw.itemId,
              sourceType: usageStats.sourceType,
              usageStats,
              timeStats: parsed
            },
            score: timeScore
          })
        }
      }

      // 每 50 行让出事件循环，避免 JSON.parse 密集计算阻塞
      if ((idx + 1) % 50 === 0) {
        await new Promise<void>((resolve) => setImmediate(resolve))
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ item }) => item)
  }

  /**
   * 收集插件注册的推荐候选项
   */
  private async getPluginCandidates(context: ContextSignal): Promise<CandidateItem[]> {
    if (this.pluginProviders.size === 0) return []

    const candidates: CandidateItem[] = []

    for (const [_id, { provider }] of this.pluginProviders) {
      try {
        if (!provider.canProvide(context)) continue

        const result = await Promise.race([
          Promise.resolve(provider.getCandidates(context)),
          new Promise<PluginRecommendCandidate[]>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Provider ${provider.id} timed out`)),
              PLUGIN_PROVIDER_TIMEOUT_MS
            )
          )
        ])

        for (const candidate of result) {
          candidates.push({
            sourceId: `plugin-recommend:${provider.id}`,
            itemId: candidate.id,
            sourceType: 'plugin-recommend',
            usageStats: EMPTY_USAGE_STATS,
            source: 'plugin',
            pluginCandidate: {
              ...candidate,
              providerId: provider.id
            }
          })
        }
      } catch (error) {
        recommendationLog.warn('Plugin recommendation provider failed', {
          meta: { providerId: provider.id, ...toErrorMeta(error) }
        })
      }
    }

    return candidates
  }

  /**
   * 内置剪贴板 URL 推荐候选
   */
  private getClipboardUrlCandidates(context: ContextSignal): CandidateItem[] {
    if (!context.clipboard?.meta?.isUrl || !context.clipboard.content) return []

    const url = context.clipboard.content

    return [
      {
        sourceId: '__builtin_clipboard_url__',
        itemId: `clipboard-url-open:${url}`,
        sourceType: 'action',
        usageStats: EMPTY_USAGE_STATS,
        source: 'context',
        pluginCandidate: {
          id: `clipboard-url-open:${url}`,
          title: '打开 URL',
          subtitle: url.length > 60 ? `${url.substring(0, 57)}...` : url,
          icon: { type: 'class', value: 'i-ri-links-line' },
          priority: 95,
          action: 'open-url',
          data: { url }
        }
      }
    ]
  }

  /**
   * 获取趋势上升的项目
   * 比较最近 7 天 vs 过去 30 天的使用频率
   */
  private async getTrendingItems(limit: number): Promise<TrendingResult> {
    const db = this.dbUtils.getDb()
    this.scheduleTrendBackfill()

    const startedAt = performance.now()
    const today = toDayBucket(Date.now())
    const recentThreshold = today - (TREND_RECENT_DAYS - 1)
    const historyThreshold = today - (TREND_HISTORY_DAYS - 1)

    const rows = await db
      .select({
        sourceId: schema.usageTrendDaily.sourceId,
        itemId: schema.usageTrendDaily.itemId,
        recentCount: sql<number>`SUM(CASE WHEN ${schema.usageTrendDaily.day} >= ${recentThreshold} THEN ${schema.usageTrendDaily.executeCount} ELSE 0 END)`,
        historicalCount: sql<number>`SUM(${schema.usageTrendDaily.executeCount})`
      })
      .from(schema.usageTrendDaily)
      .where(gte(schema.usageTrendDaily.day, historyThreshold))
      .groupBy(schema.usageTrendDaily.sourceId, schema.usageTrendDaily.itemId)

    const durationMs = performance.now() - startedAt
    const rowCount = rows.length
    if (rowCount === 0) {
      this.recordRecommendationPerf('recommendation.trending', {
        durationMs: Math.round(durationMs),
        rows: rowCount,
        ready: false
      })
      return { items: [], perf: { durationMs, rowCount, ready: false } }
    }

    const candidates: Array<{ sourceId: string; itemId: string; growthScore: number }> = []

    for (const row of rows) {
      const recentCount = Number(row.recentCount ?? 0)
      const historicalCount = Number(row.historicalCount ?? 0)
      const avgWeeklyCount = historicalCount / 4

      let growthScore = 0
      if (avgWeeklyCount === 0 && recentCount > 0) {
        growthScore = recentCount * 10
      } else if (avgWeeklyCount > 0) {
        const growthRate = (recentCount - avgWeeklyCount) / avgWeeklyCount
        growthScore = growthRate * 100
      }

      if (growthScore > 0 && recentCount >= 2) {
        candidates.push({ sourceId: row.sourceId, itemId: row.itemId, growthScore })
      }
    }

    if (candidates.length === 0) {
      this.recordRecommendationPerf('recommendation.trending', {
        durationMs: Math.round(durationMs),
        rows: rowCount,
        candidates: 0,
        resultCount: 0,
        ready: true
      })
      return { items: [], perf: { durationMs, rowCount, ready: true } }
    }

    const sampleLimit = Math.max(limit * 2, limit)
    const topCandidates = candidates
      .sort((a, b) => b.growthScore - a.growthScore)
      .slice(0, sampleLimit)

    const usageStatsList = await this.dbUtils.getUsageStatsBatch(
      topCandidates.map((candidate) => ({
        sourceId: candidate.sourceId,
        itemId: candidate.itemId
      }))
    )
    const usageStatsMap = new Map(
      usageStatsList.map((stat) => [`${stat.sourceId}:${stat.itemId}`, stat])
    )

    const trending: ItemCandidate[] = []
    for (const candidate of topCandidates) {
      const usageStats = usageStatsMap.get(`${candidate.sourceId}:${candidate.itemId}`)
      if (!usageStats) continue
      trending.push({
        sourceId: candidate.sourceId,
        itemId: candidate.itemId,
        sourceType: usageStats.sourceType,
        usageStats
      })
      if (trending.length >= limit) break
    }

    this.recordRecommendationPerf('recommendation.trending', {
      durationMs: Math.round(durationMs),
      rows: rowCount,
      candidates: candidates.length,
      resultCount: trending.length,
      ready: true
    })

    return { items: trending, perf: { durationMs, rowCount, ready: true } }
  }

  /**
   * 计算时间相关性分数
   */
  private calculateTimeRelevance(
    itemTimeStats: ParsedItemTimeStats,
    currentTime: TimePattern
  ): number {
    return calculateTimeRelevanceScore(itemTimeStats, currentTime)
  }

  /**
   * 计算分数并排序
   */
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
    const usageSemanticInputs = semanticSettings.localVectorEnabled
      ? candidates.map((candidate) => ({
          ...this.toSemanticCandidateInput(candidate),
          searchCount: candidate.usageStats.searchCount,
          executeCount: candidate.usageStats.executeCount,
          cancelCount: candidate.usageStats.cancelCount,
          lastSearched: candidate.usageStats.lastSearched,
          lastExecuted: candidate.usageStats.lastExecuted,
          lastCancelled: candidate.usageStats.lastCancelled
        }))
      : []
    const usagePreferenceProfile = semanticSettings.localVectorEnabled
      ? buildRecommendationUsagePreferenceProfile(usageSemanticInputs)
      : null
    const usageAvoidanceProfile = semanticSettings.localVectorEnabled
      ? buildRecommendationUsageAvoidanceProfile(usageSemanticInputs)
      : null

    for (const candidate of candidates) {
      const score = await this.calculateRecommendationScore(
        candidate,
        context,
        semanticSettings,
        semanticProfile,
        usagePreferenceProfile,
        usageAvoidanceProfile
      )
      scored.push({ ...candidate, score })
    }

    const locallySorted = scored.sort((a, b) => b.score - a.score)
    const embedded = await this.applyAiEmbeddingScores(
      locallySorted,
      semanticProfile,
      semanticSettings
    )
    return this.applyAiRerank(embedded, semanticProfile, semanticSettings)
  }

  /**
   * 计算推荐分数
   */
  private async calculateRecommendationScore(
    candidate: CandidateItem,
    context: ContextSignal,
    semanticSettings: RecommendationSemanticSettings,
    semanticProfile: RecommendationSemanticProfile | null,
    usagePreferenceProfile: RecommendationSemanticProfile | null,
    usageAvoidanceProfile: RecommendationSemanticProfile | null
  ): Promise<number> {
    // Plugin candidates: use priority directly, skip usageStats-based calculation
    if (candidate.source === 'plugin' && candidate.pluginCandidate) {
      return (candidate.pluginCandidate.priority ?? 50) * PLUGIN_PRIORITY_WEIGHT
    }

    // Built-in clipboard URL candidate: high priority contextual match
    if (candidate.sourceId === '__builtin_clipboard_url__' && candidate.pluginCandidate) {
      return (candidate.pluginCandidate.priority ?? 95) * PLUGIN_PRIORITY_WEIGHT
    }

    // NOTE: context match (clipboard / selection / foreground app / system
    // state) is deliberately absent — it is the VOLATILE stage, applied after
    // the cache in `applyVolatileContextRerank`. Only slow-moving components
    // may land in a cached score.
    let score = 0

    // 时间相关性
    if (candidate.timeStats) {
      const timeRelevance = this.calculateTimeRelevance(candidate.timeStats, context.time)
      score += timeRelevance * 1e5
    }

    // 频率分数(带时间衰减)
    const frequencyScore = this.calculateFrequencyScore(candidate.usageStats)
    score += frequencyScore * 1e4

    // 最近使用加成
    const recencyBoost = this.calculateRecencyBoost(candidate.usageStats.lastExecuted)
    score += recencyBoost * 1e3

    // Novelty: the exploration channel for freshly installed apps. It hands the
    // item back to frecency the moment there is a real execute to rank on —
    // the item stays in the pool through the frequent/recent dimensions, it
    // just stops being news.
    if (candidate.installedAt !== undefined && candidate.usageStats.executeCount === 0) {
      score += calculateNoveltyFactor(Date.now() - candidate.installedAt) * NOVELTY_WEIGHT
    }

    if (semanticSettings.localVectorEnabled && semanticProfile) {
      const candidateProfile = buildCandidateSemanticProfile(
        this.toSemanticCandidateInput(candidate)
      )
      score +=
        calculateLocalSemanticScore(semanticProfile, candidateProfile) * SEMANTIC_LOCAL_WEIGHT

      if (usagePreferenceProfile && !this.isExternalPriorityCandidate(candidate)) {
        score +=
          calculateLocalSemanticScore(usagePreferenceProfile, candidateProfile) *
          SEMANTIC_USAGE_PREFERENCE_WEIGHT
      }

      if (usageAvoidanceProfile && !this.isExternalPriorityCandidate(candidate)) {
        score -=
          calculateLocalSemanticScore(usageAvoidanceProfile, candidateProfile) *
          SEMANTIC_USAGE_AVOIDANCE_WEIGHT
      }
    }

    return score
  }

  private isSemanticAiInCooldown(): boolean {
    if (this.semanticAiCooldownUntil === 0) return false
    if (Date.now() < this.semanticAiCooldownUntil) return true
    // cooldown elapsed — reset and allow a probe attempt
    this.semanticAiCooldownUntil = 0
    this.semanticAiFailures = 0
    return false
  }

  private recordSemanticAiSuccess(): void {
    this.semanticAiFailures = 0
    this.semanticAiCooldownUntil = 0
  }

  private recordSemanticAiFailure(): void {
    this.semanticAiFailures += 1
    if (this.semanticAiFailures >= RecommendationEngine.SEMANTIC_AI_FAILURE_THRESHOLD) {
      this.semanticAiCooldownUntil = Date.now() + RecommendationEngine.SEMANTIC_AI_COOLDOWN_MS
      this.semanticAiFailures = 0
      recommendationLog.debug('Semantic AI entering cooldown after repeated failures', {
        meta: { cooldownMs: RecommendationEngine.SEMANTIC_AI_COOLDOWN_MS }
      })
    }
  }

  private async applyAiEmbeddingScores(
    scored: ScoredItem[],
    semanticProfile: RecommendationSemanticProfile | null,
    semanticSettings: RecommendationSemanticSettings
  ): Promise<ScoredItem[]> {
    if (!semanticSettings.aiEmbeddingEnabled || !semanticProfile || scored.length === 0) {
      return scored
    }
    if (this.isSemanticAiInCooldown()) {
      return scored
    }

    const targets = scored
      .filter((item) => !this.isExternalPriorityCandidate(item))
      .slice(0, AI_EMBEDDING_CANDIDATE_LIMIT)
    if (targets.length === 0 || !semanticProfile.text) return scored

    try {
      const { tuffIntelligence } = await import('../../../ai/intelligence-sdk')
      const contextEmbedding = await withTimeout(
        tuffIntelligence.embedding.generate(
          { text: semanticProfile.text },
          {
            timeout: SEMANTIC_AI_TIMEOUT_MS,
            metadata: { caller: 'core.recommendation.semantic-embedding' }
          }
        ),
        SEMANTIC_AI_TIMEOUT_MS
      )

      const embeddings = await Promise.all(
        targets.map(async (item) => {
          const candidateProfile = buildCandidateSemanticProfile(
            this.toSemanticCandidateInput(item)
          )
          if (!candidateProfile.text) return null
          const result = await withTimeout(
            tuffIntelligence.embedding.generate(
              { text: candidateProfile.text },
              {
                timeout: SEMANTIC_AI_TIMEOUT_MS,
                metadata: { caller: 'core.recommendation.semantic-embedding' }
              }
            ),
            SEMANTIC_AI_TIMEOUT_MS
          )
          return {
            key: this.getCandidateKey(item),
            score: this.calculateVectorCosine(contextEmbedding.result, result.result)
          }
        })
      )

      // AI calls succeeded — reset the circuit breaker
      this.recordSemanticAiSuccess()

      const scoreMap = new Map<string, number>()
      for (const embedding of embeddings) {
        if (!embedding) continue
        scoreMap.set(embedding.key, embedding.score)
      }

      if (scoreMap.size === 0) return scored
      return scored
        .map((item) => ({
          ...item,
          score:
            item.score +
            (scoreMap.get(this.getCandidateKey(item)) ?? 0) * SEMANTIC_AI_EMBEDDING_WEIGHT
        }))
        .sort((a, b) => b.score - a.score)
    } catch (error) {
      this.recordSemanticAiFailure()
      recommendationLog.debug('AI embedding recommendation score skipped', {
        meta: toErrorMeta(error)
      })
      return scored
    }
  }

  private async applyAiRerank(
    scored: ScoredItem[],
    semanticProfile: RecommendationSemanticProfile | null,
    semanticSettings: RecommendationSemanticSettings
  ): Promise<ScoredItem[]> {
    if (!semanticSettings.aiRerankEnabled || !semanticProfile || scored.length === 0) {
      return scored
    }
    if (this.isSemanticAiInCooldown()) {
      return scored
    }

    const targets = scored.slice(0, AI_RERANK_CANDIDATE_LIMIT)
    if (targets.length === 0 || !semanticProfile.text) return scored

    try {
      const { tuffIntelligence } = await import('../../../ai/intelligence-sdk')
      const result = await withTimeout(
        tuffIntelligence.rag.rerank(
          {
            query: semanticProfile.text,
            documents: targets.map((item) => {
              const candidateProfile = buildCandidateSemanticProfile(
                this.toSemanticCandidateInput(item)
              )
              return {
                id: this.getCandidateKey(item),
                content: candidateProfile.text || item.itemId,
                metadata: {
                  source: item.source,
                  sourceId: item.sourceId,
                  sourceType: item.sourceType
                }
              }
            }),
            topK: targets.length
          },
          {
            timeout: SEMANTIC_AI_TIMEOUT_MS,
            metadata: { caller: 'core.recommendation.semantic-rerank' }
          }
        ),
        SEMANTIC_AI_TIMEOUT_MS
      )

      // AI rerank succeeded — reset the circuit breaker
      this.recordSemanticAiSuccess()

      const scoreMap = new Map<string, number>()
      const orderMap = new Map<string, number>()
      result.result.results.forEach((item, index) => {
        scoreMap.set(item.id, item.score)
        orderMap.set(item.id, targets.length - index)
      })

      if (scoreMap.size === 0) return scored
      return scored
        .map((item) => {
          const key = this.getCandidateKey(item)
          const rerankScore = scoreMap.get(key) ?? 0
          const orderScore = orderMap.get(key) ?? 0
          return {
            ...item,
            score:
              item.score +
              rerankScore * SEMANTIC_AI_RERANK_WEIGHT +
              orderScore * SEMANTIC_AI_RERANK_ORDER_WEIGHT
          }
        })
        .sort((a, b) => b.score - a.score)
    } catch (error) {
      this.recordSemanticAiFailure()
      recommendationLog.debug('AI recommendation rerank skipped', {
        meta: toErrorMeta(error)
      })
      return scored
    }
  }

  private toSemanticCandidateInput(candidate: CandidateItem): RecommendationSemanticCandidateInput {
    return {
      sourceId: candidate.sourceId,
      itemId: candidate.itemId,
      sourceType: candidate.sourceType,
      source: candidate.source,
      title: candidate.pluginCandidate?.title,
      subtitle: candidate.pluginCandidate?.subtitle
    }
  }

  private isExternalPriorityCandidate(candidate: CandidateItem): boolean {
    return candidate.source === 'plugin' || candidate.sourceId === '__builtin_clipboard_url__'
  }

  private getCandidateKey(candidate: CandidateItem): string {
    return `${candidate.sourceId}:${candidate.itemId}`
  }

  private calculateVectorCosine(left: number[], right: number[]): number {
    const length = Math.min(left.length, right.length)
    if (length === 0) return 0

    let dot = 0
    let leftNorm = 0
    let rightNorm = 0
    for (let i = 0; i < length; i += 1) {
      dot += left[i] * right[i]
      leftNorm += left[i] * left[i]
      rightNorm += right[i] * right[i]
    }

    if (leftNorm === 0 || rightNorm === 0) return 0
    const score = dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm))
    return Math.max(0, Math.min(1, score))
  }

  private async getRecommendationSemanticSettings(): Promise<RecommendationSemanticSettings> {
    try {
      const { getMainConfig, isMainStorageReady } = await import('../../../storage')
      if (!isMainStorageReady()) {
        return DEFAULT_RECOMMENDATION_SEMANTIC_SETTINGS
      }

      const settings = getMainConfig(StorageList.APP_SETTING) as AppSetting | undefined
      return normalizeRecommendationSemanticSettings(settings?.recommendation?.semantic)
    } catch (error) {
      recommendationLog.debug('Failed to load recommendation semantic settings', {
        meta: toErrorMeta(error)
      })
      return DEFAULT_RECOMMENDATION_SEMANTIC_SETTINGS
    }
  }

  private buildRecommendationCacheKey(
    context: ContextSignal,
    semanticSettings: RecommendationSemanticSettings,
    pinnedCacheSignature = ''
  ): string {
    const baseKey = this.contextProvider.generateCacheKey(context)
    const segments = [baseKey, `pin:${pinnedCacheSignature || 'none'}`]
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

  /**
   * Re-applies the volatile half of the ranking on top of a (possibly cached)
   * item list and re-orders it.
   *
   * The cache key only carries slow-moving context (see
   * `ContextProvider.generateCacheKey`), so a hit can carry a stable ranking
   * computed under a completely different clipboard / foreground app. This
   * stage restores those signals per request over the already-capped list, and
   * injects the clipboard-URL action, which exists only while a URL is on the
   * clipboard and therefore can never be part of a reusable cache entry.
   */
  private async applyVolatileContextRerank(
    items: TuffItem[],
    context: ContextSignal,
    limit: number
  ): Promise<TuffItem[]> {
    if (limit <= 0) return []

    const pinnedItems = items.filter((item) => item.meta?.pinned?.isPinned)
    const recommendItems = items.filter((item) => !item.meta?.pinned?.isPinned)

    const rescored = recommendItems.map((item) => {
      const stableScore = this.readStableScore(item)
      const volatileScore = this.calculateContextMatch(this.toVolatileCandidate(item), context)
      return this.withScores(item, stableScore, volatileScore * CONTEXT_MATCH_WEIGHT)
    })

    const withVolatileCandidates = [...rescored, ...(await this.buildVolatileItems(context, items))]

    return this.combineRecommendedWithPinned(withVolatileCandidates, pinnedItems, limit)
  }

  /**
   * Context-only candidates, rebuilt per request. They never enter the cache,
   * so they must be produced fresh whenever their signal is present.
   */
  private async buildVolatileItems(
    context: ContextSignal,
    existingItems: TuffItem[]
  ): Promise<TuffItem[]> {
    const candidates = this.getClipboardUrlCandidates(context)
    if (candidates.length === 0) return []

    const existingKeys = new Set(existingItems.map((item) => this.getItemIdentity(item)))

    try {
      const rebuilt = await this.itemRebuilder.rebuildItems(
        candidates.map((candidate) => ({
          ...candidate,
          score: (candidate.pluginCandidate?.priority ?? 95) * PLUGIN_PRIORITY_WEIGHT
        }))
      )
      return rebuilt.filter((item) => !existingKeys.has(this.getItemIdentity(item)))
    } catch (error) {
      recommendationLog.debug('Failed to build volatile context items', {
        meta: toErrorMeta(error)
      })
      return []
    }
  }

  /**
   * The pre-volatile score, kept on the item so repeated re-ranks (memory hit,
   * then DB hit after a restart) stay idempotent instead of compounding.
   */
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

  /**
   * 计算上下文匹配度
   */
  private calculateContextMatch(candidate: VolatileCandidate, context: ContextSignal): number {
    let score = 0

    // 剪贴板内容类型匹配
    if (context.clipboard) {
      score += this.matchClipboardContent(candidate, context.clipboard)
    }

    // 选中文本与剪贴板同档，权重略低：取词往往早于当前动作
    if (context.selection) {
      score +=
        this.matchClipboardContent(candidate, { ...context.selection, type: 'text' }) *
        SELECTION_CONTEXT_WEIGHT
    }

    // 前台应用关联匹配
    if (context.foregroundApp) {
      score += this.matchForegroundApp(candidate, context.foregroundApp)
    }

    if (context.systemState) {
      score += this.matchSystemState(candidate, context.systemState)
    }

    return score
  }

  /**
   * 匹配剪贴板内容与候选项
   */
  private matchClipboardContent(
    candidate: VolatileCandidate,
    clipboard: { type: string; contentType?: string; meta?: Record<string, unknown> }
  ): number {
    const { sourceType, itemId } = candidate

    // 文件类型匹配逻辑(最高优先级)
    if (clipboard.meta?.fileType === 'code' && clipboard.meta.language) {
      const language = clipboard.meta.language

      // Java/Kotlin → JetBrains IDEA/Android Studio
      if (language === 'java' || language === 'kotlin') {
        if (
          isAppSourceType(sourceType) &&
          this.isJetBrainsIDE(itemId, ['idea', 'android-studio'])
        ) {
          return 100
        }
      }

      // Python → PyCharm/VS Code
      if (language === 'python') {
        if (isAppSourceType(sourceType) && this.isJetBrainsIDE(itemId, ['pycharm'])) {
          return 100
        }
        if (isAppSourceType(sourceType) && this.isVSCode(itemId)) {
          return 90
        }
      }

      // JavaScript/TypeScript → VS Code/WebStorm
      if (language === 'javascript' || language === 'typescript') {
        if (isAppSourceType(sourceType) && this.isVSCode(itemId)) {
          return 100
        }
        if (isAppSourceType(sourceType) && this.isJetBrainsIDE(itemId, ['webstorm'])) {
          return 95
        }
      }

      // 通用代码文件 → 任何 IDE
      if (isAppSourceType(sourceType) && this.isIDE(itemId)) {
        return 80
      }
    }

    // 文本文件 → 文本编辑器
    if (clipboard.meta?.fileType === 'text') {
      if (isAppSourceType(sourceType) && this.isTextEditor(itemId)) {
        return 85
      }
    }

    // 图像文件 → 图像编轑器
    if (clipboard.meta?.fileType === 'image') {
      if (isAppSourceType(sourceType) && this.isImageApp(itemId)) {
        return 100
      }
    }

    // URL/链接类型检测
    const isUrl = clipboard.contentType === 'url' || clipboard.meta?.isUrl === true

    if (clipboard.type === 'text') {
      // 文本剪贴板
      if (isUrl) {
        // 如果是链接,推荐浏览器相关
        if (isAppSourceType(sourceType) && this.isBrowserApp(itemId)) {
          return 100 // 强相关
        }
        // 下载工具
        if (isAppSourceType(sourceType) && matchesAppRule(itemId, APP_MATCH_RULES.downloadTool)) {
          return 80
        }
      } else {
        // 普通文本,推荐编辑器
        if (isAppSourceType(sourceType) && this.isEditorApp(itemId)) {
          return 70
        }
      }
    } else if (clipboard.type === 'image') {
      // 图片剪贴板,推荐图片处理工具
      if (isAppSourceType(sourceType) && this.isImageApp(itemId)) {
        return 100
      }
    } else if (clipboard.type === 'files') {
      // 文件剪贴板,推荐文件管理工具
      if (isAppSourceType(sourceType) && this.isFileManagerApp(itemId)) {
        return 80
      }
    }

    return 0
  }

  /**
   * 匹配前台应用与候选项
   */
  private matchForegroundApp(
    candidate: VolatileCandidate,
    foregroundApp: NonNullable<ContextSignal['foregroundApp']>
  ): number {
    const { sourceType, itemId } = candidate

    // 如果候选项就是当前前台应用,降低推荐权重(避免重复推荐已打开的应用)
    if (isAppSourceType(sourceType) && isSameAppIdentity(itemId, foregroundApp)) {
      return -50
    }

    // 根据前台应用推荐相关工具
    // IDE -> Terminal
    if (
      this.isIDE(foregroundApp.bundleId) &&
      isAppSourceType(sourceType) &&
      this.isTerminalApp(itemId)
    ) {
      return 60
    }

    // 浏览器 -> 开发工具
    if (
      this.isBrowserApp(foregroundApp.bundleId) &&
      isAppSourceType(sourceType) &&
      this.isDeveloperTool(itemId)
    ) {
      return 50
    }

    return 0
  }

  private matchSystemState(
    candidate: VolatileCandidate,
    systemState: NonNullable<ContextSignal['systemState']>
  ): number {
    const { sourceType, itemId } = candidate
    if (!isAppSourceType(sourceType)) return 0

    let score = 0
    const isBatteryConstrained =
      systemState.powerMode === 'battery' &&
      (typeof systemState.batteryLevel !== 'number' || systemState.batteryLevel <= 25)

    if (systemState.isOnline === false) {
      if (this.isBrowserApp(itemId) || matchesAppRule(itemId, APP_MATCH_RULES.downloadTool)) {
        score -= 25
      }
    }

    if (isBatteryConstrained) {
      if (this.isImageApp(itemId) || this.isIDE(itemId)) {
        score -= 16
      }
      if (this.isTextEditor(itemId) || this.isTerminalApp(itemId)) {
        score += 8
      }
    }

    if (systemState.focusMode === 'active' || systemState.isDNDEnabled) {
      if (this.isIDE(itemId) || this.isTerminalApp(itemId) || this.isTextEditor(itemId)) {
        score += 12
      }
      if (this.isEntertainmentOrSocialApp(itemId)) {
        score -= 20
      }
    }

    return score
  }

  /**
   * 判断是否为浏览器应用
   */
  private isBrowserApp(identifier: string): boolean {
    return matchesAppRule(identifier, APP_MATCH_RULES.browser)
  }

  private isEntertainmentOrSocialApp(identifier: string): boolean {
    return matchesAppRule(identifier, APP_MATCH_RULES.entertainment)
  }

  /**
   * 判断是否为编辑器应用
   */
  private isEditorApp(identifier: string): boolean {
    return matchesAppRule(identifier, APP_MATCH_RULES.editor)
  }

  /**
   * 判断是否为图片处理应用
   */
  private isImageApp(identifier: string): boolean {
    return matchesAppRule(identifier, APP_MATCH_RULES.image)
  }

  /**
   * 判断是否为 JetBrains IDE
   */
  private isJetBrainsIDE(identifier: string, products: string[]): boolean {
    return products.some((product) => {
      const rule = JETBRAINS_MATCH_RULES[product]
      return rule ? matchesAppRule(identifier, rule) : false
    })
  }

  /**
   * 判断是否为 VS Code
   */
  private isVSCode(identifier: string): boolean {
    return matchesAppRule(identifier, APP_MATCH_RULES.vscode)
  }

  /**
   * 判断是否为文本编辑器
   */
  private isTextEditor(identifier: string): boolean {
    return matchesAppRule(identifier, APP_MATCH_RULES.textEditor)
  }

  /**
   * 判断是否为文件管理工具
   */
  private isFileManagerApp(identifier: string): boolean {
    return matchesAppRule(identifier, APP_MATCH_RULES.fileManager)
  }

  /**
   * 判断是否为IDE
   */
  private isIDE(identifier: string): boolean {
    return matchesAppRule(identifier, APP_MATCH_RULES.ide)
  }

  /**
   * 判断是否为终端应用
   */
  private isTerminalApp(identifier: string): boolean {
    return matchesAppRule(identifier, APP_MATCH_RULES.terminal)
  }

  /**
   * 判断是否为开发工具
   */
  private isDeveloperTool(identifier: string): boolean {
    return (
      this.isIDE(identifier) ||
      this.isTerminalApp(identifier) ||
      matchesAppRule(identifier, APP_MATCH_RULES.apiClient)
    )
  }

  /**
   * 计算频率分数(带时间衰减)
   */
  private calculateFrequencyScore(stats: typeof schema.itemUsageStats.$inferSelect): number {
    const executeCount = stats.executeCount
    const searchCount = stats.searchCount
    const cancelCount = stats.cancelCount || 0

    const lastInteraction = Math.max(
      stats.lastExecuted?.getTime() || 0,
      stats.lastSearched?.getTime() || 0,
      stats.lastCancelled?.getTime() || 0
    )

    const daysSince = (Date.now() - lastInteraction) / (1000 * 60 * 60 * 24)
    const decayFactor = Math.exp(-0.1 * daysSince) // lambda = 0.1

    return (executeCount * 1.0 + searchCount * 0.3 + cancelCount * -0.5) * decayFactor
  }

  /**
   * 计算最近使用加成
   */
  private calculateRecencyBoost(lastUsed: Date | null): number {
    if (!lastUsed) return 0

    const hoursSince = (Date.now() - lastUsed.getTime()) / (1000 * 60 * 60)

    // 1 小时内: 100 分
    // 24 小时:  50 分
    // 7 天:     10 分
    return Math.max(0, 100 * Math.exp(-0.1 * hoursSince))
  }

  /**
   * 应用多样性过滤
   */
  private applyDiversityFilter(scored: ScoredItem[], limit: number): ScoredItem[] {
    const result: ScoredItem[] = []
    const typeCount = new Map<string, number>()

    for (const item of scored) {
      if (result.length >= limit) break

      const currentCount = typeCount.get(item.sourceType) || 0

      // 同类型不超过总数的 40%
      const maxPerType = Math.ceil(limit * 0.4)
      if (currentCount >= maxPerType && result.length >= limit / 2) {
        continue
      }

      result.push(item)
      typeCount.set(item.sourceType, currentCount + 1)
    }

    return result
  }

  /**
   * 去重候选项
   */
  private deduplicateCandidates(candidates: CandidateItem[]): CandidateItem[] {
    const seen = new Map<string, CandidateItem>()
    const result: CandidateItem[] = []

    for (const candidate of candidates) {
      const key = `${candidate.sourceId}:${candidate.itemId}`
      const existing = seen.get(key)
      if (!existing) {
        seen.set(key, candidate)
        result.push(candidate)
        continue
      }

      if (!existing.timeStats && candidate.timeStats) {
        existing.timeStats = candidate.timeStats
      }
      if (candidate.source === 'time-based') {
        existing.source = 'time-based'
      }
      // A new app can also own a zero-execute usage row (it was searched but
      // never launched), which puts it in an earlier dimension first. Keep the
      // install stamp so the novelty boost still fires, and label it as the
      // reason it actually ranks — but only while that boost is live.
      if (existing.installedAt === undefined && candidate.installedAt !== undefined) {
        existing.installedAt = candidate.installedAt
        if (existing.usageStats.executeCount === 0) {
          existing.source = 'newly-installed'
        }
      }
    }

    return result
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

  /**
   * 获取缓存的推荐
   */
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

    // 检查是否过期
    if (cached.expiresAt.getTime() < Date.now()) return null

    // Written before the last invalidation: the row predates whatever changed
    // (a newly installed app, an unpinned item) and would resurrect the exact
    // list that was just dropped from memory.
    if (cached.createdAt.getTime() < this.cacheInvalidatedAt) return null

    try {
      const items = JSON.parse(cached.recommendedItems)
      return { items: this.dedupeItems(items) }
    } catch (error) {
      recommendationLog.warn('Failed to parse cached recommendations', { meta: toErrorMeta(error) })
      return null
    }
  }

  /**
   * 缓存推荐结果
   */
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

/** 推荐选项 */
export interface RecommendationOptions {
  limit?: number
  forceRefresh?: boolean
  includeTypes?: string[]
  excludeTypes?: string[]
  /** 布局模式 */
  layoutMode?: 'list' | 'grid'
}

/** 推荐结果 */
export interface RecommendationResult {
  items: TuffItem[]
  context: ContextSignal
  duration: number
  fromCache: boolean
  /** 容器布局配置 */
  containerLayout?: TuffContainerLayout
}

interface TrendingPerf {
  durationMs: number
  rowCount: number
  ready: boolean
}

interface TrendingResult {
  items: ItemCandidate[]
  perf: TrendingPerf
}

interface CandidateResult {
  items: CandidateItem[]
  perf: {
    totalCandidates: number
    filteredCount: number
    trendingDurationMs: number
    trendingRows: number
    trendingCandidates: number
    trendingReady: boolean
  }
}

interface RecommendationPerfMetadata {
  durationMs: number | null
  cacheLayer?: string
}

interface PerfStats {
  samples: number
  avgMs: number
  p50Ms: number
  p95Ms: number
  maxMs: number
  overBudgetMs: number
  overBudgetCount: number
}

/**
 * 项目候选
 */
interface ItemCandidate {
  sourceId: string
  itemId: string
  sourceType: string
  usageStats: typeof schema.itemUsageStats.$inferSelect
  timeStats?: ParsedItemTimeStats
  /** Plugin-provided candidate data (for source='plugin' or builtin clipboard URL) */
  pluginCandidate?: PluginRecommendCandidate
  /** Epoch ms the app was installed on this machine; drives the novelty boost. */
  installedAt?: number
}

/**
 * Minimum identity a volatile-context matcher needs. Cached TuffItems are
 * projected onto this shape so the same matchers serve both the fresh scoring
 * pass and the post-cache re-rank.
 */
interface VolatileCandidate {
  sourceId: string
  itemId: string
  sourceType: string
}

/** 候选项(带来源标记) */
interface CandidateItem extends ItemCandidate {
  source:
    | 'frequent'
    | 'recent'
    | 'time-based'
    | 'trending'
    | 'context'
    | 'pinned'
    | 'plugin'
    | 'newly-installed'
    | 'cold-start'
}

/**
 * 评分后的项目
 */
export interface ScoredItem extends CandidateItem {
  score: number
}

interface RecommendationSemanticSettings {
  localVectorEnabled: boolean
  aiRerankEnabled: boolean
  aiEmbeddingEnabled: boolean
}

function normalizeRecommendationSemanticSettings(value: unknown): RecommendationSemanticSettings {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    localVectorEnabled:
      typeof raw.localVectorEnabled === 'boolean'
        ? raw.localVectorEnabled
        : DEFAULT_RECOMMENDATION_SEMANTIC_SETTINGS.localVectorEnabled,
    aiRerankEnabled:
      typeof raw.aiRerankEnabled === 'boolean'
        ? raw.aiRerankEnabled
        : DEFAULT_RECOMMENDATION_SEMANTIC_SETTINGS.aiRerankEnabled,
    aiEmbeddingEnabled:
      typeof raw.aiEmbeddingEnabled === 'boolean'
        ? raw.aiEmbeddingEnabled
        : DEFAULT_RECOMMENDATION_SEMANTIC_SETTINGS.aiEmbeddingEnabled
  }
}

function isDefaultRecommendationSemanticSettings(
  settings: RecommendationSemanticSettings
): boolean {
  return (
    settings.localVectorEnabled === DEFAULT_RECOMMENDATION_SEMANTIC_SETTINGS.localVectorEnabled &&
    settings.aiRerankEnabled === DEFAULT_RECOMMENDATION_SEMANTIC_SETTINGS.aiRerankEnabled &&
    settings.aiEmbeddingEnabled === DEFAULT_RECOMMENDATION_SEMANTIC_SETTINGS.aiEmbeddingEnabled
  )
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`Recommendation semantic AI timeout after ${timeoutMs}ms`))
        }, timeoutMs)
      })
    ])
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}

/** Empty usage stats placeholder for plugin/builtin candidates that have no usage history */
const EMPTY_USAGE_STATS = {
  sourceId: '',
  itemId: '',
  sourceType: '',
  searchCount: 0,
  executeCount: 0,
  cancelCount: 0,
  lastSearched: null,
  lastExecuted: null,
  lastCancelled: null,
  createdAt: new Date(),
  updatedAt: new Date()
} as typeof schema.itemUsageStats.$inferSelect
