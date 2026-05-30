export interface FileProviderIncrementalFileRecord {
  path: string
  name?: string | null
  extension?: string | null
  size?: number | null
  ctime?: Date | number | string | null
  mtime?: Date | number | string | null
  lastIndexedAt?: Date | number | string | null
}

export interface FileProviderIncrementalExistingFileRecord extends FileProviderIncrementalFileRecord {
  id: number
  type?: string | null
  isDir?: boolean | null
}

export interface FileProviderIncrementalUpdateRecord {
  id: number
  path: string
  name: string
  extension: string | null
  size: number | null
  ctime: Date
  mtime: Date
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
  private readonly timestampToleranceMs: number
  private readonly normalizePath: FileProviderIncrementalWritePlannerOptions['normalizePath']

  constructor(options: FileProviderIncrementalWritePlannerOptions) {
    this.timestampToleranceMs = options.timestampToleranceMs ?? 1_000
    this.normalizePath = options.normalizePath
  }

  plan(input: {
    records: FileProviderIncrementalFileRecord[]
    existingRows: FileProviderIncrementalExistingFileRecord[]
    manualPaths: Set<string>
    manualTotal: number
  }): FileProviderIncrementalWritePlan {
    const existingMap = new Map(input.existingRows.map((row) => [row.path, row]))
    const filesToInsert: FileProviderIncrementalFileRecord[] = []
    const filesToUpdate: FileProviderIncrementalUpdateRecord[] = []
    let unchangedCount = 0

    for (const record of input.records) {
      const existing = existingMap.get(record.path)
      if (!existing) {
        filesToInsert.push(record)
        continue
      }

      if (this.hasRecordChanged(record, existing)) {
        filesToUpdate.push(this.toUpdateRecord(record, existing))
      } else {
        unchangedCount += 1
      }
    }

    const manualAccepted = input.records.reduce((count, record) => {
      return count + (input.manualPaths.has(this.normalizePath(record.path)) ? 1 : 0)
    }, 0)
    const manualInserted = filesToInsert.reduce((count, record) => {
      return count + (input.manualPaths.has(this.normalizePath(record.path)) ? 1 : 0)
    }, 0)
    const manualUpdated = filesToUpdate.reduce((count, record) => {
      return count + (input.manualPaths.has(this.normalizePath(record.path)) ? 1 : 0)
    }, 0)

    return {
      filesToInsert,
      filesToUpdate,
      unchangedCount,
      manual: {
        total: input.manualTotal,
        accepted: manualAccepted,
        inserted: manualInserted,
        updated: manualUpdated,
        unchanged: Math.max(0, manualAccepted - manualInserted - manualUpdated)
      }
    }
  }

  private hasRecordChanged(
    incoming: FileProviderIncrementalFileRecord,
    existing: FileProviderIncrementalExistingFileRecord
  ): boolean {
    if (!this.timestampsEqual(incoming.mtime, existing.mtime)) {
      return true
    }
    if (!this.timestampsEqual(incoming.ctime, existing.ctime)) {
      return true
    }
    if ((incoming.size ?? 0) !== (existing.size ?? 0)) {
      return true
    }
    if ((incoming.extension ?? '') !== (existing.extension ?? '')) {
      return true
    }
    if ((incoming.name ?? '') !== (existing.name ?? '')) {
      return true
    }
    return false
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
      ctime: this.toDate(record.ctime),
      mtime: this.toDate(record.mtime),
      type: existing.type || 'file',
      isDir: false
    }
  }

  private timestampsEqual(
    a: Date | number | string | null | undefined,
    b: Date | number | string | null | undefined
  ): boolean {
    const left = toTimestamp(a)
    const right = toTimestamp(b)
    if (left === null || right === null) {
      return left === right
    }
    return Math.abs(left - right) <= this.timestampToleranceMs
  }

  private toDate(value: Date | number | string | null | undefined): Date {
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
}

function toTimestamp(value: Date | number | string | null | undefined): number | null {
  if (!value) {
    return null
  }
  if (value instanceof Date) {
    return value.getTime()
  }
  if (typeof value === 'number') {
    return value
  }
  const parsed = new Date(value)
  const time = parsed.getTime()
  return Number.isNaN(time) ? null : time
}
