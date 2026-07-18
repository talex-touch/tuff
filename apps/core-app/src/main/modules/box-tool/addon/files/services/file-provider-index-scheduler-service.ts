import type { IndexWorkerFile } from '../workers/file-index-worker-client'
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
  ) => Promise<{ processed: number; failed: number }>
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
  config?: {
    backgroundContentMinBytes?: number
    backgroundDelayMs?: number
    depthDelayMs?: number
    depthPriorityStart?: number
    chunkSize?: number
  }
}

export class FileProviderIndexSchedulerService {
  private readonly getDatabaseFilePath: FileProviderIndexSchedulerDeps['getDatabaseFilePath']
  private readonly getProviderId: FileProviderIndexSchedulerDeps['getProviderId']
  private readonly getProviderType: FileProviderIndexSchedulerDeps['getProviderType']
  private readonly getWatchPaths: NonNullable<FileProviderIndexSchedulerDeps['getWatchPaths']>
  private readonly normalizePath: NonNullable<FileProviderIndexSchedulerDeps['normalizePath']>
  private readonly indexFiles: FileProviderIndexSchedulerDeps['indexFiles']
  private readonly config: Required<NonNullable<FileProviderIndexSchedulerDeps['config']>>
  private readonly scheduler: IndexedWorkerSchedulerService<IndexWorkerFile>
  private readonly depthTimers = new Map<ReturnType<typeof setTimeout>, string | undefined>()
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
      backgroundDelayMs: deps.config?.backgroundDelayMs ?? 5_000,
      depthDelayMs: deps.config?.depthDelayMs ?? 750,
      depthPriorityStart: deps.config?.depthPriorityStart ?? 2,
      chunkSize: deps.config?.chunkSize ?? 30
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
          throw new Error(`FILE_INDEX_WORKER_BATCH_FAILED:${result.failed}/${result.processed}`)
        }
      },
      logWarn: (message, error, meta) =>
        deps.logWarn(this.mapWorkerFailureMessage(message), error, meta),
      config: {
        chunkSize: this.config.chunkSize,
        deferredDelayMs: this.config.backgroundDelayMs
      }
    })
  }

  schedule(
    files: FileProviderIndexSchedulerFile[],
    reason: string,
    mutationLeaseId?: string
  ): void {
    if (this.closed) return
    const dbPath = this.getDatabaseFilePath()
    if (!dbPath) {
      return
    }

    const immediate: Array<{ file: IndexWorkerFile; depth: number }> = []
    const deferred: Array<{ file: IndexWorkerFile; depth: number }> = []

    for (const file of files) {
      const entry = this.toIndexWorkerFile(file, mutationLeaseId)
      if (!entry) continue

      const depth = this.getRelativeWatchDepth(entry.path)
      const target =
        (entry.size ?? 0) >= this.config.backgroundContentMinBytes ? deferred : immediate
      target.push({ file: entry, depth })
    }

    this.scheduleByDepth(deferred, `${reason}:background-content`, true, mutationLeaseId)
    this.scheduleByDepth(immediate, reason, false, mutationLeaseId)
  }

  hasPendingWork(mutationLeaseId?: string): boolean {
    return this.hasDepthTimers(mutationLeaseId) || this.scheduler.hasPendingWork(mutationLeaseId)
  }

  async drain(timeoutMs = 15_000, mutationLeaseId?: string): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (this.hasDepthTimers(mutationLeaseId)) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) throw new Error('FILE_INDEX_SCHEDULER_DRAIN_TIMEOUT')
      await new Promise<void>((resolve) => setTimeout(resolve, Math.min(20, remaining)))
    }
    await this.scheduler.drain(Math.max(1, deadline - Date.now()), mutationLeaseId)
  }

  cancelLease(mutationLeaseId: string): void {
    for (const [timer, timerLeaseId] of this.depthTimers) {
      if (timerLeaseId !== mutationLeaseId) continue
      clearTimeout(timer)
      this.depthTimers.delete(timer)
    }
    this.scheduler.cancelScope(mutationLeaseId)
  }

  cancelPending(mutationLeaseId?: string): void {
    for (const [timer, timerLeaseId] of this.depthTimers) {
      if (mutationLeaseId !== undefined && timerLeaseId !== mutationLeaseId) continue
      clearTimeout(timer)
      this.depthTimers.delete(timer)
    }
    this.scheduler.cancelPending(mutationLeaseId)
  }

  close(): void {
    this.closed = true
    this.cancelPending()
    this.scheduler.close()
  }

  private scheduleByDepth(
    entries: Array<{ file: IndexWorkerFile; depth: number }>,
    reason: string,
    deferred: boolean,
    mutationLeaseId?: string
  ): void {
    if (this.closed) return
    if (entries.length === 0) {
      return
    }

    const depthGroups = new Map<number, IndexWorkerFile[]>()
    for (const entry of entries.sort((left, right) => left.depth - right.depth)) {
      const group = depthGroups.get(entry.depth) ?? []
      group.push(entry.file)
      depthGroups.set(entry.depth, group)
    }

    for (const [depth, payload] of depthGroups) {
      const depthDelayMs = this.getDepthDelayMs(depth)
      if (deferred || depthDelayMs > 0) {
        const timer = setTimeout(() => {
          this.depthTimers.delete(timer)
          this.scheduler.schedule({
            payload,
            reason: depthDelayMs > 0 ? `${reason}:depth-${depth}` : reason,
            deferred,
            scopeId: mutationLeaseId
          })
        }, depthDelayMs)
        this.depthTimers.set(timer, mutationLeaseId)
        continue
      }

      this.scheduler.schedule({ payload, reason, scopeId: mutationLeaseId })
    }
  }

  private hasDepthTimers(mutationLeaseId?: string): boolean {
    if (mutationLeaseId === undefined) return this.depthTimers.size > 0
    for (const timerLeaseId of this.depthTimers.values()) {
      if (timerLeaseId === mutationLeaseId) return true
    }
    return false
  }

  private getDepthDelayMs(depth: number): number {
    const extraDepth = Math.max(0, depth - this.config.depthPriorityStart)
    return extraDepth * this.config.depthDelayMs
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
