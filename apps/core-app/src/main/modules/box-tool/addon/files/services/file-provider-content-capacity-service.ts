import path from 'node:path'
import { statfs } from 'node:fs/promises'
import {
  FILE_CONTENT_INDEX_MIN_FREE_BYTES,
  FILE_CONTENT_INDEX_RESUME_FREE_BYTES,
  type FileIndexContentStorage,
  type FileIndexStorage
} from '@talex-touch/utils/transport/events/types'
import {
  isSearchIndexReserveReachedError,
  resolveSearchIndexMaxPageCount,
  resolveSearchIndexReservePages
} from '../../../../../db/search-index-size-cap'
import {
  isSqliteStorageFullError,
  resolveSqliteErrorIdentity
} from '../../../../../db/sqlite-retry'
import { FILE_INDEX_STORAGE_FULL } from './file-provider-run-failure'
import {
  idleBudgetCoordinator,
  isStatePausedFor
} from '../../../../../service/idle-budget-coordinator'

const SEARCH_INDEX_PAGE_SIZE_BYTES = 4096
const INDEX_FULL_CODE_PATTERN = new RegExp(
  `(?:^|[^A-Z0-9_])${FILE_INDEX_STORAGE_FULL}(?:$|[^A-Z0-9_])`
)

type StorageFullKind = 'explicit-index-full' | 'os-disk-full' | 'sqlite-full' | null
type IndexFullPauseMode = 'explicit' | 'inferred'

export interface ContentCapacityFailureOptions {
  source?: 'index' | 'disk'
}

export interface ContentCapacityDatabaseSource {
  getSearchDatabaseFilePath: () => string | null | undefined
  getSearchIndexStorage?: () => Promise<FileIndexStorage>
}

function isExplicitIndexFullError(error: unknown): boolean {
  if (isSearchIndexReserveReachedError(error)) return true
  const visited = new Set<unknown>()
  const pending: unknown[] = [error]
  while (pending.length > 0) {
    const current = pending.pop()
    if (typeof current === 'string') {
      if (INDEX_FULL_CODE_PATTERN.test(current)) return true
      continue
    }
    if (!current || typeof current !== 'object' || visited.has(current)) continue
    visited.add(current)
    const record = current as {
      code?: unknown
      errorCode?: unknown
      message?: unknown
      cause?: unknown
      original?: unknown
      error?: unknown
    }
    if (record.code === FILE_INDEX_STORAGE_FULL || record.errorCode === FILE_INDEX_STORAGE_FULL) {
      return true
    }
    if (typeof record.message === 'string' && INDEX_FULL_CODE_PATTERN.test(record.message)) {
      return true
    }
    if (current instanceof AggregateError) pending.push(...current.errors)
    if ('cause' in current) pending.push(record.cause)
    if ('original' in current) pending.push(record.original)
    if ('error' in current) pending.push(record.error)
  }
  return false
}

function isOsDiskFullError(error: unknown): boolean {
  const visited = new Set<unknown>()
  const pending: unknown[] = [error]
  while (pending.length > 0) {
    const current = pending.pop()
    if (typeof current === 'string') {
      if (/\bENOSPC\b|no space left on device/i.test(current)) return true
      continue
    }
    if (!current || typeof current !== 'object' || visited.has(current)) continue
    visited.add(current)
    if (resolveSqliteErrorIdentity(current).code === 'ENOSPC') return true
    if (
      'message' in current &&
      typeof current.message === 'string' &&
      /\bENOSPC\b|no space left on device/i.test(current.message)
    ) {
      return true
    }
    if (current instanceof AggregateError) pending.push(...current.errors)
    if ('cause' in current) pending.push(current.cause)
    if ('original' in current) pending.push(current.original)
    if ('error' in current) pending.push(current.error)
  }
  return false
}

function classifyStorageFullFailure(
  error: unknown,
  options?: ContentCapacityFailureOptions
): StorageFullKind {
  if (isExplicitIndexFullError(error)) return 'explicit-index-full'
  if (!isSqliteStorageFullError(error)) return null
  if (options?.source === 'disk' || isOsDiskFullError(error)) return 'os-disk-full'
  return 'sqlite-full'
}

function resolveIndexResumeMaxFileBytes(maxBytes: number): number {
  const maxPages = resolveSearchIndexMaxPageCount(maxBytes, SEARCH_INDEX_PAGE_SIZE_BYTES)
  const reserveBytes = resolveSearchIndexReservePages(maxPages) * SEARCH_INDEX_PAGE_SIZE_BYTES
  // Require at least 2x reserve headroom below cap so fileBytes cannot flap near the reserve edge.
  return Math.max(0, maxBytes - reserveBytes * 2)
}

export interface FileProviderContentCapacityServiceDeps {
  getDirectory: () => string | null
  getIndexStorage?: () => Promise<FileIndexStorage | null> | FileIndexStorage | null
  statfs?: (directory: string) => Promise<{ bavail: number | bigint; bsize: number | bigint }>
  now?: () => number
  onChange?: (storage: FileIndexContentStorage) => void
  checkIntervalMs?: number
  checkTimeoutMs?: number
}

export function createDatabaseContentCapacityService(
  getDatabase: () => ContentCapacityDatabaseSource | null | undefined,
  onChange?: (storage: FileIndexContentStorage) => void
): FileProviderContentCapacityService {
  return new FileProviderContentCapacityService({
    getDirectory: () => {
      const database = getDatabase()
      if (!database) return null
      const target = database.getSearchDatabaseFilePath()
      return target && target !== ':memory:' ? path.dirname(target) : null
    },
    getIndexStorage: async () => (await getDatabase()?.getSearchIndexStorage?.()) ?? null,
    onChange
  })
}

/** Checks only the writer's volume (and optional index-cap size); never walks the index database. */
export class FileProviderContentCapacityService {
  private storage: FileIndexContentStorage = {
    status: 'unavailable',
    availableBytes: null,
    requiredBytes: FILE_CONTENT_INDEX_MIN_FREE_BYTES,
    checkedAt: null
  }
  private paused = false
  private indexFullPause: IndexFullPauseMode | null = null
  private indexFullBaselineBytes: number | null = null
  private pendingSqliteFullClassification = false
  private disposed = false
  private failureVersion = 0
  private failureNotBefore = 0
  private checkedDirectory: string | null = null
  private checkPromise: Promise<boolean> | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private started = false
  private idleBudgetUnsubscribe: (() => void) | null = null
  private checkTimer: ReturnType<typeof setTimeout> | null = null
  private cancelCheck: (() => void) | null = null
  private readonly now: () => number
  private readonly readStatfs: NonNullable<FileProviderContentCapacityServiceDeps['statfs']>
  private readonly intervalMs: number

  constructor(private readonly deps: FileProviderContentCapacityServiceDeps) {
    this.now = deps.now ?? Date.now
    this.readStatfs = deps.statfs ?? ((directory) => statfs(directory, { bigint: true }))
    this.intervalMs = deps.checkIntervalMs ?? 30_000
  }

  getSnapshot(): FileIndexContentStorage {
    return { ...this.storage }
  }

  isReady(): boolean {
    try {
      return (
        !this.disposed &&
        this.storage.status === 'ready' &&
        this.checkedDirectory === this.deps.getDirectory()
      )
    } catch {
      return false
    }
  }

  private armInterval(): void {
    if (this.timer || this.disposed || !this.started) return
    this.timer = setInterval(() => {
      void this.check(true)
    }, this.intervalMs)
    this.timer.unref?.()
  }

  private clearPollingInterval(): void {
    clearInterval(this.timer ?? undefined)
    this.timer = null
  }

  start(): void {
    if (this.started || this.disposed) return
    this.started = true
    if (!this.idleBudgetUnsubscribe) {
      this.idleBudgetUnsubscribe = idleBudgetCoordinator.subscribe((snapshot) => {
        if (!this.started || this.disposed) return
        if (isStatePausedFor(snapshot.state, 'background-hidden')) {
          this.clearPollingInterval()
          return
        }
        this.armInterval()
      })
    }
    if (!idleBudgetCoordinator.isPausedFor('background-hidden')) {
      this.armInterval()
    }
  }

  check(force = false): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false)
    if (this.now() < this.failureNotBefore) return Promise.resolve(false)
    if (this.checkPromise) return this.checkPromise
    let directory: string | null = null
    try {
      directory = this.deps.getDirectory()
    } catch {
      // An uninitialized writer target is unavailable, never a guessed profile volume.
    }
    if (
      !force &&
      directory === this.checkedDirectory &&
      this.storage.checkedAt !== null &&
      this.now() - this.storage.checkedAt < this.intervalMs
    )
      return Promise.resolve(this.isReady())
    const version = this.failureVersion
    this.checkPromise = this.readCapacity(directory, version).finally(() => {
      this.checkPromise = null
    })
    return this.checkPromise
  }

  recordFailure(error: unknown, options?: ContentCapacityFailureOptions): boolean {
    if (this.disposed) return false
    const kind = classifyStorageFullFailure(error, options)
    if (!kind) return false
    this.failureVersion++
    this.failureNotBefore = this.now() + this.intervalMs
    this.paused = true

    if (kind === 'explicit-index-full') {
      this.enterIndexFullPause('explicit', this.failureVersion)
      return true
    }

    if (kind === 'os-disk-full') {
      this.indexFullPause = null
      this.indexFullBaselineBytes = null
      this.pendingSqliteFullClassification = false
      this.publish({
        status: 'low-space',
        availableBytes: this.storage.availableBytes,
        requiredBytes: FILE_CONTENT_INDEX_RESUME_FREE_BYTES,
        checkedAt: this.now()
      })
      return true
    }

    // Bare `SQLITE_FULL` (without `ENOSPC` or explicit reserve token) can come from either
    // `search-index.db` hitting `PRAGMA max_page_count` or the OS volume running out of space.
    const available = this.storage.availableBytes
    if (available !== null && available >= FILE_CONTENT_INDEX_RESUME_FREE_BYTES) {
      this.enterIndexFullPause('inferred', this.failureVersion)
      return true
    }

    this.indexFullPause = null
    this.indexFullBaselineBytes = null
    this.pendingSqliteFullClassification = available === null
    this.publish({
      status: 'low-space',
      availableBytes: available,
      requiredBytes: FILE_CONTENT_INDEX_RESUME_FREE_BYTES,
      checkedAt: this.now()
    })
    return true
  }

  /** Clears the index-full latch without triggering an immediate volume probe. */
  clearIndexFullPause(): void {
    this.indexFullPause = null
    this.indexFullBaselineBytes = null
    this.pendingSqliteFullClassification = false
    this.failureNotBefore = 0
  }

  /**
   * Call once index space is actually freed (eviction sweep, compaction, cleanup, reset/rebuild,
   * or content clear). Releases an index-full pause and re-verifies OS disk headroom before
   * admitting work again.
   */
  notifyIndexSpaceFreed(): Promise<boolean> {
    if (this.disposed || (this.indexFullPause === null && !this.pendingSqliteFullClassification)) {
      return Promise.resolve(this.isReady())
    }
    this.clearIndexFullPause()
    const inFlight = this.checkPromise
    if (inFlight) {
      return inFlight.then(() => this.check(true))
    }
    return this.check(true)
  }

  stop(): void {
    this.started = false
    this.idleBudgetUnsubscribe?.()
    this.idleBudgetUnsubscribe = null
    this.clearPollingInterval()
  }

  dispose(): void {
    this.disposed = true
    this.stop()
    this.cancelCheck?.()
    this.cancelCheck = null
    clearTimeout(this.checkTimer ?? undefined)
    this.checkTimer = null
  }

  private enterIndexFullPause(mode: IndexFullPauseMode, version: number): void {
    this.indexFullPause = mode
    this.indexFullBaselineBytes = null
    this.pendingSqliteFullClassification = false
    this.publish({
      status: 'index-full',
      availableBytes: this.storage.availableBytes,
      requiredBytes: FILE_CONTENT_INDEX_RESUME_FREE_BYTES,
      checkedAt: this.now()
    })
    void this.captureIndexFullBaseline(version)
  }

  private async captureIndexFullBaseline(version: number): Promise<void> {
    if (!this.deps.getIndexStorage) return
    const storage = await this.readIndexStorageSafe()
    if (
      this.disposed ||
      version !== this.failureVersion ||
      this.indexFullPause === null ||
      this.indexFullBaselineBytes !== null
    ) {
      return
    }
    if (storage && storage.fileBytes !== null && Number.isFinite(storage.fileBytes)) {
      this.indexFullBaselineBytes = storage.fileBytes
    }
  }

  private async readIndexStorageSafe(): Promise<FileIndexStorage | null> {
    if (!this.deps.getIndexStorage) return null
    try {
      return (await this.deps.getIndexStorage()) ?? null
    } catch {
      return null
    }
  }

  private async checkIndexStorageHeadroomRecovered(version: number): Promise<boolean> {
    if (!this.deps.getIndexStorage) return false
    const storage = await this.readIndexStorageSafe()
    if (this.disposed || version !== this.failureVersion || this.indexFullPause === null) {
      return false
    }
    if (
      !storage ||
      storage.fileBytes === null ||
      !Number.isFinite(storage.fileBytes) ||
      !Number.isFinite(storage.maxBytes) ||
      storage.maxBytes <= 0
    ) {
      return false
    }
    if (this.indexFullBaselineBytes === null) {
      this.indexFullBaselineBytes = storage.fileBytes
      return false
    }
    const resumeCeilingBytes = resolveIndexResumeMaxFileBytes(storage.maxBytes)
    if (
      storage.fileBytes < this.indexFullBaselineBytes &&
      storage.fileBytes <= resumeCeilingBytes
    ) {
      this.indexFullPause = null
      this.indexFullBaselineBytes = null
      return true
    }
    return false
  }

  private async readCapacity(directory: string | null, version: number): Promise<boolean> {
    try {
      if (!directory) throw new Error('FILE_CONTENT_STORAGE_UNAVAILABLE')
      const result = await Promise.race([
        this.readStatfs(directory),
        new Promise<never>((_, reject) => {
          this.cancelCheck = () => reject(new Error('FILE_CONTENT_STORAGE_UNAVAILABLE'))
          this.checkTimer = setTimeout(
            () => reject(new Error('FILE_CONTENT_STORAGE_UNAVAILABLE')),
            this.deps.checkTimeoutMs ?? 2000
          )
          this.checkTimer.unref?.()
        })
      ])
      if (this.disposed || version !== this.failureVersion) return false
      const availableBytes = Number(result.bavail) * Number(result.bsize)
      if (!Number.isFinite(availableBytes) || availableBytes < 0 || Number(result.bsize) <= 0) {
        throw new Error('FILE_CONTENT_STORAGE_UNAVAILABLE')
      }

      if (this.pendingSqliteFullClassification) {
        this.pendingSqliteFullClassification = false
        if (availableBytes >= FILE_CONTENT_INDEX_RESUME_FREE_BYTES) {
          this.indexFullPause = 'inferred'
          const baseline = await this.readIndexStorageSafe()
          if (this.disposed || version !== this.failureVersion) return false
          if (baseline && baseline.fileBytes !== null && Number.isFinite(baseline.fileBytes)) {
            this.indexFullBaselineBytes = baseline.fileBytes
          }
          this.paused = true
          this.checkedDirectory = directory
          this.publish({
            status: 'index-full',
            availableBytes,
            requiredBytes: FILE_CONTENT_INDEX_RESUME_FREE_BYTES,
            checkedAt: this.now()
          })
          return false
        }
      }

      if (this.indexFullPause !== null) {
        if (availableBytes < FILE_CONTENT_INDEX_RESUME_FREE_BYTES) {
          if (this.indexFullPause === 'inferred') {
            this.indexFullPause = null
            this.indexFullBaselineBytes = null
            this.paused = true
            this.checkedDirectory = directory
            this.publish({
              status: 'low-space',
              availableBytes,
              requiredBytes: FILE_CONTENT_INDEX_RESUME_FREE_BYTES,
              checkedAt: this.now()
            })
            return false
          }
          this.paused = true
          this.checkedDirectory = directory
          this.publish({
            status: 'index-full',
            availableBytes,
            requiredBytes: FILE_CONTENT_INDEX_RESUME_FREE_BYTES,
            checkedAt: this.now()
          })
          return false
        }

        const recovered = await this.checkIndexStorageHeadroomRecovered(version)
        if (this.disposed || version !== this.failureVersion) return false
        if (!recovered && this.indexFullPause !== null) {
          this.paused = true
          this.checkedDirectory = directory
          this.publish({
            status: 'index-full',
            availableBytes,
            requiredBytes: FILE_CONTENT_INDEX_RESUME_FREE_BYTES,
            checkedAt: this.now()
          })
          return false
        }
      }

      const threshold = this.paused
        ? FILE_CONTENT_INDEX_RESUME_FREE_BYTES
        : FILE_CONTENT_INDEX_MIN_FREE_BYTES
      const ready = availableBytes >= threshold
      this.paused = !ready
      this.checkedDirectory = directory
      this.publish({
        status: ready ? 'ready' : 'low-space',
        availableBytes,
        requiredBytes: ready
          ? FILE_CONTENT_INDEX_MIN_FREE_BYTES
          : FILE_CONTENT_INDEX_RESUME_FREE_BYTES,
        checkedAt: this.now()
      })
      return ready
    } catch {
      if (this.disposed || version !== this.failureVersion) return false
      this.paused = true
      this.checkedDirectory = directory
      if (this.indexFullPause !== null) {
        this.publish({
          status: 'index-full',
          availableBytes: null,
          requiredBytes: FILE_CONTENT_INDEX_RESUME_FREE_BYTES,
          checkedAt: this.now()
        })
        return false
      }
      this.publish({
        status: 'unavailable',
        availableBytes: null,
        requiredBytes: FILE_CONTENT_INDEX_RESUME_FREE_BYTES,
        checkedAt: this.now()
      })
      return false
    } finally {
      clearTimeout(this.checkTimer ?? undefined)
      this.checkTimer = null
      this.cancelCheck = null
    }
  }

  private publish(storage: FileIndexContentStorage): void {
    const previous = this.storage.status
    this.storage = storage
    if (previous !== storage.status) this.deps.onChange?.(this.getSnapshot())
  }
}
