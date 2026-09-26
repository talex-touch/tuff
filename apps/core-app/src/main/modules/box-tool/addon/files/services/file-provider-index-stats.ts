import type { FileIndexStats } from '@talex-touch/utils/transport/events/types'
import type { DbUtils } from '../../../../../db/utils'
import { and, eq, sql } from 'drizzle-orm'
import {
  embeddings as embeddingsSchema,
  fileIndexProgress,
  files as filesSchema
} from '../../../../../db/schema'
import { enterPerfContext } from '../../../../../utils/perf-context'

/**
 * The six `COUNT(*)` queries behind the file index's health numbers. Callers go through
 * `FileProvider.getIndexStats()`, which serves one snapshot per second to every reader; this is
 * the uncached read underneath it. Lives beside file-provider.ts rather than in it because that
 * file is on the module size ratchet (#343).
 */
export async function computeFileIndexStats(
  dbUtils: Pick<DbUtils, 'getFileIndexReadDb'> | null,
  sourceId: string
): Promise<FileIndexStats> {
  if (!dbUtils) {
    return {
      totalFiles: 0,
      failedFiles: 0,
      skippedFiles: 0,
      completedFiles: 0,
      embeddingCompletedFiles: 0,
      embeddingRows: 0
    }
  }

  const disposeStats = enterPerfContext(
    'FileProvider.computeIndexStats',
    {
      sourceId,
      queryCount: 6,
      readHome: 'file-index'
    },
    { mode: 'blocking' }
  )
  try {
    // Live index stats (files / progress / embeddings) belong to the
    // file-index domain — read the home the worker writes.
    const db = dbUtils.getFileIndexReadDb()

    const [
      totalFilesResult,
      failedFilesResult,
      skippedFilesResult,
      completedFilesResult,
      embeddingCompletedFilesResult,
      embeddingRowsResult
    ] = await Promise.all([
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(filesSchema)
        .where(eq(filesSchema.type, 'file')),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(fileIndexProgress)
        .where(eq(fileIndexProgress.status, 'failed')),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(fileIndexProgress)
        .where(eq(fileIndexProgress.status, 'skipped')),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(fileIndexProgress)
        .where(eq(fileIndexProgress.status, 'completed')),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(filesSchema)
        .where(and(eq(filesSchema.type, 'file'), eq(filesSchema.embeddingStatus, 'completed'))),
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(embeddingsSchema)
        .where(eq(embeddingsSchema.sourceType, 'file'))
    ])

    const totalFiles = totalFilesResult[0]?.count ?? 0
    const failedFiles = failedFilesResult[0]?.count ?? 0
    const skippedFiles = skippedFilesResult[0]?.count ?? 0
    const completedFiles = completedFilesResult[0]?.count ?? 0
    const embeddingCompletedFiles = embeddingCompletedFilesResult[0]?.count ?? 0
    const embeddingRows = embeddingRowsResult[0]?.count ?? 0

    return {
      totalFiles,
      failedFiles,
      skippedFiles,
      completedFiles,
      embeddingCompletedFiles,
      embeddingRows
    }
  } finally {
    disposeStats()
  }
}
