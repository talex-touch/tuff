/**
 * Cached data with version tracking
 */
export interface VersionedData {
  data: object
  version: number
}

/**
 * StorageCache - In-memory cache service for configuration data
 *
 * Manages configuration cache with dirty tracking, LRU access timestamps,
 * and version control for conflict resolution
 */
export class StorageCache {
  private cache = new Map<string, VersionedData>()
  private dirtySet = new Set<string>()
  private lastAccessTime = new Map<string, number>()
  private invalidatedSet = new Set<string>()
  private serializedCache = new Map<string, string>()

  /**
   * Get configuration from cache
   * Returns a deep copy to prevent external mutation of cached data
   * @param name - Configuration name
   * @returns Deep copy of configuration object or undefined if not found
   */
  get(name: string): object | undefined {
    const entry = this.cache.get(name)
    if (entry) {
      this.lastAccessTime.set(name, Date.now())
      // Return deep copy to prevent external code from mutating cache
      return structuredClone(entry.data)
    }
    return undefined
  }

  /**
   * Get configuration reference for internal use (no deep copy).
   */
  getRaw(name: string): object | undefined {
    const entry = this.cache.get(name)
    if (entry) {
      this.lastAccessTime.set(name, Date.now())
      return entry.data
    }
    return undefined
  }

  /**
   * Get configuration with version info
   * @param name - Configuration name
   * @returns Versioned data or undefined if not found
   */
  getWithVersion(name: string): VersionedData | undefined {
    const entry = this.cache.get(name)
    if (entry) {
      this.lastAccessTime.set(name, Date.now())
      return {
        data: structuredClone(entry.data),
        version: entry.version,
      }
    }
    return undefined
  }

  /**
   * Get current version number for a config
   * @param name - Configuration name
   * @returns Version number or 0 if not found
   */
  getVersion(name: string): number {
    return this.cache.get(name)?.version ?? 0
  }

  /**
   * Check if configuration exists in cache
   */
  has(name: string): boolean {
    return this.cache.has(name)
  }

  /**
   * Set cache and mark as dirty, auto-increment version
   * @param name - Configuration name
   * @param data - Configuration data
   * @param incrementVersion - Whether to increment version (default: true)
   * @returns The new version number
   */
  set(
    name: string,
    data: object,
    incrementVersion: boolean = true,
    serialized?: string,
  ): number {
    const currentVersion = this.cache.get(name)?.version ?? 0
    const newVersion = incrementVersion ? currentVersion + 1 : currentVersion
    this.cache.set(name, { data, version: newVersion })
    this.dirtySet.add(name)
    this.lastAccessTime.set(name, Date.now())
    if (serialized !== undefined) {
      this.serializedCache.set(name, serialized)
    } else {
      this.serializedCache.delete(name)
    }
    return newVersion
  }

  /**
   * Set cache with specific version (for loading from disk)
   * @param name - Configuration name
   * @param data - Configuration data
   * @param version - Specific version to set
   */
  setWithVersion(name: string, data: object, version: number, serialized?: string): void {
    this.cache.set(name, { data, version })
    this.lastAccessTime.set(name, Date.now())
    if (serialized !== undefined) {
      this.serializedCache.set(name, serialized)
    } else {
      this.serializedCache.delete(name)
    }
  }

  /**
   * Try to set cache only if version is newer (conflict resolution)
   * @param name - Configuration name
   * @param data - Configuration data
   * @param version - Version to compare
   * @returns true if set succeeded, false if rejected due to older version
   */
  setIfNewer(name: string, data: object, version: number, serialized?: string): boolean {
    const currentVersion = this.cache.get(name)?.version ?? 0
    if (version > currentVersion) {
      this.cache.set(name, { data, version })
      this.dirtySet.add(name)
      this.lastAccessTime.set(name, Date.now())
      if (serialized !== undefined) {
        this.serializedCache.set(name, serialized)
      } else {
        this.serializedCache.delete(name)
      }
      return true
    }
    return false
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
   * Get cached serialized content if available.
   */
  getSerialized(name: string): string | undefined {
    return this.serializedCache.get(name)
  }

  /**
   * Set serialized content without mutating version.
   */
  setSerialized(name: string, serialized: string): void {
    if (this.cache.has(name)) {
      this.serializedCache.set(name, serialized)
    }
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
    this.serializedCache.delete(name)
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
    this.serializedCache.clear()
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size
  }

  /**
   * Mark configuration as invalidated (needs reload on next access)
   */
  invalidate(name: string): void {
    this.invalidatedSet.add(name)
  }

  /**
   * Check if configuration is invalidated
   */
  isInvalidated(name: string): boolean {
    return this.invalidatedSet.has(name)
  }

  /**
   * Clear invalidated flag
   */
  clearInvalidated(name: string): void {
    this.invalidatedSet.delete(name)
  }
}
