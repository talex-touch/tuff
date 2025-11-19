/**
 * Unique key for a module.
 * @public
 */
export type ModuleKey = symbol

/**
 * Utility type representing a synchronous or asynchronous value.
 * @public
 */
export type MaybePromise<T> = T | Promise<T>

/**
 * Declarative file/directory configuration for a module (input).
 *
 * @remarks
 * - **Single-directory rule**: Each module can own at most **one** directory.
 * - If `create` is `false` (or omitted), the manager will not create a directory for the module.
 * - If `create` is `true`, the directory name will default to a name derived from the module key/name,
 *   but can be overridden with `dirName` (e.g., use `"clipboard"` instead of `"ClipBoardModule"`).
 * - `root` specifies the absolute root path under which the module directory will be created.
 *   If omitted, the manager can fall back to an application default (e.g., `app.modulesRoot`).
 *
 * This configuration is typically provided by the module author or the application at registration time.
 *
 * @public
 */
export interface ModuleFileConfig {
  /**
   * Whether to create a dedicated directory for this module.
   *
   * @defaultValue false
   */
  create?: boolean

  /**
   * Optional custom directory name (basename only, no slashes).
   *
   * @example "clipboard"
   */
  dirName?: string

  /**
   * Optional absolute root path under which the module directory will be created.
   *
   * @example "/var/app/modules"
   */
  root?: string
}

/**
 * Resolved and normalized file/directory configuration for a module (output).
 *
 * @remarks
 * Produced by the manager during module loading. It captures the final decision:
 * - whether a directory will exist for the module (`create`)
 * - the final directory name (`dirName`) if created
 * - the final absolute directory path (`dirPath`) if created
 *
 * If the module does not own a directory (i.e., `create === false`), both `dirName` and `dirPath`
 * will be `undefined`.
 *
 * @public
 */
export interface ResolvedModuleFileConfig {
  /**
   * Final boolean indicating if the module has a dedicated directory.
   */
  create: boolean

  /**
   * Final directory name (basename), if a directory is created.
   */
  dirName?: string

  /**
   * Final absolute path to the module directory, if a directory is created.
   */
  dirPath?: string
}

/**
 * Lightweight abstraction over a module-owned directory.
 *
 * @remarks
 * - **Single-directory rule**: A module can have **at most one** directory. If the module isn't configured
 *   to create/own a directory, the `directory` field in lifecycle contexts will be `undefined`.
 * - Implementations can be backed by Node.js `fs`, a virtual filesystem, or any storage adapter.
 *
 * @public
 */
export interface ModuleDirectory {
  /**
   * Absolute path to the module directory.
   */
  readonly path: string

  /**
   * Joins one or more path segments to the module directory path. Does not touch the filesystem.
   *
   * @param segments - One or more relative path segments.
   * @returns The combined absolute path string.
   */
  join: (...segments: string[]) => string

  /**
   * Ensures the directory exists, creating it if necessary.
   */
  ensure: () => MaybePromise<void>

  /**
   * Checks whether the directory exists.
   */
  exists: () => MaybePromise<boolean>

  /**
   * Lists entries in the directory (filenames/subdirectory names).
   *
   * @returns An array of entry names (not absolute paths).
   */
  list: () => MaybePromise<string[]>

  /**
   * Reads a file within the module directory.
   *
   * @param relativePath - Path relative to the module directory.
   * @returns File contents as a Buffer or string (implementation-dependent).
   */
  readFile: (relativePath: string) => MaybePromise<Buffer | string>

  /**
   * Writes a file within the module directory, creating parent folders if needed.
   *
   * @param relativePath - Path relative to the module directory.
   * @param data - File content.
   */
  writeFile: (relativePath: string, data: string | Uint8Array) => MaybePromise<void>

  /**
   * Removes a file or subdirectory within the module directory.
   *
   * @param relativePath - Path relative to the module directory. If omitted, implementations
   * may remove the entire directory (use with caution).
   */
  remove: (relativePath?: string) => MaybePromise<void>
}
