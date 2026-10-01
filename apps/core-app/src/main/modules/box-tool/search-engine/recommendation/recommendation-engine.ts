import type { TuffContainerLayout, TuffItem } from '@talex-touch/utils'
import type {
  IExecuteArgs,
  IExecuteOutcome,
  PluginRecommendCandidate,
  RecommendProvider
} from '@talex-touch/utils/core-box'
import type { AppSetting } from '@talex-touch/utils/common/storage/entity/app-settings'
import type { DbUtils } from '../../../../db/utils'
import type { ParsedItemTimeStats } from '../time-stats-aggregator'
import type { ContextSignal, TimePattern } from './context-provider'
import { createHash } from 'node:crypto'
import { StorageList } from '@talex-touch/utils'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { appTaskGate } from '../../../../service/app-task-gate'
import { and, desc, eq, gt, gte, inArray, lt, sql } from 'drizzle-orm'
import { scheduleAuxWrite, scheduleDbWrite } from '../../../../db/db-write'
import { getStartupDegradeWindowRemainingMs } from '../../../../db/runtime-flags'
import * as schema from '../../../../db/schema'
import { getSentryService } from '../../../sentry'
import { ContextProvider, hashContextContent } from './context-provider'
import { toParsedItemTimeStats } from '../time-stats-aggregator'
import { ItemRebuilder } from './item-rebuilder'
import { createClipboardRecommendationSource } from './clipboard-recommendation-source'
import { createFileRecommendationSource } from './file-recommendation-source'
import { createAppRecommendationSource } from './app-recommendation-source'
import {
  BUILTIN_CLIPBOARD_URL_SOURCE_ID,
  createSnapshotRecommendationSource,
  pluginRecommendationSourceId,
  type PluginRecommendSnapshot
} from './plugin-recommendation-source'
import { recommendationSourceRegistry } from './recommendation-source-registry'
import { bindPluginRecommendationApi } from './plugin-recommendation-api'
import { openValidatedExternalUrl } from '../../../../utils/external-url-policy'
import { shell } from 'electron'
import { describeRecommendation } from './recommendation-presentation'
import { isRecommendableNewFile } from './file-recommendation-admission'
import { i18nMsg } from '@talex-touch/utils/i18n'
import { isSameAppIdentity, matchesAppRule, type AppMatchRule } from './app-identity-match'
import { APP_IDENTITY_EXTENSION_KEY, resolveAppItemId } from '../../addon/apps/app-index-metadata'
import {
  APP_DESTINATION_ITEM_IDS,
  APP_DESTINATION_PROVIDER_ID,
  COMMON_SETTING_DESTINATION_IDS,
  getAppDestination
} from '../../../../../shared/app-destinations'
import { recommendationExposureService } from './recommendation-exposure-service'
import { enterPerfContext } from '../../../../utils/perf-context'
import { createLogger } from '../../../../utils/logger'
import {
  DAY_MS,
  BEHAVIOR_SCORE_MAX,
  calculateBehaviorScore,
  calculatePluginPriorityContribution,
  calculateTimeContribution,
  isSparseUsageBehaviorRow,
  resolveEvidenceBackedReason,
  usageBehaviorRowToFacts,
  toDayBucket,
  toErrorMeta,
  toPrimitive,
  type LogMeta,
  type UsageBehaviorRow
} from './recommendation-utils'
import type { UsageBehaviorFacts } from '@talex-touch/utils/core-box'
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
  calculateLocalSemanticScore,
  type RecommendationSemanticCandidateInput,
  type RecommendationSemanticProfile
} from './semantic-profile'

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
/**
 * Band for host-generated contextual candidates (currently the clipboard-URL card).
 *
 * These carry a priority the *host* assigned from a signal it observed itself, so they may sit
 * above usage the way an explicit intent should. Kept at the original 1e5 so the clipboard card's
 * effective score (95 × 1e5) is unchanged.
 */
const HOST_CONTEXT_PRIORITY_WEIGHT = 1e5
/**
 * Band for plugin-declared `priority`.
 *
 * `priority` is a number the plugin picks for itself, so it may only nudge a plugin's own
 * candidates: {@link calculatePluginPriorityContribution} maps any manifest value into 0..5, and
 * this band puts those 5 points at 5e4 — far under a single real execution's behaviour score and
 * under every recency boost. A plugin can order its own candidates and be visible, but climbing
 * past the user's habits requires being used through the same shared behaviour model.
 */
const PLUGIN_PRIORITY_WEIGHT = 1e4
/**
 * Band for the automatic behaviour + time ranking. The two are capped together at
 * {@link BEHAVIOR_SCORE_MAX} (100), so one point is 1e4 and a fully established habit reaches
 * 1e6 — level with the old `executeCount * 1e4` asymptote but reached by saturation rather than by
 * unbounded accumulation.
 */
const BEHAVIOR_SCORE_WEIGHT = 1e4
/** Candidates one plugin may contribute to a single recommendation pass. */
const PLUGIN_CANDIDATES_PER_PROVIDER_LIMIT = 5
/**
 * Unused novelty candidates (fresh installs, new files) the list may carry when the user already
 * has usable history. Cold start lifts the cap, because there habits do not exist yet.
 */
const EXPLORATION_LIMIT = 1
/** Candidates all plugins together may contribute, so N plugins cannot crowd out the built-ins. */
const PLUGIN_CANDIDATES_TOTAL_LIMIT = 15
/** One row. The grid tier is capped to it so the two tiers stay visually distinct. */
const GRID_TIER_COLUMNS = 6

/**
 * A captured selection is the same privacy tier as the clipboard but a weaker
 * intent signal — it is often minutes old and was captured for another action.
 */
const SELECTION_CONTEXT_WEIGHT = 0.6
/** Cold-start items rank below anything with real usage but above nothing at all. */
export const COLD_START_BASE_SCORE = 1e3
/**
 * Novelty channel for freshly installed apps. Frecency scores a brand-new item
 * at exactly zero, so without an explicit exploration channel an app the user
 * just installed can never outrank their habits.
 *
 * Bounded below the top of the behaviour band (100 × {@link BEHAVIOR_SCORE_WEIGHT}) so a fresh
 * install cannot outrank a mature habit — exploration may surface news, not bury the things the
 * user actually uses. It still sits above the recency boost (≤1e5) and cold start (1e3).
 */
const NOVELTY_WEIGHT = 9e5
/** Full-strength window after install. */
const NOVELTY_FULL_WINDOW_MS = 48 * 60 * 60 * 1000
/** Novelty is gone past this age, and freshness gating uses the same horizon. */
const NOVELTY_MAX_AGE_MS = 7 * DAY_MS
/** Candidate slots reserved for the freshness dimension. */
const NEWLY_INSTALLED_CANDIDATE_LIMIT = 10
/**
 * Candidate slots for freshly created files.
 *
 * Smaller than the app limit on purpose. An install is a deliberate act and there are only ever a
 * few; files arrive by the hundred, and the grid is not a file manager. The admission rules narrow
 * the pool, this bounds what survives them.
 */
const NEWLY_ADDED_FILE_CANDIDATE_LIMIT = 4
/**
 * Candidate slots for the built-in Tuff destinations.
 *
 * The empty state is otherwise made of whatever the catalog and the user's history happen to
 * contain, so a profile with only a little history gets a grid of one and a fresh install gets
 * whatever it has scrolled through. These doors are host-owned and always on offer; three is a
 * floor rather than a section — enough to be useful, few enough that they cannot become the grid.
 */
const BUILTIN_DESTINATION_CANDIDATE_LIMIT = 3
/**
 * Scoring nudge for a built-in destination candidate.
 *
 * These arrive with no usage history, so without a term of their own they would score 0 and sit
 * under the cold-start app suggestions (1e3). This puts them just above *those* while staying under
 * a single real execution's behaviour score (one point is 1e4, a full habit 100 × 1e4), under the
 * novelty band (9e5) and under what a recent execution's recency boost contributes. A destination
 * the user actually uses arrives from the frequent/recent dimension with its own real score, and
 * this term is granted only to the never-used nominees — it is a tie-break among suggestions, never
 * a way past the things the user actually reaches for.
 */
const BUILTIN_DESTINATION_SCORE_MAX = 5e3
/**
 * Rows fetched before admission filtering.
 *
 * The exclusion rules run in JS on the way out of a SQL `LIMIT`, so the query has to over-fetch or
 * a burst of build output would consume the whole budget and leave nothing admissible.
 */
const NEWLY_ADDED_FILE_SCAN_LIMIT = 200
/**
 * `file_extensions` key holding the app's filesystem creation time, written
 * once by the app provider and never refreshed (a self-update rebuilds the
 * bundle and would otherwise read as a fresh install).
 */
const INSTALLED_AT_EXTENSION_KEY = 'installedAt'
/** Exposure slice tag for measuring the novelty channel separately. */
const NEWLY_INSTALLED_EXPOSURE_TAG = 'newly-installed'
const SEMANTIC_LOCAL_WEIGHT = 6e5
const SEMANTIC_AI_EMBEDDING_WEIGHT = 4e5
const SEMANTIC_AI_RERANK_WEIGHT = 3e5
const SEMANTIC_AI_RERANK_ORDER_WEIGHT = 1e4
const SEMANTIC_AI_TIMEOUT_MS = 800
/**
 * Kept under the renderer's 400ms recommendation give-up (SEARCH/recommendation
 * timeout in useSearch) so yielding to app tasks can never be the reason the
 * user is shown an empty CoreBox.
 */
const RECOMMENDATION_APP_TASK_WAIT_MS = 300
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

/**
 * Version of the persisted ranking, carried as the cache key's first segment.
 *
 * A persisted row is only readable under the key it was written with, so a build that changes what
 * the empty state *can* contain has to move the key: without this, a row written by the previous
 * version keeps serving its list for the rest of its 30-minute life, and the new channel looks
 * broken until it expires. Bump when the candidate set changes; rows from older versions simply
 * age out, which is the correct cost of the change being visible immediately.
 */
const RECOMMENDATION_CACHE_SCHEMA_VERSION = 2

export class RecommendationEngine {
  private contextProvider: ContextProvider
  private itemRebuilder: ItemRebuilder

  private recommendationCache: {
    items: TuffItem[]
    timestamp: number
    context: ContextSignal
    cacheKey: string
  } | null = null

  /**
   * Bumped on any change that makes a computed ranking stale. The single invalidation source, so
   * both the synchronous read guard and the in-flight check below observe the same generation.
   */
  private cacheGeneration = 0
  /** Persisted rows older than this were invalidated and must not be read back. */
  private cacheInvalidatedAt = 0

  /** Releases this engine's claim on the host-owned recommendation sources (clipboard, file). */
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
  /**
   * The jittered handle for the next background refresh.
   *
   * Tracked because the polling callback only *schedules* the refresh: stopBackgroundRefresh
   * unregistered the polling task but left this pending, so a full recommendation pass could still
   * run after shutdown, against a database the owner had already torn down (#652).
   */
  private refreshJitterTimer: NodeJS.Timeout | null = null
  private usageIdentityMigrationScheduled = false

  /** Plugin-registered recommendation providers */
  private pluginProviders: Map<string, { pluginName: string; provider: RecommendProvider }> =
    new Map()

  /**
   * Host-produced candidate snapshots, keyed by provider id then item id.
   *
   * Built by the candidate pass and read only by `executePluginRecommend`. The renderer never
   * supplies this: it is what makes the executed candidate the same one the host ranked, so the
   * usage count joins the right row and a forged `action`/`data` payload cannot reach a plugin.
   */
  private pluginSnapshots = new Map<string, Map<string, PluginRecommendSnapshot>>()

  /**
   * The host-generated clipboard-URL card's snapshot.
   *
   * Same trust rule as the plugin snapshots: the card is clickable only while this holds the URL the
   * host just read from the clipboard and matched against the context digest. The renderer's copy of
   * `meta.pluginRecommend.data.url` is never opened, so a forged card cannot make the host launch an
   * arbitrary URL, and a URL the clipboard no longer holds is not executable at all.
   */
  private builtinClipboardSnapshots = new Map<string, PluginRecommendSnapshot>()

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
    this.itemRebuilder = new ItemRebuilder()

    // Clipboard history and file rows recommend through host-owned sources rather than through a
    // search provider: clipboard has no provider at all, and file lookups must go through this
    // engine's split-aware handle (#295) rather than FileProvider's own `createDbUtils`.
    // Unregister first because both are bound to this engine's handles — a new engine legitimately
    // takes over from a torn-down one, and nothing else writes these ids.
    this.disposeOwnedSources = [
      createClipboardRecommendationSource(dbUtils),
      createFileRecommendationSource(dbUtils, {
        // A thumbnail that landed after the rebuild shipped is baked into the cached cards as an
        // OS icon; the next open must rebuild rather than replay them.
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
    for (const dispose of this.disposeOwnedSources) dispose()
    this.disposeOwnedSources = []
    this.pollingService.unregister(this.refreshTaskId)
    this.pollingService.unregister(this.trendBackfillTaskId)
    this.pollingService.unregister(this.telemetryTaskId)
    if (this.refreshJitterTimer) {
      clearTimeout(this.refreshJitterTimer)
      this.refreshJitterTimer = null
    }
    // Cleared so a stop during the jitter window does not leave the guard latched: the next
    // startBackgroundRefresh would then schedule nothing at all.
    this.refreshInFlight = false
    if (this.usageIdentityMigrationTimer) {
      clearTimeout(this.usageIdentityMigrationTimer)
      this.usageIdentityMigrationTimer = null
    }
  }

  /**
   * Register a plugin recommendation provider.
   *
   * Besides holding the provider for the candidate pass, this registers a recommendation *source*
   * for it, so a candidate the plugin proposed can be executed through the normal source path: the
   * host snapshot produced by the pass is the only thing the dispatch trusts, and the plugin's own
   * `onExecute` is what decides acceptance. Without this the item was clickable but nothing counted.
   *
   * @returns A dispose function to unregister the provider, its source, and its snapshots.
   */
  public registerPluginProvider(pluginName: string, provider: RecommendProvider): () => void {
    // Required, not optional: the candidate the plugin declares is clickable, so it must have
    // somewhere to dispatch to. A provider without it would register an inert card.
    if (typeof provider.onExecute !== 'function') {
      throw new Error(
        `[RecommendationEngine] Plugin recommendation provider "${provider.id}" must implement onExecute`
      )
    }

    // Source first, map second. `registerSource` throws when the id is already owned, and at that
    // point nothing has been mutated — the incumbent provider and its source stay paired. Setting
    // the map first would replace the owner while the registry still held the old source.
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
      // A disposer must not revoke a *different* provider that has since claimed the same id.
      // Registration of an id after disposal is legal, so the stale handle from the previous
      // instance is inert here: it can neither drop the new source nor unregister the new provider,
      // and a second call on the same handle is a no-op because the entry is already gone.
      if (this.pluginProviders.get(provider.id)?.provider !== provider) return
      disposeSource()
      this.pluginSnapshots.delete(provider.id)
      this.unregisterPluginProvider(pluginName, provider.id)
    }
  }

  /**
   * Dispatch an execute to the plugin provider that proposed it.
   *
   * The candidate is read from the host-produced snapshot, never from the renderer payload: the
   * item's `_originalItemId` selects the row and the plugin only decides whether it accepted. A
   * `false` return or a thrown error is a failure — the host must not count it, and there is no
   * fabricated acceptance.
   */
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

  /**
   * Execute the host-generated clipboard-URL card.
   *
   * The URL is read back from the host snapshot, never from the item the renderer sent: opening an
   * external URL is the one irreversible side effect here, and the renderer's `data.url` is exactly
   * the kind of input that must not reach `shell.openExternal`. The snapshot is only written by
   * `getClipboardUrlCandidates`, which has already matched the clipboard against the context digest,
   * so a hit also proves the clipboard still holds that URL. The secondary "copy-url" action is a
   * plain copy and deliberately does not come through here — it is not the major action.
   */
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

  /**
   * Unregister one of `pluginName`'s recommendation providers by ID.
   *
   * The owner is part of the address because the map is keyed by provider id alone: without the
   * guard, any plugin that learned a rival's id could remove that rival's provider (and the
   * matching source snapshot) through its own unregister call. An id owned by another plugin is
   * reported as not removed rather than silently deleted, so a caller can never revoke a provider
   * it does not own.
   */
  public unregisterPluginProvider(pluginName: string, providerId: string): boolean {
    const entry = this.pluginProviders.get(providerId)
    if (!entry || entry.pluginName !== pluginName) return false
    const removed = this.pluginProviders.delete(providerId)
    if (removed) {
      // The source and the snapshot must go with the provider: a disposed plugin leaves no
      // executable source behind and no stale candidate the next pass could dispatch to.
      recommendationSourceRegistry.unregister(`plugin-recommend:${providerId}`)
      this.pluginSnapshots.delete(providerId)
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

  /**
   * Generate the recommendation list, never publishing a snapshot that an invalidation overtook.
   *
   * Blocking the cache *write* is not enough (R7): a compute that started before an execution was
   * accepted would still hand the caller the pre-execution ranking. So the generation is checked
   * again after the work and, if it moved, the whole pass is recomputed before anything is
   * returned. The retry is bounded; a steady stream of invalidations must not hang the caller.
   */
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

  /** The single recommendation computation; `recommend()` owns publication. */
  private async computeRecommendation(
    options: RecommendationOptions = {}
  ): Promise<RecommendationResult> {
    // 启动期 appTaskGate 活跃时，先等待空闲再执行推荐计算，避免与启动任务竞争主线程。
    //
    // 但这里是交互路径的入口：CoreBox 空查询每次打开都会走到（search-core 的
    // empty-query 分支）。无参 waitForIdle() 会一直等，而渲染层 400ms 就放弃并清空
    // 状态，结果是索引扫描期间打开 CoreBox 只能看到空列表。所以只让一小段，超时照常
    // 算——让出主线程是优化，不是正确性前提。
    //
    // runBackgroundRefresh 是后台调用方，它在调用本方法前已经自己无界等过一次，
    // 到这里 gate 通常已空闲，不受这个上界影响。
    if (appTaskGate.isActive()) {
      await appTaskGate.waitForIdle(RECOMMENDATION_APP_TASK_WAIT_MS)
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

    // Skipped outright on a forced refresh rather than read and discarded. The
    // read is a cache-key build, a SELECT on recommendation_cache (which falls
    // back to the primary db when the aux row is missing), a JSON.parse of up to
    // 10 fully-rendered TuffItems and a dedupe pass — all of it thrown away. The
    // 15-minute background refresh and every user-triggered refresh pay it (#675).
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
        // The rebuilder writes a reason for everything scored; anything reaching here was not
        // scored. Call it a suggestion rather than 'frequent' — a habit badge it has no evidence
        // for is exactly the fabricated reason R9 forbids.
        meta.recommendation = describeRecommendation('cold-start')
      }
    }

    const backfilledItems = await this.backfillShortfall(filteredItems, pinnedTuffItems, limit)
    const combinedItems = this.combineRecommendedWithPinned(backfilledItems, pinnedTuffItems, limit)

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

  /**
   * Two tiers: a grid of launch targets, then a list of things the host is proposing.
   *
   * The grid holds only what the user has a right to reach for without explanation: their pinned
   * entries, and habits that crossed the strict frequent threshold. It is deliberately NOT filled
   * to capacity — a grid padded with exploration or loose suggestions is what let a never-used
   * install sit where a real habit belonged. When nothing qualifies the section is absent and the
   * empty state is a single list.
   *
   * Files never enter the grid, pinned or not. A tile is an icon and a name; a file's thumbnail
   * often is not generated yet (and cannot be, for media outside the `tfile` allowlist), so it
   * would render as a grey square — while as a row it gets its path, size and date. Its reason
   * badge has room there too, which is the point of the lower tier. Files are also what opens the
   * right-hand preview pane (`addon` in CoreBox.vue), and a bare icon row is the wrong anchor for a
   * panel that takes most of the window: anything that would open it belongs in the list.
   */
  /**
   * Whether this item reads as a grid tile rather than a list row.
   *
   * A tile is an icon plus a name. Files are excluded because their thumbnail is often not
   * generated yet — and for media outside the `tfile` allowlist it never can be — so a file tile
   * is a grey square with a truncated filename, while a file row carries its path, size and date.
   * Keeping them out is also what keeps the preview pane out of the grid: the renderer opens it
   * for a focused `kind: 'file'` item, and the grid must never hold one.
   */
  private isTileableRecommendation(item: TuffItem): boolean {
    return item.kind !== 'file' && item.kind !== 'folder' && item.source?.type !== 'file'
  }
  private buildContainerLayout(
    _options: RecommendationOptions,
    items: TuffItem[]
  ): TuffContainerLayout {
    const sections: TuffContainerLayout['sections'] = []

    // Pinned tileable entries come first in the grid, in list order; everything else on the grid
    // must have crossed the strict frequent threshold. There is no fill: a short grid stays short.
    const pinnedTiles: TuffItem[] = []
    const eligibleTiles: TuffItem[] = []
    const listItems: TuffItem[] = []

    for (const item of items) {
      const isPinned = item.meta?.pinned?.isPinned === true
      if (!this.isTileableRecommendation(item)) {
        listItems.push(item)
        continue
      }
      if (isPinned) {
        pinnedTiles.push(item)
        continue
      }
      if (this.isGridEligible(item)) eligibleTiles.push(item)
      else listItems.push(item)
    }

    // One row only, and never padded with exploration or other suggestions: the top tier is the
    // user's pinned entries plus habits that actually crossed the threshold. No eligible tile and
    // nothing pinned means there is no habitual section at all.
    const grid = [...pinnedTiles, ...eligibleTiles].slice(0, GRID_TIER_COLUMNS)
    const columns = Math.min(GRID_TIER_COLUMNS, items.length || GRID_TIER_COLUMNS)

    if (grid.length > 0) {
      sections.push({
        id: 'habitual',
        title: i18nMsg('coreBox.sections.habitual'),
        layout: 'grid',
        itemIds: grid.map((item) => item.id)
      })
    }

    // A pinned file cannot tile, but the user still asked to always see it, so it leads the list
    // instead of trailing it where pinning appended it. Grid overflow, pinned files and everything
    // else that is proposed rather than habitual lands here in the order the scorer produced.
    const gridIds = new Set(grid.map((item) => item.id))
    const proposed = [
      ...listItems.filter((item) => item.meta?.pinned?.isPinned === true),
      ...listItems.filter((item) => item.meta?.pinned?.isPinned !== true)
    ].filter((item) => !gridIds.has(item.id))

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
      grid: {
        columns,
        gap: 12,
        itemSize: 'medium'
      },
      sections
    }
  }

  /**
   * Whether this item earned a grid slot by habit rather than by label.
   *
   * The badge a candidate arrived with is not evidence: a plugin item or a cold-start suggestion is
   * never eligible, and a `frequent`-labelled row only qualifies when the scorer confirmed the
   * strict threshold from real dated executions. Pinned items bypass this by design — they are the
   * user's explicit choice — and are handled by the caller.
   */
  private isGridEligible(item: TuffItem): boolean {
    const recommendation = (item.meta as Record<string, unknown> | undefined)?.recommendation as
      | { frequentEligible?: boolean }
      | undefined
    return recommendation?.frequentEligible === true
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
   * Refills the recommendation budget when fewer candidates survived the rebuild
   * than there are slots for them.
   *
   * Scoring and rendering count different things, and the gap is normal rather
   * than exceptional: a source that fails to rebuild returns `[]` on purpose
   * ("One source failing must not empty the whole grid", `item-rebuilder.ts`),
   * and `SystemActionsProvider` now drops one-shot actions — `file-index`,
   * `tpex-plugin`, `app-index`, `dev-plugin` — from the grid deliberately, which
   * is what used to fill ⌘7–⌘9. Only a *total* rebuild failure fell back before
   * this, so 3 items rebuilt against a limit of 10 left seven slots empty.
   *
   * The backfill is ranked strictly below every survivor rather than merged by
   * score. The ranker writes one absolute ruler banded by decade — novelty 1e7,
   * context 1e6, time 1e5, frequency 1e4 — with cold-start pinned at
   * `COLD_START_BASE_SCORE` (1e3) and frequent fallbacks at a raw execute count
   * precisely so they sit under everything real. That holds for any survivor
   * with usage worth the name, but the base score has no floor: an app executed
   * once a month ago decays to a few hundred, and cancels subtract. Left to raw
   * scores, a rebuild failure could then *promote* a never-used app over the
   * stale-but-real one that survived it. Rewriting `final` is that field's
   * stated contract — the ranker owns the post-sort value, and it is explicitly
   * not a 0–1 quantity.
   */
  private async backfillShortfall(
    recommendItems: TuffItem[],
    pinnedItems: TuffItem[],
    limit: number
  ): Promise<TuffItem[]> {
    // Mirrors how combineRecommendedWithPinned splits the budget: pinned items
    // claim their slots first, so only the remainder is ours to fill.
    const budget = Math.max(0, limit - Math.min(pinnedItems.length, limit))
    const shortfall = budget - recommendItems.length
    if (shortfall <= 0) return recommendItems

    const taken = new Set(
      [...recommendItems, ...pinnedItems].map((item) => this.getItemIdentity(item))
    )
    const backfill = this.dedupeItems(await this.resolveFallbackItems(budget))
      .filter((item) => !taken.has(this.getItemIdentity(item)))
      .slice(0, shortfall)
    if (backfill.length === 0) return recommendItems

    const lowestSurviving = recommendItems.reduce(
      (lowest, item) => Math.min(lowest, item.scoring?.final ?? 0),
      Number.POSITIVE_INFINITY
    )
    // Capped at the fallback band's own top, so the rewrite only intervenes when
    // it has to. Under any survivor with real usage (frequency × 1e4 alone puts
    // it far above 1e3) the backfill lands at 999, 998, … — what a cold-start
    // item carries anyway — and the persisted cache row still reads as the
    // never-used app it is. Under a stale survivor that fell below 1e3 it drops
    // beneath that instead. An all-pinned grid leaves no survivor at all; 0
    // keeps the backfill at or below the fallback band like every other case.
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
   * Fallback recommendation strategy: real executes first, ranked by the shared behaviour score.
   *
   * The same behaviour batch the pass uses is read here so the fallback ranks on real dated
   * evidence, and an item with no evidence at all is left for `getColdStartRecommendations` rather
   * than being surfaced as a habit.
   */
  private async getFallbackRecommendations(limit: number): Promise<TuffItem[]> {
    try {
      const frequentItems = await this.getFrequentItems(limit * 2) // Get more to ensure we have enough after rebuild

      if (frequentItems.length === 0) {
        recommendationLog.debug('No frequent items found in database')
        return []
      }

      const behaviorByKey = await this.loadUsageBehaviorByKey(
        frequentItems.map((item) => ({ sourceId: item.sourceId, itemId: item.itemId }))
      )

      // The rebuilder writes the full `meta.recommendation` (source, score, badge) from the
      // candidate's source. Overwriting it here with a bare `{ source }` used to strip the badge
      // off every backfilled tile.
      const items = await this.itemRebuilder.rebuildItems(
        frequentItems.map((item) => {
          const behavior = behaviorByKey.get(`${item.sourceId}:${item.itemId}`)
          // Same rule as the candidate pass: the label must be earned. A lifetime count cannot
          // claim "Frequent" without the strict 5/3 dated evidence, and it cannot borrow another
          // behavioural claim either — with no accepted event it falls back to "Suggested" (R9).
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
   * The usage identity each catalog row is recorded under, keyed by file id.
   *
   * Mirrors `AppProvider`/`ApplicationIndex` precedence — `appIdentity || path || bundleId`, via the
   * shared `resolveAppItemId`. Reading it from the same `file_extensions` rows the catalog scan
   * writes is what keeps the novelty gate on one bucket per app; a lookup failure degrades to "no
   * identities", where the caller falls back to the path rather than skipping the app.
   */
  private async loadAppCatalogIdentityByFileId(
    apps: Array<{ id: number; path: string }>
  ): Promise<Map<number, string>> {
    const identities = new Map<number, string>()
    if (apps.length === 0) return identities

    try {
      const extensions = await this.appCatalogDbUtils.getFileExtensionsByFileIds(
        apps.map((app) => app.id),
        [APP_IDENTITY_EXTENSION_KEY, 'bundleId']
      )
      const byFileId = new Map<number, Record<string, string>>()
      for (const extension of extensions) {
        if (typeof extension.value !== 'string') continue
        const entry = byFileId.get(extension.fileId) ?? {}
        entry[extension.key] = extension.value
        byFileId.set(extension.fileId, entry)
      }
      for (const app of apps) {
        const entry = byFileId.get(app.id)
        identities.set(
          app.id,
          resolveAppItemId({
            appIdentity: entry?.[APP_IDENTITY_EXTENSION_KEY],
            bundleId: entry?.['bundleId'],
            path: app.path
          })
        )
      }
    } catch (error) {
      recommendationLog.debug('Failed to read app catalog identities', { meta: toErrorMeta(error) })
    }
    return identities
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
      // The usage key is the source-declared catalog identity, not `files.id` and not a bare path:
      // execution records apps under `appIdentity || path || bundleId`, so joining the novelty gate
      // on the path alone would miss the row a first execution just wrote and keep re-suggesting an
      // app the user already opened.
      const identityByFileId = await this.loadAppCatalogIdentityByFileId(recentlyIndexed)
      const catalogIdFor = (app: { id: number; path: string }): string =>
        identityByFileId.get(app.id) || app.path
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
            fresh.map(({ app }) => ({ sourceId: 'app-provider', itemId: catalogIdFor(app) }))
          )
        ).map((stat) => [`${stat.sourceId}:${stat.itemId}`, stat])
      )

      // First real execution ends the novelty claim (R6/AC11): the item stays in the pool through
      // the behaviour dimensions, it simply stops being news. Lifetime count is the right control
      // here — an accepted execution older than the 30-day window still proves the app was opened.
      // Never gate on `installedAt`: its absence is silent in this query and would skip every app.
      const unused = fresh.filter(
        ({ app }) =>
          (usageStatsMap.get(`app-provider:${catalogIdFor(app)}`)?.executeCount ?? 0) === 0
      )
      if (unused.length === 0) return []

      return unused.map(({ app, installedAt }) => {
        const itemId = catalogIdFor(app)
        return {
          sourceId: 'app-provider',
          itemId,
          sourceType: 'application',
          usageStats: usageStatsMap.get(`app-provider:${itemId}`) ?? EMPTY_USAGE_STATS,
          source: 'newly-installed' as const,
          firstSeenAt: installedAt
        }
      })
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

    // 维度 1: 有真实执行的项目。Whether each is actually "Frequent" is decided from the batch
    // behaviour read below — five uses in one afternoon is not a habit, so a candidate that has not
    // crossed the strict 5/3 threshold is relabelled to a category its evidence can support rather
    // than wearing a Frequent badge it did not earn.
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
    // 恒为零分，只有这条通道能让它被看见。非冷启动时这条探索通道另行限额（见
    // admitExplorationWithinBudget），不能借候选池绕过。
    const newlyInstalled = await this.getNewlyInstalledItems(NEWLY_INSTALLED_CANDIDATE_LIMIT)
    recommendationLog.debug('Loaded newly installed candidates', {
      meta: { count: newlyInstalled.length }
    })
    candidates.push(...newlyInstalled)

    const newlyAddedFiles = await this.getNewlyAddedFileItems(NEWLY_ADDED_FILE_CANDIDATE_LIMIT)
    recommendationLog.debug('Loaded newly added file candidates', {
      meta: { count: newlyAddedFiles.length }
    })
    candidates.push(...newlyAddedFiles)

    // 维度 7: 内置 Tuff 目标入口。The six dimensions above are all "what happened on this machine",
    // so a profile with little history answers the empty query with one card and a fresh install
    // with whatever it has already scrolled through. These doors are host-owned and identical on
    // every machine, which is exactly what makes them worth proposing here. Nominated last, so the
    // first occurrence of an identity is the machine's own: a destination the user really uses
    // arrives from the frequent/recent dimensions and keeps its real evidence and its badge.
    const builtinDestinations = this.getBuiltinDestinationCandidates()
    candidates.push(...builtinDestinations)

    // 内置剪贴板 URL 推荐不在这里注入：候选池的产物会进缓存，而缓存键已不含剪贴板
    // (见 buildRecommendationCacheKey)，一旦入缓存，剪贴板换了之后旧的 URL 动作仍会
    // 被命中返回，并与新建的那条并存。它由易变阶段 buildVolatileItems 每次请求现建。

    recommendationLog.debug('Collected candidates before dedupe', {
      meta: { count: candidates.length }
    })

    const totalCandidates = candidates.length

    // 去重(同一 sourceId + itemId 只保留第一次出现)
    const deduplicated = this.deduplicateCandidates(candidates)

    // One batch read for the whole pass, taken after dedupe so each identity is asked once. Every
    // consumer downstream (scorer, evidence, layout) reads these same facts for the same identity,
    // so no surface can invent a second history.
    const behaviorByKey = await this.loadUsageBehaviorByKey(
      deduplicated.map((item) => ({ sourceId: item.sourceId, itemId: item.itemId }))
    )
    for (const item of deduplicated) {
      item.behavior = behaviorByKey.get(`${item.sourceId}:${item.itemId}`)
    }

    // The recall tag stays what recalled the item; the *reason* it is shown with is derived from
    // dated evidence in the rebuilder, so a `frequent` recall with a legacy lifetime count cannot
    // print a habit badge it cannot support (R9).

    // Cold start is decided by behaviour, not by candidate count: the pool is always populated by
    // the catalog channels, so "no valid history at all" has to be measured directly. Below the
    // frequent threshold but with some history is NOT cold start (R6).
    const coldStart = !this.hasAnyUsageHistory(behaviorByKey)

    // Non-cold-start explore budget: at most one unused novelty item may survive into the list.
    const filtered = coldStart ? deduplicated : this.admitExplorationWithinBudget(deduplicated)

    // 统计各 source 的分布
    const sourceDistribution = new Map<string, number>()
    for (const item of filtered) {
      const key = item.sourceId
      sourceDistribution.set(key, (sourceDistribution.get(key) ?? 0) + 1)
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

  /**
   * Built-in Tuff destinations as empty-state candidates.
   *
   * Every other dimension is a record of this machine — what was used, what was installed, what
   * appeared on disk — so on a profile with little or no history the grid can be one card, and a
   * brand-new machine answers with an empty list. These entries are the host's own doors and exist
   * whether or not anything has been used yet, which is why they belong in the default set rather
   * than only in the cold-start fallback: the cold-start branch is never reached once any candidate
   * survives, so keeping them there would leave the sparse profile (the observed case) untouched.
   *
   * Bounded two ways. The list is capped at {@link BUILTIN_DESTINATION_CANDIDATE_LIMIT}, and the
   * only scoring term they can claim is {@link BUILTIN_DESTINATION_SCORE_MAX}, which is below one
   * real execution's behaviour score. Nothing is fabricated: the usage row is the shared empty
   * placeholder, the recall tag is `cold-start` (shown as "Suggested"), and the batch behaviour read
   * leaves `behavior` absent, so they are never grid-eligible and can never print a habit badge.
   *
   * The identity is the provider's own ({@link APP_DESTINATION_PROVIDER_ID} + the catalog's item id),
   * so the rebuilder and the execute dispatch resolve them through the registered source like any
   * other candidate; a provider that is not registered degrades to "no candidates", as it does for
   * every other source.
   */
  private getBuiltinDestinationCandidates(): CandidateItem[] {
    const candidates: CandidateItem[] = []

    for (const destinationId of COMMON_SETTING_DESTINATION_IDS) {
      if (candidates.length >= BUILTIN_DESTINATION_CANDIDATE_LIMIT) break

      const definition = getAppDestination(destinationId)
      // The provider's rebuilder only emits searchable destinations, so nominating a
      // non-searchable one would spend a slot on an item that never renders.
      if (!definition.searchable) continue

      candidates.push({
        sourceId: APP_DESTINATION_PROVIDER_ID,
        itemId: APP_DESTINATION_ITEM_IDS[destinationId],
        // The provider declares `type = 'system'`; the engine cannot import it (import direction),
        // and this only labels the item for the layout's diversity quota.
        sourceType: 'system',
        usageStats: EMPTY_USAGE_STATS,
        source: 'cold-start'
      })
    }

    return candidates
  }

  /**
   * The single batch behaviour read for a recommendation pass.
   *
   * Keyed by `sourceId:itemId` because that is the key the scorers look up. A failed read returns
   * an empty map rather than throwing: a stats failure must not empty the grid, it just means no
   * candidate can claim behaviour evidence this pass.
   */
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

  /**
   * Whether the user has any valid execution history at all.
   *
   * Cold start means "no usable history", not "below the frequent threshold": an item executed
   * once, however incompletely, makes the user non-cold-start and the exploration budget applies.
   * Rows the storage layer synthesized for keys with no evidence carry zero counts and are
   * ignored, so a pool made only of catalog/novelty candidates still reads as cold start.
   */
  private hasAnyUsageHistory(behaviorByKey: Map<string, UsageBehaviorRow>): boolean {
    for (const row of behaviorByKey.values()) {
      if (!isSparseUsageBehaviorRow(row)) return true
    }
    return false
  }

  /**
   * Apply the exploration budget to the candidate pool.
   *
   * Cold start is handled by the caller (the cap is lifted there). Here the user has real history,
   * so at most {@link EXPLORATION_LIMIT} novelty items that have never been used may survive; extra
   * ones are dropped rather than demoted, because the list should not carry a pile of unused
   * installs competing with habits. A label is never edited here — the layout decides the badge.
   */
  private admitExplorationWithinBudget(candidates: CandidateItem[]): CandidateItem[] {
    let admitted = 0
    const result: CandidateItem[] = []

    for (const item of candidates) {
      const isUnusedNovelty =
        (item.source === 'newly-installed' || item.source === 'newly-added') &&
        (item.behavior?.executeCount ?? 0) === 0
      if (!isUnusedNovelty) {
        result.push(item)
        continue
      }
      if (admitted < EXPLORATION_LIMIT) {
        admitted += 1
        result.push(item)
      }
    }

    return result
  }

  /**
   * 全局高频候选：只取有真实执行的项目。
   *
   * Lifetime count orders them, but the 30-day/active-day qualification that admits an item to the
   * frequent grid is decided later from the batch behaviour read — the tag is no longer the
   * qualification. Zero-execute rows (searched or installed only) are excluded here entirely.
   */
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

  /**
   * 推荐理由的展示面：复用共享的证据判定，避免引擎与重建器各有一套。
   *
   * The decision itself lives in {@link resolveEvidenceBackedReason} so the recall tag and the shown
   * badge can never disagree; this wrapper only adapts the engine's row-shaped behaviour facts.
   */
  private resolveHonestReasonLabel(
    source: ScoredItem['source'],
    behavior: UsageBehaviorFacts | undefined
  ): ScoredItem['source'] {
    return resolveEvidenceBackedReason(source, behavior)
  }

  /**
   * 最近使用的项目：必须由可靠事件日期支撑。
   *
   * Filters on the batch behaviour read rather than the stored `lastExecuted`: a legacy row's
   * timestamp can predate the entry fix, so "recent" would be a reason the evidence cannot support
   * (R9). An item with only lifetime count and no accepted event in the window is dropped from this
   * dimension, not demoted below it.
   */
  private async getRecentItems(limit: number): Promise<ItemCandidate[]> {
    const db = this.dbUtils.getDb()

    const stats = await db
      .select()
      .from(schema.itemUsageStats)
      .where(gt(schema.itemUsageStats.executeCount, 0))
      .orderBy(desc(schema.itemUsageStats.lastExecuted))
      .limit(limit * 3)
      .all()

    if (stats.length === 0) return []

    const behaviorByKey = await this.loadUsageBehaviorByKey(
      stats.map((stat) => ({ sourceId: stat.sourceId, itemId: stat.itemId }))
    )

    return stats
      .map((stat) => ({
        stat,
        lastExecutedAt: behaviorByKey.get(`${stat.sourceId}:${stat.itemId}`)?.lastExecutedAt ?? null
      }))
      .filter(
        (entry): entry is { stat: (typeof stats)[number]; lastExecutedAt: number } =>
          entry.lastExecutedAt != null
      )
      .sort((left, right) => right.lastExecutedAt - left.lastExecutedAt)
      .slice(0, limit)
      .map(({ stat }) => ({
        sourceId: stat.sourceId,
        itemId: stat.itemId,
        sourceType: stat.sourceType,
        usageStats: stat
      }))
  }

  /**
   * 获取当前时段的热门项目
   *
   * Eligibility is evidence-gated: an item only appears as "usually used around now" when the
   * shared model says the 30-day evidence is strong enough to add time points at all. Below the
   * threshold a concentration in this hour is coincidence, and claiming it would be a fabricated
   * reason (R9) — so the item is dropped from this dimension, not reranked lower.
   */
  private async getTimeBasedTopItems(
    timePattern: TimePattern,
    limit: number
  ): Promise<ItemCandidate[]> {
    const allTimeStats = await this.dbUtils.getAllItemTimeStats()
    if (allTimeStats.length === 0) return []

    const keys = allTimeStats.map((stat) => ({
      sourceId: stat.sourceId,
      itemId: stat.itemId
    }))
    const behaviorByKey = await this.loadUsageBehaviorByKey(keys)
    const usageStatsMap = new Map(
      (await this.dbUtils.getUsageStatsBatch(keys)).map((stat) => [
        `${stat.sourceId}:${stat.itemId}`,
        stat
      ])
    )

    const scored: Array<{ item: ItemCandidate; score: number }> = []

    for (let idx = 0; idx < allTimeStats.length; idx++) {
      const raw = allTimeStats[idx]
      // Shared with TimeStatsAggregator rather than parsed inline: these are plain TEXT columns,
      // and a raw JSON.parse here aborted recommend() entirely for one malformed row — this loop
      // sits inside the unguarded getCandidates chain (#649).
      const parsed: ParsedItemTimeStats = toParsedItemTimeStats(raw)

      const key = `${raw.sourceId}:${raw.itemId}`
      const behaviorRow = behaviorByKey.get(key)
      const usageStats = usageStatsMap.get(key)
      if (!behaviorRow || !usageStats) continue

      const facts = usageBehaviorRowToFacts(behaviorRow)
      const timeScore = calculateTimeContribution(facts, timePattern)
      if (timeScore > 0) {
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
   * Files that appeared on disk inside the novelty window (the file half of S1.1).
   *
   * A SINGLE gate, unlike apps. `files.ctime` holds the filesystem birth time
   * (`stats.birthtime ?? stats.ctime`), so re-indexing an old folder cannot make its files look
   * new and a full scan produces nothing here. Apps need a second gate only because a self-update
   * rebuilds the bundle and refreshes its birthtime; editing a file moves `mtime`, never `ctime`.
   *
   * Directory scope is not decided here — the index only walks roots the user granted.
   */
  private async getNewlyAddedFileItems(limit: number): Promise<CandidateItem[]> {
    try {
      const now = Date.now()
      const createdAfter = new Date(now - NOVELTY_MAX_AGE_MS)
      // Bounded in SQL: the file index is routinely tens of thousands of rows and this runs on the
      // empty-query path.
      const rows = await this.dbUtils.getRecentlyCreatedFiles(
        createdAfter,
        NEWLY_ADDED_FILE_SCAN_LIMIT
      )
      if (rows.length === 0) return []

      const admissible = rows
        .filter((row) =>
          isRecommendableNewFile({ path: row.path, size: row.size, isDir: row.isDir })
        )
        .slice(0, limit)
      if (admissible.length === 0) return []

      const usageStatsMap = new Map(
        (
          await this.dbUtils.getUsageStatsBatch(
            admissible.map((row) => ({ sourceId: 'file-provider', itemId: row.path }))
          )
        ).map((stat) => [`${stat.sourceId}:${stat.itemId}`, stat])
      )

      // First real open ends the novelty claim, exactly as for a newly installed app: a file you
      // have already opened is no longer news and must be reached through behaviour (R6/AC11).
      const unused = admissible.filter(
        (row) => (usageStatsMap.get(`file-provider:${row.path}`)?.executeCount ?? 0) === 0
      )
      if (unused.length === 0) return []

      return unused.map((row) => ({
        sourceId: 'file-provider',
        itemId: row.path,
        sourceType: 'file',
        usageStats: usageStatsMap.get(`file-provider:${row.path}`) ?? EMPTY_USAGE_STATS,
        source: 'newly-added' as const,
        firstSeenAt: row.ctime?.getTime()
      }))
    } catch (error) {
      recommendationLog.warn('Failed to collect newly added file candidates', {
        meta: toErrorMeta(error)
      })
      return []
    }
  }

  /**
   * 收集插件注册的推荐候选项
   */
  private async getPluginCandidates(context: ContextSignal): Promise<CandidateItem[]> {
    if (this.pluginProviders.size === 0) return []

    // Providers run concurrently. Awaiting them in a for-of made
    // PLUGIN_PROVIDER_TIMEOUT_MS a per-provider budget rather than a shared one,
    // so six slow plugins blocked the empty-query grid for 1.2s on every open
    // (#674). Promise.all preserves order, so the candidate sequence is unchanged.
    const settled = await Promise.all(
      Array.from(this.pluginProviders.values(), async ({ provider }) => {
        // The timer is cleared when the provider wins. Left armed, each call
        // leaked a pending 200ms timeout that kept the event loop awake.
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

    // Two bounds, not one: the per-provider slice above stops a single plugin from flooding the
    // pool, and this stops N well-behaved plugins from doing it collectively.
    const candidates = settled.flat().slice(0, PLUGIN_CANDIDATES_TOTAL_LIMIT)

    // Snapshot every candidate under the provider that proposed it, so an execute can reach the
    // plugin without trusting the renderer's copy. Rebuilt each pass: a stale action or payload
    // from an earlier pass must not be executable.
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

  /**
   * Replace the placeholder usage stats on plugin candidates with the rows the host actually
   * recorded for them.
   *
   * Without this every plugin candidate scores as if it had never been used, so a plugin item the
   * user runs daily ranks exactly like one they have never touched — the plugin's self-declared
   * `priority` was the only thing separating them. The rows already exist: execution goes through
   * the host, which writes `item_usage_stats` under the same `sourceId:itemId` key used here.
   */
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
      // A stats lookup failure must not drop the candidates; they simply rank as unused.
      recommendationLog.warn('Failed to hydrate plugin candidate usage stats', {
        meta: { candidateCount: candidates.length, ...toErrorMeta(error) }
      })
      return candidates
    }
  }

  /**
   * 内置剪贴板 URL 推荐候选
   */
  private async getClipboardUrlCandidates(context: ContextSignal): Promise<CandidateItem[]> {
    // Cleared before the eligibility checks, not after: if this pass produces no card, a snapshot
    // from an earlier pass must stop being executable rather than lingering behind a stale item.
    this.builtinClipboardSnapshots.clear()

    if (!context.clipboard?.meta?.isUrl || !context.clipboard.content) return []

    // context.clipboard.content is a privacy digest, not the URL — ContextProvider hashes every
    // content field on purpose. Building the card from it produced a '打开 URL' entry whose
    // subtitle, item id and open-url payload were all the hash (#648).
    //
    // Re-read rather than adding a raw field to the signal: the point of the digest is that raw
    // content does not travel through the recommendation pipeline. The hash is then what proves
    // the clipboard still holds the item this context was built from — if it has changed, the
    // recommendation is stale and no card is better than the wrong one.
    const url = await this.readClipboardUrlMatching(context.clipboard.content)
    if (!url) return []

    // The card is snapshotted here, at the one moment the clipboard is known to still hold this URL,
    // and the execute reads it back from that snapshot. The card outlives this request (it can be
    // re-requested while the signal holds), so the snapshot is replaced, not merely added to.
    const card: PluginRecommendCandidate = {
      id: `clipboard-url-open:${url}`,
      title: '打开 URL',
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

  /**
   * Reads the current clipboard text, but only returns it if it still hashes to `expectedDigest`.
   *
   * Returning null on a mismatch is the point: between the context snapshot and this call the user
   * may have copied something else, and opening that instead would be worse than showing nothing.
   */
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
    semanticProfile: RecommendationSemanticProfile | null
  ): Promise<number> {
    // Host-generated contextual candidates (the clipboard-URL card) keep their own band: the
    // priority came from a signal the host observed, not from something a caller declared, so it
    // may legitimately outrank usage. It short-circuits because it has no usage history to add —
    // the card exists only for as long as the clipboard holds that URL.
    if (candidate.sourceId === BUILTIN_CLIPBOARD_URL_SOURCE_ID && candidate.pluginCandidate) {
      return (candidate.pluginCandidate.priority ?? 95) * HOST_CONTEXT_PRIORITY_WEIGHT
    }

    // NOTE: context match (clipboard / selection / foreground app / system
    // state) is deliberately absent — it is the VOLATILE stage, applied after
    // the cache in `applyVolatileContextRerank`. Only slow-moving components
    // may land in a cached score.
    let score = 0

    // Plugin-declared priority orders a plugin's own candidates. It used to *replace* the whole
    // calculation, which meant a plugin item ranked identically whether the user had run it a
    // hundred times or never. It is now one bounded term among the rest, and the terms below —
    // which a plugin item earns exactly like a built-in — are what move it. The contribution is
    // capped at 5/100, so no manifest value can manufacture a habit.
    if (candidate.source === 'plugin' && candidate.pluginCandidate) {
      score +=
        calculatePluginPriorityContribution(candidate.pluginCandidate.priority) *
        BEHAVIOR_SCORE_WEIGHT
    }

    // Built-in destinations the host proposes for the empty state. They carry no usage history — that
    // is the point, they exist before anything has been used — so without a term of their own they
    // would score 0 and rank below even the cold-start app suggestions. The term is a tie-break
    // among suggestions, not a promotion: it is capped at BUILTIN_DESTINATION_SCORE_MAX, under one
    // real execution's behaviour score (1e4), and it is granted only to the nominees that arrived
    // unused (recall tag `cold-start`). A destination the user actually opens comes back through the
    // frequent/recent dimensions with its own evidence, and this branch does not touch it.
    if (candidate.sourceId === APP_DESTINATION_PROVIDER_ID && candidate.source === 'cold-start') {
      score += BUILTIN_DESTINATION_SCORE_MAX
    }

    // 行为分：只由有可靠日期证据的真实执行构成，0..80；时间偏好最多 20；最近使用加成也是同一
    // 自动族的一项。三者之和封顶 BEHAVIOR_SCORE_MAX（100），所以「自动行为」整体真的落在
    // 0..100，而不是 base+time 到 100 之后还追加一份独立 recency（R5）。recency 只承认有可靠事件
    // 日期的执行：旧的 stored lastExecuted 可能来自升级前「实际启动前就记数」的入口，用它会让
    // 「最近使用」的理由站不住脚（R9）。没有可靠日期就不给这份加成，也不该被标成「最近」。
    const recencyBoost =
      candidate.behavior?.lastExecutedAt != null
        ? this.calculateRecencyBoost(new Date(candidate.behavior.lastExecutedAt))
        : 0
    const automaticBudget =
      (candidate.behavior
        ? calculateBehaviorScore(candidate.behavior) +
          calculateTimeContribution(candidate.behavior, context.time)
        : 0) + recencyBoost
    score += Math.min(BEHAVIOR_SCORE_MAX, automaticBudget) * BEHAVIOR_SCORE_WEIGHT

    // Novelty: the exploration channel for freshly installed apps. It hands the
    // item back to frecency the moment there is a real execute to rank on —
    // the item stays in the pool through the frequent/recent dimensions, it
    // just stops being news.
    if (candidate.firstSeenAt !== undefined && candidate.usageStats.executeCount === 0) {
      score += calculateNoveltyFactor(Date.now() - candidate.firstSeenAt) * NOVELTY_WEIGHT
    }

    if (semanticSettings.localVectorEnabled && semanticProfile) {
      const candidateProfile = buildCandidateSemanticProfile(
        this.toSemanticCandidateInput(candidate)
      )
      score +=
        calculateLocalSemanticScore(semanticProfile, candidateProfile) * SEMANTIC_LOCAL_WEIGHT
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
    return candidate.source === 'plugin' || candidate.sourceId === BUILTIN_CLIPBOARD_URL_SOURCE_ID
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
    const candidates = await this.getClipboardUrlCandidates(context)
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

  /** Recent execution contributes at most 10 points inside the automatic 100-point budget. */
  private calculateRecencyBoost(lastUsed: Date | null): number {
    if (!lastUsed) return 0

    const hoursSince = (Date.now() - lastUsed.getTime()) / (1000 * 60 * 60)

    return 10 * Math.exp(-0.1 * Math.max(0, hoursSince))
  }

  /**
   * 应用多样性过滤
   */
  private applyDiversityFilter(scored: ScoredItem[], limit: number): ScoredItem[] {
    const result: ScoredItem[] = []
    const typeCount = new Map<string, number>()
    const deferred: ScoredItem[] = []

    // 同类型不超过总数的 40%
    const maxPerType = Math.ceil(limit * 0.4)

    for (const item of scored) {
      if (result.length >= limit) break

      const currentCount = typeCount.get(item.sourceType) || 0

      if (currentCount >= maxPerType && result.length >= limit / 2) {
        deferred.push(item)
        continue
      }

      result.push(item)
      typeCount.set(item.sourceType, currentCount + 1)
    }

    // The quota is a preference, not a hard ceiling. A homogeneous candidate pool
    // — common when a profile has only accumulated app usage — used to latch both
    // conditions at once and return exactly limit/2 items, half an empty-query
    // grid. Items skipped for diversity are put back in score order to fill the
    // remaining slots rather than left on the floor (#672).
    for (const item of deferred) {
      if (result.length >= limit) break
      result.push(item)
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
      // Behaviour facts are attached after dedupe, so nothing to merge here; the first occurrence
      // wins, exactly as it does for the candidate identity itself.
      if (candidate.source === 'time-based') {
        existing.source = 'time-based'
      }
      // A new app can also own a zero-execute usage row (it was searched but
      // never launched), which puts it in an earlier dimension first. Keep the
      // install stamp so the novelty boost still fires, and label it as the
      // reason it actually ranks — but only while that boost is live.
      if (existing.firstSeenAt === undefined && candidate.firstSeenAt !== undefined) {
        existing.firstSeenAt = candidate.firstSeenAt
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
    coldStart: boolean
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
  /**
   * Real dated execution facts for this item, from the single batch behaviour read. Absent means
   * the item has no valid history at all — never substitute a zero-shaped object, so the scorer
   * can tell "no evidence" from "evidence of zero".
   */
  behavior?: UsageBehaviorFacts
  /** Plugin-provided candidate data (for source='plugin' or builtin clipboard URL) */
  pluginCandidate?: PluginRecommendCandidate
  /**
   * Epoch ms this item first appeared on the machine — an app's install stamp, a file's
   * filesystem birth time. Drives the novelty boost, which is why it is one field: the exploration
   * channel is the same regardless of what appeared.
   */
  firstSeenAt?: number
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
    /** A file that appeared on disk inside the novelty window. */
    | 'newly-added'
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
