import chalk from 'chalk'
import type { StorageCache } from './storage-cache'

/**
 * StorageLRUManager - LRU management service
 * 
 * Manages automatic config eviction based on last access time
 */
export class StorageLRUManager {
  private cache: StorageCache
  private cleanupTimer: NodeJS.Timeout | null = null
  private onEvict: (name: string) => Promise<void>
  
  private readonly EVICTION_TIMEOUT: number
  private readonly CLEANUP_INTERVAL: number

  constructor(
    cache: StorageCache,
    onEvict: (name: string) => Promise<void>,
    evictionTimeout: number = 60000,
    cleanupInterval: number = 30000,
  ) {
    this.cache = cache
    this.onEvict = onEvict
    this.EVICTION_TIMEOUT = evictionTimeout
    this.CLEANUP_INTERVAL = cleanupInterval
  }

  /**
   * Update last access time for config
   */
  touch(name: string): void {
    const data = this.cache.get(name)
    if (data) {
      this.cache.set(name, data)
    }
  }

  /**
   * Start periodic cleanup
   */
  startCleanup(): void {
    if (this.cleanupTimer) {
      return
    }

    console.info(
      chalk.blue(`[StorageLRU] Started cleanup with ${this.CLEANUP_INTERVAL / 1000}s interval`),
    )
    
    this.cleanupTimer = setInterval(async () => {
      await this.performCleanup()
    }, this.CLEANUP_INTERVAL)
  }

  /**
   * Stop periodic cleanup
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  private async performCleanup(): Promise<void> {
    const now = Date.now()
    const names = this.cache.getAllNames()
    const evicted: string[] = []

    for (const name of names) {
      const lastAccess = this.cache.getLastAccessTime(name)
      
      if (lastAccess && (now - lastAccess > this.EVICTION_TIMEOUT)) {
        try {
          await this.onEvict(name)
          this.cache.evict(name)
          evicted.push(name)
        }
        catch (error) {
          console.error(chalk.red(`[StorageLRU] Failed to evict "${name}"`), error)
        }
      }
    }

    if (evicted.length > 0) {
      console.info(
        chalk.cyan(`[StorageLRU] Evicted ${evicted.length} config(s): ${evicted.join(', ')}`),
      )
    }
  }

  /**
   * Manually trigger eviction
   * @returns Evicted config names
   */
  async manualEvict(): Promise<string[]> {
    const now = Date.now()
    const names = this.cache.getAllNames()
    const evicted: string[] = []

    for (const name of names) {
      const lastAccess = this.cache.getLastAccessTime(name)
      
      if (lastAccess && (now - lastAccess > this.EVICTION_TIMEOUT)) {
        try {
          await this.onEvict(name)
          this.cache.evict(name)
          evicted.push(name)
        }
        catch (error) {
          console.error(chalk.red(`[StorageLRU] Manual evict failed for "${name}"`), error)
        }
      }
    }

    return evicted
  }

  /**
   * Force evict config regardless of access time
   */
  async forceEvict(name: string): Promise<void> {
    if (!this.cache.has(name)) {
      return
    }

    try {
      await this.onEvict(name)
      this.cache.evict(name)
    }
    catch (error) {
      console.error(chalk.red(`[StorageLRU] Force evict failed for "${name}"`), error)
    }
  }

  /**
   * Get pending evictions (for debugging)
   */
  getPendingEvictions(): Array<{ name: string, idleTime: number }> {
    const now = Date.now()
    const names = this.cache.getAllNames()
    const pending: Array<{ name: string, idleTime: number }> = []

    for (const name of names) {
      const lastAccess = this.cache.getLastAccessTime(name)
      if (lastAccess) {
        const idleTime = now - lastAccess
        if (idleTime > this.EVICTION_TIMEOUT) {
          pending.push({ name, idleTime })
        }
      }
    }

    return pending.sort((a, b) => b.idleTime - a.idleTime)
  }
}

