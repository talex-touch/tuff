import type { IndexedSourceEvidence } from './indexing-source'
import type { IndexedWriteFlushSnapshotBase } from './indexing-write-flush-snapshot'

export interface IndexedWriteFlushEvidenceInput<
  TSnapshot extends IndexedWriteFlushSnapshotBase = IndexedWriteFlushSnapshotBase
> {
  id: string
  label: string
  snapshot: TSnapshot
  degradedStatuses?: readonly string[]
  metadata?: Record<string, unknown>
}

const DEFAULT_DEGRADED_FLUSH_STATUSES = ['failed', 'not-ready', 'worker-not-ready'] as const

export class IndexedWriteFlushEvidenceService {
  build(input: IndexedWriteFlushEvidenceInput): IndexedSourceEvidence {
    const snapshot = input.snapshot

    return {
      id: input.id,
      label: input.label,
      status: this.resolveStatus(snapshot.status, input.degradedStatuses),
      itemCount: snapshot.entries > 0 ? snapshot.entries : snapshot.pending,
      lastCheckedAt: snapshot.checkedAt,
      reason: snapshot.reason,
      metadata: {
        ...(snapshot.metadata ?? {}),
        ...(input.metadata ?? {}),
        status: snapshot.status,
        entries: snapshot.entries,
        pending: snapshot.pending,
        inflight: snapshot.inflight,
        error: snapshot.error,
        durationMs: snapshot.durationMs
      }
    }
  }

  private resolveStatus(
    status: string,
    degradedStatuses: readonly string[] = DEFAULT_DEGRADED_FLUSH_STATUSES
  ): IndexedSourceEvidence['status'] {
    return degradedStatuses.includes(status) ? 'degraded' : 'ready'
  }
}
