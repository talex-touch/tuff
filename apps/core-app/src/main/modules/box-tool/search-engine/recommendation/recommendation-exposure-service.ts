import { and, desc, eq, gte, sql } from 'drizzle-orm'
import * as schema from '../../../../db/schema'
import { resolveCurrentAuxDb, scheduleAuxWrite } from '../../../../db/db-write'
import { createLogger } from '../../../../utils/logger'
import { DAY_MS, toDayBucket, toErrorMeta } from './recommendation-utils'

const exposureLog = createLogger('RecommendationEngine').child('Exposure')

/**
 * Top-k buckets tracked for hit-rate@k. A click at rank r counts for every
 * bucket >= r+1, so `clicks@k / impressions@k` reads directly as "how often the
 * user picked something from the first k recommendations".
 */
export const EXPOSURE_K_BUCKETS = [1, 3, 5, 10] as const

/** An exposed id stays clickable for this long; older entries are pruned on write. */
const EXPOSURE_TTL_MS = 10 * 60 * 1000
const EXPOSURE_MAX_ENTRIES = 500
const DEFAULT_SURFACE = 'core-box'

export interface ExposureReport {
  /** Item identities in rendered order (`sourceId:itemId`) */
  itemKeys: string[]
  surface?: string
}

export interface ExposureHitRateBucket {
  k: number
  impressions: number
  clicks: number
  hitRate: number
}

interface ExposedEntry {
  rank: number
  surface: string
  exposedAt: number
  /** Slice this id belonged to when it was rendered, if any. */
  tag?: string
}

/**
 * Slice rows are stored as `<surface>:<tag>`; base surfaces (`core-box`,
 * `division-box`) never contain a colon.
 */
function readSliceTag(surface: string): string | null {
  const separator = surface.indexOf(':')
  return separator < 0 ? null : surface.slice(separator + 1)
}

/**
 * Recommendation exposure → click accounting (R9 evaluation groundwork).
 *
 * Everything here is local: the renderer reports which item ids it rendered,
 * the click side is the existing execute path, and only per-day counts are
 * persisted. No ids reach the database and nothing is uploaded.
 */
export class RecommendationExposureService {
  private exposed = new Map<string, ExposedEntry>()
  private taggedKeys = new Map<string, string>()

  /**
   * Mark the ids the engine wants measured as their own slice (e.g. the newly
   * installed apps in the current ranking), replacing the previous set for that
   * tag. Tagged ids get a parallel `<surface>:<tag>` counter row on top of the
   * overall one, so a channel's hit-rate can be read without a schema change —
   * and, like the base counters, only counts are persisted.
   */
  setTaggedKeys(tag: string, keys: Iterable<string>): void {
    for (const [key, existing] of this.taggedKeys) {
      if (existing === tag) this.taggedKeys.delete(key)
    }
    for (const key of keys) {
      if (typeof key === 'string' && key.length > 0) this.taggedKeys.set(key, tag)
    }
  }

  /** Renderer reported a rendered recommendation list. */
  recordExposure(report: ExposureReport): void {
    const itemKeys = report.itemKeys.filter((key) => typeof key === 'string' && key.length > 0)
    if (itemKeys.length === 0) return

    const surface = report.surface || DEFAULT_SURFACE
    const now = Date.now()
    this.pruneExposed(now)

    const bestTaggedRank = new Map<string, number>()
    itemKeys.forEach((key, rank) => {
      const tag = this.taggedKeys.get(key)
      this.exposed.set(key, { rank, surface, exposedAt: now, tag })
      if (tag !== undefined && rank < (bestTaggedRank.get(tag) ?? Number.MAX_SAFE_INTEGER)) {
        bestTaggedRank.set(tag, rank)
      }
    })

    const day = toDayBucket(now)
    for (const k of EXPOSURE_K_BUCKETS) {
      // Every bucket gets the impression, including buckets wider than the
      // list: a 3-item render is still an opportunity to "click within the top
      // 10". Narrowing the denominator instead would let clicks outnumber
      // impressions and push hit-rate@k above 1.
      void this.bumpCounters(day, surface, k, { impressions: 1, clicks: 0 })
    }

    // A slice only gets an impression at k where it actually had an item to
    // click: "@3" for the slice means "a tagged item was in the top 3".
    for (const [tag, rank] of bestTaggedRank) {
      for (const k of EXPOSURE_K_BUCKETS) {
        if (rank >= k) continue
        void this.bumpCounters(day, `${surface}:${tag}`, k, { impressions: 1, clicks: 0 })
      }
    }
  }

  /** Execute on a previously exposed item = a click on that recommendation. */
  recordClick(sourceId: string, itemId: string): void {
    const key = `${sourceId}:${itemId}`
    const entry = this.exposed.get(key)
    if (!entry) return

    const now = Date.now()
    if (now - entry.exposedAt >= EXPOSURE_TTL_MS) {
      this.exposed.delete(key)
      return
    }

    // One click per exposure — re-executing the same item without a new render
    // must not inflate the rate.
    this.exposed.delete(key)

    const day = toDayBucket(now)
    for (const k of EXPOSURE_K_BUCKETS) {
      if (entry.rank >= k) continue
      void this.bumpCounters(day, entry.surface, k, { impressions: 0, clicks: 1 })
      // The tag captured at render time, not the current one: the ranking may
      // have moved on between the render and the click.
      if (entry.tag !== undefined) {
        void this.bumpCounters(day, `${entry.surface}:${entry.tag}`, k, {
          impressions: 0,
          clicks: 1
        })
      }
    }
  }

  /**
   * Hit-rate@k over the last `days` days. Slice rows (`<surface>:<tag>`) are a
   * parallel accounting of items already counted on their base surface, so they
   * stay out of the overall numbers — pass `tag` to read one slice instead.
   */
  async getHitRate(days = 7, tag?: string): Promise<ExposureHitRateBucket[]> {
    try {
      const db = resolveCurrentAuxDb()?.db
      if (!db) return []

      const since = toDayBucket(Date.now() - Math.max(0, days - 1) * DAY_MS)
      const rows = await db
        .select({
          surface: schema.recommendationExposureDaily.surface,
          k: schema.recommendationExposureDaily.k,
          impressions: schema.recommendationExposureDaily.impressions,
          clicks: schema.recommendationExposureDaily.clicks
        })
        .from(schema.recommendationExposureDaily)
        .where(gte(schema.recommendationExposureDaily.day, since))
        .orderBy(desc(schema.recommendationExposureDaily.day))

      const totals = new Map<number, { impressions: number; clicks: number }>()
      for (const row of rows) {
        if (readSliceTag(row.surface) !== (tag ?? null)) continue
        const bucket = totals.get(row.k) ?? { impressions: 0, clicks: 0 }
        bucket.impressions += row.impressions
        bucket.clicks += row.clicks
        totals.set(row.k, bucket)
      }

      return EXPOSURE_K_BUCKETS.filter((k) => totals.has(k)).map((k) => {
        const bucket = totals.get(k)!
        return {
          k,
          impressions: bucket.impressions,
          clicks: bucket.clicks,
          hitRate: bucket.impressions > 0 ? bucket.clicks / bucket.impressions : 0
        }
      })
    } catch (error) {
      exposureLog.debug('Failed to read exposure hit rate', { meta: toErrorMeta(error) })
      return []
    }
  }

  /** Test seam: drop the session-scoped exposure set. */
  reset(): void {
    this.exposed.clear()
    this.taggedKeys.clear()
  }

  private pruneExposed(now: number): void {
    for (const [key, entry] of this.exposed) {
      if (now - entry.exposedAt >= EXPOSURE_TTL_MS) {
        this.exposed.delete(key)
      }
    }
    if (this.exposed.size <= EXPOSURE_MAX_ENTRIES) return

    const overflow = this.exposed.size - EXPOSURE_MAX_ENTRIES
    let dropped = 0
    for (const key of this.exposed.keys()) {
      if (dropped >= overflow) break
      this.exposed.delete(key)
      dropped++
    }
  }

  private async bumpCounters(
    day: number,
    surface: string,
    k: number,
    delta: { impressions: number; clicks: number }
  ): Promise<void> {
    try {
      await scheduleAuxWrite(
        'recommendation.exposure',
        (db) =>
          db
            .insert(schema.recommendationExposureDaily)
            .values({
              day,
              surface,
              k,
              impressions: delta.impressions,
              clicks: delta.clicks,
              updatedAt: new Date()
            })
            .onConflictDoUpdate({
              target: [
                schema.recommendationExposureDaily.day,
                schema.recommendationExposureDaily.surface,
                schema.recommendationExposureDaily.k
              ],
              set: {
                impressions: sql`${schema.recommendationExposureDaily.impressions} + ${delta.impressions}`,
                clicks: sql`${schema.recommendationExposureDaily.clicks} + ${delta.clicks}`,
                updatedAt: new Date()
              }
            }),
        { priority: 'best_effort', dropPolicy: 'none' }
      )
    } catch (error) {
      exposureLog.debug('Failed to persist exposure counters', { meta: toErrorMeta(error) })
    }
  }

  /** Today's raw counters, for diagnostics. */
  async getDailySnapshot(day = toDayBucket(Date.now()), surface = DEFAULT_SURFACE) {
    try {
      const db = resolveCurrentAuxDb()?.db
      if (!db) return []
      return await db
        .select()
        .from(schema.recommendationExposureDaily)
        .where(
          and(
            eq(schema.recommendationExposureDaily.day, day),
            eq(schema.recommendationExposureDaily.surface, surface)
          )
        )
    } catch (error) {
      exposureLog.debug('Failed to read exposure snapshot', { meta: toErrorMeta(error) })
      return []
    }
  }
}

export const recommendationExposureService = new RecommendationExposureService()
