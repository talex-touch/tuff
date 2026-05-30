import type {
  IndexedSource,
  IndexedSourceDelta,
  IndexedSourceRoot,
  IndexedSourceTaskSkipReason,
  IndexedSourceWatchEvent
} from '@talex-touch/utils/search'
import type { IndexingRuntimeDiagnostics } from './indexing-diagnostics-service'
import type { IndexStoreAdapter } from './indexing-store-adapter'
import process from 'node:process'
import { resolveIndexedSourceTaskEligibility } from '@talex-touch/utils/search'

export interface WatchEventRouteError {
  sourceId?: string
  phase: 'handle' | 'store'
  message: string
}

export interface WatchEventRouteSkippedSource {
  sourceId: string
  reason: IndexedSourceTaskSkipReason
}

export interface WatchEventRouteResult {
  deltas: IndexedSourceDelta[]
  matchedSources: number
  handledSources: number
  failedSources: number
  skippedSources: number
  appliedDeltas: number
  failedDeltas: number
  errors: WatchEventRouteError[]
  skipped: WatchEventRouteSkippedSource[]
}

function normalizePathForMatch(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/\/+$/g, '')
  return process.platform === 'linux' ? normalized : normalized.toLowerCase()
}

function isPathInsideRoot(targetPath: string, rootPath: string): boolean {
  const target = normalizePathForMatch(targetPath)
  const root = normalizePathForMatch(rootPath)
  return target === root || target.startsWith(`${root}/`)
}

export class WatchEventRouter {
  constructor(private readonly store: IndexStoreAdapter) {}

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
        try {
          if (source.shouldHandleWatchEvent && !source.shouldHandleWatchEvent(event)) {
            return {
              status: 'skipped' as const,
              sourceId: source.descriptor.id,
              reason: 'source-watch-filtered'
            }
          }
          return {
            status: 'fulfilled' as const,
            sourceId: source.descriptor.id,
            deltas: await (source.handleWatchEvent?.(event) ?? Promise.resolve([]))
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
    const errors: WatchEventRouteError[] = []
    const deltas: IndexedSourceDelta[] = []
    let handledSources = 0
    let failedSources = 0

    for (const result of sourceResults) {
      if (result.status === 'fulfilled') {
        handledSources += 1
        deltas.push(...result.deltas)
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

    const storeResults = await Promise.all(
      deltas.map(async (delta) => {
        try {
          await this.store.applyDelta(delta)
          return {
            status: 'fulfilled' as const,
            delta
          }
        } catch (error) {
          return {
            status: 'rejected' as const,
            delta,
            error
          }
        }
      })
    )
    let appliedDeltas = 0
    let failedDeltas = 0

    for (const result of storeResults) {
      if (result.status === 'fulfilled') {
        appliedDeltas += 1
        continue
      }
      failedDeltas += 1
      errors.push({
        sourceId: result.delta.sourceId,
        phase: 'store',
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
      errors,
      skipped
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
      const matchedRoot = sourceDiagnostics.roots.find((root) =>
        isPathInsideRoot(event.path, event.rootPath ?? root.path)
      )
      if (!matchedRoot) {
        continue
      }

      const source = sources.get(sourceDiagnostics.descriptor.id)
      if (!source?.handleWatchEvent) {
        continue
      }

      const rootSkipReason = this.resolveRootSkipReason(matchedRoot)
      if (rootSkipReason) {
        skipped.push({
          sourceId: source.descriptor.id,
          reason: rootSkipReason
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

  private resolveRootSkipReason(root: IndexedSourceRoot): IndexedSourceTaskSkipReason | null {
    if (root.permissionState === 'denied' || root.permissionState === 'promptable') {
      return `root-permission:${root.permissionState}`
    }
    return null
  }

  private stringifyError(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
  }
}
