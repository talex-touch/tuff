import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { useTuffTransport } from '@talex-touch/utils/transport'

const authAttestEvent = defineRawEvent<void, { success: boolean }>('auth:attest-device')
const FINGERPRINT_HASH_VERSION = 'fp_v1'

let fingerprintHashPromise: Promise<string | null> | null = null

async function sha256Hex(input: string): Promise<string> {
  if (!crypto?.subtle?.digest) {
    throw new Error('WebCrypto subtle.digest not available')
  }
  const encoded = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function resolveFingerprintHash(): Promise<string | null> {
  if (fingerprintHashPromise) {
    return await fingerprintHashPromise
  }

  fingerprintHashPromise = (async () => {
    try {
      const fingerprintModule = await import('@fingerprintjs/fingerprintjs')
      const loadFn =
        (fingerprintModule as { load?: unknown }).load ??
        (fingerprintModule as { default?: { load?: unknown } }).default?.load
      if (typeof loadFn !== 'function') {
        return null
      }

      const agent = await loadFn()
      const result = await (agent as { get?: () => Promise<unknown> })?.get?.()
      const visitorId =
        result && typeof result === 'object' && 'visitorId' in result
          ? typeof (result as { visitorId?: unknown }).visitorId === 'string'
            ? (result as { visitorId: string }).visitorId.trim()
            : ''
          : ''

      if (!visitorId) {
        return null
      }

      return await sha256Hex(`${FINGERPRINT_HASH_VERSION}|${visitorId}`)
    } catch {
      return null
    }
  })()

  return await fingerprintHashPromise
}

export async function attestCurrentDevice(): Promise<void> {
  const transport = useTuffTransport()
  await transport.send(authAttestEvent)
}
