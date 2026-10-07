import path from 'node:path'
import { sql } from 'drizzle-orm'
import type { DbUtils } from '../../../../../db/utils'
import {
  mapIndexedWriteReconciliationDbPayload,
  mapIndexedWriteReconciliationDiskPayload,
  toIndexedWriteDate
} from '@talex-touch/utils/search'
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
  ctime: Date | number | string | null
  size: number | null
  lastIndexedAt: Date | number | string | null
}

/** This cursor walks persistent file records, not a connection-local seen-path table. */
export async function getReconciliationFileRecordsPage(
  dbUtils: DbUtils,
  rootPath: string,
  afterId: number,
  limit: number
): Promise<FileProviderReconciliationDbRecord[]> {
  const root = path.normalize(rootPath)
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`
  const escapedPrefix = prefix.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_')
  return await dbUtils.getFileIndexReadDb().all<FileProviderReconciliationDbRecord>(sql`
    SELECT id, path, mtime, ctime, size, last_indexed_at AS lastIndexedAt
    FROM files
    WHERE type = 'file' AND id > ${afterId}
      AND (path = ${root} OR path LIKE ${`${escapedPrefix}%`} ESCAPE '!')
    ORDER BY id LIMIT ${Math.min(64, Math.max(1, limit))}
  `)
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

export interface FileProviderReconciliationScanStats {
  entryCount: number
  errorCount: number
}

export type FileProviderReconciliationDeletionGuardDecision =
  | { allowed: true }
  | { allowed: false; reason: 'empty-scan-with-db-rows' | 'scan-errors' | 'incomplete-scan' }

/** Missing, failed or partial scan evidence cannot authorize any proportion of deletion. */
export function evaluateReconciliationDeletionGuard(input: {
  scannedEntries: number
  scanErrors: number | undefined
  dbRowCount: number
  plannedDeletions: number
}): FileProviderReconciliationDeletionGuardDecision {
  if (input.scanErrors === undefined) return { allowed: false, reason: 'incomplete-scan' }
  if (input.scanErrors > 0) return { allowed: false, reason: 'scan-errors' }
  if (input.scannedEntries === 0 && input.dbRowCount > 0) {
    return { allowed: false, reason: 'empty-scan-with-db-rows' }
  }
  return { allowed: true }
}

export interface FileProviderReconciliationRunDeps<TContext> {
  enterPerfContext: (label: string, metadata: Record<string, unknown>) => () => void
  waitForIdle: (context: TContext) => Promise<void>
  assertActive: (context: TContext) => void
  getDbFilesByPaths: (
    paths: string[],
    context: TContext
  ) => Promise<FileProviderReconciliationDbRecord[]>
  scanDirectory: (
    rootPath: string,
    excludePathsSet: Set<string> | undefined,
    context: TContext,
    onStats: (stats: FileProviderReconciliationScanStats) => void
  ) => AsyncIterable<ScannedFileInfo[]>
  /** A LIMIT 1 existence query, never a second whole-root deletion census. */
  hasRootRows: (rootPath: string, context: TContext) => Promise<boolean>
  getDeferralReason: () => string | null
  reconcile: (
    diskFiles: ReconcileDiskFile[],
    dbFiles: ReconcileDbFile[],
    paths: string[]
  ) => Promise<ReconcileResult>
  /** Creates durable independent work and runs at most one budgeted round of it. */
  finishMissingScan: (
    rootPath: string,
    context: TContext,
    deadlineAt: number
  ) => Promise<{ deletedCount: number; done: boolean }>
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
  roundBudgetMs?: number
  formatDuration: (durationMs: number) => string
  logDebug: (message: string, meta?: Record<string, unknown>) => void
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
}

export class FileProviderReconciliationRunService<TContext> {
  constructor(private readonly deps: FileProviderReconciliationRunDeps<TContext>) {}

  async execute(
    paths: string[],
    context: TContext,
    options?: { excludePathsSet?: Set<string> }
  ): Promise<FileProviderReconciliationRunResult> {
    const result: FileProviderReconciliationRunResult = {
      added: 0,
      changed: 0,
      deleted: 0,
      skipped: 0,
      completedPaths: []
    }
    if (paths.length === 0) return result
    const deferralReason = this.deps.getDeferralReason()
    if (deferralReason) {
      this.deps.logWarn('Reconciliation round deferred', undefined, { reason: deferralReason })
      return result
    }
    const finish = this.deps.enterPerfContext('FileProvider.reconciliation', {
      paths: paths.length
    })
    const startedAt = this.deps.now()
    const missingDeadlineAt = startedAt + Math.max(0, this.deps.roundBudgetMs ?? 1_500)
    try {
      this.deps.emitProgress(0, paths.length)
      for (const rootPath of paths) {
        this.deps.assertActive(context)
        await this.deps.waitForIdle(context)
        let scannedEntries = 0
        const outcome: { stats: FileProviderReconciliationScanStats | null } = { stats: null }
        for await (const scannedFiles of this.deps.scanDirectory(
          rootPath,
          options?.excludePathsSet,
          context,
          (stats) => {
            outcome.stats = stats
          }
        )) {
          this.deps.assertActive(context)
          scannedEntries += scannedFiles.length
          if (scannedFiles.length === 0) continue
          const diskFiles = mapIndexedWriteReconciliationDiskPayload(scannedFiles)
          const dbFiles = await this.deps.getDbFilesByPaths(
            diskFiles.map((file) => file.path),
            context
          )
          await this.deps.yieldAfterDbRead()
          const diff = await this.deps.reconcile(
            diskFiles,
            mapIndexedWriteReconciliationDbPayload(dbFiles),
            [rootPath]
          )
          // A disk batch proves existence only for its own paths. Never use the
          // worker's per-batch deletedIds as whole-root absence evidence.
          if (diff.filesToUpdate.length > 0) {
            const updated = await this.deps.updateRecords(
              diff.filesToUpdate.map((file) => ({
                id: file.id,
                path: file.path,
                name: file.name,
                extension: file.extension,
                size: file.size,
                mtime: toIndexedWriteDate(file.mtime),
                ctime: toIndexedWriteDate(file.ctime),
                type: 'file',
                isDir: false
              })),
              context
            )
            result.changed += updated.updatedCount
          }
          if (diff.filesToAdd.length > 0) {
            const inserted = await this.deps.insertRecords(diff.filesToAdd, context)
            result.added += inserted.insertedCount
          }
          result.skipped += Math.max(
            0,
            diskFiles.length - diff.filesToAdd.length - diff.filesToUpdate.length
          )
          await this.deps.yieldAfterPathScan()
        }
        this.deps.assertActive(context)
        const guard = evaluateReconciliationDeletionGuard({
          scannedEntries,
          scanErrors: outcome.stats?.errorCount,
          dbRowCount:
            scannedEntries === 0 && (await this.deps.hasRootRows(rootPath, context)) ? 1 : 0,
          plannedDeletions: 0
        })
        if (!guard.allowed) {
          this.deps.logWarn('Reconciliation deletion skipped to protect the index', undefined, {
            path: rootPath,
            reason: guard.reason,
            scanErrors: outcome.stats?.errorCount ?? null
          })
          continue
        }
        const missing = await this.deps.finishMissingScan(rootPath, context, missingDeadlineAt)
        result.deleted += missing.deletedCount
        if (!missing.done) continue
        this.deps.assertActive(context)
        result.completedPaths.push(rootPath)
        this.deps.emitProgress(result.completedPaths.length, paths.length)
      }
      this.deps.logDebug('Reconciliation round completed', {
        duration: this.deps.formatDuration(this.deps.now() - startedAt),
        added: result.added,
        updated: result.changed,
        deleted: result.deleted
      })
      return result
    } finally {
      finish()
    }
  }
}
