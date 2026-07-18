import type { ModuleInitContext, ModuleKey } from '@talex-touch/utils'
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
import { resolveMainRuntime } from '../../core/runtime-accessor'
import { appTaskGate } from '../../service/app-task-gate'
import { enterPerfContext } from '../../utils/perf-context'
import { BaseModule } from '../abstract-base-module'
import { databaseModule } from '../database'
import { mainStorageRegistry, resolveMainStorageValue } from './main-storage-registry'
import { ApplicationConfigRepository, type AppConfigRecord } from './app-config-repository'
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

function persistenceFingerprint(serialized: string, deleted: boolean): string {
  return `${deleted ? 'deleted' : 'active'}:${serialized}`
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
 * - In-memory caching to keep synchronous application-config reads
 * - Periodic persistence through the selected SQLite/legacy backend
 * - LRU-based automatic eviction
 * - Frequency monitoring with warnings
 */
export type StorageReadiness =
  | { state: 'pending' }
  | { state: 'ready' }
  | { state: 'failed'; reason: 'storage-init-failed'; recoverable: false }

export type StorageReadinessListener = (readiness: StorageReadiness) => void

class StorageReadinessController {
  private state: StorageReadiness = { state: 'pending' }
  private waitPromise!: Promise<StorageReadiness>
  private resolveWait!: (readiness: StorageReadiness) => void
  private readonly listeners = new Set<StorageReadinessListener>()

  constructor() {
    this.resetWaiter()
  }

  begin(): void {
    if (this.state.state !== 'pending') {
      this.resetWaiter()
    }
    this.setState({ state: 'pending' })
  }

  markReady(): void {
    this.setTerminalState({ state: 'ready' })
  }

  markFailed(): void {
    this.setTerminalState({
      state: 'failed',
      reason: 'storage-init-failed',
      recoverable: false
    })
  }

  getSnapshot(): StorageReadiness {
    return this.state
  }

  waitUntilReady(): Promise<StorageReadiness> {
    return this.waitPromise
  }

  subscribe(listener: StorageReadinessListener): () => void {
    this.listeners.add(listener)
    listener(this.state)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private resetWaiter(): void {
    this.waitPromise = new Promise<StorageReadiness>((resolve) => {
      this.resolveWait = resolve
    })
  }

  private setTerminalState(readiness: Exclude<StorageReadiness, { state: 'pending' }>): void {
    this.setState(readiness)
    this.resolveWait(readiness)
  }

  private setState(readiness: StorageReadiness): void {
    if (
      this.state.state === readiness.state &&
      (this.state.state !== 'failed' ||
        (readiness.state === 'failed' &&
          this.state.reason === readiness.reason &&
          this.state.recoverable === readiness.recoverable))
    ) {
      return
    }

    this.state = readiness
    for (const listener of this.listeners) {
      try {
        listener(readiness)
      } catch (error) {
        storageLog.warn('Storage readiness listener failed', { error })
      }
    }
  }
}

export class StorageModule extends BaseModule {
  static key: symbol = Symbol.for('Storage')
  name: ModuleKey = StorageModule.key

  private cache = new StorageCache()
  private pollingService: StoragePollingService
  private lruManager: StorageLRUManager
  private frequencyMonitor = new StorageFrequencyMonitor()
  private subscribers = new Map<string, Set<(data: object) => void>>()
  private hotConfigs = new Set<string>([
    StorageList.APP_SETTING,
    StorageList.ACCOUNT,
    StorageList.OPENERS
  ])
  private persistedContent = new Map<string, string>()
  private configRepository: ApplicationConfigRepository | null = null
  private deletedConfigs = new Set<string>()
  private transport: ITuffTransportMain | null = null
  private transportDisposers: Array<() => void> = []
  private updateStreams = new Set<StreamContext<StorageUpdateNotification>>()
  private isDestroying = false
  private readonly readiness = new StorageReadinessController()

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

  getReadiness(): StorageReadiness {
    return this.readiness.getSnapshot()
  }

  waitUntilReady(): Promise<StorageReadiness> {
    return this.readiness.waitUntilReady()
  }

  subscribeReadiness(listener: StorageReadinessListener): () => void {
    return this.readiness.subscribe(listener)
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
    this.readiness.begin()
    this.isDestroying = false

    try {
      pluginConfigPath = path.join(file.dirPath!, 'plugins')
      fse.ensureDirSync(pluginConfigPath)
      storageLog.info(`Config path: ${file.dirPath}, plugin path: ${pluginConfigPath}`)

      this.configRepository = new ApplicationConfigRepository({
        client: databaseModule.getClient(),
        legacyRoot: file.dirPath!
      })
      const initialization = await this.configRepository.initialize()
      this.hydrateConfigRecords(initialization.records)

      this.pollingService.start()
      this.lruManager.startCleanup()

      const channel = resolveMainRuntime({ app }, 'StorageModule.onInit').channel
      this.transport = getTuffTransportMain(channel, resolveKeyManager(channel))
      this.registerTransportHandlers()

      storageUpdateEmitter = (name, version) => {
        this.emitStorageUpdate(name, version)
      }

      await this.runStartupMigrations(file.dirPath!)
      this.getConfig(StorageList.APP_SETTING)
      this.warmupConfig(StorageList.ACCOUNT)
      this.readiness.markReady()
    } catch (error) {
      this.readiness.markFailed()
      throw error
    }
  }

  async onDestroy(): Promise<void> {
    this.readiness.begin()
    this.isDestroying = true
    await this.pollingService.stop()
    await this.configRepository?.flush()
    this.lruManager.stopCleanup()
    this.cache.clear()
    this.persistedContent.clear()
    this.deletedConfigs.clear()
    this.configRepository = null
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

  private hydrateConfigRecords(records: AppConfigRecord[]): void {
    for (const record of records) {
      const normalizedResult = this.normalizeAppSettingPayload(record.key, record.data)
      const serialized = normalizedResult.changed ? undefined : record.serialized
      this.cache.setWithVersion(
        record.key,
        normalizedResult.normalized,
        record.revision,
        serialized
      )
      this.persistedContent.set(
        record.key,
        persistenceFingerprint(record.serialized, record.deleted)
      )
      if (record.deleted) {
        this.deletedConfigs.add(record.key)
        continue
      }
      this.deletedConfigs.delete(record.key)
      if (normalizedResult.changed) {
        this.cache.markDirty(record.key)
        this.pollingService.notifyConfigChanged(record.key)
      }
    }
  }

  private async runStartupMigrations(markerDir: string): Promise<void> {
    await runStartupMigration({
      id: 'search-engine-logs-app-setting',
      version: 1,
      markerDir,
      run: async () => {
        const rawAppSetting = this.getConfig(StorageList.APP_SETTING)
        const rawHistoricalSetting = this.getConfig(StorageList.SEARCH_ENGINE_LOGS_ENABLED)
        const migration = buildSearchEngineLogsSettingMigrationPlan(
          rawAppSetting,
          rawHistoricalSetting
        )

        if (migration.writeAppSetting) {
          this.saveConfig(StorageList.APP_SETTING, migration.nextAppSetting, false, true)
          await this.persistConfig(StorageList.APP_SETTING)
          this.cache.clearDirty(StorageList.APP_SETTING)
        }

        if (migration.removeHistoricalSetting) {
          this.saveConfig(StorageList.SEARCH_ENGINE_LOGS_ENABLED, {}, true, true)
          await this.persistConfig(StorageList.SEARCH_ENGINE_LOGS_ENABLED)
          this.cache.clearDirty(StorageList.SEARCH_ENGINE_LOGS_ENABLED)
        }

        return {
          changed: migration.writeAppSetting || migration.removeHistoricalSetting
        }
      }
    })
  }

  public getCacheStats(): {
    cachedConfigs: number
    pluginConfigs: number
    dirtyConfigs: number
    backend: 'sqlite' | 'legacy' | 'uninitialized'
  } {
    return {
      cachedConfigs: this.cache.size(),
      pluginConfigs: this.pluginConfigs.size,
      dirtyConfigs: this.cache.getDirtyConfigs().length,
      backend: this.configRepository?.getBackend() ?? 'uninitialized'
    }
  }

  private warmupConfig(name: StorageList): void {
    try {
      this.getConfig(name)
    } catch (error) {
      storageLog.warn(`Failed to warm up config ${name}`, { error })
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
        if (this.isDestroying) {
          context.end()
          return
        }
        this.updateStreams.add(context)
      })
    )
  }

  /**
   * Get configuration data
   * @param name - Configuration name
   * @returns Configuration data (deep copy)
   */
  /**
   * Resolve a config key to a legacy mirror path while rejecting traversal.
   * The same validation protects SQLite keys arriving from IPC callers, so a
   * key like `../../x` cannot escape the application-config namespace.
   */
  private resolveConfigPath(name: string): string {
    if (!this.filePath) throw new Error(`Config path not set (name=${name})`)
    if (
      typeof name !== 'string' ||
      name.length === 0 ||
      name.includes('\0') ||
      name.includes('\\') ||
      path.posix.isAbsolute(name) ||
      path.win32.isAbsolute(name)
    ) {
      throw new Error(`Invalid config name: ${JSON.stringify(name)}`)
    }

    const segments = name.split('/')
    if (segments.some((segment) => segment.length === 0 || segment === '.' || segment === '..')) {
      throw new Error(`Invalid config name: ${JSON.stringify(name)}`)
    }

    const resolved = path.resolve(this.filePath, ...segments)
    const rel = path.relative(this.filePath, resolved)
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`Config name escapes storage directory: ${JSON.stringify(name)}`)
    }
    return resolved
  }

  getConfig(name: string): object {
    if (!this.filePath) throw new Error(`Config ${name} not found! Path not set: ${this.filePath}`)
    this.resolveConfigPath(name)
    if (!this.configRepository) throw new Error('Configuration repository is not initialized')

    const isHot = this.hotConfigs.has(name)
    if (!isHot) {
      this.frequencyMonitor.trackGet(name)
    }
    const reloadRequested = !isHot && this.cache.isInvalidated(name)
    if (reloadRequested) {
      this.cache.evict(name)
      this.cache.clearInvalidated(name)
    }

    if (this.cache.has(name)) {
      return this.cache.get(name)!
    }
    const record = reloadRequested
      ? this.configRepository.reloadRecord(name)
      : this.configRepository.getRecord(name)
    let file = record?.deleted ? {} : (record?.data ?? {})
    let serialized = record?.serialized
    const revision = record?.revision ?? 1
    const normalizedResult = this.normalizeAppSettingPayload(name, file)
    file = normalizedResult.normalized
    if (normalizedResult.changed) {
      serialized = undefined
    }

    this.cache.setWithVersion(name, file, revision, serialized)
    if (record) {
      this.persistedContent.set(name, persistenceFingerprint(record.serialized, record.deleted))
      if (record.deleted) this.deletedConfigs.add(name)
      else this.deletedConfigs.delete(name)
    } else {
      this.deletedConfigs.delete(name)
    }
    if (normalizedResult.changed && !record?.deleted) {
      this.cache.markDirty(name)
      this.pollingService.notifyConfigChanged(name)
    }

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
    this.resolveConfigPath(name)
    if (!this.configRepository) throw new Error('Configuration repository is not initialized')

    this.cache.evict(name)

    this.configRepository.reloadRecord(name)
    this.cache.clearInvalidated(name)
    return this.getConfig(name)
  }

  /**
   * Invalidate cache for a specific config
   * Next getConfig call reloads from the active repository snapshot
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
    this.resolveConfigPath(name)

    const disposeSave = enterPerfContext(`Storage.save:${name}`, {
      payloadType: typeof payload,
      payloadBytes: typeof payload === 'string' ? payload.length : undefined,
      clear: Boolean(clear),
      force: Boolean(force)
    })

    try {
      this.frequencyMonitor.trackSave(name)

      if (clear) {
        const newVersion = this.cache.set(name, {}, true, '{}')
        this.deletedConfigs.add(name)
        this.pollingService.notifyConfigChanged(name)
        setImmediate(() => {
          broadcastUpdate(name, newVersion, sourceWebContentsId)
        })
        this.notifySubscribers(name)
        return { success: true, version: newVersion }
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
      if (!force && !this.deletedConfigs.has(name)) {
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
      this.deletedConfigs.delete(name)
      this.pollingService.notifyConfigChanged(name)
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
   * Persist config to the active primary backend (called by polling service)
   */
  private async persistConfig(name: string): Promise<number> {
    if (!this.configRepository) {
      throw new Error('Configuration repository is not initialized')
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
      return this.cache.getVersion(name)
    }

    const cachedSerialized = this.cache.getSerialized(name)
    const configData = cachedSerialized ?? JSON.stringify(data)
    if (!cachedSerialized) {
      this.cache.setSerialized(name, configData)
    }
    const revision = this.cache.getVersion(name)
    const deleted = this.deletedConfigs.has(name)
    const fingerprint = persistenceFingerprint(configData, deleted)
    if (this.persistedContent.get(name) === fingerprint) {
      return revision
    }

    const disposePersist = enterPerfContext(`Storage.persist:${name}`, {
      bytes: configData.length,
      backend: this.configRepository.getBackend(),
      deleted
    })
    const persistStart = performance.now()
    try {
      await this.configRepository.persist({
        key: name,
        serialized: configData,
        revision,
        deleted
      })
      this.persistedContent.set(name, fingerprint)
      return revision
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

  async persistConfigNow(name: string): Promise<void> {
    if (!this.cache.has(name)) {
      this.getConfig(name)
    }
    const revision = await this.persistConfig(name)
    if (this.cache.getVersion(name) === revision) {
      this.cache.clearDirty(name)
    }
  }

  /**
   * Evict config from cache (called by LRU manager)
   * Saves dirty configs before eviction
   */
  private async evictConfig(name: string): Promise<void> {
    if (this.cache.isDirty(name)) {
      const revision = await this.persistConfig(name)
      if (this.cache.getVersion(name) === revision) {
        this.cache.clearDirty(name)
      }
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

export type OnboardingGateDecision =
  | { state: 'allowed' }
  | { state: 'blocked'; reason: 'onboarding-incomplete'; recoverable: true }
  | {
      state: 'degraded'
      reason: 'storage-pending' | 'storage-init-failed' | 'onboarding-read-failed'
      recoverable: boolean
    }

export type OnboardingGateListener = (decision: OnboardingGateDecision) => void

function isSameOnboardingDecision(
  left: OnboardingGateDecision | null,
  right: OnboardingGateDecision
): boolean {
  if (!left || left.state !== right.state) return false
  if (left.state === 'allowed' && right.state === 'allowed') return true
  if (left.state === 'blocked' && right.state === 'blocked') {
    return left.reason === right.reason && left.recoverable === right.recoverable
  }
  return (
    left.state === 'degraded' &&
    right.state === 'degraded' &&
    left.reason === right.reason &&
    left.recoverable === right.recoverable
  )
}

export class OnboardingGateError extends Error {
  readonly code = 'SEARCH_ONBOARDING_GATE_BLOCKED'

  constructor(readonly decision: Exclude<OnboardingGateDecision, { state: 'allowed' }>) {
    super(`Search admission blocked: ${decision.reason}`)
    this.name = 'OnboardingGateError'
  }
}

export class OnboardingGate {
  private readonly listeners = new Set<OnboardingGateListener>()
  private readinessUnsubscribe: (() => void) | null = null
  private settingUnsubscribe: (() => void) | null = null
  private lastDecision: OnboardingGateDecision | null = null

  constructor(private readonly storage: StorageModule) {}

  evaluate(): OnboardingGateDecision {
    const readiness = this.storage.getReadiness()
    if (readiness.state === 'pending') {
      return { state: 'degraded', reason: 'storage-pending', recoverable: true }
    }
    if (readiness.state === 'failed') {
      return {
        state: 'degraded',
        reason: readiness.reason,
        recoverable: readiness.recoverable
      }
    }

    try {
      const setting = this.storage.getConfig(StorageList.APP_SETTING)
      const beginner =
        setting && typeof setting === 'object' && 'beginner' in setting
          ? (setting as { beginner?: unknown }).beginner
          : undefined
      if (
        beginner &&
        typeof beginner === 'object' &&
        'init' in beginner &&
        beginner.init === true
      ) {
        return { state: 'allowed' }
      }
      return { state: 'blocked', reason: 'onboarding-incomplete', recoverable: true }
    } catch {
      return { state: 'degraded', reason: 'onboarding-read-failed', recoverable: true }
    }
  }

  async waitForDecision(): Promise<OnboardingGateDecision> {
    await this.storage.waitUntilReady()
    return this.evaluate()
  }

  async retry(): Promise<OnboardingGateDecision> {
    const readiness = this.storage.getReadiness()
    if (readiness.state === 'pending') {
      await this.storage.waitUntilReady()
    }
    const decision = this.evaluate()
    this.publish(decision)
    return decision
  }

  subscribe(listener: OnboardingGateListener): () => void {
    this.listeners.add(listener)
    if (this.listeners.size === 1) {
      this.startObserving()
    } else {
      listener(this.evaluate())
    }

    return () => {
      this.listeners.delete(listener)
      if (this.listeners.size === 0) {
        this.stopObserving()
      }
    }
  }

  private startObserving(): void {
    this.readinessUnsubscribe = this.storage.subscribeReadiness((readiness) => {
      if (readiness.state === 'ready') {
        this.ensureSettingSubscription()
      } else {
        this.clearSettingSubscription()
      }
      this.publish(this.evaluate())
    })
  }

  private stopObserving(): void {
    this.readinessUnsubscribe?.()
    this.readinessUnsubscribe = null
    this.clearSettingSubscription()
    this.lastDecision = null
  }

  private ensureSettingSubscription(): void {
    if (this.settingUnsubscribe) return
    this.settingUnsubscribe = this.storage.subscribe(StorageList.APP_SETTING, () => {
      this.publish(this.evaluate())
    })
  }

  private clearSettingSubscription(): void {
    this.settingUnsubscribe?.()
    this.settingUnsubscribe = null
  }

  private publish(decision: OnboardingGateDecision): void {
    if (isSameOnboardingDecision(this.lastDecision, decision)) return
    this.lastDecision = decision
    for (const listener of this.listeners) {
      try {
        listener(decision)
      } catch (error) {
        storageLog.warn('Onboarding gate listener failed', { error })
      }
    }
  }
}

const storageModule = new StorageModule()
const onboardingGate = new OnboardingGate(storageModule)

export { onboardingGate, storageModule }

export function getMainStorageReadiness(): StorageReadiness {
  return storageModule.getReadiness()
}

export function waitForMainStorageReady(): Promise<StorageReadiness> {
  return storageModule.waitUntilReady()
}

export function subscribeMainStorageReadiness(listener: StorageReadinessListener): () => void {
  return storageModule.subscribeReadiness(listener)
}

export function isMainStorageReady(): boolean {
  return storageModule.getReadiness().state === 'ready'
}

export function useMainStorage(): StorageModule {
  const readiness = storageModule.getReadiness()
  if (readiness.state !== 'ready') {
    const error = new Error(`StorageModule not ready: ${readiness.state}`)
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

export function persistMainConfig<K extends MainStorageKey>(key: K): Promise<void> {
  const entry = mainStorageRegistry[key]
  return useMainStorage().persistConfigNow(entry.key)
}
export { mainStorageRegistry }
export type { MainStorageKey, MainStorageSchema } from './main-storage-registry'
