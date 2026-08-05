import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../db/schema'
import type { BackgroundTask } from './background-task-service'
import { and, eq, inArray, lt } from 'drizzle-orm'
import { fileIndexProgress, files as filesSchema } from '../db/schema'
import { fileProviderLog } from '../utils/logger'

/**
 * Failed files cleanup task configuration options
 */
export interface FailedFilesCleanupTaskOptions {
  /** Maximum retry age in milliseconds */
  maxRetryAge: number
  /** Batch size */
  batchSize: number
  /** Maximum retry count */
  maxRetries: number
}

/**
 * Connection routing for the cleanup task. All handles/flags are resolved PER
 * CALL (never captured at construction): the previous constructor-captured
 * `createDbUtils(db)` predated the search split and kept the task pinned to
 * whatever connection existed at background-task registration time — the
 * aux/split resolver-timing trap class.
 */
export interface FailedFilesCleanupTaskDeps {
  /**
   * Split-aware read home for file-index state (`files` +
   * `file_index_progress` live in the worker-owned search-index.db when the
   * split is on; the primary otherwise).
   */
  getReadDb: () => LibSQLDatabase<typeof schema> | null
  /** Flag-off write connection (byte-identical legacy path). */
  getPrimaryDb: () => LibSQLDatabase<typeof schema> | null
  /** True when file-index tables live in the worker-owned search file. */
  isSearchSplitEnabled?: () => boolean
  /**
   * Forward delete statements to the search-index worker — the sole writer of
   * its DB file. Required when the split is on; the task fails closed (skips)
   * rather than writing the search file from the main thread.
   */
  execSearchIndexWrite?: (
    statements: Array<{ sql: string; args: unknown[] }>,
    mode?: 'single' | 'transaction'
  ) => Promise<unknown>
}

/**
 * Failed files cleanup task
 */
export class FailedFilesCleanupTask implements BackgroundTask {
  readonly id = 'failed-files-cleanup'
  readonly name = 'Failed Files Cleanup'
  readonly priority = 'low' as const
  readonly canInterrupt = true
  readonly estimatedDuration = 5 * 60 * 1000

  private readonly deps: FailedFilesCleanupTaskDeps
  private options: FailedFilesCleanupTaskOptions

  constructor(deps: FailedFilesCleanupTaskDeps, options: Partial<FailedFilesCleanupTaskOptions> = {}) {
    this.deps = deps
    this.options = {
      maxRetryAge: 24 * 60 * 60 * 1000, // 24小时
      batchSize: 100,
      maxRetries: 3,
      ...options
    }
  }

  async execute(): Promise<void> {
    const readDb = this.deps.getReadDb()
    if (!readDb) {
      throw new Error('Database utils not initialized')
    }

    this.logDebug('Starting failed files cleanup task')

    const startTime = Date.now()
    const cutoffTime = startTime - this.options.maxRetryAge

    try {
      const failedFiles = await readDb
        .select({
          id: fileIndexProgress.fileId,
          path: filesSchema.path,
          lastError: fileIndexProgress.lastError,
          updatedAt: fileIndexProgress.updatedAt
        })
        .from(fileIndexProgress)
        .innerJoin(filesSchema, eq(fileIndexProgress.fileId, filesSchema.id))
        .where(
          and(
            eq(fileIndexProgress.status, 'failed'),
            lt(fileIndexProgress.updatedAt, new Date(cutoffTime))
          )
        )
        .limit(this.options.batchSize)

      this.logDebug(`Found ${failedFiles.length} failed files to retry`)

      if (failedFiles.length === 0) {
        this.logDebug('No failed files to retry')
        return
      }

      const fileIds = failedFiles.map((f) => f.id)

      if (this.deps.isSearchSplitEnabled?.() === true) {
        // Split on: file_index_progress lives in the worker-owned search
        // file. Forward ONE delete through the worker (its sole writer); the
        // ids above came from the same home via getReadDb().
        const execWrite = this.deps.execSearchIndexWrite
        if (!execWrite) {
          throw new Error('FAILED_FILES_CLEANUP_REQUIRES_SEARCH_INDEX_WRITER')
        }
        const compiled = readDb
          .delete(fileIndexProgress)
          .where(inArray(fileIndexProgress.fileId, fileIds))
          .toSQL()
        await execWrite([{ sql: compiled.sql, args: compiled.params }], 'single')
      } else {
        // Flag off: byte-identical legacy path (per-id deletes on the
        // primary connection).
        const primaryDb = this.deps.getPrimaryDb()
        if (!primaryDb) {
          throw new Error('Database utils not initialized')
        }
        await primaryDb.delete(fileIndexProgress).where(eq(fileIndexProgress.fileId, fileIds[0]))

        for (let i = 1; i < fileIds.length; i++) {
          await primaryDb.delete(fileIndexProgress).where(eq(fileIndexProgress.fileId, fileIds[i]))
        }
      }

      const duration = Date.now() - startTime
      this.logDebug(`Completed failed files cleanup`, {
        processedFiles: failedFiles.length,
        duration: `${duration}ms`
      })
    } catch (error) {
      this.logError('Failed files cleanup task failed', error)
      throw error
    }
  }

  private logError(message: string, error?: unknown): void {
    if (error) {
      fileProviderLog.error(`[FailedFilesCleanupTask] ${message}`, error)
    } else {
      fileProviderLog.error(`[FailedFilesCleanupTask] ${message}`)
    }
  }

  private logDebug(message: string, meta?: Record<string, unknown>): void {
    fileProviderLog.debug(`[FailedFilesCleanupTask] ${message}`, meta)
  }
}

/**
 * Create failed files cleanup task
 * @param deps Per-call connection routing (split-aware)
 * @param options Configuration options
 * @returns Failed files cleanup task instance
 */
export function createFailedFilesCleanupTask(
  deps: FailedFilesCleanupTaskDeps,
  options?: Partial<FailedFilesCleanupTaskOptions>
): FailedFilesCleanupTask {
  return new FailedFilesCleanupTask(deps, options)
}
