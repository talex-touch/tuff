import type {
  IndexedSource,
  IndexedSourceDescriptor,
  IndexedSourceDiagnostics,
  IndexedSourceDiagnosticsSnapshot,
  IndexedSourceEvidence,
  IndexedSourceHealth,
  IndexedSourceRoot
} from '@talex-touch/utils/search'
import { getLogger } from '@talex-touch/utils/common/logger'

const diagnosticsLog = getLogger('indexing-diagnostics')

export interface IndexingRuntimeSourceDiagnostics extends IndexedSourceDiagnostics {
  descriptor: IndexedSourceDescriptor
  health: IndexedSourceHealth
  roots: IndexedSourceRoot[]
  evidence?: IndexedSourceEvidence[]
}

export interface IndexingRuntimeDiagnostics extends IndexedSourceDiagnosticsSnapshot {
  sources: IndexingRuntimeSourceDiagnostics[]
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'unknown')
}

function buildErrorHealth(error: unknown): IndexedSourceHealth {
  return {
    status: 'error',
    permissionState: 'not-required',
    itemCount: 0,
    watchState: 'unavailable',
    reconcileState: 'failed',
    lastError: toErrorMessage(error)
  }
}

export class SourceDiagnosticsService {
  async getDiagnostics(sources: IndexedSource[]): Promise<IndexingRuntimeDiagnostics> {
    const diagnostics = await Promise.all(
      sources.map(async (source): Promise<IndexingRuntimeSourceDiagnostics> => {
        const [health, roots, evidence] = await Promise.all([
          source.getHealth().catch((error) => {
            diagnosticsLog.warn(`Indexed source '${source.descriptor.id}' health failed`, {
              error
            })
            return buildErrorHealth(error)
          }),
          source.getRoots().catch((error) => {
            diagnosticsLog.warn(`Indexed source '${source.descriptor.id}' roots failed`, {
              error
            })
            return [] as IndexedSourceRoot[]
          }),
          source.getEvidence?.().catch((error) => {
            diagnosticsLog.warn(`Indexed source '${source.descriptor.id}' evidence failed`, {
              error
            })
            return [] as IndexedSourceEvidence[]
          }) ?? Promise.resolve([] as IndexedSourceEvidence[])
        ])

        return {
          descriptor: source.descriptor,
          health,
          roots,
          evidence
        }
      })
    )

    const byStatus: Partial<Record<IndexedSourceHealth['status'], number>> = {}
    for (const source of diagnostics) {
      const status = source.health.status
      byStatus[status] = (byStatus[status] ?? 0) + 1
    }

    return {
      generatedAt: Date.now(),
      summary: {
        total: diagnostics.length,
        byStatus,
        ready: byStatus.ready ?? 0,
        degraded: byStatus.degraded ?? 0,
        unavailable:
          (byStatus.disabled ?? 0) +
          (byStatus.unsupported ?? 0) +
          (byStatus['permission-required'] ?? 0) +
          (byStatus.error ?? 0)
      },
      sources: diagnostics
    }
  }
}
