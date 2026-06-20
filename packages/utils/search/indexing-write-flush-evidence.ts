import type { IndexedSourceEvidence } from './indexing-source'
import type { IndexedWriteFlushSnapshotBase } from './indexing-write-flush-snapshot'
import { cloneIndexingSnapshotValue } from './indexing-snapshot-clone'

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
    const entries = normalizeEvidenceCount(snapshot.entries)
    const pending = normalizeEvidenceCount(snapshot.pending)
    const inflight = normalizeEvidenceCount(snapshot.inflight)

    return {
      id: input.id,
      label: input.label,
      status: this.resolveStatus(snapshot.status, input.degradedStatuses),
      itemCount: entries > 0 ? entries : pending,
      lastCheckedAt: normalizeEvidenceTimestamp(snapshot.checkedAt),
      reason: snapshot.reason,
      metadata: cloneEvidenceMetadata({
        ...(snapshot.metadata ?? {}),
        ...(input.metadata ?? {}),
        status: snapshot.status,
        entries,
        pending,
        inflight,
        error: snapshot.error,
        durationMs: normalizeOptionalEvidenceNumber(snapshot.durationMs)
      })
    }
  }

  private resolveStatus(
    status: string,
    degradedStatuses: readonly string[] = DEFAULT_DEGRADED_FLUSH_STATUSES
  ): IndexedSourceEvidence['status'] {
    return degradedStatuses.includes(status) ? 'degraded' : 'ready'
  }
}

function normalizeEvidenceTimestamp(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : Date.now()
}

function normalizeEvidenceCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
}

function normalizeOptionalEvidenceNumber(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined
  }

  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0
}

function cloneEvidenceMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  return cloneIndexingSnapshotValue(metadata)
}
