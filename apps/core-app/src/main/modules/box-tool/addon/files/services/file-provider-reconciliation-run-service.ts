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

/** What a root's scan produced, as reported by the scan itself. */
export interface FileProviderReconciliationScanStats {
  entryCount: number
  errorCount: number
}

/** Row census for one reconciliation root, taken after its scan finished. */
export interface FileProviderReconciliationRootRowCensus {
  /** Indexed file rows under the root. */
  total: number
  /** Rows the scan never saw — i.e. the deletions this round would perform. */
  missing: number
}

export type FileProviderReconciliationDeletionGuardDecision =
  | { allowed: true }
  | { allowed: false; reason: 'empty-scan-with-db-rows' | 'scan-errors-with-mass-deletion' }

/**
 * Deletion is the only irreversible half of reconciliation, and a scan that
 * "saw nothing" looks exactly like "the directory is empty". Both blocked cases
 * are unreadable-tree symptoms: revoked TCC permission, an unplugged volume, a
 * renamed root.
 *
 * - Zero scanned entries while the index still holds rows for the root: never
 *   trust it, whatever the error count says (a root that reads clean but empty
 *   still yields nothing to compare against).
 * - Scan errors present AND the round would remove more than half of the root:
 *   partial visibility, so the diff's "missing" set is not evidence of deletion.
 */
export function evaluateReconciliationDeletionGuard(input: {
  scannedEntries: number
  scanErrors: number
  dbRowCount: number
  plannedDeletions: number
}): FileProviderReconciliationDeletionGuardDecision {
  if (input.scannedEntries === 0 && input.dbRowCount > 0) {
    return { allowed: false, reason: 'empty-scan-with-db-rows' }
  }
  if (input.scanErrors > 0 && input.plannedDeletions * 2 > input.dbRowCount) {
    return { allowed: false, reason: 'scan-errors-with-mass-deletion' }
  }
  return { allowed: true }
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
  /**
   * `onStats` fires only for a run the scanner completed; a run that aborts
   * leaves the stats absent, which the deletion guard treats as "unknown".
   */
  scanDirectory: (
    rootPath: string,
    excludePathsSet: Set<string> | undefined,
    context: TContext,
    onStats: (stats: FileProviderReconciliationScanStats) => void
  ) => AsyncIterable<ScannedFileInfo[]>
  /** Row census under one root, read after its scan recorded the seen paths. */
  countRootRows: (
    rootPath: string,
    context: TContext
  ) => Promise<FileProviderReconciliationRootRowCensus>
  /**
   * Pre-flight for the whole round: a non-null reason stands the reconcile
   * down without touching a single row (no progress recorded either, so the
   * roots stay eligible for the next pass).
   */
  getDeferralReason: () => string | null
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
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
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

    const deferralReason = this.deps.getDeferralReason()
    if (deferralReason) {
      this.deps.logWarn('Reconciliation round deferred', undefined, {
        reason: deferralReason,
        paths: paths.length
      })
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
        let scannedEntries = 0
        const scanStats: { value: FileProviderReconciliationScanStats | null } = { value: null }
        try {
          for await (const scannedFiles of this.deps.scanDirectory(
            rootPath,
            options?.excludePathsSet,
            context,
            (stats) => {
              scanStats.value = stats
            }
          )) {
            scannedEntries += scannedFiles.length
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

          const census = await this.deps.countRootRows(rootPath, context)
          const scanErrors = scanStats.value?.errorCount
          const guard = evaluateReconciliationDeletionGuard({
            scannedEntries,
            scanErrors: scanErrors ?? 0,
            dbRowCount: census.total,
            plannedDeletions: census.missing
          })
          if (!guard.allowed) {
            this.deps.logWarn('Reconciliation deletion skipped to protect the index', undefined, {
              path: rootPath,
              reason: guard.reason,
              scannedEntries,
              scanErrors: scanErrors ?? null,
              dbRows: census.total,
              plannedDeletions: census.missing
            })
          } else {
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
