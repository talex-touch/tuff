import type {
  IndexedWriteExistingRecord,
  IndexedWriteIncomingRecord,
  IndexedWritePlanServiceOptions,
  IndexedWriteUpdateRecord
} from '../../../search-engine/indexing-write-plan-service'
import { IndexedWritePlanService } from '../../../search-engine/indexing-write-plan-service'

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
    return {
      id: existing.id,
      path: existing.path,
      name: record.name ?? '',
      extension: record.extension || null,
      size: record.size || null,
      ctime: toDate(record.ctime),
      mtime: toDate(record.mtime),
      type: existing.type || 'file',
      isDir: false
    }
  }
}

function toDate(value: Date | number | string | null | undefined): Date {
  if (value instanceof Date) {
    return value
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) {
      return date
    }
  }
  return new Date(0)
}
