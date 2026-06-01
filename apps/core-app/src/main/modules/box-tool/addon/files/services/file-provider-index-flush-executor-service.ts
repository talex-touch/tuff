import type { IndexWorkerFileResult } from '../workers/file-index-worker-client'
import type { PersistEntry } from '../../../search-engine/workers/search-index-worker-client'
import { performance } from 'node:perf_hooks'
import { dbWriteScheduler } from '../../../../../db/db-write-scheduler'
import {
  buildIndexedWriteFlushBatchMetrics,
  IndexedWriteFlushExecutorService,
  mapIndexedWriteFlushExecutorResult
} from '@talex-touch/utils/search'
import { FileProviderIndexFlushBufferService } from './file-provider-index-flush-service'

export type FileProviderIndexFlushExecutorStatus = 'idle' | 'flushed' | 'worker-not-ready'

export interface FileProviderIndexFlushExecutorResult {
  status: FileProviderIndexFlushExecutorStatus
  entries: number
  withContent: number
  pending: number
  inflight: number
  reason?: string
  error?: string
  metadata?: Record<string, unknown>
  durationMs?: number
}

export interface FileProviderIndexFlushExecutorServiceDeps {
  flushBatchScheduler: { currentSize: number; recordDuration: (durationMs: number) => void }
  getDbUtils: () => unknown | null
  getSearchIndex: () => unknown | null
  buffer: FileProviderIndexFlushBufferService
  ensureSearchIndexWorkerReady: (reason: string) => Promise<boolean>
  getSearchIndexWorker: () => {
    persistAndIndex: (entries: PersistEntry[]) => Promise<void>
  }
  buildPersistEntries: (entries: IndexWorkerFileResult[]) => PersistEntry[]
  logDebug: (message: string, meta?: Record<string, unknown>) => void
  waitForCapacity?: (maxQueued: number) => Promise<void>
  now?: () => number
  config?: {
    dbBackpressureMaxQueued?: number
  }
}

export class FileProviderIndexFlushExecutorService {
  private readonly flushBatchScheduler: FileProviderIndexFlushExecutorServiceDeps['flushBatchScheduler']
  private readonly getDbUtils: FileProviderIndexFlushExecutorServiceDeps['getDbUtils']
  private readonly getSearchIndex: FileProviderIndexFlushExecutorServiceDeps['getSearchIndex']
  private readonly buffer: FileProviderIndexFlushBufferService
  private readonly ensureSearchIndexWorkerReady: FileProviderIndexFlushExecutorServiceDeps['ensureSearchIndexWorkerReady']
  private readonly getSearchIndexWorker: FileProviderIndexFlushExecutorServiceDeps['getSearchIndexWorker']
  private readonly buildPersistEntries: FileProviderIndexFlushExecutorServiceDeps['buildPersistEntries']
  private readonly logDebug: FileProviderIndexFlushExecutorServiceDeps['logDebug']
  private readonly waitForCapacity: NonNullable<
    FileProviderIndexFlushExecutorServiceDeps['waitForCapacity']
  >
  private readonly now: NonNullable<FileProviderIndexFlushExecutorServiceDeps['now']>
  private readonly dbBackpressureMaxQueued: number
  private readonly executor: IndexedWriteFlushExecutorService<
    number,
    IndexWorkerFileResult,
    PersistEntry
  >

  constructor(deps: FileProviderIndexFlushExecutorServiceDeps) {
    this.flushBatchScheduler = deps.flushBatchScheduler
    this.getDbUtils = deps.getDbUtils
    this.getSearchIndex = deps.getSearchIndex
    this.buffer = deps.buffer
    this.ensureSearchIndexWorkerReady = deps.ensureSearchIndexWorkerReady
    this.getSearchIndexWorker = deps.getSearchIndexWorker
    this.buildPersistEntries = deps.buildPersistEntries
    this.logDebug = deps.logDebug
    this.waitForCapacity =
      deps.waitForCapacity ?? ((maxQueued) => dbWriteScheduler.waitForCapacity(maxQueued))
    this.now = deps.now ?? (() => performance.now())
    this.dbBackpressureMaxQueued = deps.config?.dbBackpressureMaxQueued ?? 10
    this.executor = new IndexedWriteFlushExecutorService({
      buffer: this.buffer,
      getBatchSize: () => this.flushBatchScheduler.currentSize,
      isAvailable: () => Boolean(this.getDbUtils() && this.getSearchIndex()),
      ensureReady: () => this.ensureSearchIndexWorkerReady('index-runtime.flush'),
      buildPersistEntries: this.buildPersistEntries,
      persist: (entries) => this.getSearchIndexWorker().persistAndIndex(entries),
      waitForCapacity: () => this.waitForCapacity(this.dbBackpressureMaxQueued),
      recordDuration: (durationMs) => this.flushBatchScheduler.recordDuration(durationMs),
      now: this.now,
      onBatchTaken: (entries) => this.logBatchTaken(entries),
      resolveBatchMetadata: (entries) => this.resolveBatchMetadata(entries)
    })
  }

  async execute(): Promise<FileProviderIndexFlushExecutorResult> {
    const result = await this.executor.execute()
    return mapIndexedWriteFlushExecutorResult(result, {
      statusMap: {
        idle: 'idle',
        flushed: 'flushed',
        'not-ready': 'worker-not-ready'
      },
      numericMetadataKeys: ['withContent'] as const
    })
  }

  private logBatchTaken(entries: IndexWorkerFileResult[]): void {
    const { withContent } = this.resolveBatchMetadata(entries)
    if (withContent > 0) {
      this.logDebug(`Flushing ${entries.length} worker results (${withContent} with content)`)
    }
  }

  private resolveBatchMetadata(entries: IndexWorkerFileResult[]): { withContent: number } {
    return buildIndexedWriteFlushBatchMetrics(entries, [
      {
        key: 'withContent',
        count: (entry) => Boolean(entry.indexItem.content && entry.indexItem.content.length > 0)
      }
    ])
  }
}
