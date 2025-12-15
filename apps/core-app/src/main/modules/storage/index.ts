import type { MaybePromise, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import path from 'node:path'
import { ChannelType } from '@talex-touch/utils/channel'
import { BrowserWindow } from 'electron'
import fse from 'fs-extra'
import { createLogger } from '../../utils/logger'
import { BaseModule } from '../abstract-base-module'
import { StorageCache } from './storage-cache'
import { StorageFrequencyMonitor } from './storage-frequency-monitor'
import { StorageLRUManager } from './storage-lru-manager'
import { StoragePollingService } from './storage-polling-service'

const storageLog = createLogger('Storage')

let pluginConfigPath: string

// Debounced broadcast mechanism to batch updates
const pendingBroadcasts = new Map<string, NodeJS.Timeout>()

/**
 * Broadcast storage update to all windows
 * @param name - Configuration name
 * @param version - Current version number
 * @param sourceWebContentsId - WebContents ID of the source window (to exclude from broadcast)
 */
function broadcastUpdate(name: string, version: number, sourceWebContentsId?: number) {
  // Cancel previous broadcast for this config
  const existing = pendingBroadcasts.get(name)
  if (existing) {
    clearTimeout(existing)
  }

  // Debounce broadcasts to reduce IPC overhead
  const timer = setTimeout(() => {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      // Skip the source window to avoid echo
      if (sourceWebContentsId && win.webContents.id === sourceWebContentsId) {
        continue
      }
      $app.channel?.sendTo(win, ChannelType.MAIN, 'storage:update', { name, version })
    }
    pendingBroadcasts.delete(name)
  }, 50) // 50ms debounce window

  pendingBroadcasts.set(name, timer)
}

/**
 * StorageModule - Main storage module with caching and auto-save
 *
 * Features:
 * - In-memory caching to avoid direct file I/O
 * - Periodic persistence via polling service
 * - LRU-based automatic eviction
 * - Frequency monitoring with warnings
 */
export class StorageModule extends BaseModule {
  static key: symbol = Symbol.for('Storage')
  name: ModuleKey = StorageModule.key

  private cache = new StorageCache()
  private pollingService: StoragePollingService
  private lruManager: StorageLRUManager
  private frequencyMonitor = new StorageFrequencyMonitor()
  private subscribers = new Map<string, Set<(data: object) => void>>()
  private hotConfigs = new Set<string>(['app-setting.ini'])

  pluginConfigs = new Map<string, object>()
  PLUGIN_CONFIG_MAX_SIZE = 10 * 1024 * 1024 // 10MB

  constructor() {
    super(StorageModule.key, {
      create: true,
      dirName: 'config',
    })

    this.pollingService = new StoragePollingService(
      this.cache,
      async name => await this.persistConfig(name),
    )

    this.lruManager = new StorageLRUManager(
      this.cache,
      async name => await this.evictConfig(name),
      60000, // evictionTimeout
      30000, // cleanupInterval
      this.hotConfigs, // Pass hot configs to LRU manager
    )
  }

  onInit({ file }: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    pluginConfigPath = path.join(file.dirPath!, 'plugins')
    fse.ensureDirSync(pluginConfigPath)
    storageLog.info(`Config path: ${file.dirPath}, plugin path: ${pluginConfigPath}`)

    this.pollingService.start()
    this.lruManager.startCleanup()

    this.setupListeners()
  }

  async onDestroy(): Promise<void> {
    await this.pollingService.stop()
    this.lruManager.stopCleanup()
    this.cache.clear()
    this.pluginConfigs.clear()
    storageLog.success('Shutdown complete')
  }

  /**
   * Get configuration data
   * @param name - Configuration name
   * @returns Configuration data (deep copy)
   */
  getConfig(name: string): object {
    if (!this.filePath)
      throw new Error(`Config ${name} not found! Path not set: ${this.filePath}`)

    this.frequencyMonitor.trackGet(name)

    // Hot configs skip invalidation check and always stay in cache
    const isHot = this.hotConfigs.has(name)

    // Check if cache is invalidated, force reload if so (skip for hot configs)
    if (!isHot && this.cache.isInvalidated(name)) {
      this.cache.evict(name)
      this.cache.clearInvalidated(name)
    }

    // Return cached data if available (deep copy handled by StorageCache.get)
    if (this.cache.has(name)) {
      return this.cache.get(name)!
    }

    // Load from disk
    const p = path.resolve(this.filePath!, name)
    let file = {}

    if (fse.existsSync(p)) {
      try {
        const content = fse.readFileSync(p, 'utf-8')
        // 只有当内容不是空字符串时才解析
        if (content.length > 0) {
          file = JSON.parse(content)
        }
      }
      catch (error) {
        storageLog.error(`Failed to parse config ${name}`, { error })
      }
    }

    // Use setWithVersion for initial load (version 1, not dirty)
    this.cache.setWithVersion(name, file, 1)

    // Return through cache.get() to ensure deep copy protection
    return this.cache.get(name)!
  }

  /**
   * Get configuration data with version info
   * @param name - Configuration name
   * @returns Configuration data with version, or null if not found
   */
  getConfigWithVersion(name: string): { data: object, version: number } | null {
    // Ensure config is loaded
    this.getConfig(name)
    const result = this.cache.getWithVersion(name)
    return result ? { data: result.data, version: result.version } : null
  }

  /**
   * Get current version of a configuration
   * @param name - Configuration name
   * @returns Version number
   */
  getVersion(name: string): number {
    return this.cache.getVersion(name)
  }

  reloadConfig(name: string): object {
    if (!this.filePath)
      throw new Error(`Config ${name} not found`)

    const filePath = path.resolve(this.filePath, name)
    let file = {}

    try {
      const content = fse.readFileSync(filePath, 'utf-8')
      if (content.length > 0) {
        file = JSON.parse(content)
      }
    }
    catch (error) {
      storageLog.error(`Failed to reload config ${name}`, { error })
    }

    this.cache.set(name, file)
    this.cache.clearDirty(name)
    this.cache.clearInvalidated(name)

    return file
  }

  /**
   * Invalidate cache for a specific config
   * Next getConfig call will reload from disk
   * Broadcasts update to all renderer processes
   */
  invalidateCache(name: string): void {
    this.cache.invalidate(name)
    // Notify all windows that cache was invalidated
    const version = this.cache.getVersion(name)
    setImmediate(() => {
      broadcastUpdate(name, version)
    })

    // Notify local subscribers
    this.notifySubscribers(name)
  }

  /**
   * Save configuration data
   * @param name - Configuration name
   * @param content - JSON string content (optional, uses cached data if not provided)
   * @param clear - Whether to clear cache after save
   * @param force - Force save even if content hasn't changed
   * @param sourceWebContentsId - WebContents ID of the source window (to exclude from broadcast)
   * @param clientVersion - Client's version number for conflict detection
   * @returns Save result with new version number
   */
  saveConfig(
    name: string,
    content?: string,
    clear?: boolean,
    force?: boolean,
    sourceWebContentsId?: number,
    clientVersion?: number,
  ): { success: boolean, version: number, conflict?: boolean } {
    if (!this.filePath)
      throw new Error(`Config ${name} not found`)

    this.frequencyMonitor.trackSave(name)

    const configData = content ?? JSON.stringify(this.cache.get(name) ?? {})

    if (clear) {
      this.cache.evict(name)
      return { success: true, version: 0 }
    }

    const parsed = JSON.parse(configData)
    const currentVersion = this.cache.getVersion(name)

    // Conflict detection: if client has older version, reject the save
    if (clientVersion !== undefined && clientVersion < currentVersion) {
      storageLog.warn(`Conflict detected for ${name}: client v${clientVersion} < server v${currentVersion}`)
      return { success: false, version: currentVersion, conflict: true }
    }

    // Smart deduplication: check if content actually changed (unless force=true)
    if (!force) {
      const cachedData = this.cache.get(name)
      if (cachedData && JSON.stringify(cachedData) === JSON.stringify(parsed)) {
        // Content hasn't changed, skip save but return current version
        return { success: true, version: currentVersion }
      }
    }

    // Set new data and get new version
    const newVersion = this.cache.set(name, parsed)

    // Broadcast update to other windows (exclude source)
    setImmediate(() => {
      broadcastUpdate(name, newVersion, sourceWebContentsId)
    })

    // Notify local subscribers
    this.notifySubscribers(name)

    return { success: true, version: newVersion }
  }

  /**
   * Persist config to disk (called by polling service)
   */
  private async persistConfig(name: string): Promise<void> {
    if (!this.filePath) {
      throw new Error(`Config path not found!`)
    }

    const data = this.cache.get(name)
    if (!data) {
      storageLog.warn(`Attempted to save non-existent config: ${name}`)
      return
    }

    const configData = JSON.stringify(data)
    const p = path.join(this.filePath, name)

    fse.ensureFileSync(p)
    await fse.writeFile(p, configData, 'utf-8')
  }

  /**
   * Evict config from cache (called by LRU manager)
   * Saves dirty configs before eviction
   */
  private async evictConfig(name: string): Promise<void> {
    if (this.cache.isDirty(name)) {
      await this.persistConfig(name)
      this.cache.clearDirty(name)
    }
  }

  /**
   * Subscribe to configuration changes
   * @param name Configuration file name
   * @param callback Callback function that receives the updated configuration data
   * @returns Unsubscribe function
   *
   * @example
   * ```typescript
   * const unsubscribe = storageModule.subscribe('app-setting.ini', (data) => {
   *   console.log('Config updated:', data)
   * })
   *
   * // Later, to unsubscribe:
   * unsubscribe()
   * ```
   */
  subscribe(name: string, callback: (data: object) => void): () => void {
    if (!this.subscribers.has(name)) {
      this.subscribers.set(name, new Set())
    }

    this.subscribers.get(name)!.add(callback)

    // Immediately call callback with current data
    const currentData = this.cache.get(name)
    if (currentData) {
      try {
        callback(currentData)
      }
      catch (error) {
        storageLog.error(`Subscriber callback error for "${name}"`, { error })
      }
    }

    // Return unsubscribe function
    return () => {
      this.unsubscribe(name, callback)
    }
  }

  /**
   * Unsubscribe from configuration changes
   * @param name Configuration file name
   * @param callback The same callback function used in subscribe
   */
  unsubscribe(name: string, callback: (data: object) => void): void {
    const callbacks = this.subscribers.get(name)
    if (callbacks) {
      callbacks.delete(callback)
      if (callbacks.size === 0) {
        this.subscribers.delete(name)
      }
    }
  }

  /**
   * Notify all subscribers of a configuration change
   * @private
   */
  private notifySubscribers(name: string): void {
    const callbacks = this.subscribers.get(name)
    if (!callbacks || callbacks.size === 0) {
      return
    }

    const data = this.cache.get(name)
    if (!data) {
      return
    }

    callbacks.forEach((callback) => {
      try {
        callback(data)
      }
      catch (error) {
        storageLog.error(`Subscriber callback error for "${name}"`, { error })
      }
    })
  }

  setupListeners() {
    const channel = $app.channel

    // Get config data (returns data only for backward compatibility)
    channel.regChannel(ChannelType.MAIN, 'storage:get', ({ data }) => {
      if (!data || typeof data !== 'string')
        return {}
      return this.getConfig(data)
    })

    // Get config data with version info
    channel.regChannel(ChannelType.MAIN, 'storage:get-versioned', ({ data }) => {
      if (!data || typeof data !== 'string')
        return null
      return this.getConfigWithVersion(data)
    })

    // Save config with version tracking and conflict detection
    channel.regChannel(ChannelType.MAIN, 'storage:save', ({ data, header }) => {
      if (!data || typeof data !== 'object')
        return { success: false, version: 0 }
      const { key, content, clear, force, version: clientVersion } = data
      if (typeof key !== 'string')
        return { success: false, version: 0 }

      // Get source webContents ID to exclude from broadcast
      const sender = header?.event?.sender
      const sourceWebContentsId = sender && 'id' in sender ? sender.id : undefined

      return this.saveConfig(key, content, clear, force, sourceWebContentsId, clientVersion)
    })

    // Reload config from disk
    channel.regChannel(ChannelType.MAIN, 'storage:reload', ({ data }) => {
      if (!data || typeof data !== 'string')
        return {}
      const result = this.reloadConfig(data)
      const version = this.cache.getVersion(data)
      broadcastUpdate(data, version)
      return result
    })

    // Force save all dirty configs
    channel.regChannel(ChannelType.MAIN, 'storage:saveall', async () => {
      await this.pollingService.forceSave()
    })

    // Sync save (for window close) - immediate persist to disk
    channel.regChannel(ChannelType.MAIN, 'storage:save-sync', ({ data, header }) => {
      if (!data || typeof data !== 'object')
        return { success: false, version: 0 }
      const { key, content, clear, force, version: clientVersion } = data
      if (typeof key !== 'string')
        return { success: false, version: 0 }

      const sender = header?.event?.sender
      const sourceWebContentsId = sender && 'id' in sender ? sender.id : undefined
      const result = this.saveConfig(key, content, clear, force, sourceWebContentsId, clientVersion)

      // Immediately persist to disk for sync save
      if (result.success && !clear) {
        try {
          const data = this.cache.get(key)
          if (data) {
            const p = path.join(this.filePath!, key)
            fse.ensureFileSync(p)
            fse.writeFileSync(p, JSON.stringify(data), 'utf-8')
          }
        } catch (err) {
          storageLog.error(`Failed to persist ${key} synchronously`, { error: err })
        }
        this.cache.clearDirty(key)
      }

      return result
    })
  }
}

const storageModule = new StorageModule()

export { storageModule }

export const getConfig = (name: string) => storageModule.getConfig(name)
export const saveConfig = storageModule.saveConfig.bind(storageModule)
