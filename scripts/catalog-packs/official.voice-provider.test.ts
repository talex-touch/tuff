import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CATALOG_CLIENT_SDKAPI, CATALOG_CONTRACT_VERSION, CATALOG_SCHEMA_VERSION } from '../../packages/utils/i18n/catalog.ts'
import { normalizeVoiceProviderPack } from '../../packages/utils/i18n/voice-provider-catalog.ts'
import { TUFF_NEXUS_PROVIDER_ID } from '../../packages/utils/intelligence/nexus-provider.ts'
import { NEXUS_AUDIO_TRANSCRIBE_MODEL } from '../../packages/utils/types/intelligence.ts'

const PACK_PATH = join(dirname(fileURLToPath(import.meta.url)), 'official.voice-provider.json')

/**
 * The published pack is cloud control over the client's ASR route. A wrong provider id or model id
 * does not fail loudly at build time - it makes every activated client reject the pack at runtime
 * (`VOICE_ASR_PACK_UNSUPPORTED`), so the file is asserted against the same constants and the same
 * normalizer the runtime uses before it is ever signed.
 */
describe('official.voice-provider catalog pack', () => {
  const raw = JSON.parse(readFileSync(PACK_PATH, 'utf8'))

  it('satisfies the shared normalizer', () => {
    const result = normalizeVoiceProviderPack(raw)
    expect(result.ok, result.ok ? '' : `${result.reason}: ${result.message}`).toBe(true)
  })

  it('satisfies every condition voice-provider-runtime enforces before dispatch', () => {
    const result = normalizeVoiceProviderPack(raw)
    if (!result.ok)
      throw new Error(`${result.reason}: ${result.message}`)
    const pack = result.pack
    expect(pack.contractVersion).toBe(CATALOG_CONTRACT_VERSION)
    expect(pack.schemaVersion).toBe(CATALOG_SCHEMA_VERSION)
    expect(pack.minSdkApi).toBeLessThanOrEqual(CATALOG_CLIENT_SDKAPI)

    const descriptor = pack.providers.find(provider => provider.id === TUFF_NEXUS_PROVIDER_ID)
    expect(descriptor, `provider ${TUFF_NEXUS_PROVIDER_ID} is missing`).toBeTruthy()
    if (!descriptor)
      return

    expect(descriptor.protocol).toBe('nexus-pack')
    expect(descriptor.transport).toBe('http-upload')
    expect(descriptor.auth.mode).toBe('nexus-session')
    expect(descriptor.request.body).toBe('raw-bytes')
    expect(descriptor.request.contentTypePolicy).toBe('audio/*')
    expect(descriptor.request.idempotencyHeader).toBeTruthy()
    expect(descriptor.endpoint.pollPath).toBeTruthy()
    expect(descriptor.limits.maxBytes).toBeGreaterThan(44)
    expect(descriptor.limits.maxDurationSec).toBeGreaterThan(0)
    expect(descriptor.limits.timeoutMs).toBeGreaterThanOrEqual(100)

    // Same-origin with the shipped Nexus base URL: the runtime freezes the route to it.
    expect(descriptor.endpoint.baseUrl).toBe('https://tuff.tagzxia.com')
    expect(descriptor.models.map(model => model.id)).toContain(NEXUS_AUDIO_TRANSCRIBE_MODEL)
  })
})
