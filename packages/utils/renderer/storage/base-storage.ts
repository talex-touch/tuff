import {
  reactive,
  watch,
  type UnwrapNestedRefs,
} from 'vue';

/**
 * Interface representing the external communication channel.
 * Must be initialized before any `TouchStorage` instance is used.
 */
export interface IStorageChannel {
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
 * Initializes the global channel for communication.
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
  #autoSaveStopHandle?: () => void;
  readonly originalData: T;
  private readonly _onUpdate: Array<() => void> = [];

  /**
   * The reactive data exposed to users.
   */
  public data: UnwrapNestedRefs<T>;

  /**
   * Creates a new reactive storage instance.
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
    if (!channel) {
      throw new Error(
        'TouchStorage: channel is not initialized. Please call initStorageChannel(...) before using.'
      );
    }

    this.#qualifiedName = qName;
    this.originalData = initData;

    const stored = (channel.sendSync('storage:get', qName) as Partial<T>) || {};
    this.data = reactive({ ...initData, ...stored }) as UnwrapNestedRefs<T>;

    if (onUpdate) this._onUpdate.push(onUpdate);

    storages.set(qName, this);
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

    this.#autoSaveStopHandle?.(); // stop previous watcher

    if (autoSave) {
      this.#autoSaveStopHandle = watch(
        this.data,
        async () => {
          this._onUpdate.forEach((fn) => {
            try {
              fn();
            } catch (e) {
              console.error(`[TouchStorage] onUpdate error in "${this.#qualifiedName}":`, e);
            }
          });

          await channel!.send('storage:save', {
            key: this.#qualifiedName,
            content: JSON.stringify(this.data),
            clear: false,
          });
        },
        { deep: true, immediate: true },
      );
    }

    return this;
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
   * Internal method to assign new values and trigger update events.
   *
   * @param newData Partial update data
   */
  private assignData(newData: Partial<T>): void {
    Object.assign(this.data, newData);

    this._onUpdate.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error(`[TouchStorage] onUpdate error in "${this.#qualifiedName}":`, e);
      }
    });
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
    this.assignData(parsed);

    return this;
  }
}
