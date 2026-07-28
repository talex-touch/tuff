import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { docsContentAvailability } from '../../../server/utils/docsContentCache'

const contentMocks = vi.hoisted(() => ({
  queryCollectionNavigation: vi.fn(),
}))

vi.mock('@nuxt/content/server', () => contentMocks)

let handler: (event: any) => Promise<any>
let cachedOptions: any
let getQueryMock: ReturnType<typeof vi.fn>
let setHeaderMock: ReturnType<typeof vi.fn>
let warnSpy: ReturnType<typeof vi.spyOn>
const cacheStore = new Map<string, unknown>()

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  // Mirrors nitro: a rejected call stores nothing, so retries hit the source again.
  ;(globalThis as any).defineCachedFunction = (fn: any, options: any) => {
    cachedOptions = options
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
  getQueryMock = vi.fn()
  setHeaderMock = vi.fn()
  ;(globalThis as any).getQuery = getQueryMock
  ;(globalThis as any).setHeader = setHeaderMock
  handler = (await import('../../../server/api/docs/navigation.get')).default as (event: any) => Promise<any>
})

describe('/api/docs/navigation', () => {
  const previousNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    vi.clearAllMocks()
    cacheStore.clear()
    docsContentAvailability.reset()
    getQueryMock.mockReturnValue({})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env.NODE_ENV = previousNodeEnv
  })

  afterEach(() => {
    warnSpy.mockRestore()
    process.env.NODE_ENV = previousNodeEnv
  })

  it('returns docs navigation and cache headers', async () => {
    const navigation = [{ title: 'Docs', path: '/docs' }]
    contentMocks.queryCollectionNavigation.mockResolvedValue(navigation)

    await expect(handler({})).resolves.toEqual(navigation)
    expect(contentMocks.queryCollectionNavigation).toHaveBeenCalledTimes(1)
    expect(setHeaderMock).toHaveBeenCalledWith({}, 'cache-control', 'public, max-age=300, stale-while-revalidate=3600')
  })

  it('caches docs navigation by locale while preserving all-locale compatibility', async () => {
    expect(cachedOptions).toMatchObject({
      maxAge: 300,
      staleMaxAge: 3600,
      name: 'docs-navigation',
    })
    expect(cachedOptions.getKey({}, null, null)).toBe('locale:all:scope:all')
    expect(cachedOptions.getKey({}, 'zh', null)).toBe('locale:zh:scope:all')
    expect(cachedOptions.getKey({}, 'en', 'components')).toBe('locale:en:scope:components')
  })

  it('serves a resolved navigation tree from cache', async () => {
    const navigation = [{ title: 'Docs', path: '/docs' }]
    contentMocks.queryCollectionNavigation.mockResolvedValue(navigation)

    await expect(handler({})).resolves.toEqual(navigation)
    await expect(handler({})).resolves.toEqual(navigation)

    expect(contentMocks.queryCollectionNavigation).toHaveBeenCalledTimes(1)
  })

  it('never caches an empty navigation tree', async () => {
    contentMocks.queryCollectionNavigation.mockResolvedValue([])

    await expect(handler({})).resolves.toEqual([])
    await expect(handler({})).resolves.toEqual([])

    expect(contentMocks.queryCollectionNavigation).toHaveBeenCalledTimes(2)
    expect(setHeaderMock).not.toHaveBeenCalled()
  })

  it('keeps only requested locale leaf docs while preserving directory nodes', async () => {
    getQueryMock.mockReturnValue({ locale: 'en' })
    contentMocks.queryCollectionNavigation.mockResolvedValue([
      {
        title: 'Docs',
        path: '/docs',
        children: [
          {
            title: 'Dev',
            path: '/docs/dev',
            children: [
              { title: 'Tabs', path: '/docs/dev/components/tabs.en' },
              { title: 'Tabs 标签页', path: '/docs/dev/components/tabs.zh' },
            ],
          },
        ],
      },
    ])

    await expect(handler({})).resolves.toEqual([
      {
        title: 'Docs',
        path: '/docs',
        children: [
          {
            title: 'Dev',
            path: '/docs/dev',
            children: [
              { title: 'Tabs', path: '/docs/dev/components/tabs.en' },
            ],
          },
        ],
      },
    ])
  })

  it('uses path locale and scope for prerenderable static variants', async () => {
    contentMocks.queryCollectionNavigation.mockResolvedValue([
      {
        title: 'Docs',
        path: '/docs',
        children: [
          {
            title: 'Dev',
            path: '/docs/dev',
            children: [
              {
                title: 'Components',
                path: '/docs/dev/components',
                children: [
                  { title: 'Tabs', path: '/docs/dev/components/tabs.en' },
                  { title: 'Tabs 标签页', path: '/docs/dev/components/tabs.zh' },
                ],
              },
            ],
          },
        ],
      },
    ])

    await expect(handler({ context: { params: { locale: 'en', scope: 'components' } } })).resolves.toEqual([
      {
        title: 'Components',
        path: '/docs/dev/components',
        children: [
          { title: 'Tabs', path: '/docs/dev/components/tabs.en' },
        ],
      },
    ])
  })

  it('keeps invalid locale requests backwards-compatible', async () => {
    getQueryMock.mockReturnValue({ locale: 'fr' })
    const navigation = [
      { title: 'Tabs', path: '/docs/dev/components/tabs.en' },
      { title: 'Tabs 标签页', path: '/docs/dev/components/tabs.zh' },
    ]
    contentMocks.queryCollectionNavigation.mockResolvedValue(navigation)

    await expect(handler({})).resolves.toEqual(navigation)
  })

  it('retries a missing docs content table in development before reporting it unavailable', async () => {
    process.env.NODE_ENV = 'development'
    const error = new Error('no such table: _content_docs')
    contentMocks.queryCollectionNavigation.mockRejectedValue(error)

    await expect(handler({})).rejects.toMatchObject({ statusCode: 503 })
    expect(contentMocks.queryCollectionNavigation).toHaveBeenCalledTimes(3)
    expect(warnSpy).toHaveBeenCalledWith(
      '[docs-content] Nuxt Content could not query the docs collection.',
      error,
    )
    expect(setHeaderMock).not.toHaveBeenCalled()
  })

  it('reports a missing docs content table as unavailable in production', async () => {
    process.env.NODE_ENV = 'production'
    const error = new Error('no such table: _content_docs')
    contentMocks.queryCollectionNavigation.mockRejectedValue(error)

    await expect(handler({})).rejects.toMatchObject({ statusCode: 503 })
    expect(contentMocks.queryCollectionNavigation).toHaveBeenCalledTimes(1)
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('does not swallow unrelated development errors', async () => {
    process.env.NODE_ENV = 'development'
    const error = new Error('database is locked')
    contentMocks.queryCollectionNavigation.mockRejectedValue(error)

    await expect(handler({})).rejects.toThrow('database is locked')
    expect(contentMocks.queryCollectionNavigation).toHaveBeenCalledTimes(1)
  })
})
