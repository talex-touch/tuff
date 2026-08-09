import type * as schema from '../../../db/schema'
import { performance } from 'node:perf_hooks'
import { createLogger } from '../../../utils/logger'

const usageStatsCacheLog = createLogger('UsageStatsCache')

/**
 * Usage stats cache entry
 */
interface CacheEntry {
  /** null marks a key the database is known not to have — see markAbsent. */
  data: typeof schema.itemUsageStats.$inferSelect | null
  timestamp: number
}

/**
 * LRU Cache for usage stats to optimize query performance
 */
export class UsageStatsCache {
  private cache = new Map<string, CacheEntry>()
  private readonly maxSize: number
  private readonly ttl: number // Time to live in milliseconds

  /** Negative entries expire sooner than real rows; see markAbsent. */
  private readonly absenceTtl: number

  constructor(maxSize = 10000, ttl = 15 * 60 * 1000, absenceTtl = 30 * 1000) {
    // 15 minutes default TTL
    this.maxSize = maxSize
    this.ttl = ttl
    this.absenceTtl = absenceTtl
  }

  /**
   * Generate cache key from sourceId and itemId
   */
  getKey(sourceId: string, itemId: string): string {
    return `${sourceId}:${itemId}`
  }

  /**
   * Get usage stats from cache
   */
  get(sourceId: string, itemId: string): typeof schema.itemUsageStats.$inferSelect | null {
    const key = this.getKey(sourceId, itemId)
    const entry = this.cache.get(key)

    if (!entry) {
      return null
    }

    // Check if entry is expired
    const now = Date.now()
    if (now - entry.timestamp > this.absenceTtlFor(entry)) {
      this.cache.delete(key)
      return null
    }

    // Move to end (LRU)
    this.cache.delete(key)
    this.cache.set(key, entry)

    return entry.data
  }

  /**
   * Batch get usage stats from cache
   */
  getBatch(
    keys: Array<{ sourceId: string; itemId: string }>
  ): Map<string, typeof schema.itemUsageStats.$inferSelect> {
    const result = new Map<string, typeof schema.itemUsageStats.$inferSelect>()
    const now = Date.now()
    const missingKeys: Array<{ sourceId: string; itemId: string }> = []

    for (const { sourceId, itemId } of keys) {
      const key = this.getKey(sourceId, itemId)
      const entry = this.cache.get(key)

      if (entry && now - entry.timestamp <= this.absenceTtlFor(entry)) {
        // A tombstone is a hit for "do not query again", but not a row to return.
        if (entry.data) result.set(key, entry.data)
        // Move to end (LRU)
        this.cache.delete(key)
        this.cache.set(key, entry)
      } else {
        if (entry) {
          // Remove expired entry
          this.cache.delete(key)
        }
        missingKeys.push({ sourceId, itemId })
      }
    }

    return result
  }

  /**
   * Set usage stats in cache
   */
  set(sourceId: string, itemId: string, data: typeof schema.itemUsageStats.$inferSelect): void {
    const key = this.getKey(sourceId, itemId)
    const entry: CacheEntry = {
      data,
      timestamp: Date.now()
    }

    // If cache is full, remove oldest entry
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) {
        this.cache.delete(firstKey)
      }
    }

    // Remove existing entry if present, then add to end
    this.cache.delete(key)
    this.cache.set(key, entry)
  }

  /**
   * Batch set usage stats in cache
   */
  setBatch(stats: (typeof schema.itemUsageStats.$inferSelect)[]): void {
    for (const stat of stats) {
      this.set(stat.sourceId, stat.itemId, stat)
    }
  }

  /**
   * Records that the database has no row for these keys.
   *
   * Without this, a search returning items the user has never executed re-queried every one of
   * them on every debounced keystroke — a batch of misses that returns zero rows, on the
   * interactive path (#658).
   *
   * Held for a shorter window than a real row: an absent key becomes present the first time the
   * user runs the item, and although executeItem invalidates the key directly, the short TTL keeps
   * the damage bounded if any future writer forgets to.
   */
  markAbsent(keys: Array<{ sourceId: string; itemId: string }>): void {
    const timestamp = Date.now()

    for (const { sourceId, itemId } of keys) {
      const key = this.getKey(sourceId, itemId)
      if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
        const firstKey = this.cache.keys().next().value
        if (firstKey) this.cache.delete(firstKey)
      }
      this.cache.delete(key)
      this.cache.set(key, { data: null, timestamp })
    }
  }

  /** Whether this key is cached as known-absent and still inside the negative TTL. */
  isKnownAbsent(sourceId: string, itemId: string): boolean {
    const entry = this.cache.get(this.getKey(sourceId, itemId))
    if (!entry || entry.data !== null) return false
    return Date.now() - entry.timestamp <= this.absenceTtl
  }

  private absenceTtlFor(entry: CacheEntry): number {
    return entry.data === null ? this.absenceTtl : this.ttl
  }

  /**
   * Invalidate cache entry
   */
  invalidate(sourceId: string, itemId: string): void {
    const key = this.getKey(sourceId, itemId)
    this.cache.delete(key)
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number
    maxSize: number
    hitRate: number
    hits: number
    misses: number
  } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 0, // Will be calculated by caller if needed
      hits: 0, // Will be tracked by caller if needed
      misses: 0 // Will be tracked by caller if needed
    }
  }
}

/**
 * Cached wrapper for DbUtils.getUsageStatsBatch
 */
export async function getUsageStatsBatchCached(
  dbUtils: {
    getUsageStatsBatch: (
      keys: Array<{ sourceId: string; itemId: string }>
    ) => Promise<(typeof schema.itemUsageStats.$inferSelect)[]>
  },
  cache: UsageStatsCache,
  keys: Array<{ sourceId: string; itemId: string }>
): Promise<(typeof schema.itemUsageStats.$inferSelect)[]> {
  const start = performance.now()

  // Get cached entries
  const cached = cache.getBatch(keys)

  // Find missing keys
  // Keys the database is already known not to have are not misses — re-querying them is what made
  // a fresh result set cost a full round trip on every keystroke (#658).
  const missingKeys = keys.filter(
    ({ sourceId, itemId }) =>
      !cached.has(cache.getKey(sourceId, itemId)) && !cache.isKnownAbsent(sourceId, itemId)
  )

  // If all keys are cached, return immediately
  if (missingKeys.length === 0) {
    const result: (typeof schema.itemUsageStats.$inferSelect)[] = []
    for (const { sourceId, itemId } of keys) {
      const key = cache.getKey(sourceId, itemId)
      const stat = cached.get(key)
      if (stat) {
        result.push(stat)
      }
    }
    usageStatsCacheLog.debug('All stats retrieved from cache', {
      meta: { count: keys.length, durationMs: Math.round(performance.now() - start) }
    })
    return result
  }

  // Fetch missing keys from database
  const dbResults = await dbUtils.getUsageStatsBatch(missingKeys)

  // Cache the results
  cache.setBatch(dbResults)

  // And remember the ones it did not return, so the next keystroke does not ask again.
  const returned = new Set(dbResults.map((stat) => cache.getKey(stat.sourceId, stat.itemId)))
  cache.markAbsent(
    missingKeys.filter(({ sourceId, itemId }) => !returned.has(cache.getKey(sourceId, itemId)))
  )

  // Combine cached and database results
  const resultMap = new Map<string, typeof schema.itemUsageStats.$inferSelect>()

  // Add cached entries
  for (const [key, value] of cached.entries()) {
    resultMap.set(key, value)
  }

  // Add database results
  for (const stat of dbResults) {
    const key = cache.getKey(stat.sourceId, stat.itemId)
    resultMap.set(key, stat)
  }

  // Return in the same order as requested keys
  const result: (typeof schema.itemUsageStats.$inferSelect)[] = []
  for (const { sourceId, itemId } of keys) {
    const key = cache.getKey(sourceId, itemId)
    const stat = resultMap.get(key)
    if (stat) {
      result.push(stat)
    }
  }

  const duration = performance.now() - start
  const cacheHitCount = cached.size
  const cacheMissCount = missingKeys.length
  usageStatsCacheLog.debug('Retrieved usage stats', {
    meta: {
      count: keys.length,
      cacheHitCount,
      cacheMissCount,
      durationMs: Math.round(duration)
    }
  })

  return result
}
