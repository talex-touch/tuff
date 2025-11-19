import type { MaybePromise, ModuleDirectory, ModuleFileConfig, ModuleKey, ResolvedModuleFileConfig } from './base'
import type { IBaseModule, ModuleCtor, ModuleRegistrant } from './module'
import type { ModuleStopContext } from './module-lifecycle'

/**
 * Interface of the Module Manager.
 *
 * @typeParam E - Event map type used by the application's touch event bus.
 * @remarks
 * The manager is responsible for:
 * - Registering modules (singletons), constructing instances when given a class.
 * - Resolving {@link ModuleFileConfig} into a concrete {@link ResolvedModuleFileConfig} and, if requested,
 *   provisioning a single {@link ModuleDirectory} per module.
 * - Driving lifecycle: `created?` → `init` → `start?` → `stop?` → `destroy`.
 * - Providing lookup utilities (by key or, optionally, by constructor).
 *
 * @public
 */
export interface IBaseModuleManager<E = any> {
  /**
   * Registers and loads a module (instance or class).
   *
   * @typeParam T - Concrete module type.
   * @param module - Either a prebuilt module instance or a class constructor.
   * @returns `true` on success, `false` on no-op/failure (sync or async).
   *
   * @remarks
   * - If a constructor is provided, the manager:
   *   1) Builds a `ModuleCreateContext` (including resolved file config and optionally a directory).
   *   2) Calls `new (createCtx)` to construct the module.
   *   3) Invokes `created?()` (if present), then `init()`, then `start?()`.
   * - If an instance is provided, step (2) is skipped; the same lifecycle calls apply.
   * - The manager must preserve **singleton semantics** per {@link ModuleKey}.
   */
  loadModule: <T extends IBaseModule<E>>(module: ModuleRegistrant<T, E>) => boolean | Promise<boolean>

  /**
   * Unloads a module by key.
   *
   * @param moduleKey - The unique key of the module to unload.
   * @param reason - Optional stop reason, forwarded to the stop context.
   * @returns `true` on success, `false` if not found or failed (sync or async).
   *
   * @remarks
   * The manager should invoke `stop?()` (with a `ModuleStopContext`) followed by `destroy()`
   * (with a `ModuleDestroyContext`), then remove the singleton instance.
   */
  unloadModule: (moduleKey: ModuleKey, reason?: ModuleStopContext<E>['reason']) => boolean | Promise<boolean>

  /**
   * Retrieves a module instance by key.
   *
   * @typeParam T - Expected module type.
   * @param moduleKey - The unique key of the module.
   * @returns The module instance if loaded; otherwise `undefined`.
   */
  getModule: <T extends IBaseModule<E> = IBaseModule<E>>(moduleKey: ModuleKey) => T | undefined

  /**
   * Optional class-based getter for stronger typing.
   *
   * @typeParam T - Concrete module type.
   * @param ctor - The module class used at registration time (or a class with the same static `key`).
   * @returns The module instance if loaded; otherwise `undefined`.
   */
  get: <T extends IBaseModule<E>>(ctor: ModuleCtor<T, E>) => T | undefined

  /**
   * Returns whether a module is currently loaded.
   */
  hasModule: (moduleKey: ModuleKey) => boolean

  /**
   * Lists keys of all currently loaded modules.
   */
  listModules: () => readonly ModuleKey[]
}

/**
 * Optional helper interface some managers expose to centralize directory creation.
 *
 * @remarks
 * This can be useful if module authors want to compute file paths before the module
 * is actually loaded, or for tooling and diagnostics. Implementation is up to you.
 *
 * @public
 */
export interface IModuleDirectoryService {
  /**
   * Resolves a {@link ModuleFileConfig} to {@link ResolvedModuleFileConfig} without creating anything.
   */
  resolve: (moduleKey: ModuleKey, input?: ModuleFileConfig) => ResolvedModuleFileConfig

  /**
   * Creates (or returns) the single {@link ModuleDirectory} for a module if configured to `create: true`.
   * If `create !== true`, implementations should return `undefined`.
   */
  ensure: (moduleKey: ModuleKey, input?: ModuleFileConfig) => MaybePromise<ModuleDirectory | undefined>
}
