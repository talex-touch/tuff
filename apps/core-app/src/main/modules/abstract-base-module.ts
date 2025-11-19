/**
 * BaseModule.ts
 * A practical abstract base class to DRY common module logic.
 * - Works with your IModule<E> and phase-specific contexts
 * - No coupling to implementation details of ModuleManager
 * - Keeps modules clean and strongly-typed
 */
import type {
  EventHandler,
  ITouchEvent,
  MaybePromise,
  ModuleCreateContext,
  ModuleDestroyContext,
  ModuleDirectory,
  ModuleFileConfig,
  ModuleInitContext,
  ModuleKey,
  ModuleStartContext,
  ModuleStopContext,
  TalexTouch,
} from '@talex-touch/utils'
import type { TalexEvents } from '../core/eventbus/touch-event'
import * as path from 'node:path'

export abstract class BaseModule<E = TalexEvents> implements TalexTouch.IModule<E> {
  /** Unique key the manager uses as singleton id */
  public readonly name: ModuleKey

  /**
   * Declarative single-directory config (optional).
   * If create === true, the manager will create `<root>/modules/<dirName>` by default.
   */
  public readonly file?: ModuleFileConfig

  protected constructor(key: ModuleKey, file?: ModuleFileConfig) {
    this.name = key
    this.file = file
  }

  filePath?: string | undefined
  created?(ctx: ModuleCreateContext<E>): MaybePromise<void>
  init(ctx: ModuleInitContext<E>): MaybePromise<void> {
    this.filePath = ctx.file.dirPath

    this.onInit(ctx)
  }

  abstract onInit(ctx: ModuleInitContext<E>): MaybePromise<void>
  start?(ctx: ModuleStartContext<E>): MaybePromise<void>
  stop?(ctx: ModuleStopContext<E>): MaybePromise<void>
  destroy(ctx: ModuleDestroyContext<E>): MaybePromise<void> {
    this.onDestroy(ctx)
  }
  abstract onDestroy(ctx: ModuleDestroyContext<E>): MaybePromise<void>

  /** Get ModuleDirectory instance if created, otherwise undefined. */
  protected directory(
    ctx:
      | ModuleCreateContext<E>
      | ModuleInitContext<E>
      | ModuleStartContext<E>
      | ModuleStopContext<E>
      | ModuleDestroyContext<E>,
  ): ModuleDirectory | undefined {
    return ctx.directory
  }

  /** Get directory path if created, otherwise undefined. */
  protected dirPath(
    ctx:
      | ModuleCreateContext<E>
      | ModuleInitContext<E>
      | ModuleStartContext<E>
      | ModuleStopContext<E>
      | ModuleDestroyContext<E>,
  ): string | undefined {
    return ctx.file?.dirPath
  }

  /** Get directory path or throw with a clear message. */
  protected requireDirPath(
    ctx:
      | ModuleCreateContext<E>
      | ModuleInitContext<E>
      | ModuleStartContext<E>
      | ModuleStopContext<E>
      | ModuleDestroyContext<E>,
    hint?: string,
  ): string {
    const p = this.dirPath(ctx)
    if (!p) {
      throw new Error(
        `[${String(this.name.description ?? this.name)}] Module directory is not created${hint ? `: ${hint}` : ''}`,
      )
    }
    return p
  }

  /** Join a path under the module's directory. Throws if directory doesn't exist. */
  protected join(
    ctx:
      | ModuleCreateContext<E>
      | ModuleInitContext<E>
      | ModuleStartContext<E>
      | ModuleStopContext<E>
      | ModuleDestroyContext<E>,
    ...segments: string[]
  ): string {
    const base = this.requireDirPath(ctx, 'enable file.create or set dirName')
    return path.join(base, ...segments)
  }

  /** Ensure a subdirectory exists under the module folder; returns its absolute path. */
  protected async ensureSubdir(
    ctx:
      | ModuleCreateContext<E>
      | ModuleInitContext<E>
      | ModuleStartContext<E>
      | ModuleStopContext<E>
      | ModuleDestroyContext<E>,
    ...segments: string[]
  ): Promise<string> {
    const dir = this.directory(ctx)
    if (!dir) {
      throw new Error(
        `[${String(this.name.description ?? this.name)}] directory instance is undefined; enable file.create.`,
      )
    }
    const sub = dir.join(...segments)
    await dir.ensure() // ensure root
    // ensure sub
    const subDir = path.dirname(sub)
    if (subDir !== dir.path) {
      // leverage writeFile to ensure parent recursively, or add a dedicated fs util if you have one
      await dir.writeFile(path.join(...segments, '.touch'), '') // creates parents
      await dir.remove(path.join(...segments, '.touch'))
    }
    return subDir
  }

  /** Read a JSON file relative to module directory, with optional fallback. */
  protected async readJSON<T = unknown>(
    ctx:
      | ModuleCreateContext<E>
      | ModuleInitContext<E>
      | ModuleStartContext<E>
      | ModuleStopContext<E>
      | ModuleDestroyContext<E>,
    relativePath: string,
    fallback?: T,
  ): Promise<T> {
    const dir = this.directory(ctx)
    if (!dir) {
      if (fallback !== undefined)
        return fallback
      throw new Error(
        `[${String(this.name.description ?? this.name)}] directory is undefined; cannot read ${relativePath}`,
      )
    }
    try {
      const data = await dir.readFile(relativePath)
      const text = Buffer.isBuffer(data) ? data.toString('utf8') : (data as string)
      return JSON.parse(text) as T
    }
    catch {
      if (fallback !== undefined)
        return fallback
      throw new Error(
        `[${String(this.name.description ?? this.name)}] directory is undefined; cannot write ${relativePath}`,
      )
    }
  }

  /** Write a JSON file relative to module directory. */
  protected async writeJSON(
    ctx:
      | ModuleCreateContext<E>
      | ModuleInitContext<E>
      | ModuleStartContext<E>
      | ModuleStopContext<E>
      | ModuleDestroyContext<E>,
    relativePath: string,
    value: unknown,
  ): Promise<void> {
    const dir = this.directory(ctx)
    if (!dir) {
      throw new Error(
        `[${String(this.name.description ?? this.name)}] directory is undefined; cannot write ${relativePath}`,
      )
    }
    const text = JSON.stringify(value, null, 2)
    await dir.writeFile(relativePath, text)
  }

  /** Emit via event bus if available (no-op if not provided). */
  protected emit<E, T extends ITouchEvent<E>>(
    ctx:
      | ModuleCreateContext<E>
      | ModuleInitContext<E>
      | ModuleStartContext<E>
      | ModuleStopContext<E>
      | ModuleDestroyContext<E>,
    event: E,
    args: T,
  ): void {
    ctx.events?.emit(event, args)
  }

  /** Subscribe via event bus if available (returns an unsubscribe fn if off exists, else no-op). */
  protected on<E>(
    ctx:
      | ModuleCreateContext<E>
      | ModuleInitContext<E>
      | ModuleStartContext<E>
      | ModuleStopContext<E>
      | ModuleDestroyContext<E>,
    event: E,
    handler: EventHandler,
  ): () => void {
    ctx.events?.on(event, handler)
    return () => ctx.events?.off(event, handler)
  }

  /** Get another module by key (typed at call site). */
  protected getByKey<T extends TalexTouch.IModule<E>>(
    ctx:
      | ModuleCreateContext<E>
      | ModuleInitContext<E>
      | ModuleStartContext<E>
      | ModuleStopContext<E>
      | ModuleDestroyContext<E>,
    key: ModuleKey,
  ): T | undefined {
    return ctx.manager.getModule<T>(key)
  }

  /** Helper to stringify this module's visible identity. */
  protected tag(): string {
    return `[${String(this.name.description ?? this.name)}]`
  }
}
