import { useTuffTransport } from '@talex-touch/utils/transport'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { resolveFingerprintHash } from './device-attest'

const transport = useTuffTransport()
const authGetFingerprintHashEvent = defineRawEvent<void, string | null>('auth:get-fingerprint-hash')

transport.on(authGetFingerprintHashEvent, async () => {
  try {
    return await resolveFingerprintHash()
  } catch {
    return null
  }
})
