import { describe, expect, it, vi } from 'vitest'

async function loadTarget(initialSync?: Record<string, unknown>) {
  vi.resetModules()

  const appSettingMock: { sync: Record<string, unknown> | undefined } = {
    sync: initialSync
  }

  vi.doMock('~/modules/channel/storage', () => ({
    appSetting: appSettingMock
  }))

  const target = await import('./sync-preferences')
  return {
    appSettingMock,
    applyDefaultSyncOnLogin: target.applyDefaultSyncOnLogin,
    getSyncPreferenceState: target.getSyncPreferenceState,
    markSyncActivity: target.markSyncActivity,
    markSyncPullActivity: target.markSyncPullActivity,
    markSyncPushActivity: target.markSyncPushActivity,
    setSyncPreferenceByUser: target.setSyncPreferenceByUser,
    updateSyncPreferenceState: target.updateSyncPreferenceState
  }
}

describe('sync-preferences', () => {
  it('auto enables sync when user has not overridden preference', async () => {
    const { appSettingMock, applyDefaultSyncOnLogin, getSyncPreferenceState } = await loadTarget()

    const changed = applyDefaultSyncOnLogin('2026-02-12T00:00:00.000Z')
    const sync = getSyncPreferenceState()

    expect(changed).toBe(true)
    expect(sync.enabled).toBe(true)
    expect(sync.userOverridden).toBe(false)
    expect(sync.autoEnabledAt).toBe('2026-02-12T00:00:00.000Z')
    expect(sync.lastActivityAt).toBe('')
    expect(sync.lastPushAt).toBe('')
    expect(sync.lastPullAt).toBe('')
    expect(sync.status).toBe('idle')
    expect(sync.lastErrorCode).toBe('')
    expect(sync.queueDepth).toBe(0)
    expect(sync.cursor).toBe(0)
    expect(appSettingMock.sync?.enabled).toBe(true)
  })

  it('does not override manual user choice during login', async () => {
    const { applyDefaultSyncOnLogin, getSyncPreferenceState } = await loadTarget({
      enabled: false,
      userOverridden: true,
      autoEnabledAt: ''
    })

    const changed = applyDefaultSyncOnLogin('2026-02-12T00:00:00.000Z')
    const sync = getSyncPreferenceState()

    expect(changed).toBe(false)
    expect(sync.enabled).toBe(false)
    expect(sync.userOverridden).toBe(true)
    expect(sync.autoEnabledAt).toBe('')
    expect(sync.lastActivityAt).toBe('')
    expect(sync.lastPushAt).toBe('')
    expect(sync.lastPullAt).toBe('')
    expect(sync.status).toBe('idle')
  })

  it('marks preference as overridden after user toggles sync', async () => {
    const { getSyncPreferenceState, setSyncPreferenceByUser } = await loadTarget()

    setSyncPreferenceByUser(false)
    const sync = getSyncPreferenceState()

    expect(sync.enabled).toBe(false)
    expect(sync.userOverridden).toBe(true)
    expect(sync.status).toBe('paused')
  })

  it('tracks latest sync activity timestamp', async () => {
    const { getSyncPreferenceState, markSyncActivity } = await loadTarget()

    markSyncActivity('2026-02-12T01:23:45.000Z')
    const sync = getSyncPreferenceState()

    expect(sync.lastActivityAt).toBe('2026-02-12T01:23:45.000Z')
  })

  it('tracks push and pull timestamps separately', async () => {
    const { getSyncPreferenceState, markSyncPushActivity, markSyncPullActivity } =
      await loadTarget()

    markSyncPushActivity('2026-02-12T01:00:00.000Z')
    markSyncPullActivity('2026-02-12T02:00:00.000Z')
    const sync = getSyncPreferenceState()

    expect(sync.lastPushAt).toBe('2026-02-12T01:00:00.000Z')
    expect(sync.lastPullAt).toBe('2026-02-12T02:00:00.000Z')
    expect(sync.lastActivityAt).toBe('2026-02-12T02:00:00.000Z')
    expect(sync.lastSuccessAt).toBe('2026-02-12T02:00:00.000Z')
    expect(sync.consecutiveFailures).toBe(0)
  })

  it('supports runtime state patch updates', async () => {
    const { getSyncPreferenceState, updateSyncPreferenceState } = await loadTarget()

    updateSyncPreferenceState({
      status: 'error',
      lastErrorCode: 'SYNC_TOKEN_EXPIRED',
      lastErrorMessage: 'token expired',
      consecutiveFailures: 2,
      queueDepth: 3,
      blockedReason: 'auth',
      cursor: 9,
      opSeq: 6
    })

    const sync = getSyncPreferenceState()
    expect(sync.status).toBe('error')
    expect(sync.lastErrorCode).toBe('SYNC_TOKEN_EXPIRED')
    expect(sync.lastErrorMessage).toBe('token expired')
    expect(sync.consecutiveFailures).toBe(2)
    expect(sync.queueDepth).toBe(3)
    expect(sync.blockedReason).toBe('auth')
    expect(sync.cursor).toBe(9)
    expect(sync.opSeq).toBe(6)
  })
})
