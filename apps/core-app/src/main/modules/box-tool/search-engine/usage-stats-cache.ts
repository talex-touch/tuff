import type * as schema from '../../../db/schema'
import { performance } from 'node:perf_hooks'

/**
 * Usage stats cache entry
 */
interface CacheEntry {
  data: typeof schema.itemUsageStats.$inferSelect
  timestamp: number
}

/**
 * LRU Cache for usage stats to optimize query performance
 */
export class UsageStatsCache {
  private cache = new Map<string, CacheEntry>()
  private readonly maxSize: number
  private readonly ttl: number // Time to live in milliseconds

  constructor(maxSize = 10000, ttl = 15 * 60 * 1000) {
    // 15 minutes default TTL
    this.maxSize = maxSize
    this.ttl = ttl
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
    if (now - entry.timestamp > this.ttl) {
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

      if (entry && now - entry.timestamp <= this.ttl) {
        result.set(key, entry.data)
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
  const missingKeys = keys.filter(
    ({ sourceId, itemId }) => !cached.has(cache.getKey(sourceId, itemId))
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
    console.debug(
      `[UsageStatsCache] All ${keys.length} stats retrieved from cache in ${(performance.now() - start).toFixed(2)}ms`
    )
    return result
  }

  // Fetch missing keys from database
  const dbResults = await dbUtils.getUsageStatsBatch(missingKeys)

  // Cache the results
  cache.setBatch(dbResults)

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
  console.debug(
    `[UsageStatsCache] Retrieved ${keys.length} stats (${cacheHitCount} cached, ${cacheMissCount} from DB) in ${duration.toFixed(2)}ms`
  )

  return result
}
