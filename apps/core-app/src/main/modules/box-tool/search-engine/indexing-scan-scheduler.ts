import type {
  IndexedSource,
  IndexedSourceRecordBatch,
  IndexedSourceScanReason,
  IndexedSourceScanRequest
} from '@talex-touch/utils/search'
import type { IndexStoreAdapter } from './indexing-store-adapter'

export interface ScanSchedulerResult {
  sourceId: string
  batches: number
  records: number
  startedAt: number
  completedAt: number
}

export interface ScanSchedulerError {
  sourceId: string
  message: string
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
  errors: ScanSchedulerError[]
  skipped: ScanSchedulerSkippedSource[]
  startedAt: number
  completedAt: number
}

export class ScanScheduler {
  private readonly runningSources = new Set<string>()

  constructor(private readonly store: IndexStoreAdapter) {}

  isRunning(sourceId: string): boolean {
    return this.runningSources.has(sourceId)
  }

  async scanSource(
    source: IndexedSource,
    reason: IndexedSourceScanReason,
    request: Partial<IndexedSourceScanRequest> = {}
  ): Promise<ScanSchedulerResult> {
    const sourceId = source.descriptor.id
    if (this.runningSources.has(sourceId)) {
      throw new Error(`Indexed source '${sourceId}' scan is already running`)
    }

    const startedAt = Date.now()
    let batches = 0
    let records = 0

    this.runningSources.add(sourceId)
    try {
      for await (const batch of source.scan({
        ...request,
        sourceId,
        reason
      })) {
        await this.store.applyBatch(batch)
        batches += 1
        records += batch.records.length
      }
    } finally {
      this.runningSources.delete(sourceId)
    }

    return {
      sourceId,
      batches,
      records,
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
        message: this.stringifyError(item.error)
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
