import type { IndexWorkerFile } from '../workers/file-index-worker-client'

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
  private readonly logWarn: FileProviderIndexSchedulerDeps['logWarn']
  private readonly config: Required<NonNullable<FileProviderIndexSchedulerDeps['config']>>

  constructor(deps: FileProviderIndexSchedulerDeps) {
    this.getDatabaseFilePath = deps.getDatabaseFilePath
    this.getProviderId = deps.getProviderId
    this.getProviderType = deps.getProviderType
    this.indexFiles = deps.indexFiles
    this.logWarn = deps.logWarn
    this.config = {
      backgroundContentMinBytes: deps.config?.backgroundContentMinBytes ?? 5 * 1024 * 1024,
      backgroundDelayMs: deps.config?.backgroundDelayMs ?? 5_000,
      chunkSize: deps.config?.chunkSize ?? 30
    }
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
      setTimeout(() => {
        this.scheduleChunks(deferred, `${reason}:background-content`)
      }, this.config.backgroundDelayMs)
    }

    this.scheduleChunks(immediate, reason)
  }

  private scheduleChunks(payload: IndexWorkerFile[], reason: string): void {
    const dbPath = this.getDatabaseFilePath()
    if (!dbPath || payload.length === 0) {
      return
    }

    const providerId = this.getProviderId()
    const providerType = this.getProviderType()
    for (let i = 0; i < payload.length; i += this.config.chunkSize) {
      const chunk = payload.slice(i, i + this.config.chunkSize)
      void this.indexFiles(dbPath, providerId, providerType, chunk).catch((error) => {
        this.logWarn('File index worker failed', error, {
          reason,
          size: chunk.length
        })
      })
    }
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
