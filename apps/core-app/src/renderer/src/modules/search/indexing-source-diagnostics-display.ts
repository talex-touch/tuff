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
// Relative, never `~/`: this module also runs under Node + tsx
// (`scripts/settings-indexing-diagnostics-verify.ts`), where the renderer alias does not resolve.
// Both helpers are alias-free and framework-free for the same reason.
import { formatResetTime } from '../../components/intelligence/audit/audit-format'
import { usageLimitLabelKey } from '../../components/intelligence/audit/usage-limit-labels'

export type IndexingSourceTone = 'success' | 'info' | 'warning' | 'danger' | 'muted'

/**
 * The interface's `t`: names and phrases the chips put in a message are translated before they go in.
 * Without it they stay as stored, and a recent task's summary stays in the English the evidence
 * verifier (`scripts/settings-indexing-diagnostics-verify.ts`) matches.
 */
export type IndexingSourceTranslate = (
  key: string,
  values?: Record<string, string | number>
) => string

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
      clearedSearchIndexRows: result.clearedSearchIndexRows ?? 0,
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
  source: IndexedSourceDiagnostics,
  locale?: string,
  translate?: IndexingSourceTranslate
): IndexingSourceRecoveryChip | null {
  const recommendation = resolveIndexedSourceRecoveryRecommendation(source)
  if (recommendation.action === 'none') return null

  return {
    id: `${source.descriptor.id}:recovery:${recommendation.action}`,
    tone: resolveRecoveryTone(recommendation),
    labelKey: `settings.settingFileIndex.sourceRecoveryChip.${recommendation.action}`,
    values: {
      reason: recommendation.reason ?? '',
      ...resolveRecoveryReasonValues(recommendation.reason, locale, translate),
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

/** In the interface's `locale` when the caller passes it, else in the runtime's own format. */
export function formatIndexingSourceTimestamp(value?: number, locale?: string): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return '-'
  }

  return new Date(value).toLocaleString(locale)
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

function resolveRecoveryReasonValues(
  reason: string | undefined,
  locale?: string,
  translate?: IndexingSourceTranslate
): Record<string, string | number> {
  const retry = parseRetryWindowReason(reason)
  if (retry) {
    const time = formatIndexingSourceTimestamp(retry.nextRetryAt, locale)
    return {
      taskKind: formatTaskKind(retry.taskKind, translate),
      nextRetryAt: retry.nextRetryAt,
      nextRetryAtText: time,
      runGateReason: '',
      waitDetail: translate
        ? translate('settings.settingFileIndex.sourceRecoveryWait.retryAfter', { time })
        : `retry after ${time}`
    }
  }

  const runGate = parseRunGateReason(reason)
  if (runGate) {
    return {
      taskKind: formatTaskKind(runGate.taskKind, translate),
      nextRetryAt: '',
      nextRetryAtText: '',
      runGateReason: runGate.reason,
      waitDetail: translate ? translate(RUN_GATE_WAIT_KEYS[runGate.reason]) : runGate.reason
    }
  }

  return {
    taskKind: '',
    nextRetryAt: '',
    nextRetryAtText: '',
    runGateReason: '',
    waitDetail: ''
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

type RunGateWaitReason = 'already-running' | 'debounced'

const RUN_GATE_WAIT_KEYS: Record<RunGateWaitReason, string> = {
  'already-running': 'settings.settingFileIndex.sourceRecoveryWait.alreadyRunning',
  debounced: 'settings.settingFileIndex.sourceRecoveryWait.debounced'
}

function parseRunGateReason(
  reason: string | undefined
): { taskKind: IndexedSourceTaskHistoryKind; reason: RunGateWaitReason } | null {
  const match = reason?.match(/^run-gate:(scan|watch|reconcile|reset):(already-running|debounced)$/)
  if (!match) return null

  return {
    taskKind: match[1] as IndexedSourceTaskHistoryKind,
    reason: match[2] as RunGateWaitReason
  }
}

/** A task kind by the name the interface gives it, or as stored without a translator. */
function formatTaskKind(
  kind: IndexedSourceTaskHistoryKind,
  translate?: IndexingSourceTranslate
): string {
  return translate ? translate(`settings.settingFileIndex.sourceTaskKind.${kind}`) : kind
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

function toEvidenceBoolean(value: unknown, translate?: IndexingSourceTranslate): string {
  if (typeof value !== 'boolean') return '-'
  return formatBoolean(value, translate)
}

function formatBoolean(value: boolean, translate?: IndexingSourceTranslate): string {
  if (translate) return translate(value ? 'common.yes' : 'common.no')
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

  // Semantic indexing held back by the AI usage limit: which limit, and when it picks up again.
  if (evidence.id.endsWith(':embedding-pause')) {
    return 'settings.settingFileIndex.sourceEvidenceChip.embeddingPause'
  }

  return 'settings.settingFileIndex.sourceEvidenceChip.generic'
}

function resolveEvidenceChipValues(
  evidence: IndexedSourceEvidence,
  locale?: string,
  translate?: IndexingSourceTranslate
): Record<string, string | number> {
  const metadata = evidence.metadata ?? {}

  return {
    label: evidence.label,
    status: translate
      ? translate(resolveIndexingSourceStatusKey(evidence.status))
      : evidence.status,
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
    lastScannedAt: formatIndexingSourceTimestamp(toOptionalNumber(metadata.lastScannedAt), locale),
    entries: toEvidenceNumber(metadata.entries),
    pending: toEvidenceNumber(metadata.pending),
    inflight: toEvidenceNumber(metadata.inflight),
    withContent: toEvidenceNumber(metadata.withContent),
    duration: formatEvidenceDuration(metadata.durationMs),
    error: typeof metadata.error === 'string' ? metadata.error : '',
    ftsRows: toEvidenceNumber(metadata.ftsRows),
    filesRows: toEvidenceNumber(metadata.filesRows),
    needsRebuild: toEvidenceBoolean(metadata.needsRebuild, translate),
    orphanedKeywordsRemoved: toEvidenceNumber(metadata.orphanedKeywordsRemoved),
    resetSearchIndexRows: toEvidenceNumber(metadata.resetSearchIndexRows),
    resetScanProgressRows: toEvidenceNumber(metadata.resetScanProgressRows),
    limit: formatPauseLimit(metadata.limitKey, translate),
    resumesAt: formatPauseResumesAt(toOptionalNumber(metadata.pausedUntil), locale)
  }
}

/**
 * Which usage limit paused indexing, by the name Audit gives it (「每日请求数」) rather than the
 * stored key. A key this build does not name is shown as stored.
 */
function formatPauseLimit(limitKey: unknown, translate?: IndexingSourceTranslate): string {
  if (typeof limitKey !== 'string' || !limitKey) return '-'
  const labelKey = usageLimitLabelKey(limitKey)
  return labelKey && translate ? translate(labelKey) : limitKey
}

/** A usage-limit pause's reset time, in the interface's language when it is known. */
function formatPauseResumesAt(pausedUntil: number | undefined, locale?: string): string {
  if (pausedUntil === undefined || pausedUntil <= 0) return '-'
  return locale ? formatResetTime(pausedUntil, locale) : formatIndexingSourceTimestamp(pausedUntil)
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
  entry: IndexedSourceTaskRunGateSnapshotEntry,
  locale?: string,
  translate?: IndexingSourceTranslate
): Record<string, string | number> {
  return {
    kind: formatTaskKind(entry.kind, translate),
    blockedCount: entry.blockedCount,
    runningSince: formatIndexingSourceTimestamp(entry.runningSince, locale),
    lastCompletedAt: formatIndexingSourceTimestamp(entry.lastCompletedAt, locale),
    lastBlockedAt: formatIndexingSourceTimestamp(entry.lastBlockedAt, locale),
    nextAllowedAt: formatIndexingSourceTimestamp(entry.nextAllowedAt, locale),
    reason: entry.lastBlockedReason ?? ''
  }
}

function toSummaryValue(value: unknown, translate?: IndexingSourceTranslate): string | number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'boolean') return formatBoolean(value, translate)
  return '-'
}

/**
 * One part of a recent task's summary: `sourceRecentTaskSummary.<key>` with `values` when there is a
 * translator, else `fallback` — the English the evidence verifier matches, which the en catalog
 * repeats word for word.
 */
function formatSummaryPart(
  key: string,
  values: Record<string, string | number>,
  fallback: string,
  translate?: IndexingSourceTranslate
): string {
  return translate
    ? translate(`settings.settingFileIndex.sourceRecentTaskSummary.${key}`, values)
    : fallback
}

function appendAuditSummaryParts(
  parts: string[],
  task: IndexedSourceTaskHistoryEntry,
  translate?: IndexingSourceTranslate
): void {
  const summary = task.summary ?? {}
  const durationMs = toSummaryValue(summary.durationMs ?? task.durationMs, translate)
  if (durationMs !== '-') {
    parts.push(
      formatSummaryPart('duration', { ms: durationMs }, `duration ${durationMs}ms`, translate)
    )
  }

  const trigger = toSummaryValue(summary.trigger ?? task.trigger, translate)
  if (trigger !== '-') {
    parts.push(formatSummaryPart('trigger', { trigger }, `trigger ${trigger}`, translate))
  }

  const reason = toSummaryValue(summary.reason ?? task.reason, translate)
  if (reason !== '-') {
    parts.push(formatSummaryPart('reason', { reason }, `reason ${reason}`, translate))
  }

  const attempt = toSummaryValue(summary.attempt ?? task.attempt, translate)
  if (attempt !== '-') {
    parts.push(formatSummaryPart('attempt', { attempt }, `attempt ${attempt}`, translate))
  }

  const errorCode = toSummaryValue(summary.errorCode ?? task.errorCode, translate)
  if (errorCode !== '-') {
    parts.push(formatSummaryPart('code', { code: errorCode }, `code ${errorCode}`, translate))
  }
}

function resolveRecentTaskSummary(
  task: IndexedSourceTaskHistoryEntry,
  translate?: IndexingSourceTranslate
): string {
  const summary = task.summary ?? {}
  const value = (raw: unknown): string | number => toSummaryValue(raw, translate)

  if (task.kind === 'scan') {
    const indexed = value(summary.indexedRecords ?? summary.records)
    const records = value(summary.records)
    const batches = value(summary.batches)
    const parts = [
      formatSummaryPart(
        'indexed',
        { indexed, records },
        `indexed ${indexed}/${records}`,
        translate
      ),
      formatSummaryPart('batches', { batches }, `batches ${batches}`, translate)
    ]

    if (typeof summary.phase === 'string' && summary.phase.trim()) {
      const phase = summary.phase.trim()
      parts.push(formatSummaryPart('phase', { phase }, `phase ${phase}`, translate))
    }

    appendAuditSummaryParts(parts, task, translate)
    return parts.join(' / ')
  }

  if (task.kind === 'watch') {
    const applied = value(summary.appliedDeltas)
    const deltas = value(summary.deltas)
    const action = value(summary.action)
    const parts = [
      formatSummaryPart('delta', { applied, deltas }, `delta ${applied}/${deltas}`, translate),
      formatSummaryPart('action', { action }, `action ${action}`, translate)
    ]
    appendAuditSummaryParts(parts, task, translate)
    return parts.join(' / ')
  }

  if (task.kind === 'reconcile') {
    const skipped = value(summary.skipped)
    const parts = [
      `+${value(summary.added)} ~${value(summary.changed)} -${value(summary.deleted)}`,
      formatSummaryPart('skipped', { skipped }, `skipped ${skipped}`, translate)
    ]
    appendAuditSummaryParts(parts, task, translate)
    return parts.join(' / ')
  }

  const clearedIndex = value(summary.clearedSearchIndex)
  const parts = [
    formatSummaryPart(
      'clearIndex',
      { cleared: clearedIndex },
      `clear index ${clearedIndex}`,
      translate
    )
  ]
  if (typeof summary.clearedSearchIndexRows !== 'undefined') {
    const rows = value(summary.clearedSearchIndexRows)
    parts.push(formatSummaryPart('indexRows', { rows }, `index rows ${rows}`, translate))
  }

  const clearedProgress = value(summary.clearedScanProgress)
  parts.push(
    formatSummaryPart(
      'progress',
      { cleared: clearedProgress },
      `progress ${clearedProgress}`,
      translate
    )
  )
  if (typeof summary.scanProgressRows !== 'undefined') {
    const rows = value(summary.scanProgressRows)
    parts.push(formatSummaryPart('progressRows', { rows }, `progress rows ${rows}`, translate))
  }

  appendAuditSummaryParts(parts, task, translate)
  return parts.join(' / ')
}

export function resolveIndexingSourceTaskChips(
  source: IndexedSourceDiagnostics,
  locale?: string
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
        time: formatIndexingSourceTimestamp(source.lastScan.completedAt, locale),
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
        time: formatIndexingSourceTimestamp(source.lastWatch.completedAt, locale),
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
        time: formatIndexingSourceTimestamp(source.lastReconcile.completedAt, locale),
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
        time: formatIndexingSourceTimestamp(source.lastReset.completedAt, locale),
        jobId: source.lastReset.jobId ?? '-',
        reason: source.lastReset.reason,
        clearedSearchIndexRows: source.lastReset.clearedSearchIndexRows ?? 0,
        scanProgressRows: source.lastReset.scanProgressRows ?? 0,
        error: source.lastReset.error ?? ''
      }
    })
  }

  return chips
}

export function resolveIndexingSourceRecentTaskChips(
  source: IndexedSourceDiagnostics,
  limit = 3,
  locale?: string,
  translate?: IndexingSourceTranslate
): IndexingSourceRecentTaskChip[] {
  return (source.recentTasks ?? []).slice(0, limit).map((task, index) => ({
    id: `${task.kind}:${task.jobId ?? task.completedAt}:${index}`,
    tone: resolveRecentTaskTone(task.status),
    labelKey: resolveRecentTaskLabelKey(task.kind, task.status),
    values: {
      jobId: task.jobId ?? '-',
      time: formatIndexingSourceTimestamp(task.completedAt, locale),
      duration: toSummaryValue(task.summary?.durationMs ?? task.durationMs),
      trigger: toSummaryValue(task.summary?.trigger ?? task.trigger),
      reason: toSummaryValue(task.summary?.reason ?? task.reason),
      attempt: toSummaryValue(task.summary?.attempt ?? task.attempt),
      errorCode: toSummaryValue(task.summary?.errorCode ?? task.errorCode),
      summary: resolveRecentTaskSummary(task, translate),
      error: task.error ?? ''
    }
  }))
}

export function resolveIndexingSourceRunGateChips(
  source: IndexedSourceDiagnostics,
  limit = 3,
  locale?: string,
  translate?: IndexingSourceTranslate
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
      values: resolveRunGateValues(entry, locale, translate)
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

/**
 * `locale` and `translate` are the interface's: a usage-limit pause names its reset time in that
 * language and its limit by Audit's name for it, the way the audit page and the refusal copy do.
 * The status and the integrity row's rebuild flag are translated too. Without them the time falls
 * back to the runtime's own format, and the limit, status and flag to their stored values.
 */
export function resolveIndexingSourceEvidenceChips(
  source: IndexedSourceDiagnostics,
  limit = 2,
  locale?: string,
  translate?: IndexingSourceTranslate
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
      values: resolveEvidenceChipValues(evidence, locale, translate)
    }))
}

export function resolveIndexingSourceProgressChip(
  source: IndexedSourceDiagnostics,
  locale?: string
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
      eta: formatIndexingSourceTimestamp(progress.estimatedCompletionAt ?? undefined, locale),
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
