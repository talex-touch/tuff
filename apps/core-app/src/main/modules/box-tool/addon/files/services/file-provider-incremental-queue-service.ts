import {
  coalesceIndexingWatchDelta,
  IndexingWatchDeltaQueueService,
  type IndexingWatchDeltaEntry
} from '@talex-touch/utils/search'

export type FileProviderIncrementalAction = 'add' | 'change' | 'delete'

export interface FileProviderIncrementalPayload {
  action: FileProviderIncrementalAction
  rawPath: string
  manual?: boolean
}

export type FileProviderIncrementalEntry = IndexingWatchDeltaEntry<FileProviderIncrementalPayload>

export interface FileProviderIncrementalQueueServiceDeps {
  normalizePath: (rawPath: string) => string
  isWithinWatchRoots: (rawPath: string) => boolean
  prepareFlush: () => Promise<boolean>
  processEntries: (entries: FileProviderIncrementalEntry[]) => Promise<void>
  logError: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
}

export class FileProviderIncrementalQueueService {
  private readonly queue: IndexingWatchDeltaQueueService<FileProviderIncrementalPayload>

  constructor(deps: FileProviderIncrementalQueueServiceDeps) {
    this.queue = new IndexingWatchDeltaQueueService<FileProviderIncrementalPayload>({
      normalizeKey: deps.normalizePath,
      shouldAccept: deps.isWithinWatchRoots,
      prepareFlush: deps.prepareFlush,
      processEntries: deps.processEntries,
      logError: deps.logError,
      coalesce: ({ previous, next }) => {
        const coalesced = coalesceIndexingWatchDelta(previous, next)
        if (coalesced.action === 'delete') {
          return coalesced
        }
        return {
          ...coalesced,
          manual: previous?.manual === true || next.manual === true
        }
      }
    })
  }

  getPendingSize(): number {
    return this.queue.getPendingSize()
  }

  enqueue(
    rawPath: string,
    action: FileProviderIncrementalAction,
    options?: { manual?: boolean }
  ): void {
    this.queue.enqueue(
      rawPath,
      action,
      action === 'delete' ? undefined : { manual: options?.manual === true }
    )
  }

  flushSoon(): void {
    this.queue.flushSoon()
  }
}
