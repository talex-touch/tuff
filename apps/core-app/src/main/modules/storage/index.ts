import type { MaybePromise, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import path from 'node:path'
import { ChannelType } from '@talex-touch/utils/channel'
import chalk from 'chalk'
import { BrowserWindow } from 'electron'
import fse from 'fs-extra'
import { BaseModule } from '../abstract-base-module'
import { StorageCache } from './storage-cache'
import { StorageFrequencyMonitor } from './storage-frequency-monitor'
import { StorageLRUManager } from './storage-lru-manager'
import { StoragePollingService } from './storage-polling-service'

let pluginConfigPath: string

function broadcastUpdate(name: string) {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    $app.channel?.sendTo(win, ChannelType.MAIN, 'storage:update', { name })
  }
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
    )
  }

  onInit({ file }: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    pluginConfigPath = path.join(file.dirPath!, 'plugins')
    fse.ensureDirSync(pluginConfigPath)
    console.info(
      chalk.blue(`[StorageModule] Config path: ${file.dirPath}, plugin path: ${pluginConfigPath}`),
    )

    this.pollingService.start()
    this.lruManager.startCleanup()

    this.setupListeners()
  }

  async onDestroy(): Promise<void> {
    await this.pollingService.stop()
    this.lruManager.stopCleanup()
    this.cache.clear()
    this.pluginConfigs.clear()
    console.info(chalk.green('[StorageModule] Shutdown complete'))
  }

  getConfig(name: string): object {
    if (!this.filePath)
      throw new Error(`Config ${name} not found! Path not set: ${this.filePath}`)

    this.frequencyMonitor.trackGet(name)

    // Check if cache is invalidated, force reload if so
    if (this.cache.isInvalidated(name)) {
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
        console.error(chalk.red(`[StorageModule] Failed to parse config ${name}:`), error)
        // 继续使用空对象
      }
    }

    this.cache.set(name, file)
    this.cache.clearDirty(name)

    // Return through cache.get() to ensure deep copy protection
    return this.cache.get(name)!
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
      console.error(chalk.red(`[StorageModule] Failed to reload config ${name}:`), error)
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
    setImmediate(() => {
      broadcastUpdate(name)
    })
  }

  saveConfig(name: string, content?: string, clear?: boolean): boolean {
    if (!this.filePath)
      throw new Error(`Config ${name} not found`)

    this.frequencyMonitor.trackSave(name)

    const configData = content ?? JSON.stringify(this.cache.get(name) ?? {})

    if (clear) {
      this.cache.evict(name)
    }
    else {
      const parsed = JSON.parse(configData)
      this.cache.set(name, parsed)
      // Mark as dirty to trigger persist
      this.cache.markDirty(name)
    }

    // Broadcast update to all windows
    setImmediate(() => {
      broadcastUpdate(name)
    })

    return true
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
      console.warn(chalk.yellow(`[StorageModule] Attempted to save non-existent config: ${name}`))
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

  setupListeners() {
    const channel = $app.channel

    channel.regChannel(ChannelType.MAIN, 'storage:get', ({ data }) => {
      if (!data || typeof data !== 'string')
        return {}
      return this.getConfig(data)
    })

    channel.regChannel(ChannelType.MAIN, 'storage:save', ({ data }) => {
      if (!data || typeof data !== 'object')
        return false
      const { key, content, clear } = data
      if (typeof key !== 'string')
        return false
      return this.saveConfig(key, content, clear)
    })

    channel.regChannel(ChannelType.MAIN, 'storage:reload', ({ data }) => {
      if (!data || typeof data !== 'string')
        return {}
      const result = this.reloadConfig(data)
      broadcastUpdate(data)
      return result
    })

    channel.regChannel(ChannelType.MAIN, 'storage:saveall', async () => {
      await this.pollingService.forceSave()
    })
  }
}

const storageModule = new StorageModule()

export { storageModule }

export const getConfig = (name: string) => storageModule.getConfig(name)
export const saveConfig = storageModule.saveConfig.bind(storageModule)
