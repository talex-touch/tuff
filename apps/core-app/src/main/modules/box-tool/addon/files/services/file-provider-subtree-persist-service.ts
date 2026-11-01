import type { IndexedFileSourceRecordRow, IndexedSourceRecord } from '@talex-touch/utils/search'
import { mapIndexedWriteFullScanUpsertRecords } from '@talex-touch/utils/search'
import { and, inArray } from 'drizzle-orm'
import { files as filesSchema, fileTypeIs } from '../../../../../db/schema'
import type { DbUtils } from '../../../../../db/utils'
import type { UpsertFileRecord } from '../../../search-engine/search-index-writer'
import { chunkArray } from '../constants'
import type {
  FileIndexedSourceRuntimeMutationDelegate,
  FileIndexRunOptions
} from '../file-provider-index-contracts'
import type { ScannedFileInfo } from '../types'
import type { FileProviderIncrementalWritePlannerService } from './file-provider-incremental-write-planner-service'
import type { FileProviderMaintenanceService } from './file-provider-maintenance-service'

type FileRow = typeof filesSchema.$inferSelect

// A mutation lease holds back searches and other writers, so it covers only a few records.
const SLICE_SIZE = 10

export async function readFileRowsByPath(
  dbUtils: Pick<DbUtils, 'getFileIndexReadDb'> | null,
  paths: string[]
): Promise<FileRow[]> {
  if (!dbUtils) throw new Error('FILE_PROVIDER_PERSISTENCE_UNAVAILABLE')
  return await dbUtils
    .getFileIndexReadDb()
    .select()
    .from(filesSchema)
    .where(and(fileTypeIs('file'), inArray(filesSchema.path, paths)))
}

export interface FileProviderSubtreePersistDeps {
  sourceId: string
  maintenance: Pick<FileProviderMaintenanceService, 'admitScanRecords' | 'withFileMutationSlice'>
  planner: Pick<FileProviderIncrementalWritePlannerService, 'plan'>
  readRows: (paths: string[]) => Promise<FileRow[]>
  mapRecord: (row: IndexedFileSourceRecordRow) => IndexedSourceRecord
  applyBatchWithPersistence: FileIndexedSourceRuntimeMutationDelegate['applyBatchWithPersistence']
  emitCommittedScanProgress: (
    committedRecordCount: number,
    options: FileIndexRunOptions
  ) => Promise<void>
}

/** Writes what a subtree scan found new or changed; records the index already holds never take a lease. */
export class FileProviderSubtreePersistService {
  constructor(private readonly deps: FileProviderSubtreePersistDeps) {}

  async persist(
    files: ScannedFileInfo[],
    options: FileIndexRunOptions
  ): Promise<{ added: number; changed: number }> {
    const records = mapIndexedWriteFullScanUpsertRecords(files, { lastIndexedAt: new Date() })
    let added = 0
    let changed = 0
    for (const chunk of chunkArray((await this.compare(records)).dirty, SLICE_SIZE)) {
      const result = await this.deps.maintenance.withFileMutationSlice(
        options,
        async (mutationLeaseId) => {
          // The rows may have moved since the first read.
          const { dirty, rows, inserted } = await this.compare(chunk)
          if (dirty.length === 0) return { added: 0, changed: 0, persistedCount: 0 }
          const existingByPath = new Map(rows.map((row) => [row.path, row]))
          const committed = await this.deps.applyBatchWithPersistence(
            {
              sourceId: this.deps.sourceId,
              mutationLeaseId,
              records: dirty.map((record) =>
                this.deps.mapRecord({ ...existingByPath.get(record.path), ...record })
              )
            },
            dirty
          )
          return {
            added: inserted,
            changed: committed.persistedCount - inserted,
            persistedCount: committed.persistedCount
          }
        }
      )
      added += result.added
      changed += result.changed
      await this.deps.emitCommittedScanProgress(result.persistedCount, options)
    }
    return { added, changed }
  }

  private async compare(
    records: UpsertFileRecord[]
  ): Promise<{ dirty: UpsertFileRecord[]; rows: FileRow[]; inserted: number }> {
    const accepted = await this.deps.maintenance.admitScanRecords(records)
    if (accepted.length === 0) return { dirty: [], rows: [], inserted: 0 }
    const rows = await this.deps.readRows(accepted.map((record) => record.path))
    const plan = this.deps.planner.plan({
      records: accepted,
      existingRows: rows,
      manualPaths: new Set<string>(),
      manualTotal: 0
    })
    const touched = new Set(
      [...plan.filesToInsert, ...plan.filesToUpdate].map((record) => record.path)
    )
    return {
      dirty: accepted.filter((record) => touched.has(record.path)),
      rows,
      inserted: plan.filesToInsert.length
    }
  }
}
