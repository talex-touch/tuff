import { ITouchEventBus } from "packages/utils/eventbus";
import { ModuleKey } from ".";
import { TalexTouch } from "../touch-app-core";
import { ModuleDirectory, ResolvedModuleFileConfig } from "./base";

/**
 * Base context available to all lifecycle phases.
 *
 * @typeParam E - Event map type for the touch event bus.
 * @public
 */
export interface ModuleBaseContext<E> {
  /**
   * The application root object (TalexTouch).
   */
  app: TalexTouch.TouchApp;

  /**
   * The module manager controlling creation, lifecycle, and lookup.
   */
  manager: TalexTouch.IModuleManager<E>;

  /**
   * The unique key for the current module (same as the module's `name`).
   */
  moduleKey: ModuleKey;

  /**
   * Optional configuration accessor bound to the application or module.
   *
   * @param key - Configuration key.
   * @returns The typed configuration value.
   */
  config?<T = unknown>(key: string): T;

  /**
   * Optional event bus bound to the application or module layer.
   */
  events?: ITouchEventBus<E>;

  /**
   * The module's directory instance if a directory was created; otherwise `undefined`.
   *
   * @remarks
   * **Single-directory rule**: Each module can expose at most one `ModuleDirectory` instance here.
   */
  directory?: ModuleDirectory;
}

/**
 * Context for the "create" phase (around instantiation and initial wiring).
 *
 * @typeParam E - Event map type for the touch event bus.
 * @public
 */
export interface ModuleCreateContext<E> extends ModuleBaseContext<E> {
  /**
   * Resolved file/directory configuration for the module.
   */
  file: ResolvedModuleFileConfig;

  /**
   * Fully resolved module entry file path if a custom path was provided,
   * or a default path computed by the manager; otherwise `undefined`.
   */
  resolvedPath?: string;

  /**
   * Indicates whether this load is part of a hot-reload/replace cycle.
   */
  hot?: boolean;
}

/**
 * Context for the "init" phase (resource preparation, subscriptions, scaffolding).
 *
 * @typeParam E - Event map type for the touch event bus.
 * @public
 */
export interface ModuleInitContext<E> extends ModuleBaseContext<E> {
  /**
   * Optional hint that dependencies have been verified and are ready.
   */
  depsReady?: boolean;

  /**
   * Resolved file/directory configuration for the module.
   */
  file: ResolvedModuleFileConfig;
}

/**
 * Context for the "start" phase (module enters active/working state).
 *
 * @typeParam E - Event map type for the touch event bus.
 * @public
 */
export interface ModuleStartContext<E> extends ModuleBaseContext<E> {
  /**
   * Optional startup arguments or mode flags.
   */
  startArgs?: Record<string, unknown>;

  /**
   * Resolved file/directory configuration for the module.
   */
  file: ResolvedModuleFileConfig;
}

/**
 * Context for the "stop" phase (module leaves the active/working state).
 *
 * @typeParam E - Event map type for the touch event bus.
 * @public
 */
export interface ModuleStopContext<E> extends ModuleBaseContext<E> {
  /**
   * Reason for stopping. Useful for telemetry and cleanup branching.
   * - `"normal"`: Voluntary shutdown or planned stop.
   * - `"error"`: Unhandled error or fault.
   * - `"hot-reload"`: Stop as part of a hot reload / replacement cycle.
   * - `string`: Custom reason.
   */
  reason?: "normal" | "error" | "hot-reload" | string;

  /**
   * Resolved file/directory configuration for the module.
   */
  file: ResolvedModuleFileConfig;
}

/**
 * Context for the "destroy" phase (final teardown and resource release).
 *
 * @typeParam E - Event map type for the touch event bus.
 * @public
 */
export interface ModuleDestroyContext<E> extends ModuleBaseContext<E> {
  /**
   * Indicates the module is being destroyed as part of application shutdown.
   */
  appClosing?: boolean;

  /**
   * Resolved file/directory configuration for the module.
   */
  file: ResolvedModuleFileConfig;
}
