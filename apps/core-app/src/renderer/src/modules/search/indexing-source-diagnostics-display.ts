import type {
  IndexedSourceDiagnostics,
  IndexedSourceHealthStatus,
  IndexedSourceReconcileState,
  IndexedSourceWatchState
} from '@talex-touch/utils/search'

export type IndexingSourceTone = 'success' | 'info' | 'warning' | 'danger' | 'muted'

export interface IndexingSourceTaskChip {
  id: 'scan' | 'watch' | 'reconcile'
  tone: IndexingSourceTone
  labelKey: string
  values: Record<string, string | number>
}

const STATUS_TONE_MAP: Record<IndexedSourceHealthStatus, IndexingSourceTone> = {
  ready: 'success',
  warming: 'info',
  degraded: 'warning',
  disabled: 'muted',
  unsupported: 'muted',
  'permission-required': 'warning',
  error: 'danger'
}

export function resolveIndexingSourceTone(status: IndexedSourceHealthStatus): IndexingSourceTone {
  return STATUS_TONE_MAP[status] ?? 'muted'
}

export function resolveIndexingSourceStatusKey(status: IndexedSourceHealthStatus): string {
  return `settings.settingFileIndex.sourceStatus.${status}`
}

export function resolveIndexingSourceWatchStateKey(state: IndexedSourceWatchState): string {
  return `settings.settingFileIndex.sourceWatchState.${state}`
}

export function resolveIndexingSourceReconcileStateKey(state: IndexedSourceReconcileState): string {
  return `settings.settingFileIndex.sourceReconcileState.${state}`
}

export function resolveIndexingSourceDetailKey(
  source: IndexedSourceDiagnostics
): 'lastError' | 'reason' | 'lastIndexedAt' | 'roots' | 'emptyRoots' {
  if (source.health.lastError) return 'lastError'
  if (source.health.reason) return 'reason'
  if (typeof source.health.lastIndexedAt === 'number') return 'lastIndexedAt'
  if (source.roots.length > 0) return 'roots'
  return 'emptyRoots'
}

export function formatIndexingSourceTimestamp(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return '-'
  }

  return new Date(value).toLocaleString()
}

export function summarizeIndexingSourceRoots(
  source: IndexedSourceDiagnostics,
  maxRoots = 2
): string {
  if (source.roots.length === 0) return ''

  const visible = source.roots.slice(0, maxRoots).map((root) => root.path)
  const remaining = source.roots.length - visible.length

  return remaining > 0 ? `${visible.join(', ')} +${remaining}` : visible.join(', ')
}

export function countIndexingSourcesNeedingAttention(sources: IndexedSourceDiagnostics[]): number {
  return sources.filter((source) =>
    ['degraded', 'permission-required', 'error'].includes(source.health.status)
  ).length
}

function resolveTaskTone(error?: string): IndexingSourceTone {
  return error ? 'danger' : 'muted'
}

export function resolveIndexingSourceTaskChips(
  source: IndexedSourceDiagnostics
): IndexingSourceTaskChip[] {
  const chips: IndexingSourceTaskChip[] = []

  if (source.lastScan) {
    chips.push({
      id: 'scan',
      tone: resolveTaskTone(source.lastScan.error),
      labelKey: source.lastScan.error
        ? 'settings.settingFileIndex.sourceTask.scanFailed'
        : 'settings.settingFileIndex.sourceTask.scanDone',
      values: {
        time: formatIndexingSourceTimestamp(source.lastScan.completedAt),
        batches: source.lastScan.batches,
        records: source.lastScan.records,
        error: source.lastScan.error ?? ''
      }
    })
  }

  if (source.lastWatch) {
    const failed = source.lastWatch.failedDeltas
    chips.push({
      id: 'watch',
      tone: resolveTaskTone(source.lastWatch.error || (failed > 0 ? String(failed) : undefined)),
      labelKey:
        source.lastWatch.error || failed > 0
          ? 'settings.settingFileIndex.sourceTask.watchFailed'
          : 'settings.settingFileIndex.sourceTask.watchDone',
      values: {
        time: formatIndexingSourceTimestamp(source.lastWatch.completedAt),
        action: source.lastWatch.action,
        deltas: source.lastWatch.deltas,
        applied: source.lastWatch.appliedDeltas,
        failed,
        error: source.lastWatch.error ?? ''
      }
    })
  }

  if (source.lastReconcile) {
    const failed = Boolean(source.lastReconcile.error) || source.lastReconcile.errors > 0
    chips.push({
      id: 'reconcile',
      tone: resolveTaskTone(failed ? 'error' : undefined),
      labelKey: failed
        ? 'settings.settingFileIndex.sourceTask.reconcileFailed'
        : 'settings.settingFileIndex.sourceTask.reconcileDone',
      values: {
        time: formatIndexingSourceTimestamp(source.lastReconcile.completedAt),
        added: source.lastReconcile.added,
        changed: source.lastReconcile.changed,
        deleted: source.lastReconcile.deleted,
        skipped: source.lastReconcile.skipped,
        errors: source.lastReconcile.errors,
        reason: source.lastReconcile.reason ?? '',
        rootCount: source.lastReconcile.rootCount ?? 0,
        error: source.lastReconcile.error ?? ''
      }
    })
  }

  return chips
}
