import {
  reactive,
  watch,
  type UnwrapNestedRefs,
} from 'vue';

/**
 * Interface representing the external communication channel.
 * You must initialize this channel before using any `TouchStorage` instances.
 */
export interface IStorageChannel {
  /**
   * Sends an asynchronous message.
   * @param event Event name
   * @param payload Message payload
   * @returns A promise resolving with the response
   */
  send(event: string, payload: unknown): Promise<unknown>;

  /**
   * Sends a synchronous message.
   * @param event Event name
   * @param payload Message payload
   * @returns The response synchronously
   */
  sendSync(event: string, payload: unknown): unknown;
}

/** Global variable to hold the initialized channel */
let channel: IStorageChannel | null = null;

/**
 * Initializes the global communication channel for all TouchStorage instances.
 * This should be called before constructing any storage instances.
 *
 * @example
 * ```ts
 * import { initTouchChannel } from './touch-storage';
 * import { ipcRenderer } from 'electron';
 *
 * initTouchChannel({
 *   send: ipcRenderer.invoke.bind(ipcRenderer),
 *   sendSync: ipcRenderer.sendSync.bind(ipcRenderer),
 * });
 * ```
 *
 * @param c The channel instance implementing the TouchChannel interface
 */
export function initStorageChannel(c: IStorageChannel): void {
  channel = c;
}

/**
 * A global map holding all instantiated storage instances.
 */
export const storages = new Map<string, TouchStorage<any>>();

/**
 * Generic class to manage reactive data storage with optional auto-save and update callbacks.
 *
 * @template T The shape of the stored reactive data object.
 */
export class TouchStorage<T extends object> {
  readonly #qualifiedName: string;
  #autoSave = false;
  #autoSaveStopHandle?: () => void;
  readonly originalData: T;
  private readonly _onUpdate: Array<() => void> = [];

  /**
   * The reactive data object being managed.
   */
  public readonly data: UnwrapNestedRefs<T>;

  /**
   * Constructs a new instance of TouchStorage.
   *
   * @param qName A globally unique identifier for this storage instance
   * @param initData The default shape and values for the data object
   * @param onUpdate An optional callback to execute when data changes
   * @throws Will throw if the given name is already registered or if the channel is not initialized
   *
   * @example
   * ```ts
   * const userStore = new TouchStorage('user', { name: '', age: 0 });
   * ```
   */
  constructor(
    qName: string,
    initData: T,
    onUpdate?: () => void,
  ) {
    if (storages.has(qName)) {
      throw new Error(`Storage "${qName}" already exists`);
    }
    if (!channel) {
      throw new Error(
        'TouchStorage: channel is not initialized. Please call initTouchChannel(...) before using.'
      );
    }

    this.#qualifiedName = qName;
    this.originalData = initData;
    // Make sure data structure
    this.data = reactive(initData) as UnwrapNestedRefs<T>;

    const stored = (channel.sendSync('storage:get', qName) as Partial<T>) || {};
    this.data = reactive({ ...initData, ...stored }) as UnwrapNestedRefs<T>;

    if (onUpdate) this._onUpdate.push(onUpdate);

    storages.set(qName, this);
  }

  /**
   * Gets the qualified name of the current storage instance.
   * @returns Returns the unique identifier passed during initialization
   */
  getQualifiedName(): string {
    return this.#qualifiedName;
  }

  /**
   * Checks if auto-save is enabled for the current storage instance.
   * @returns Returns true if auto-save is enabled, otherwise returns false
   */
  isAutoSave(): boolean {
    return this.#autoSave;
  }

  /**
   * Enables or disables auto-saving of the data object.
   *
   * @param autoSave If true, automatically saves data on change
   * @returns Returns the current instance for chaining
   *
   * @example
   * ```ts
   * store.setAutoSave(true);
   * ```
   */
  setAutoSave(autoSave: boolean): this {
    this.#autoSave = autoSave;

    this.#autoSaveStopHandle?.();

    if (autoSave) {
      this.#autoSaveStopHandle = watch(
        this.data,
        async () => {
          this._onUpdate.forEach((fn) => fn());

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
   * Registers a callback function to be called when the data is updated.
   *
   * @param fn The callback function
   *
   * @example
   * ```ts
   * store.onUpdate(() => console.log('Data changed!'));
   * ```
   */
  onUpdate(fn: () => void): void {
    this._onUpdate.push(fn);
  }

  /**
   * Removes a previously registered callback function.
   *
   * @param fn The callback function to remove
   *
   * @example
   * ```ts
   * const callback = () => console.log('Updated');
   * store.onUpdate(callback);
   * store.offUpdate(callback);
   * ```
   */
  offUpdate(fn: () => void): void {
    const i = this._onUpdate.indexOf(fn);
    if (i >= 0) this._onUpdate.splice(i, 1);
  }
}