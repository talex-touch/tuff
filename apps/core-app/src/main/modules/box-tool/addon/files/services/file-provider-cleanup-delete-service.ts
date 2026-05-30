import {
  IndexedWriteDeleteExecutorService,
  type IndexedWriteDeleteRecord
} from '../../../search-engine/indexing-write-delete-executor-service'

export interface FileProviderCleanupDeleteResult<TRecord extends IndexedWriteDeleteRecord> {
  deleted: TRecord[]
  deletedCount: number
}

export interface FileProviderCleanupDeleteDeps<TRecord extends IndexedWriteDeleteRecord> {
  getAllIndexedFileRecords: () => Promise<TRecord[]>
  isWithinWatchRoots: (filePath: string) => boolean
  yieldAfterRead: () => Promise<void>
  deleteRecords: (records: TRecord[]) => Promise<void>
  removeSearchIndexItems: (paths: string[]) => Promise<void>
  emitProgress: (current: number, total: number) => void
  now: () => number
  formatDuration: (durationMs: number) => string
  logInfo: (message: string, meta?: Record<string, unknown>) => void
  logDebug: (message: string, meta?: Record<string, unknown>) => void
}

export class FileProviderCleanupDeleteService<TRecord extends IndexedWriteDeleteRecord> {
  private readonly getAllIndexedFileRecords: FileProviderCleanupDeleteDeps<TRecord>['getAllIndexedFileRecords']
  private readonly isWithinWatchRoots: FileProviderCleanupDeleteDeps<TRecord>['isWithinWatchRoots']
  private readonly yieldAfterRead: FileProviderCleanupDeleteDeps<TRecord>['yieldAfterRead']
  private readonly deleteRecords: FileProviderCleanupDeleteDeps<TRecord>['deleteRecords']
  private readonly removeSearchIndexItems: FileProviderCleanupDeleteDeps<TRecord>['removeSearchIndexItems']
  private readonly emitProgress: FileProviderCleanupDeleteDeps<TRecord>['emitProgress']
  private readonly now: FileProviderCleanupDeleteDeps<TRecord>['now']
  private readonly formatDuration: FileProviderCleanupDeleteDeps<TRecord>['formatDuration']
  private readonly logInfo: FileProviderCleanupDeleteDeps<TRecord>['logInfo']
  private readonly logDebug: FileProviderCleanupDeleteDeps<TRecord>['logDebug']

  constructor(deps: FileProviderCleanupDeleteDeps<TRecord>) {
    this.getAllIndexedFileRecords = deps.getAllIndexedFileRecords
    this.isWithinWatchRoots = deps.isWithinWatchRoots
    this.yieldAfterRead = deps.yieldAfterRead
    this.deleteRecords = deps.deleteRecords
    this.removeSearchIndexItems = deps.removeSearchIndexItems
    this.emitProgress = deps.emitProgress
    this.now = deps.now
    this.formatDuration = deps.formatDuration
    this.logInfo = deps.logInfo
    this.logDebug = deps.logDebug
  }

  async execute(): Promise<FileProviderCleanupDeleteResult<TRecord>> {
    const cleanupStart = this.now()
    this.logInfo('Cleaning stale index entries from removed watch paths')
    this.emitProgress(0, 1)

    const allDbFilePaths = await this.getAllIndexedFileRecords()
    await this.yieldAfterRead()
    const filesToDelete = allDbFilePaths.filter((file) => !this.isWithinWatchRoots(file.path))

    if (filesToDelete.length > 0) {
      this.logInfo('Removing stale database entries', {
        removed: filesToDelete.length
      })

      await new IndexedWriteDeleteExecutorService<TRecord>({
        normalizePath: (rawPath) => rawPath,
        findExisting: async () => [],
        deleteRecords: (records) => this.deleteRecords(records),
        removeSearchIndexItems: (paths) => this.removeSearchIndexItems(paths),
        logDebug: (message, meta) => this.logDebug(message, meta),
        successMessage: 'Cleanup remove completed'
      }).executeExisting(filesToDelete)
    }

    this.emitProgress(1, 1)
    this.logDebug('Cleanup stage finished', {
      duration: this.formatDuration(this.now() - cleanupStart),
      removed: filesToDelete.length
    })

    return {
      deleted: filesToDelete,
      deletedCount: filesToDelete.length
    }
  }
}
