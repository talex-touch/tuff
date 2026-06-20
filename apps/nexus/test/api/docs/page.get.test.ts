import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const contentMocks = vi.hoisted(() => ({
  queryCollection: vi.fn(),
}))

const fsMocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  stat: vi.fn(),
}))

const mdcMocks = vi.hoisted(() => ({
  parseMarkdown: vi.fn(),
}))

vi.mock('@nuxt/content/server', () => contentMocks)
vi.mock('node:fs/promises', () => fsMocks)
vi.mock('@nuxtjs/mdc/runtime', () => mdcMocks)

let handler: (event: any) => Promise<any>
let cachedOptions: any
let getQueryMock: ReturnType<typeof vi.fn>
let setHeaderMock: ReturnType<typeof vi.fn>
let warnSpy: ReturnType<typeof vi.spyOn>
let requestedPaths: string[]

const previousNodeEnv = process.env.NODE_ENV

function mockDocsCollection(results: Map<string, unknown>) {
  requestedPaths = []
  contentMocks.queryCollection.mockImplementation(() => ({
    path: (path: string) => {
      requestedPaths.push(path)
      return {
        first: async () => {
          const result = results.get(path)
          if (result instanceof Error)
            throw result
          return result ?? null
        },
      }
    },
  }))
}

async function importHandler() {
  vi.resetModules()
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  ;(globalThis as any).defineCachedEventHandler = (fn: any, options: any) => {
    cachedOptions = options
    return fn
  }
  getQueryMock = vi.fn()
  setHeaderMock = vi.fn()
  ;(globalThis as any).getQuery = getQueryMock
  ;(globalThis as any).setHeader = setHeaderMock
  handler = (await import('../../../server/api/docs/page.get')).default as (event: any) => Promise<any>
}

describe('/api/docs/page', () => {
  beforeEach(async () => {
    process.env.NODE_ENV = previousNodeEnv
    vi.clearAllMocks()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    cachedOptions = null
    requestedPaths = []
    await importHandler()
  })

  afterEach(() => {
    warnSpy.mockRestore()
    process.env.NODE_ENV = previousNodeEnv
  })

  it('returns docs page metadata without body when body=0', async () => {
    const doc = {
      path: '/docs/dev/components/tabs.en',
      title: 'Tabs',
      body: { type: 'root', children: [] },
    }
    getQueryMock.mockReturnValue({ path: '/docs/dev/components/tabs', locale: 'en', body: '0' })
    mockDocsCollection(new Map([['/docs/dev/components/tabs.en', doc]]))

    await expect(handler({})).resolves.toEqual({
      path: '/docs/dev/components/tabs.en',
      title: 'Tabs',
    })
    expect(requestedPaths).toEqual(['/docs/dev/components/tabs.en'])
    expect(setHeaderMock).toHaveBeenCalledWith({}, 'cache-control', 'public, max-age=300, stale-while-revalidate=3600')
  })

  it('caches docs page responses by normalized path, locale, and body mode', async () => {
    getQueryMock.mockReturnValue({ path: '/en/docs/dev/components/tabs.en.mdc', locale: 'en', body: '0' })

    expect(cachedOptions).toMatchObject({
      maxAge: 300,
      staleMaxAge: 3600,
      name: 'docs-page',
    })
    expect(cachedOptions.getKey({})).toBe('/docs/dev/components/tabs:en:meta')

    getQueryMock.mockReturnValue({ path: '/docs/dev/components/tabs', locale: 'zh', body: '1' })

    expect(cachedOptions.getKey({})).toBe('/docs/dev/components/tabs:zh:body')
  })

  it('renders local Markdown in development when the docs content table is missing', async () => {
    process.env.NODE_ENV = 'development'
    const error = new Error('no such table: _content_docs')
    const toc = { links: [{ id: 'basic-usage', depth: 2, text: 'Basic Usage' }] }
    getQueryMock.mockReturnValue({ path: '/docs/dev/components/tabs', locale: 'en', body: '1' })
    mockDocsCollection(new Map([['/docs/dev/components/tabs.en', error]]))
    fsMocks.stat.mockResolvedValue({ mtimeMs: 123 })
    fsMocks.readFile.mockResolvedValue('---\ntitle: Tabs\n---\n# Tabs')
    mdcMocks.parseMarkdown.mockResolvedValue({
      data: { title: 'Tabs', description: 'Windows Tabs', verified: true },
      body: { type: 'root', children: [] },
      toc,
    })

    await expect(handler({})).resolves.toEqual({
      title: 'Tabs',
      description: 'Windows Tabs',
      verified: true,
      path: '/docs/dev/components/tabs.en',
      _path: '/docs/dev/components/tabs.en',
      meta: { title: 'Tabs', description: 'Windows Tabs', verified: true },
      body: { type: 'root', children: [], toc },
      toc,
    })
    expect(requestedPaths).toEqual(['/docs/dev/components/tabs.en'])
    expect(fsMocks.readFile).toHaveBeenCalledWith(
      expect.stringContaining('content/docs/dev/components/tabs.en.mdc'),
      'utf8',
    )
    expect(mdcMocks.parseMarkdown).toHaveBeenCalledWith('---\ntitle: Tabs\n---\n# Tabs', {
      highlight: false,
      toc: { depth: 4, searchDepth: 4 },
    })
    expect(warnSpy).toHaveBeenCalledWith(
      '[api/docs/page] Nuxt Content docs table is not ready; rendering the local Markdown file in development.',
      error,
    )
  })

  it('returns local Markdown metadata without parsing the full body in development fallback', async () => {
    process.env.NODE_ENV = 'development'
    const error = new Error('no such table: _content_docs')
    getQueryMock.mockReturnValue({ path: '/docs/dev/components/card', locale: 'en', body: '0' })
    mockDocsCollection(new Map([['/docs/dev/components/card.en', error]]))
    fsMocks.stat.mockResolvedValue({ mtimeMs: 125 })
    fsMocks.readFile.mockResolvedValue([
      '---',
      'title: "Card"',
      'description: "Surface container with slots: material backgrounds and loading modes."',
      'category: Layout',
      'syncStatus: migrated',
      'verified: true',
      '---',
      '# Card',
      '::TuffDemoWrapper{demo="CardBasicDemo"}',
      '::',
    ].join('\n'))

    await expect(handler({})).resolves.toEqual({
      title: 'Card',
      description: 'Surface container with slots: material backgrounds and loading modes.',
      category: 'Layout',
      syncStatus: 'migrated',
      verified: true,
      path: '/docs/dev/components/card.en',
      _path: '/docs/dev/components/card.en',
      meta: {
        title: 'Card',
        description: 'Surface container with slots: material backgrounds and loading modes.',
        category: 'Layout',
        syncStatus: 'migrated',
        verified: true,
      },
    })
    expect(fsMocks.readFile).toHaveBeenCalledWith(
      expect.stringContaining('content/docs/dev/components/card.en.mdc'),
      'utf8',
    )
    expect(mdcMocks.parseMarkdown).not.toHaveBeenCalled()
  })

  it('renders local Markdown in development when the Nuxt Content docs query endpoint returns 500', async () => {
    process.env.NODE_ENV = 'development'
    const error = Object.assign(new Error('[POST] "/__nuxt_content/docs/query?t=1781920528845": 500 Server Error'), {
      response: {
        _data: {
          statusCode: 500,
          statusMessage: 'Server Error',
        },
      },
    })
    const toc = { links: [{ id: 'basic-usage', depth: 2, text: 'Basic Usage' }] }
    getQueryMock.mockReturnValue({ path: '/docs/dev/components/tabs', locale: 'en', body: '1' })
    mockDocsCollection(new Map([['/docs/dev/components/tabs.en', error]]))
    fsMocks.stat.mockResolvedValue({ mtimeMs: 124 })
    fsMocks.readFile.mockResolvedValue('---\ntitle: Tabs\n---\n# Tabs')
    mdcMocks.parseMarkdown.mockResolvedValue({
      data: { title: 'Tabs', description: 'Windows Tabs', verified: true },
      body: { type: 'root', children: [] },
      toc,
    })

    await expect(handler({})).resolves.toEqual({
      title: 'Tabs',
      description: 'Windows Tabs',
      verified: true,
      path: '/docs/dev/components/tabs.en',
      _path: '/docs/dev/components/tabs.en',
      meta: { title: 'Tabs', description: 'Windows Tabs', verified: true },
      body: { type: 'root', children: [], toc },
      toc,
    })
    expect(fsMocks.readFile).toHaveBeenCalledWith(
      expect.stringContaining('content/docs/dev/components/tabs.en.mdc'),
      'utf8',
    )
    expect(warnSpy).toHaveBeenCalledWith(
      '[api/docs/page] Nuxt Content docs table is not ready; rendering the local Markdown file in development.',
      error,
    )
  })

  it('throws missing docs content table errors in production', async () => {
    process.env.NODE_ENV = 'production'
    const error = new Error('no such table: _content_docs')
    getQueryMock.mockReturnValue({ path: '/docs/dev/components/tabs', locale: 'en', body: '1' })
    mockDocsCollection(new Map([['/docs/dev/components/tabs.en', error]]))

    await expect(handler({})).rejects.toThrow('no such table: _content_docs')
    expect(fsMocks.readFile).not.toHaveBeenCalled()
  })

  it('does not swallow unrelated docs query errors', async () => {
    process.env.NODE_ENV = 'development'
    const error = new Error('database is locked')
    getQueryMock.mockReturnValue({ path: '/docs/dev/components/tabs', locale: 'en', body: '1' })
    mockDocsCollection(new Map([['/docs/dev/components/tabs.en', error]]))

    await expect(handler({})).rejects.toThrow('database is locked')
    expect(fsMocks.readFile).not.toHaveBeenCalled()
  })
})
