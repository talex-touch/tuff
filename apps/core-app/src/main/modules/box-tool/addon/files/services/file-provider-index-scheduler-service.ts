import type {
  IndexedWorkerScheduleResult,
  IndexedWorkerSchedulerSnapshot
} from '@talex-touch/utils/search'
import type { IndexWorkerBatchResult, IndexWorkerFile } from '../workers/file-index-worker-client'
import path from 'node:path'
import {
  IndexedWorkerSchedulerService,
  isIndexedWatchPathOwned,
  mapIndexedWriteWorkerFilePayload,
  resolveIndexedWatchRootSet
} from '@talex-touch/utils/search'

export interface FileProviderIndexSchedulerFile {
  id?: number | null
  path: string
  name: string
  displayName?: string | null
  extension?: string | null
  size?: number | null
  mtime?: Date | number | string | null
  ctime?: Date | number | string | null
}

export interface FileProviderIndexSchedulerDeps {
  getDatabaseFilePath: () => string | null
  getProviderId: () => string
  getProviderType: () => string
  getWatchPaths?: () => string[]
  normalizePath?: (rawPath: string) => string
  indexFiles: (
    dbPath: string,
    providerId: string,
    providerType: string,
    files: IndexWorkerFile[]
  ) => Promise<IndexWorkerBatchResult>
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
  config?: {
    backgroundContentMinBytes?: number
    chunkSize?: number
    maxInFlight?: number
    maxPendingBatches?: number
  }
}

/**
 * A batch whose worker reported failed files. Carries up to three of their
 * `lastError` values so the `File index worker failed` warning says why.
 */
class FileIndexWorkerBatchFailedError extends Error {
  readonly lastErrorSamples: string[]

  constructor(result: IndexWorkerBatchResult) {
    super(`FILE_INDEX_WORKER_BATCH_FAILED:${result.failed}/${result.processed}`)
    this.lastErrorSamples = result.failureSamples ?? []
  }
}

function withLastErrorSamples(
  meta: Record<string, unknown> | undefined,
  error: unknown
): Record<string, unknown> | undefined {
  if (!(error instanceof FileIndexWorkerBatchFailedError) || error.lastErrorSamples.length === 0) {
    return meta
  }
  return { ...meta, lastErrorSamples: error.lastErrorSamples }
}

interface ScheduledEntry {
  file: IndexWorkerFile
  depth: number
  background: boolean
  order: number
}

/**
 * File-specific adapter over the shared bounded `IndexedWorkerSchedulerService`.
 *
 * There are deliberately no per-file/per-depth timers: a large scan would create
 * an unbounded timer queue. Shallow files are ordered first and large files
 * last, so once the shared scheduler's capacity is full the tail — the large,
 * deep work — is returned as `deferred` and stays durable in
 * file_index_progress for the enrichment-resume service.
 */
export class FileProviderIndexSchedulerService {
  private readonly getDatabaseFilePath: FileProviderIndexSchedulerDeps['getDatabaseFilePath']
  private readonly getProviderId: FileProviderIndexSchedulerDeps['getProviderId']
  private readonly getProviderType: FileProviderIndexSchedulerDeps['getProviderType']
  private readonly getWatchPaths: NonNullable<FileProviderIndexSchedulerDeps['getWatchPaths']>
  private readonly normalizePath: NonNullable<FileProviderIndexSchedulerDeps['normalizePath']>
  private readonly indexFiles: FileProviderIndexSchedulerDeps['indexFiles']
  private readonly config: Required<NonNullable<FileProviderIndexSchedulerDeps['config']>>
  private readonly scheduler: IndexedWorkerSchedulerService<IndexWorkerFile>
  private closed = false

  constructor(deps: FileProviderIndexSchedulerDeps) {
    this.getDatabaseFilePath = deps.getDatabaseFilePath
    this.getProviderId = deps.getProviderId
    this.getProviderType = deps.getProviderType
    this.getWatchPaths = deps.getWatchPaths ?? (() => [])
    this.normalizePath = deps.normalizePath ?? ((rawPath) => path.normalize(rawPath))
    this.indexFiles = deps.indexFiles
    this.config = {
      backgroundContentMinBytes: deps.config?.backgroundContentMinBytes ?? 5 * 1024 * 1024,
      chunkSize: deps.config?.chunkSize ?? 30,
      maxInFlight: deps.config?.maxInFlight ?? 1,
      maxPendingBatches: deps.config?.maxPendingBatches ?? 2
    }
    this.scheduler = new IndexedWorkerSchedulerService({
      getWorkerContext: () => this.getDatabaseFilePath(),
      dispatch: async (dbPath, files) => {
        const result = await this.indexFiles(
          dbPath,
          this.getProviderId(),
          this.getProviderType(),
          files
        )
        if (result.failed > 0) {
          throw new FileIndexWorkerBatchFailedError(result)
        }
      },
      logWarn: (message, error, meta) =>
        deps.logWarn(
          this.mapWorkerFailureMessage(message),
          error,
          withLastErrorSamples(meta, error)
        ),
      config: {
        chunkSize: this.config.chunkSize,
        maxInFlight: this.config.maxInFlight,
        maxPendingBatches: this.config.maxPendingBatches
      }
    })
  }

  schedule(
    files: FileProviderIndexSchedulerFile[],
    reason: string,
    mutationLeaseId?: string
  ): IndexedWorkerScheduleResult {
    if (this.closed || files.length === 0) {
      return { accepted: 0, deferred: 0 }
    }
    if (!this.getDatabaseFilePath()) {
      return { accepted: 0, deferred: 0 }
    }

    const entries: ScheduledEntry[] = []
    for (const file of files) {
      const entry = this.toIndexWorkerFile(file, mutationLeaseId)
      if (!entry) continue
      entries.push({
        file: entry,
        depth: this.getRelativeWatchDepth(entry.path),
        background: (entry.size ?? 0) >= this.config.backgroundContentMinBytes,
        order: entries.length
      })
    }
    if (entries.length === 0) {
      return { accepted: 0, deferred: 0 }
    }

    entries.sort(
      (left, right) =>
        Number(left.background) - Number(right.background) ||
        left.depth - right.depth ||
        left.order - right.order
    )

    return this.scheduler.schedule({
      payload: entries.map((entry) => entry.file),
      reason,
      scopeId: mutationLeaseId
    })
  }

  getSnapshot(): IndexedWorkerSchedulerSnapshot {
    return this.scheduler.getSnapshot()
  }

  hasPendingWork(mutationLeaseId?: string): boolean {
    return this.scheduler.hasPendingWork(mutationLeaseId)
  }

  async drain(timeoutMs = 15_000, mutationLeaseId?: string): Promise<void> {
    await this.scheduler.drain(timeoutMs, mutationLeaseId)
  }

  cancelLease(mutationLeaseId: string): void {
    this.scheduler.cancelScope(mutationLeaseId)
  }

  cancelPending(mutationLeaseId?: string): void {
    this.scheduler.cancelPending(mutationLeaseId)
  }

  close(): void {
    this.closed = true
    this.scheduler.close()
  }

  private getRelativeWatchDepth(filePath: string): number {
    const normalizedFilePath = this.normalizePath(filePath)
    if (!normalizedFilePath) {
      return 0
    }

    const rootSet = resolveIndexedWatchRootSet({
      basePaths: this.getWatchPaths(),
      normalizePath: this.normalizePath
    })
    let bestRoot: string | null = null

    for (const normalizedWatchPath of rootSet.normalizedPaths) {
      if (
        isIndexedWatchPathOwned({
          rawPath: filePath,
          normalizedWatchPaths: [normalizedWatchPath],
          normalizePath: this.normalizePath,
          pathSeparator: path.sep
        }) &&
        (!bestRoot || normalizedWatchPath.length > bestRoot.length)
      ) {
        bestRoot = normalizedWatchPath
      }
    }

    if (!bestRoot) {
      return 0
    }

    const relativePath = path.relative(bestRoot, normalizedFilePath)
    if (!relativePath || relativePath.startsWith('..')) {
      return 0
    }

    return relativePath.split(/[\\/]+/).filter(Boolean).length
  }

  private toIndexWorkerFile(
    file: FileProviderIndexSchedulerFile,
    mutationLeaseId?: string
  ): IndexWorkerFile | null {
    const payload = mapIndexedWriteWorkerFilePayload(file, { fallbackTimestamp: Date.now() })
    return payload ? { ...payload, mutationLeaseId } : null
  }

  private mapWorkerFailureMessage(message: string): string {
    return message === 'Index worker failed' ? 'File index worker failed' : message
  }
}
