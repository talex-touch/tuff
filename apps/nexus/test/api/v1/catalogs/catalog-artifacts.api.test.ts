import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  catalogArtifactManifestObjectKey,
  catalogArtifactPayloadObjectKey,
} from '../../../../server/utils/catalogArtifactProjection'
import { stageCatalogArtifact } from '../../../../server/utils/catalogArtifactStorage'

type RouteHandler = (event: H3Event) => Promise<unknown>

const h3Mocks = vi.hoisted(() => ({
  getRouterParam: vi.fn(),
  send: vi.fn(),
  setResponseHeader: vi.fn(),
}))

const authMocks = vi.hoisted(() => ({
  requireAppAuth: vi.fn(),
}))

vi.mock('../../../../server/utils/auth', () => authMocks)
vi.mock('../../../../server/utils/cloudflare', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../../../server/utils/cloudflare')>()), readCloudflareBindings: () => undefined, }))
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getRouterParam: h3Mocks.getRouterParam,
    send: h3Mocks.send,
    setResponseHeader: h3Mocks.setResponseHeader,
  }
})

let latestHandler: RouteHandler
let payloadHandler: RouteHandler
let keyHandler: RouteHandler

beforeAll(async () => {
  ;(globalThis as { defineEventHandler?: (fn: unknown) => unknown }).defineEventHandler = fn => fn
  // The route modules call `defineEventHandler` at module scope, so they can only be loaded
  // after that global exists — a static import would evaluate the routes during collection.
  latestHandler = (await import('../../../../server/api/v1/catalogs/[type]/latest.get'))
    .default as RouteHandler
  payloadHandler = (
    await import('../../../../server/api/v1/catalogs/[type]/[packId]/[version]/[filename].get')
  ).default as RouteHandler
  keyHandler = (
    await import('../../../../server/api/v1/catalogs/[type]/[packId]/[version]/keys/[keyId].get')
  ).default as RouteHandler
})

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

function makeEvent(path: string, params: Record<string, string>): H3Event {
  return {
    path,
    node: { req: { url: path, headers: { 'user-agent': 'vitest' } } },
    context: { params },
  } as unknown as H3Event
}

function selectParams(params: Record<string, string>): void {
  h3Mocks.getRouterParam.mockImplementation((_event: unknown, name: string) => params[name])
}

function payloadRoute(identity: {
  packId: string
  version: string
  filename: string
}): { path: string, params: Record<string, string> } {
  const path = `/api/v1/catalogs/voice-provider/${identity.packId}/${identity.version}/${identity.filename}`
  return { path, params: { type: 'voice-provider', ...identity } }
}

const PAYLOAD_IDENTITY = {
  packId: 'official.voice-provider',
  version: '2026.09.13',
  sha256: 'a'.repeat(64),
}

function keyRoute(identity: {
  packId: string
  version: string
  keyId: string
  type?: string
}): { path: string, params: Record<string, string> } {
  const type = identity.type ?? 'voice-provider'
  const path = `/api/v1/catalogs/${type}/${identity.packId}/${identity.version}/keys/${identity.keyId}`
  return { path, params: { type, packId: identity.packId, version: identity.version, keyId: identity.keyId } }
}

describe('catalog artifact routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h3Mocks.send.mockImplementation(async (_event: unknown, body: unknown) => body)
  })

  it('serves the stored manifest bytes unchanged for a known catalog type', async () => {
    const bytes = Buffer.from('{"kind":"tuff.catalog.manifest","type":"voice-provider"}')
    const path = '/api/v1/catalogs/voice-provider/latest'
    const event = makeEvent(path, { type: 'voice-provider' })
    selectParams({ type: 'voice-provider' })

    await stageCatalogArtifact(event, catalogArtifactManifestObjectKey('voice-provider'), bytes)

    const result = await latestHandler(event)

    expect(result).toEqual(bytes)
    expect(sha256Hex(result as Buffer)).toBe(sha256Hex(bytes))
    expect(h3Mocks.setResponseHeader).toHaveBeenCalledWith(event, 'Content-Length', bytes.byteLength)
    expect(h3Mocks.setResponseHeader).toHaveBeenCalledWith(
      event,
      'X-Content-SHA256',
      sha256Hex(bytes),
    )
    expect(h3Mocks.setResponseHeader).toHaveBeenCalledWith(
      event,
      'Cache-Control',
      'public, max-age=300, must-revalidate',
    )
  })

  it('answers 404 for an unknown catalog type without reading storage', async () => {
    const event = makeEvent('/api/v1/catalogs/app-semantic-alias/latest', {
      type: 'app-semantic-alias',
    })
    selectParams({ type: 'app-semantic-alias' })

    await expect(latestHandler(event)).rejects.toMatchObject({ statusCode: 404 })
    expect(h3Mocks.setResponseHeader).not.toHaveBeenCalled()
  })

  it('answers 404 when a known catalog type has no published manifest', async () => {
    // The in-memory backend is shared for the duration of a module registry, so a fresh
    // registry is what "nothing has been staged yet" means here.
    vi.resetModules()
    const freshLatest = (await import('../../../../server/api/v1/catalogs/[type]/latest.get'))
      .default as RouteHandler
    const event = makeEvent('/api/v1/catalogs/voice-provider/latest', { type: 'voice-provider' })
    selectParams({ type: 'voice-provider' })

    await expect(freshLatest(event)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('returns stored payload bytes whose digest is the digest in the route', async () => {
    const bytes = Buffer.from('{"providers":[]}')
    const sha256 = sha256Hex(bytes)
    const route = payloadRoute({ ...PAYLOAD_IDENTITY, filename: `${sha256}.json` })
    const event = makeEvent(route.path, route.params)
    selectParams(route.params)

    await stageCatalogArtifact(
      event,
      catalogArtifactPayloadObjectKey({ type: 'voice-provider', ...PAYLOAD_IDENTITY, sha256 }),
      bytes,
    )

    const result = await payloadHandler(event)

    expect(sha256Hex(result as Buffer)).toBe(sha256)
    expect(result).toEqual(bytes)
    expect(h3Mocks.setResponseHeader).toHaveBeenCalledWith(
      event,
      'Cache-Control',
      'public, max-age=31536000, immutable',
    )
  })

  it('404s a stored object whose bytes do not match the content-addressed route', async () => {
    const routeSha256 = 'c'.repeat(64)
    const bytes = Buffer.from('staged-under-the-wrong-digest')
    const route = payloadRoute({ ...PAYLOAD_IDENTITY, filename: `${routeSha256}.json` })
    const event = makeEvent(route.path, route.params)
    selectParams(route.params)

    await stageCatalogArtifact(
      event,
      catalogArtifactPayloadObjectKey({
        type: 'voice-provider',
        ...PAYLOAD_IDENTITY,
        sha256: routeSha256,
      }),
      bytes,
    )

    await expect(payloadHandler(event)).rejects.toMatchObject({ statusCode: 404 })
    expect(h3Mocks.setResponseHeader).not.toHaveBeenCalled()
  })

  it('serves a payload that is not valid JSON byte-for-byte, because the server never parses it', async () => {
    const bytes = Buffer.from('not json at all\x00\xFF')
    const sha256 = sha256Hex(bytes)
    const route = payloadRoute({ ...PAYLOAD_IDENTITY, filename: `${sha256}.json` })
    const event = makeEvent(route.path, route.params)
    selectParams(route.params)

    await stageCatalogArtifact(
      event,
      catalogArtifactPayloadObjectKey({ type: 'voice-provider', ...PAYLOAD_IDENTITY, sha256 }),
      bytes,
    )

    const result = await payloadHandler(event)

    expect(result).toEqual(bytes)
    expect(sha256Hex(result as Buffer)).toBe(sha256)
  })

  it.each([
    ['unknown packId', { ...PAYLOAD_IDENTITY, packId: 'official.other-provider' }],
    ['unknown version', { ...PAYLOAD_IDENTITY, version: '2026.09.14' }],
    ['unknown digest', { ...PAYLOAD_IDENTITY, sha256: 'b'.repeat(64) }],
  ])('answers 404 for an unpublished identity (%s)', async (_label, identity) => {
    const route = payloadRoute({ ...identity, filename: `${identity.sha256}.json` })
    const event = makeEvent(route.path, route.params)
    selectParams(route.params)

    await expect(payloadHandler(event)).rejects.toMatchObject({ statusCode: 404 })
  })

  it.each([
    ['missing .json suffix', 'a'.repeat(64)],
    ['non-hex digest', `${'z'.repeat(64)}.json`],
    ['short digest', 'abc.json'],
    ['path traversal', '../../etc/passwd'],
  ])('answers 404 for a malformed artifact filename (%s)', async (_label, filename) => {
    const route = payloadRoute({ ...PAYLOAD_IDENTITY, filename })
    const event = makeEvent(route.path, route.params)
    selectParams(route.params)

    await expect(payloadHandler(event)).rejects.toMatchObject({ statusCode: 404 })
    expect(h3Mocks.setResponseHeader).not.toHaveBeenCalled()
  })

  it('answers 404 for a traversing or malformed packId/version before touching storage', async () => {
    const cases = [
      { ...PAYLOAD_IDENTITY, packId: '..' },
      { ...PAYLOAD_IDENTITY, version: '../..' },
      { ...PAYLOAD_IDENTITY, packId: 'Official.Voice' },
    ]

    for (const identity of cases) {
      const route = payloadRoute({ ...identity, filename: `${'a'.repeat(64)}.json` })
      const event = makeEvent(route.path, route.params)
      selectParams(route.params)

      await expect(payloadHandler(event)).rejects.toMatchObject({ statusCode: 404 })
    }
    expect(h3Mocks.setResponseHeader).not.toHaveBeenCalled()
  })
})

interface CapturedRouteError { statusCode?: number, statusMessage?: string, message?: string }

async function captureRouteRejection(run: () => Promise<unknown>): Promise<CapturedRouteError> {
  try {
    await run()
  }
  catch (error) {
    // h3 errors are plain objects with these fields; narrow once at the boundary.
    if (error && typeof error === 'object')
      return error as CapturedRouteError
    throw error
  }
  throw new Error('expected the route handler to reject')
}

describe('catalog payload key route', () => {
  const KEY_IDENTITY = { packId: 'official.voice-provider', version: '2026.09.13', keyId: 'k1' }
  const LOOKUP_ID = `voice-provider/${KEY_IDENTITY.packId}/${KEY_IDENTITY.version}/${KEY_IDENTITY.keyId}`
  const CANONICAL_KEY = Buffer.alloc(32, 0x5a).toString('base64')
  const ORIGINAL_KEY_MAP = process.env.VOICE_PROVIDER_CATALOG_KEYS

  beforeEach(() => {
    vi.clearAllMocks()
    authMocks.requireAppAuth.mockResolvedValue({ userId: 'user-1' })
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

  function stubKeyMap(value: string): void {
    vi.stubEnv('VOICE_PROVIDER_CATALOG_KEYS', value)
  }

  it('rejects an unauthenticated request before the key configuration is ever read', async () => {
    authMocks.requireAppAuth.mockRejectedValue(
      Object.assign(new Error('Authentication required.'), { statusCode: 401 }),
    )
    // A broken secret map would surface as 503 if the route read it first; the 401 proves the
    // authentication gate runs ahead of the secret lookup.
    stubKeyMap('{ not json')
    const route = keyRoute(KEY_IDENTITY)
    const event = makeEvent(route.path, route.params)
    selectParams(route.params)

    await expect(keyHandler(event)).rejects.toMatchObject({ statusCode: 401 })
    expect(h3Mocks.setResponseHeader).not.toHaveBeenCalled()
  })

  it('answers 404 for a malformed key identity even while the secret map is unparseable', async () => {
    // Identity validation must precede the secret-map read: malformed identities 404 rather than
    // leaking the configuration error.
    stubKeyMap('{ not json')
    const cases = [
      ['Uppercase keyId', keyRoute({ ...KEY_IDENTITY, keyId: 'K1' })],
      ['Traversing keyId', keyRoute({ ...KEY_IDENTITY, keyId: '../../secret' })],
      ['Uppercase packId', keyRoute({ ...KEY_IDENTITY, packId: 'Official.Voice' })],
      ['Traversing version', keyRoute({ ...KEY_IDENTITY, version: '../..' })],
      ['Unknown catalog type', keyRoute({ ...KEY_IDENTITY, type: 'app-semantic-alias' })],
    ] as const

    for (const [label, route] of cases) {
      const event = makeEvent(route.path, route.params)
      selectParams(route.params)
      await expect(keyHandler(event), label).rejects.toMatchObject({ statusCode: 404 })
    }
    expect(h3Mocks.setResponseHeader).not.toHaveBeenCalled()
  })

  it('answers 404 when the identity is valid but the secret map has no matching entry', async () => {
    stubKeyMap(JSON.stringify({ [LOOKUP_ID]: CANONICAL_KEY }))
    const route = keyRoute({ ...KEY_IDENTITY, keyId: 'k2' })
    const event = makeEvent(route.path, route.params)
    selectParams(route.params)

    await expect(keyHandler(event)).rejects.toMatchObject({ statusCode: 404 })
    expect(h3Mocks.setResponseHeader).not.toHaveBeenCalled()
  })

  it('fails closed with a generic 503 for an unparseable secret map without echoing it', async () => {
    const canary = 'canary-secret-that-must-not-leak'
    stubKeyMap(`{"${LOOKUP_ID}":"${canary}`)
    const route = keyRoute(KEY_IDENTITY)
    const event = makeEvent(route.path, route.params)
    selectParams(route.params)

    const error = await captureRouteRejection(() => keyHandler(event))

    expect(error).toMatchObject({
      statusCode: 503,
      statusMessage: 'Catalog payload key is unavailable.',
    })
    expect(error.message ?? '').not.toContain(canary)
    expect(h3Mocks.setResponseHeader).not.toHaveBeenCalled()
  })

  it('answers 404 when the configured key is not a canonical 32-byte AES key', async () => {
    stubKeyMap(
      JSON.stringify({ [LOOKUP_ID]: Buffer.alloc(16, 0x5a).toString('base64') }),
    )
    const route = keyRoute(KEY_IDENTITY)
    const event = makeEvent(route.path, route.params)
    selectParams(route.params)

    await expect(keyHandler(event)).rejects.toMatchObject({ statusCode: 404 })
  })

  it('returns the exact authenticated key with private, uncacheable response headers', async () => {
    stubKeyMap(JSON.stringify({ [LOOKUP_ID]: CANONICAL_KEY }))
    const route = keyRoute(KEY_IDENTITY)
    const event = makeEvent(route.path, route.params)
    selectParams(route.params)

    const result = await keyHandler(event)

    expect(result).toEqual({
      version: 1,
      algorithm: 'aes-256-gcm',
      keyId: KEY_IDENTITY.keyId,
      key: CANONICAL_KEY,
    })
    expect(h3Mocks.setResponseHeader).toHaveBeenCalledWith(event, 'Cache-Control', 'private, no-store')
    expect(h3Mocks.setResponseHeader).toHaveBeenCalledWith(event, 'Pragma', 'no-cache')
    expect(h3Mocks.setResponseHeader).toHaveBeenCalledWith(
      event,
      'X-Content-Type-Options',
      'nosniff',
    )
    const headerValues = h3Mocks.setResponseHeader.mock.calls.map(call => String(call[2]))
    expect(headerValues.some(value => /public|max-age|immutable/i.test(value))).toBe(false)
  })
})
