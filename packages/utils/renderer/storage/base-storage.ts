import {
  reactive,
  watch,
  type UnwrapNestedRefs,
  type WatchHandle,
} from 'vue';
import { useDebounceFn } from '@vueuse/core'
import type { ITouchClientChannel } from '../../channel';

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
  send(event: string, payload: unknown): Promise<unknown>;

  /**
   * Synchronous send interface
   * @param event Event name
   * @param payload Event payload
   */
  sendSync(event: string, payload: unknown): unknown;
}

let channel: IStorageChannel | null = null;

/**
 * Queue of initialization callbacks waiting for channel initialization
 */
const pendingInitializations: Array<() => void> = [];

/**
 * Initializes the global channel for communication.
 * Processes all pending storage initializations after initialization.
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
  channel = c;

  // Process all pending storage initializations
  for (const initFn of pendingInitializations) {
    initFn();
  }

  // Clear the queue
  pendingInitializations.length = 0;
}

/**
 * Global registry of storage instances.
 */
export const storages = new Map<string, TouchStorage<any>>();

/**
 * A reactive storage utility with optional auto-save and update subscriptions.
 *
 * @template T Shape of the stored data.
 */
export class TouchStorage<T extends object> {
  readonly #qualifiedName: string;
  #autoSave = false;
  #autoSaveStopHandle?: WatchHandle;
  #assigning = false;
  readonly originalData: T;
  private readonly _onUpdate: Array<() => void> = [];
  #channelInitialized = false;

  /**
   * The reactive data exposed to users.
   */
  public data: UnwrapNestedRefs<T>;

  /**
   * Creates a new reactive storage instance.
   * If channel is not initialized, the instance will be queued for initialization.
   *
   * @param qName Globally unique name for the instance
   * @param initData Initial data to populate the storage
   * @param onUpdate Optional callback when data is updated
   *
   * @example
   * ```ts
   * const settings = new TouchStorage('settings', { darkMode: false });
   * ```
   */
  constructor(qName: string, initData: T, onUpdate?: () => void) {
    if (storages.has(qName)) {
      throw new Error(`Storage "${qName}" already exists`);
    }

    this.#qualifiedName = qName;
    this.originalData = initData;
    this.data = reactive({ ...initData }) as UnwrapNestedRefs<T>;

    if (onUpdate) this._onUpdate.push(onUpdate);

    // Register to storages map immediately
    storages.set(qName, this);

    // Initialize channel-dependent operations
    if (channel) {
      this.#initializeChannel();
    } else {
      // Queue initialization callback for later
      pendingInitializations.push(() => this.#initializeChannel());
    }
  }

  /**
   * Initialize channel-dependent operations
   */
  #initializeChannel(): void {
    if (this.#channelInitialized) {
      return;
    }

    if (!channel) {
      throw new Error(
        'TouchStorage: channel is not initialized. Please call initStorageChannel(...) before using.'
      );
    }

    this.#channelInitialized = true;

    // Load data from remote
    this.loadFromRemote();

    // Register update listener
    channel.regChannel('storage:update', ({ data }) => {
      const { name } = data!

      if (name === this.#qualifiedName) {
        this.loadFromRemote()
      }
    });

    if (this.#autoSave && !this.#autoSaveStopHandle) {
      this.#startAutoSaveWatcher();
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
    return this.#qualifiedName;
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
    return this.#autoSave;
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
      throw new Error("TouchStorage: channel not initialized");
    }

    if (this.#assigning && !options?.force) {
      console.debug("[Storage] Skip saveToRemote for", this.getQualifiedName());
      return;
    }

    console.debug("Storage saveToRemote triggered", this.getQualifiedName());

    await channel.send('storage:save', {
      key: this.#qualifiedName,
      content: JSON.stringify(this.data),
      clear: false,
    });
  }, 300);

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
    this.#autoSave = autoSave;

    this.#autoSaveStopHandle?.();
    this.#autoSaveStopHandle = undefined;

    if (autoSave) {
      if (this.#channelInitialized) {
        this.#startAutoSaveWatcher();
      } else {
        console.debug(
          "[Storage] Auto-save requested before channel initialization for",
          this.getQualifiedName(),
        );
      }
    }

    return this;
  }

  #startAutoSaveWatcher(): void {
    this.#autoSaveStopHandle = watch(
      this.data,
      () => {
        if (this.#assigning) {
          console.debug("[Storage] Skip auto-save watch handle for", this.getQualifiedName());
          return;
        }

        this._onUpdate.forEach((fn) => {
          try {
            fn();
          } catch (e) {
            console.error(`[TouchStorage] onUpdate error in "${this.#qualifiedName}":`, e);
          }
        });

        this.saveToRemote();
      },
      { deep: true, immediate: true },
    );
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
    this._onUpdate.push(fn);
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
    const index = this._onUpdate.indexOf(fn);
    if (index !== -1) {
      this._onUpdate.splice(index, 1);
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
   */
  private assignData(newData: Partial<T>, stopWatch: boolean = true): void {
    if (stopWatch && this.#autoSave) {
      this.#assigning = true;
      console.debug(`[Storage] Stop auto-save watch handle for ${this.getQualifiedName()}`);
    }

    Object.assign(this.data, newData);
    console.debug(`[Storage] Assign data to ${this.getQualifiedName()}`);

    if (stopWatch && this.#autoSave) {
      setTimeout(() => {
        this.#assigning = false;
        console.debug(`[Storage] Resume auto-save watch handle for ${this.getQualifiedName()}`);
      }, 0);
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
    this.assignData(data);
    return this;
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
      throw new Error("TouchStorage: channel not initialized");
    }

    const result = await channel.send('storage:reload', this.#qualifiedName);
    const parsed = result ? (result as Partial<T>) : {};
    this.assignData(parsed, true);

    return this;
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
      return this;
    }

    const result = channel.sendSync('storage:get', this.#qualifiedName)
    const parsed = result ? (result as Partial<T>) : {};
    this.assignData(parsed, true);

    return this;
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
    return this.data as T;
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
    this.assignData(newData as Partial<T>);
    return this;
  }
}
