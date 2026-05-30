export interface IndexedWriteIncomingRecord {
  path: string
  name?: string | null
  extension?: string | null
  size?: number | null
  ctime?: Date | number | string | null
  mtime?: Date | number | string | null
}

export interface IndexedWriteExistingRecord extends IndexedWriteIncomingRecord {
  id: number
}

export interface IndexedWriteUpdateRecord {
  id: number
  path: string
  name: string
  extension: string | null
  size: number | null
  ctime: Date
  mtime: Date
}

export interface IndexedWritePlan<
  TIncoming extends IndexedWriteIncomingRecord,
  TUpdate extends IndexedWriteUpdateRecord = IndexedWriteUpdateRecord
> {
  recordsToInsert: TIncoming[]
  recordsToUpdate: TUpdate[]
  unchangedCount: number
  manual: {
    total: number
    accepted: number
    inserted: number
    updated: number
    unchanged: number
  }
}

export interface IndexedWritePlanServiceOptions<
  TIncoming extends IndexedWriteIncomingRecord,
  TExisting extends IndexedWriteExistingRecord,
  TUpdate extends IndexedWriteUpdateRecord = IndexedWriteUpdateRecord
> {
  timestampToleranceMs?: number
  normalizePath: (recordPath: string) => string
  toUpdateRecord?: (incoming: TIncoming, existing: TExisting) => TUpdate
}

export class IndexedWritePlanService<
  TIncoming extends IndexedWriteIncomingRecord,
  TExisting extends IndexedWriteExistingRecord,
  TUpdate extends IndexedWriteUpdateRecord = IndexedWriteUpdateRecord
> {
  private readonly timestampToleranceMs: number
  private readonly normalizePath: IndexedWritePlanServiceOptions<
    TIncoming,
    TExisting,
    TUpdate
  >['normalizePath']
  private readonly toUpdateRecord: NonNullable<
    IndexedWritePlanServiceOptions<TIncoming, TExisting, TUpdate>['toUpdateRecord']
  >

  constructor(options: IndexedWritePlanServiceOptions<TIncoming, TExisting, TUpdate>) {
    this.timestampToleranceMs = options.timestampToleranceMs ?? 1_000
    this.normalizePath = options.normalizePath
    this.toUpdateRecord =
      options.toUpdateRecord ??
      ((incoming, existing) => this.defaultUpdateRecord(incoming, existing) as TUpdate)
  }

  plan(input: {
    records: TIncoming[]
    existingRows: TExisting[]
    manualPaths: Set<string>
    manualTotal: number
  }): IndexedWritePlan<TIncoming, TUpdate> {
    const existingMap = new Map(input.existingRows.map((row) => [row.path, row]))
    const recordsToInsert: TIncoming[] = []
    const recordsToUpdate: TUpdate[] = []
    let unchangedCount = 0

    for (const record of input.records) {
      const existing = existingMap.get(record.path)
      if (!existing) {
        recordsToInsert.push(record)
        continue
      }

      if (this.hasRecordChanged(record, existing)) {
        recordsToUpdate.push(this.toUpdateRecord(record, existing))
      } else {
        unchangedCount += 1
      }
    }

    const manualAccepted = input.records.reduce((count, record) => {
      return count + (input.manualPaths.has(this.normalizePath(record.path)) ? 1 : 0)
    }, 0)
    const manualInserted = recordsToInsert.reduce((count, record) => {
      return count + (input.manualPaths.has(this.normalizePath(record.path)) ? 1 : 0)
    }, 0)
    const manualUpdated = recordsToUpdate.reduce((count, record) => {
      return count + (input.manualPaths.has(this.normalizePath(record.path)) ? 1 : 0)
    }, 0)

    return {
      recordsToInsert,
      recordsToUpdate,
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

  private hasRecordChanged(incoming: TIncoming, existing: TExisting): boolean {
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

  private defaultUpdateRecord(incoming: TIncoming, existing: TExisting): IndexedWriteUpdateRecord {
    return {
      id: existing.id,
      path: existing.path,
      name: incoming.name ?? '',
      extension: incoming.extension || null,
      size: incoming.size || null,
      ctime: this.toDate(incoming.ctime),
      mtime: this.toDate(incoming.mtime)
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
