import type { PersistEntry } from './workers/search-index-worker-client'

export interface IndexedWorkerProgressLike {
  status: string
  progress: number
  processedBytes?: number | null
  totalBytes?: number | null
  lastError?: string | null
  startedAt?: string | null
  updatedAt?: string | null
}

export interface IndexedWorkerEmbeddingLike {
  model: string
  vector: number[]
}

export interface IndexedWorkerFileUpdateLike {
  content: string | null
  embeddingStatus: string
  embeddings?: IndexedWorkerEmbeddingLike[] | null
  contentHash?: string | null
}

export interface IndexedWorkerPersistRecordLike {
  fileId: number
  fileUpdate: IndexedWorkerFileUpdateLike | null
  progress: IndexedWorkerProgressLike
  indexItem: PersistEntry['indexItem']
}

export class IndexedWorkerPersistEntryMapperService<
  TRecord extends IndexedWorkerPersistRecordLike
> {
  map(records: TRecord[]): PersistEntry[] {
    return records.map((record) => ({
      fileId: record.fileId,
      fileUpdate: this.mapFileUpdate(record.fileUpdate),
      progress: this.mapProgress(record.progress),
      indexItem: record.indexItem
    }))
  }

  private mapFileUpdate(
    fileUpdate: IndexedWorkerFileUpdateLike | null
  ): PersistEntry['fileUpdate'] {
    if (!fileUpdate) {
      return null
    }

    return {
      content: fileUpdate.content,
      embeddingStatus: fileUpdate.embeddingStatus,
      embeddings: fileUpdate.embeddings?.map((embedding) => ({
        model: embedding.model,
        vector: embedding.vector
      })),
      contentHash: fileUpdate.contentHash ?? null
    }
  }

  private mapProgress(progress: IndexedWorkerProgressLike): PersistEntry['progress'] {
    return {
      status: progress.status,
      progress: progress.progress,
      processedBytes: progress.processedBytes ?? null,
      totalBytes: progress.totalBytes ?? null,
      lastError: progress.lastError ?? null,
      startedAt: progress.startedAt ?? null,
      updatedAt: progress.updatedAt ?? null
    }
  }
}
