import { and, eq, gt, inArray, isNull, or } from 'drizzle-orm'
import type { DbUtils } from '../../../../../db/utils'
import { fileIndexProgress, files as filesSchema } from '../../../../../db/schema'

const RESUME_BATCH_SIZE = 200

type FileRecord = typeof filesSchema.$inferSelect

export interface FileProviderEnrichmentResumeServiceDeps {
  getDbUtils: () => DbUtils | null
  isSearchIndexAvailable: () => boolean
  isShuttingDown: () => boolean
  scheduleIndexing: (files: FileRecord[], reason: string) => void
  waitForSearchIndexDrain: (reason: string) => Promise<void>
  yieldToEventLoop: () => Promise<void>
  logInfo: (message: string, meta?: Record<string, unknown>) => void
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
}

/**
 * Resumes post-scan content/embedding work from durable file_index_progress
 * records. It deliberately does not alter scan_progress: that table proves
 * filesystem coverage, while this service repairs only unfinished enrichment.
 */
export class FileProviderEnrichmentResumeService {
  private resumePromise: Promise<void> | null = null

  constructor(private readonly deps: FileProviderEnrichmentResumeServiceDeps) {}

  resume(reason: string): void {
    if (this.deps.isShuttingDown() || this.resumePromise) return

    const run = this.run(reason)
      .catch((error) => {
        this.deps.logWarn('Deferred file enrichment recovery paused', error, { reason })
      })
      .finally(() => {
        if (this.resumePromise === run) this.resumePromise = null
      })
    this.resumePromise = run
  }

  private async run(reason: string): Promise<void> {
    const dbUtils = this.deps.getDbUtils()
    if (!dbUtils || !this.deps.isSearchIndexAvailable()) return

    let afterId = 0
    let scheduled = 0
    while (!this.deps.isShuttingDown()) {
      const rows = await dbUtils
        .getFileIndexReadDb()
        .select({
          id: filesSchema.id,
          path: filesSchema.path,
          name: filesSchema.name,
          displayName: filesSchema.displayName,
          extension: filesSchema.extension,
          size: filesSchema.size,
          mtime: filesSchema.mtime,
          ctime: filesSchema.ctime,
          lastIndexedAt: filesSchema.lastIndexedAt,
          isDir: filesSchema.isDir,
          type: filesSchema.type,
          content: filesSchema.content,
          embeddingStatus: filesSchema.embeddingStatus
        })
        .from(filesSchema)
        .leftJoin(fileIndexProgress, eq(fileIndexProgress.fileId, filesSchema.id))
        .where(
          and(
            eq(filesSchema.type, 'file'),
            gt(filesSchema.id, afterId),
            or(
              isNull(fileIndexProgress.fileId),
              inArray(fileIndexProgress.status, ['pending', 'processing'])
            )
          )
        )
        .orderBy(filesSchema.id)
        .limit(RESUME_BATCH_SIZE)

      if (rows.length === 0) break
      this.deps.scheduleIndexing(rows, `enrichment-resume.${reason}`)
      await this.deps.waitForSearchIndexDrain(`enrichment-resume.${reason}`)
      scheduled += rows.length
      afterId = rows[rows.length - 1]!.id
      await this.deps.yieldToEventLoop()
    }

    if (scheduled > 0) {
      this.deps.logInfo('Deferred file enrichment recovery completed', { reason, scheduled })
    }
  }
}
