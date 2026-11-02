import type { FileParserChunk } from '@talex-touch/utils/electron/file-parsers'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import { and, eq, inArray } from 'drizzle-orm'
import * as schema from '../../../../../db/schema'
import { embeddings as embeddingsSchema } from '../../../../../db/schema'
import { IMAGE_EMBEDDING_EXTENSIONS } from '../constants'
import fs from 'node:fs/promises'
/** The one method the delete path needs; keeps callers free to pass a tx or a db. */
export type EmbeddingDbExecutor = Pick<LibSQLDatabase<typeof schema>, 'delete'>
const CODE_EXTENSIONS: Record<string, true> = {
  '.c': true,
  '.cpp': true,
  '.cc': true,
  '.m': true,
  '.mm': true,
  '.hpp': true,
  '.swift': true,
  '.php': true,
  '.rb': true,
  '.sh': true,
  '.bash': true,
  '.zsh': true,
  '.fish': true,
  '.bat': true,
  '.ps1': true,
  '.sql': true,
  '.js': true,
  '.jsx': true,
  '.ts': true,
  '.tsx': true,
  '.vue': true,
  '.py': true,
  '.go': true,
  '.rs': true,
  '.java': true,
  '.kt': true,
  '.cs': true
}

const DEV_PATH_PATTERN = /[\\/](node_modules|\.git|dist|build|coverage|\.next|\.nuxt|target)[\\/]/i
const TEST_FILE_PATTERN = /\.(test|spec)\.[a-z0-9]+$/i

export function isTextEmbeddingEligible(filePath: string, extension: string): boolean {
  const ext = extension.toLowerCase()
  if (CODE_EXTENSIONS[ext]) return false
  if (TEST_FILE_PATTERN.test(filePath)) return false
  if (DEV_PATH_PATTERN.test(filePath)) return false
  if (/[\\/]Workspace[\\/]/i.test(filePath)) {
    const DOCUMENT_EXTENSIONS: Record<string, true> = {
      '.txt': true,
      '.md': true,
      '.pdf': true,
      '.doc': true,
      '.docx': true,
      '.rtf': true
    }
    return Boolean(DOCUMENT_EXTENSIONS[ext])
  }
  return true
}

/**
 * The slice of `EmbeddingService` this service needs. Narrowed to keep the dependency
 * one-directional -- the embedding service knows nothing about index flushing.
 */
export interface FileProviderEmbeddingIndexPort {
  isAvailable: () => Promise<boolean>
  isImageReady?: () => boolean
  indexFiles: (
    files: Array<{
      fileId: string
      content?: string | null
      chunks?: FileParserChunk[]
      fileVersion?: number
      fileSize?: number | null
      image?: { path: string; mtime: number; size: number }
    }>,
    signal?: AbortSignal
  ) => Promise<{ indexed: number; skipped: number; failed: number; retryFileIds?: string[] }>
}

/** What a flush needs to know about the embeddings it just asked for. */
export interface FileProviderEmbeddingIndexOutcome {
  /** Text files whose vectors failed and may be tried again: their progress must stay pending. */
  retryFileIds: number[]
}

export interface FileProviderEmbeddingIndexServiceDeps {
  checkContentCapacity?: () => Promise<boolean>
  isPathAdmitted?: (filePath: string) => boolean
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
  private readonly deps: FileProviderEmbeddingIndexServiceDeps

  constructor(deps: FileProviderEmbeddingIndexServiceDeps) {
    this.deps = deps
    this.getEmbeddingService = deps.getEmbeddingService
    this.logDebug = deps.logDebug
  }

  /**
   * Embeds committed text entries and real image files. Image bytes never cross the worker;
   * only an authorized path plus the live filesystem identity reaches the host runtime.
   */
  async indexCommittedEntries(
    entries: IndexWorkerFileResult[]
  ): Promise<FileProviderEmbeddingIndexOutcome | void> {
    if (this.deps.checkContentCapacity && !(await this.deps.checkContentCapacity())) return
    const embeddingService = this.getEmbeddingService()
    if (!embeddingService) return

    let candidates: Array<{
      fileId: string
      content?: string | null
      chunks?: FileParserChunk[]
      fileVersion?: number
      fileSize?: number | null
      image?: { path: string; mtime: number; size: number }
    }> = []
    for (const entry of entries) {
      const extension = (entry.indexItem?.extension ?? '').toLowerCase()
      const content = entry.indexItem?.content
      const filePath = entry.indexItem?.path ?? ''
      if (content) {
        if (!isTextEmbeddingEligible(filePath, extension)) continue
        candidates.push({
          fileId: String(entry.fileId),
          content,
          chunks: entry.fileUpdate?.chunks?.slice(0, 16),
          fileVersion: entry.fileVersion,
          fileSize: entry.fileSize
        })
        continue
      }
      if (!IMAGE_EMBEDDING_EXTENSIONS.has(extension)) continue
      const imagePath = entry.indexItem?.path
      const dbMtime = entry.fileVersion
      const dbSize = entry.fileSize
      if (!imagePath || dbMtime == null || dbSize == null || dbSize < 0) continue
      if (this.deps.isPathAdmitted && !this.deps.isPathAdmitted(imagePath)) continue
      try {
        const stats = await fs.stat(imagePath)
        if (
          !stats.isFile() ||
          stats.size !== dbSize ||
          Math.floor(stats.mtimeMs / 1000) * 1000 !== dbMtime
        )
          continue
        candidates.push({
          fileId: String(entry.fileId),
          fileVersion: dbMtime,
          fileSize: dbSize,
          image: { path: imagePath, mtime: stats.mtimeMs, size: stats.size }
        })
      } catch {
        continue
      }
    }
    if (candidates.length === 0) return

    let hasText = candidates.some((candidate) => !candidate.image)
    if (hasText && !(await embeddingService.isAvailable())) {
      candidates = candidates.filter((candidate) => Boolean(candidate.image))
      return
    }
    if (
      candidates.some((candidate) => candidate.image) &&
      embeddingService.isImageReady &&
      !embeddingService.isImageReady()
    ) {
      candidates = candidates.filter((candidate) => !candidate.image)
      hasText = candidates.some((candidate) => !candidate.image)
      if (!hasText) return
    }

    const result = await embeddingService.indexFiles(candidates)
    if (result.indexed > 0 || result.failed > 0) {
      this.logDebug('Indexed embeddings for flushed batch', {
        indexed: result.indexed,
        skipped: result.skipped,
        failed: result.failed
      })
    }
    return { retryFileIds: (result.retryFileIds ?? []).map(Number) }
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
