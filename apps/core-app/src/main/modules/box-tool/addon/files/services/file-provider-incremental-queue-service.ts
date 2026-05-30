export type FileProviderIncrementalAction = 'add' | 'change' | 'delete'

export interface FileProviderIncrementalPayload {
  action: FileProviderIncrementalAction
  rawPath: string
  manual?: boolean
}

export type FileProviderIncrementalEntry = [string, FileProviderIncrementalPayload]

export interface FileProviderIncrementalQueueServiceDeps {
  normalizePath: (rawPath: string) => string
  isWithinWatchRoots: (rawPath: string) => boolean
  prepareFlush: () => Promise<boolean>
  processEntries: (entries: FileProviderIncrementalEntry[]) => Promise<void>
  logError: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
}

export class FileProviderIncrementalQueueService {
  private readonly normalizePath: FileProviderIncrementalQueueServiceDeps['normalizePath']
  private readonly isWithinWatchRoots: FileProviderIncrementalQueueServiceDeps['isWithinWatchRoots']
  private readonly prepareFlush: FileProviderIncrementalQueueServiceDeps['prepareFlush']
  private readonly processEntries: FileProviderIncrementalQueueServiceDeps['processEntries']
  private readonly logError: FileProviderIncrementalQueueServiceDeps['logError']
  private taskChain: Promise<void> = Promise.resolve()
  private readonly pending = new Map<string, FileProviderIncrementalPayload>()

  constructor(deps: FileProviderIncrementalQueueServiceDeps) {
    this.normalizePath = deps.normalizePath
    this.isWithinWatchRoots = deps.isWithinWatchRoots
    this.prepareFlush = deps.prepareFlush
    this.processEntries = deps.processEntries
    this.logError = deps.logError
  }

  getPendingSize(): number {
    return this.pending.size
  }

  enqueue(
    rawPath: string,
    action: FileProviderIncrementalAction,
    options?: { manual?: boolean }
  ): void {
    if (!this.isWithinWatchRoots(rawPath)) {
      return
    }

    const manual = options?.manual === true
    const normalizedPath = this.normalizePath(rawPath)
    const prev = this.pending.get(normalizedPath)

    if (action === 'delete') {
      this.pending.set(normalizedPath, { action, rawPath })
    } else if (!prev || prev.action !== 'delete') {
      const nextAction: 'add' | 'change' = prev?.action === 'add' ? 'add' : action
      const nextRawPath = action === 'add' ? rawPath : (prev?.rawPath ?? rawPath)
      this.pending.set(normalizedPath, {
        action: nextAction,
        rawPath: nextRawPath,
        manual: prev?.manual === true || manual
      })
    }

    this.schedule()
  }

  flushSoon(): void {
    this.schedule()
  }

  private schedule(): void {
    if (this.pending.size === 0) {
      return
    }

    this.taskChain = this.taskChain
      .then(() => this.flush())
      .catch((error) => {
        this.logError('Failed to process incremental updates.', error)
      })
  }

  private async flush(): Promise<void> {
    if (this.pending.size === 0) {
      return
    }

    if (!(await this.prepareFlush())) {
      return
    }

    const entries = Array.from(this.pending.entries())
    this.pending.clear()
    await this.processEntries(entries)
  }
}
