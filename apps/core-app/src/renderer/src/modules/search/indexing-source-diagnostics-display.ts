import type {
  IndexedSourceAdmissionReason,
  IndexedSourceDiagnostics,
  IndexedSourceEvidence,
  IndexedSourceHealthStatus,
  IndexedSourceLifecycleIssue,
  IndexedSourceReconcileState,
  IndexedSourceTaskHistoryEntry,
  IndexedSourceTaskHistoryKind,
  IndexedSourceTaskHistoryStatus,
  IndexedSourceWatchState
} from '@talex-touch/utils/search'

export type IndexingSourceTone = 'success' | 'info' | 'warning' | 'danger' | 'muted'

export interface IndexingSourceTaskChip {
  id: 'scan' | 'watch' | 'reconcile'
  tone: IndexingSourceTone
  labelKey: string
  values: Record<string, string | number>
}

export interface IndexingSourceRecentTaskChip {
  id: string
  tone: IndexingSourceTone
  labelKey: string
  values: Record<string, string | number>
}

export interface IndexingSourceEvidenceChip {
  id: string
  tone: IndexingSourceTone
  labelKey: string
  values: Record<string, string | number>
}

export interface IndexingSourceLifecycleIssueChip {
  id: string
  tone: IndexingSourceTone
  labelKey: string
  values: Record<string, string | number>
}

export interface IndexingSourceAdmissionIssueChip {
  id: string
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
):
  | 'lastError'
  | 'admissionIssue'
  | 'lifecycleIssue'
  | 'reason'
  | 'lastIndexedAt'
  | 'roots'
  | 'emptyRoots' {
  if (source.health.lastError) return 'lastError'
  if ((source.admissionIssues?.length ?? 0) > 0) return 'admissionIssue'
  if ((source.lifecycleIssues?.length ?? 0) > 0) return 'lifecycleIssue'
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
  return sources.filter(
    (source) =>
      ['degraded', 'permission-required', 'error'].includes(source.health.status) ||
      (source.admissionIssues?.length ?? 0) > 0 ||
      (source.lifecycleIssues?.length ?? 0) > 0
  ).length
}

function resolveTaskTone(error?: string): IndexingSourceTone {
  return error ? 'danger' : 'muted'
}

function resolveEvidenceTone(status: IndexedSourceHealthStatus): IndexingSourceTone {
  return resolveIndexingSourceTone(status)
}

function resolveEvidencePriority(evidence: IndexedSourceEvidence): number {
  if (['error', 'permission-required', 'degraded'].includes(evidence.status)) return 0
  if (evidence.status === 'warming') return 1
  return 2
}

function resolveEvidenceCount(evidence: IndexedSourceEvidence): number | string {
  if (typeof evidence.itemCount === 'number') return evidence.itemCount
  if (typeof evidence.rootCount === 'number') return evidence.rootCount
  if (Array.isArray(evidence.roots)) return evidence.roots.length
  return '-'
}

function toEvidenceNumber(value: unknown): number | string {
  return typeof value === 'number' && Number.isFinite(value) ? value : '-'
}

function toEvidenceBoolean(value: unknown): string {
  if (typeof value !== 'boolean') return '-'
  return value ? 'yes' : 'no'
}

function formatEvidenceDuration(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '-'
  if (value < 1000) return `${Math.round(value)}ms`
  return `${(value / 1000).toFixed(1)}s`
}

function resolveEvidenceChipLabelKey(evidence: IndexedSourceEvidence): string {
  if (evidence.id.endsWith(':scan-progress')) {
    return 'settings.settingFileIndex.sourceEvidenceChip.scanProgress'
  }

  if (evidence.id.endsWith(':index-flush')) {
    return 'settings.settingFileIndex.sourceEvidenceChip.indexFlush'
  }

  if (evidence.id.endsWith(':integrity')) {
    return 'settings.settingFileIndex.sourceEvidenceChip.integrity'
  }

  return 'settings.settingFileIndex.sourceEvidenceChip.generic'
}

function resolveEvidenceChipValues(
  evidence: IndexedSourceEvidence
): Record<string, string | number> {
  const metadata = evidence.metadata ?? {}

  return {
    label: evidence.label,
    status: evidence.status,
    count: resolveEvidenceCount(evidence),
    reason: evidence.reason ?? '',
    total: toEvidenceNumber(metadata.totalFiles),
    completed: toEvidenceNumber(metadata.completedFiles ?? evidence.itemCount),
    failed: toEvidenceNumber(metadata.failedFiles),
    skipped: toEvidenceNumber(metadata.skippedFiles),
    pendingRoots: toEvidenceNumber(metadata.pendingRoots),
    pendingPermissionRoots: toEvidenceNumber(metadata.pendingPermissionRoots),
    entries: toEvidenceNumber(metadata.entries),
    pending: toEvidenceNumber(metadata.pending),
    inflight: toEvidenceNumber(metadata.inflight),
    withContent: toEvidenceNumber(metadata.withContent),
    duration: formatEvidenceDuration(metadata.durationMs),
    error: typeof metadata.error === 'string' ? metadata.error : '',
    ftsRows: toEvidenceNumber(metadata.ftsRows),
    filesRows: toEvidenceNumber(metadata.filesRows),
    needsRebuild: toEvidenceBoolean(metadata.needsRebuild),
    orphanedKeywordsRemoved: toEvidenceNumber(metadata.orphanedKeywordsRemoved)
  }
}

function resolveRecentTaskTone(status: IndexedSourceTaskHistoryStatus): IndexingSourceTone {
  if (status === 'failed') return 'danger'
  if (status === 'skipped') return 'warning'
  return 'muted'
}

function resolveRecentTaskLabelKey(
  kind: IndexedSourceTaskHistoryKind,
  status: IndexedSourceTaskHistoryStatus
): string {
  return `settings.settingFileIndex.sourceRecentTask.${kind}.${status}`
}

function toSummaryValue(value: unknown): string | number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  return '-'
}

function resolveRecentTaskSummary(task: IndexedSourceTaskHistoryEntry): string {
  const summary = task.summary ?? {}

  if (task.kind === 'scan') {
    return `records ${toSummaryValue(summary.records)} / batches ${toSummaryValue(summary.batches)}`
  }

  if (task.kind === 'watch') {
    return `delta ${toSummaryValue(summary.appliedDeltas)}/${toSummaryValue(summary.deltas)} / action ${toSummaryValue(summary.action)}`
  }

  if (task.kind === 'reconcile') {
    return `+${toSummaryValue(summary.added)} ~${toSummaryValue(summary.changed)} -${toSummaryValue(summary.deleted)} / skipped ${toSummaryValue(summary.skipped)}`
  }

  return `clear index ${toSummaryValue(summary.clearedSearchIndex)} / progress ${toSummaryValue(summary.clearedScanProgress)}`
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
        jobId: source.lastScan.jobId ?? '-',
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
        jobId: source.lastWatch.jobId ?? '-',
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
        jobId: source.lastReconcile.jobId ?? '-',
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

export function resolveIndexingSourceRecentTaskChips(
  source: IndexedSourceDiagnostics,
  limit = 3
): IndexingSourceRecentTaskChip[] {
  return (source.recentTasks ?? []).slice(0, limit).map((task, index) => ({
    id: `${task.kind}:${task.jobId ?? task.completedAt}:${index}`,
    tone: resolveRecentTaskTone(task.status),
    labelKey: resolveRecentTaskLabelKey(task.kind, task.status),
    values: {
      jobId: task.jobId ?? '-',
      time: formatIndexingSourceTimestamp(task.completedAt),
      summary: resolveRecentTaskSummary(task),
      error: task.error ?? ''
    }
  }))
}

export function resolveIndexingSourceLifecycleIssueChips(
  source: IndexedSourceDiagnostics,
  limit = 2
): IndexingSourceLifecycleIssueChip[] {
  return (source.lifecycleIssues ?? []).slice(0, limit).map((issue, index) => ({
    id: `${issue}:${index}`,
    tone: 'warning',
    labelKey: resolveLifecycleIssueLabelKey(issue),
    values: {
      issue
    }
  }))
}

export function resolveIndexingSourceAdmissionIssueChips(
  source: IndexedSourceDiagnostics,
  limit = 2
): IndexingSourceAdmissionIssueChip[] {
  return (source.admissionIssues ?? []).slice(0, limit).map((issue, index) => ({
    id: `${issue}:${index}`,
    tone: 'danger',
    labelKey: resolveAdmissionIssueLabelKey(issue),
    values: {
      issue
    }
  }))
}

export function resolveIndexingSourceEvidenceChips(
  source: IndexedSourceDiagnostics,
  limit = 2
): IndexingSourceEvidenceChip[] {
  return [...(source.evidence ?? [])]
    .sort(
      (left, right) =>
        resolveEvidencePriority(left) - resolveEvidencePriority(right) ||
        left.label.localeCompare(right.label)
    )
    .slice(0, limit)
    .map((evidence) => ({
      id: evidence.id,
      tone: resolveEvidenceTone(evidence.status),
      labelKey: resolveEvidenceChipLabelKey(evidence),
      values: resolveEvidenceChipValues(evidence)
    }))
}

function resolveLifecycleIssueLabelKey(issue: IndexedSourceLifecycleIssue): string {
  return `settings.settingFileIndex.sourceLifecycleIssue.${issue}`
}

function resolveAdmissionIssueLabelKey(issue: IndexedSourceAdmissionReason): string {
  return `settings.settingFileIndex.sourceAdmissionIssue.${issue}`
}
