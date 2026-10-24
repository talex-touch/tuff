import type * as H3 from 'h3'
import type * as ReleaseSignature from '../../../server/utils/releaseSignature'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeEdgeCache, flushAfterResponse } from '../../helpers/edge-cache'

const h3Mocks = vi.hoisted(() => ({
  getQuery: vi.fn(),
}))

const releasesStoreMocks = vi.hoisted(() => ({
  listReleases: vi.fn(),
}))

vi.mock('../../../server/utils/releasesStore', () => releasesStoreMocks)
vi.mock('../../../server/utils/releaseSignature', async (importOriginal) => ({
  ...(await importOriginal<typeof ReleaseSignature>()),
  attachSignatureUrls: (release: unknown) => release,
}))
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof H3>('h3')
  return {
    ...actual,
    getQuery: h3Mocks.getQuery,
  }
})

let handler: (event: any) => Promise<any>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  handler = (await import('../../../server/api/releases/index.get')).default as (event: any) => Promise<any>
})

function eventFor(path: string): H3.H3Event {
  const headers: Record<string, string> = {}
  return {
    path,
    node: {
      req: { url: path, method: 'GET', headers: { host: 'tuff.test' } },
      res: {
        setHeader: (name: string, value: unknown) => { headers[name.toLowerCase()] = String(value) },
        getHeader: (name: string) => headers[name.toLowerCase()],
      },
    },
    context: { params: {} },
  } as unknown as H3.H3Event
}

describe('/api/releases index pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    h3Mocks.getQuery.mockReturnValue({ channel: 'RELEASE', limit: '2' })
    releasesStoreMocks.listReleases.mockResolvedValue([
      { id: 'r3', tag: 'v3.0.0' },
      { id: 'r2', tag: 'v2.0.0' },
      { id: 'r1', tag: 'v1.0.0' },
    ])
  })

  it('returns an opaque next cursor and requests one lookahead row', async () => {
    const first = await handler({})

    expect(releasesStoreMocks.listReleases).toHaveBeenCalledWith(expect.anything(), {
      channel: 'RELEASE',
      status: 'published',
      includeAssets: false,
      limit: 3,
      offset: 0,
    })
    expect(first.releases.map((release: any) => release.tag)).toEqual(['v3.0.0', 'v2.0.0'])
    expect(first.pageInfo).toEqual({
      hasMore: true,
      nextCursor: expect.any(String),
    })

    h3Mocks.getQuery.mockReturnValue({
      channel: 'RELEASE',
      limit: '2',
      cursor: first.pageInfo.nextCursor,
    })
    releasesStoreMocks.listReleases.mockResolvedValue([{ id: 'r1', tag: 'v1.0.0' }])

    const second = await handler({})
    expect(releasesStoreMocks.listReleases).toHaveBeenLastCalledWith(expect.anything(), {
      channel: 'RELEASE',
      status: 'published',
      includeAssets: false,
      limit: 3,
      offset: 2,
    })
    expect(second.pageInfo).toEqual({ hasMore: false, nextCursor: null })
  })

  it('requests featured assets for the featured public history mode', async () => {
    h3Mocks.getQuery.mockReturnValue({ channel: 'RELEASE', assets: 'featured' })
    releasesStoreMocks.listReleases.mockResolvedValue([{ id: 'r3', tag: 'v3.0.0', assets: [{ filename: 'Tuff.dmg' }] }])

    const result = await handler({})

    expect(releasesStoreMocks.listReleases).toHaveBeenCalledWith(expect.anything(), {
      channel: 'RELEASE',
      status: 'published',
      includeAssets: true,
      assetMode: 'featured',
    })
    expect(result.releases).toEqual([{ id: 'r3', tag: 'v3.0.0', assets: [{ filename: 'Tuff.dmg' }] }])
  })

  it('reuses a normalized edge copy while bounding it by signed asset URL lifetime', async () => {
    const edgeCache = createFakeEdgeCache()
    edgeCache.install()
    try {
      const expiresAt = Math.floor(Date.now() / 1000) + 100
      const release = {
        id: 'r3',
        tag: 'v3.0.0',
        assets: [{ downloadUrl: `/api/releases/v3.0.0/download/darwin/arm64?exp=${expiresAt}&sig=abc` }],
      }
      h3Mocks.getQuery.mockReturnValue({ channel: 'RELEASE', assets: 'featured', limit: '1' })
      releasesStoreMocks.listReleases.mockResolvedValue([release])

      const first = await handler(eventFor('/api/releases?assets=featured&channel=RELEASE&limit=1'))
      expect(first).toBeInstanceOf(Response)
      expect((first as Response).headers.get('x-edge-cache')).toBe('MISS')
      await flushAfterResponse()

      h3Mocks.getQuery.mockReturnValue({ assets: 'featured', channel: 'RELEASE', limit: '1', ignored: '1' })
      const second = await handler(eventFor('/api/releases?limit=1&ignored=1&channel=RELEASE&assets=featured'))
      expect((second as Response).headers.get('x-edge-cache')).toBe('HIT')
      expect(await (second as Response).json()).toEqual(await (first as Response).clone().json())
      expect(releasesStoreMocks.listReleases).toHaveBeenCalledTimes(1)

      const [copy] = [...edgeCache.copies.values()]
      const ttlSeconds = (copy!.expiresAt - Date.now()) / 1000
      expect(ttlSeconds).toBeGreaterThan(5)
      expect(ttlSeconds).toBeLessThanOrEqual(10)
    }
    finally {
      delete (globalThis as { caches?: unknown }).caches
    }
  })

  it.each([{ cursor: 'not-a-cursor' }, { limit: '0' }, { limit: '51' }, { channel: 'DEV' }])(
    'rejects invalid public history query %#',
    async query => {
      h3Mocks.getQuery.mockReturnValue(query)

      await expect(handler({})).rejects.toMatchObject({ statusCode: 400 })
      expect(releasesStoreMocks.listReleases).not.toHaveBeenCalled()
    },
  )
})
