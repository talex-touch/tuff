/**
 * StorageCache - In-memory cache service for configuration data
 * 
 * Manages configuration cache with dirty tracking and LRU access timestamps
 */
export class StorageCache {
  private cache = new Map<string, object>()
  private dirtySet = new Set<string>()
  private lastAccessTime = new Map<string, number>()


  /**
   * Get configuration from cache
   * @param name - Configuration name
   * @returns Configuration object or undefined if not found
   */
  get(name: string): object | undefined {
    const data = this.cache.get(name)
    if (data) {
      this.lastAccessTime.set(name, Date.now())
    }
    return data
  }

  /**
   * Check if configuration exists in cache
   */
  has(name: string): boolean {
    return this.cache.has(name)
  }

  /**
   * Set cache and mark as dirty
   */
  set(name: string, data: object): void {
    this.cache.set(name, data)
    this.dirtySet.add(name)
    this.lastAccessTime.set(name, Date.now())

  }

  /**
   * Mark configuration as dirty (needs save)
   */
  markDirty(name: string): void {
    if (this.cache.has(name)) {
      this.dirtySet.add(name)
    }
  }

  /**
   * Get all dirty configuration names
   */
  getDirtyConfigs(): string[] {
    return Array.from(this.dirtySet)
  }

  /**
   * Clear dirty flag (called after save)
   */
  clearDirty(name: string): void {
    this.dirtySet.delete(name)
  }

  /**
   * Check if configuration is dirty
   */
  isDirty(name: string): boolean {
    return this.dirtySet.has(name)
  }

  /**
   * Evict configuration from cache
   */
  evict(name: string): void {
    this.cache.delete(name)
    this.dirtySet.delete(name)
    this.lastAccessTime.delete(name)
  }

  /**
   * Get last access timestamp
   */
  getLastAccessTime(name: string): number | undefined {
    return this.lastAccessTime.get(name)
  }

  /**
   * Get all cached configuration names
   */
  getAllNames(): string[] {
    return Array.from(this.cache.keys())
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear()
    this.dirtySet.clear()
    this.lastAccessTime.clear()
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size
  }
}

