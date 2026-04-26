import type { StorageCache } from './storage-cache'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { createLogger } from '../../utils/logger'

const storageLruLog = createLogger('Storage').child('LRU')

/**
 * StorageLRUManager - LRU management service
 *
 * Manages automatic config eviction based on last access time
 */
export class StorageLRUManager {
  private cache: StorageCache
  private readonly cleanupTaskId = 'storage.lru-cleanup'
  private onEvict: (name: string) => Promise<void>
  private hotConfigs: Set<string>

  private readonly EVICTION_TIMEOUT: number
  private readonly CLEANUP_INTERVAL: number

  constructor(
    cache: StorageCache,
    onEvict: (name: string) => Promise<void>,
    evictionTimeout: number = 60000,
    cleanupInterval: number = 30000,
    hotConfigs: Set<string> = new Set()
  ) {
    this.cache = cache
    this.onEvict = onEvict
    this.EVICTION_TIMEOUT = evictionTimeout
    this.CLEANUP_INTERVAL = cleanupInterval
    this.hotConfigs = hotConfigs
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
    const pollingService = PollingService.getInstance()
    if (pollingService.isRegistered(this.cleanupTaskId)) {
      return
    }

    storageLruLog.info('Started cleanup', {
      meta: { intervalSeconds: this.CLEANUP_INTERVAL / 1000 }
    })

    pollingService.register(this.cleanupTaskId, () => this.performCleanup(), {
      interval: this.CLEANUP_INTERVAL,
      unit: 'milliseconds',
      lane: 'maintenance',
      backpressure: 'coalesce',
      dedupeKey: this.cleanupTaskId,
      maxInFlight: 1,
      timeoutMs: 15_000,
      jitterMs: 300
    })
    pollingService.start()
  }

  /**
   * Stop periodic cleanup
   */
  stopCleanup(): void {
    PollingService.getInstance().unregister(this.cleanupTaskId)
  }

  private async performCleanup(): Promise<void> {
    const now = Date.now()
    const names = this.cache.getAllNames()
    const evicted: string[] = []

    for (const name of names) {
      // Skip hot configs - they should never be evicted
      if (this.hotConfigs.has(name)) {
        continue
      }

      const lastAccess = this.cache.getLastAccessTime(name)

      if (lastAccess && now - lastAccess > this.EVICTION_TIMEOUT) {
        try {
          await this.onEvict(name)
          this.cache.evict(name)
          evicted.push(name)
        } catch (error) {
          storageLruLog.error('Failed to evict config', {
            error,
            meta: { configName: name }
          })
        }
      }
    }

    if (evicted.length > 0) {
      storageLruLog.info('Evicted configs', {
        meta: { evictedCount: evicted.length, configNames: evicted.join(',') }
      })
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

      if (lastAccess && now - lastAccess > this.EVICTION_TIMEOUT) {
        try {
          await this.onEvict(name)
          this.cache.evict(name)
          evicted.push(name)
        } catch (error) {
          storageLruLog.error('Manual evict failed', {
            error,
            meta: { configName: name }
          })
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
    } catch (error) {
      storageLruLog.error('Force evict failed', {
        error,
        meta: { configName: name }
      })
    }
  }

  /**
   * Get pending evictions (for debugging)
   */
  getPendingEvictions(): Array<{ name: string; idleTime: number }> {
    const now = Date.now()
    const names = this.cache.getAllNames()
    const pending: Array<{ name: string; idleTime: number }> = []

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
