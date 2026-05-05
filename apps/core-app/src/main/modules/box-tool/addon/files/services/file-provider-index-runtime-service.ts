import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import type { PersistEntry } from '../../../search-engine/workers/search-index-worker-client'
import { performance } from 'node:perf_hooks'
import { dbWriteScheduler } from '../../../../../db/db-write-scheduler'
import { isSqliteBusyError } from '../../../../../db/sqlite-retry'
import {
  commitIndexWorkerFlushBatch,
  getIndexWorkerBusyRetryDelay,
  getIndexWorkerFlushDelay,
  rollbackIndexWorkerFlushBatch,
  takeIndexWorkerFlushBatch
} from './file-provider-index-flush-service'

export interface FileProviderIndexRuntimeServiceDeps {
  flushBatchScheduler: { currentSize: number; recordDuration: (durationMs: number) => void }
  getDbUtils: () => unknown | null
  getSearchIndex: () => unknown | null
  getPendingResults: () => Map<number, IndexWorkerFileResult>
  getInflightResults: () => Map<number, IndexWorkerFileResult>
  getDatabaseFilePath: () => string | null
  getSearchIndexWorker: () => {
    init: (databaseFilePath: string) => Promise<void>
    persistAndIndex: (entries: PersistEntry[]) => Promise<void>
  }
  buildPersistEntries: (entries: IndexWorkerFileResult[]) => PersistEntry[]
  logDebug: (message: string, meta?: Record<string, unknown>) => void
  logWarn: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
  logError: (message: string, error?: unknown, meta?: Record<string, unknown>) => void
  config?: {
    baseDelayMs?: number
    backlogDelayMs?: number
    flushDeferMs?: number
    dbBackpressureMaxQueued?: number
    busyRetryBaseMs?: number
    busyRetryMaxMs?: number
  }
}

export class FileProviderIndexRuntimeService {
  private readonly flushBatchScheduler: FileProviderIndexRuntimeServiceDeps['flushBatchScheduler']
  private readonly getDbUtils: FileProviderIndexRuntimeServiceDeps['getDbUtils']
  private readonly getSearchIndex: FileProviderIndexRuntimeServiceDeps['getSearchIndex']
  private readonly getPendingResults: FileProviderIndexRuntimeServiceDeps['getPendingResults']
  private readonly getInflightResults: FileProviderIndexRuntimeServiceDeps['getInflightResults']
  private readonly getDatabaseFilePath: FileProviderIndexRuntimeServiceDeps['getDatabaseFilePath']
  private readonly getSearchIndexWorker: FileProviderIndexRuntimeServiceDeps['getSearchIndexWorker']
  private readonly buildPersistEntries: FileProviderIndexRuntimeServiceDeps['buildPersistEntries']
  private readonly logDebug: FileProviderIndexRuntimeServiceDeps['logDebug']
  private readonly logWarn: FileProviderIndexRuntimeServiceDeps['logWarn']
  private readonly logError: FileProviderIndexRuntimeServiceDeps['logError']
  private readonly config: Required<NonNullable<FileProviderIndexRuntimeServiceDeps['config']>>

  private indexWorkerFlushTimer: NodeJS.Timeout | null = null
  private indexWorkerFlushing = false
  private indexWorkerFlushBusyRetryCount = 0

  constructor(deps: FileProviderIndexRuntimeServiceDeps) {
    this.flushBatchScheduler = deps.flushBatchScheduler
    this.getDbUtils = deps.getDbUtils
    this.getSearchIndex = deps.getSearchIndex
    this.getPendingResults = deps.getPendingResults
    this.getInflightResults = deps.getInflightResults
    this.getDatabaseFilePath = deps.getDatabaseFilePath
    this.getSearchIndexWorker = deps.getSearchIndexWorker
    this.buildPersistEntries = deps.buildPersistEntries
    this.logDebug = deps.logDebug
    this.logWarn = deps.logWarn
    this.logError = deps.logError
    this.config = {
      baseDelayMs: deps.config?.baseDelayMs ?? 250,
      backlogDelayMs: deps.config?.backlogDelayMs ?? 500,
      flushDeferMs: deps.config?.flushDeferMs ?? 300,
      dbBackpressureMaxQueued: deps.config?.dbBackpressureMaxQueued ?? 10,
      busyRetryBaseMs: deps.config?.busyRetryBaseMs ?? 250,
      busyRetryMaxMs: deps.config?.busyRetryMaxMs ?? 5000
    }
  }

  async initWorker(): Promise<void> {
    const databaseFilePath = this.getDatabaseFilePath()
    if (!databaseFilePath) {
      return
    }

    try {
      await this.getSearchIndexWorker().init(databaseFilePath)
    } catch (error) {
      this.logError('SearchIndexWorkerClient init failed', error)
    }
  }

  handleIndexWorkerFile(payload: IndexWorkerFileResult): void {
    if (!payload || typeof payload.fileId !== 'number') {
      return
    }

    const pending = this.getPendingResults()
    pending.set(payload.fileId, payload)
    this.scheduleFlush(
      getIndexWorkerFlushDelay(pending.size, {
        baseDelayMs: this.config.baseDelayMs,
        backlogDelayMs: this.config.backlogDelayMs
      }),
      'worker-payload'
    )
  }

  scheduleFlush(delayMs: number, reason: string): void {
    if (this.indexWorkerFlushTimer) {
      return
    }
    const safeDelay = Math.max(0, Math.round(delayMs))
    this.indexWorkerFlushTimer = setTimeout(() => {
      this.indexWorkerFlushTimer = null
      void this.flush().catch((error) => {
        this.logWarn('flushIndexWorkerResults rejected unexpectedly', error, { reason })
      })
    }, safeDelay)
  }

  async flush(): Promise<void> {
    if (!this.getDbUtils() || !this.getSearchIndex()) {
      return
    }

    const pending = this.getPendingResults()
    if (pending.size === 0) {
      return
    }

    if (this.indexWorkerFlushing) {
      this.scheduleFlush(this.config.flushDeferMs, 'flush-in-progress')
      return
    }

    this.indexWorkerFlushing = true
    let flushSucceeded = false
    try {
      await this.doFlush()
      this.indexWorkerFlushBusyRetryCount = 0
      flushSucceeded = true
    } catch (error) {
      const isBusy = isSqliteBusyError(error)
      const delayMs = isBusy
        ? (() => {
            const retry = getIndexWorkerBusyRetryDelay(this.indexWorkerFlushBusyRetryCount, {
              baseDelayMs: this.config.busyRetryBaseMs,
              maxDelayMs: this.config.busyRetryMaxMs
            })
            this.indexWorkerFlushBusyRetryCount = retry.nextRetryCount
            return retry.delayMs
          })()
        : getIndexWorkerFlushDelay(pending.size, {
            baseDelayMs: this.config.baseDelayMs,
            backlogDelayMs: this.config.backlogDelayMs
          })

      this.logWarn('Index worker flush failed, scheduling retry', error, {
        isBusy,
        delayMs,
        pending: pending.size,
        inflight: this.getInflightResults().size
      })
      this.scheduleFlush(delayMs, isBusy ? 'sqlite-busy-retry' : 'flush-failed')
    } finally {
      this.indexWorkerFlushing = false
    }

    if (flushSucceeded && pending.size > 0) {
      this.scheduleFlush(
        getIndexWorkerFlushDelay(pending.size, {
          baseDelayMs: this.config.baseDelayMs,
          backlogDelayMs: this.config.backlogDelayMs
        }),
        'drain-remaining'
      )
    }
  }

  async doFlush(): Promise<void> {
    if (!this.getDbUtils() || !this.getSearchIndex()) return

    const pending = this.getPendingResults()
    if (pending.size === 0) return

    const inflight = this.getInflightResults()
    const flushBatchSize = this.flushBatchScheduler.currentSize
    const { entries, keys } = takeIndexWorkerFlushBatch(pending, inflight, flushBatchSize)
    if (entries.length === 0) return

    const withContent = entries.filter(
      (entry) => entry.indexItem.content && entry.indexItem.content.length > 0
    ).length
    if (withContent > 0) {
      this.logDebug(`Flushing ${entries.length} worker results (${withContent} with content)`)
    }

    const persistEntries = this.buildPersistEntries(entries)
    try {
      await dbWriteScheduler.waitForCapacity(this.config.dbBackpressureMaxQueued)
      const flushStart = performance.now()
      await this.getSearchIndexWorker().persistAndIndex(persistEntries)
      this.flushBatchScheduler.recordDuration(performance.now() - flushStart)
      commitIndexWorkerFlushBatch(inflight, keys)
    } catch (error) {
      rollbackIndexWorkerFlushBatch(pending, inflight, keys)
      throw error
    }
  }
}
