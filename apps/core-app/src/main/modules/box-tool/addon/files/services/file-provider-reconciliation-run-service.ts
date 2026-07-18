import {
  mapIndexedWriteReconciliationDbPayload,
  mapIndexedWriteReconciliationDiskPayload,
  toIndexedWriteDate
} from '@talex-touch/utils/search'
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
  assertActive: (context: TContext) => void
  prepareSeenPaths: (context: TContext) => Promise<void>
  recordSeenPaths: (paths: string[], context: TContext) => Promise<void>
  getDbFilesByPaths: (
    paths: string[],
    context: TContext
  ) => Promise<FileProviderReconciliationDbRecord[]>
  getMissingDbFiles: (
    rootPath: string,
    afterId: number,
    limit: number,
    context: TContext
  ) => Promise<FileProviderReconciliationDbRecord[]>
  clearSeenPaths: (context: TContext) => Promise<void>
  scanDirectory: (
    rootPath: string,
    excludePathsSet: Set<string> | undefined,
    context: TContext
  ) => AsyncIterable<ScannedFileInfo[]>
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

const RECONCILIATION_PAGE_SIZE = 500

export class FileProviderReconciliationRunService<TContext> {
  constructor(private readonly deps: FileProviderReconciliationRunDeps<TContext>) {}

  async execute(
    paths: string[],
    context: TContext,
    options?: { excludePathsSet?: Set<string> }
  ): Promise<FileProviderReconciliationRunResult> {
    if (paths.length === 0) {
      return { added: 0, changed: 0, deleted: 0, skipped: 0, completedPaths: [] }
    }

    const finishPerfContext = this.deps.enterPerfContext('FileProvider.reconciliation', {
      paths: paths.length
    })
    const reconciliationStart = this.deps.now()
    let added = 0
    let changed = 0
    let deleted = 0
    let skipped = 0
    const completedPaths: string[] = []

    try {
      this.deps.logDebug('Starting reconciliation scan', {
        count: paths.length,
        sample: paths.slice(0, 3).join(', ')
      })
      this.deps.emitProgress(0, paths.length)

      for (const rootPath of paths) {
        this.deps.assertActive(context)
        await this.deps.waitForIdle()
        await this.deps.prepareSeenPaths(context)
        try {
          for await (const scannedFiles of this.deps.scanDirectory(
            rootPath,
            options?.excludePathsSet,
            context
          )) {
            if (scannedFiles.length === 0) continue
            const diskPayload = mapIndexedWriteReconciliationDiskPayload(scannedFiles)
            const diskPaths = diskPayload.map((file) => file.path)
            await this.deps.recordSeenPaths(diskPaths, context)
            const dbFiles = await this.deps.getDbFilesByPaths(diskPaths, context)
            await this.deps.yieldAfterDbRead()
            const reconcileResult = await this.deps.reconcile(
              diskPayload,
              mapIndexedWriteReconciliationDbPayload(dbFiles),
              [rootPath]
            )

            if (reconcileResult.deletedIds.length > 0) {
              const deletedIdSet = new Set(reconcileResult.deletedIds)
              const deletedRecords = dbFiles
                .filter((file) => deletedIdSet.has(file.id))
                .map((file) => ({ id: file.id, path: file.path }))
              await this.deps.deleteRecords(deletedRecords, context)
              deleted += deletedRecords.length
            }

            const filesToUpdate = reconcileResult.filesToUpdate.map((file) => ({
              id: file.id,
              path: file.path,
              name: file.name,
              extension: file.extension,
              size: file.size,
              mtime: toIndexedWriteDate(file.mtime),
              ctime: toIndexedWriteDate(file.ctime),
              type: 'file' as const,
              isDir: false as const
            }))
            if (filesToUpdate.length > 0) {
              const result = await this.deps.updateRecords(filesToUpdate, context)
              changed += result.updatedCount
            }
            if (reconcileResult.filesToAdd.length > 0) {
              const result = await this.deps.insertRecords(reconcileResult.filesToAdd, context)
              added += result.insertedCount
            }
            skipped += Math.max(
              0,
              diskPayload.length -
                reconcileResult.filesToAdd.length -
                reconcileResult.filesToUpdate.length
            )
            await this.deps.yieldAfterPathScan()
          }

          let afterId = 0
          while (true) {
            const missingFiles = await this.deps.getMissingDbFiles(
              rootPath,
              afterId,
              RECONCILIATION_PAGE_SIZE,
              context
            )
            if (missingFiles.length === 0) break
            afterId = missingFiles[missingFiles.length - 1].id
            await this.deps.deleteRecords(
              missingFiles.map((file) => ({ id: file.id, path: file.path })),
              context
            )
            deleted += missingFiles.length
            await this.deps.yieldAfterDbRead()
          }
        } finally {
          await this.deps.clearSeenPaths(context).catch((error) => {
            this.deps.logDebug('Failed to clear reconciliation seen-path staging', { error })
          })
        }
        this.deps.assertActive(context)

        completedPaths.push(rootPath)
        this.deps.emitProgress(completedPaths.length, paths.length)
      }

      this.deps.logDebug('Reconciliation completed', {
        duration: this.deps.formatDuration(this.deps.now() - reconciliationStart),
        added,
        updated: changed,
        deleted
      })
      return { added, changed, deleted, skipped, completedPaths }
    } finally {
      finishPerfContext()
    }
  }
}
