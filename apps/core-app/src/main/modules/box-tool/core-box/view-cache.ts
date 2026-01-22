import type { IPluginFeature } from '@talex-touch/utils/plugin'
import type { WebContentsView } from 'electron'
import type { TouchPlugin } from '../../plugin/plugin'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { createLogger } from '../../../utils/logger'

const log = createLogger('ViewCache')

interface CachedView {
  view: WebContentsView
  plugin: TouchPlugin
  feature?: IPluginFeature
  url: string
  lastUsedAt: number
  usageCount: number
  webContentsId: number
  dispose: (() => void) | null
}

interface ViewCacheConfig {
  maxCachedViews: number
  hotCacheDurationMs: number
}

const DEFAULT_CONFIG: ViewCacheConfig = {
  maxCachedViews: 4,
  hotCacheDurationMs: 120000
}

type WebContentsWithRenderGone = Electron.WebContents & {
  once: (event: 'render-process-gone', listener: () => void) => Electron.WebContents
  removeListener: (event: 'render-process-gone', listener: () => void) => Electron.WebContents
}

export class ViewCacheManager {
  private static instance: ViewCacheManager
  private cache = new Map<string, CachedView>()
  private config: ViewCacheConfig = { ...DEFAULT_CONFIG }
  private readonly pollingService = PollingService.getInstance()
  private readonly cleanupTaskId = 'core-box.view-cache.cleanup'

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
    log.debug(
      `Config updated: maxCachedViews=${this.config.maxCachedViews}, hotCacheDurationMs=${this.config.hotCacheDurationMs}`
    )
    this.ensureCleanupTask()
  }

  private ensureCleanupTask(): void {
    const enabled = this.config.maxCachedViews > 0
    if (!enabled) {
      this.pollingService.unregister(this.cleanupTaskId)
      return
    }

    const intervalMs = Math.max(Math.floor(this.config.hotCacheDurationMs / 2), 30_000)
    this.pollingService.register(this.cleanupTaskId, () => this.cleanupStale(), {
      interval: intervalMs,
      unit: 'milliseconds'
    })
    this.pollingService.start()
  }

  private getCacheKey(plugin: TouchPlugin, feature?: IPluginFeature): string {
    return `${plugin.name}:${feature?.id ?? 'default'}`
  }

  private getWebContents(view: WebContentsView | null | undefined): Electron.WebContents | null {
    const webContents = view?.webContents
    if (!webContents) return null
    if (typeof webContents.isDestroyed !== 'function') return null
    return webContents
  }

  private isCachedAlive(cached: CachedView | null | undefined): boolean {
    if (!cached) return false

    const webContents = this.getWebContents(cached.view)
    if (!webContents) return false

    if (webContents.id !== cached.webContentsId) return false

    return !webContents.isDestroyed()
  }

  private attachLifecycle(key: string, webContents: Electron.WebContents): () => void {
    const onDestroyed = () => {
      this.removeEntry(key, { close: false })
    }

    const onRenderGone = () => {
      this.removeEntry(key, { close: false })
    }

    const renderGoneEmitter = webContents as WebContentsWithRenderGone
    webContents.once('destroyed', onDestroyed)
    renderGoneEmitter.once('render-process-gone', onRenderGone)

    return () => {
      webContents.removeListener('destroyed', onDestroyed)
      renderGoneEmitter.removeListener('render-process-gone', onRenderGone)
    }
  }

  private removeEntry(key: string, options: { close: boolean } = { close: true }): void {
    const cached = this.cache.get(key)
    if (!cached) return

    try {
      cached.dispose?.()
    } finally {
      cached.dispose = null
    }

    const webContents = this.getWebContents(cached.view)
    if (options.close && webContents && !webContents.isDestroyed()) {
      try {
        webContents.close()
      } catch {
        log.warn(`Failed to close view: ${key}`)
      }
    }

    this.cache.delete(key)
  }

  public get(plugin: TouchPlugin, feature?: IPluginFeature): CachedView | null {
    const key = this.getCacheKey(plugin, feature)
    const cached = this.cache.get(key)

    if (!cached) return null

    if (!this.isCachedAlive(cached)) {
      this.removeEntry(key, { close: false })
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

    const webContents = this.getWebContents(view)
    if (!webContents) {
      log.warn(`Skip caching view without valid webContents: ${key}`)
      return
    }

    this.removeEntry(key, { close: true })

    if (this.cache.size >= this.config.maxCachedViews) {
      this.evictLRU()
    }

    const dispose = this.attachLifecycle(key, webContents)

    this.cache.set(key, {
      view,
      plugin,
      feature,
      url,
      lastUsedAt: Date.now(),
      usageCount: 1,
      webContentsId: webContents.id,
      dispose
    })

    log.debug(`Cached view: ${key} (total: ${this.cache.size})`)
    this.ensureCleanupTask()
  }

  public release(plugin: TouchPlugin, feature?: IPluginFeature): void {
    const key = this.getCacheKey(plugin, feature)
    this.removeEntry(key, { close: true })
    log.debug(`Released view: ${key}`)
  }

  public releasePlugin(pluginName: string): void {
    const prefix = `${pluginName}:`
    const keys = Array.from(this.cache.keys()).filter((key) => key.startsWith(prefix))
    if (keys.length === 0) return

    for (const key of keys) {
      this.removeEntry(key, { close: true })
      log.debug(`Released view during releasePlugin: ${key}`)
    }
  }

  public clear(): void {
    const keys = Array.from(this.cache.keys())
    for (const key of keys) {
      this.removeEntry(key, { close: true })
    }
    log.debug('Cache cleared')
  }

  public getStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    }
  }

  public getCachedViewsByPlugin(pluginName: string): WebContentsView[] {
    if (!pluginName) return []

    const views: WebContentsView[] = []
    for (const [key, cached] of this.cache.entries()) {
      if (cached.plugin.name !== pluginName) continue

      if (!this.isCachedAlive(cached)) {
        this.removeEntry(key, { close: false })
        continue
      }

      views.push(cached.view)
    }

    return views
  }

  private evictLRU(): void {
    let oldest: [string, CachedView] | null = null

    for (const entry of this.cache.entries()) {
      if (!oldest || entry[1].lastUsedAt < oldest[1].lastUsedAt) {
        oldest = entry
      }
    }

    if (oldest) {
      const [key] = oldest
      this.removeEntry(key, { close: true })
      log.debug(`Evicted LRU view: ${key}`)
    }
  }

  public cleanupStale(): void {
    const now = Date.now()
    const staleThreshold = this.config.hotCacheDurationMs * 2

    for (const [key, cached] of this.cache) {
      if (now - cached.lastUsedAt > staleThreshold) {
        this.removeEntry(key, { close: true })
        log.debug(`Cleaned stale view: ${key}`)
      }
    }
  }
}

export const viewCacheManager = ViewCacheManager.getInstance()
