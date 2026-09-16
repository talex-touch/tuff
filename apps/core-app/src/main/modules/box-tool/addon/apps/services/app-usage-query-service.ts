import type {
  AppIndexUsageResult,
  AppUsageEntryPointCount,
  AppUsageOutboundTransition,
  AppUsageTransition,
  AppUsageTrendPoint
} from '@talex-touch/utils/transport/events/types'
import type { CoreDatabase, DbUtils } from '../../../../../db/utils'
import { and, desc, eq, gte, sql } from 'drizzle-orm'
import { getLogger } from '@talex-touch/utils/common/logger'
import * as schema from '../../../../../db/schema'
import { APP_PROVIDER_SOURCE_ID } from '../../../search-engine/app-launch-recorder'
import { toUsageEntryPoint } from '../../../search-engine/usage-entry-point'

const log = getLogger('app-usage-query')

/**
 * How many recent launch logs one query folds for the entry-point split and transition list.
 *
 * These two dimensions are not in the aggregate tables on purpose — `item_usage_stats`,
 * `usage_trend_daily` and `item_time_stats` all key on `(source_id, item_id)`, so carrying an
 * entry point or a source app would fork their counts. Reading them back means scanning the raw
 * log, which is bounded here: a detail panel describes recent behaviour, and an unbounded scan
 * over a table that grows with every interaction is a page freeze waiting to happen.
 */
const LOG_SCAN_LIMIT = 500

/** Transitions shown per app. Beyond this the tail is noise the panel cannot render usefully. */
const MAX_TRANSITIONS = 8

const DAY_MS = 86_400_000

/**
 * Trailing window for the trend chart.
 *
 * Thirty days is what a fixed-width sparkline can still resolve per-day in a settings panel, and
 * `usage_trend_daily` keeps one row per day per item — so the read stays a bounded indexed range
 * rather than growing with the app's whole history.
 */
const TREND_DAYS = 30

interface LaunchLogContext {
  ent?: unknown
  prevApp?: unknown
  prevAppName?: unknown
}

/**
 * Outcome of the bulk launch-count read.
 *
 * A failure is a value rather than an empty map: these totals are rendered as per-app facts, and
 * "0 launches" is a claim about the user's behaviour rather than an absence of one.
 */
export type AppUsageCountsResult =
  | { ok: true; counts: Map<string, number> }
  | { ok: false; reason: 'db-not-ready' | 'error' }

/**
 * Per-application usage, assembled for the applications settings detail panel.
 *
 * Reads the aggregates for totals and time-of-day, then folds a bounded window of raw launch logs
 * for the dimensions the aggregates deliberately do not carry.
 */
export class AppUsageQueryService {
  constructor(private readonly deps: { getDbUtils: () => DbUtils | null }) {}

  /**
   * @param bundleId Identity this app is recorded under in *other* apps' launch contexts, which
   * is what makes the outbound half of the transition graph readable. Absent for entries with no
   * bundle id, and the outbound list is then empty rather than guessed at.
   */
  async query(itemId: string, bundleId?: string): Promise<AppIndexUsageResult> {
    if (!itemId) return { success: false, reason: 'invalid-path' }
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils) return { success: false, reason: 'db-not-ready' }

    try {
      const db = dbUtils.getDb()
      const [stats] = await db
        .select({
          searchCount: schema.itemUsageStats.searchCount,
          executeCount: schema.itemUsageStats.executeCount,
          lastExecuted: schema.itemUsageStats.lastExecuted
        })
        .from(schema.itemUsageStats)
        .where(
          and(
            eq(schema.itemUsageStats.sourceId, APP_PROVIDER_SOURCE_ID),
            eq(schema.itemUsageStats.itemId, itemId)
          )
        )
        .limit(1)

      const [timeStats] = await db
        .select({
          hourDistribution: schema.itemTimeStats.hourDistribution,
          dayOfWeekDistribution: schema.itemTimeStats.dayOfWeekDistribution
        })
        .from(schema.itemTimeStats)
        .where(
          and(
            eq(schema.itemTimeStats.sourceId, APP_PROVIDER_SOURCE_ID),
            eq(schema.itemTimeStats.itemId, itemId)
          )
        )
        .limit(1)

      const logs = await db
        .select({ context: schema.usageLogs.context })
        .from(schema.usageLogs)
        .where(
          and(
            eq(schema.usageLogs.itemId, itemId),
            eq(schema.usageLogs.action, 'execute'),
            // Same source filter as the aggregates and the outbound query: another provider
            // recording the same item id would otherwise contribute entry points and inbound
            // transitions to this app's panel.
            eq(schema.usageLogs.source, APP_PROVIDER_SOURCE_ID)
          )
        )
        .orderBy(desc(schema.usageLogs.id))
        .limit(LOG_SCAN_LIMIT)

      const { entryPoints, transitionsIn } = foldLaunchLogs(logs.map((row) => row.context))

      return {
        success: true,
        itemId,
        executeCount: stats?.executeCount ?? 0,
        searchCount: stats?.searchCount ?? 0,
        lastExecutedAt: stats?.lastExecuted ? stats.lastExecuted.getTime() : null,
        hourDistribution: parseDistribution(timeStats?.hourDistribution, 24),
        weekdayDistribution: parseDistribution(timeStats?.dayOfWeekDistribution, 7),
        entryPoints,
        transitionsIn,
        transitionsOut: await this.queryOutbound(db, bundleId),
        trend: await this.queryTrend(db, itemId)
      }
    } catch (error) {
      log.error(`Failed to query usage for ${itemId}`, { error })
      return { success: false, reason: 'error', error: String((error as Error)?.message ?? error) }
    }
  }

  /**
   * Launch totals for every application, as one indexed read.
   *
   * {@link query} is deliberately expensive — aggregates plus a bounded fold of the raw log — and
   * a list that needs a single number per row must not fan that out per application.
   */
  async countAll(): Promise<AppUsageCountsResult> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils) return { ok: false, reason: 'db-not-ready' }

    try {
      const rows = await dbUtils
        .getDb()
        .select({
          itemId: schema.itemUsageStats.itemId,
          executeCount: schema.itemUsageStats.executeCount
        })
        .from(schema.itemUsageStats)
        .where(eq(schema.itemUsageStats.sourceId, APP_PROVIDER_SOURCE_ID))

      return { ok: true, counts: new Map(rows.map((row) => [row.itemId, row.executeCount ?? 0])) }
    } catch (error) {
      log.error('Failed to count usage for all items', { error })
      return { ok: false, reason: 'error' }
    }
  }

  /**
   * Apps launched *while this one was in front*, i.e. where the user went next.
   *
   * The inbound half reads this app's own logs; the outbound half has to look at every other
   * app's, matching on the bundle id stored as their `prevApp`. `context` is a JSON text column
   * with no index on its contents, so a substring pre-filter narrows the scan in SQLite and the
   * exact match is re-checked in `foldOutboundLogs` — `LIKE` would also match an app whose id
   * merely contains this one's.
   *
   * SQLite has no default `LIKE` escape character, so `escapeLikePattern`'s backslashes only mean
   * anything with an explicit `ESCAPE`: without it a bundle id containing `_` asks for a literal
   * backslash and matches none of its own rows.
   */
  private async queryOutbound(
    db: CoreDatabase,
    bundleId?: string
  ): Promise<AppUsageOutboundTransition[]> {
    const identity = bundleId?.trim()
    if (!identity) return []

    const rows = await db
      .select({ itemId: schema.usageLogs.itemId, context: schema.usageLogs.context })
      .from(schema.usageLogs)
      .where(
        and(
          eq(schema.usageLogs.action, 'execute'),
          eq(schema.usageLogs.source, APP_PROVIDER_SOURCE_ID),
          sql`${schema.usageLogs.context} LIKE ${`%${escapeLikePattern(identity)}%`} ESCAPE '\\'`
        )
      )
      .orderBy(desc(schema.usageLogs.id))
      .limit(LOG_SCAN_LIMIT)

    return foldOutboundLogs(rows, identity)
  }

  /**
   * Daily execute counts for the trailing window, zero-filled.
   *
   * Read from `usage_trend_daily`, which exists precisely so a trend does not require scanning
   * the raw log. Days with no launches carry no row, and a sparse series would draw a chart whose
   * x-axis silently skips the quiet days.
   */
  private async queryTrend(db: CoreDatabase, itemId: string): Promise<AppUsageTrendPoint[]> {
    const today = Math.floor(Date.now() / DAY_MS)
    const firstDay = today - TREND_DAYS + 1

    const rows = await db
      .select({
        day: schema.usageTrendDaily.day,
        executeCount: schema.usageTrendDaily.executeCount
      })
      .from(schema.usageTrendDaily)
      .where(
        and(
          eq(schema.usageTrendDaily.sourceId, APP_PROVIDER_SOURCE_ID),
          eq(schema.usageTrendDaily.itemId, itemId),
          gte(schema.usageTrendDaily.day, firstDay)
        )
      )

    const byDay = new Map(rows.map((row) => [row.day, row.executeCount]))
    return Array.from({ length: TREND_DAYS }, (_, index) => {
      const day = firstDay + index
      return { day, timestamp: day * DAY_MS, count: byDay.get(day) ?? 0 }
    })
  }
}

/**
 * Parses a stored JSON distribution column into a fixed-length numeric array.
 *
 * These are plain TEXT columns; a malformed row costs this app its chart rather than throwing out
 * of the query and blanking the whole panel.
 */
function parseDistribution(raw: string | undefined, length: number): number[] {
  const empty = Array.from({ length }, () => 0)
  if (!raw) return empty
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return empty
    return empty.map((_, index) => {
      const value = Number(parsed[index])
      return Number.isFinite(value) && value > 0 ? value : 0
    })
  } catch {
    return empty
  }
}

/**
 * Folds raw launch-log contexts into an entry-point split and an inbound transition list.
 *
 * Logs written before the entry point existed carry no `ent`, and a launch with no foreground app
 * carries no `prevApp`; both are skipped rather than bucketed as "unknown", so the panel reports
 * what it actually knows instead of inventing a category.
 */
export function foldLaunchLogs(contexts: Array<string | null>): {
  entryPoints: AppUsageEntryPointCount[]
  transitionsIn: AppUsageTransition[]
} {
  const entryTally = new Map<string, number>()
  const transitionTally = new Map<string, { name?: string; count: number }>()

  for (const raw of contexts) {
    if (!raw) continue
    let parsed: LaunchLogContext
    try {
      parsed = JSON.parse(raw) as LaunchLogContext
    } catch {
      continue
    }

    const entryPoint = toUsageEntryPoint(parsed.ent)
    if (entryPoint) entryTally.set(entryPoint, (entryTally.get(entryPoint) ?? 0) + 1)

    const prevApp = typeof parsed.prevApp === 'string' ? parsed.prevApp.trim() : ''
    if (!prevApp) continue
    const existing = transitionTally.get(prevApp)
    const name = typeof parsed.prevAppName === 'string' ? parsed.prevAppName.trim() : ''
    if (existing) {
      existing.count += 1
      if (!existing.name && name) existing.name = name
    } else {
      transitionTally.set(prevApp, { name: name || undefined, count: 1 })
    }
  }

  return {
    entryPoints: [...entryTally.entries()]
      .map(([entryPoint, count]) => ({
        entryPoint: entryPoint as AppUsageEntryPointCount['entryPoint'],
        count
      }))
      .sort((a, b) => b.count - a.count),
    transitionsIn: [...transitionTally.entries()]
      .map(([fromApp, value]) => ({ fromApp, fromAppName: value.name, count: value.count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, MAX_TRANSITIONS)
  }
}

/**
 * Escapes the wildcards SQLite's `LIKE` would otherwise honour inside a bundle id.
 *
 * A literal `_` is common in reverse-DNS identifiers and means "any character" to `LIKE`, so an
 * unescaped id would pre-filter in rows belonging to neighbouring apps. They would be dropped by
 * the exact re-check below, but only after being read.
 */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`)
}

/**
 * Folds other apps' launch logs into "where the user went from here".
 *
 * The SQL pre-filter is a substring match, which also admits rows whose context merely contains
 * the identity somewhere else — a different app whose id has this one as a prefix, or the string
 * appearing in `prevAppName`. The exact comparison is re-done here against the parsed `prevApp`
 * field, so the pre-filter only has to be cheap, not correct.
 */
export function foldOutboundLogs(
  rows: Array<{ itemId: string; context: string | null }>,
  identity: string
): AppUsageOutboundTransition[] {
  const tally = new Map<string, number>()

  for (const row of rows) {
    if (!row.context || !row.itemId) continue
    let parsed: LaunchLogContext
    try {
      parsed = JSON.parse(row.context) as LaunchLogContext
    } catch {
      continue
    }
    if (typeof parsed.prevApp !== 'string' || parsed.prevApp.trim() !== identity) continue
    // The destination is the app that was launched, which the log keys by item id.
    tally.set(row.itemId, (tally.get(row.itemId) ?? 0) + 1)
  }

  return [...tally.entries()]
    .map(([toItemId, count]) => ({ toItemId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_TRANSITIONS)
}
