import type { MaybePromise, ModuleFileConfig, ModuleKey } from './base'
import type { ModuleCreateContext, ModuleDestroyContext, ModuleInitContext, ModuleStartContext, ModuleStopContext } from './module-lifecycle'

/**
 * Contract that every module must implement.
 *
 * @typeParam E - Event map type used by the application's touch event bus.
 * @remarks
 * - A module is identified by a unique {@link ModuleKey} stored in {@link IModule.name}.
 * - Each module may own **at most one** directory. Use {@link IModule.file} to declare
 *   if/where a directory should be created. If no directory is created, contexts will expose
 *   `directory: undefined`.
 * - Lifecycle methods receive **phase-specific contexts** so that modules can access
 *   the manager, app, configuration, event bus, and (if any) the directory instance.
 *
 * @public
 */
export interface IBaseModule<E = any> {
  /**
   * Unique module key. Prefer `Symbol.for("your-module")` for global uniqueness.
   */
  name: ModuleKey

  /**
   * Optional custom module entry file path.
   *
   * @remarks
   * If omitted, the manager can resolve a default location (e.g., inside the module's directory
   * when one exists, or from an app-level modules root).
   */
  filePath?: string

  /**
   * Declarative directory configuration for this module.
   *
   * @remarks
   * - If `file.create === true`, the manager will compute a final directory name/path and
   *   expose a `ModuleDirectory` on all lifecycle contexts.
   * - If `file.create !== true`, no directory will be created and `context.directory` will be `undefined`.
   */
  file?: ModuleFileConfig

  /**
   * Optional hook invoked after construction/registration and before `init`.
   * Use this for last-moment wiring that depends on resolved paths or file config.
   */
  created?: (ctx: ModuleCreateContext<E>) => MaybePromise<void>

  /**
   * Called to perform resource preparation and subscription wiring.
   */
  init: (ctx: ModuleInitContext<E>) => MaybePromise<void>

  /**
   * Called when the module should start its active work.
   */
  start?: (ctx: ModuleStartContext<E>) => MaybePromise<void>

  /**
   * Called when the module should leave the active state but may still keep allocated resources.
   */
  stop?: (ctx: ModuleStopContext<E>) => MaybePromise<void>

  /**
   * Called to perform final teardown and resource release.
   */
  destroy: (ctx: ModuleDestroyContext<E>) => MaybePromise<void>
}

/**
 * Class-based module constructor signature (for OOP-style modules).
 *
 * @typeParam T - Concrete module type produced by this constructor.
 * @typeParam E - Event map type used by the application's touch event bus.
 * @remarks
 * - The constructor receives a **create-phase** context so a class can read resolved paths
 *   or the computed directory before `created()` and `init()` run.
 * - You may optionally expose `key` and `requires` as static metadata if you plan to add
 *   declarative dependency ordering later.
 *
 * @public
 */
export interface ModuleCtor<T extends IBaseModule<E>, E = any> {
  new (ctx: ModuleCreateContext<E>): T

  /**
   * Optional class-level unique key.
   * If omitted, the instance {@link IModule.name | name} must be used as the key.
   */
  readonly key?: ModuleKey

  /**
   * Optional declarative dependencies expressed as other module keys.
   * Useful if the manager performs topological ordering.
   */
  readonly requires?: readonly ModuleKey[]
}

/**
 * Registration input accepted by the manager.
 *
 * @typeParam T - Concrete module type.
 * @typeParam E - Event map type used by the application's touch event bus.
 * @remarks
 * - You can register either an already-built instance or a class constructor.
 * - When a constructor is provided, the manager will call `new (createCtx)` to construct the instance.
 *
 * @public
 */
export type ModuleRegistrant<T extends IBaseModule<E>, E = any>
  = | T
    | ModuleCtor<T, E>
