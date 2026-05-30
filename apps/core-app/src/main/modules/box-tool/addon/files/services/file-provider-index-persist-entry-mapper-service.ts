import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import type { PersistEntry } from '../../../search-engine/workers/search-index-worker-client'

export class FileProviderIndexPersistEntryMapperService {
  map(entries: IndexWorkerFileResult[]): PersistEntry[] {
    return entries.map((entry) => ({
      fileId: entry.fileId,
      fileUpdate: entry.fileUpdate
        ? {
            content: entry.fileUpdate.content,
            embeddingStatus: entry.fileUpdate.embeddingStatus,
            embeddings: entry.fileUpdate.embeddings?.map((embedding) => ({
              model: embedding.model,
              vector: embedding.vector
            })),
            contentHash: entry.fileUpdate.contentHash ?? null
          }
        : null,
      progress: {
        status: entry.progress.status,
        progress: entry.progress.progress,
        processedBytes: entry.progress.processedBytes ?? null,
        totalBytes: entry.progress.totalBytes ?? null,
        lastError: entry.progress.lastError ?? null,
        startedAt: entry.progress.startedAt ?? null,
        updatedAt: entry.progress.updatedAt ?? null
      },
      indexItem: entry.indexItem
    }))
  }
}
