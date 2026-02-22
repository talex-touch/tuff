import { touchChannel } from '~/modules/channel/channel-core'
import {
  clearLegacyAuthToken,
  clearLegacyDeviceId,
  clearLegacyDeviceName,
  getLegacyAuthToken,
  getLegacyDeviceId,
  getLegacyDeviceName,
  getLegacyDevicePlatform
} from './auth-env'
import { resolveFingerprintHash } from './device-attest'

touchChannel.regChannel('auth:migrate-legacy', () => {
  try {
    return {
      appToken: getLegacyAuthToken(),
      deviceId: getLegacyDeviceId(),
      deviceName: getLegacyDeviceName(),
      devicePlatform: getLegacyDevicePlatform()
    }
  } catch {
    return null
  }
})

touchChannel.regChannel('auth:clear-legacy', () => {
  try {
    clearLegacyAuthToken()
    clearLegacyDeviceId()
    clearLegacyDeviceName()
    return true
  } catch {
    return false
  }
})

touchChannel.regChannel('auth:get-fingerprint-hash', async () => {
  try {
    return await resolveFingerprintHash()
  } catch {
    return null
  }
})
