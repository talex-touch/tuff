import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const h3Mocks = vi.hoisted(() => ({
  getQuery: vi.fn(),
}))

const releasesStoreMocks = vi.hoisted(() => ({
  listReleases: vi.fn(),
}))

vi.mock('../../../server/utils/releasesStore', () => releasesStoreMocks)
vi.mock('../../../server/utils/releaseSignature', () => ({
  attachSignatureUrls: (release: unknown) => release,
}))
vi.mock('h3', async () => {
  const actual = await vi.importActual<typeof import('h3')>('h3')
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

  it.each([{ cursor: 'not-a-cursor' }, { limit: '0' }, { limit: '51' }, { channel: 'DEV' }])(
    'rejects invalid public history query %#',
    async query => {
      h3Mocks.getQuery.mockReturnValue(query)

      await expect(handler({})).rejects.toMatchObject({ statusCode: 400 })
      expect(releasesStoreMocks.listReleases).not.toHaveBeenCalled()
    },
  )
})
