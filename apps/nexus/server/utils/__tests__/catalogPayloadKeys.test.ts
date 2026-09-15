import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CatalogPayloadKeyIdentity } from '../catalogArtifactProjection'
import {
  CatalogPayloadKeyConfigurationError,
  readCatalogPayloadKey,
} from '../catalogPayloadKeys'

const cloudflareMocks = vi.hoisted(() => ({
  readCloudflareBindings: vi.fn(),
}))

vi.mock('../cloudflare', () => ({
  readCloudflareBindings: cloudflareMocks.readCloudflareBindings,
}))

const IDENTITY: CatalogPayloadKeyIdentity = {
  type: 'voice-provider',
  packId: 'official.voice-provider',
  version: '2026.09.13',
  keyId: 'k1',
}
const LOOKUP_ID = 'voice-provider/official.voice-provider/2026.09.13/k1'
const CANONICAL_KEY = Buffer.alloc(32, 0x5a).toString('base64')
const OTHER_KEY = Buffer.alloc(32, 0xa5).toString('base64')
const ORIGINAL_KEY_MAP = process.env.VOICE_PROVIDER_CATALOG_KEYS

function createEvent(): H3Event {
  return {} as H3Event
}

function stubKeyMap(value: string): void {
  vi.stubEnv('VOICE_PROVIDER_CATALOG_KEYS', value)
}

function keyMap(entries: Record<string, unknown>): string {
  return JSON.stringify(entries)
}

describe('readCatalogPayloadKey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cloudflareMocks.readCloudflareBindings.mockReturnValue(undefined)
    delete process.env.VOICE_PROVIDER_CATALOG_KEYS
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  afterAll(() => {
    if (ORIGINAL_KEY_MAP === undefined)
      delete process.env.VOICE_PROVIDER_CATALOG_KEYS
    else
      process.env.VOICE_PROVIDER_CATALOG_KEYS = ORIGINAL_KEY_MAP
  })

  it('resolves exactly the entry addressed by type/packId/version/keyId', () => {
    stubKeyMap(keyMap({
      [LOOKUP_ID]: CANONICAL_KEY,
      'voice-provider/official.other-provider/2026.09.13/k1': OTHER_KEY,
      'voice-provider/official.voice-provider/2026.09.13/k2': OTHER_KEY,
      'voice-provider/official.voice-provider/2026.09.14/k1': OTHER_KEY,
    }))

    expect(readCatalogPayloadKey(createEvent(), IDENTITY)).toEqual({
      version: 1,
      algorithm: 'aes-256-gcm',
      keyId: 'k1',
      key: CANONICAL_KEY,
    })
  })

  it.each([
    ['packId', { ...IDENTITY, packId: 'official.other-provider' }],
    ['version', { ...IDENTITY, version: '2026.09.14' }],
    ['keyId', { ...IDENTITY, keyId: 'k2' }],
  ])('returns null when the %s component does not match the stored entry', (_component, identity) => {
    stubKeyMap(keyMap({ [LOOKUP_ID]: CANONICAL_KEY }))

    expect(readCatalogPayloadKey(createEvent(), identity)).toBeNull()
  })

  it.each([
    ['a 16-byte key', Buffer.alloc(16, 0x5a).toString('base64')],
    ['a 33-byte key', Buffer.alloc(33, 0x5a).toString('base64')],
    ['unpadded base64', CANONICAL_KEY.replace(/=+$/, '')],
    ['non-base64 characters', '!'.repeat(44)],
    ['non-canonical base64 encoding the same 32 bytes', `${'A'.repeat(42)}B=`],
  ])('returns null for %s', (_label, value) => {
    stubKeyMap(keyMap({ [LOOKUP_ID]: value }))

    expect(readCatalogPayloadKey(createEvent(), IDENTITY)).toBeNull()
  })

  it.each([
    ['truncated JSON', `{"${LOOKUP_ID}":"${CANONICAL_KEY}`],
    ['a JSON array', keyMap([CANONICAL_KEY])],
    ['a JSON string', JSON.stringify(CANONICAL_KEY)],
    ['JSON null', 'null'],
  ])('throws the configuration error for %s', (_label, raw) => {
    stubKeyMap(raw)

    expect(() => readCatalogPayloadKey(createEvent(), IDENTITY))
      .toThrow(CatalogPayloadKeyConfigurationError)
  })

  it('never includes the raw configuration in the configuration failure', () => {
    const canary = 'canary-secret-that-must-not-leak'
    stubKeyMap(`{"${LOOKUP_ID}":"${canary}`)

    let thrown: unknown
    try {
      readCatalogPayloadKey(createEvent(), IDENTITY)
    }
    catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(CatalogPayloadKeyConfigurationError)
    if (!(thrown instanceof Error))
      throw new Error('expected a configuration error')
    expect(thrown.message).not.toContain(canary)
  })

  it('rejects a secret map above the 64 KiB limit', () => {
    stubKeyMap(`{"${LOOKUP_ID}":"${'A'.repeat(64 * 1024)}"}`)

    expect(() => readCatalogPayloadKey(createEvent(), IDENTITY))
      .toThrow(CatalogPayloadKeyConfigurationError)
  })

  it('returns null when neither bindings nor the environment provide a map', () => {
    expect(readCatalogPayloadKey(createEvent(), IDENTITY)).toBeNull()
  })

  it('prefers the Cloudflare binding map over the process environment', () => {
    stubKeyMap(keyMap({ [LOOKUP_ID]: OTHER_KEY }))
    cloudflareMocks.readCloudflareBindings.mockReturnValue({
      VOICE_PROVIDER_CATALOG_KEYS: keyMap({ [LOOKUP_ID]: CANONICAL_KEY }),
    })

    const result = readCatalogPayloadKey(createEvent(), IDENTITY)

    expect(result?.key).toBe(CANONICAL_KEY)
    expect(result?.key).not.toBe(OTHER_KEY)
  })

  it('falls back to the process environment when the runtime exposes no binding', () => {
    cloudflareMocks.readCloudflareBindings.mockReturnValue({})
    stubKeyMap(keyMap({ [LOOKUP_ID]: CANONICAL_KEY }))

    expect(readCatalogPayloadKey(createEvent(), IDENTITY)?.key).toBe(CANONICAL_KEY)
  })

  it('treats an explicit empty binding as "no keys" instead of falling back to the environment', () => {
    stubKeyMap(keyMap({ [LOOKUP_ID]: CANONICAL_KEY }))
    cloudflareMocks.readCloudflareBindings.mockReturnValue({ VOICE_PROVIDER_CATALOG_KEYS: '' })

    expect(readCatalogPayloadKey(createEvent(), IDENTITY)).toBeNull()
  })
})
