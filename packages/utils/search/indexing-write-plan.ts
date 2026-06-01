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

export interface IndexedWriteFullScanSourceRecord extends IndexedWriteIncomingRecord {
  path: string
  name: string
  extension?: string | null
  size?: number | null
  ctime: Date | number | string
  mtime: Date | number | string
}

export interface IndexedWriteFullScanUpsertRecord {
  path: string
  name: string
  extension: string | null
  size: number | null
  ctime: Date
  mtime: Date
  lastIndexedAt: Date
  isDir: boolean
  type: string
}

export type IndexedWriteReconciliationUpsertRecord = IndexedWriteFullScanUpsertRecord

export interface IndexedWriteReconciliationSourceRecord extends IndexedWriteIncomingRecord {
  path: string
  name: string
  extension?: string | null
  size?: number | null
  ctime: Date | number | string | null
  mtime: Date | number | string | null
}

export interface IndexedWriteReconciliationExistingRecord {
  id: number
  path: string
  mtime: Date | number | string | null
}

export interface IndexedWriteReconciliationDiskPayload {
  path: string
  name: string
  extension: string
  size: number
  mtime: number
  ctime: number
}

export interface IndexedWriteReconciliationDbPayload {
  id: number
  path: string
  mtime: number
}

export interface IndexedWriteReconciliationDiffResult<
  TDisk extends IndexedWriteReconciliationDiskPayload = IndexedWriteReconciliationDiskPayload
> {
  filesToAdd: TDisk[]
  filesToUpdate: Array<TDisk & { id: number }>
  deletedIds: number[]
}

export interface IndexedWriteWorkerFileSourceRecord extends IndexedWriteIncomingRecord {
  id?: number | null
  path: string
  name: string
  displayName?: string | null
  extension?: string | null
  size?: number | null
  ctime?: Date | number | string | null
  mtime?: Date | number | string | null
}

export interface IndexedWriteWorkerFilePayload {
  id: number
  path: string
  name: string
  displayName?: string | null
  extension?: string | null
  size?: number | null
  mtime: number
  ctime: number
}

export interface IndexedWritePathUpdateSourceRecord extends IndexedWriteIncomingRecord {
  path: string
}

export interface IndexedWritePathUpdateExistingRecord extends IndexedWriteExistingRecord {
  type?: string | null
}

export interface IndexedWritePathUpdateRecord extends IndexedWriteUpdateRecord {
  type: string
  isDir: boolean
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

export interface IndexedWriteManualSummary {
  total: number
  accepted: number
  inserted: number
  updated: number
  unchanged: number
}

export interface IndexedWriteManualContext {
  manualPaths: Set<string>
  manualTotal: number
}

export interface IndexedWriteManualEntryPayload {
  rawPath: string
  manual?: boolean
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
      ctime: toIndexedWriteDate(incoming.ctime),
      mtime: toIndexedWriteDate(incoming.mtime)
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

}

export function chunkIndexedWriteRecords<TRecord>(
  records: TRecord[],
  chunkSize: number
): TRecord[][] {
  const safeChunkSize = Math.max(1, Math.floor(chunkSize))
  const chunks: TRecord[][] = []
  for (let i = 0; i < records.length; i += safeChunkSize) {
    chunks.push(records.slice(i, i + safeChunkSize))
  }
  return chunks
}

export interface IndexedWriteRecordChunk<TRecord> {
  chunk: TRecord[]
  nextOffset: number
  chunkSize: number
}

export function takeIndexedWriteRecordChunk<TRecord>(
  records: TRecord[],
  offset: number,
  chunkSize: number
): IndexedWriteRecordChunk<TRecord> {
  const safeOffset = Math.max(0, Math.floor(offset))
  const safeChunkSize = Math.max(1, Math.floor(chunkSize))
  const chunk = records.slice(safeOffset, safeOffset + safeChunkSize)
  return {
    chunk,
    nextOffset: safeOffset + chunk.length,
    chunkSize: safeChunkSize
  }
}

export function buildIndexedWriteManualContext<TEntry extends readonly [unknown, IndexedWriteManualEntryPayload]>(
  entries: TEntry[],
  normalizePath: (rawPath: string) => string
): IndexedWriteManualContext {
  const manualPaths = new Set<string>()
  let manualTotal = 0
  for (const [, payload] of entries) {
    if (payload.manual !== true) {
      continue
    }
    manualTotal += 1
    manualPaths.add(normalizePath(payload.rawPath))
  }
  return { manualPaths, manualTotal }
}

export function buildEmptyIndexedWriteManualSummary(
  manualTotal: number
): IndexedWriteManualSummary {
  return {
    total: manualTotal,
    accepted: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0
  }
}

export function toIndexedWriteDate(value: Date | number | string | null | undefined): Date {
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

export function toIndexedWriteTimestamp(value: Date | number | string | null | undefined): number | null {
  if (value == null) {
    return null
  }
  if (value instanceof Date) {
    const timestamp = value.getTime()
    return Number.isFinite(timestamp) ? timestamp : null
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null
  }
  const parsed = new Date(value)
  const time = parsed.getTime()
  return Number.isFinite(time) ? time : null
}

export function mapIndexedWriteFullScanUpsertRecords<
  TRecord extends IndexedWriteFullScanSourceRecord
>(
  records: TRecord[],
  options: {
    lastIndexedAt?: Date | number | string | null
    isDir?: boolean
    type?: string
  } = {}
): IndexedWriteFullScanUpsertRecord[] {
  const lastIndexedAt = toIndexedWriteDate(options.lastIndexedAt ?? new Date())
  return records.map((record) => ({
    path: record.path,
    name: record.name,
    extension: record.extension || null,
    size: record.size || null,
    ctime: toIndexedWriteDate(record.ctime),
    mtime: toIndexedWriteDate(record.mtime),
    lastIndexedAt,
    isDir: options.isDir ?? false,
    type: options.type ?? 'file'
  }))
}

export function mapIndexedWriteReconciliationUpsertRecords<
  TRecord extends IndexedWriteFullScanSourceRecord
>(
  records: TRecord[],
  options: {
    lastIndexedAt: Date | number | string | null
    isDir?: boolean
    type?: string
  }
): IndexedWriteReconciliationUpsertRecord[] {
  const lastIndexedAt = toIndexedWriteDate(options.lastIndexedAt)
  return records.map((record) => ({
    path: record.path,
    name: record.name,
    extension: record.extension || null,
    size: record.size || null,
    ctime: toIndexedWriteDate(record.ctime),
    mtime: toIndexedWriteDate(record.mtime),
    lastIndexedAt,
    isDir: options.isDir ?? false,
    type: options.type ?? 'file'
  }))
}

export function mapIndexedWriteReconciliationDiskPayload<
  TRecord extends IndexedWriteReconciliationSourceRecord
>(records: TRecord[]): IndexedWriteReconciliationDiskPayload[] {
  return records.map((record) => ({
    path: record.path,
    name: record.name,
    extension: record.extension ?? '',
    size: record.size ?? 0,
    mtime: toIndexedWriteTimestamp(record.mtime) ?? 0,
    ctime: toIndexedWriteTimestamp(record.ctime) ?? 0
  }))
}

export function mapIndexedWriteReconciliationDbPayload<
  TRecord extends IndexedWriteReconciliationExistingRecord
>(records: TRecord[]): IndexedWriteReconciliationDbPayload[] {
  return records.map((record) => ({
    id: record.id,
    path: record.path,
    mtime: toIndexedWriteTimestamp(record.mtime) ?? 0
  }))
}

export function resolveIndexedWriteReconciliationDiff<
  TDisk extends IndexedWriteReconciliationDiskPayload,
  TDb extends IndexedWriteReconciliationDbPayload
>(
  diskFiles: TDisk[],
  dbFiles: TDb[],
  reconciliationPaths: string[]
): IndexedWriteReconciliationDiffResult<TDisk> {
  const dbMap = new Map<string, TDb>()
  for (const dbFile of dbFiles) {
    dbMap.set(dbFile.path, dbFile)
  }

  const filesToAdd: TDisk[] = []
  const filesToUpdate: Array<TDisk & { id: number }> = []
  const seenDiskPaths = new Set<string>()

  for (const diskFile of diskFiles) {
    if (seenDiskPaths.has(diskFile.path)) {
      continue
    }
    seenDiskPaths.add(diskFile.path)

    const dbFile = dbMap.get(diskFile.path)
    if (!dbFile) {
      filesToAdd.push(diskFile)
    } else if (diskFile.mtime > dbFile.mtime) {
      filesToUpdate.push({ ...diskFile, id: dbFile.id })
    }
    dbMap.delete(diskFile.path)
  }

  const deletedIds: number[] = []
  if (reconciliationPaths.length > 0) {
    for (const [filePath, dbFile] of dbMap.entries()) {
      if (matchesIndexedWriteReconciliationPath(reconciliationPaths, filePath)) {
        deletedIds.push(dbFile.id)
      }
    }
  }

  return { filesToAdd, filesToUpdate, deletedIds }
}

export function mapIndexedWriteWorkerFilePayload(
  record: IndexedWriteWorkerFileSourceRecord,
  options: {
    fallbackTimestamp?: Date | number | string | null
  } = {}
): IndexedWriteWorkerFilePayload | null {
  if (typeof record.id !== 'number') {
    return null
  }
  const fallbackTimestamp = toIndexedWriteTimestamp(options.fallbackTimestamp ?? Date.now())
  const safeFallbackTimestamp = fallbackTimestamp ?? 0
  return {
    id: record.id,
    path: record.path,
    name: record.name,
    displayName: record.displayName ?? null,
    extension: record.extension ?? null,
    size: typeof record.size === 'number' ? record.size : null,
    mtime: toIndexedWriteTimestamp(record.mtime) ?? safeFallbackTimestamp,
    ctime: toIndexedWriteTimestamp(record.ctime) ?? safeFallbackTimestamp
  }
}

export function mapIndexedWritePathUpdateRecord(
  record: IndexedWritePathUpdateSourceRecord,
  existing: IndexedWritePathUpdateExistingRecord,
  options: {
    isDir?: boolean
    type?: string
  } = {}
): IndexedWritePathUpdateRecord {
  return {
    id: existing.id,
    path: existing.path,
    name: record.name ?? '',
    extension: record.extension || null,
    size: record.size || null,
    ctime: toIndexedWriteDate(record.ctime),
    mtime: toIndexedWriteDate(record.mtime),
    type: options.type ?? existing.type ?? 'file',
    isDir: options.isDir ?? false
  }
}

function toTimestamp(value: Date | number | string | null | undefined): number | null {
  return toIndexedWriteTimestamp(value)
}

function matchesIndexedWriteReconciliationPath(paths: string[], targetPath: string): boolean {
  for (const prefix of paths) {
    if (targetPath.startsWith(prefix)) {
      return true
    }
  }
  return false
}
