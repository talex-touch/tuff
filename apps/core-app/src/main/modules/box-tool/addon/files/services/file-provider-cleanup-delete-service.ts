import { IndexedWriteRuntimeEmitterService } from '@talex-touch/utils/search'
import type { IndexedSourceDelta } from '@talex-touch/utils/search'
import {
  IndexedWriteDeleteExecutorService,
  type IndexedWriteDeleteRecord
} from '../../../search-engine/indexing-write-delete-executor-service'

export interface FileProviderCleanupDeleteResult {
  deletedCount: number
  /** Stale rows seen but left for a later pass because the budget ran out. */
  stalePendingCount: number
}

const DEFAULT_STALE_DELETE_BUDGET_MS = 8_000

export interface FileProviderCleanupDeleteDeps<TRecord extends IndexedWriteDeleteRecord, TContext> {
  sourceId: string
  getIndexedFileRecordsPage: (
    afterId: number,
    limit: number,
    context: TContext
  ) => Promise<TRecord[]>
  isWithinWatchRoots: (filePath: string) => boolean
  /**
   * Rows the traversal rules would refuse today although they were admitted when indexed (a rule
   * added or anchored after the fact). Optional: without it only root-less rows are removed.
   */
  isStaleIndexPath?: (filePath: string) => boolean
  /**
   * Wall-clock budget for removing stale rows in one pass. A row's removal walks the FTS table
   * (its `item_id` column is UNINDEXED), so a backlog of 200k stale rows would hold startup for
   * hours; past the budget the pass counts what is left and the next boot continues. Root-less
   * rows are not budgeted: they were always removed in full.
   */
  staleDeleteBudgetMs?: number
  yieldAfterRead: () => Promise<void>
  deleteRecords: (records: TRecord[]) => Promise<void>
  emitDelta: (delta: IndexedSourceDelta, context: TContext) => Promise<void> | void
  emitProgress: (current: number, total: number) => void
  now: () => number
  formatDuration: (durationMs: number) => string
  logInfo: (message: string, meta?: Record<string, unknown>) => void
  logDebug: (message: string, meta?: Record<string, unknown>) => void
}

export class FileProviderCleanupDeleteService<TRecord extends IndexedWriteDeleteRecord, TContext> {
  private readonly getIndexedFileRecordsPage: FileProviderCleanupDeleteDeps<
    TRecord,
    TContext
  >['getIndexedFileRecordsPage']
  private readonly isWithinWatchRoots: FileProviderCleanupDeleteDeps<
    TRecord,
    TContext
  >['isWithinWatchRoots']
  private readonly isStaleIndexPath: FileProviderCleanupDeleteDeps<
    TRecord,
    TContext
  >['isStaleIndexPath']
  private readonly staleDeleteBudgetMs: number
  private readonly yieldAfterRead: FileProviderCleanupDeleteDeps<
    TRecord,
    TContext
  >['yieldAfterRead']
  private readonly deleteRecords: FileProviderCleanupDeleteDeps<TRecord, TContext>['deleteRecords']
  private readonly emitProgress: FileProviderCleanupDeleteDeps<TRecord, TContext>['emitProgress']
  private readonly now: FileProviderCleanupDeleteDeps<TRecord, TContext>['now']
  private readonly formatDuration: FileProviderCleanupDeleteDeps<
    TRecord,
    TContext
  >['formatDuration']
  private readonly logInfo: FileProviderCleanupDeleteDeps<TRecord, TContext>['logInfo']
  private readonly logDebug: FileProviderCleanupDeleteDeps<TRecord, TContext>['logDebug']
  private readonly runtimeEmitter: IndexedWriteRuntimeEmitterService<TRecord, TContext>

  constructor(deps: FileProviderCleanupDeleteDeps<TRecord, TContext>) {
    this.getIndexedFileRecordsPage = deps.getIndexedFileRecordsPage
    this.isWithinWatchRoots = deps.isWithinWatchRoots
    this.isStaleIndexPath = deps.isStaleIndexPath
    this.staleDeleteBudgetMs = deps.staleDeleteBudgetMs ?? DEFAULT_STALE_DELETE_BUDGET_MS
    this.yieldAfterRead = deps.yieldAfterRead
    this.deleteRecords = deps.deleteRecords
    this.emitProgress = deps.emitProgress
    this.now = deps.now
    this.formatDuration = deps.formatDuration
    this.logInfo = deps.logInfo
    this.logDebug = deps.logDebug
    this.runtimeEmitter = new IndexedWriteRuntimeEmitterService({
      sourceId: deps.sourceId,
      defaultDeltaReason: 'file-provider-cleanup-delete',
      emitDelta: deps.emitDelta
    })
  }

  async execute(context: TContext): Promise<FileProviderCleanupDeleteResult> {
    const cleanupStart = this.now()
    this.logInfo('Cleaning stale index entries from removed watch paths')
    this.emitProgress(0, 1)

    let afterId = 0
    let deletedCount = 0
    let stalePendingCount = 0
    let staleDeleteElapsedMs = 0
    while (true) {
      const page = await this.getIndexedFileRecordsPage(afterId, 500, context)
      if (page.length === 0) break
      afterId = page[page.length - 1].id
      const filesToDelete: TRecord[] = []
      let staleInPage = 0
      for (const file of page) {
        if (!this.isWithinWatchRoots(file.path)) {
          filesToDelete.push(file)
          continue
        }
        if (this.isStaleIndexPath?.(file.path) !== true) continue
        if (staleDeleteElapsedMs >= this.staleDeleteBudgetMs) {
          stalePendingCount += 1
          continue
        }
        filesToDelete.push(file)
        staleInPage += 1
      }
      if (filesToDelete.length > 0) {
        this.logInfo('Removing stale database entries', {
          removed: filesToDelete.length
        })
        const deleteStart = this.now()
        const deleteResult = await new IndexedWriteDeleteExecutorService<TRecord>({
          normalizePath: (rawPath) => rawPath,
          findExisting: async () => [],
          deleteRecords: (records) => this.deleteRecords(records),
          logDebug: (message, meta) => this.logDebug(message, meta),
          successMessage: 'Cleanup remove completed'
        }).executeExisting(filesToDelete)
        if (staleInPage > 0) staleDeleteElapsedMs += this.now() - deleteStart
        await this.runtimeEmitter.emitDeleteDeltas(deleteResult.deletedPaths, context)
        deletedCount += filesToDelete.length
      }
      await this.yieldAfterRead()
    }

    this.emitProgress(1, 1)
    if (stalePendingCount > 0) {
      this.logInfo('Stale index rows left for the next cleanup pass', {
        pending: stalePendingCount,
        budgetMs: this.staleDeleteBudgetMs
      })
    }
    this.logDebug('Cleanup stage finished', {
      duration: this.formatDuration(this.now() - cleanupStart),
      removed: deletedCount,
      stalePending: stalePendingCount
    })
    return { deletedCount, stalePendingCount }
  }
}
