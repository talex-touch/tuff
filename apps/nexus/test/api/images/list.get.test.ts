import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { IMAGE_LIST_DEFAULT_LIMIT, IMAGE_LIST_MAX_LIMIT, pageStorageKeys, parseImageListPageQuery } from '../../../server/utils/imageStorage'

/**
 * `GET /api/images/list` gained `limit` / `cursor` for the Asset Library's
 * "Load more" (requirement R5 of the 09-23 admin console plan). The paged form
 * passes both straight to R2's own listing; the parameterless form must answer
 * exactly as it did before paging existed.
 */

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }))

vi.mock('../../../server/utils/auth', () => ({ requireAdmin }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)

type Handler = (event: unknown) => Promise<unknown>

interface ListedPage {
  objects: Array<{ key: string }>
  truncated: boolean
  cursor?: string
}

function createBucket(page: ListedPage) {
  return {
    // `get` and `put` are what the binding resolver probes for a bucket.
    get: vi.fn(),
    put: vi.fn(),
    list: vi.fn(async () => ({ delimitedPrefixes: [], ...page })),
  }
}

function createEvent(path: string, bucket?: ReturnType<typeof createBucket>) {
  return {
    path,
    node: { req: { url: path, headers: {} } },
    context: bucket ? { cloudflare: { env: { IMAGES: bucket } } } : {},
  }
}

async function load(): Promise<Handler> {
  const module = await import('../../../server/api/images/list.get')
  return module.default as unknown as Handler
}

beforeEach(() => {
  requireAdmin.mockReset()
  requireAdmin.mockResolvedValue({ userId: 'admin_1' })
})

afterAll(() => {
  vi.unstubAllGlobals()
})

describe('GET /api/images/list', () => {
  it('answers a request without parameters exactly as before: every key and a total', async () => {
    const bucket = createBucket({ objects: [{ key: 'a.png' }, { key: 'b.zip' }], truncated: false })
    const body = await (await load())(createEvent('/api/images/list', bucket))

    // Called with no options at all: R2's own default page, as the old listing did.
    expect(bucket.list).toHaveBeenCalledTimes(1)
    expect(bucket.list).toHaveBeenCalledWith()
    expect(body).toStrictEqual({
      images: [
        { key: 'a.png', url: '/api/images/a.png' },
        { key: 'b.zip', url: '/api/images/b.zip' },
      ],
      total: 2,
    })
  })

  it('pages with the default limit when only a cursor is given', async () => {
    const bucket = createBucket({ objects: [{ key: 'c.png' }], truncated: false })
    const body = await (await load())(createEvent('/api/images/list?cursor=page-2', bucket))

    expect(bucket.list).toHaveBeenCalledWith({ limit: IMAGE_LIST_DEFAULT_LIMIT, cursor: 'page-2' })
    expect(body).toStrictEqual({
      images: [{ key: 'c.png', url: '/api/images/c.png' }],
      cursor: null,
      truncated: false,
    })
  })

  it('passes limit and cursor through and returns the next cursor while truncated', async () => {
    const bucket = createBucket({ objects: [{ key: 'd.png' }, { key: 'e.png' }], truncated: true, cursor: 'page-3' })
    const body = await (await load())(createEvent('/api/images/list?limit=2&cursor=page-2', bucket))

    expect(bucket.list).toHaveBeenCalledWith({ limit: 2, cursor: 'page-2' })
    expect(body).toStrictEqual({
      images: [
        { key: 'd.png', url: '/api/images/d.png' },
        { key: 'e.png', url: '/api/images/e.png' },
      ],
      cursor: 'page-3',
      truncated: true,
    })
  })

  it('asks for the first page without a cursor', async () => {
    const bucket = createBucket({ objects: [], truncated: false })
    await (await load())(createEvent('/api/images/list?limit=10', bucket))
    expect(bucket.list).toHaveBeenCalledWith({ limit: 10 })
  })

  it('caps the page size and falls back to the default for a value that is not a page size', async () => {
    const handler = await load()
    const capped = createBucket({ objects: [], truncated: false })
    await handler(createEvent('/api/images/list?limit=500', capped))
    expect(capped.list).toHaveBeenCalledWith({ limit: IMAGE_LIST_MAX_LIMIT })

    for (const limit of ['0', '-5', 'abc', '2.5', '']) {
      const bucket = createBucket({ objects: [], truncated: false })
      await handler(createEvent(`/api/images/list?limit=${limit}`, bucket))
      expect(bucket.list, `limit=${limit}`).toHaveBeenCalledWith({ limit: IMAGE_LIST_DEFAULT_LIMIT })
    }
  })

  it('lists nothing for a caller that is not an administrator', async () => {
    requireAdmin.mockRejectedValue(Object.assign(new Error('Admin permission required.'), { statusCode: 403 }))
    const bucket = createBucket({ objects: [{ key: 'a.png' }], truncated: false })
    await expect((await load())(createEvent('/api/images/list?limit=10', bucket))).rejects.toMatchObject({ statusCode: 403 })
    expect(bucket.list).not.toHaveBeenCalled()
  })
})

describe('image list paging rules', () => {
  it('reads the paging parameters only when one is present', () => {
    expect(parseImageListPageQuery({})).toBeNull()
    expect(parseImageListPageQuery({ other: '1' })).toBeNull()
    expect(parseImageListPageQuery({ limit: '30' })).toEqual({ limit: 30, cursor: null })
    expect(parseImageListPageQuery({ cursor: ' abc ' })).toEqual({ limit: IMAGE_LIST_DEFAULT_LIMIT, cursor: 'abc' })
    expect(parseImageListPageQuery({ limit: ['5', '9'], cursor: '' })).toEqual({ limit: 5, cursor: null })
  })

  it('pages the in-memory store in key order, continuing after the cursor key', () => {
    const keys = ['c.png', 'a.png', 'e.png', 'b.png', 'd.png']

    const first = pageStorageKeys(keys, { limit: 2, cursor: null })
    expect(first).toEqual({ keys: ['a.png', 'b.png'], cursor: 'b.png', truncated: true })

    const second = pageStorageKeys(keys, { limit: 2, cursor: first.cursor })
    expect(second).toEqual({ keys: ['c.png', 'd.png'], cursor: 'd.png', truncated: true })

    const last = pageStorageKeys(keys, { limit: 2, cursor: second.cursor })
    expect(last).toEqual({ keys: ['e.png'], cursor: null, truncated: false })
  })

  it('keeps the next page right when the cursor key was deleted in between', () => {
    // An offset cursor would skip `c.png` here; "after this key" does not.
    const remaining = ['a.png', 'c.png', 'd.png']
    expect(pageStorageKeys(remaining, { limit: 2, cursor: 'b.png' })).toEqual({
      keys: ['c.png', 'd.png'],
      cursor: null,
      truncated: false,
    })
  })

  it('ends exactly on a full last page', () => {
    expect(pageStorageKeys(['a', 'b'], { limit: 2, cursor: null })).toEqual({ keys: ['a', 'b'], cursor: null, truncated: false })
    expect(pageStorageKeys([], { limit: 2, cursor: null })).toEqual({ keys: [], cursor: null, truncated: false })
    expect(pageStorageKeys(['a', 'b'], { limit: 2, cursor: 'z' })).toEqual({ keys: [], cursor: null, truncated: false })
  })
})
