import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import { and, eq, inArray } from 'drizzle-orm'
import * as schema from '../../../../../db/schema'
import { embeddings as embeddingsSchema } from '../../../../../db/schema'

/** The one method the delete path needs; keeps callers free to pass a tx or a db. */
export type EmbeddingDbExecutor = Pick<LibSQLDatabase<typeof schema>, 'delete'>

/**
 * The slice of `EmbeddingService` this service needs. Narrowed to keep the dependency
 * one-directional -- the embedding service knows nothing about index flushing.
 */
export interface FileProviderEmbeddingIndexPort {
  isAvailable: () => Promise<boolean>
  indexFiles: (
    files: Array<{ fileId: string; content: string }>
  ) => Promise<{ indexed: number; skipped: number; failed: number }>
}

export interface FileProviderEmbeddingIndexServiceDeps {
  /** Returns `null` when no embedding provider was available at construction. */
  getEmbeddingService: () => FileProviderEmbeddingIndexPort | null
  logDebug: (message: string, meta?: Record<string, unknown>) => void
}

/**
 * Generates semantic embeddings for files an index flush just committed.
 *
 * This is the write side of semantic search. Without it the `embeddings` table stays empty
 * forever, `EmbeddingService.semanticSearch` early-returns on the empty row set, and the whole
 * deferred semantic-recall path is a no-op -- which is exactly the state audit finding B1
 * described: the read path shipped, its only data source never did.
 */
export class FileProviderEmbeddingIndexService {
  private readonly getEmbeddingService: FileProviderEmbeddingIndexServiceDeps['getEmbeddingService']
  private readonly logDebug: FileProviderEmbeddingIndexServiceDeps['logDebug']

  constructor(deps: FileProviderEmbeddingIndexServiceDeps) {
    this.getEmbeddingService = deps.getEmbeddingService
    this.logDebug = deps.logDebug
  }

  /**
   * Embeds the committed entries that carry content.
   *
   * `indexFiles` bills a metered provider per token, so this deliberately does not force the
   * capability on:
   * - no embedding service (provider unavailable at construction) -> nothing happens;
   * - `isAvailable()` probes once and caches, so an unconfigured install pays a single failed
   *   probe rather than one call per flushed batch;
   * - only files carrying extracted content are sent; an empty body has no semantics to capture
   *   and would be a wasted billable call.
   */
  async indexCommittedEntries(entries: IndexWorkerFileResult[]): Promise<void> {
    const embeddingService = this.getEmbeddingService()
    if (!embeddingService) return

    const candidates: Array<{ fileId: string; content: string }> = []
    for (const entry of entries) {
      const content = entry.indexItem?.content
      if (!content || content.length === 0) continue
      candidates.push({ fileId: String(entry.fileId), content })
    }
    if (candidates.length === 0) return

    if (!(await embeddingService.isAvailable())) return

    const result = await embeddingService.indexFiles(candidates)
    if (result.indexed > 0 || result.failed > 0) {
      this.logDebug('Indexed embeddings for flushed batch', {
        indexed: result.indexed,
        skipped: result.skipped,
        failed: result.failed
      })
    }
  }

  /**
   * Drops the embedding rows belonging to the given file ids.
   *
   * Takes the executor rather than owning a connection: callers run this inside the same
   * transaction that deletes the files themselves, so an embedding can never outlive the row
   * it points at.
   */
  async deleteByFileIds(executor: EmbeddingDbExecutor, fileIds: number[]): Promise<void> {
    if (fileIds.length === 0) return
    const sourceIds = fileIds.map((id) => String(id))
    await executor
      .delete(embeddingsSchema)
      .where(
        and(eq(embeddingsSchema.sourceType, 'file'), inArray(embeddingsSchema.sourceId, sourceIds))
      )
  }
}
