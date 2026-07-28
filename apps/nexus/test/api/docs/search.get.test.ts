import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { docsContentAvailability } from '../../../server/utils/docsContentCache'

const contentMocks = vi.hoisted(() => ({
  queryCollection: vi.fn(),
}))

vi.mock('@nuxt/content/server', () => contentMocks)

let handler: (event: any) => Promise<any>
let handlerOptions: any
let getQueryMock: ReturnType<typeof vi.fn>
let setHeaderMock: ReturnType<typeof vi.fn>
let whereMock: ReturnType<typeof vi.fn>
let selectMock: ReturnType<typeof vi.fn>
let allMock: ReturnType<typeof vi.fn>
const cacheStore = new Map<string, unknown>()

const docs = [
  {
    path: '/docs/dev/components/button.en',
    title: 'Button',
    description: 'Primary and secondary actions.',
    meta: JSON.stringify({ tags: ['action', 'control'] }),
  },
  {
    path: '/docs/dev/components/button.zh',
    title: '按钮',
    description: '',
    meta: { description: '主要和次要操作。', tags: ['操作', '控件'] },
  },
  {
    path: '/docs/guide/start.en',
    title: 'Getting Started',
    description: 'Start using Tuff.',
    meta: null,
  },
]

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  // Mirrors nitro: a value is stored only after the wrapped function resolves.
  ;(globalThis as any).defineCachedFunction = (fn: any, options: any) => {
    handlerOptions = options
    return async (...args: any[]) => {
      const key = options.getKey(...args)
      if (cacheStore.has(key))
        return cacheStore.get(key)
      const result = await fn(...args)
      cacheStore.set(key, result)
      return result
    }
  }
  ;(globalThis as any).createError = (input: any) =>
    Object.assign(new Error(input.message ?? input.statusMessage), input)
  setHeaderMock = vi.fn()
  getQueryMock = vi.fn()
  ;(globalThis as any).getQuery = getQueryMock
  ;(globalThis as any).setHeader = setHeaderMock
  handler = (await import('../../../server/api/docs/search.get')).default as (event: any) => Promise<any>
})

describe('/api/docs/search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cacheStore.clear()
    docsContentAvailability.reset()
    getQueryMock.mockReturnValue({})
    allMock = vi.fn().mockResolvedValue(docs)
    selectMock = vi.fn().mockReturnValue({ all: allMock })
    whereMock = vi.fn().mockReturnValue({ select: selectMock })
    contentMocks.queryCollection.mockReturnValue({ where: whereMock })
  })

  it('returns a lightweight all-locale metadata index for prerendering', async () => {
    const response = await handler({})

    expect(contentMocks.queryCollection).toHaveBeenCalledWith({}, 'docs')
    expect(whereMock).toHaveBeenCalledWith('path', 'LIKE', '/docs/%')
    expect(selectMock).toHaveBeenCalledWith('path', 'title', 'description', 'meta')
    expect(response.items).toHaveLength(3)
    expect(response.items).toEqual(expect.arrayContaining([
      {
        id: '/docs/dev/components/button.en',
        path: '/docs/dev/components/button',
        locale: 'en',
        title: 'Button',
        description: 'Primary and secondary actions.',
        tags: ['action', 'control'],
      },
      {
        id: '/docs/dev/components/button.zh',
        path: '/docs/dev/components/button',
        locale: 'zh',
        title: '按钮',
        description: '主要和次要操作。',
        tags: ['操作', '控件'],
      },
    ]))
    expect(setHeaderMock).toHaveBeenCalledWith({}, 'cache-control', 'public, max-age=300, stale-while-revalidate=3600')
  })

  it('uses locale-aware cache keys while preserving the all-locale endpoint', () => {
    expect(handlerOptions).toMatchObject({
      maxAge: 300,
      staleMaxAge: 3600,
      name: 'docs-search',
    })
    expect(handlerOptions.getKey({}, null)).toBe('locale:all')
    expect(handlerOptions.getKey({}, 'zh')).toBe('locale:zh')
  })

  it('never caches an empty search index', async () => {
    allMock.mockResolvedValue([])

    await expect(handler({})).resolves.toEqual({ items: [] })
    await expect(handler({})).resolves.toEqual({ items: [] })

    expect(allMock).toHaveBeenCalledTimes(2)
    expect(setHeaderMock).not.toHaveBeenCalled()
  })

  it('reports an unreachable content database as 503', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    allMock.mockRejectedValue(new Error('no such table: _content_docs'))

    await expect(handler({})).rejects.toMatchObject({ statusCode: 503 })
    expect(docsContentAvailability.isDegraded()).toBe(true)
    expect(setHeaderMock).not.toHaveBeenCalled()
    warnSpy.mockRestore()
  })

  it('uses path locale for prerenderable static variants', async () => {
    const response = await handler({ context: { params: { locale: 'en' } } })

    expect(whereMock).toHaveBeenCalledWith('path', 'LIKE', '/docs/%.en')
    expect(response.items).toHaveLength(2)
    expect(response.items.every((item: any) => item.locale === 'en')).toBe(true)
  })
})
