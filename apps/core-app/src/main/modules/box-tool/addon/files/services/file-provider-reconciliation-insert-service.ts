import { mapIndexedWriteReconciliationUpsertRecords } from '@talex-touch/utils/search'
import type { UpsertFileRecord } from '../../../search-engine/search-index-writer'

export interface FileProviderReconciliationDiskFile {
  path: string
  name: string
  extension: string | null
  size: number | null
  mtime: Date | number | string
  ctime: Date | number | string
}

export interface FileProviderReconciliationInsertResult {
  insertedCount: number
}

export interface FileProviderReconciliationInsertDeps<TContext> {
  /** One short source lease, fused metadata/FTS transaction, then visibility and publication. */
  persistAndPublish: (
    records: UpsertFileRecord[],
    context: TContext
  ) => Promise<{ insertedCount: number }>
  emitProgress: (current: number, total: number) => void
}

export class FileProviderReconciliationInsertService<TContext> {
  constructor(private readonly deps: FileProviderReconciliationInsertDeps<TContext>) {}

  async execute(
    filesToAdd: FileProviderReconciliationDiskFile[],
    context: TContext
  ): Promise<FileProviderReconciliationInsertResult> {
    const records = mapIndexedWriteReconciliationUpsertRecords(filesToAdd, {
      lastIndexedAt: new Date()
    })
    let insertedCount = 0
    for (let offset = 0; offset < records.length; offset += 10) {
      const result = await this.deps.persistAndPublish(records.slice(offset, offset + 10), context)
      insertedCount += result.insertedCount
      this.deps.emitProgress(insertedCount, filesToAdd.length)
    }
    return { insertedCount }
  }
}
