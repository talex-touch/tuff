import {
  IndexedWriteRuntimeEmitterService,
  takeIndexedWriteRecordChunk
} from '@talex-touch/utils/search'
import type { IndexedSourceRecord, IndexedSourceRecordBatch } from '@talex-touch/utils/search'
import type { UpsertFileRecord } from '../../../search-engine/search-index-writer'

export interface FileProviderFullScanInsertResult<TInserted> {
  inserted: TInserted[]
  insertedCount: number
}

/**
 * A chunk slower than this means the write path is already behind, so the loop
 * parks for (at most) the chunk's own duration instead of hammering it.
 * Sits below the AIMD targetMs (300) so a chunk that already tripped congestion
 * control backs off exactly once.
 */
const FULL_SCAN_CHUNK_BACKOFF_MS = 250
const FULL_SCAN_CHUNK_BACKOFF_MAX_MS = 1_000

export interface FileProviderFullScanInsertDeps<TInserted, TContext> {
  sourceId: string
  mapRecord: (record: TInserted) => IndexedSourceRecord
  getBatchSize: () => number
  recordBatchDuration: (durationMs: number) => void
  waitForIdle: () => Promise<void>
  upsertFiles: (records: UpsertFileRecord[], reason: string) => Promise<TInserted[]>
  persistAndEmitBatch?: (records: UpsertFileRecord[], context: TContext) => Promise<TInserted[]>
  emitRecordBatch: (batch: IndexedSourceRecordBatch, context: TContext) => Promise<void>
  emitProgress: (current: number, total: number) => void
  sleep: (durationMs: number) => Promise<void>
  now: () => number
  formatDuration: (durationMs: number) => string
  logInfo: (message: string, meta?: Record<string, unknown>) => void
  logDebug: (message: string, meta?: Record<string, unknown>) => void
}

export class FileProviderFullScanInsertService<TInserted, TContext> {
  private readonly getBatchSize: FileProviderFullScanInsertDeps<TInserted, TContext>['getBatchSize']
  private readonly recordBatchDuration: FileProviderFullScanInsertDeps<
    TInserted,
    TContext
  >['recordBatchDuration']
  private readonly waitForIdle: FileProviderFullScanInsertDeps<TInserted, TContext>['waitForIdle']
  private readonly upsertFiles: FileProviderFullScanInsertDeps<TInserted, TContext>['upsertFiles']
  private readonly persistAndEmitBatch:
    | FileProviderFullScanInsertDeps<TInserted, TContext>['persistAndEmitBatch']
    | undefined
  private readonly sleep: FileProviderFullScanInsertDeps<TInserted, TContext>['sleep']
  private readonly now: FileProviderFullScanInsertDeps<TInserted, TContext>['now']
  private readonly formatDuration: FileProviderFullScanInsertDeps<
    TInserted,
    TContext
  >['formatDuration']
  private readonly logInfo: FileProviderFullScanInsertDeps<TInserted, TContext>['logInfo']
  private readonly logDebug: FileProviderFullScanInsertDeps<TInserted, TContext>['logDebug']
  private readonly runtimeEmitter: IndexedWriteRuntimeEmitterService<TInserted, TContext>

  constructor(deps: FileProviderFullScanInsertDeps<TInserted, TContext>) {
    this.getBatchSize = deps.getBatchSize
    this.recordBatchDuration = deps.recordBatchDuration
    this.waitForIdle = deps.waitForIdle
    this.upsertFiles = deps.upsertFiles
    this.persistAndEmitBatch = deps.persistAndEmitBatch
    this.sleep = deps.sleep
    this.now = deps.now
    this.formatDuration = deps.formatDuration
    this.logInfo = deps.logInfo
    this.logDebug = deps.logDebug
    this.runtimeEmitter = new IndexedWriteRuntimeEmitterService({
      sourceId: deps.sourceId,
      mapRecord: deps.mapRecord,
      emitRecordBatch: deps.emitRecordBatch,
      emitProgress: deps.emitProgress
    })
  }

  async execute(
    rootPath: string,
    records: UpsertFileRecord[],
    context: TContext
  ): Promise<FileProviderFullScanInsertResult<TInserted>> {
    if (records.length === 0) {
      return { inserted: [], insertedCount: 0 }
    }

    this.logInfo('Preparing to index full-scan results', {
      path: rootPath,
      files: records.length
    })

    const insertedRecords: TInserted[] = []
    let indexedFiles = 0
    let recordOffset = 0
    type PendingChunk = {
      chunk: UpsertFileRecord[]
      result: Promise<{
        inserted: TInserted[]
        batchMs: number
        waitForIdleMs: number
        writeMs: number
        published: boolean
      }>
    }

    const startChunk = (chunk: UpsertFileRecord[]): PendingChunk => {
      const result = (async () => {
        const waitStartedAt = this.now()
        await this.waitForIdle()
        const waitForIdleMs = this.now() - waitStartedAt
        const chunkStart = this.now()
        const fused = this.persistAndEmitBatch
        const inserted = fused
          ? await fused(chunk, context)
          : await this.upsertFiles(chunk, 'full-scan.upsert')
        const writeMs = this.now() - chunkStart
        return {
          inserted,
          batchMs: writeMs,
          waitForIdleMs,
          writeMs,
          published: Boolean(fused)
        }
      })()
      // The result is awaited by the next loop turn. Attach a rejection handler now so a
      // fast worker failure during the current batch's publication cannot become unhandled.
      void result.catch(() => undefined)
      return { chunk, result }
    }

    const takeNextChunk = (): PendingChunk | null => {
      if (recordOffset >= records.length) return null
      const { chunk, nextOffset } = takeIndexedWriteRecordChunk(
        records,
        recordOffset,
        this.getBatchSize()
      )
      recordOffset = nextOffset
      return startChunk(chunk)
    }

    let pendingChunk: PendingChunk | null = null
    this.runtimeEmitter.emitProgressSnapshot({
      current: 0,
      total: records.length
    })

    try {
      while (pendingChunk || recordOffset < records.length) {
        const currentChunk = pendingChunk ?? takeNextChunk()
        pendingChunk = null
        if (!currentChunk) break

        const { inserted, batchMs, waitForIdleMs, writeMs, published } = await currentChunk.result
        this.recordBatchDuration(batchMs)
        insertedRecords.push(...inserted)

        this.logDebug('Full scan chunk inserted', {
          path: rootPath,
          chunk: `batch(${currentChunk.chunk.length})`,
          size: currentChunk.chunk.length,
          mode: published ? 'fused' : 'legacy',
          waitForIdleMs: Math.round(waitForIdleMs),
          writeDurationMs: Math.round(writeMs),
          duration: this.formatDuration(batchMs)
        })

        if (!published) {
          // Publication waits for the FTS writer and reader-visibility barrier. Start at most one
          // next persistence operation after publication has been admitted, so its worker round
          // trip can overlap that barrier without allowing a second FTS mutation to overtake it.
          const shouldPrefetch =
            batchMs < FULL_SCAN_CHUNK_BACKOFF_MS && recordOffset < records.length
          try {
            const emitPromise = this.runtimeEmitter.emitBatch(inserted, context)
            if (shouldPrefetch) pendingChunk = takeNextChunk()
            await emitPromise
          } catch (error) {
            if (pendingChunk) await pendingChunk.result.catch(() => undefined)
            pendingChunk = null
            throw error
          }
        }

        indexedFiles += currentChunk.chunk.length
        this.runtimeEmitter.emitProgressSnapshot({
          current: indexedFiles,
          total: records.length
        })
        // `recordBatchDuration` feeds the AIMD window (targetMs=300) and the two
        // awaited worker round-trips above already hand the event loop back, so a
        // fixed floor here is a second, redundant pacer — and a throughput cap:
        // measured 607 chunks x ~177ms for a 10.6k-file scan, of which ~100ms per
        // chunk (56%) was this timer. Only back off when the chunk itself ran long
        // enough that the next one would compound the backlog.
        if (batchMs >= FULL_SCAN_CHUNK_BACKOFF_MS) {
          await this.sleep(Math.min(Math.round(batchMs), FULL_SCAN_CHUNK_BACKOFF_MAX_MS))
        }
      }
    } finally {
      if (pendingChunk) await pendingChunk.result.catch(() => undefined)
    }

    return {
      inserted: insertedRecords,
      insertedCount: insertedRecords.length
    }
  }
}
