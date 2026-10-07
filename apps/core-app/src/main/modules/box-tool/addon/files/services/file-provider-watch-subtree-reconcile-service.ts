import type {
  IndexedFileSourceRecordRow,
  IndexedSourceDelta,
  IndexedSourceReconcileRequest,
  IndexedSourceReconcileResult,
  IndexedSourceRecord,
  IndexedSourceWatchEvent
} from '@talex-touch/utils/search'
import {
  FILE_SCAN_MAX_DEPTH,
  type FileScanOptions
} from '@talex-touch/utils/common/file-scan-constants'
import { normalizeFsPath } from '@talex-touch/utils/common/file-scan-utils'
import { and, desc, eq, gt, lte, or, sql } from 'drizzle-orm'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { DbUtils } from '../../../../../db/utils'
import type { FileScanRunStats } from '../workers/file-scan-worker-client'
import type { ScannedFileInfo } from '../types'
import type { FileIndexRunOptions } from '../file-provider-index-contracts'
import type { FileProviderReconciliationDbRecord } from './file-provider-reconciliation-run-service'
import type { FileProviderIncrementalChangeEntry } from './file-provider-incremental-write-service'
import { FileWatchSubtreeService } from './file-watch-subtree-service'
import { files as filesSchema } from '../../../../../db/schema'
import type { IndexedWriteDeleteExecutorResult } from '../../../search-engine/indexing-write-delete-executor-service'

export interface FileProviderWatchSubtreeReconcileDeps {
  sourceId: string
  getDbUtils: () => DbUtils | null
  getWatchPaths: () => readonly string[]
  isShuttingDown: () => boolean
  ensureFileSystemWatchers: () => Promise<void>
  isWithinWatchRoots: (rawPath: string) => boolean
  isStaleIndexPath: (rawPath: string) => boolean
  getWatchDepthForPath: (watchPath: string) => number
  mapFileToIndexedSourceRecord: (record: IndexedFileSourceRecordRow) => IndexedSourceRecord
  scanDirectoryBatchesWithWorker: (
    dirPath: string,
    excludePathsSet?: Set<string>,
    signal?: AbortSignal,
    onStats?: (stats: FileScanRunStats) => void,
    options?: FileScanOptions
  ) => AsyncIterable<ScannedFileInfo[]>
  buildFileRecord: (
    rawPath: string,
    options?: { manualForce?: boolean }
  ) => Promise<typeof filesSchema.$inferInsert | null>
  handleIncrementalDeletes: (
    paths: string[],
    options: FileIndexRunOptions
  ) => Promise<IndexedWriteDeleteExecutorResult<FileProviderReconciliationDbRecord>>
  handleIncrementalAddsOrChanges: (
    entries: FileProviderIncrementalChangeEntry[],
    options?: { dispatchSideEffects?: boolean }
  ) => Promise<void>
  persistSubtreeRecords: (
    records: ScannedFileInfo[],
    options: FileIndexRunOptions
  ) => Promise<{ added: number; changed: number }>
  deleteReconciledRecords: (
    records: FileProviderReconciliationDbRecord[],
    options: FileIndexRunOptions
  ) => Promise<
    IndexedWriteDeleteExecutorResult<FileProviderReconciliationDbRecord> & { deferred: boolean }
  >
  pathAbsenceEvidence: (path: string) => Promise<'missing' | 'present' | 'unavailable'>
  canContinue: (options: FileIndexRunOptions) => boolean
  persistMissingScope: (scope: string) => Promise<void>
  getMissingCursor: (scope: string) => Promise<number>
  saveMissingCursor: (scope: string, cursor: number) => Promise<void>
  finishMissingScope: (scope: string) => Promise<void>
  resumeMaintenance: () => void
}

export class FileProviderWatchSubtreeReconcileService {
  constructor(private readonly deps: FileProviderWatchSubtreeReconcileDeps) {}

  async reconcile(request: IndexedSourceReconcileRequest): Promise<IndexedSourceReconcileResult> {
    const startedAt = Date.now()
    const maintenanceDeadlineAt = performance.now() + 1_500
    await this.deps.ensureFileSystemWatchers()
    let added = 0
    let changed = 0
    let deleted = 0
    let skipped = 0
    for (const root of request.roots ?? []) {
      request.signal?.throwIfAborted()
      if (
        root.sourceId !== this.deps.sourceId ||
        !this.deps.isWithinWatchRoots(root.path) ||
        this.deps.isStaleIndexPath(root.path)
      ) {
        skipped += 1
        continue
      }
      const options: FileIndexRunOptions = {
        maintenance: true,
        signal: request.signal,
        onRecordBatch: request.onRecordBatch,
        maintenanceDeadlineAt
      }
      const service = new FileWatchSubtreeService<
        ScannedFileInfo,
        FileProviderReconciliationDbRecord
      >({
        normalizePath: (rawPath) => normalizeFsPath(path.resolve(rawPath)),
        isAdmitted: (rawPath) =>
          this.deps.isWithinWatchRoots(rawPath) && !this.deps.isStaleIndexPath(rawPath),
        pathExists: async (rawPath, signal) => {
          signal?.throwIfAborted()
          const evidence = await this.deps.pathAbsenceEvidence(rawPath)
          if (evidence === 'unavailable') throw new Error('FILE_WATCH_SUBTREE_PATH_UNAVAILABLE')
          return evidence === 'present'
        },
        scan: (scope, signal) => this.scanSubtree(scope, signal),
        upsert: (_scope, records, signal) =>
          this.deps.persistSubtreeRecords(records, { ...options, signal }),
        getHighWaterMark: async (scope, signal) => {
          signal?.throwIfAborted()
          const dbUtils = this.deps.getDbUtils()
          if (!dbUtils) throw new Error('FILE_PROVIDER_PERSISTENCE_UNAVAILABLE')
          const rows = await dbUtils
            .getFileIndexReadDb()
            .select({ id: filesSchema.id })
            .from(filesSchema)
            .where(and(eq(filesSchema.type, 'file'), this.scopeCondition(scope)))
            .orderBy(desc(filesSchema.id))
            .limit(1)
          return rows[0]?.id ?? 0
        },
        readPage: async (scope, afterId, throughId, limit, signal) => {
          signal?.throwIfAborted()
          const dbUtils = this.deps.getDbUtils()
          if (!dbUtils) throw new Error('FILE_PROVIDER_PERSISTENCE_UNAVAILABLE')
          return await dbUtils
            .getFileIndexReadDb()
            .select({
              id: filesSchema.id,
              path: filesSchema.path,
              mtime: filesSchema.mtime,
              ctime: filesSchema.ctime,
              size: filesSchema.size,
              lastIndexedAt: filesSchema.lastIndexedAt
            })
            .from(filesSchema)
            .where(
              and(
                eq(filesSchema.type, 'file'),
                this.scopeCondition(scope),
                gt(filesSchema.id, afterId),
                lte(filesSchema.id, throughId)
              )
            )
            .orderBy(filesSchema.id)
            .limit(limit)
        },
        deleteRecords: async (records, signal) => {
          const result = await this.deps.deleteReconciledRecords(records, { ...options, signal })
          return { deletedCount: result.deleted.length, deferred: result.deferred }
        },
        beginMissingSweep: (scope) => this.deps.persistMissingScope(scope),
        loadCursor: (scope) => this.deps.getMissingCursor(scope),
        saveCursor: (scope, cursor) => this.deps.saveMissingCursor(scope, cursor),
        finishMissingSweep: (scope) => this.deps.finishMissingScope(scope),
        canContinue: () => this.deps.canContinue(options)
      })
      const result = await service.execute(root.path, { signal: request.signal, batchSize: 64 })
      added += result.added
      changed += result.changed
      deleted += result.deleted
      skipped += result.skipped
      if (result.deferred) this.deps.resumeMaintenance()
    }
    return {
      sourceId: this.deps.sourceId,
      added,
      changed,
      deleted,
      skipped,
      errors: 0,
      // Fused producer commits already crossed visibility and published. Returning
      // delete deltas here would delete the same FTS documents a second time.
      deltas: [],
      startedAt,
      completedAt: Date.now(),
      reason: request.reason
    }
  }

  async handleWatchEvent(event: IndexedSourceWatchEvent): Promise<IndexedSourceDelta[]> {
    if (this.deps.isShuttingDown() || !this.deps.isWithinWatchRoots(event.path)) return []
    if (event.action === 'delete') {
      await this.deps.handleIncrementalDeletes([event.path], {
        maintenance: false,
        mutationLeaseId: event.mutationLeaseId
      })
      return []
    }
    await this.deps.handleIncrementalAddsOrChanges(
      [[event.path, { action: event.action, rawPath: event.path }]],
      { dispatchSideEffects: false }
    )
    const row = await this.deps.buildFileRecord(event.path)
    if (!row) return []
    const record = this.deps.mapFileToIndexedSourceRecord(row)
    return [
      {
        sourceId: this.deps.sourceId,
        action: event.action,
        record,
        stableKey: record.stableKey,
        path: event.path,
        reason: 'file-provider-watch-event'
      }
    ]
  }

  private scopeCondition(scope: string) {
    const normalized = path.normalize(scope)
    const prefix = normalized.endsWith(path.sep) ? normalized : `${normalized}${path.sep}`
    const escaped = prefix.replace(/!/g, '!!').replace(/%/g, '!%').replace(/_/g, '!_')
    return or(
      eq(filesSchema.path, normalized),
      sql`${filesSchema.path} LIKE ${`${escaped}%`} ESCAPE '!'`
    )
  }

  private async *scanSubtree(
    scope: string,
    signal?: AbortSignal
  ): AsyncIterable<ScannedFileInfo[]> {
    signal?.throwIfAborted()
    const stats = await fs.lstat(scope)
    if (stats.isSymbolicLink()) throw new Error('FILE_WATCH_SUBTREE_SYMBOLIC_LINK')
    if (!stats.isDirectory()) {
      const row = await this.deps.buildFileRecord(scope)
      if (row) yield [row as ScannedFileInfo]
      return
    }
    const outcome: { stats: FileScanRunStats | null } = { stats: null }
    yield* this.deps.scanDirectoryBatchesWithWorker(
      scope,
      undefined,
      signal,
      (value) => {
        outcome.stats = value
      },
      { maxDepth: this.remainingWatchDepth(scope) }
    )
    signal?.throwIfAborted()
    if (!outcome.stats || outcome.stats.errorCount > 0)
      throw new Error('FILE_WATCH_SUBTREE_SCAN_INCOMPLETE')
  }

  private remainingWatchDepth(scope: string): number {
    const normalizedScope = path.resolve(scope)
    let remainingDepth = FILE_SCAN_MAX_DEPTH
    for (const root of this.deps.getWatchPaths()) {
      const relative = path.relative(path.resolve(root), normalizedScope)
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
        continue
      const depth = relative === '' ? 0 : relative.split(path.sep).length
      remainingDepth = Math.min(
        remainingDepth,
        Math.max(0, this.deps.getWatchDepthForPath(root) - depth)
      )
    }
    return remainingDepth
  }
}
