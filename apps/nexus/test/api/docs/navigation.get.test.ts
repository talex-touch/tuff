import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const contentMocks = vi.hoisted(() => ({
  queryCollectionNavigation: vi.fn(),
}))

vi.mock('@nuxt/content/server', () => contentMocks)

let handler: (event: any) => Promise<any>
let getQueryMock: ReturnType<typeof vi.fn>
let setHeaderMock: ReturnType<typeof vi.fn>
let warnSpy: ReturnType<typeof vi.spyOn>

beforeAll(async () => {
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
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

  it('keeps invalid locale requests backwards-compatible', async () => {
    getQueryMock.mockReturnValue({ locale: 'fr' })
    const navigation = [
      { title: 'Tabs', path: '/docs/dev/components/tabs.en' },
      { title: 'Tabs 标签页', path: '/docs/dev/components/tabs.zh' },
    ]
    contentMocks.queryCollectionNavigation.mockResolvedValue(navigation)

    await expect(handler({})).resolves.toEqual(navigation)
  })

  it('retries missing docs content table in development before returning empty navigation', async () => {
    process.env.NODE_ENV = 'development'
    const error = new Error('no such table: _content_docs')
    contentMocks.queryCollectionNavigation.mockRejectedValue(error)

    await expect(handler({})).resolves.toEqual([])
    expect(contentMocks.queryCollectionNavigation).toHaveBeenCalledTimes(3)
    expect(warnSpy).toHaveBeenCalledWith(
      '[api/docs/navigation] Nuxt Content docs table is not ready; returning an empty navigation tree in development.',
      error,
    )
    expect(setHeaderMock).toHaveBeenCalledWith({}, 'cache-control', 'public, max-age=300, stale-while-revalidate=3600')
  })

  it('throws missing docs content table errors in production', async () => {
    process.env.NODE_ENV = 'production'
    const error = new Error('no such table: _content_docs')
    contentMocks.queryCollectionNavigation.mockRejectedValue(error)

    await expect(handler({})).rejects.toThrow('no such table: _content_docs')
    expect(contentMocks.queryCollectionNavigation).toHaveBeenCalledTimes(1)
  })

  it('does not swallow unrelated development errors', async () => {
    process.env.NODE_ENV = 'development'
    const error = new Error('database is locked')
    contentMocks.queryCollectionNavigation.mockRejectedValue(error)

    await expect(handler({})).rejects.toThrow('database is locked')
    expect(contentMocks.queryCollectionNavigation).toHaveBeenCalledTimes(1)
  })
})
