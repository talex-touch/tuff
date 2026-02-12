import { appSetting } from '~/modules/channel/storage'

export type SyncRuntimeStatus = 'idle' | 'syncing' | 'paused' | 'error'
export type SyncBlockedReason = '' | 'quota' | 'device' | 'auth'

export interface SyncPreferenceState {
  enabled: boolean
  userOverridden: boolean
  autoEnabledAt: string
  lastActivityAt: string
  lastPushAt: string
  lastPullAt: string
  status: SyncRuntimeStatus
  lastSuccessAt: string
  lastErrorAt: string
  lastErrorCode: string
  lastErrorMessage: string
  consecutiveFailures: number
  queueDepth: number
  nextPullAt: string
  cursor: number
  opSeq: number
  lastConflictAt: string
  lastConflictCount: number
  blockedReason: SyncBlockedReason
}

const DEFAULT_SYNC_PREFERENCE: SyncPreferenceState = {
  enabled: false,
  userOverridden: false,
  autoEnabledAt: '',
  lastActivityAt: '',
  lastPushAt: '',
  lastPullAt: '',
  status: 'idle',
  lastSuccessAt: '',
  lastErrorAt: '',
  lastErrorCode: '',
  lastErrorMessage: '',
  consecutiveFailures: 0,
  queueDepth: 0,
  nextPullAt: '',
  cursor: 0,
  opSeq: 0,
  lastConflictAt: '',
  lastConflictCount: 0,
  blockedReason: ''
}

function normalizeStatus(value: unknown): SyncRuntimeStatus {
  if (value === 'idle' || value === 'syncing' || value === 'paused' || value === 'error') {
    return value
  }
  return DEFAULT_SYNC_PREFERENCE.status
}

function normalizeBlockedReason(value: unknown): SyncBlockedReason {
  if (value === '' || value === 'quota' || value === 'device' || value === 'auth') {
    return value
  }
  return DEFAULT_SYNC_PREFERENCE.blockedReason
}

function normalizeNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function ensureSyncPreferenceState(): SyncPreferenceState {
  const current = appSetting.sync
  if (!current || typeof current !== 'object') {
    appSetting.sync = { ...DEFAULT_SYNC_PREFERENCE }
    return appSetting.sync as SyncPreferenceState
  }

  const sync = current as Partial<SyncPreferenceState>
  if (typeof sync.enabled !== 'boolean') {
    sync.enabled = DEFAULT_SYNC_PREFERENCE.enabled
  }
  if (typeof sync.userOverridden !== 'boolean') {
    sync.userOverridden = DEFAULT_SYNC_PREFERENCE.userOverridden
  }
  if (typeof sync.autoEnabledAt !== 'string') {
    sync.autoEnabledAt = DEFAULT_SYNC_PREFERENCE.autoEnabledAt
  }
  if (typeof sync.lastActivityAt !== 'string') {
    sync.lastActivityAt = DEFAULT_SYNC_PREFERENCE.lastActivityAt
  }
  if (typeof sync.lastPushAt !== 'string') {
    sync.lastPushAt = DEFAULT_SYNC_PREFERENCE.lastPushAt
  }
  if (typeof sync.lastPullAt !== 'string') {
    sync.lastPullAt = DEFAULT_SYNC_PREFERENCE.lastPullAt
  }
  sync.status = normalizeStatus(sync.status)
  if (typeof sync.lastSuccessAt !== 'string') {
    sync.lastSuccessAt = DEFAULT_SYNC_PREFERENCE.lastSuccessAt
  }
  if (typeof sync.lastErrorAt !== 'string') {
    sync.lastErrorAt = DEFAULT_SYNC_PREFERENCE.lastErrorAt
  }
  if (typeof sync.lastErrorCode !== 'string') {
    sync.lastErrorCode = DEFAULT_SYNC_PREFERENCE.lastErrorCode
  }
  if (typeof sync.lastErrorMessage !== 'string') {
    sync.lastErrorMessage = DEFAULT_SYNC_PREFERENCE.lastErrorMessage
  }
  sync.consecutiveFailures = normalizeNumber(
    sync.consecutiveFailures,
    DEFAULT_SYNC_PREFERENCE.consecutiveFailures
  )
  sync.queueDepth = normalizeNumber(sync.queueDepth, DEFAULT_SYNC_PREFERENCE.queueDepth)
  if (typeof sync.nextPullAt !== 'string') {
    sync.nextPullAt = DEFAULT_SYNC_PREFERENCE.nextPullAt
  }
  sync.cursor = normalizeNumber(sync.cursor, DEFAULT_SYNC_PREFERENCE.cursor)
  sync.opSeq = normalizeNumber(sync.opSeq, DEFAULT_SYNC_PREFERENCE.opSeq)
  if (typeof sync.lastConflictAt !== 'string') {
    sync.lastConflictAt = DEFAULT_SYNC_PREFERENCE.lastConflictAt
  }
  sync.lastConflictCount = normalizeNumber(
    sync.lastConflictCount,
    DEFAULT_SYNC_PREFERENCE.lastConflictCount
  )
  sync.blockedReason = normalizeBlockedReason(sync.blockedReason)
  return sync as SyncPreferenceState
}

export function applyDefaultSyncOnLogin(nowIso = new Date().toISOString()): boolean {
  const sync = ensureSyncPreferenceState()
  if (sync.userOverridden || sync.enabled) {
    return false
  }

  sync.enabled = true
  sync.status = 'idle'
  if (!sync.autoEnabledAt) {
    sync.autoEnabledAt = nowIso
  }
  return true
}

export function setSyncPreferenceByUser(enabled: boolean): void {
  const sync = ensureSyncPreferenceState()
  sync.enabled = enabled
  sync.userOverridden = true
  sync.status = enabled ? 'idle' : 'paused'
  if (!enabled) {
    sync.nextPullAt = ''
    sync.queueDepth = 0
  }
}

export function updateSyncPreferenceState(next: Partial<SyncPreferenceState>): SyncPreferenceState {
  const sync = ensureSyncPreferenceState()
  Object.assign(sync, next)
  return sync
}

export function markSyncActivity(nowIso = new Date().toISOString()): void {
  const sync = ensureSyncPreferenceState()
  sync.lastActivityAt = nowIso
}

export function markSyncPushActivity(nowIso = new Date().toISOString()): void {
  const sync = ensureSyncPreferenceState()
  sync.lastPushAt = nowIso
  sync.lastSuccessAt = nowIso
  sync.lastActivityAt = nowIso
  sync.status = 'idle'
  sync.lastErrorAt = ''
  sync.lastErrorCode = ''
  sync.lastErrorMessage = ''
  sync.blockedReason = ''
  sync.consecutiveFailures = 0
}

export function markSyncPullActivity(nowIso = new Date().toISOString()): void {
  const sync = ensureSyncPreferenceState()
  sync.lastPullAt = nowIso
  sync.lastSuccessAt = nowIso
  sync.lastActivityAt = nowIso
  sync.status = 'idle'
  sync.lastErrorAt = ''
  sync.lastErrorCode = ''
  sync.lastErrorMessage = ''
  sync.blockedReason = ''
  sync.consecutiveFailures = 0
}

export function getSyncPreferenceState(): SyncPreferenceState {
  return ensureSyncPreferenceState()
}
