import type { R2Bucket } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { catalogArtifactPayloadObjectKey } from '../../../../server/utils/catalogArtifactProjection'
import { stageCatalogArtifact } from '../../../../server/utils/catalogArtifactStorage'
import { resolveObjectBucket, resolveObjectBucketBinding } from '../../../../server/utils/cloudflare'
// Type-only view of the same module, for the partial-mock factory below.
import type * as NexusCloudflare from '../../../../server/utils/cloudflare'

type RouteHandler = (event: H3Event) => Promise<unknown>

const h3Mocks = vi.hoisted(() => ({
  getRouterParam: vi.fn(),
  send: vi.fn(),
  setResponseHeader: vi.fn(),
}))

/**
 * Cloudflare Pages always injects `ASSETS` for the project's static assets, and there it is a
 * Fetcher, not a bucket. These tests therefore hand the resolver Pages-shaped bindings through
 * the request context -- the very path the runtime uses -- and only override
 * `readCloudflareBindings` so consumers that call it directly (the governance store's D1 lookup)
 * observe the same bindings.
 */
vi.mock('../../../../server/utils/cloudflare', async (importOriginal) => ({
  ...(await importOriginal<typeof NexusCloudflare>()),
  // `context.cloudflare.env` is where Pages puts the bindings, so this stays a faithful stand-in
  // rather than a divergent source of truth.
  readCloudflareBindings: (event: H3Event) => event.context.cloudflare?.env,
}))

vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
  return {
    ...actual,
    getRouterParam: h3Mocks.getRouterParam,
    send: h3Mocks.send,
    setResponseHeader: h3Mocks.setResponseHeader,
  }
})

let payloadHandler: RouteHandler

beforeAll(async () => {
  ;(globalThis as { defineEventHandler?: (fn: unknown) => unknown }).defineEventHandler = fn => fn
  // The route module calls `defineEventHandler` at module scope, so it can only be loaded after
  // that global exists -- a static import would evaluate the route during collection.
  payloadHandler = (
    await import('../../../../server/api/v1/catalogs/[type]/[packId]/[version]/[filename].get')
  ).default as RouteHandler
})

function sha256Hex(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}

const PAYLOAD_IDENTITY = { packId: 'official.voice-provider', version: '2026.09.13' }

function payloadObjectKey(sha256: string): string {
  return catalogArtifactPayloadObjectKey({ type: 'voice-provider', ...PAYLOAD_IDENTITY, sha256 })
}

function payloadRoute(sha256: string): { path: string, params: Record<string, string> } {
  const filename = `${sha256}.json`
  const path = `/api/v1/catalogs/voice-provider/${PAYLOAD_IDENTITY.packId}/${PAYLOAD_IDENTITY.version}/${filename}`
  return { path, params: { type: 'voice-provider', ...PAYLOAD_IDENTITY, filename } }
}

function makeEvent(
  path: string,
  params: Record<string, string>,
  bindings?: TuffCloudflareBindings,
): H3Event {
  return {
    path,
    node: { req: { url: path, headers: { 'user-agent': 'vitest' } } },
    context: {
      params,
      ...(bindings ? { cloudflare: { env: bindings } } : {}),
    },
  } as unknown as H3Event
}

function selectParams(params: Record<string, string>): void {
  h3Mocks.getRouterParam.mockImplementation((_event: unknown, name: string) => params[name])
}

interface FakeStoredObject {
  data: Buffer
  contentType: string
}

/**
 * Hand-written stand-in for the slice of the R2 binding API the storage layer touches. Only a
 * bucket can hold these bytes, so a store that really keeps them is what makes "the route served
 * it from R2" falsifiable -- the in-memory mirror never sees them.
 */
class FakeR2Bucket {
  readonly objects = new Map<string, FakeStoredObject>()

  async put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: { httpMetadata?: { contentType?: string } },
  ): Promise<void> {
    this.objects.set(key, {
      data: Buffer.from(value instanceof ArrayBuffer ? new Uint8Array(value) : value),
      contentType: options?.httpMetadata?.contentType ?? 'application/octet-stream',
    })
  }

  async get(key: string): Promise<{
    arrayBuffer: () => Promise<ArrayBuffer>
    httpMetadata: { contentType: string }
    size: number
  } | null> {
    const object = this.objects.get(key)
    if (!object)
      return null

    const bytes = Uint8Array.from(object.data)
    return {
      arrayBuffer: async () => bytes.buffer,
      httpMetadata: { contentType: object.contentType },
      size: bytes.byteLength,
    }
  }
}

function asBucket(bucket: FakeR2Bucket): R2Bucket {
  return bucket as unknown as R2Bucket
}

/** The `ASSETS` shape Pages injects for static assets: a fetcher, and nothing else. */
function createStaticAssetFetcher() {
  const fetch = vi.fn(async () => new Response('static-asset-response'))
  const binding: NonNullable<TuffCloudflareBindings['ASSETS']> = { fetch }
  return { fetch, binding }
}

async function captureRejection(run: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await run
  }
  catch (error) {
    if (error && typeof error === 'object')
      return error as Record<string, unknown>
    throw error
  }
  throw new Error('expected the route handler to reject')
}

describe('object bucket resolution over Pages-shaped bindings', () => {
  const r2 = asBucket(new FakeR2Bucket())
  const assetsBucket = asBucket(new FakeR2Bucket())
  const packages = asBucket(new FakeR2Bucket())
  const pluginPackages = asBucket(new FakeR2Bucket())
  const { binding: staticAssets } = createStaticAssetFetcher()

  interface ResolutionCase {
    label: string
    bindings: TuffCloudflareBindings
    preferred?: readonly (keyof TuffCloudflareBindings)[]
    expectedBinding: keyof TuffCloudflareBindings
    expectedBucket: R2Bucket
  }

  it('binds preferred names first, then R2, then ASSETS', () => {
    const cases: ResolutionCase[] = [
      {
        label: 'the first preferred name the deployment binds',
        bindings: { ASSETS: staticAssets, R2: r2, PACKAGES: packages, PLUGIN_PACKAGES: pluginPackages },
        preferred: ['PLUGIN_PACKAGES', 'PACKAGES'],
        expectedBinding: 'PLUGIN_PACKAGES',
        expectedBucket: pluginPackages,
      },
      {
        label: 'a later preferred name when the first one is unbound',
        bindings: { ASSETS: staticAssets, R2: r2, PACKAGES: packages },
        preferred: ['PLUGIN_PACKAGES', 'PACKAGES'],
        expectedBinding: 'PACKAGES',
        expectedBucket: packages,
      },
      {
        // The production bug: Pages binds ASSETS, so the static-asset fetcher was chosen ahead of
        // the bucket that actually holds the objects.
        label: 'R2 ahead of the ASSETS static-asset fetcher',
        bindings: { ASSETS: staticAssets, R2: r2 },
        preferred: ['PLUGIN_PACKAGES'],
        expectedBinding: 'R2',
        expectedBucket: r2,
      },
      {
        label: 'R2 when no preferred name is bound',
        bindings: { ASSETS: staticAssets, R2: r2 },
        expectedBinding: 'R2',
        expectedBucket: r2,
      },
      {
        label: 'ASSETS only when a bucket is really bound under that name',
        bindings: { ASSETS: assetsBucket },
        expectedBinding: 'ASSETS',
        expectedBucket: assetsBucket,
      },
    ]

    for (const row of cases) {
      const event = makeEvent('/api/v1/catalogs/voice-provider/latest', {}, row.bindings)
      const resolved = resolveObjectBucketBinding(event, row.preferred)

      expect(resolved?.bindingName, row.label).toBe(row.expectedBinding)
      expect(resolved?.bucket, row.label).toBe(row.expectedBucket)
      expect(resolveObjectBucket(event, row.preferred), row.label).toBe(row.expectedBucket)
    }
  })

  it('resolves to null rather than reaching for a binding that is not a bucket', () => {
    const fetcherOnly = makeEvent('/api/v1/catalogs/voice-provider/latest', {}, {
      ASSETS: staticAssets,
    })
    expect(resolveObjectBucketBinding(fetcherOnly)).toBeNull()
    expect(resolveObjectBucket(fetcherOnly)).toBeNull()

    const noBindings = makeEvent('/api/v1/catalogs/voice-provider/latest', {})
    expect(resolveObjectBucketBinding(noBindings)).toBeNull()
    expect(resolveObjectBucket(noBindings)).toBeNull()

    expect(resolveObjectBucketBinding(null, ['PLUGIN_PACKAGES'])).toBeNull()
  })
})

describe('catalog artifact route over Pages-shaped bindings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h3Mocks.send.mockImplementation(async (_event: unknown, body: unknown) => body)
  })

  it('serves the bytes an R2-only object holds while ASSETS is a static-asset fetcher', async () => {
    const bytes = Buffer.from('{"providers":["voice-provider-r2-only"]}')
    const sha256 = sha256Hex(bytes)
    const bucket = new FakeR2Bucket()
    await bucket.put(payloadObjectKey(sha256), bytes, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
    })
    const { fetch: assetsFetch, binding: assetsFetcher } = createStaticAssetFetcher()
    const route = payloadRoute(sha256)
    const event = makeEvent(route.path, route.params, {
      ASSETS: assetsFetcher,
      R2: asBucket(bucket),
    })
    selectParams(route.params)

    const result = await payloadHandler(event)

    expect(result).toEqual(bytes)
    expect(sha256Hex(result as Buffer)).toBe(sha256)
    expect(h3Mocks.setResponseHeader).toHaveBeenCalledWith(
      event,
      'Content-Type',
      'application/json; charset=utf-8',
    )
    expect(h3Mocks.setResponseHeader).toHaveBeenCalledWith(event, 'Content-Length', bytes.byteLength)
    expect(h3Mocks.setResponseHeader).toHaveBeenCalledWith(event, 'X-Content-SHA256', sha256)
    expect(h3Mocks.setResponseHeader).toHaveBeenCalledWith(
      event,
      'Cache-Control',
      'public, max-age=31536000, immutable',
    )
    expect(assetsFetch).not.toHaveBeenCalled()
  })

  it('stages artifacts through the bound R2 bucket, never through the static-asset fetcher', async () => {
    const bytes = Buffer.from('{"providers":["staged-through-r2"]}')
    const sha256 = sha256Hex(bytes)
    const key = payloadObjectKey(sha256)
    const { fetch: assetsFetch, binding: assetsFetcher } = createStaticAssetFetcher()
    const bucket = new FakeR2Bucket()
    const route = payloadRoute(sha256)
    const event = makeEvent(route.path, route.params, {
      ASSETS: assetsFetcher,
      R2: asBucket(bucket),
    })
    selectParams(route.params)

    await stageCatalogArtifact(event, key, bytes)

    expect(bucket.objects.get(key)?.data).toEqual(bytes)
    expect(assetsFetch).not.toHaveBeenCalled()
  })

  it('answers 404, not a TypeError, when R2 holds no object for the requested key', async () => {
    const bytes = Buffer.from('{"providers":["never-staged"]}')
    const sha256 = sha256Hex(bytes)
    const { fetch: assetsFetch, binding: assetsFetcher } = createStaticAssetFetcher()
    const route = payloadRoute(sha256)
    const event = makeEvent(route.path, route.params, {
      ASSETS: assetsFetcher,
      R2: asBucket(new FakeR2Bucket()),
    })
    selectParams(route.params)

    const error = await captureRejection(payloadHandler(event))

    expect(error).toMatchObject({ statusCode: 404 })
    expect(error).not.toBeInstanceOf(TypeError)
    expect(h3Mocks.setResponseHeader).not.toHaveBeenCalled()
    expect(assetsFetch).not.toHaveBeenCalled()
  })

  it('answers 404, not a TypeError, when the deployment binds only the static-asset fetcher', async () => {
    const bytes = Buffer.from('{"providers":["no-bucket-bound"]}')
    const sha256 = sha256Hex(bytes)
    const { fetch: assetsFetch, binding: assetsFetcher } = createStaticAssetFetcher()
    const route = payloadRoute(sha256)
    const event = makeEvent(route.path, route.params, { ASSETS: assetsFetcher })
    selectParams(route.params)

    const error = await captureRejection(payloadHandler(event))

    expect(error).toMatchObject({ statusCode: 404 })
    expect(error).not.toBeInstanceOf(TypeError)
    expect(h3Mocks.setResponseHeader).not.toHaveBeenCalled()
    expect(assetsFetch).not.toHaveBeenCalled()
  })

  it('serves objects from ASSETS when a bucket is really bound under that name', async () => {
    const bytes = Buffer.from('{"providers":["assets-bound-bucket"]}')
    const sha256 = sha256Hex(bytes)
    const bucket = new FakeR2Bucket()
    await bucket.put(payloadObjectKey(sha256), bytes, {
      httpMetadata: { contentType: 'application/json; charset=utf-8' },
    })
    const route = payloadRoute(sha256)
    const event = makeEvent(route.path, route.params, { ASSETS: asBucket(bucket) })
    selectParams(route.params)

    const result = await payloadHandler(event)

    expect(result).toEqual(bytes)
    expect(h3Mocks.setResponseHeader).toHaveBeenCalledWith(event, 'X-Content-SHA256', sha256)
  })
})
