import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeEdgeCache, flushAfterResponse } from '../helpers/edge-cache'

/**
 * The public GET routes that answer from Cloudflare's edge cache. What matters is that a copy is
 * reused only where the answer is the same for everyone, that a hit costs no D1 or R2 read, and that
 * a hit looks to the client like the answer it replaces.
 */

const releases = vi.hoisted(() => ({ getLatestRelease: vi.fn() }))
const signatures = vi.hoisted(() => ({ attachSignatureUrls: vi.fn((release: unknown) => release) }))
const dashboard = vi.hoisted(() => ({ listUpdates: vi.fn(), getUpdateById: vi.fn() }))
const updateAssets = vi.hoisted(() => ({ requireUpdateAsset: vi.fn() }))
const plugins = vi.hoisted(() => ({ listStorePlugins: vi.fn(), searchStorePlugins: vi.fn() }))
const storeAccess = vi.hoisted(() => ({ resolvePluginStoreAudience: vi.fn() }))
const images = vi.hoisted(() => ({ getImage: vi.fn() }))
const auth = vi.hoisted(() => ({ requireAuth: vi.fn() }))
const speech = vi.hoisted(() => ({ readSpeechCatalog: vi.fn() }))

vi.mock('../../server/utils/releasesStore', () => releases)
vi.mock('../../server/utils/releaseSignature', () => signatures)
vi.mock('../../server/utils/dashboardStore', () => dashboard)
vi.mock('../../server/utils/updateAssetStorage', () => updateAssets)
vi.mock('../../server/utils/pluginsStore', () => plugins)
vi.mock('../../server/utils/pluginStoreAccess', () => storeAccess)
vi.mock('../../server/utils/imageStorage', () => images)
vi.mock('../../server/utils/auth', () => auth)
vi.mock('../../server/utils/speechCatalogStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../server/utils/speechCatalogStore')>()),
  readSpeechCatalog: speech.readSpeechCatalog,
}))

type Handler = (event: H3Event) => Promise<unknown>

const handlers = {} as Record<'latest' | 'updates' | 'payload' | 'storeList' | 'storeSearch' | 'image' | 'speech', Handler>

beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  // Nitro auto-imports these into the Store routes.
  vi.stubGlobal('getQuery', (await import('h3')).getQuery)
  handlers.latest = (await import('../../server/api/releases/latest.get')).default as unknown as Handler
  handlers.updates = (await import('../../server/api/updates.get')).default as unknown as Handler
  handlers.payload = (await import('../../server/api/updates/[id]/payload.get')).default as unknown as Handler
  handlers.storeList = (await import('../../server/api/store/plugins.get')).default as unknown as Handler
  handlers.storeSearch = (await import('../../server/api/store/search.get')).default as unknown as Handler
  handlers.image = (await import('../../server/api/images/[key].get')).default as unknown as Handler
  handlers.speech = (await import('../../server/api/v1/speech/models.get')).default as unknown as Handler
})

function eventFor(path: string, options: { params?: Record<string, string>, headers?: Record<string, string> } = {}): H3Event {
  const headers: Record<string, string> = {}
  return {
    path,
    node: {
      req: { url: path, method: 'GET', headers: { host: 'tuff.test', ...options.headers } },
      res: { setHeader: (name: string, value: unknown) => { headers[name.toLowerCase()] = String(value) }, getHeader: (name: string) => headers[name.toLowerCase()] },
    },
    context: { params: options.params ?? {} },
  } as unknown as H3Event
}

let cache: ReturnType<typeof createFakeEdgeCache>

beforeEach(() => {
  vi.clearAllMocks()
  cache = createFakeEdgeCache()
  cache.install()
})

afterEach(() => {
  delete (globalThis as { caches?: unknown }).caches
})

async function json(result: unknown): Promise<unknown> {
  expect(result).toBeInstanceOf(Response)
  return await (result as Response).json()
}

function edgeStatus(result: unknown): string | null {
  return (result as Response).headers.get('x-edge-cache')
}

describe('GET /api/releases/latest', () => {
  const futureExp = () => Math.floor(Date.now() / 1000) + 15 * 60
  const release = () => ({
    tag: 'v2.4.0',
    assets: [{ platform: 'darwin', arch: 'arm64', downloadUrl: `/api/releases/v2.4.0/download/darwin/arm64?exp=${futureExp()}&sig=abc` }],
  })

  it('answers the second update check from the edge, without reading the release', async () => {
    releases.getLatestRelease.mockResolvedValue(release())

    const first = await handlers.latest(eventFor('/api/releases/latest?channel=RELEASE&platform=darwin'))
    expect(edgeStatus(first)).toBe('MISS')
    await flushAfterResponse()
    const second = await handlers.latest(eventFor('/api/releases/latest?platform=darwin&channel=RELEASE&ignored=1'))

    expect(edgeStatus(second)).toBe('HIT')
    expect(await json(second)).toEqual(await json(first))
    expect(releases.getLatestRelease).toHaveBeenCalledTimes(1)
  })

  it('keeps channels and platforms apart', async () => {
    releases.getLatestRelease.mockResolvedValue(release())

    await handlers.latest(eventFor('/api/releases/latest?channel=RELEASE&platform=darwin'))
    await flushAfterResponse()
    const beta = await handlers.latest(eventFor('/api/releases/latest?channel=BETA&platform=darwin'))
    const windows = await handlers.latest(eventFor('/api/releases/latest?channel=RELEASE&platform=win32'))

    expect(edgeStatus(beta)).toBe('MISS')
    expect(edgeStatus(windows)).toBe('MISS')
    expect(releases.getLatestRelease).toHaveBeenCalledTimes(3)
  })

  it('caches for at most a tenth of the life left in the signed URLs', async () => {
    const soon = Math.floor(Date.now() / 1000) + 100
    releases.getLatestRelease.mockResolvedValue({
      tag: 'v2.4.0',
      assets: [{ platform: 'darwin', arch: 'arm64', downloadUrl: `/api/releases/v2.4.0/download/darwin/arm64?exp=${soon}&sig=abc` }],
    })

    await handlers.latest(eventFor('/api/releases/latest'))
    await flushAfterResponse()

    const [copy] = [...cache.copies.values()]
    const ttlSeconds = (copy!.expiresAt - Date.now()) / 1000
    expect(ttlSeconds).toBeGreaterThan(5)
    expect(ttlSeconds).toBeLessThanOrEqual(10)
  })
})

describe('GET /api/updates', () => {
  it('serves the feed from the edge and still honours If-None-Match', async () => {
    dashboard.listUpdates.mockResolvedValue([{ id: 'u1', updatedAt: '2026-10-01T00:00:00.000Z', payloadSha256: null }])

    const first = await handlers.updates(eventFor('/api/updates?scope=app&channel=RELEASE'))
    const etag = (first as Response).headers.get('etag')
    expect(etag).toMatch(/^"[a-f0-9]{64}"$/)
    await flushAfterResponse()

    const second = await handlers.updates(eventFor('/api/updates?channel=RELEASE&scope=app'))
    expect(edgeStatus(second)).toBe('HIT')
    expect(await json(second)).toEqual({ updates: [{ id: 'u1', updatedAt: '2026-10-01T00:00:00.000Z', payloadSha256: null }] })

    const revalidated = await handlers.updates(eventFor('/api/updates?scope=app&channel=RELEASE', { headers: { 'if-none-match': etag! } }))
    expect((revalidated as Response).status).toBe(304)
    expect(dashboard.listUpdates).toHaveBeenCalledTimes(1)
  })
})

describe('GET /api/updates/:id/payload', () => {
  it('serves the payload bytes from the edge, without the update row or the R2 read', async () => {
    dashboard.getUpdateById.mockResolvedValue({ id: 'u1', payloadKey: 'payloads/u1', payloadSha256: 'f'.repeat(64), payloadContentType: 'application/json' })
    updateAssets.requireUpdateAsset.mockResolvedValue({ data: Buffer.from('{"v":1}'), contentType: 'application/octet-stream' })

    const first = await handlers.payload(eventFor('/api/updates/u1/payload', { params: { id: 'u1' } }))
    expect((first as Response).headers.get('content-type')).toBe('application/json')
    await flushAfterResponse()
    const second = await handlers.payload(eventFor('/api/updates/u1/payload', { params: { id: 'u1' } }))

    expect(edgeStatus(second)).toBe('HIT')
    expect(await (second as Response).text()).toBe('{"v":1}')
    expect((second as Response).headers.get('cache-control')).toBe('public, max-age=300')
    expect((second as Response).headers.get('etag')).toBe(`"${'f'.repeat(64)}"`)
    expect(dashboard.getUpdateById).toHaveBeenCalledTimes(1)
    expect(updateAssets.requireUpdateAsset).toHaveBeenCalledTimes(1)
  })

  it('answers a revalidation 304 before reading the payload, as it did before the cache', async () => {
    dashboard.getUpdateById.mockResolvedValue({ id: 'u1', payloadKey: 'payloads/u1', payloadSha256: 'f'.repeat(64) })

    const result = await handlers.payload(eventFor('/api/updates/u1/payload', {
      params: { id: 'u1' },
      headers: { 'if-none-match': `"${'f'.repeat(64)}"` },
    }))

    expect(result).toBe('')
    expect(updateAssets.requireUpdateAsset).not.toHaveBeenCalled()
  })
})

describe('GET /api/store/plugins and /api/store/search', () => {
  beforeEach(() => {
    storeAccess.resolvePluginStoreAudience.mockResolvedValue('public')
    plugins.listStorePlugins.mockResolvedValue({ plugins: [], total: 0, limit: 100, offset: 0 })
    plugins.searchStorePlugins.mockResolvedValue({ plugins: [], total: 0, limit: 50, offset: 0 })
  })

  it('shares the public listing', async () => {
    await handlers.storeList(eventFor('/api/store/plugins?compact=1'))
    await flushAfterResponse()
    const second = await handlers.storeList(eventFor('/api/store/plugins?compact=true&channel=RELEASE'))

    expect(edgeStatus(second)).toBe('HIT')
    expect(plugins.listStorePlugins).toHaveBeenCalledTimes(1)
  })

  it('never caches the beta audience, which needs a moderator', async () => {
    storeAccess.resolvePluginStoreAudience.mockResolvedValue('beta')

    await handlers.storeList(eventFor('/api/store/plugins?channel=BETA'))
    await flushAfterResponse()
    const second = await handlers.storeList(eventFor('/api/store/plugins?channel=BETA'))

    expect(second).not.toBeInstanceOf(Response)
    expect(storeAccess.resolvePluginStoreAudience).toHaveBeenCalledTimes(2)
    expect(plugins.listStorePlugins).toHaveBeenCalledTimes(2)
    expect(cache.puts).toEqual([])
  })

  it('shares a public search across keyword case, and keeps different searches apart', async () => {
    await handlers.storeSearch(eventFor('/api/store/search?q=Focus'))
    await flushAfterResponse()
    const sameSearch = await handlers.storeSearch(eventFor('/api/store/search?q=focus'))
    const otherSearch = await handlers.storeSearch(eventFor('/api/store/search?q=timer'))

    expect(edgeStatus(sameSearch)).toBe('HIT')
    expect(edgeStatus(otherSearch)).toBe('MISS')
    expect(plugins.searchStorePlugins).toHaveBeenCalledTimes(2)
  })
})

describe('GET /api/images/:key', () => {
  it('serves an icon from the edge with the headers it was stored with', async () => {
    images.getImage.mockResolvedValue({ data: Buffer.from('png-bytes'), contentType: 'image/png' })

    await handlers.image(eventFor('/api/images/abc.png', { params: { key: 'abc.png' } }))
    await flushAfterResponse()
    const second = await handlers.image(eventFor('/api/images/abc.png', { params: { key: 'abc.png' } })) as Response

    expect(second.headers.get('x-edge-cache')).toBe('HIT')
    expect(second.headers.get('content-type')).toBe('image/png')
    expect(second.headers.get('x-content-type-options')).toBe('nosniff')
    expect(second.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(Buffer.from(await second.arrayBuffer()).toString()).toBe('png-bytes')
    expect(images.getImage).toHaveBeenCalledTimes(1)
  })

  it('keeps an active document an attachment when it comes from the edge', async () => {
    images.getImage.mockResolvedValue({ data: Buffer.from('<svg/>'), contentType: 'image/svg+xml' })

    await handlers.image(eventFor('/api/images/old.svg', { params: { key: 'old.svg' } }))
    await flushAfterResponse()
    const second = await handlers.image(eventFor('/api/images/old.svg', { params: { key: 'old.svg' } })) as Response

    expect(second.headers.get('content-type')).toBe('application/octet-stream')
    expect(second.headers.get('content-disposition')).toMatch(/^attachment;/)
  })

  it('does not store a missing image', async () => {
    images.getImage.mockResolvedValue(null)

    await expect(handlers.image(eventFor('/api/images/gone.png', { params: { key: 'gone.png' } }))).rejects.toMatchObject({ statusCode: 404 })
    await flushAfterResponse()

    expect(cache.puts).toEqual([])
  })
})

describe('GET /api/v1/speech/models', () => {
  it('checks the caller on every request and reads the catalog once', async () => {
    const bytes = new TextEncoder().encode('{"schemaVersion":1}')
    speech.readSpeechCatalog.mockResolvedValue({ payload: {}, bytes, sha256: 'e'.repeat(64) })

    await handlers.speech(eventFor('/api/v1/speech/models'))
    await flushAfterResponse()
    const second = await handlers.speech(eventFor('/api/v1/speech/models')) as Response

    expect(second.headers.get('x-edge-cache')).toBe('HIT')
    expect(second.headers.get('x-content-sha256')).toBe('e'.repeat(64))
    expect(second.headers.get('cache-control')).toBe('private, max-age=300')
    expect(await second.text()).toBe('{"schemaVersion":1}')
    expect(auth.requireAuth).toHaveBeenCalledTimes(2)
    expect(speech.readSpeechCatalog).toHaveBeenCalledTimes(1)
  })

  it('does not serve the cached catalog to a caller who is not signed in', async () => {
    const bytes = new TextEncoder().encode('{}')
    speech.readSpeechCatalog.mockResolvedValue({ payload: {}, bytes, sha256: 'e'.repeat(64) })
    await handlers.speech(eventFor('/api/v1/speech/models'))
    await flushAfterResponse()

    auth.requireAuth.mockRejectedValueOnce(Object.assign(new Error('Unauthorized'), { statusCode: 401 }))
    await expect(handlers.speech(eventFor('/api/v1/speech/models'))).rejects.toMatchObject({ statusCode: 401 })
  })
})
