import {
  IndexedWriteDeleteExecutorService as SdkIndexedWriteDeleteExecutorService,
  type IndexedWriteDeleteExecutorResult,
  type IndexedWriteDeleteRecord
} from '@talex-touch/utils/search'

export type { IndexedWriteDeleteExecutorResult, IndexedWriteDeleteRecord }

export interface IndexedWriteDeleteExecutorDeps<TRecord extends IndexedWriteDeleteRecord> {
  normalizePath: (rawPath: string) => string
  findExisting: (paths: string[]) => Promise<TRecord[]>
  deleteRecords: (records: TRecord[]) => Promise<void>
  removeSearchIndexItems: (paths: string[]) => Promise<void>
  logDebug: (message: string, meta?: Record<string, unknown>) => void
  successMessage?: string
}

export class IndexedWriteDeleteExecutorService<TRecord extends IndexedWriteDeleteRecord> {
  private readonly executor: SdkIndexedWriteDeleteExecutorService<TRecord>

  constructor(deps: IndexedWriteDeleteExecutorDeps<TRecord>) {
    this.executor = new SdkIndexedWriteDeleteExecutorService({
      normalizePath: deps.normalizePath,
      findExisting: deps.findExisting,
      deleteRecords: deps.deleteRecords,
      removeIndexedArtifacts: deps.removeSearchIndexItems,
      logDebug: deps.logDebug,
      successMessage: deps.successMessage
    })
  }

  async execute(rawPaths: string[]): Promise<IndexedWriteDeleteExecutorResult<TRecord>> {
    return await this.executor.execute(rawPaths)
  }

  async executeExisting(existing: TRecord[]): Promise<IndexedWriteDeleteExecutorResult<TRecord>> {
    return await this.executor.executeExisting(existing)
  }
}
