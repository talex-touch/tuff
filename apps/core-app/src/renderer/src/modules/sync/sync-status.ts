import type { SyncBlockedReason, SyncRuntimeStatus } from '~/modules/auth/sync-preferences'
import {
  getSyncPreferenceState,
  markSyncPullActivity,
  markSyncPushActivity,
  updateSyncPreferenceState
} from '~/modules/auth/sync-preferences'

function nowIso(): string {
  return new Date().toISOString()
}

export function setSyncStatus(status: SyncRuntimeStatus): void {
  updateSyncPreferenceState({ status })
}

export function setSyncQueueDepth(depth: number): void {
  updateSyncPreferenceState({ queueDepth: Math.max(0, Math.floor(depth)) })
}

export function setNextPullAt(value: string): void {
  updateSyncPreferenceState({ nextPullAt: value })
}

export function setSyncCursor(cursor: number): void {
  updateSyncPreferenceState({ cursor: Math.max(0, Math.floor(cursor)) })
}

export function nextSyncOpSeq(): number {
  const sync = getSyncPreferenceState()
  const next = Math.max(0, Math.floor(sync.opSeq || 0)) + 1
  updateSyncPreferenceState({ opSeq: next })
  return next
}

export function markSyncPullSuccess(): void {
  markSyncPullActivity(nowIso())
}

export function markSyncPushSuccess(): void {
  markSyncPushActivity(nowIso())
}

export function markSyncConflict(count: number): void {
  if (count <= 0) {
    return
  }
  updateSyncPreferenceState({
    lastConflictAt: nowIso(),
    lastConflictCount: count
  })
}

export function clearSyncError(): void {
  updateSyncPreferenceState({
    status: 'idle',
    lastErrorAt: '',
    lastErrorCode: '',
    lastErrorMessage: '',
    blockedReason: '',
    consecutiveFailures: 0
  })
}

export function markSyncError(payload: {
  code: string
  message: string
  blockedReason?: SyncBlockedReason
  status?: SyncRuntimeStatus
}): number {
  const sync = getSyncPreferenceState()
  const failures = Math.max(0, Math.floor(sync.consecutiveFailures || 0)) + 1
  updateSyncPreferenceState({
    status: payload.status ?? 'error',
    lastErrorAt: nowIso(),
    lastErrorCode: payload.code,
    lastErrorMessage: payload.message,
    blockedReason: payload.blockedReason ?? sync.blockedReason ?? '',
    consecutiveFailures: failures
  })
  return failures
}
