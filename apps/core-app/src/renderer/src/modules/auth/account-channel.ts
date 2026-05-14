import { useTuffTransport } from '@talex-touch/utils/transport'
import { AuthEvents } from '@talex-touch/utils/transport/events'
import { resolveFingerprintHash } from './device-attest'

const transport = useTuffTransport()

const handleFingerprintHashRequest = async () => {
  try {
    return await resolveFingerprintHash()
  } catch {
    return null
  }
}

transport.on(AuthEvents.device.getFingerprintHash, handleFingerprintHashRequest)
transport.on(AuthEvents.legacy.getFingerprintHash, handleFingerprintHashRequest)
