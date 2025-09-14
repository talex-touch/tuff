import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { ITouchEventBus } from 'packages/utils/eventbus'
import { ITouchChannel } from 'packages/utils/channel'
import {
  IBaseModule,
  ModuleCreateContext,
  ModuleCtor,
  ModuleDestroyContext,
  ModuleDirectory,
  ModuleFileConfig,
  ModuleInitContext,
  ModuleKey,
  ModuleRegistrant,
  ModuleStartContext,
  ModuleStopContext,
  ResolvedModuleFileConfig
} from '@talex-touch/utils/types/modules'
import { TalexEvents } from './eventbus/touch-event'
import { TalexTouch } from '@talex-touch/utils'

/**
 * Minimal file system-backed implementation of the `ModuleDirectory` interface.
 * This class leverages Node.js's `fs/promises` API to perform basic directory and file operations,
 * providing modules with an isolated and persistent storage area.
 *
 * @remarks
 * This implementation can be replaced with other file system adapters as needed
 * (e.g., in-memory file system or remote storage).
 */
class FSModuleDirectory implements ModuleDirectory {
  /**
   * The absolute file system path that this module directory instance represents.
   */
  public readonly path: string

  /**
   * Constructs a new `FSModuleDirectory` instance.
   *
   * @param absPath - The absolute path to the module's root directory.
   */
  constructor(absPath: string) {
    this.path = absPath
  }

  /**
   * Joins one or more path segments to the root path of this module directory.
   * This method uses Node.js's `path.join` to ensure cross-platform compatibility.
   *
   * @param segments - The path segments to join.
   * @returns The complete joined path string.
   */
  join(...segments: string[]): string {
    return path.join(this.path, ...segments)
  }

  /**
   * Asynchronously ensures that this module directory exists on the file system.
   * If the directory does not exist, it will recursively create all necessary parent directories.
   *
   * @returns A Promise that resolves once the directory is created or confirmed to exist.
   */
  async ensure(): Promise<void> {
    await fs.mkdir(this.path, { recursive: true })
  }

  /**
   * Asynchronously checks if this module directory exists on the file system and is a directory.
   *
   * @returns A Promise that resolves to `true` if the directory exists and is a directory,
   *          otherwise resolves to `false`.
   */
  async exists(): Promise<boolean> {
    try {
      const stat = await fs.stat(this.path)
      return stat.isDirectory()
    } catch {
      return false
    }
  }

  /**
   * Asynchronously lists the names of all files and subdirectories within this module directory.
   *
   * @returns A Promise that resolves to an array of strings representing the directory's contents.
   *          If the directory does not exist or cannot be read, resolves to an empty array.
   */
  async list(): Promise<string[]> {
    try {
      return await fs.readdir(this.path)
    } catch {
      return []
    }
  }

  /**
   * Asynchronously reads the content of a file at the specified relative path within this module directory.
   *
   * @param relativePath - The path to the file relative to this module directory.
   * @returns A Promise that resolves to the file's content (Buffer or string).
   */
  async readFile(relativePath: string): Promise<Buffer | string> {
    const abs = this.join(relativePath)
    return fs.readFile(abs)
  }

  /**
   * Asynchronously writes data to a file at the specified relative path within this module directory.
   * If the file's parent directories do not exist, they will be recursively created.
   *
   * @param relativePath - The path to the file relative to this module directory.
   * @param data - The data to write to the file. Can be a `string` or `Uint8Array`.
   * @returns A Promise that resolves once the file writing operation is complete.
   */
  async writeFile(relativePath: string, data: string | Uint8Array): Promise<void> {
    const abs = this.join(relativePath)
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, data as any)
  }

  /**
   * Asynchronously removes a file or an entire directory within this module directory.
   *
   * @param relativePath - The relative path to the file or directory to remove (optional).
   *                       If not provided, the entire directory represented by this
   *                       `FSModuleDirectory` instance will be removed.
   * @returns A Promise that resolves once the removal operation is complete.
   */
  async remove(relativePath?: string): Promise<void> {
    const target = relativePath ? this.join(relativePath) : this.path
    await fs.rm(target, { recursive: true, force: true })
  }
}

/**
 * The core module manager responsible for coordinating and managing the lifecycle of modules within the application.
 * It enforces a singleton pattern for each module and provides a comprehensive set of lifecycle hooks
 * (create, initialize, start, stop, destroy). Additionally, the manager allocates and manages a dedicated
 * file system directory for each module (if configured) and exposes phase-specific context information
 * to modules, such as the application instance, communication channel, and configuration accessor.
 *
 * @typeParam E - The event type mapping defined in the event bus used by the application.
 */
export class ModuleManager implements TalexTouch.IModuleManager<TalexEvents> {
  /**
   * An internal registry storing all loaded module instances.
   * Modules are keyed by their unique `ModuleKey`, ensuring that only one instance of each module is loaded.
   */
  private readonly modules = new Map<ModuleKey, TalexTouch.IModule<TalexEvents>>()

  /**
   * The root path for all module's persistent data directories.
   * If not specified in the constructor options, it defaults to the `modules` folder
   * under the application's root path.
   */
  public readonly modulesRoot: string

  /**
   * The application-level communication channel, exposed to individual modules via their context.
   * Modules can use this channel for inter-process communication (IPC) or other application-internal event passing.
   */
  public readonly touchChannel: ITouchChannel

  /**
   * A read-only reference to the main application instance.
   * Modules can access the application's global services and state through this reference.
   */
  private readonly app: TalexTouch.TouchApp

  /**
   * An optional event bus instance used to subscribe to application-level system events,
   * such as the graceful shutdown of the application. If provided, the module manager
   * will leverage it to coordinate module unloads.
   */
  private readonly eventBus?: ITouchEventBus<TalexEvents>

  /**
   * The name of the event that signals the application is about to quit (e.g., `TalexEvents.BEFORE_APP_QUIT`).
   * When this event is triggered, the module manager will initiate the graceful unloading process
   * for all loaded modules.
   */
  private readonly beforeQuitEventName?: TalexEvents.BEFORE_APP_QUIT

  /**
   * Constructs a new `ModuleManager` instance.
   *
   * @param app - The root instance of the application, providing global context and functionality.
   * @param touchChannel - The application-level communication channel for inter-module interaction.
   * @param options - Optional configuration object to customize the module manager's behavior.
   * @param options.eventBus - An event bus instance for subscribing to application exit events.
   * @param options.beforeQuitEventName - Specifies the name of the application exit event.
   * @param options.modulesRoot - An optional absolute root path for custom module persistence directories.
   *                              If not provided, the default path `<app.rootPath>/modules` will be used.
   */
  constructor(
    app: TalexTouch.TouchApp,
    touchChannel: ITouchChannel,
    options?: {
      eventBus?: ITouchEventBus<TalexEvents>
      beforeQuitEventName?: TalexEvents.BEFORE_APP_QUIT
      modulesRoot?: string
    }
  ) {
    this.app = app
    this.touchChannel = touchChannel
    this.eventBus = options?.eventBus
    this.beforeQuitEventName = options?.beforeQuitEventName
    this.modulesRoot = options?.modulesRoot ?? path.join(app.rootPath, 'modules')

    void this.ensureDir(this.modulesRoot)

    if (this.eventBus && this.beforeQuitEventName) {
      this.eventBus.on(this.beforeQuitEventName, async () => {
        const keys = Array.from(this.modules.keys()).reverse()
        for (const key of keys) {
          try {
            await this.unloadModule(key, 'normal')
          } catch (err) {
            console.warn(`[ModuleManager] Error unloading ${String(key.description)}:`, err)
          }
        }
      })
    }
  }

  /**
   * Retrieves a loaded module instance by its constructor.
   * This method provides a type-safe way to access registered modules.
   *
   * @typeParam T - The specific module type that extends `IBaseModule<TalexEvents>`.
   * @param ctor - The class constructor of the module. **Important:** The constructor must define a static `key: ModuleKey` property,
   *               which is used to look up the module in the internal `Map`.
   * @returns The loaded module instance if it exists, otherwise `undefined`.
   * @throws `Error` if the provided constructor does not define a static `key` property, preventing module key resolution.
   */
  get<T extends IBaseModule<TalexEvents>>(ctor: ModuleCtor<T, TalexEvents>): T | undefined {
    const key = (ctor as any).key as ModuleKey | undefined
    if (!key) {
      throw new Error(
        `[ModuleManager] Could not resolve key for ${ctor.name}. Did you forget to define "static key: ModuleKey"?`
      )
    }
    return this.modules.get(key) as T | undefined
  }

  /**
   * Overload signature: Loads a module by its instance.
   * @param module - The module instance to load.
   * @returns A Promise that resolves to `true` if the module was successfully loaded (or already loaded), otherwise `false`.
   */
  public loadModule<T extends TalexTouch.IModule<TalexEvents>>(module: T): Promise<boolean>
  /**
   * Overload signature: Loads a module by its constructor.
   * @param module - The module constructor to load.
   * @returns A Promise that resolves to `true` if the module was successfully loaded (or already loaded), otherwise `false`.
   */
  public loadModule<T extends TalexTouch.IModule<TalexEvents>>(
    module: ModuleCtor<T, TalexEvents>
  ): Promise<boolean>

  /**
   * Registers and loads a module instance, or creates and loads a module via its constructor.
   * This method coordinates the module's lifecycle (`created?`, `init`, `start?`).
   *
   * @typeParam T - The module type extending `TalexTouch.IModule<TalexEvents>`.
   * @param moduleOrCtor - The module instance or its constructor to load.
   * @returns A Promise that resolves to `true` if the module was successfully loaded.
   *          If a module with the same key is already loaded, this operation is a no-op and returns `false`.
   */
  public async loadModule<T extends TalexTouch.IModule<TalexEvents>>(
    moduleOrCtor: ModuleRegistrant<T, TalexEvents>
  ): Promise<boolean> {
    const isCtor = typeof moduleOrCtor === 'function'
    const instance: T = isCtor
      ? new (moduleOrCtor as ModuleCtor<T, TalexEvents>)(
          this.makeCreateContext(
            (moduleOrCtor as ModuleCtor<T, TalexEvents>).key ?? Symbol('anonymous-module'),
            { create: false },
            undefined,
            undefined
          )
        )
      : (moduleOrCtor as T)

    const key = instance.name
    if (this.modules.has(key)) {
      return false
    }

    const fileCfg = this.resolveFileConfig(instance)
    const directory = await this.ensureDirectoryIfNeeded(fileCfg)

    const resolvedPath = this.resolveEntryPath(instance, fileCfg)

    const createCtx = this.makeCreateContext(key, fileCfg, directory, resolvedPath)
    const initCtx = this.makeInitContext(key, fileCfg, directory)
    const startCtx = this.makeStartContext(key, fileCfg, directory)

    if (typeof instance.created === 'function') {
      await instance.created(createCtx)
    }
    await instance.init(initCtx)
    if (typeof instance.start === 'function') {
      await instance.start(startCtx)
    }

    this.modules.set(key, instance)
    return true
  }

  /**
   * Unloads a previously loaded module by its unique `ModuleKey`.
   * This method is responsible for invoking the module's optional `stop()` and required `destroy()`
   * lifecycle methods, and then removing it from the internal registry.
   *
   * @param moduleKey - The unique key of the module to unload.
   * @param reason - The reason for the module stopping, defaults to `'normal'`. This information is passed to the `stop` context.
   * @returns A Promise that resolves to `true` if the module was successfully unloaded.
   *          If the specified module key is not found, it immediately returns `false`.
   */
  public unloadModule(
    moduleKey: ModuleKey,
    reason: ModuleStopContext<TalexEvents>['reason'] = 'normal'
  ): boolean | Promise<boolean> {
    const mod = this.modules.get(moduleKey)
    if (!mod) return false

    const fileCfg = this.resolveFileConfig(mod)
    const directory = this.buildDirectoryFromResolved(fileCfg)

    const stopCtx = this.makeStopContext(moduleKey, fileCfg, directory, reason)
    const destroyCtx = this.makeDestroyContext(moduleKey, fileCfg, directory, false)

    const run = async () => {
      if (typeof mod.stop === 'function') {
        await mod.stop(stopCtx)
      }
      await mod.destroy(destroyCtx)
      this.modules.delete(moduleKey)
      return true
    }

    return run()
  }

  /**
   * Retrieves a loaded module instance by its unique `ModuleKey`.
   * This method provides direct access to a module that has been loaded.
   *
   * @typeParam T - The module type extending `TalexTouch.IModule<TalexEvents>`.
   * @param moduleKey - The unique key of the module to retrieve.
   * @returns The loaded module instance, or `undefined` if not found.
   */
  public getModule<T extends TalexTouch.IModule<TalexEvents> = TalexTouch.IModule<TalexEvents>>(
    moduleKey: ModuleKey
  ): T | undefined {
    return this.modules.get(moduleKey) as T | undefined
  }

  /**
   * Checks if a module with the specified `ModuleKey` has been loaded.
   *
   * @param moduleKey - The unique key of the module to check.
   * @returns `true` if the module is loaded, otherwise `false`.
   */
  public hasModule(moduleKey: ModuleKey): boolean {
    return this.modules.has(moduleKey)
  }

  /**
   * Lists the unique keys of all currently loaded modules.
   *
   * @returns A read-only array containing the keys of all loaded modules.
   */
  public listModules(): readonly ModuleKey[] {
    return Array.from(this.modules.keys())
  }

  /**
   * Returns an iterator that allows traversing the `ModuleKey`s of all loaded modules.
   * This method is compatible with previous APIs and provides a way to iterate over module keys.
   *
   * @returns An iterator for module keys.
   */
  public getAllModules(): IterableIterator<ModuleKey> {
    return this.modules.keys()
  }

  /**
   * Asynchronously ensures that a directory at the given absolute path exists.
   * If the directory does not exist, it will recursively create all necessary parent directories.
   *
   * @param absPath - The absolute path of the directory to ensure existence.
   * @returns A Promise that resolves once the directory is created or confirmed to exist.
   */
  private async ensureDir(absPath: string): Promise<void> {
    await fs.mkdir(absPath, { recursive: true })
  }

  /**
   * Resolves the input `ModuleFileConfig` from a module instance into a concrete `ResolvedModuleFileConfig`
   * for internal use. This method handles default values and conditional logic to determine if
   * a module requires file system support and its corresponding directory path.
   *
   * @param module - The module instance for which to resolve the file configuration.
   * @returns An object containing the resolved file configuration. If `create` is `false`,
   *          `dirName` and `dirPath` might not be present.
   */
  private resolveFileConfig(module: TalexTouch.IModule<TalexEvents>): ResolvedModuleFileConfig {
    const input: ModuleFileConfig | undefined = (module as any).file
    const createDefault = true

    const create = input?.create ?? createDefault
    if (!create) {
      return { create: false }
    }

    const dirName = input?.dirName ?? module.name.description ?? `module-${String(module.name)}`

    const root = input?.root ?? this.modulesRoot
    const dirPath = path.join(root, dirName)

    return { create: true, dirName, dirPath }
  }

  /**
   * Asynchronously creates and ensures the existence of a module's file system directory
   * based on its resolved file configuration. Directory creation is performed only if
   * `file.create` is `true` and `file.dirPath` is valid.
   *
   * @param file - The `ResolvedModuleFileConfig` object containing the module's file system configuration.
   * @returns A Promise that resolves to an `FSModuleDirectory` instance if the directory was created/ensured,
   *          otherwise resolves to `undefined` if file system support is not required.
   */
  private async ensureDirectoryIfNeeded(
    file: ResolvedModuleFileConfig
  ): Promise<ModuleDirectory | undefined> {
    if (!file.create || !file.dirPath) return undefined
    const dir = new FSModuleDirectory(file.dirPath)
    await dir.ensure()
    return dir
  }

  /**
   * Builds a `ModuleDirectory` handle from a `ResolvedModuleFileConfig` without ensuring its
   * existence on disk. This method merely creates an `FSModuleDirectory` instance representing the path.
   * It is primarily used in scenarios like module unloading, where a directory handle is needed
   * but actual file system operations (creation) are not.
   *
   * @param file - The `ResolvedModuleFileConfig` object containing the module's file system configuration.
   * @returns An `FSModuleDirectory` instance if the configuration is valid,
   *          otherwise `undefined` if file system support is not required.
   */
  private buildDirectoryFromResolved(file: ResolvedModuleFileConfig): ModuleDirectory | undefined {
    if (!file.create || !file.dirPath) return undefined
    return new FSModuleDirectory(file.dirPath)
  }

  /**
   * Computes the final entry file path for a module.
   * This method first checks for a legacy `module.filePath` property. If present, that path takes precedence.
   * Otherwise, if the module is configured to create a directory (`file.create` is `true`) and `file.dirPath` is valid,
   * it defaults to `index.js` within that directory as the entry file.
   *
   * @param module - The module instance, used to check for a legacy `filePath`.
   * @param file - The module's `ResolvedModuleFileConfig`, used to determine the directory path.
   * @returns The string representation of the module's entry file path. Returns `undefined` if the module does not require an entry file.
   */
  private resolveEntryPath(
    module: TalexTouch.IModule<TalexEvents>,
    file: ResolvedModuleFileConfig
  ): string | undefined {
    const legacy = (module as any).filePath as string | undefined
    if (legacy)
      return path.isAbsolute(legacy) ? legacy : path.join(file.dirPath ?? this.modulesRoot, legacy)

    if (file.create && file.dirPath) {
      return path.join(file.dirPath, 'index.js')
    }
    return undefined
  }

  /**
   * Creates the common base part of a module's lifecycle context.
   * This base context contains properties shared across all lifecycle phases, such as the application instance,
   * a reference to the module manager, the module's unique key, a configuration accessor,
   * the event bus interface, and a handle to the module's persistent directory.
   *
   * @param moduleKey - The unique identifier `ModuleKey` of the module.
   * @param directory - The instance of the module's persistent file system directory, if the module is configured with file system support.
   * @returns A base context object containing properties shared by all module lifecycle contexts.
   */
  private makeBaseContext(moduleKey: ModuleKey, directory?: ModuleDirectory) {
    return {
      app: this.app,
      manager: this as unknown as TalexTouch.IModuleManager<TalexEvents>,
      moduleKey,
      config: <T = unknown>(key: string) => (this.app as any)?.config?.get?.(key) as T,
      events: this.eventBus
        ? {
            on: this.eventBus.on.bind(this.eventBus),
            off: this.eventBus.off.bind(this.eventBus),
            emit: this.eventBus.emit.bind(this.eventBus)
          }
        : undefined,
      directory
    }
  }

  /**
   * Creates the context object (`ModuleCreateContext`) required for the module's "created" lifecycle phase.
   * This context is provided when the module instance is first created and includes the module's file configuration,
   * resolved entry path, and hot-reloading status.
   *
   * @param moduleKey - The unique identifier `ModuleKey` of the module.
   * @param file - The module's `ResolvedModuleFileConfig`, indicating file system configuration.
   * @param directory - The instance of the module's persistent file system directory (if applicable).
   * @param resolvedPath - The absolute path to the module's entry file on the file system (if applicable).
   * @returns A `ModuleCreateContext` object containing information specific to the module's creation phase.
   */
  private makeCreateContext(
    moduleKey: ModuleKey,
    file: ResolvedModuleFileConfig,
    directory?: ModuleDirectory,
    resolvedPath?: string
  ): ModuleCreateContext<TalexEvents> {
    return {
      ...this.makeBaseContext(moduleKey, directory),
      file,
      resolvedPath,
      hot: false
    } as ModuleCreateContext<TalexEvents>
  }

  /**
   * Creates the context object (`ModuleInitContext`) required for the module's "initialize" lifecycle phase.
   * This context is provided after all module dependencies are considered ready.
   *
   * @param moduleKey - The unique identifier `ModuleKey` of the module.
   * @param file - The module's `ResolvedModuleFileConfig`, indicating file system configuration.
   * @param directory - The instance of the module's persistent file system directory (if applicable).
   * @returns A `ModuleInitContext` object containing information specific to the module's initialization phase.
   */
  private makeInitContext(
    moduleKey: ModuleKey,
    file: ResolvedModuleFileConfig,
    directory?: ModuleDirectory
  ): ModuleInitContext<TalexEvents> {
    return {
      ...this.makeBaseContext(moduleKey, directory),
      file,
      depsReady: true
    } as ModuleInitContext<TalexEvents>
  }

  /**
   * Creates the context object (`ModuleStartContext`) required for the module's "start" lifecycle phase.
   * This context is provided when the module is activated and begins its primary functionality,
   * and can include start-up arguments.
   *
   * @param moduleKey - The unique identifier `ModuleKey` of the module.
   * @param file - The module's `ResolvedModuleFileConfig`, indicating file system configuration.
   * @param directory - The instance of the module's persistent file system directory (if applicable).
   * @returns A `ModuleStartContext` object containing information specific to the module's start phase.
   */
  private makeStartContext(
    moduleKey: ModuleKey,
    file: ResolvedModuleFileConfig,
    directory?: ModuleDirectory
  ): ModuleStartContext<TalexEvents> {
    return {
      ...this.makeBaseContext(moduleKey, directory),
      file,
      startArgs: {}
    } as ModuleStartContext<TalexEvents>
  }

  /**
   * Creates the context object (`ModuleStopContext`) required for the module's "stop" lifecycle phase.
   * This context is provided when the module is about to cease its functionality and includes the reason for stopping.
   *
   * @param moduleKey - The unique identifier `ModuleKey` of the module.
   * @param file - The module's `ResolvedModuleFileConfig`, indicating file system configuration.
   * @param directory - The instance of the module's persistent file system directory (if applicable).
   * @param reason - Indicates the reason for the module stopping (e.g., 'normal', 'error', 'app-quit').
   * @returns A `ModuleStopContext` object containing information specific to the module's stop phase.
   */
  private makeStopContext(
    moduleKey: ModuleKey,
    file: ResolvedModuleFileConfig,
    directory: ModuleDirectory | undefined,
    reason: ModuleStopContext<TalexEvents>['reason']
  ): ModuleStopContext<TalexEvents> {
    return {
      ...this.makeBaseContext(moduleKey, directory),
      file,
      reason
    } as ModuleStopContext<TalexEvents>
  }

  /**
   * Creates the context object (`ModuleDestroyContext`) required for the module's "destroy" lifecycle phase.
   * This context is provided before the module is completely removed from the manager and indicates
   * whether the application is currently shutting down.
   *
   * @param moduleKey - The unique identifier `ModuleKey` of the module.
   * @param file - The module's `ResolvedModuleFileConfig`, indicating file system configuration.
   * @param directory - The instance of the module's persistent file system directory (if applicable).
   * @param appClosing - A boolean value indicating whether the application is undergoing a shutdown process.
   * @returns A `ModuleDestroyContext` object containing information specific to the module's destruction phase.
   */
  private makeDestroyContext(
    moduleKey: ModuleKey,
    file: ResolvedModuleFileConfig,
    directory: ModuleDirectory | undefined,
    appClosing: boolean
  ): ModuleDestroyContext<TalexEvents> {
    return {
      ...this.makeBaseContext(moduleKey, directory),
      file,
      appClosing
    } as ModuleDestroyContext<TalexEvents>
  }
}
