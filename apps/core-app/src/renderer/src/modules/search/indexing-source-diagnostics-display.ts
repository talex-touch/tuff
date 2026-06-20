import type {
  IndexedSourceAdmissionReason,
  IndexedSourceDiagnostics,
  IndexedSourceEvidence,
  IndexedSourceHealthStatus,
  IndexedSourceLifecycleIssue,
  IndexedSourceMaintenanceActionState,
  IndexedSourceProgress,
  IndexedSourceProgressStatus,
  IndexedSourceRecoveryRecommendation,
  IndexedSourceReconcileState,
  IndexedSourceResetResult,
  IndexedSourceTaskRunGateSnapshotEntry,
  IndexedSourceTaskHistoryEntry,
  IndexedSourceTaskHistoryKind,
  IndexedSourceTaskHistoryStatus,
  IndexedSourceWatchState
} from '@talex-touch/utils/search'
import {
  resolveIndexedSourceMaintenanceActions,
  resolveIndexedSourceRecoveryRecommendation
} from '@talex-touch/utils/search'

export type IndexingSourceTone = 'success' | 'info' | 'warning' | 'danger' | 'muted'

export interface IndexingSourceTaskChip {
  id: 'scan' | 'watch' | 'reconcile' | 'reset'
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

export interface IndexingSourceRunGateChip {
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

export interface IndexingSourceProgressChip {
  id: string
  tone: IndexingSourceTone
  labelKey: string
  values: Record<string, string | number>
}

export interface IndexingSourceRecoveryChip {
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

export interface IndexingSourceResetSuccessMessage {
  labelKey: string
  values: Record<string, string | number>
}

export function resolveIndexingSourceResetSuccessMessage(
  result: Pick<
    IndexedSourceResetResult,
    'clearedSearchIndex' | 'clearedSearchIndexRows' | 'clearedScanProgress' | 'scanProgressRows'
  >
): IndexingSourceResetSuccessMessage {
  return {
    labelKey: 'settings.settingFileIndex.sourceActionResetSuccess',
    values: {
      clearedSearchIndex: result.clearedSearchIndex ? 'yes' : 'no',
      clearedSearchIndexRows: result.clearedSearchIndexRows ?? 0,
      clearedScanProgress: result.clearedScanProgress ? 'yes' : 'no',
      scanProgressRows: result.scanProgressRows ?? 0
    }
  }
}

export function resolveIndexingSourceMaintenanceActions(
  source: IndexedSourceDiagnostics
): IndexedSourceMaintenanceActionState[] {
  return resolveIndexedSourceMaintenanceActions(source)
}

export function resolveIndexingSourceRecoveryChip(
  source: IndexedSourceDiagnostics
): IndexingSourceRecoveryChip | null {
  const recommendation = resolveIndexedSourceRecoveryRecommendation(source)
  if (recommendation.action === 'none') return null

  return {
    id: `${source.descriptor.id}:recovery:${recommendation.action}`,
    tone: resolveRecoveryTone(recommendation),
    labelKey: `settings.settingFileIndex.sourceRecoveryChip.${recommendation.action}`,
    values: {
      reason: recommendation.reason ?? '',
      ...resolveRecoveryReasonValues(recommendation.reason),
      maintenanceAction: recommendation.maintenanceAction ?? '',
      blockedReason: recommendation.blockedReason ?? ''
    }
  }
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

function resolveProgressTone(status: IndexedSourceProgressStatus): IndexingSourceTone {
  if (status === 'complete') return 'success'
  if (status === 'failed' || status === 'stalled') return 'danger'
  if (status === 'stabilizing') return 'warning'
  if (status === 'running' || status === 'estimated') return 'info'
  return 'muted'
}

function resolveRecoveryTone(
  recommendation: IndexedSourceRecoveryRecommendation
): IndexingSourceTone {
  if (recommendation.priority === 'high') return 'danger'
  if (recommendation.priority === 'medium') return 'warning'
  if (recommendation.priority === 'low') return 'info'
  return 'muted'
}

function resolveRecoveryReasonValues(reason: string | undefined): Record<string, string | number> {
  const retry = parseRetryWindowReason(reason)
  if (!retry) {
    return {
      taskKind: '',
      nextRetryAt: '',
      nextRetryAtText: ''
    }
  }

  return {
    taskKind: retry.taskKind,
    nextRetryAt: retry.nextRetryAt,
    nextRetryAtText: formatIndexingSourceTimestamp(retry.nextRetryAt)
  }
}

function parseRetryWindowReason(
  reason: string | undefined
): { taskKind: IndexedSourceTaskHistoryKind; nextRetryAt: number } | null {
  const match = reason?.match(/^retry-window:(scan|watch|reconcile|reset):(\d+)$/)
  if (!match) return null

  const nextRetryAt = Number(match[2])
  if (!Number.isFinite(nextRetryAt) || nextRetryAt <= 0) return null

  return {
    taskKind: match[1] as IndexedSourceTaskHistoryKind,
    nextRetryAt
  }
}

function clampProgressPercent(progress: IndexedSourceProgress): number {
  const raw =
    typeof progress.progress === 'number' && Number.isFinite(progress.progress)
      ? progress.progress
      : progress.total > 0
        ? (progress.current / progress.total) * 100
        : 0

  return Math.max(0, Math.min(100, Math.round(raw)))
}

function formatProgressDuration(value?: number | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '-'
  if (value < 1000) return '<1s'

  const totalSeconds = Math.ceil(value / 1000)
  if (totalSeconds < 60) return `${totalSeconds}s`

  const totalMinutes = Math.ceil(totalSeconds / 60)
  if (totalMinutes < 60) return `${totalMinutes}m`

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
}

function formatProgressSpeed(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '-'
  if (value < 1) return value.toFixed(2)
  if (value < 10) return value.toFixed(1)
  return String(Math.round(value))
}

function resolveProgressLabelKey(status: IndexedSourceProgressStatus): string {
  return `settings.settingFileIndex.sourceProgressChip.${status}`
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

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
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
    total: evidence.id.endsWith(':scan-progress')
      ? toEvidenceNumber(metadata.configuredRoots ?? metadata.totalRoots)
      : toEvidenceNumber(metadata.totalFiles),
    completed: evidence.id.endsWith(':scan-progress')
      ? toEvidenceNumber(metadata.completedRoots)
      : toEvidenceNumber(metadata.completedFiles ?? evidence.itemCount),
    failed: toEvidenceNumber(metadata.failedFiles),
    skipped: toEvidenceNumber(metadata.skippedFiles),
    pendingRoots: toEvidenceNumber(metadata.pendingRoots),
    pendingPermissionRoots: toEvidenceNumber(metadata.pendingPermissionRoots),
    lastScannedAt: formatIndexingSourceTimestamp(toOptionalNumber(metadata.lastScannedAt)),
    entries: toEvidenceNumber(metadata.entries),
    pending: toEvidenceNumber(metadata.pending),
    inflight: toEvidenceNumber(metadata.inflight),
    withContent: toEvidenceNumber(metadata.withContent),
    duration: formatEvidenceDuration(metadata.durationMs),
    error: typeof metadata.error === 'string' ? metadata.error : '',
    ftsRows: toEvidenceNumber(metadata.ftsRows),
    filesRows: toEvidenceNumber(metadata.filesRows),
    needsRebuild: toEvidenceBoolean(metadata.needsRebuild),
    orphanedKeywordsRemoved: toEvidenceNumber(metadata.orphanedKeywordsRemoved),
    resetSearchIndexRows: toEvidenceNumber(metadata.resetSearchIndexRows),
    resetScanProgressRows: toEvidenceNumber(metadata.resetScanProgressRows)
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

function resolveRunGateTone(entry: IndexedSourceTaskRunGateSnapshotEntry): IndexingSourceTone {
  if (entry.runningSince !== undefined) return 'info'
  if (entry.blockedCount > 0) return 'warning'
  return 'muted'
}

function resolveRunGateLabelKey(entry: IndexedSourceTaskRunGateSnapshotEntry): string {
  if (entry.runningSince !== undefined) {
    return 'settings.settingFileIndex.sourceRunGate.running'
  }

  if (entry.lastBlockedReason === 'debounced') {
    return 'settings.settingFileIndex.sourceRunGate.debounced'
  }

  if (entry.lastBlockedReason === 'already-running') {
    return 'settings.settingFileIndex.sourceRunGate.already-running'
  }

  return 'settings.settingFileIndex.sourceRunGate.idle'
}

function resolveRunGateSortPriority(entry: IndexedSourceTaskRunGateSnapshotEntry): number {
  if (entry.runningSince !== undefined) return 0
  if (entry.blockedCount > 0) return 1
  return 2
}

function resolveRunGateValues(
  entry: IndexedSourceTaskRunGateSnapshotEntry
): Record<string, string | number> {
  return {
    kind: entry.kind,
    blockedCount: entry.blockedCount,
    runningSince: formatIndexingSourceTimestamp(entry.runningSince),
    lastCompletedAt: formatIndexingSourceTimestamp(entry.lastCompletedAt),
    lastBlockedAt: formatIndexingSourceTimestamp(entry.lastBlockedAt),
    nextAllowedAt: formatIndexingSourceTimestamp(entry.nextAllowedAt),
    reason: entry.lastBlockedReason ?? ''
  }
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
    const indexedRecords = summary.indexedRecords ?? summary.records
    const parts = [
      `indexed ${toSummaryValue(indexedRecords)}/${toSummaryValue(summary.records)}`,
      `batches ${toSummaryValue(summary.batches)}`
    ]

    if (typeof summary.phase === 'string' && summary.phase.trim()) {
      parts.push(`phase ${summary.phase.trim()}`)
    }

    return parts.join(' / ')
  }

  if (task.kind === 'watch') {
    return `delta ${toSummaryValue(summary.appliedDeltas)}/${toSummaryValue(summary.deltas)} / action ${toSummaryValue(summary.action)}`
  }

  if (task.kind === 'reconcile') {
    return `+${toSummaryValue(summary.added)} ~${toSummaryValue(summary.changed)} -${toSummaryValue(summary.deleted)} / skipped ${toSummaryValue(summary.skipped)}`
  }

  const parts = [`clear index ${toSummaryValue(summary.clearedSearchIndex)}`]
  if (typeof summary.clearedSearchIndexRows !== 'undefined') {
    parts.push(`index rows ${toSummaryValue(summary.clearedSearchIndexRows)}`)
  }

  parts.push(`progress ${toSummaryValue(summary.clearedScanProgress)}`)
  if (typeof summary.scanProgressRows !== 'undefined') {
    parts.push(`progress rows ${toSummaryValue(summary.scanProgressRows)}`)
  }

  return parts.join(' / ')
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
        indexedRecords: source.lastScan.indexedRecords,
        phase: source.lastScan.phase ?? '-',
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

  if (source.lastReset) {
    chips.push({
      id: 'reset',
      tone: resolveTaskTone(source.lastReset.error),
      labelKey: source.lastReset.error
        ? 'settings.settingFileIndex.sourceTask.resetFailed'
        : 'settings.settingFileIndex.sourceTask.resetDone',
      values: {
        time: formatIndexingSourceTimestamp(source.lastReset.completedAt),
        jobId: source.lastReset.jobId ?? '-',
        reason: source.lastReset.reason,
        clearedSearchIndex: source.lastReset.clearedSearchIndex ? 'yes' : 'no',
        clearedSearchIndexRows: source.lastReset.clearedSearchIndexRows ?? 0,
        clearedScanProgress: source.lastReset.clearedScanProgress ? 'yes' : 'no',
        scanProgressRows: source.lastReset.scanProgressRows ?? 0,
        error: source.lastReset.error ?? ''
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

export function resolveIndexingSourceRunGateChips(
  source: IndexedSourceDiagnostics,
  limit = 3
): IndexingSourceRunGateChip[] {
  return [...(source.taskRunGate ?? [])]
    .sort(
      (left, right) =>
        resolveRunGateSortPriority(left) - resolveRunGateSortPriority(right) ||
        left.kind.localeCompare(right.kind)
    )
    .slice(0, limit)
    .map((entry) => ({
      id: `${entry.sourceId}:${entry.kind}`,
      tone: resolveRunGateTone(entry),
      labelKey: resolveRunGateLabelKey(entry),
      values: resolveRunGateValues(entry)
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

export function resolveIndexingSourceProgressChip(
  source: IndexedSourceDiagnostics
): IndexingSourceProgressChip | null {
  const progress = source.progress
  if (!progress) return null

  return {
    id: `${source.descriptor.id}:progress`,
    tone: resolveProgressTone(progress.status),
    labelKey: resolveProgressLabelKey(progress.status),
    values: {
      stage: progress.stage || '-',
      status: progress.status,
      percent: clampProgressPercent(progress),
      current: progress.current,
      total: progress.total,
      remaining: formatProgressDuration(progress.estimatedRemainingMs),
      eta: formatIndexingSourceTimestamp(progress.estimatedCompletionAt ?? undefined),
      speed: formatProgressSpeed(progress.averageItemsPerSecond),
      samples: progress.speedSampleCount ?? 0,
      basis: progress.estimateBasis ?? 'none',
      reason: progress.reason ?? ''
    }
  }
}

function resolveLifecycleIssueLabelKey(issue: IndexedSourceLifecycleIssue): string {
  return `settings.settingFileIndex.sourceLifecycleIssue.${issue}`
}

function resolveAdmissionIssueLabelKey(issue: IndexedSourceAdmissionReason): string {
  return `settings.settingFileIndex.sourceAdmissionIssue.${issue}`
}
