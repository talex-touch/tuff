import type { UnwrapNestedRefs, WatchHandle } from 'vue'
import type { ITouchClientChannel } from '../../channel'
import { useDebounceFn } from '@vueuse/core'
import {
  reactive,

  watch,

} from 'vue'

/**
 * Interface representing the external communication channel.
 * Must be initialized before any `TouchStorage` instance is used.
 */
export interface IStorageChannel extends ITouchClientChannel {
  /**
   * Asynchronous send interface
   * @param event Event name
   * @param payload Event payload
   */
  send: (event: string, payload: unknown) => Promise<unknown>

  /**
   * Synchronous send interface
   * @param event Event name
   * @param payload Event payload
   */
  sendSync: (event: string, payload: unknown) => unknown
}

let channel: IStorageChannel | null = null

/**
 * Initializes the global channel for communication.
 * Must be called before creating any TouchStorage instances.
 *
 * @example
 * ```ts
 * import { initStorageChannel } from './TouchStorage';
 * import { ipcRenderer } from 'electron';
 *
 * initStorageChannel({
 *   send: ipcRenderer.invoke.bind(ipcRenderer),
 *   sendSync: ipcRenderer.sendSync.bind(ipcRenderer),
 * });
 * ```
 */
export function initStorageChannel(c: IStorageChannel): void {
  channel = c
}

/**
 * Global registry of storage instances.
 */
const GLOBAL_STORAGE_MAP_KEY = '__talex_touch_storages__'

type GlobalStorageMap = Map<string, TouchStorage<any>>

function getGlobalStorageMap(): GlobalStorageMap {
  const globalObj = globalThis as typeof globalThis & {
    [GLOBAL_STORAGE_MAP_KEY]?: GlobalStorageMap
  }
  if (!globalObj[GLOBAL_STORAGE_MAP_KEY]) {
    globalObj[GLOBAL_STORAGE_MAP_KEY] = new Map<string, TouchStorage<any>>()
  }
  return globalObj[GLOBAL_STORAGE_MAP_KEY]!
}

export const storages: GlobalStorageMap = getGlobalStorageMap()

const GLOBAL_SINGLETON_KEY = '__talex_touch_storage_singletons__'
type StorageSingletonMap = Map<string, unknown>

function getSingletonMap(): StorageSingletonMap {
  const globalObj = globalThis as typeof globalThis & {
    [GLOBAL_SINGLETON_KEY]?: StorageSingletonMap
  }
  if (!globalObj[GLOBAL_SINGLETON_KEY]) {
    globalObj[GLOBAL_SINGLETON_KEY] = new Map<string, unknown>()
  }
  return globalObj[GLOBAL_SINGLETON_KEY]!
}

/**
 * Retrieves an existing storage singleton registered on the global scope,
 * or creates it lazily when missing. Useful to avoid duplicate TouchStorage
 * instantiations under HMR or multi-renderer scenarios.
 */
export function getOrCreateStorageSingleton<T>(key: string, factory: () => T): T {
  const map = getSingletonMap()
  if (map.has(key)) {
    return map.get(key) as T
  }
  const instance = factory()
  map.set(key, instance)
  return instance
}

/**
 * Creates a proxy that lazily initializes a singleton storage instance and
 * ensures all method calls are bound to the real instance so private fields
 * stay accessible (Proxy `this` would otherwise break private member access).
 */
export function createStorageProxy<T extends object>(key: string, factory: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      const instance = getOrCreateStorageSingleton(key, factory)
      const property = (instance as Record<PropertyKey, unknown>)[prop as PropertyKey]
      return typeof property === 'function'
        ? property.bind(instance)
        : property
    },
  })
}

/**
 * Save result from main process
 */
export interface SaveResult {
  success: boolean
  version: number
  conflict?: boolean
}

/**
 * A reactive storage utility with optional auto-save and update subscriptions.
 *
 * @template T Shape of the stored data.
 */
export class TouchStorage<T extends object> {
  readonly #qualifiedName: string
  #autoSave = false
  #autoSaveStopHandle?: WatchHandle
  #assigning = false
  readonly originalData: T
  private readonly _onUpdate: Array<() => void> = []
  #channelInitialized = false
  #skipNextWatchTrigger = false
  #currentVersion = 0
  #isRemoteUpdate = false

  /**
   * The reactive data exposed to users.
   */
  public data: UnwrapNestedRefs<T>

  /**
   * Creates a new reactive storage instance.
   * IMPORTANT: `initStorageChannel()` must be called before creating any TouchStorage instances.
   *
   * @param qName Globally unique name for the instance
   * @param initData Initial data to populate the storage
   * @param onUpdate Optional callback when data is updated
   *
   * @throws {Error} If channel is not initialized or if storage with same name already exists
   *
   * @example
   * ```ts
   * // First initialize the channel
   * initStorageChannel(touchChannel);
   *
   * // Then create storage instances
   * const settings = new TouchStorage('settings', { darkMode: false });
   * ```
   */
  constructor(qName: string, initData: T, onUpdate?: () => void) {
    if (!channel) {
      throw new Error(
        `TouchStorage: Cannot create storage "${qName}" before channel is initialized. `
        + 'Please call initStorageChannel() first.',
      )
    }

    if (storages.has(qName)) {
      throw new Error(`Storage "${qName}" already exists`)
    }

    this.#qualifiedName = qName
    this.originalData = initData
    this.data = reactive({ ...initData }) as UnwrapNestedRefs<T>

    if (onUpdate)
      this._onUpdate.push(onUpdate)

    // Register to storages map immediately
    storages.set(qName, this)

    // Initialize channel-dependent operations immediately
    this.#initializeChannel()
  }

  /**
   * Initialize channel-dependent operations.
   * Called immediately in constructor after channel validation.
   */
  #initializeChannel(): void {
    if (this.#channelInitialized) {
      return
    }

    this.#channelInitialized = true

    // Try to get versioned data first, fallback to legacy
    const versionedResult = channel!.sendSync('storage:get-versioned', this.#qualifiedName) as { data: Partial<T>, version: number } | null
    if (versionedResult) {
      this.#currentVersion = versionedResult.version
      this.assignData(versionedResult.data, true, true)
    }
    else {
      const result = channel!.sendSync('storage:get', this.#qualifiedName)
      const parsed = result ? (result as Partial<T>) : {}
      this.#currentVersion = 1
      this.assignData(parsed, true, true)
    }

    // Register update listener - only triggered for OTHER windows' changes
    // (source window is excluded by main process)
    channel!.regChannel('storage:update', ({ data }) => {
      const { name, version } = data as { name: string, version?: number }

      if (name === this.#qualifiedName) {
        // Only reload if remote version is newer
        if (version === undefined || version > this.#currentVersion) {
          this.#loadFromRemoteWithVersion()
        }
      }
    })

    // Start auto-save watcher AFTER initial data load
    if (this.#autoSave && !this.#autoSaveStopHandle) {
      this.#startAutoSaveWatcher()
    }
  }

  /**
   * Load from remote and update version
   * @private
   */
  #loadFromRemoteWithVersion(): void {
    if (!channel)
      return

    const versionedResult = channel.sendSync('storage:get-versioned', this.#qualifiedName) as { data: Partial<T>, version: number } | null
    if (versionedResult && versionedResult.version > this.#currentVersion) {
      this.#currentVersion = versionedResult.version
      // Mark as remote update to skip auto-save
      this.#isRemoteUpdate = true
      this.assignData(versionedResult.data, true, true)
      this.#isRemoteUpdate = false
    }
  }

  /**
   * Returns the unique identifier of this storage.
   *
   * @example
   * ```ts
   * console.log(userStore.getQualifiedName()); // "user"
   * ```
   */
  getQualifiedName(): string {
    return this.#qualifiedName
  }

  /**
   * Checks whether auto-save is currently enabled.
   *
   * @example
   * ```ts
   * if (store.isAutoSave()) console.log("Auto-save is on!");
   * ```
   */
  isAutoSave(): boolean {
    return this.#autoSave
  }

  /**
   * Saves the current data to remote storage.
   *
   * @param options Optional configuration
   * @param options.force Force save even if data is being assigned
   *
   * @example
   * ```ts
   * await store.saveToRemote();
   * ```
   */
  saveToRemote = useDebounceFn(async (options?: { force?: boolean }): Promise<void> => {
    if (!channel) {
      throw new Error('TouchStorage: channel not initialized')
    }

    if (this.#assigning && !options?.force) {
      return
    }

    // Skip save if this is a remote update (to avoid echo)
    if (this.#isRemoteUpdate) {
      return
    }

    const result = await channel.send('storage:save', {
      key: this.#qualifiedName,
      content: JSON.stringify(this.data),
      clear: false,
      version: this.#currentVersion,
    }) as SaveResult

    if (result.success) {
      this.#currentVersion = result.version
    }
    else if (result.conflict) {
      // Conflict detected - reload from remote
      console.warn(`[TouchStorage] Conflict detected for "${this.#qualifiedName}", reloading...`)
      this.#loadFromRemoteWithVersion()
    }
  }, 300)

  /**
   * Enables or disables auto-saving.
   *
   * @param autoSave Whether to enable auto-saving
   * @returns The current instance for chaining
   *
   * @example
   * ```ts
   * store.setAutoSave(true);
   * ```
   */
  setAutoSave(autoSave: boolean): this {
    this.#autoSave = autoSave

    this.#autoSaveStopHandle?.()
    this.#autoSaveStopHandle = undefined

    if (autoSave && this.#channelInitialized) {
      this.#startAutoSaveWatcher()
    }

    return this
  }

  #startAutoSaveWatcher(): void {
    this.#autoSaveStopHandle = watch(
      this.data,
      () => {
        if (this.#assigning) {
          return
        }

        if (this.#skipNextWatchTrigger) {
          this.#skipNextWatchTrigger = false
          return
        }

        this.#runAutoSavePipeline()
      },
      { deep: true, immediate: true },
    )
  }

  #runAutoSavePipeline(options?: { force?: boolean }): void {
    this._onUpdate.forEach((fn) => {
      try {
        fn()
      }
      catch (e) {
        console.error(`[TouchStorage] onUpdate error in "${this.#qualifiedName}":`, e)
      }
    })

    this.saveToRemote(options)
  }

  /**
   * Registers a callback that runs when data changes (only triggered in auto-save mode).
   *
   * @param fn Callback function
   *
   * @example
   * ```ts
   * store.onUpdate(() => {
   *   console.log('Data changed');
   * });
   * ```
   */
  onUpdate(fn: () => void): void {
    this._onUpdate.push(fn)
  }

  /**
   * Removes a previously registered update callback.
   *
   * @param fn The same callback used in `onUpdate`
   *
   * @example
   * ```ts
   * const cb = () => console.log("Change!");
   * store.onUpdate(cb);
   * store.offUpdate(cb);
   * ```
   */
  offUpdate(fn: () => void): void {
    const index = this._onUpdate.indexOf(fn)
    if (index !== -1) {
      this._onUpdate.splice(index, 1)
    }
  }

  /**
   * Internal method to assign new values and trigger update events. (Debounced)
   *
   * @param newData Partial update data
   * @param stopWatch Whether to stop the watcher after assignment
   */
  assignDataDebounced = useDebounceFn(this.assignData.bind(this), 100)

  /**
   * Internal method to assign new values and trigger update events.
   *
   * @param newData Partial update data
   * @param stopWatch Whether to stop the watcher during assignment
   * @param skipSave Whether to skip saving (for remote updates)
   */
  private assignData(newData: Partial<T>, stopWatch: boolean = true, skipSave: boolean = false): void {
    if (stopWatch && this.#autoSave) {
      this.#assigning = true
    }

    Object.assign(this.data, newData)

    if (stopWatch && this.#autoSave) {
      this.#skipNextWatchTrigger = true
      const resetAssigning = () => {
        this.#assigning = false
      }

      if (typeof queueMicrotask === 'function') {
        queueMicrotask(resetAssigning)
      }
      else {
        Promise.resolve().then(resetAssigning)
      }

      // Only run auto-save pipeline if not a remote update
      if (!skipSave && !this.#isRemoteUpdate) {
        this.#runAutoSavePipeline({ force: true })
      }
    }
  }

  /**
   * Applies new data to the current storage instance. Use with caution.
   *
   * @param data Partial object to merge into current data
   * @returns The current instance for chaining
   *
   * @example
   * ```ts
   * store.applyData({ theme: 'dark' });
   * ```
   */
  applyData(data: Partial<T>): this {
    this.assignData(data)
    return this
  }

  /**
   * Reloads data from remote storage and applies it.
   *
   * @returns The current instance
   *
   * @example
   * ```ts
   * await store.reloadFromRemote();
   * ```
   */
  async reloadFromRemote(): Promise<this> {
    if (!channel) {
      throw new Error('TouchStorage: channel not initialized')
    }

    const result = await channel.send('storage:reload', this.#qualifiedName)
    const parsed = result ? (result as Partial<T>) : {}
    this.assignData(parsed, true)

    return this
  }

  /**
   * Loads data from remote storage and applies it.
   * If channel is not initialized yet, this method will do nothing.
   *
   * @returns The current instance
   *
   * @example
   * ```ts
   * store.loadFromRemote();
   * ```
   */
  loadFromRemote(): this {
    if (!channel) {
      // Channel not initialized yet, data will be loaded when channel is ready
      return this
    }

    this.#loadFromRemoteWithVersion()
    return this
  }

  /**
   * Get current version number
   * @returns Current version
   */
  getVersion(): number {
    return this.#currentVersion
  }

  /**
   * Save data synchronously (for window close)
   * This bypasses debouncing and saves immediately
   */
  saveSync(): void {
    if (!channel)
      return
    if (this.#isRemoteUpdate)
      return

    channel.sendSync('storage:save-sync', {
      key: this.#qualifiedName,
      content: JSON.stringify(this.data),
      clear: false,
      version: this.#currentVersion,
    })
  }

  /**
   * Gets the current data state.
   *
   * @returns Current data
   *
   * @example
   * ```ts
   * const currentData = store.get();
   * ```
   */
  get(): T {
    return this.data as T
  }

  /**
   * Sets the entire data state.
   *
   * @param newData New data to replace current state
   * @returns The current instance for chaining
   *
   * @example
   * ```ts
   * store.set({ theme: 'dark', lang: 'en' });
   * ```
   */
  set(newData: T): this {
    this.assignData(newData as Partial<T>)
    return this
  }
}
