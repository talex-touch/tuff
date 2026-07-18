import type {
  FileProviderIncrementalExistingFileRecord,
  FileProviderIncrementalFileRecord,
  FileProviderIncrementalUpdateRecord,
  FileProviderIncrementalWritePlannerService
} from './file-provider-incremental-write-planner-service'
import {
  buildEmptyIndexedWriteManualSummary,
  buildIndexedWriteManualContext
} from '@talex-touch/utils/search'

export type FileProviderIncrementalChangeEntry = [
  string,
  { action: 'add' | 'change'; rawPath: string; manual?: boolean }
]

export interface FileProviderIncrementalWriteResult<TInserted, TUpdated> {
  inserted: TInserted[]
  updated: TUpdated[]
  unchangedCount: number
  manual: {
    total: number
    accepted: number
    inserted: number
    updated: number
    unchanged: number
  }
}

export interface FileProviderIncrementalWriteOptions {
  dispatchSideEffects?: boolean
}

export interface FileProviderIncrementalWriteServiceDeps<
  TRecord extends FileProviderIncrementalFileRecord,
  TExisting extends FileProviderIncrementalExistingFileRecord,
  TInserted,
  TUpdated
> {
  planner: FileProviderIncrementalWritePlannerService
  normalizePath: (filePath: string) => string
  buildRecord: (rawPath: string, options: { manualForce: boolean }) => Promise<TRecord | null>
  getExistingRows: (paths: string[]) => Promise<TExisting[]>
  insertRecords: (
    records: TRecord[],
    options: FileProviderIncrementalWriteOptions
  ) => Promise<TInserted[]>
  updateRecords: (
    records: FileProviderIncrementalUpdateRecord[],
    options: FileProviderIncrementalWriteOptions
  ) => Promise<TUpdated[]>
  logDebug: (message: string, meta?: Record<string, unknown>) => void
  logInfo: (message: string, meta?: Record<string, unknown>) => void
}

export class FileProviderIncrementalWriteService<
  TRecord extends FileProviderIncrementalFileRecord,
  TExisting extends FileProviderIncrementalExistingFileRecord,
  TInserted,
  TUpdated
> {
  private readonly planner: FileProviderIncrementalWriteServiceDeps<
    TRecord,
    TExisting,
    TInserted,
    TUpdated
  >['planner']
  private readonly normalizePath: FileProviderIncrementalWriteServiceDeps<
    TRecord,
    TExisting,
    TInserted,
    TUpdated
  >['normalizePath']
  private readonly buildRecord: FileProviderIncrementalWriteServiceDeps<
    TRecord,
    TExisting,
    TInserted,
    TUpdated
  >['buildRecord']
  private readonly getExistingRows: FileProviderIncrementalWriteServiceDeps<
    TRecord,
    TExisting,
    TInserted,
    TUpdated
  >['getExistingRows']
  private readonly insertRecords: FileProviderIncrementalWriteServiceDeps<
    TRecord,
    TExisting,
    TInserted,
    TUpdated
  >['insertRecords']
  private readonly updateRecords: FileProviderIncrementalWriteServiceDeps<
    TRecord,
    TExisting,
    TInserted,
    TUpdated
  >['updateRecords']
  private readonly logDebug: FileProviderIncrementalWriteServiceDeps<
    TRecord,
    TExisting,
    TInserted,
    TUpdated
  >['logDebug']
  private readonly logInfo: FileProviderIncrementalWriteServiceDeps<
    TRecord,
    TExisting,
    TInserted,
    TUpdated
  >['logInfo']

  constructor(
    deps: FileProviderIncrementalWriteServiceDeps<TRecord, TExisting, TInserted, TUpdated>
  ) {
    this.planner = deps.planner
    this.normalizePath = deps.normalizePath
    this.buildRecord = deps.buildRecord
    this.getExistingRows = deps.getExistingRows
    this.insertRecords = deps.insertRecords
    this.updateRecords = deps.updateRecords
    this.logDebug = deps.logDebug
    this.logInfo = deps.logInfo
  }

  async execute(
    entries: FileProviderIncrementalChangeEntry[],
    options: FileProviderIncrementalWriteOptions = {}
  ): Promise<FileProviderIncrementalWriteResult<TInserted, TUpdated>> {
    const manualContext = buildIndexedWriteManualContext(entries, this.normalizePath)

    const recordMap = new Map<string, TRecord>()
    for (const [, payload] of entries) {
      const record = await this.buildRecord(payload.rawPath, {
        manualForce: payload.manual === true
      })
      if (record) {
        recordMap.set(record.path, record)
      }
    }

    if (recordMap.size === 0) {
      const manual = buildEmptyIndexedWriteManualSummary(manualContext.manualTotal)
      this.logManualSummary(manual)
      return { inserted: [], updated: [], unchangedCount: 0, manual }
    }

    const targetPaths = Array.from(recordMap.keys())
    const existingRows = await this.getExistingRows(targetPaths)
    const writePlan = this.planner.plan({
      records: Array.from(recordMap.values()),
      existingRows,
      manualPaths: manualContext.manualPaths,
      manualTotal: manualContext.manualTotal
    })

    const inserted =
      writePlan.filesToInsert.length > 0
        ? await this.insertRecords(writePlan.filesToInsert as TRecord[], options)
        : []
    if (inserted.length > 0) {
      this.logDebug('Incremental index completed', { inserted: inserted.length })
    }

    const updated =
      writePlan.filesToUpdate.length > 0
        ? await this.updateRecords(writePlan.filesToUpdate, options)
        : []
    if (writePlan.filesToUpdate.length > 0) {
      this.logDebug('Incremental update completed', { updated: writePlan.filesToUpdate.length })
    }

    if (writePlan.unchangedCount > 0) {
      this.logDebug(
        `Skipped ${writePlan.unchangedCount} unchanged file(s) during incremental sync.`
      )
    }

    this.logManualSummary(writePlan.manual)

    return {
      inserted,
      updated,
      unchangedCount: writePlan.unchangedCount,
      manual: writePlan.manual
    }
  }

  private logManualSummary(
    summary: FileProviderIncrementalWriteResult<TInserted, TUpdated>['manual']
  ): void {
    if (summary.total === 0) {
      return
    }

    this.logInfo('Incremental manual summary', summary)
  }
}
