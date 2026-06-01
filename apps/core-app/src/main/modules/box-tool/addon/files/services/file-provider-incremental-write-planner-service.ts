import type {
  IndexedWriteExistingRecord,
  IndexedWriteIncomingRecord,
  IndexedWritePlanServiceOptions,
  IndexedWriteUpdateRecord
} from '@talex-touch/utils/search'
import {
  IndexedWritePlanService,
  mapIndexedWritePathUpdateRecord
} from '@talex-touch/utils/search'

export type FileProviderIncrementalFileRecord = IndexedWriteIncomingRecord & {
  lastIndexedAt?: Date | number | string | null
}

export interface FileProviderIncrementalExistingFileRecord extends IndexedWriteExistingRecord {
  type?: string | null
  isDir?: boolean | null
}

export interface FileProviderIncrementalUpdateRecord extends IndexedWriteUpdateRecord {
  type: string
  isDir: boolean
}

export interface FileProviderIncrementalWritePlan {
  filesToInsert: FileProviderIncrementalFileRecord[]
  filesToUpdate: FileProviderIncrementalUpdateRecord[]
  unchangedCount: number
  manual: {
    total: number
    accepted: number
    inserted: number
    updated: number
    unchanged: number
  }
}

export interface FileProviderIncrementalWritePlannerOptions {
  timestampToleranceMs?: number
  normalizePath: (filePath: string) => string
}

export class FileProviderIncrementalWritePlannerService {
  private readonly planner: IndexedWritePlanService<
    FileProviderIncrementalFileRecord,
    FileProviderIncrementalExistingFileRecord,
    FileProviderIncrementalUpdateRecord
  >

  constructor(options: FileProviderIncrementalWritePlannerOptions) {
    this.planner = new IndexedWritePlanService({
      timestampToleranceMs: options.timestampToleranceMs,
      normalizePath: options.normalizePath,
      toUpdateRecord: (record, existing) => this.toUpdateRecord(record, existing)
    } satisfies IndexedWritePlanServiceOptions<
      FileProviderIncrementalFileRecord,
      FileProviderIncrementalExistingFileRecord,
      FileProviderIncrementalUpdateRecord
    >)
  }

  plan(input: {
    records: FileProviderIncrementalFileRecord[]
    existingRows: FileProviderIncrementalExistingFileRecord[]
    manualPaths: Set<string>
    manualTotal: number
  }): FileProviderIncrementalWritePlan {
    const plan = this.planner.plan(input)
    return {
      filesToInsert: plan.recordsToInsert,
      filesToUpdate: plan.recordsToUpdate,
      unchangedCount: plan.unchangedCount,
      manual: plan.manual
    }
  }

  private toUpdateRecord(
    record: FileProviderIncrementalFileRecord,
    existing: FileProviderIncrementalExistingFileRecord
  ): FileProviderIncrementalUpdateRecord {
    return mapIndexedWritePathUpdateRecord(record, existing)
  }
}
