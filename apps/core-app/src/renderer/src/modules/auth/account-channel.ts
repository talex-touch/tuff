import { touchChannel } from '~/modules/channel/channel-core'
import { getAuthToken } from '~/modules/market/auth-token-service'
import { getAppDeviceId } from './auth-env'

touchChannel.regChannel('account:get-auth-token', async () => {
  try {
    return await getAuthToken()
  } catch (error) {
    console.warn('[AccountChannel] Failed to resolve auth token', error)
    return null
  }
})

touchChannel.regChannel('account:get-device-id', () => {
  try {
    return getAppDeviceId()
  } catch (error) {
    console.warn('[AccountChannel] Failed to resolve device id', error)
    return null
  }
})
