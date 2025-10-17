import { BackgroundTask } from './background-task-service'
import { createDbUtils } from '../db/utils'
import { fileIndexProgress, files as filesSchema } from '../db/schema'
import { eq, and, lt } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type * as schema from '../db/schema'
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
 * Failed files cleanup task
 */
export class FailedFilesCleanupTask implements BackgroundTask {
  readonly id = 'failed-files-cleanup'
  readonly name = 'Failed Files Cleanup'
  readonly priority = 'low' as const
  readonly canInterrupt = true
  readonly estimatedDuration = 5 * 60 * 1000

  private dbUtils: ReturnType<typeof createDbUtils> | null = null
  private options: FailedFilesCleanupTaskOptions

  constructor(
    db: LibSQLDatabase<typeof schema>,
    options: Partial<FailedFilesCleanupTaskOptions> = {}
  ) {
    this.dbUtils = createDbUtils(db)
    this.options = {
      maxRetryAge: 24 * 60 * 60 * 1000, // 24小时
      batchSize: 100,
      maxRetries: 3,
      ...options
    }
  }

  async execute(): Promise<void> {
    if (!this.dbUtils) {
      throw new Error('Database utils not initialized')
    }

    this.logInfo('Starting failed files cleanup task')

    const startTime = Date.now()
    const cutoffTime = startTime - this.options.maxRetryAge

    try {
      const failedFiles = await this.dbUtils.getDb()
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

      this.logInfo(`Found ${failedFiles.length} failed files to retry`)

      if (failedFiles.length === 0) {
        this.logInfo('No failed files to retry')
        return
      }

      const fileIds = failedFiles.map((f) => f.id)
      await this.dbUtils.getDb()
        .delete(fileIndexProgress)
        .where(eq(fileIndexProgress.fileId, fileIds[0]))

      for (let i = 1; i < fileIds.length; i++) {
        await this.dbUtils.getDb()
          .delete(fileIndexProgress)
          .where(eq(fileIndexProgress.fileId, fileIds[i]))
      }

      const duration = Date.now() - startTime
      this.logInfo(`Completed failed files cleanup`, {
        processedFiles: failedFiles.length,
        duration: `${duration}ms`
      })
    } catch (error) {
      this.logError('Failed files cleanup task failed', error)
      throw error
    }
  }

  private logInfo(message: string, meta?: Record<string, unknown>): void {
    fileProviderLog.info(`[FailedFilesCleanupTask] ${message}`, meta)
  }

  private logError(message: string, error?: unknown): void {
    if (error) {
      fileProviderLog.error(`[FailedFilesCleanupTask] ${message}`, error)
    } else {
      fileProviderLog.error(`[FailedFilesCleanupTask] ${message}`)
    }
  }
}

/**
 * Create failed files cleanup task
 * @param db Database instance
 * @param options Configuration options
 * @returns Failed files cleanup task instance
 */
export function createFailedFilesCleanupTask(
  db: LibSQLDatabase<typeof schema>,
  options?: Partial<FailedFilesCleanupTaskOptions>
): FailedFilesCleanupTask {
  return new FailedFilesCleanupTask(db, options)
}
