import type { IPluginFeature } from '@talex-touch/utils/plugin'
import type { TouchPlugin } from '../../plugin/plugin'
import { WebContentsView } from 'electron'
import { createLogger } from '../../../utils/logger'

const log = createLogger('ViewCache')

interface CachedView {
  view: WebContentsView
  plugin: TouchPlugin
  feature?: IPluginFeature
  url: string
  lastUsedAt: number
  usageCount: number
}

interface ViewCacheConfig {
  maxCachedViews: number
  hotCacheDurationMs: number
}

const DEFAULT_CONFIG: ViewCacheConfig = {
  maxCachedViews: 4,
  hotCacheDurationMs: 120000
}

export class ViewCacheManager {
  private static instance: ViewCacheManager
  private cache = new Map<string, CachedView>()
  private config: ViewCacheConfig = { ...DEFAULT_CONFIG }

  private constructor() {}

  public static getInstance(): ViewCacheManager {
    if (!ViewCacheManager.instance) {
      ViewCacheManager.instance = new ViewCacheManager()
    }
    return ViewCacheManager.instance
  }

  public updateConfig(config: Partial<ViewCacheConfig>): void {
    if (typeof config.maxCachedViews === 'number') {
      this.config.maxCachedViews = config.maxCachedViews
    }
    if (typeof config.hotCacheDurationMs === 'number') {
      this.config.hotCacheDurationMs = config.hotCacheDurationMs
    }
    log.debug(`Config updated: maxCachedViews=${this.config.maxCachedViews}, hotCacheDurationMs=${this.config.hotCacheDurationMs}`)
  }

  private getCacheKey(plugin: TouchPlugin, feature?: IPluginFeature): string {
    return `${plugin.name}:${feature?.id ?? 'default'}`
  }

  public get(plugin: TouchPlugin, feature?: IPluginFeature): CachedView | null {
    const key = this.getCacheKey(plugin, feature)
    const cached = this.cache.get(key)

    if (!cached) return null

    if (cached.view.webContents.isDestroyed()) {
      this.cache.delete(key)
      return null
    }

    cached.lastUsedAt = Date.now()
    cached.usageCount++
    log.debug(`Cache hit: ${key} (usage: ${cached.usageCount})`)
    return cached
  }

  public set(
    plugin: TouchPlugin,
    view: WebContentsView,
    url: string,
    feature?: IPluginFeature
  ): void {
    const key = this.getCacheKey(plugin, feature)

    if (this.cache.size >= this.config.maxCachedViews) {
      this.evictLRU()
    }

    this.cache.set(key, {
      view,
      plugin,
      feature,
      url,
      lastUsedAt: Date.now(),
      usageCount: 1
    })

    log.debug(`Cached view: ${key} (total: ${this.cache.size})`)
  }

  public release(plugin: TouchPlugin, feature?: IPluginFeature): void {
    const key = this.getCacheKey(plugin, feature)
    const cached = this.cache.get(key)

    if (cached) {
      if (!cached.view.webContents.isDestroyed()) {
        try {
          cached.view.webContents.close()
        } catch (e) {
          log.warn(`Failed to close view: ${key}`)
        }
      }
      this.cache.delete(key)
      log.debug(`Released view: ${key}`)
    }
  }

  public clear(): void {
    for (const [key, cached] of this.cache) {
      if (!cached.view.webContents.isDestroyed()) {
        try {
          cached.view.webContents.close()
        } catch (e) {
          log.warn(`Failed to close view during clear: ${key}`)
        }
      }
    }
    this.cache.clear()
    log.debug('Cache cleared')
  }

  public getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    }
  }

  private evictLRU(): void {
    let oldest: [string, CachedView] | null = null

    for (const entry of this.cache.entries()) {
      if (!oldest || entry[1].lastUsedAt < oldest[1].lastUsedAt) {
        oldest = entry
      }
    }

    if (oldest) {
      const [key, cached] = oldest
      if (!cached.view.webContents.isDestroyed()) {
        try {
          cached.view.webContents.close()
        } catch (e) {
          log.warn(`Failed to close evicted view: ${key}`)
        }
      }
      this.cache.delete(key)
      log.debug(`Evicted LRU view: ${key}`)
    }
  }

  public cleanupStale(): void {
    const now = Date.now()
    const staleThreshold = this.config.hotCacheDurationMs * 2

    for (const [key, cached] of this.cache) {
      if (now - cached.lastUsedAt > staleThreshold) {
        if (!cached.view.webContents.isDestroyed()) {
          try {
            cached.view.webContents.close()
          } catch (e) {
            log.warn(`Failed to close stale view: ${key}`)
          }
        }
        this.cache.delete(key)
        log.debug(`Cleaned stale view: ${key}`)
      }
    }
  }
}

export const viewCacheManager = ViewCacheManager.getInstance()
