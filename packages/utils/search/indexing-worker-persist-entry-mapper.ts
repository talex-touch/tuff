export interface IndexedWorkerProgressLike {
  status: string;
  progress: number;
  processedBytes?: number | null;
  totalBytes?: number | null;
  lastError?: string | null;
  startedAt?: string | null;
  updatedAt?: string | null;
}

export interface IndexedWorkerEmbeddingLike {
  model: string;
  vector: number[];
}

export interface IndexedWorkerFileUpdateLike {
  content: string | null;
  embeddingStatus: string;
  embeddings?: IndexedWorkerEmbeddingLike[] | null;
  contentHash?: string | null;
}

export interface IndexedWorkerPersistEntryLike {
  fileId: number;
  fileUpdate: {
    content: string | null;
    embeddingStatus: string;
    embeddings?: IndexedWorkerEmbeddingLike[];
    contentHash: string | null;
  } | null;
  progress: {
    status: string;
    progress: number;
    processedBytes: number | null;
    totalBytes: number | null;
    lastError: string | null;
    startedAt: string | null;
    updatedAt: string | null;
  };
}

export interface IndexedWorkerPersistRecordLike {
  fileId: number;
  fileUpdate: IndexedWorkerFileUpdateLike | null;
  progress: IndexedWorkerProgressLike;
}

export class IndexedWorkerPersistEntryMapperService {
  map<TRecord extends IndexedWorkerPersistRecordLike>(
    records: TRecord[],
  ): IndexedWorkerPersistEntryLike[] {
    return records.map((record) => ({
      fileId: record.fileId,
      fileUpdate: this.mapFileUpdate(record.fileUpdate),
      progress: this.mapProgress(record.progress),
    }));
  }

  private mapFileUpdate(
    fileUpdate: IndexedWorkerFileUpdateLike | null,
  ): IndexedWorkerPersistEntryLike["fileUpdate"] {
    if (!fileUpdate) {
      return null;
    }

    return {
      content: fileUpdate.content,
      embeddingStatus: fileUpdate.embeddingStatus,
      embeddings: fileUpdate.embeddings?.map((embedding) => ({
        model: embedding.model,
        vector: embedding.vector,
      })),
      contentHash: fileUpdate.contentHash ?? null,
    };
  }

  private mapProgress(
    progress: IndexedWorkerProgressLike,
  ): IndexedWorkerPersistEntryLike["progress"] {
    return {
      status: progress.status,
      progress: progress.progress,
      processedBytes: progress.processedBytes ?? null,
      totalBytes: progress.totalBytes ?? null,
      lastError: progress.lastError ?? null,
      startedAt: progress.startedAt ?? null,
      updatedAt: progress.updatedAt ?? null,
    };
  }
}
