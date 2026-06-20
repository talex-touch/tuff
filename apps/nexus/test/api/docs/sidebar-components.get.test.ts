import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const contentMocks = vi.hoisted(() => ({
  queryCollection: vi.fn(),
}))

vi.mock('@nuxt/content/server', () => contentMocks)

let handler: (event: any) => Promise<any>
let getQueryMock: ReturnType<typeof vi.fn>

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
    where: () => ({
      all: async () => docs,
    }),
  }))
}

beforeAll(async () => {
  ;(globalThis as any).defineCachedEventHandler = (fn: any) => fn
  getQueryMock = vi.fn()
  ;(globalThis as any).getQuery = getQueryMock
  handler = (await import('../../../server/api/docs/sidebar-components.get')).default as (event: any) => Promise<any>
})

describe('/api/docs/sidebar-components', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getQueryMock.mockReturnValue({})
    mockDocsCollection()
  })

  it('returns all component docs when no locale is requested', async () => {
    await expect(handler({})).resolves.toHaveLength(3)
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
  })

  it('keeps invalid locale requests backwards-compatible', async () => {
    getQueryMock.mockReturnValue({ locale: 'fr' })

    await expect(handler({})).resolves.toHaveLength(3)
  })
})
