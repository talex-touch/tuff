import { IndexedWriteRuntimeEmitterService } from '@talex-touch/utils/search'
import type { IndexedSourceDelta } from '@talex-touch/utils/search'
import {
  IndexedWriteDeleteExecutorService,
  type IndexedWriteDeleteRecord
} from '../../../search-engine/indexing-write-delete-executor-service'

export interface FileProviderCleanupDeleteResult {
  deletedCount: number
}

export interface FileProviderCleanupDeleteDeps<TRecord extends IndexedWriteDeleteRecord, TContext> {
  sourceId: string
  getIndexedFileRecordsPage: (
    afterId: number,
    limit: number,
    context: TContext
  ) => Promise<TRecord[]>
  isWithinWatchRoots: (filePath: string) => boolean
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
    while (true) {
      const page = await this.getIndexedFileRecordsPage(afterId, 500, context)
      if (page.length === 0) break
      afterId = page[page.length - 1].id
      const filesToDelete = page.filter((file) => !this.isWithinWatchRoots(file.path))
      if (filesToDelete.length > 0) {
        this.logInfo('Removing stale database entries', {
          removed: filesToDelete.length
        })
        const deleteResult = await new IndexedWriteDeleteExecutorService<TRecord>({
          normalizePath: (rawPath) => rawPath,
          findExisting: async () => [],
          deleteRecords: (records) => this.deleteRecords(records),
          logDebug: (message, meta) => this.logDebug(message, meta),
          successMessage: 'Cleanup remove completed'
        }).executeExisting(filesToDelete)
        await this.runtimeEmitter.emitDeleteDeltas(deleteResult.deletedPaths, context)
        deletedCount += filesToDelete.length
      }
      await this.yieldAfterRead()
    }

    this.emitProgress(1, 1)
    this.logDebug('Cleanup stage finished', {
      duration: this.formatDuration(this.now() - cleanupStart),
      removed: deletedCount
    })
    return { deletedCount }
  }
}
