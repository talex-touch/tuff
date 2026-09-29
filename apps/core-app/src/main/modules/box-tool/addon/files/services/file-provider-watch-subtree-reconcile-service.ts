import type {
  IndexedFileSourceRecordRow,
  IndexedSourceDelta,
  IndexedSourceReconcileRequest,
  IndexedSourceReconcileResult,
  IndexedSourceRecord,
  IndexedSourceWatchEvent
} from '@talex-touch/utils/search'
import { IndexedWriteRuntimeEmitterService } from '@talex-touch/utils/search'
import {
  FILE_SCAN_MAX_DEPTH,
  type FileScanOptions
} from '@talex-touch/utils/common/file-scan-constants'
import { fileFilterService } from '@talex-touch/utils/common/file-filter-service'
import { normalizeFsPath } from '@talex-touch/utils/common/file-scan-utils'
import { and, desc, eq, gt, lte, or, sql } from 'drizzle-orm'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { DbUtils } from '../../../../../db/utils'
import type { FileScanRunStats } from '../workers/file-scan-worker-client'
import type { ScannedFileInfo } from '../types'
import {
  FileProviderIncrementalWriteService,
  type FileProviderIncrementalChangeEntry
} from './file-provider-incremental-write-service'
import {
  FILE_WATCH_SUBTREE_RECONCILE_REASON,
  FileWatchSubtreeService
} from './file-watch-subtree-service'
import { files as filesSchema } from '../../../../../db/schema'
import type {
  IndexedWriteDeleteRecord,
  IndexedWriteDeleteExecutorResult
} from '../../../search-engine/indexing-write-delete-executor-service'

export interface FileProviderWatchSubtreeReconcileDeps {
  sourceId: string
  getDbUtils: () => DbUtils | null
  getWatchPaths: () => readonly string[]
  isShuttingDown: () => boolean
  ensureFileSystemWatchers: () => Promise<void>
  isWithinWatchRoots: (rawPath: string) => boolean
  getWatchDepthForPath: (watchPath: string) => number
  incrementalWriteService: FileProviderIncrementalWriteService<
    typeof filesSchema.$inferInsert,
    typeof filesSchema.$inferSelect,
    typeof filesSchema.$inferSelect,
    typeof filesSchema.$inferSelect
  >
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
    applyRuntime?: boolean
  ) => Promise<IndexedWriteDeleteExecutorResult<IndexedWriteDeleteRecord>>
  handleIncrementalAddsOrChanges: (
    entries: FileProviderIncrementalChangeEntry[],
    options?: { dispatchSideEffects?: boolean }
  ) => Promise<void>
  deleteReconciledRecords: (
    records: IndexedWriteDeleteRecord[]
  ) => Promise<IndexedWriteDeleteExecutorResult<IndexedWriteDeleteRecord>>
}

export class FileProviderWatchSubtreeReconcileService {
  private readonly sourceId: string
  private readonly getDbUtils: FileProviderWatchSubtreeReconcileDeps['getDbUtils']
  private readonly getWatchPaths: FileProviderWatchSubtreeReconcileDeps['getWatchPaths']
  private readonly isShuttingDown: FileProviderWatchSubtreeReconcileDeps['isShuttingDown']
  private readonly ensureFileSystemWatchers: FileProviderWatchSubtreeReconcileDeps['ensureFileSystemWatchers']
  private readonly isWithinWatchRoots: FileProviderWatchSubtreeReconcileDeps['isWithinWatchRoots']
  private readonly getWatchDepthForPath: FileProviderWatchSubtreeReconcileDeps['getWatchDepthForPath']
  private readonly incrementalWriteService: FileProviderWatchSubtreeReconcileDeps['incrementalWriteService']
  private readonly mapFileToIndexedSourceRecord: FileProviderWatchSubtreeReconcileDeps['mapFileToIndexedSourceRecord']
  private readonly scanDirectoryBatchesWithWorker: FileProviderWatchSubtreeReconcileDeps['scanDirectoryBatchesWithWorker']
  private readonly buildFileRecord: FileProviderWatchSubtreeReconcileDeps['buildFileRecord']
  private readonly handleIncrementalDeletes: FileProviderWatchSubtreeReconcileDeps['handleIncrementalDeletes']
  private readonly handleIncrementalAddsOrChanges: FileProviderWatchSubtreeReconcileDeps['handleIncrementalAddsOrChanges']
  private readonly deleteReconciledRecords: FileProviderWatchSubtreeReconcileDeps['deleteReconciledRecords']
  private readonly watchRuntimeEmitter: IndexedWriteRuntimeEmitterService<IndexedFileSourceRecordRow>

  constructor(deps: FileProviderWatchSubtreeReconcileDeps) {
    this.sourceId = deps.sourceId
    this.getDbUtils = deps.getDbUtils
    this.getWatchPaths = deps.getWatchPaths
    this.isShuttingDown = deps.isShuttingDown
    this.ensureFileSystemWatchers = deps.ensureFileSystemWatchers
    this.isWithinWatchRoots = deps.isWithinWatchRoots
    this.getWatchDepthForPath = deps.getWatchDepthForPath
    this.incrementalWriteService = deps.incrementalWriteService
    this.mapFileToIndexedSourceRecord = deps.mapFileToIndexedSourceRecord
    this.scanDirectoryBatchesWithWorker = deps.scanDirectoryBatchesWithWorker
    this.buildFileRecord = deps.buildFileRecord
    this.handleIncrementalDeletes = deps.handleIncrementalDeletes
    this.handleIncrementalAddsOrChanges = deps.handleIncrementalAddsOrChanges
    this.deleteReconciledRecords = deps.deleteReconciledRecords
    this.watchRuntimeEmitter = new IndexedWriteRuntimeEmitterService<IndexedFileSourceRecordRow>({
      sourceId: deps.sourceId,
      mapRecord: (record) => deps.mapFileToIndexedSourceRecord(record),
      getPath: (record) => record.path
    })
  }

  async reconcile(request: IndexedSourceReconcileRequest): Promise<IndexedSourceReconcileResult> {
    const startedAt = Date.now()
    await this.ensureFileSystemWatchers()
    const deltas: IndexedSourceDelta[] = []
    let added = 0
    let changed = 0
    let deleted = 0
    let skipped = 0

    for (const root of request.roots ?? []) {
      if (root.sourceId !== this.sourceId || !this.isWithinWatchRoots(root.path)) {
        skipped += 1
        continue
      }
      const result = await this.createFileWatchSubtreeService(request, deltas).execute(root.path, {
        signal: request.signal,
        batchSize: 256
      })
      added += result.added
      changed += result.changed
      deleted += result.deleted
      skipped += result.skipped
    }

    return {
      sourceId: this.sourceId,
      added,
      changed,
      deleted,
      skipped,
      errors: 0,
      deltas,
      startedAt,
      completedAt: Date.now(),
      reason: request.reason
    }
  }

  async handleWatchEvent(event: IndexedSourceWatchEvent): Promise<IndexedSourceDelta[]> {
    if (this.isShuttingDown() || !this.isWithinWatchRoots(event.path)) return []

    if (event.action === 'delete') {
      const deleted = await this.handleIncrementalDeletes([event.path], false)
      if (deleted.deletedPaths.length === 0) return []
      return [
        this.watchRuntimeEmitter.buildDeleteDelta(event.path, {
          reason: 'file-provider-watch-delete'
        })
      ]
    }

    await this.handleIncrementalAddsOrChanges(
      [[event.path, { action: event.action, rawPath: event.path }]],
      { dispatchSideEffects: false }
    )
    const record = await this.buildFileRecord(event.path)
    return record
      ? [
          this.watchRuntimeEmitter.buildDelta(record, {
            action: event.action,
            reason: 'file-provider-watch-event'
          })
        ]
      : []
  }

  private createFileWatchSubtreeService(
    request: IndexedSourceReconcileRequest,
    deltas: IndexedSourceDelta[]
  ): FileWatchSubtreeService<ScannedFileInfo> {
    return new FileWatchSubtreeService<ScannedFileInfo>({
      normalizePath: (rawPath) => normalizeCasePreservingPath(rawPath),
      isAdmitted: (rawPath) => this.isAdmittedFileWatchSubtreePath(rawPath),
      pathExists: (rawPath, signal) => this.pathExistsWithoutFinalSymlink(rawPath, signal),
      scan: (scope, signal) => this.scanFileWatchSubtree(scope, signal),
      upsert: async (_scope, records, signal) => {
        signal?.throwIfAborted()
        const result = await this.incrementalWriteService.execute(
          records.map(
            (record) => [record.path, { action: 'change', rawPath: record.path }] as const
          ),
          { dispatchSideEffects: false }
        )
        const changedRecords = [...result.inserted, ...result.updated]
        if (changedRecords.length > 0) {
          const batch = {
            sourceId: this.sourceId,
            records: changedRecords.map((record) => this.mapFileToIndexedSourceRecord(record))
          }
          if (request.onRecordBatch) {
            await request.onRecordBatch(batch)
          } else {
            const insertedIds = new Set(result.inserted.map((record) => record.id))
            for (const record of changedRecords) {
              const delta = this.watchRuntimeEmitter.buildDelta(record, {
                action: insertedIds.has(record.id) ? 'add' : 'change',
                reason: FILE_WATCH_SUBTREE_RECONCILE_REASON
              })
              if (request.onDelta) await request.onDelta(delta)
              else deltas.push(delta)
            }
          }
        }
        return { added: result.inserted.length, changed: result.updated.length }
      },
      getHighWaterMark: async (scope, signal) => {
        signal?.throwIfAborted()
        const dbUtils = this.getDbUtils()
        if (!dbUtils) return 0
        const rows = await dbUtils
          .getFileIndexReadDb()
          .select({ id: filesSchema.id })
          .from(filesSchema)
          .where(and(eq(filesSchema.type, 'file'), this.fileWatchScopeCondition(scope)))
          .orderBy(desc(filesSchema.id))
          .limit(1)
        return rows[0]?.id ?? 0
      },
      readPage: async (scope, afterId, throughId, limit, signal) => {
        signal?.throwIfAborted()
        const dbUtils = this.getDbUtils()
        if (!dbUtils) return []
        return await dbUtils
          .getFileIndexReadDb()
          .select({ id: filesSchema.id, path: filesSchema.path })
          .from(filesSchema)
          .where(
            and(
              eq(filesSchema.type, 'file'),
              this.fileWatchScopeCondition(scope),
              gt(filesSchema.id, afterId),
              lte(filesSchema.id, throughId)
            )
          )
          .orderBy(filesSchema.id)
          .limit(limit)
      },
      deleteRecords: async (records, signal) => {
        signal?.throwIfAborted()
        const deletedResult = await this.deleteReconciledRecords(records)
        for (const record of deletedResult.deletedPaths) {
          const delta = this.watchRuntimeEmitter.buildDeleteDelta(record, {
            reason: FILE_WATCH_SUBTREE_RECONCILE_REASON
          })
          if (request.onDelta) await request.onDelta(delta)
          else deltas.push(delta)
        }
      }
    })
  }

  private isAdmittedFileWatchSubtreePath(rawPath: string): boolean {
    if (!this.isWithinWatchRoots(rawPath)) return false

    let candidate = path.resolve(rawPath)
    while (true) {
      if (
        fileFilterService.getTraversalExclusionReason(candidate, undefined, {
          siblingNames: []
        }) !== null
      ) {
        return false
      }
      const parent = path.dirname(candidate)
      if (parent === candidate) return true
      candidate = parent
    }
  }

  private fileWatchScopeCondition(scope: string) {
    const normalizedScope = path.normalize(scope)
    const descendantPrefix = normalizedScope.endsWith(path.sep)
      ? normalizedScope
      : `${normalizedScope}${path.sep}`
    const escapedPrefix = descendantPrefix
      .replace(/!/g, '!!')
      .replace(/%/g, '!%')
      .replace(/_/g, '!_')
    const escapedLike = `${escapedPrefix}%`
    return or(
      eq(filesSchema.path, normalizedScope),
      sql`${filesSchema.path} LIKE ${escapedLike} ESCAPE '!'`
    )
  }

  private async *scanFileWatchSubtree(
    scope: string,
    signal?: AbortSignal
  ): AsyncIterable<ScannedFileInfo[]> {
    signal?.throwIfAborted()
    let stats
    try {
      stats = await fs.lstat(scope)
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT' || code === 'ENOTDIR') return
      throw error
    }
    if (stats.isSymbolicLink()) return
    if (!stats.isDirectory()) {
      const record = await this.buildFileRecord(scope)
      if (record) yield [record as ScannedFileInfo]
      return
    }
    yield* this.scanDirectoryBatchesWithWorker(scope, undefined, signal, undefined, {
      maxDepth: this.getRemainingWatchDepth(scope)
    })
  }
  private async pathExistsWithoutFinalSymlink(
    rawPath: string,
    signal?: AbortSignal
  ): Promise<boolean> {
    signal?.throwIfAborted()
    try {
      const stats = await fs.lstat(rawPath)
      return !stats.isSymbolicLink()
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT' || code === 'ENOTDIR') return false
      throw error
    }
  }

  private getRemainingWatchDepth(scope: string): number {
    const normalizedScope = path.resolve(scope)
    let remainingDepth = FILE_SCAN_MAX_DEPTH
    for (const watchRoot of this.getWatchPaths()) {
      const relative = path.relative(path.resolve(watchRoot), normalizedScope)
      if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
        continue
      const rootDepth = this.getWatchDepthForPath(watchRoot)
      const scopeDepth = relative === '' ? 0 : relative.split(path.sep).length
      remainingDepth = Math.min(remainingDepth, Math.max(0, rootDepth - scopeDepth))
    }
    return remainingDepth
  }
}

function normalizeCasePreservingPath(rawPath: string): string {
  return normalizeFsPath(path.resolve(rawPath))
}
