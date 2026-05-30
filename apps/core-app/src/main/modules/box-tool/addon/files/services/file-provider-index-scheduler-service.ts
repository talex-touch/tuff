import type { IndexWorkerFile } from '../workers/file-index-worker-client'
import { IndexedWorkerSchedulerService } from '@talex-touch/utils/search'

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
    chunkSize?: number
  }
}

export class FileProviderIndexSchedulerService {
  private readonly getDatabaseFilePath: FileProviderIndexSchedulerDeps['getDatabaseFilePath']
  private readonly getProviderId: FileProviderIndexSchedulerDeps['getProviderId']
  private readonly getProviderType: FileProviderIndexSchedulerDeps['getProviderType']
  private readonly indexFiles: FileProviderIndexSchedulerDeps['indexFiles']
  private readonly config: Required<NonNullable<FileProviderIndexSchedulerDeps['config']>>
  private readonly scheduler: IndexedWorkerSchedulerService<IndexWorkerFile>

  constructor(deps: FileProviderIndexSchedulerDeps) {
    this.getDatabaseFilePath = deps.getDatabaseFilePath
    this.getProviderId = deps.getProviderId
    this.getProviderType = deps.getProviderType
    this.indexFiles = deps.indexFiles
    this.config = {
      backgroundContentMinBytes: deps.config?.backgroundContentMinBytes ?? 5 * 1024 * 1024,
      backgroundDelayMs: deps.config?.backgroundDelayMs ?? 5_000,
      chunkSize: deps.config?.chunkSize ?? 30
    }
    this.scheduler = new IndexedWorkerSchedulerService({
      getWorkerContext: () => this.getDatabaseFilePath(),
      dispatch: (dbPath, files) =>
        this.indexFiles(dbPath, this.getProviderId(), this.getProviderType(), files),
      logWarn: (message, error, meta) =>
        deps.logWarn(this.mapWorkerFailureMessage(message), error, meta),
      config: {
        chunkSize: this.config.chunkSize,
        deferredDelayMs: this.config.backgroundDelayMs
      }
    })
  }

  schedule(files: FileProviderIndexSchedulerFile[], reason: string): void {
    const dbPath = this.getDatabaseFilePath()
    if (!dbPath) {
      return
    }

    const immediate: IndexWorkerFile[] = []
    const deferred: IndexWorkerFile[] = []

    for (const file of files) {
      const entry = this.toIndexWorkerFile(file)
      if (!entry) continue

      if ((entry.size ?? 0) >= this.config.backgroundContentMinBytes) {
        deferred.push(entry)
      } else {
        immediate.push(entry)
      }
    }

    if (deferred.length > 0) {
      this.scheduler.schedule({
        payload: deferred,
        reason: `${reason}:background-content`,
        deferred: true
      })
    }

    this.scheduler.schedule({ payload: immediate, reason })
  }

  private toIndexWorkerFile(file: FileProviderIndexSchedulerFile): IndexWorkerFile | null {
    if (typeof file.id !== 'number') {
      return null
    }

    return {
      id: file.id,
      path: file.path,
      name: file.name,
      displayName: file.displayName ?? null,
      extension: file.extension ?? null,
      size: typeof file.size === 'number' ? file.size : null,
      mtime: toTimestamp(file.mtime) ?? Date.now(),
      ctime: toTimestamp(file.ctime) ?? Date.now()
    }
  }

  private mapWorkerFailureMessage(message: string): string {
    return message === 'Index worker failed' ? 'File index worker failed' : message
  }
}

function toTimestamp(value: Date | number | string | null | undefined): number | null {
  if (!value) {
    return null
  }
  if (value instanceof Date) {
    return value.getTime()
  }
  if (typeof value === 'number') {
    return value
  }
  const parsed = new Date(value)
  const time = parsed.getTime()
  return Number.isNaN(time) ? null : time
}
