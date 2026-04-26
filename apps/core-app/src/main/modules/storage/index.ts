import type { AppSetting, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { ITuffTransportMain, StreamContext } from '@talex-touch/utils/transport/main'
import type {
  StorageSaveRequest,
  StorageUpdateNotification
} from '@talex-touch/utils/transport/events/types'
import type { TalexEvents } from '../../core/eventbus/touch-event'
import type { MainStorageKey, MainStorageSchema } from './main-storage-registry'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { StorageList } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { StorageEvents } from '@talex-touch/utils/transport/events'
import fse from 'fs-extra'
import { runStartupMigration } from '../../core/startup-migrations'
import { appTaskGate } from '../../service/app-task-gate'
import { enterPerfContext } from '../../utils/perf-context'
import { BaseModule } from '../abstract-base-module'
import {
  mainStorageRegistry,
  removeLegacyLayoutOpacity,
  resolveMainStorageValue
} from './main-storage-registry'
import { buildSearchEngineLogsSettingMigrationPlan } from './search-engine-logs-setting-transfer'
import { StorageCache } from './storage-cache'
import { StorageFrequencyMonitor } from './storage-frequency-monitor'
import { StorageLRUManager } from './storage-lru-manager'
import { StoragePollingService } from './storage-polling-service'

const storageLog = getLogger('storage')

let pluginConfigPath: string

// Debounced broadcast mechanism to batch updates
const pendingBroadcasts = new Map<string, NodeJS.Timeout>()
const resolveKeyManager = (channel: unknown): unknown =>
  (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
let storageUpdateEmitter: ((name: string, version: number) => void) | null = null

const STORAGE_PERSIST_GATE_WAIT_MAX_MS = 250
const STORAGE_PERSIST_GATE_WAIT_WARN_MS = 1_000

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch {
    return '[unserializable]'
  }
}

/**
 * Broadcast storage update to all windows
 * @param name - Configuration name
 * @param version - Current version number
 * @param sourceWebContentsId - WebContents ID of the source window (to exclude from broadcast)
 */
function broadcastUpdate(name: string, version: number, sourceWebContentsId?: number) {
  void sourceWebContentsId
  // Cancel previous broadcast for this config
  const existing = pendingBroadcasts.get(name)
  if (existing) {
    clearTimeout(existing)
  }

  // Debounce broadcasts to reduce IPC overhead
  const timer = setTimeout(() => {
    storageUpdateEmitter?.(name, version)
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
  private hotConfigs = new Set<string>([StorageList.APP_SETTING, StorageList.OPENERS])
  private persistedContent = new Map<string, string>()
  private transport: ITuffTransportMain | null = null
  private transportDisposers: Array<() => void> = []
  private updateStreams = new Set<StreamContext<StorageUpdateNotification>>()

  pluginConfigs = new Map<string, object>()
  PLUGIN_CONFIG_MAX_SIZE = 10 * 1024 * 1024 // 10MB

  constructor() {
    super(StorageModule.key, {
      create: true,
      dirName: 'config'
    })

    this.pollingService = new StoragePollingService(
      this.cache,
      async (name) => await this.persistConfig(name)
    )

    this.lruManager = new StorageLRUManager(
      this.cache,
      async (name) => await this.evictConfig(name),
      60000, // evictionTimeout
      30000, // cleanupInterval
      this.hotConfigs // Pass hot configs to LRU manager
    )
  }

  private normalizeAppSettingPayload(
    name: string,
    value: unknown
  ): { normalized: object; changed: boolean } {
    if (name !== StorageList.APP_SETTING) {
      return { normalized: (value ?? {}) as object, changed: false }
    }

    const normalized = resolveMainStorageValue(StorageList.APP_SETTING as MainStorageKey, value)
    const changed = safeJsonStringify(value) !== safeJsonStringify(normalized)
    return {
      normalized: normalized as unknown as object,
      changed
    }
  }

  async onInit({ file, app }: ModuleInitContext<TalexEvents>): Promise<void> {
    pluginConfigPath = path.join(file.dirPath!, 'plugins')
    fse.ensureDirSync(pluginConfigPath)
    storageLog.info(`Config path: ${file.dirPath}, plugin path: ${pluginConfigPath}`)

    this.pollingService.start()
    this.lruManager.startCleanup()

    const channel =
      (app as { channel?: unknown } | null | undefined)?.channel ??
      ($app as { channel?: unknown } | null | undefined)?.channel
    this.transport = getTuffTransportMain(channel, resolveKeyManager(channel))
    this.registerTransportHandlers()

    storageUpdateEmitter = (name, version) => {
      this.emitStorageUpdate(name, version)
    }

    await this.runStartupMigrations(file.dirPath!)
  }

  async onDestroy(): Promise<void> {
    await this.pollingService.stop()
    this.lruManager.stopCleanup()
    this.cache.clear()
    this.persistedContent.clear()
    this.pluginConfigs.clear()
    for (const stream of Array.from(this.updateStreams)) {
      if (!stream.isCancelled()) {
        stream.end()
      }
    }
    this.updateStreams.clear()
    for (const dispose of this.transportDisposers) {
      try {
        dispose()
      } catch {
        // ignore cleanup errors
      }
    }
    this.transportDisposers = []
    this.transport = null
    storageUpdateEmitter = null
    storageLog.info('Shutdown complete')
  }

  public emitStorageUpdate(name: string, version?: number): void {
    if (this.updateStreams.size === 0) {
      return
    }

    const payload: StorageUpdateNotification = {
      key: name,
      timestamp: Date.now(),
      version,
      source: 'local'
    }

    for (const stream of Array.from(this.updateStreams)) {
      if (stream.isCancelled()) {
        this.updateStreams.delete(stream)
        continue
      }
      stream.emit(payload)
    }
  }

  private async runStartupMigrations(markerDir: string): Promise<void> {
    await runStartupMigration({
      id: 'legacy-layout-opacity',
      version: 1,
      markerDir,
      run: async () => {
        const current = resolveMainStorageValue(
          StorageList.APP_SETTING as MainStorageKey,
          this.getConfig(StorageList.APP_SETTING)
        ) as AppSetting
        const fallback = resolveMainStorageValue(
          StorageList.APP_SETTING as MainStorageKey,
          undefined
        ) as AppSetting
        const cleaned = removeLegacyLayoutOpacity(current, fallback)
        if (!cleaned.changed) {
          return { changed: false }
        }

        this.saveConfig(StorageList.APP_SETTING, cleaned.normalized, false, true)
        return { changed: true }
      }
    })

    await runStartupMigration({
      id: 'search-engine-logs-app-setting',
      version: 1,
      markerDir,
      run: async () => {
        const appSettingPath = path.join(markerDir, StorageList.APP_SETTING)
        const historicalSettingPath = path.join(markerDir, StorageList.SEARCH_ENGINE_LOGS_ENABLED)
        const rawAppSetting = await this.readJsonConfig(appSettingPath)
        const rawHistoricalSetting = await this.readJsonConfig(historicalSettingPath)
        const migration = buildSearchEngineLogsSettingMigrationPlan(
          rawAppSetting,
          rawHistoricalSetting
        )

        if (migration.writeAppSetting) {
          this.saveConfig(StorageList.APP_SETTING, migration.nextAppSetting, false, true)
          await this.persistConfig(StorageList.APP_SETTING)
          this.cache.clearDirty(StorageList.APP_SETTING)
        }

        if (migration.removeHistoricalSetting && (await fse.pathExists(historicalSettingPath))) {
          await fse.remove(historicalSettingPath)
          this.cache.evict(StorageList.SEARCH_ENGINE_LOGS_ENABLED)
          this.persistedContent.delete(StorageList.SEARCH_ENGINE_LOGS_ENABLED)
        }

        return {
          changed: migration.writeAppSetting || migration.removeHistoricalSetting
        }
      }
    })
  }

  public getCacheStats(): { cachedConfigs: number; pluginConfigs: number } {
    return {
      cachedConfigs: this.cache.size(),
      pluginConfigs: this.pluginConfigs.size
    }
  }

  private async readJsonConfig(filePath: string): Promise<unknown> {
    if (!(await fse.pathExists(filePath))) {
      return undefined
    }

    try {
      return await fse.readJson(filePath)
    } catch (error) {
      storageLog.warn('Failed to read config during startup migration', {
        error,
        meta: { filePath }
      })
      return undefined
    }
  }

  private registerTransportHandlers(): void {
    if (!this.transport) {
      return
    }

    this.transportDisposers.push(
      this.transport.on(StorageEvents.app.get, (request) => {
        if (!request?.key || typeof request.key !== 'string') {
          return {}
        }
        return this.getConfig(request.key)
      })
    )

    this.transportDisposers.push(
      this.transport.on(StorageEvents.app.getVersioned, (request) => {
        if (!request?.key || typeof request.key !== 'string') {
          return null
        }
        return this.getConfigWithVersion(request.key)
      })
    )

    this.transportDisposers.push(
      this.transport.on(StorageEvents.app.set, (request, context) => {
        if (!request?.key || typeof request.key !== 'string') {
          return
        }
        this.saveConfig(
          request.key,
          request.value ?? {},
          false,
          false,
          context?.sender?.id,
          undefined
        )
      })
    )

    this.transportDisposers.push(
      this.transport.on(StorageEvents.app.save, (request: StorageSaveRequest, context) => {
        if (!request?.key || typeof request.key !== 'string') {
          return { success: false, version: 0 }
        }
        const payload = typeof request.content === 'string' ? request.content : request.value

        return this.saveConfig(
          request.key,
          payload,
          request.clear,
          request.force,
          context?.sender?.id,
          request.version
        )
      })
    )

    this.transportDisposers.push(
      this.transport.on(StorageEvents.app.delete, (request, context) => {
        if (!request?.key || typeof request.key !== 'string') {
          return
        }
        this.saveConfig(request.key, JSON.stringify({}), true, true, context?.sender?.id, undefined)
      })
    )

    this.transportDisposers.push(
      this.transport.onStream(StorageEvents.app.updated, (_payload, context) => {
        this.updateStreams.add(context)
      })
    )
  }

  /**
   * Get configuration data
   * @param name - Configuration name
   * @returns Configuration data (deep copy)
   */
  getConfig(name: string): object {
    if (!this.filePath) throw new Error(`Config ${name} not found! Path not set: ${this.filePath}`)

    // Hot configs skip invalidation check and always stay in cache
    const isHot = this.hotConfigs.has(name)
    if (!isHot) {
      this.frequencyMonitor.trackGet(name)
    }

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

    let serialized: string | undefined
    const disposeLoad = enterPerfContext(`Storage.load:${name}`, { source: 'disk' })
    const loadStart = performance.now()
    try {
      if (fse.existsSync(p)) {
        try {
          const content = fse.readFileSync(p, 'utf-8')
          // 只有当内容不是空字符串时才解析
          if (content.length > 0) {
            file = JSON.parse(content)
            serialized = content
          }
        } catch (error) {
          storageLog.error(`Failed to parse config ${name}`, { error })
        }
      }
    } finally {
      const duration = performance.now() - loadStart
      if (duration > 200) {
        storageLog.warn(`Slow config load for ${name}`, {
          meta: { durationMs: Math.round(duration) }
        })
      }
      disposeLoad()
    }

    const normalizedResult = this.normalizeAppSettingPayload(name, file)
    file = normalizedResult.normalized
    if (normalizedResult.changed) {
      serialized = undefined
    }

    // Use setWithVersion for initial load (version 1, not dirty)
    this.cache.setWithVersion(name, file, 1, serialized)
    if (serialized !== undefined) {
      this.persistedContent.set(name, serialized)
    } else {
      try {
        this.persistedContent.set(name, JSON.stringify(file))
      } catch {
        this.persistedContent.delete(name)
      }
    }
    if (normalizedResult.changed) {
      this.cache.markDirty(name)
    }

    // Return through cache.get() to ensure deep copy protection
    return this.cache.get(name)!
  }

  /**
   * Get configuration data with version info
   * @param name - Configuration name
   * @returns Configuration data with version, or null if not found
   */
  getConfigWithVersion(name: string): { data: object; version: number } | null {
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
    if (!this.filePath) throw new Error(`Config ${name} not found`)

    const filePath = path.resolve(this.filePath, name)
    let file = {}

    let serialized: string | undefined
    const disposeReload = enterPerfContext(`Storage.reload:${name}`, { source: 'disk' })
    const reloadStart = performance.now()
    try {
      const content = fse.readFileSync(filePath, 'utf-8')
      if (content.length > 0) {
        file = JSON.parse(content)
        serialized = content
      }
    } catch (error) {
      storageLog.error(`Failed to reload config ${name}`, { error })
    } finally {
      const duration = performance.now() - reloadStart
      if (duration > 200) {
        storageLog.warn(`Slow config reload for ${name}`, {
          meta: { durationMs: Math.round(duration) }
        })
      }
      disposeReload()
    }

    const normalizedResult = this.normalizeAppSettingPayload(name, file)
    file = normalizedResult.normalized
    if (normalizedResult.changed) {
      serialized = undefined
    }

    this.cache.set(name, file, true, serialized)
    if (serialized !== undefined) {
      this.persistedContent.set(name, serialized)
    } else {
      try {
        this.persistedContent.set(name, JSON.stringify(file))
      } catch {
        this.persistedContent.delete(name)
      }
    }
    if (!normalizedResult.changed) {
      this.cache.clearDirty(name)
    }
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
    payload?: string | unknown,
    clear?: boolean,
    force?: boolean,
    sourceWebContentsId?: number,
    clientVersion?: number
  ): { success: boolean; version: number; conflict?: boolean } {
    if (!this.filePath) throw new Error(`Config ${name} not found`)

    const disposeSave = enterPerfContext(`Storage.save:${name}`, {
      payloadType: typeof payload,
      payloadBytes: typeof payload === 'string' ? payload.length : undefined,
      clear: Boolean(clear),
      force: Boolean(force)
    })

    try {
      this.frequencyMonitor.trackSave(name)

      if (clear) {
        this.cache.evict(name)
        this.persistedContent.delete(name)
        return { success: true, version: 0 }
      }

      const currentVersion = this.cache.getVersion(name)
      let parsed: unknown
      let serialized: string | undefined

      if (typeof payload === 'string') {
        if (payload.length > 0) {
          try {
            parsed = JSON.parse(payload)
          } catch (error) {
            storageLog.error(`Failed to parse config payload for ${name}`, { error })
            return { success: false, version: currentVersion }
          }
          serialized = payload
        } else {
          parsed = {}
          serialized = '{}'
        }
      } else if (payload !== undefined) {
        parsed = payload
      } else {
        const cached = this.cache.getRaw(name)
        parsed = cached === undefined ? {} : cached
      }

      const normalizedResult = this.normalizeAppSettingPayload(name, parsed ?? {})
      parsed = normalizedResult.normalized
      if (normalizedResult.changed) {
        serialized = undefined
      }

      // Conflict detection: if client has older version, reject the save
      if (clientVersion !== undefined && clientVersion < currentVersion) {
        storageLog.warn(
          `Conflict detected for ${name}: client v${clientVersion} < server v${currentVersion}`
        )
        return { success: false, version: currentVersion, conflict: true }
      }

      // Smart deduplication: check if content actually changed (unless force=true)
      if (!force) {
        const cachedData = this.cache.getRaw(name)
        const cachedSerialized = serialized ? this.cache.getSerialized(name) : undefined
        if (serialized && cachedSerialized && cachedSerialized === serialized) {
          return { success: true, version: currentVersion }
        }
        if (cachedData && JSON.stringify(cachedData) === JSON.stringify(parsed)) {
          // Content hasn't changed, skip save but return current version
          return { success: true, version: currentVersion }
        }
      }

      // Set new data and get new version
      const newVersion = this.cache.set(name, parsed as object, true, serialized)
      // Broadcast update to other windows (exclude source)
      setImmediate(() => {
        broadcastUpdate(name, newVersion, sourceWebContentsId)
      })

      // Notify local subscribers
      this.notifySubscribers(name)

      return { success: true, version: newVersion }
    } finally {
      disposeSave()
    }
  }

  /**
   * Persist config to disk (called by polling service)
   */
  private async persistConfig(name: string): Promise<void> {
    if (!this.filePath) {
      throw new Error(`Config path not found!`)
    }

    const gateStart = performance.now()
    const becameIdle = await appTaskGate.waitForIdle(STORAGE_PERSIST_GATE_WAIT_MAX_MS)
    const gateWaitMs = performance.now() - gateStart
    if (!becameIdle && appTaskGate.isActive()) {
      storageLog.debug(`persistConfig continue with active app task for ${name}`, {
        meta: {
          gateWaitMs: Math.round(gateWaitMs),
          timeoutMs: STORAGE_PERSIST_GATE_WAIT_MAX_MS
        }
      })
    } else if (gateWaitMs > STORAGE_PERSIST_GATE_WAIT_WARN_MS) {
      storageLog.warn(`persistConfig gate wait for ${name}`, {
        meta: { gateWaitMs: Math.round(gateWaitMs) }
      })
    }

    const data = this.cache.getRaw(name)
    if (data === undefined) {
      storageLog.warn(`Attempted to save non-existent config: ${name}`)
      return
    }

    const cachedSerialized = this.cache.getSerialized(name)
    const configData = cachedSerialized ?? JSON.stringify(data)
    if (!cachedSerialized) {
      this.cache.setSerialized(name, configData)
    }
    const lastPersisted = this.persistedContent.get(name)
    if (lastPersisted === configData) {
      return
    }
    const p = path.join(this.filePath, name)

    const disposePersist = enterPerfContext(`Storage.persist:${name}`, {
      bytes: configData.length
    })
    const persistStart = performance.now()
    try {
      await fse.ensureFile(p)
      await fse.writeFile(p, configData, 'utf-8')
      this.persistedContent.set(name, configData)
    } finally {
      const duration = performance.now() - persistStart
      if (duration > 200) {
        storageLog.warn(`Slow config persist for ${name}`, {
          meta: { durationMs: Math.round(duration) }
        })
      }
      disposePersist()
    }
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
   *   handleConfigUpdate(data)
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
      } catch (error) {
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
      } catch (error) {
        storageLog.error(`Subscriber callback error for "${name}"`, { error })
      }
    })
  }
}

const storageModule = new StorageModule()

export { storageModule }

export function isMainStorageReady(): boolean {
  return Boolean(storageModule.filePath)
}

export function useMainStorage(): StorageModule {
  if (!storageModule.filePath) {
    const error = new Error('StorageModule not ready: filePath not set')
    if (Error.captureStackTrace) {
      Error.captureStackTrace(error, useMainStorage)
    }
    throw error
  }
  return storageModule
}

export interface MainStorageSaveOptions {
  clear?: boolean
  force?: boolean
  sourceWebContentsId?: number
  version?: number
}

export function getMainConfig<K extends MainStorageKey>(key: K): MainStorageSchema[K] {
  const entry = mainStorageRegistry[key]
  const raw = useMainStorage().getConfig(entry.key)
  return resolveMainStorageValue(key, raw)
}

export function saveMainConfig<K extends MainStorageKey>(
  key: K,
  value: MainStorageSchema[K],
  options?: MainStorageSaveOptions
) {
  const entry = mainStorageRegistry[key]
  return useMainStorage().saveConfig(
    entry.key,
    value,
    options?.clear,
    options?.force,
    options?.sourceWebContentsId,
    options?.version
  )
}

export function subscribeMainConfig<K extends MainStorageKey>(
  key: K,
  callback: (value: MainStorageSchema[K]) => void
): () => void {
  const entry = mainStorageRegistry[key]
  return useMainStorage().subscribe(entry.key, (value) => {
    callback(resolveMainStorageValue(key, value))
  })
}

export const getConfig = (name: string) => useMainStorage().getConfig(name)
export function saveConfig(...args: Parameters<StorageModule['saveConfig']>) {
  return useMainStorage().saveConfig(...args)
}
export { mainStorageRegistry }
export type { MainStorageKey, MainStorageSchema } from './main-storage-registry'
