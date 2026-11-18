import type { RecommendationEvidence, RecommendationSource, TuffItem } from '@talex-touch/utils'
import type {
  PluginRecommendCandidate,
  TimePattern,
  UsageBehaviorFacts
} from '@talex-touch/utils/core-box'
import type * as schema from '../../../../db/schema'
import type { DbUtils } from '../../../../db/utils'
import type { ForegroundActivityView } from '../../../system/foreground-app-activity'
import type { ParsedItemTimeStats } from '../time-stats-aggregator'
import type { ItemRebuilder } from './item-rebuilder'
import {
  APP_DESTINATION_ITEM_IDS,
  APP_DESTINATION_PROVIDER_ID,
  COMMON_SETTING_DESTINATION_IDS,
  getAppDestination
} from '../../../../../shared/app-destinations'
import {
  APP_IDENTITY_EXTENSION_KEY,
  resolveAppItemId,
  resolveAppItemIds
} from '../../addon/apps/app-index-metadata'
import { matchNoisySystemAppRule } from '../../addon/apps/app-noise-filter'
import { getFileRecommendationBridge } from '../../addon/files/file-recommendation-bridge'
import { isSelfAppIdentity } from '../../../system/self-app-identity'
import { toParsedItemTimeStats } from '../time-stats-aggregator'
import { isAppSourceType } from './app-category-rules'
import {
  APP_RECOMMENDATION_SOURCE_ID,
  APP_RECOMMENDATION_SOURCE_TYPE
} from './app-recommendation-source'
import { isRecommendableNewFile } from './file-recommendation-admission'
import { FILE_RECOMMENDATION_SOURCE_ID } from './file-recommendation-source'
import {
  calculateTimeContribution,
  DAY_MS,
  isSparseUsageBehaviorRow,
  toErrorMeta,
  usageBehaviorRowToFacts,
  type LogMeta,
  type UsageBehaviorRow
} from './recommendation-utils'
import { isSensitiveFilePath } from './volatile-context-matcher'

/** Cold-start items rank below anything with real usage but above nothing at all. */
export const COLD_START_BASE_SCORE = 1e3
export const NOVELTY_WEIGHT = 9e5
export const NOVELTY_FULL_WINDOW_MS = 48 * 60 * 60 * 1000
export const NOVELTY_MAX_AGE_MS = 7 * DAY_MS
export const NEWLY_INSTALLED_CANDIDATE_LIMIT = 10
export const NEWLY_ADDED_FILE_CANDIDATE_LIMIT = 4
export const NEWLY_ADDED_FILE_SCAN_LIMIT = 200
export const BUILTIN_DESTINATION_CANDIDATE_LIMIT = 3
export const BUILTIN_DESTINATION_SCORE_MAX = 5e3
export const EXPLORATION_LIMIT = 1
export const APP_ACTIVITY_CATALOG_TTL_MS = 10 * 60 * 1000
export const FOREGROUND_RECENT_CANDIDATE_LIMIT = 10
export const INSTALLED_AT_EXTENSION_KEY = 'installedAt'

export type AppCatalogFileRow = typeof schema.files.$inferSelect

export interface CandidateLogger {
  debug(message: string, options?: { meta?: LogMeta }): void
  warn(message: string, options?: { meta?: LogMeta }): void
}

export interface ItemCandidate {
  sourceId: string
  itemId: string
  sourceType: string
  usageStats: typeof schema.itemUsageStats.$inferSelect
  timeStats?: ParsedItemTimeStats
  behavior?: UsageBehaviorFacts
  contextScore?: number
  contextEvidence?: RecommendationEvidence
  pluginCandidate?: PluginRecommendCandidate
  firstSeenAt?: number
  lastActiveAt?: number
}

export interface CandidateItem extends ItemCandidate {
  source: RecommendationSource
}

export interface ScoredItem extends CandidateItem {
  score: number
}

/** The app catalog indexed by the bundle id the OS reports, plus preloaded catalog rows. */
export interface AppActivityCatalog {
  builtAt: number
  apps: AppCatalogFileRow[]
  extensionsByFileId: Map<number, Record<string, string>>
  appKeyByItemId: Map<string, string>
  itemIdsByAppKey: Map<string, string[]>
}

/**
 * Per-pass shared read cache so `getCandidates()` avoids querying `getFilesByType('app')`,
 * `file_extensions` (`appIdentity`/`bundleId`), and `getUsageBehaviorBatch` multiple times
 * for the same identities within one recommendation pass.
 */
export interface PassCandidateReadCache {
  getApps(): Promise<AppCatalogFileRow[]>
  getIdentityExtensions(
    apps: ReadonlyArray<{ id: number }>
  ): Promise<Map<number, Record<string, string>>>
  loadBehaviorByKey(
    keys: ReadonlyArray<{ sourceId: string; itemId: string }>
  ): Promise<Map<string, UsageBehaviorRow>>
}

/** Empty usage stats placeholder for plugin/builtin/novelty candidates with no usage history. */
export const EMPTY_USAGE_STATS = {
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

export function resolveInstallTime(
  app: { ctime?: Date | null; mtime?: Date | null },
  installedAt?: number
): number {
  return installedAt ?? app.ctime?.getTime() ?? app.mtime?.getTime() ?? 0
}

export function parseInstalledAt(value: string | null | undefined): number | null {
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

export async function loadAppCatalogExtensionsByFileId(
  appCatalogDbUtils: DbUtils,
  apps: ReadonlyArray<{ id: number }>
): Promise<Map<number, Record<string, string>>> {
  const byFileId = new Map<number, Record<string, string>>()
  if (apps.length === 0) return byFileId

  const extensions = await appCatalogDbUtils.getFileExtensionsByFileIds(
    apps.map((app) => app.id),
    [APP_IDENTITY_EXTENSION_KEY, 'bundleId']
  )
  for (const extension of extensions) {
    if (typeof extension.value !== 'string') continue
    const entry = byFileId.get(extension.fileId) ?? {}
    entry[extension.key] = extension.value
    byFileId.set(extension.fileId, entry)
  }
  return byFileId
}

export async function loadInstalledAtByFileId(
  appCatalogDbUtils: DbUtils,
  apps: ReadonlyArray<{ id: number }>,
  log: CandidateLogger
): Promise<Map<number, number>> {
  const installedAt = new Map<number, number>()
  if (apps.length === 0) return installedAt

  try {
    const extensions = await appCatalogDbUtils.getFileExtensionsByFileIds(
      apps.map((app) => app.id),
      [INSTALLED_AT_EXTENSION_KEY]
    )
    for (const extension of extensions) {
      const parsed = parseInstalledAt(extension.value)
      if (parsed !== null) installedAt.set(extension.fileId, parsed)
    }
  } catch (error) {
    log.debug('Failed to read app install stamps', { meta: toErrorMeta(error) })
  }
  return installedAt
}

export function createPassCandidateReadCache(
  appCatalogDbUtils: DbUtils,
  loadBehaviorBatch: (
    keys: Array<{ sourceId: string; itemId: string }>
  ) => Promise<Map<string, UsageBehaviorRow>>,
  warmCatalog: AppActivityCatalog | null = null
): PassCandidateReadCache {
  let appsPromise: Promise<AppCatalogFileRow[]> | null = warmCatalog
    ? Promise.resolve(warmCatalog.apps)
    : null
  let allAppsExtensionsPromise: Promise<Map<number, Record<string, string>>> | null = warmCatalog
    ? Promise.resolve(warmCatalog.extensionsByFileId)
    : null
  const behaviorMemo = new Map<string, UsageBehaviorRow>()
  const queriedBehaviorKeys = new Set<string>()

  return {
    getApps(): Promise<AppCatalogFileRow[]> {
      if (!appsPromise) {
        appsPromise = appCatalogDbUtils.getFilesByType('app')
      }
      return appsPromise
    },
    async getIdentityExtensions(
      targetApps: ReadonlyArray<{ id: number }>
    ): Promise<Map<number, Record<string, string>>> {
      if (targetApps.length === 0) return new Map()
      if (allAppsExtensionsPromise) {
        return await allAppsExtensionsPromise
      }
      const catalogApps = appsPromise ? await appsPromise : null
      if (catalogApps && targetApps.length === catalogApps.length) {
        allAppsExtensionsPromise = loadAppCatalogExtensionsByFileId(appCatalogDbUtils, catalogApps)
        return await allAppsExtensionsPromise
      }
      return await loadAppCatalogExtensionsByFileId(appCatalogDbUtils, targetApps)
    },
    async loadBehaviorByKey(
      keys: ReadonlyArray<{ sourceId: string; itemId: string }>
    ): Promise<Map<string, UsageBehaviorRow>> {
      if (keys.length === 0) return new Map()

      const missing: Array<{ sourceId: string; itemId: string }> = []
      const seenInBatch = new Set<string>()
      for (const key of keys) {
        const composite = `${key.sourceId}:${key.itemId}`
        if (queriedBehaviorKeys.has(composite) || seenInBatch.has(composite)) continue
        seenInBatch.add(composite)
        missing.push({ sourceId: key.sourceId, itemId: key.itemId })
      }

      if (missing.length > 0) {
        const fetched = await loadBehaviorBatch(missing)
        for (const key of missing) {
          const composite = `${key.sourceId}:${key.itemId}`
          queriedBehaviorKeys.add(composite)
          const row = fetched.get(composite)
          if (row) behaviorMemo.set(composite, row)
        }
      }

      const subset = new Map<string, UsageBehaviorRow>()
      for (const key of keys) {
        const composite = `${key.sourceId}:${key.itemId}`
        const row = behaviorMemo.get(composite)
        if (row) subset.set(composite, row)
      }
      return subset
    }
  }
}

export async function buildAppActivityCatalog(
  appCatalogDbUtils: DbUtils,
  log: CandidateLogger,
  passCache?: PassCandidateReadCache
): Promise<{ catalog: AppActivityCatalog; ok: boolean }> {
  const catalog: AppActivityCatalog = {
    builtAt: Date.now(),
    apps: [],
    extensionsByFileId: new Map(),
    appKeyByItemId: new Map(),
    itemIdsByAppKey: new Map()
  }

  try {
    const apps = passCache
      ? await passCache.getApps()
      : await appCatalogDbUtils.getFilesByType('app')
    const byFileId = passCache
      ? await passCache.getIdentityExtensions(apps)
      : await loadAppCatalogExtensionsByFileId(appCatalogDbUtils, apps)
    catalog.apps = apps
    catalog.extensionsByFileId = byFileId

    for (const app of apps) {
      const entry = byFileId.get(app.id)
      const bundleId = entry?.['bundleId']?.trim()
      if (!bundleId) continue
      const appKey = bundleId.toLowerCase()
      const identity = {
        appIdentity: entry?.[APP_IDENTITY_EXTENSION_KEY],
        bundleId,
        path: app.path
      }
      for (const itemId of resolveAppItemIds(identity)) {
        catalog.appKeyByItemId.set(itemId, appKey)
      }
      if (
        isSelfAppIdentity({ executablePath: app.path, bundleId }) ||
        matchNoisySystemAppRule({ path: app.path, bundleId, name: app.displayName || app.name })
      ) {
        continue
      }
      const itemIds = catalog.itemIdsByAppKey.get(appKey) ?? []
      itemIds.push(resolveAppItemId(identity))
      catalog.itemIdsByAppKey.set(appKey, itemIds)
    }

    return { catalog, ok: true }
  } catch (error) {
    log.debug('Failed to index the app catalog for foreground activity', {
      meta: toErrorMeta(error)
    })
    return { catalog, ok: false }
  }
}

export async function collectForegroundRecentCandidates(
  dbUtils: DbUtils,
  foreground: ForegroundActivityView | null,
  getCatalog: () => Promise<AppActivityCatalog>,
  log: CandidateLogger
): Promise<Array<{ candidate: ItemCandidate; lastActiveAt: number }>> {
  if (!foreground) return []
  const recent = foreground.recent(FOREGROUND_RECENT_CANDIDATE_LIMIT * 2)
  if (recent.length === 0) return []

  const catalog = await getCatalog()
  const nominated: Array<{ itemId: string; lastActiveAt: number }> = []
  for (const entry of recent) {
    for (const itemId of catalog.itemIdsByAppKey.get(entry.appKey) ?? []) {
      nominated.push({ itemId, lastActiveAt: entry.lastActiveAt })
    }
    if (nominated.length >= FOREGROUND_RECENT_CANDIDATE_LIMIT) break
  }
  if (nominated.length === 0) return []

  const usageByKey = new Map<string, typeof schema.itemUsageStats.$inferSelect>()
  try {
    const rows = await dbUtils.getUsageStatsBatch(
      nominated.map(({ itemId }) => ({ sourceId: APP_RECOMMENDATION_SOURCE_ID, itemId }))
    )
    for (const row of rows) usageByKey.set(`${row.sourceId}:${row.itemId}`, row)
  } catch (error) {
    log.debug('Failed to load usage rows for foreground candidates', {
      meta: toErrorMeta(error)
    })
  }

  return nominated.map(({ itemId, lastActiveAt }) => ({
    candidate: {
      sourceId: APP_RECOMMENDATION_SOURCE_ID,
      itemId,
      sourceType: APP_RECOMMENDATION_SOURCE_TYPE,
      usageStats: usageByKey.get(`${APP_RECOMMENDATION_SOURCE_ID}:${itemId}`) ?? EMPTY_USAGE_STATS
    },
    lastActiveAt
  }))
}

export async function attachForegroundActivity(
  candidates: CandidateItem[],
  foreground: ForegroundActivityView,
  getCatalog: () => Promise<AppActivityCatalog>
): Promise<void> {
  const apps = candidates.filter((candidate) => isAppSourceType(candidate.sourceType))
  if (apps.length === 0) return

  const catalog = await getCatalog()
  for (const candidate of apps) {
    const appKey = catalog.appKeyByItemId.get(candidate.itemId)
    if (!appKey) continue
    const lastActiveAt = foreground.lastActiveAt(appKey)
    if (lastActiveAt !== null) candidate.lastActiveAt = lastActiveAt
  }
}

export async function collectColdStartRecommendations(
  appCatalogDbUtils: DbUtils,
  itemRebuilder: ItemRebuilder,
  limit: number,
  log: CandidateLogger,
  passCache?: PassCandidateReadCache
): Promise<TuffItem[]> {
  try {
    const apps = passCache
      ? await passCache.getApps()
      : await appCatalogDbUtils.getFilesByType('app')
    if (apps.length === 0) {
      log.debug('Cold start found no apps in the catalog')
      return []
    }

    const installedAtByFileId = await loadInstalledAtByFileId(appCatalogDbUtils, apps, log)
    const ranked = [...apps]
      .sort(
        (left, right) =>
          resolveInstallTime(right, installedAtByFileId.get(right.id)) -
          resolveInstallTime(left, installedAtByFileId.get(left.id))
      )
      .slice(0, limit * 2)

    const items = await itemRebuilder.rebuildItems(
      ranked.map((app, index) => ({
        sourceId: APP_RECOMMENDATION_SOURCE_ID,
        itemId: app.path,
        sourceType: APP_RECOMMENDATION_SOURCE_TYPE,
        usageStats: EMPTY_USAGE_STATS,
        source: 'cold-start' as const,
        score: COLD_START_BASE_SCORE - index
      }))
    )

    return items.slice(0, limit)
  } catch (error) {
    log.warn('Cold start recommendation failed', { meta: toErrorMeta(error) })
    return []
  }
}

/**
 * Apps installed inside the novelty window (double-gate: `ctime <= 7d` AND `installedAt <= 7d`).
 */
export async function collectNewlyInstalledItems(
  dbUtils: DbUtils,
  appCatalogDbUtils: DbUtils,
  limit: number,
  log: CandidateLogger,
  passCache?: PassCandidateReadCache
): Promise<CandidateItem[]> {
  try {
    const now = Date.now()
    const apps = passCache
      ? await passCache.getApps()
      : await appCatalogDbUtils.getFilesByType('app')

    // Gate 1: index first-seen timestamp (`files.ctime`) must be within 7 days.
    const recentlyIndexed = apps.filter((app) => {
      const indexedAt = app.ctime?.getTime()
      return typeof indexedAt === 'number' && now - indexedAt <= NOVELTY_MAX_AGE_MS
    })
    if (recentlyIndexed.length === 0) return []

    const installedAtByFileId = await loadInstalledAtByFileId(
      appCatalogDbUtils,
      recentlyIndexed,
      log
    )

    const identityByFileId = new Map<number, string>()
    try {
      const extensionsByFileId = passCache
        ? await passCache.getIdentityExtensions(recentlyIndexed)
        : await loadAppCatalogExtensionsByFileId(appCatalogDbUtils, recentlyIndexed)
      for (const app of recentlyIndexed) {
        const entry = extensionsByFileId.get(app.id)
        identityByFileId.set(
          app.id,
          resolveAppItemId({
            appIdentity: entry?.[APP_IDENTITY_EXTENSION_KEY],
            bundleId: entry?.['bundleId'],
            path: app.path
          })
        )
      }
    } catch (error) {
      log.debug('Failed to read app catalog identities', { meta: toErrorMeta(error) })
    }

    const catalogIdFor = (app: { id: number; path: string }): string =>
      identityByFileId.get(app.id) || app.path

    // Gate 2: filesystem creation stamp (`installedAt`) must exist and be within 7 days.
    const fresh = recentlyIndexed
      .flatMap((app) => {
        const installedAt = installedAtByFileId.get(app.id)
        if (installedAt === undefined) return []
        if (now - installedAt > NOVELTY_MAX_AGE_MS) return []
        return [{ app, installedAt }]
      })
      .sort((left, right) => right.installedAt - left.installedAt)
      .slice(0, limit)
    if (fresh.length === 0) return []

    const usageStatsMap = new Map(
      (
        await dbUtils.getUsageStatsBatch(
          fresh.map(({ app }) => ({
            sourceId: APP_RECOMMENDATION_SOURCE_ID,
            itemId: catalogIdFor(app)
          }))
        )
      ).map((stat) => [`${stat.sourceId}:${stat.itemId}`, stat])
    )

    const unused = fresh.filter(
      ({ app }) =>
        (usageStatsMap.get(`${APP_RECOMMENDATION_SOURCE_ID}:${catalogIdFor(app)}`)?.executeCount ??
          0) === 0
    )
    if (unused.length === 0) return []

    return unused.map(({ app, installedAt }) => {
      const itemId = catalogIdFor(app)
      return {
        sourceId: APP_RECOMMENDATION_SOURCE_ID,
        itemId,
        sourceType: APP_RECOMMENDATION_SOURCE_TYPE,
        usageStats:
          usageStatsMap.get(`${APP_RECOMMENDATION_SOURCE_ID}:${itemId}`) ?? EMPTY_USAGE_STATS,
        source: 'newly-installed' as const,
        firstSeenAt: installedAt
      }
    })
  } catch (error) {
    log.warn('Failed to collect newly installed candidates', {
      meta: toErrorMeta(error)
    })
    return []
  }
}

interface RecentFileCandidateRow {
  path: string
  size?: number | null
  isDir?: boolean | null
  ctime?: Date | null
}

/**
 * Newly created files within the 7-day novelty window, merging hot-doc SQLite `files` rows
 * with `NativeFileArena` recent files via `FileRecommendationBridge.listRecentFiles`.
 */
export async function collectNewlyAddedFileItems(
  dbUtils: DbUtils,
  limit: number,
  log: CandidateLogger
): Promise<CandidateItem[]> {
  try {
    const now = Date.now()
    const createdAfterMs = now - NOVELTY_MAX_AGE_MS
    const createdAfter = new Date(createdAfterMs)

    const bridge = getFileRecommendationBridge()
    const [dbRows, bridgeRows] = await Promise.all([
      dbUtils.getRecentlyCreatedFiles(createdAfter, NEWLY_ADDED_FILE_SCAN_LIMIT),
      bridge
        ? bridge
            .listRecentFiles({
              createdAfterMs,
              modifiedAfterMs: createdAfterMs,
              limit: NEWLY_ADDED_FILE_SCAN_LIMIT
            })
            .catch((error) => {
              log.debug('Failed to list recent files from FileRecommendationBridge', {
                meta: toErrorMeta(error)
              })
              return []
            })
        : Promise.resolve([])
    ])

    const mergedByPath = new Map<string, RecentFileCandidateRow>()
    for (const row of dbRows) {
      if (!row.path) continue
      mergedByPath.set(row.path, row)
    }
    for (const record of bridgeRows) {
      if (!record.path) continue
      const ctimeMs = record.ctime?.getTime()
      if (typeof ctimeMs === 'number' && ctimeMs < createdAfterMs) continue
      const existing = mergedByPath.get(record.path)
      if (!existing) {
        mergedByPath.set(record.path, {
          path: record.path,
          size: record.size,
          isDir: record.isDir,
          ctime: record.ctime
        })
      } else if ((record.ctime?.getTime() ?? 0) > (existing.ctime?.getTime() ?? 0)) {
        mergedByPath.set(record.path, {
          ...existing,
          ctime: record.ctime
        })
      }
    }

    if (mergedByPath.size === 0) return []

    const orderedRows =
      bridgeRows.length > 0
        ? [...mergedByPath.values()].sort(
            (left, right) => (right.ctime?.getTime() ?? 0) - (left.ctime?.getTime() ?? 0)
          )
        : [...mergedByPath.values()]

    const admissible = orderedRows
      .filter(
        (row) =>
          !isSensitiveFilePath(row.path) &&
          isRecommendableNewFile({ path: row.path, size: row.size, isDir: row.isDir })
      )
      .slice(0, limit)
    if (admissible.length === 0) return []

    const usageStatsMap = new Map(
      (
        await dbUtils.getUsageStatsBatch(
          admissible.map((row) => ({ sourceId: FILE_RECOMMENDATION_SOURCE_ID, itemId: row.path }))
        )
      ).map((stat) => [`${stat.sourceId}:${stat.itemId}`, stat])
    )

    const unused = admissible.filter(
      (row) =>
        (usageStatsMap.get(`${FILE_RECOMMENDATION_SOURCE_ID}:${row.path}`)?.executeCount ?? 0) === 0
    )
    if (unused.length === 0) return []

    return unused.map((row) => ({
      sourceId: FILE_RECOMMENDATION_SOURCE_ID,
      itemId: row.path,
      sourceType: 'file',
      usageStats:
        usageStatsMap.get(`${FILE_RECOMMENDATION_SOURCE_ID}:${row.path}`) ?? EMPTY_USAGE_STATS,
      source: 'newly-added' as const,
      firstSeenAt: row.ctime?.getTime()
    }))
  } catch (error) {
    log.warn('Failed to collect newly added file candidates', {
      meta: toErrorMeta(error)
    })
    return []
  }
}

export function collectBuiltinDestinationCandidates(): CandidateItem[] {
  const candidates: CandidateItem[] = []

  for (const destinationId of COMMON_SETTING_DESTINATION_IDS) {
    if (candidates.length >= BUILTIN_DESTINATION_CANDIDATE_LIMIT) break

    const definition = getAppDestination(destinationId)
    if (!definition.searchable) continue

    candidates.push({
      sourceId: APP_DESTINATION_PROVIDER_ID,
      itemId: APP_DESTINATION_ITEM_IDS[destinationId],
      sourceType: 'system',
      usageStats: EMPTY_USAGE_STATS,
      source: 'cold-start'
    })
  }

  return candidates
}

export async function collectTimeBasedTopItems(
  dbUtils: DbUtils,
  timePattern: TimePattern,
  limit: number,
  loadBehaviorByKey: (
    keys: ReadonlyArray<{ sourceId: string; itemId: string }>
  ) => Promise<Map<string, UsageBehaviorRow>>
): Promise<ItemCandidate[]> {
  const allTimeStats = await dbUtils.getAllItemTimeStats()
  if (allTimeStats.length === 0) return []

  const keys = allTimeStats.map((stat) => ({
    sourceId: stat.sourceId,
    itemId: stat.itemId
  }))
  const [behaviorByKey, usageStatsList] = await Promise.all([
    loadBehaviorByKey(keys),
    dbUtils.getUsageStatsBatch(keys)
  ])
  const usageStatsMap = new Map(
    usageStatsList.map((stat) => [`${stat.sourceId}:${stat.itemId}`, stat])
  )

  const scored: Array<{ item: ItemCandidate; score: number }> = []

  for (let idx = 0; idx < allTimeStats.length; idx += 1) {
    const raw = allTimeStats[idx]!
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

    if ((idx + 1) % 50 === 0) {
      await new Promise<void>((resolve) => setImmediate(resolve))
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ item }) => item)
}

export function hasAnyUsageHistory(behaviorByKey: Map<string, UsageBehaviorRow>): boolean {
  for (const row of behaviorByKey.values()) {
    if (!isSparseUsageBehaviorRow(row)) return true
  }
  return false
}

export function admitExplorationWithinBudget(candidates: CandidateItem[]): CandidateItem[] {
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

export function deduplicateCandidates(candidates: CandidateItem[]): CandidateItem[] {
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
    if (candidate.contextEvidence) {
      existing.contextEvidence = { ...existing.contextEvidence, ...candidate.contextEvidence }
      if ((candidate.contextScore ?? 0) > (existing.contextScore ?? 0)) {
        existing.contextScore = candidate.contextScore
        existing.source = candidate.source
      }
    }
    if (existing.firstSeenAt === undefined && candidate.firstSeenAt !== undefined) {
      existing.firstSeenAt = candidate.firstSeenAt
      if (existing.usageStats.executeCount === 0) {
        existing.source = candidate.source === 'newly-added' ? 'newly-added' : 'newly-installed'
      }
    }
  }

  return result
}

export function applyDiversityFilter(scored: ScoredItem[], limit: number): ScoredItem[] {
  const result: ScoredItem[] = []
  const typeCount = new Map<string, number>()
  const deferred: ScoredItem[] = []

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

  for (const item of deferred) {
    if (result.length >= limit) break
    result.push(item)
  }

  return result
}
