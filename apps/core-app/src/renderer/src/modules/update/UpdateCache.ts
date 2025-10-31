/**
 * Cache entry interface
 */
interface CacheEntry {
  data: any
  timestamp: number
  ttl: number
  source: string
}

/**
 * Update cache manager for reducing GitHub API calls
 */
export class UpdateCache {
  private cache: Map<string, CacheEntry> = new Map()
  private readonly defaultTTL = 5 * 60 * 1000 // 5 minutes default TTL

  /**
   * Get cached data
   * @param key - Cache key
   * @returns Cached data or null if expired/not found
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key)

    if (!entry) {
      return null
    }

    const now = Date.now()
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key)
      return null
    }

    return entry.data as T
  }

  /**
   * Set cached data
   * @param key - Cache key
   * @param data - Data to cache
   * @param ttl - Time to live in milliseconds
   * @param source - Data source identifier
   */
  set<T>(key: string, data: T, ttl?: number, source?: string): void {
    const now = Date.now()
    const entry: CacheEntry = {
      data,
      timestamp: now,
      ttl: ttl || this.defaultTTL,
      source: source || 'unknown'
    }

    this.cache.set(key, entry)
  }

  /**
   * Generate cache key for GitHub releases
   * @param channel - App channel
   * @param repo - Repository name
   * @returns Cache key
   */
  generateReleaseKey(channel: string, repo: string): string {
    return `releases:${repo}:${channel}`
  }

  /**
   * Generate cache key for provider health check
   * @param providerName - Provider name
   * @returns Cache key
   */
  generateHealthKey(providerName: string): string {
    return `health:${providerName}`
  }

  /**
   * Clear expired entries
   */
  clearExpired(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key)
      }
    }
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
    totalEntries: number
    expiredEntries: number
    memoryUsage: number
  } {
    const now = Date.now()
    let expiredEntries = 0
    let memoryUsage = 0

    for (const entry of this.cache.values()) {
      if (now - entry.timestamp > entry.ttl) {
        expiredEntries++
      }
      memoryUsage += JSON.stringify(entry.data).length
    }

    return {
      totalEntries: this.cache.size,
      expiredEntries,
      memoryUsage
    }
  }

  /**
   * Check if cache entry exists and is valid
   * @param key - Cache key
   * @returns True if cache entry exists and is valid
   */
  has(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) {
      return false
    }

    const now = Date.now()
    return now - entry.timestamp <= entry.ttl
  }
}

/**
 * Singleton cache instance
 */
export const updateCache = new UpdateCache()
