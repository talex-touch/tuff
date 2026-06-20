import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const contentMocks = vi.hoisted(() => ({
  queryCollection: vi.fn(),
}))

vi.mock('@nuxt/content/server', () => contentMocks)

let handler: (event: any) => Promise<any>
let handlerOptions: any
let getQueryMock: ReturnType<typeof vi.fn>
let setHeaderMock: ReturnType<typeof vi.fn>
let lastPathPattern = ''

const docs = [
  {
    title: 'Tabs',
    path: '/docs/dev/components/tabs.en',
    category: 'Basic',
    syncStatus: '已迁移',
  },
  {
    title: 'Tabs 标签页',
    path: '/docs/dev/components/tabs.zh',
    meta: JSON.stringify({ category: 'Basic', syncStatus: '已确认', verified: true }),
  },
  {
    title: 'Toast',
    path: '/docs/dev/components/toast.en',
    meta: { category: 'Feedback', syncStatus: 'in_progress' },
  },
]

function mockDocsCollection() {
  contentMocks.queryCollection.mockImplementation(() => ({
    where: (_field: string, _operator: string, pattern: string) => ({
      all: async () => {
        lastPathPattern = pattern
        if (pattern.endsWith('%.en'))
          return docs.filter(item => item.path.endsWith('.en'))
        if (pattern.endsWith('%.zh'))
          return docs.filter(item => item.path.endsWith('.zh'))
        return docs
      },
    }),
  }))
}

beforeAll(async () => {
  ;(globalThis as any).defineCachedEventHandler = (fn: any, options: any) => {
    handlerOptions = options
    return fn
  }
  getQueryMock = vi.fn()
  setHeaderMock = vi.fn()
  ;(globalThis as any).getQuery = getQueryMock
  ;(globalThis as any).setHeader = setHeaderMock
  handler = (await import('../../../server/api/docs/sidebar-components.get')).default as (event: any) => Promise<any>
})

describe('/api/docs/sidebar-components', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lastPathPattern = ''
    getQueryMock.mockReturnValue({})
    mockDocsCollection()
  })

  it('returns all component docs when no locale is requested', async () => {
    await expect(handler({})).resolves.toHaveLength(3)
    expect(lastPathPattern).toBe('/docs/dev/components/%')
  })

  it('returns only requested locale component docs', async () => {
    getQueryMock.mockReturnValue({ locale: 'en' })

    const rows = await handler({})

    expect(rows).toHaveLength(2)
    expect(rows.every((row: any) => row.locale === 'en')).toBe(true)
    expect(rows.map((row: any) => row.normalizedPath)).toEqual([
      '/docs/dev/components/tabs',
      '/docs/dev/components/toast',
    ])
    expect(lastPathPattern).toBe('/docs/dev/components/%.en')
  })

  it('keeps invalid locale requests backwards-compatible', async () => {
    getQueryMock.mockReturnValue({ locale: 'fr' })

    await expect(handler({})).resolves.toHaveLength(3)
    expect(lastPathPattern).toBe('/docs/dev/components/%')
  })

  it('sets cache headers and uses locale-aware cached handler keys', async () => {
    getQueryMock.mockReturnValue({ locale: 'zh' })

    await handler({})

    expect(setHeaderMock).toHaveBeenCalledWith({}, 'cache-control', 'public, max-age=300, stale-while-revalidate=3600')
    expect(handlerOptions).toMatchObject({
      maxAge: 300,
      staleMaxAge: 3600,
      name: 'docs-sidebar-components',
    })
    expect(handlerOptions.getKey({})).toBe('locale:zh')
    getQueryMock.mockReturnValue({})
    expect(handlerOptions.getKey({})).toBe('locale:all')
  })
})
