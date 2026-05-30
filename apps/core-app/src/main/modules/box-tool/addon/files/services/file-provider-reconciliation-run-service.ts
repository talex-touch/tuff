import type { IndexedWriteDeleteRecord } from '../../../search-engine/indexing-write-delete-executor-service'
import type {
  ReconcileDbFile,
  ReconcileDiskFile,
  ReconcileResult
} from '../workers/file-reconcile-worker-client'
import type { ScannedFileInfo } from '../types'

export interface FileProviderReconciliationDbRecord {
  id: number
  path: string
  mtime: Date | number | string | null
}

export interface FileProviderReconciliationUpdateRecord {
  id: number
  path: string
  name: string
  extension: string | null
  size: number | null
  mtime: Date
  ctime: Date
  type: 'file'
  isDir: false
}

export interface FileProviderReconciliationRunResult {
  added: number
  changed: number
  deleted: number
  skipped: number
  completedPaths: string[]
}

export interface FileProviderReconciliationRunDeps<TContext> {
  enterPerfContext: (label: string, metadata: Record<string, unknown>) => () => void
  waitForIdle: () => Promise<void>
  getDbFiles: (paths: string[]) => Promise<FileProviderReconciliationDbRecord[]>
  scanDirectory: (rootPath: string, excludePathsSet?: Set<string>) => Promise<ScannedFileInfo[]>
  reconcile: (
    diskFiles: ReconcileDiskFile[],
    dbFiles: ReconcileDbFile[],
    reconciliationPaths: string[]
  ) => Promise<ReconcileResult>
  deleteRecords: (records: IndexedWriteDeleteRecord[], context: TContext) => Promise<unknown>
  updateRecords: (
    records: FileProviderReconciliationUpdateRecord[],
    context: TContext
  ) => Promise<{ updatedCount: number }>
  insertRecords: (
    records: ReconcileDiskFile[],
    context: TContext
  ) => Promise<{ insertedCount: number }>
  emitProgress: (current: number, total: number) => void
  yieldAfterDbRead: () => Promise<void>
  yieldAfterPathScan: () => Promise<void>
  now: () => number
  formatDuration: (durationMs: number) => string
  logDebug: (message: string, meta?: Record<string, unknown>) => void
}

export class FileProviderReconciliationRunService<TContext> {
  private readonly enterPerfContext: FileProviderReconciliationRunDeps<TContext>['enterPerfContext']
  private readonly waitForIdle: FileProviderReconciliationRunDeps<TContext>['waitForIdle']
  private readonly getDbFiles: FileProviderReconciliationRunDeps<TContext>['getDbFiles']
  private readonly scanDirectory: FileProviderReconciliationRunDeps<TContext>['scanDirectory']
  private readonly reconcile: FileProviderReconciliationRunDeps<TContext>['reconcile']
  private readonly deleteRecords: FileProviderReconciliationRunDeps<TContext>['deleteRecords']
  private readonly updateRecords: FileProviderReconciliationRunDeps<TContext>['updateRecords']
  private readonly insertRecords: FileProviderReconciliationRunDeps<TContext>['insertRecords']
  private readonly emitProgress: FileProviderReconciliationRunDeps<TContext>['emitProgress']
  private readonly yieldAfterDbRead: FileProviderReconciliationRunDeps<TContext>['yieldAfterDbRead']
  private readonly yieldAfterPathScan: FileProviderReconciliationRunDeps<TContext>['yieldAfterPathScan']
  private readonly now: FileProviderReconciliationRunDeps<TContext>['now']
  private readonly formatDuration: FileProviderReconciliationRunDeps<TContext>['formatDuration']
  private readonly logDebug: FileProviderReconciliationRunDeps<TContext>['logDebug']

  constructor(deps: FileProviderReconciliationRunDeps<TContext>) {
    this.enterPerfContext = deps.enterPerfContext
    this.waitForIdle = deps.waitForIdle
    this.getDbFiles = deps.getDbFiles
    this.scanDirectory = deps.scanDirectory
    this.reconcile = deps.reconcile
    this.deleteRecords = deps.deleteRecords
    this.updateRecords = deps.updateRecords
    this.insertRecords = deps.insertRecords
    this.emitProgress = deps.emitProgress
    this.yieldAfterDbRead = deps.yieldAfterDbRead
    this.yieldAfterPathScan = deps.yieldAfterPathScan
    this.now = deps.now
    this.formatDuration = deps.formatDuration
    this.logDebug = deps.logDebug
  }

  async execute(
    paths: string[],
    context: TContext,
    options?: { excludePathsSet?: Set<string> }
  ): Promise<FileProviderReconciliationRunResult> {
    if (paths.length === 0) {
      return { added: 0, changed: 0, deleted: 0, skipped: 0, completedPaths: [] }
    }

    const finishPerfContext = this.enterPerfContext('FileProvider.reconciliation', {
      paths: paths.length
    })
    const reconciliationStart = this.now()
    try {
      this.logDebug('Starting reconciliation scan', {
        count: paths.length,
        sample: paths.slice(0, 3).join(', ')
      })

      this.emitProgress(0, paths.length)
      await this.waitForIdle()

      const dbFiles = await this.getDbFiles(paths)
      await this.yieldAfterDbRead()

      const diskFiles: ScannedFileInfo[] = []
      let reconciledPaths = 0
      for (const rootPath of paths) {
        await this.waitForIdle()
        const scanned = await this.scanDirectory(rootPath, options?.excludePathsSet)
        diskFiles.push(...scanned)
        await this.yieldAfterPathScan()
        reconciledPaths += 1
        this.emitProgress(reconciledPaths, paths.length)
      }

      const diskPayload = this.toDiskPayload(diskFiles)
      const dbPayload = this.toDbPayload(dbFiles)
      const reconcileResult = await this.reconcile(diskPayload, dbPayload, paths)

      const filesToAdd = reconcileResult.filesToAdd
      const filesToUpdate = reconcileResult.filesToUpdate.map((file) => ({
        id: file.id,
        path: file.path,
        name: file.name,
        extension: file.extension,
        size: file.size,
        mtime: new Date(file.mtime),
        ctime: new Date(file.ctime),
        type: 'file' as const,
        isDir: false as const
      }))
      const deletedFileIds = reconcileResult.deletedIds

      if (deletedFileIds.length > 0) {
        const deletedIdSet = new Set(deletedFileIds)
        const deletedRecords = dbFiles
          .filter((file) => deletedIdSet.has(file.id))
          .map((file) => ({ id: file.id, path: file.path }))
        await this.deleteRecords(deletedRecords, context)
      }

      const updateResult =
        filesToUpdate.length > 0
          ? await this.updateRecords(filesToUpdate, context)
          : { updatedCount: 0 }
      const insertResult =
        filesToAdd.length > 0 ? await this.insertRecords(filesToAdd, context) : { insertedCount: 0 }

      this.logDebug('Reconciliation completed', {
        duration: this.formatDuration(this.now() - reconciliationStart),
        added: filesToAdd.length,
        updated: filesToUpdate.length,
        deleted: deletedFileIds.length
      })

      return {
        added: insertResult.insertedCount,
        changed: updateResult.updatedCount,
        deleted: deletedFileIds.length,
        skipped: Math.max(0, diskPayload.length - filesToAdd.length - filesToUpdate.length),
        completedPaths: paths
      }
    } finally {
      finishPerfContext()
    }
  }

  private toDiskPayload(files: ScannedFileInfo[]): ReconcileDiskFile[] {
    return files.map((file) => ({
      path: file.path,
      name: file.name,
      extension: file.extension,
      size: file.size,
      mtime: this.toTimestamp(file.mtime) ?? 0,
      ctime: this.toTimestamp(file.ctime) ?? 0
    }))
  }

  private toDbPayload(files: FileProviderReconciliationDbRecord[]): ReconcileDbFile[] {
    return files.map((file) => ({
      id: file.id,
      path: file.path,
      mtime: this.toTimestamp(file.mtime) ?? 0
    }))
  }

  private toTimestamp(value: Date | number | string | null | undefined): number | null {
    if (value == null) {
      return null
    }
    if (value instanceof Date) {
      return value.getTime()
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : null
    }
    const timestamp = new Date(value).getTime()
    return Number.isNaN(timestamp) ? null : timestamp
  }
}
