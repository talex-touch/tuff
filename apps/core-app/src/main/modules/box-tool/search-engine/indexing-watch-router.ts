import type {
  IndexedSource,
  IndexedSourceDelta,
  IndexedSourceTaskSkipReason,
  IndexedSourceWatchEvent
} from '@talex-touch/utils/search'
import type { IndexingRuntimeDiagnostics } from './indexing-diagnostics-service'
import type { IndexStoreAdapter, IndexStoreDeltaApplySummary } from './indexing-store-adapter'
import process from 'node:process'
import { IndexingSourceMutationGate } from './indexing-source-mutation-gate'
import {
  resolveIndexedSourceTaskEligibility,
  resolveIndexedSourceWatchRootRoute
} from '@talex-touch/utils/search'

export interface WatchEventRouteError {
  sourceId?: string
  phase: 'handle' | 'store'
  message: string
}

export interface WatchEventRouteSkippedSource {
  sourceId: string
  reason: IndexedSourceTaskSkipReason
}

export interface WatchEventRouteDeltaSummary {
  sourceId: string
  deltas: number
  appliedDeltas: number
  failedDeltas: number
  skippedDeltas: number
}

export interface WatchEventRouteResult {
  deltas: IndexedSourceDelta[]
  matchedSources: number
  handledSources: number
  failedSources: number
  skippedSources: number
  appliedDeltas: number
  failedDeltas: number
  skippedDeltas: number
  errors: WatchEventRouteError[]
  skipped: WatchEventRouteSkippedSource[]
  deltaSummaries: WatchEventRouteDeltaSummary[]
}

export class WatchEventRouter {
  constructor(
    private readonly store: IndexStoreAdapter,
    private readonly sourceMutationGate = new IndexingSourceMutationGate()
  ) {}

  async route(
    event: IndexedSourceWatchEvent,
    sources: Map<string, IndexedSource>,
    diagnostics: IndexingRuntimeDiagnostics
  ): Promise<IndexedSourceDelta[]> {
    const result = await this.routeWithResult(event, sources, diagnostics)
    return result.deltas
  }

  async routeWithResult(
    event: IndexedSourceWatchEvent,
    sources: Map<string, IndexedSource>,
    diagnostics: IndexingRuntimeDiagnostics
  ): Promise<WatchEventRouteResult> {
    const rootRoute = event.sourceId
      ? { sources: this.getSourceById(event.sourceId, sources), skipped: [] }
      : this.getSourcesByRoot(event, sources, diagnostics)
    const { sources: eligibleSources, skipped } = this.getEligibleSources(
      rootRoute.sources,
      diagnostics,
      rootRoute.skipped
    )

    const sourceResults = await Promise.all(
      eligibleSources.map(async (source) => {
        const sourceId = source.descriptor.id
        try {
          return await this.sourceMutationGate.run(sourceId, async (lease) => {
            if (source.shouldHandleWatchEvent && !source.shouldHandleWatchEvent(event)) {
              return {
                status: 'skipped' as const,
                sourceId,
                reason: 'source-watch-filtered'
              }
            }

            const deltas = await (source.handleWatchEvent?.(event) ?? Promise.resolve([]))
            const storeResults = await Promise.all(
              deltas.map(async (delta) => {
                if (delta.sourceId !== sourceId) {
                  return {
                    status: 'rejected' as const,
                    delta,
                    error: new Error(`watch-source-mismatch:${sourceId}:${delta.sourceId}`)
                  }
                }
                try {
                  const summary = await this.store.applyDelta({
                    ...delta,
                    mutationLeaseId: lease.id
                  })
                  return {
                    status: 'fulfilled' as const,
                    delta,
                    summary
                  }
                } catch (error) {
                  return { status: 'rejected' as const, delta, error }
                }
              })
            )
            if (source.drainMutations) {
              await source.drainMutations({ leaseId: lease.id, reason: 'watch' })
            }
            return { status: 'fulfilled' as const, sourceId, deltas, storeResults }
          })
        } catch (error) {
          return { status: 'rejected' as const, sourceId, error }
        }
      })
    )
    const errors: WatchEventRouteError[] = []
    const deltas: IndexedSourceDelta[] = []
    let handledSources = 0
    let failedSources = 0
    let appliedDeltas = 0
    let failedDeltas = 0
    let skippedDeltas = 0
    const deltaSummariesBySource = new Map<string, WatchEventRouteDeltaSummary>()
    const getDeltaSummary = (sourceId: string): WatchEventRouteDeltaSummary => {
      const existing = deltaSummariesBySource.get(sourceId)
      if (existing) return existing
      const next: WatchEventRouteDeltaSummary = {
        sourceId,
        deltas: 0,
        appliedDeltas: 0,
        failedDeltas: 0,
        skippedDeltas: 0
      }
      deltaSummariesBySource.set(sourceId, next)
      return next
    }

    for (const result of sourceResults) {
      if (result.status === 'fulfilled') {
        handledSources += 1
        deltas.push(...result.deltas)
        for (const storeResult of result.storeResults) {
          const summary = getDeltaSummary(storeResult.delta.sourceId)
          summary.deltas += 1
          if (storeResult.status === 'fulfilled') {
            if (isSkippedDeltaSummary(storeResult.summary)) {
              skippedDeltas += 1
              summary.skippedDeltas += 1
            } else {
              appliedDeltas += 1
              summary.appliedDeltas += 1
            }
            continue
          }
          failedDeltas += 1
          summary.failedDeltas += 1
          errors.push({
            sourceId: storeResult.delta.sourceId,
            phase: 'store',
            message: this.stringifyError(storeResult.error)
          })
        }
        continue
      }
      if (result.status === 'skipped') {
        skipped.push({
          sourceId: result.sourceId,
          reason: result.reason as IndexedSourceTaskSkipReason
        })
        continue
      }
      failedSources += 1
      errors.push({
        sourceId: result.sourceId,
        phase: 'handle',
        message: this.stringifyError(result.error)
      })
    }

    return {
      deltas,
      matchedSources: rootRoute.sources.length + rootRoute.skipped.length,
      handledSources,
      failedSources,
      skippedSources: skipped.length,
      appliedDeltas,
      failedDeltas,
      skippedDeltas,
      errors,
      skipped,
      deltaSummaries: Array.from(deltaSummariesBySource.values())
    }
  }

  private getEligibleSources(
    sources: IndexedSource[],
    diagnostics: IndexingRuntimeDiagnostics,
    initialSkipped: WatchEventRouteSkippedSource[] = []
  ): {
    sources: IndexedSource[]
    skipped: WatchEventRouteSkippedSource[]
  } {
    const diagnosticsBySource = new Map(
      diagnostics.sources.map((source) => [source.descriptor.id, source])
    )
    const eligibleSources: IndexedSource[] = []
    const skipped: WatchEventRouteSkippedSource[] = [...initialSkipped]

    for (const source of sources) {
      const eligibility = resolveIndexedSourceTaskEligibility({
        descriptor: source.descriptor,
        health: diagnosticsBySource.get(source.descriptor.id)?.health,
        task: 'watch'
      })
      if (!eligibility.eligible && eligibility.reason) {
        skipped.push({
          sourceId: source.descriptor.id,
          reason: eligibility.reason
        })
        continue
      }
      eligibleSources.push(source)
    }

    return {
      sources: eligibleSources,
      skipped
    }
  }

  private getSourceById(sourceId: string, sources: Map<string, IndexedSource>): IndexedSource[] {
    const source = sources.get(sourceId)
    if (!source?.handleWatchEvent) return []
    return [source]
  }

  private getSourcesByRoot(
    event: IndexedSourceWatchEvent,
    sources: Map<string, IndexedSource>,
    diagnostics: IndexingRuntimeDiagnostics
  ): {
    sources: IndexedSource[]
    skipped: WatchEventRouteSkippedSource[]
  } {
    const matchedSources: IndexedSource[] = []
    const skipped: WatchEventRouteSkippedSource[] = []

    for (const sourceDiagnostics of diagnostics.sources) {
      const route = resolveIndexedSourceWatchRootRoute(event, sourceDiagnostics.roots, {
        platform: process.platform
      })
      if (!route) {
        continue
      }

      const source = sources.get(sourceDiagnostics.descriptor.id)
      if (!source?.handleWatchEvent) {
        continue
      }

      if (!route.eligible && route.reason) {
        skipped.push({
          sourceId: source.descriptor.id,
          reason: route.reason
        })
        continue
      }

      matchedSources.push(source)
    }

    return {
      sources: matchedSources,
      skipped
    }
  }

  private stringifyError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}

function isSkippedDeltaSummary(
  summary: IndexStoreDeltaApplySummary | void
): summary is IndexStoreDeltaApplySummary {
  return Boolean(summary && summary.applied === false)
}
