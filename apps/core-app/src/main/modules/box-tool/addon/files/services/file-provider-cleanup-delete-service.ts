import type { IndexedWriteDeleteRecord } from '../../../search-engine/indexing-write-delete-executor-service'

export interface FileProviderCleanupDeleteResult {
  deletedCount: number
  /** A lower bound, not a second unbounded census of the remaining index. */
  stalePendingCount: number
  done: boolean
  cursor: number
}

export interface FileProviderCleanupDeleteDeps<TRecord extends IndexedWriteDeleteRecord, TContext> {
  sourceId: string
  getIndexedFileRecordsPage: (
    afterId: number,
    limit: number,
    context: TContext
  ) => Promise<TRecord[]>
  isWithinWatchRoots: (filePath: string) => boolean
  isStaleIndexPath?: (
    filePath: string,
    context: TContext
  ) => boolean | null | Promise<boolean | null>
  roundBudgetMs?: number
  pageSize?: number
  maxPages?: number
  getCursorKey: (context: TContext) => string
  loadCursor: (key: string, context: TContext) => Promise<number>
  saveCursor: (key: string, cursor: number, context: TContext) => Promise<void>
  canContinue: (context: TContext) => boolean
  yieldAfterRead: () => Promise<void>
  /** This callback owns one short lease, atomic deletion and post-commit publication. */
  deleteRecords: (
    records: TRecord[],
    context: TContext
  ) => Promise<{
    deleted: TRecord[]
    deferred: boolean
  }>
  emitProgress: (current: number, total: number) => void
  now: () => number
  formatDuration: (durationMs: number) => string
  logInfo: (message: string, meta?: Record<string, unknown>) => void
  logDebug: (message: string, meta?: Record<string, unknown>) => void
}

export class FileProviderCleanupDeleteService<TRecord extends IndexedWriteDeleteRecord, TContext> {
  constructor(private readonly deps: FileProviderCleanupDeleteDeps<TRecord, TContext>) {}

  async execute(context: TContext): Promise<FileProviderCleanupDeleteResult> {
    const startedAt = this.deps.now()
    const budgetMs = Math.max(0, this.deps.roundBudgetMs ?? 1_500)
    const pageSize = Math.min(64, Math.max(1, this.deps.pageSize ?? 64))
    const maxPages = Math.max(1, this.deps.maxPages ?? 16)
    const key = this.deps.getCursorKey(context)
    let cursor = await this.deps.loadCursor(key, context)
    let deletedCount = 0
    let done = false
    this.deps.emitProgress(0, 1)

    for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
      if (!this.deps.canContinue(context) || this.deps.now() - startedAt >= budgetMs) break
      const page = await this.deps.getIndexedFileRecordsPage(cursor, pageSize, context)
      if (page.length === 0) {
        await this.deps.saveCursor(key, 0, context)
        cursor = 0
        done = true
        break
      }
      if (!this.deps.canContinue(context) || this.deps.now() - startedAt >= budgetMs) break
      // Enumeration is not deletion authority. The atomic callback checks the rules again
      // after acquiring its short lease, and fences every observed metadata version.
      const candidates: TRecord[] = []
      let paused = false
      for (const record of page) {
        if (!this.deps.canContinue(context) || this.deps.now() - startedAt >= budgetMs) {
          paused = true
          break
        }
        if (!this.deps.isWithinWatchRoots(record.path)) {
          candidates.push(record)
          continue
        }
        const stale = await this.deps.isStaleIndexPath?.(record.path, context)
        if (stale === null) {
          paused = true
          break
        }
        if (stale === true) candidates.push(record)
      }
      if (paused || !this.deps.canContinue(context) || this.deps.now() - startedAt >= budgetMs)
        break
      if (candidates.length > 0) {
        const result = await this.deps.deleteRecords(candidates, context)
        deletedCount += result.deleted.length
        if (result.deferred) break
      }
      const nextCursor = page[page.length - 1].id
      // The callback has completed both the actual commit and its visibility/publication
      // barrier. A failure before here leaves this page eligible, including after restart.
      await this.deps.saveCursor(key, nextCursor, context)
      cursor = nextCursor
      await this.deps.yieldAfterRead()
    }

    if (done) this.deps.emitProgress(1, 1)
    this.deps.logDebug('Cleanup round finished', {
      duration: this.deps.formatDuration(this.deps.now() - startedAt),
      removed: deletedCount,
      deferred: !done
    })
    return { deletedCount, stalePendingCount: done ? 0 : 1, done, cursor }
  }
}
