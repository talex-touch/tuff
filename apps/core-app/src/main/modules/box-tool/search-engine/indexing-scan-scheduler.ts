import type {
  IndexedSource,
  IndexedSourceRecordBatch,
  IndexedSourceScanReason,
  IndexedSourceScanRequest
} from '@talex-touch/utils/search'
import type { IndexStoreAdapter } from './indexing-store-adapter'
import type { IndexingSourceMutationLease } from './indexing-source-mutation-gate'
import { IndexedSourceTaskRunGate } from '@talex-touch/utils/search'
import { IndexingSourceMutationGate } from './indexing-source-mutation-gate'

export interface ScanSchedulerResult {
  sourceId: string
  batches: number
  records: number
  indexedRecords: number
  startedAt: number
  completedAt: number
}

export interface ScanSchedulerReplaceResult {
  snapshot: ScanSchedulerResult
  removedIndexedItems: number
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
    runGate?: IndexedSourceTaskRunGate,
    private readonly sourceMutationGate = new IndexingSourceMutationGate()
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
    let enteredLease = false
    this.runGate.start(sourceId, 'scan', startedAt)
    try {
      return await this.sourceMutationGate.run(sourceId, async (lease) => {
        enteredLease = true
        return await this.scanSourceWithinLease(source, reason, request, lease, { startedAt })
      })
    } catch (error) {
      if (!enteredLease) this.runGate.complete(sourceId, 'scan')
      throw error
    }
  }

  async scanSourceWithinLease(
    source: IndexedSource,
    reason: IndexedSourceScanReason,
    request: Partial<IndexedSourceScanRequest> = {},
    mutationLease?: IndexingSourceMutationLease,
    reservation?: { startedAt: number }
  ): Promise<ScanSchedulerResult> {
    const sourceId = source.descriptor.id
    if (!reservation) {
      const decision = this.runGate.canStart(sourceId, 'scan')
      if (!decision.allowed) {
        throw new Error(`Indexed source '${sourceId}' scan is already running`)
      }
    }

    const startedAt = reservation?.startedAt ?? Date.now()
    let batches = 0
    let records = 0
    let indexedRecords = 0
    let drainAttempted = false
    let scanError: ScanSchedulerPhaseError | null = null

    const mutationLeaseId = mutationLease?.id
    if (!reservation) this.runGate.start(sourceId, 'scan', startedAt)
    try {
      for await (const batch of source.scan({
        ...request,
        sourceId,
        reason,
        mutationLeaseId,
        onDelta: mutationLeaseId
          ? async (delta) => {
              if (delta.sourceId !== sourceId) {
                throw new Error(
                  `Indexed source '${sourceId}' yielded delta for '${delta.sourceId}'`
                )
              }
              try {
                await this.store.applyDelta({ ...delta, mutationLeaseId })
              } catch (error) {
                throw new ScanSchedulerPhaseError(
                  'store',
                  this.stringifyError(error),
                  batches,
                  records,
                  indexedRecords
                )
              }
            }
          : request.onDelta
      })) {
        if (batch.sourceId !== sourceId) {
          throw new Error(`Indexed source '${sourceId}' yielded batch for '${batch.sourceId}'`)
        }
        let summary: Awaited<ReturnType<IndexStoreAdapter['applyBatch']>>
        try {
          summary = await this.store.applyBatch(
            mutationLeaseId ? { ...batch, mutationLeaseId } : batch
          )
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
      if (mutationLeaseId && source.drainMutations) {
        drainAttempted = true
        try {
          await source.drainMutations({ leaseId: mutationLeaseId, reason: 'scan' })
        } catch (error) {
          throw new ScanSchedulerPhaseError(
            'store',
            this.stringifyError(error),
            batches,
            records,
            indexedRecords
          )
        }
      }
    } catch (error) {
      scanError =
        error instanceof ScanSchedulerPhaseError
          ? error
          : new ScanSchedulerPhaseError(
              'source',
              this.stringifyError(error),
              batches,
              records,
              indexedRecords
            )
    } finally {
      if (mutationLeaseId && source.drainMutations && !drainAttempted) {
        drainAttempted = true
        try {
          await source.drainMutations({ leaseId: mutationLeaseId, reason: 'scan' })
        } catch (error) {
          scanError ??= new ScanSchedulerPhaseError(
            'store',
            this.stringifyError(error),
            batches,
            records,
            indexedRecords
          )
        }
      }
      this.runGate.complete(sourceId, 'scan')
    }

    if (scanError) throw scanError

    return {
      sourceId,
      batches,
      records,
      indexedRecords,
      startedAt,
      completedAt: Date.now()
    }
  }

  async replaceSourceFromSnapshotWithinLease(
    source: IndexedSource,
    reason: IndexedSourceScanReason,
    request: Partial<IndexedSourceScanRequest> = {},
    mutationLease?: IndexingSourceMutationLease
  ): Promise<ScanSchedulerReplaceResult> {
    const sourceId = source.descriptor.id
    const decision = this.runGate.canStart(sourceId, 'scan')
    if (!decision.allowed) {
      throw new Error(`Indexed source '${sourceId}' scan is already running`)
    }

    const startedAt = Date.now()
    let batches = 0
    let records = 0
    let indexedRecords = 0
    let terminalSeen = false
    let drainAttempted = false
    let committed = false
    const mutationLeaseId = mutationLease?.id
    let session: Awaited<ReturnType<IndexStoreAdapter['beginSourceReplacement']>> | null = null
    let result: ScanSchedulerReplaceResult | null = null
    let operationError: unknown
    let drainError: ScanSchedulerPhaseError | null = null
    this.runGate.start(sourceId, 'scan', startedAt)
    try {
      try {
        session = await this.store.beginSourceReplacement(sourceId)
      } catch (error) {
        throw new ScanSchedulerPhaseError('store', this.stringifyError(error), 0, 0, 0)
      }

      try {
        for await (const batch of source.scan({
          ...request,
          sourceId,
          reason,
          mutationLeaseId,
          onDelta: async () => {
            throw new Error(
              `Indexed source '${sourceId}' emitted a delta during authoritative snapshot replacement`
            )
          }
        })) {
          if (batch.sourceId !== sourceId) {
            throw new Error(`Indexed source '${sourceId}' yielded batch for '${batch.sourceId}'`)
          }
          if (terminalSeen) {
            throw new Error(`Indexed source '${sourceId}' yielded data after terminal batch`)
          }
          try {
            indexedRecords += await this.store.stageSourceReplacement(session, batch.records)
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
          terminalSeen = batch.done === true
        }
        if (!terminalSeen) {
          throw new Error(`Indexed source '${sourceId}' snapshot ended without terminal batch`)
        }
      } catch (error) {
        if (error instanceof ScanSchedulerPhaseError) throw error
        throw new ScanSchedulerPhaseError(
          'source',
          this.stringifyError(error),
          batches,
          records,
          indexedRecords
        )
      }

      let summary: Awaited<ReturnType<IndexStoreAdapter['commitSourceReplacement']>>
      try {
        summary = await this.store.commitSourceReplacement(session, {
          recordCount: records,
          indexedItemCount: indexedRecords
        })
        committed = true
        // Worker enrichment applies to the live writer; drain only after the staged base
        // snapshot has replaced old rows so those writes target the new source state.
        if (mutationLeaseId && source.drainMutations) {
          drainAttempted = true
          try {
            await source.drainMutations({ leaseId: mutationLeaseId, reason: 'scan' })
          } catch (error) {
            throw new ScanSchedulerPhaseError(
              'store',
              `committed-degraded: ${this.stringifyError(error)}`,
              batches,
              records,
              indexedRecords
            )
          }
        }
      } catch (error) {
        throw new ScanSchedulerPhaseError(
          'store',
          this.stringifyError(error),
          batches,
          records,
          indexedRecords
        )
      }
      result = {
        removedIndexedItems: summary.removedIndexedItems,
        snapshot: {
          sourceId,
          batches,
          records,
          indexedRecords: summary.indexedItemCount,
          startedAt,
          completedAt: Date.now()
        }
      }
    } catch (error) {
      operationError = error
    } finally {
      // Failed replacements must still settle/cancel producer work before aborting staging.
      if (!committed && mutationLeaseId && source.drainMutations && !drainAttempted) {
        drainAttempted = true
        try {
          await source.drainMutations({ leaseId: mutationLeaseId, reason: 'scan' })
        } catch (error) {
          drainError = new ScanSchedulerPhaseError(
            'store',
            this.stringifyError(error),
            batches,
            records,
            indexedRecords
          )
        }
      }
      if (session && !committed) {
        await this.store.abortSourceReplacement(session).catch(() => undefined)
      }
      this.runGate.complete(sourceId, 'scan')
    }
    if (drainError) throw drainError
    if (operationError) throw operationError
    if (!result)
      throw new Error(`Indexed source '${sourceId}' snapshot replacement produced no result`)
    return result
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
