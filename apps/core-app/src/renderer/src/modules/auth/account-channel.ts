import { touchChannel } from '~/modules/channel/channel-core'
import { getAuthToken } from '~/modules/market/auth-token-service'
import { getAppDeviceId } from './auth-env'
import {
  getSyncPreferenceState,
  markSyncPullActivity,
  markSyncPushActivity
} from './sync-preferences'

touchChannel.regChannel('account:get-auth-token', async () => {
  try {
    return await getAuthToken()
  } catch {
    return null
  }
})

touchChannel.regChannel('account:get-device-id', () => {
  try {
    return getAppDeviceId()
  } catch {
    return null
  }
})

touchChannel.regChannel('account:get-sync-enabled', () => {
  try {
    return getSyncPreferenceState().enabled
  } catch {
    return true
  }
})

touchChannel.regChannel('account:record-sync-activity', (payload) => {
  try {
    const kind =
      payload && typeof payload === 'object' && 'kind' in payload
        ? String((payload as { kind?: unknown }).kind)
        : ''
    if (kind === 'push') {
      markSyncPushActivity()
      return true
    }
    if (kind === 'pull') {
      markSyncPullActivity()
      return true
    }
    return false
  } catch {
    return false
  }
})
