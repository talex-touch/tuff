import type {
  IndexedSource,
  IndexedSourceDelta,
  IndexedSourceReconcileRequest,
  IndexedSourceReconcileResult
} from '@talex-touch/utils/search'
import type { IndexStoreAdapter, IndexStoreDeltaApplySummary } from './indexing-store-adapter'
import { IndexedSourceReconcileReasons } from '@talex-touch/utils/search'
import { IndexingSourceMutationGate } from './indexing-source-mutation-gate'

function buildUnsupportedResult(
  sourceId: string,
  request: Partial<IndexedSourceReconcileRequest> = {}
): IndexedSourceReconcileResult {
  const now = Date.now()
  return {
    sourceId,
    added: 0,
    changed: 0,
    deleted: 0,
    skipped: 0,
    errors: 0,
    startedAt: now,
    completedAt: now,
    reason: request.reason ?? IndexedSourceReconcileReasons.Unsupported
  }
}

export class ReconcileEngine {
  constructor(
    private readonly store?: IndexStoreAdapter,
    private readonly sourceMutationGate = new IndexingSourceMutationGate()
  ) {}

  async reconcileSource(
    source: IndexedSource,
    request: Partial<IndexedSourceReconcileRequest> = {}
  ): Promise<IndexedSourceReconcileResult> {
    const sourceId = source.descriptor.id
    return await this.sourceMutationGate.run(sourceId, async (lease) => {
      if (!source.reconcile) {
        return buildUnsupportedResult(sourceId, request)
      }

      let drainAttempted = false
      try {
        const store = this.store
        let streamedAppliedDeltas = 0
        let streamedSkippedDeltas = 0
        const result = await source.reconcile({
          ...request,
          sourceId,
          mutationLeaseId: lease.id,
          onRecordBatch: store
            ? async (batch) => {
                if (batch.sourceId !== sourceId) {
                  throw new Error(
                    `Indexed source '${sourceId}' yielded batch for '${batch.sourceId}'`
                  )
                }
                await store.applyBatch({ ...batch, mutationLeaseId: lease.id })
              }
            : request.onRecordBatch,
          onDelta: store
            ? async (delta) => {
                if (delta.sourceId !== sourceId) {
                  throw new Error(
                    `Indexed source '${sourceId}' yielded delta for '${delta.sourceId}'`
                  )
                }
                const summary = await store.applyDelta({ ...delta, mutationLeaseId: lease.id })
                if (isSkippedDeltaSummary(summary)) streamedSkippedDeltas += 1
                else streamedAppliedDeltas += 1
              }
            : request.onDelta
        })
        let applied = await this.applyReconcileDeltas(result, lease.id)
        if (streamedAppliedDeltas > 0 || streamedSkippedDeltas > 0) {
          applied = {
            ...applied,
            appliedDeltas: (applied.appliedDeltas ?? 0) + streamedAppliedDeltas,
            skippedDeltas: (applied.skippedDeltas ?? 0) + streamedSkippedDeltas
          }
        }
        if (source.drainMutations) {
          drainAttempted = true
          await source.drainMutations({ leaseId: lease.id, reason: 'reconcile' })
        }
        return { ...applied, completedAt: Date.now() }
      } catch (error) {
        if (source.drainMutations && !drainAttempted) {
          drainAttempted = true
          await source
            .drainMutations({ leaseId: lease.id, reason: 'reconcile' })
            .catch(() => undefined)
        }
        throw error
      }
    })
  }

  async reconcileSources(sources: IndexedSource[]): Promise<IndexedSourceReconcileResult[]> {
    const result = await this.reconcileSourcesWithResult(sources)
    return result.results
  }

  async reconcileSourcesWithResult(sources: IndexedSource[]): Promise<ReconcileEngineBatchResult> {
    const startedAt = Date.now()
    const settled = await Promise.all(
      sources.map(async (source) => {
        try {
          return {
            status: 'fulfilled' as const,
            result: await this.reconcileSource(source)
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
    const results: IndexedSourceReconcileResult[] = []
    const errors: ReconcileEngineError[] = []

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
      reconciledSources: results.length,
      failedSources: errors.length,
      skippedSources: 0,
      added: results.reduce((sum, result) => sum + result.added, 0),
      changed: results.reduce((sum, result) => sum + result.changed, 0),
      deleted: results.reduce((sum, result) => sum + result.deleted, 0),
      skipped: results.reduce((sum, result) => sum + result.skipped, 0),
      errors: results.reduce((sum, result) => sum + result.errors, 0),
      failures: errors,
      skippedDetails: [],
      startedAt,
      completedAt: Date.now()
    }
  }

  private stringifyError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }

  private async applyReconcileDeltas(
    result: IndexedSourceReconcileResult,
    mutationLeaseId: string
  ): Promise<IndexedSourceReconcileResult> {
    if (!this.store || !Array.isArray(result.deltas) || result.deltas.length === 0) {
      return result
    }

    const settled = await Promise.all(
      result.deltas.map(async (delta) => {
        try {
          const summary = await this.store?.applyDelta({ ...delta, mutationLeaseId })
          return { status: 'fulfilled' as const, delta, summary }
        } catch (error) {
          return { status: 'rejected' as const, delta, error }
        }
      })
    )
    const appliedDeltas = settled.filter(
      (item) => isFulfilledDelta(item) && !isSkippedDeltaSummary(item.summary)
    ).length
    const skippedDeltas = settled.filter(
      (item) => isFulfilledDelta(item) && isSkippedDeltaSummary(item.summary)
    ).length
    const deltaErrors = settled
      .filter(isRejectedDelta)
      .map((item) => `${item.delta.sourceId}:${this.stringifyError(item.error)}`)

    return {
      ...result,
      appliedDeltas,
      failedDeltas: deltaErrors.length,
      skippedDeltas,
      deltaErrors: deltaErrors.length > 0 ? deltaErrors : result.deltaErrors
    }
  }
}

function isFulfilledDelta(
  value: ReconcileDeltaApplyResult
): value is Extract<ReconcileDeltaApplyResult, { status: 'fulfilled' }> {
  return value.status === 'fulfilled'
}

function isRejectedDelta(
  value: ReconcileDeltaApplyResult
): value is Extract<ReconcileDeltaApplyResult, { status: 'rejected' }> {
  return value.status === 'rejected'
}

type ReconcileDeltaApplyResult =
  | {
      status: 'fulfilled'
      delta: IndexedSourceDelta
      summary: IndexStoreDeltaApplySummary | void
    }
  | {
      status: 'rejected'
      delta: IndexedSourceDelta
      error: unknown
    }

export interface ReconcileEngineError {
  sourceId: string
  message: string
}

export interface ReconcileEngineSkippedSource {
  sourceId: string
  reason: string
}

export interface ReconcileEngineBatchResult {
  results: IndexedSourceReconcileResult[]
  totalSources: number
  reconciledSources: number
  failedSources: number
  skippedSources: number
  added: number
  changed: number
  deleted: number
  skipped: number
  errors: number
  failures: ReconcileEngineError[]
  skippedDetails: ReconcileEngineSkippedSource[]
  startedAt: number
  completedAt: number
}

function isSkippedDeltaSummary(
  summary: IndexStoreDeltaApplySummary | void
): summary is IndexStoreDeltaApplySummary {
  return Boolean(summary && summary.applied === false)
}
