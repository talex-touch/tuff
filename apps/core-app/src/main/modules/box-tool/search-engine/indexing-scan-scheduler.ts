import type {
  IndexedSource,
  IndexedSourceRecordBatch,
  IndexedSourceScanReason,
  IndexedSourceScanRequest
} from '@talex-touch/utils/search'
import type { IndexStoreAdapter } from './indexing-store-adapter'
import { IndexedSourceTaskRunGate } from '@talex-touch/utils/search'

export interface ScanSchedulerResult {
  sourceId: string
  batches: number
  records: number
  indexedRecords: number
  startedAt: number
  completedAt: number
}

export interface ScanSchedulerError {
  sourceId: string
  message: string
  phase: 'source' | 'store'
  batches?: number
  records?: number
  indexedRecords?: number
}

export interface ScanSchedulerSkippedSource {
  sourceId: string
  reason: string
}

export interface ScanSchedulerBatchResult {
  results: ScanSchedulerResult[]
  totalSources: number
  scannedSources: number
  failedSources: number
  skippedSources: number
  batches: number
  records: number
  indexedRecords: number
  errors: ScanSchedulerError[]
  skipped: ScanSchedulerSkippedSource[]
  startedAt: number
  completedAt: number
}

export class ScanScheduler {
  private readonly runGate: IndexedSourceTaskRunGate

  constructor(
    private readonly store: IndexStoreAdapter,
    runGate?: IndexedSourceTaskRunGate
  ) {
    this.runGate = runGate ?? new IndexedSourceTaskRunGate()
  }

  isRunning(sourceId: string): boolean {
    return this.runGate.isRunning(sourceId, 'scan')
  }

  async scanSource(
    source: IndexedSource,
    reason: IndexedSourceScanReason,
    request: Partial<IndexedSourceScanRequest> = {}
  ): Promise<ScanSchedulerResult> {
    const sourceId = source.descriptor.id
    const decision = this.runGate.canStart(sourceId, 'scan')
    if (!decision.allowed) {
      throw new Error(`Indexed source '${sourceId}' scan is already running`)
    }

    const startedAt = Date.now()
    let batches = 0
    let records = 0
    let indexedRecords = 0

    this.runGate.start(sourceId, 'scan', startedAt)
    try {
      for await (const batch of source.scan({
        ...request,
        sourceId,
        reason
      })) {
        let summary: Awaited<ReturnType<IndexStoreAdapter['applyBatch']>>
        try {
          summary = await this.store.applyBatch(batch)
        } catch (error) {
          throw new ScanSchedulerPhaseError(
            'store',
            this.stringifyError(error),
            batches,
            records,
            indexedRecords
          )
        }
        batches += 1
        records += batch.records.length
        indexedRecords += summary?.indexedItemCount ?? batch.records.length
      }
    } catch (error) {
      if (error instanceof ScanSchedulerPhaseError) {
        throw error
      }
      throw new ScanSchedulerPhaseError(
        'source',
        this.stringifyError(error),
        batches,
        records,
        indexedRecords
      )
    } finally {
      this.runGate.complete(sourceId, 'scan')
    }

    return {
      sourceId,
      batches,
      records,
      indexedRecords,
      startedAt,
      completedAt: Date.now()
    }
  }

  async scanSources(
    sources: IndexedSource[],
    reason: IndexedSourceScanReason
  ): Promise<ScanSchedulerResult[]> {
    const result = await this.scanSourcesWithResult(sources, reason)
    return result.results
  }

  async scanSourcesWithResult(
    sources: IndexedSource[],
    reason: IndexedSourceScanReason
  ): Promise<ScanSchedulerBatchResult> {
    const startedAt = Date.now()
    const settled = await Promise.all(
      sources.map(async (source) => {
        try {
          return {
            status: 'fulfilled' as const,
            result: await this.scanSource(source, reason)
          }
        } catch (error) {
          return {
            status: 'rejected' as const,
            sourceId: source.descriptor.id,
            error
          }
        }
      })
    )
    const results: ScanSchedulerResult[] = []
    const errors: ScanSchedulerError[] = []

    for (const item of settled) {
      if (item.status === 'fulfilled') {
        results.push(item.result)
        continue
      }
      errors.push({
        sourceId: item.sourceId,
        message: this.stringifyError(item.error),
        phase: item.error instanceof ScanSchedulerPhaseError ? item.error.phase : 'source',
        batches: item.error instanceof ScanSchedulerPhaseError ? item.error.batches : undefined,
        records: item.error instanceof ScanSchedulerPhaseError ? item.error.records : undefined,
        indexedRecords:
          item.error instanceof ScanSchedulerPhaseError ? item.error.indexedRecords : undefined
      })
    }

    return {
      results,
      totalSources: sources.length,
      scannedSources: results.length,
      failedSources: errors.length,
      skippedSources: 0,
      batches: results.reduce((sum, result) => sum + result.batches, 0),
      records: results.reduce((sum, result) => sum + result.records, 0),
      indexedRecords: results.reduce((sum, result) => sum + result.indexedRecords, 0),
      errors,
      skipped: [],
      startedAt,
      completedAt: Date.now()
    }
  }

  private stringifyError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}

export type { IndexedSourceRecordBatch }

class ScanSchedulerPhaseError extends Error {
  constructor(
    readonly phase: 'source' | 'store',
    message: string,
    readonly batches: number,
    readonly records: number,
    readonly indexedRecords: number
  ) {
    super(message)
    this.name = phase === 'store' ? 'ScanSchedulerStoreError' : 'ScanSchedulerSourceError'
  }
}
