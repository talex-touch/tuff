import type {
  IndexedSourceDiagnostics,
  IndexedSourceDiagnosticsSnapshot,
  IndexedSourceHealth,
  IndexedSourceHealthStatus
} from './indexing-source'

export type IndexedSourceDiagnosticsSummary = IndexedSourceDiagnosticsSnapshot['summary']

export function summarizeIndexedSourceHealth(
  healthItems: readonly IndexedSourceHealth[]
): IndexedSourceDiagnosticsSummary {
  const byStatus: Partial<Record<IndexedSourceHealthStatus, number>> = {}

  for (const health of healthItems) {
    byStatus[health.status] = (byStatus[health.status] ?? 0) + 1
  }

  return {
    total: healthItems.length,
    byStatus,
    ready: byStatus.ready ?? 0,
    degraded: byStatus.degraded ?? 0,
    unavailable:
      (byStatus.disabled ?? 0) +
      (byStatus.unsupported ?? 0) +
      (byStatus['permission-required'] ?? 0) +
      (byStatus.error ?? 0)
  }
}

export function buildIndexedSourceDiagnosticsSummary(
  sources: readonly Pick<IndexedSourceDiagnostics, 'health'>[]
): IndexedSourceDiagnosticsSummary {
  return summarizeIndexedSourceHealth(sources.map((source) => source.health))
}
