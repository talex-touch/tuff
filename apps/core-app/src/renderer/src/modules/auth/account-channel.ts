import { touchChannel } from '~/modules/channel/channel-core'
import { resolveFingerprintHash } from './device-attest'

touchChannel.regChannel('auth:get-fingerprint-hash', async () => {
  try {
    return await resolveFingerprintHash()
  } catch {
    return null
  }
})
