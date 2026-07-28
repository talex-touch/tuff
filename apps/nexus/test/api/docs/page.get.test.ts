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
const cacheStore = new Map<string, unknown>()

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
  cacheStore.clear()
  ;(globalThis as any).defineEventHandler = (fn: any) => fn
  // Mirrors nitro: a value is stored only after the wrapped function resolves.
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
    expect(cachedOptions).toMatchObject({
      maxAge: 300,
      staleMaxAge: 3600,
      name: 'docs-page',
    })
    expect(cachedOptions.getKey({}, '/docs/dev/components/tabs', 'en', false)).toBe('/docs/dev/components/tabs:en:meta')
    expect(cachedOptions.getKey({}, '/docs/dev/components/tabs', 'zh', true)).toBe('/docs/dev/components/tabs:zh:body')
  })

  it('normalizes messy request paths before looking a page up', async () => {
    getQueryMock.mockReturnValue({ path: '/en/docs/dev/components/tabs.en.mdc', locale: 'en', body: '0' })
    mockDocsCollection(new Map())

    await handler({})

    expect(requestedPaths[0]).toBe('/docs/dev/components/tabs.en')
  })

  it('caches a page that genuinely does not exist', async () => {
    getQueryMock.mockReturnValue({ path: '/docs/dev/components/ghost', locale: 'en', body: '1' })
    mockDocsCollection(new Map())

    await expect(handler({})).resolves.toBeNull()
    await expect(handler({})).resolves.toBeNull()

    expect(contentMocks.queryCollection).toHaveBeenCalledTimes(4)
    expect(setHeaderMock).toHaveBeenCalledWith({}, 'cache-control', 'public, max-age=300, stale-while-revalidate=3600')
  })

  it('never caches the development Markdown fallback', async () => {
    process.env.NODE_ENV = 'development'
    const error = new Error('no such table: _content_docs')
    getQueryMock.mockReturnValue({ path: '/docs/guide/start', locale: 'en', body: '0' })
    mockDocsCollection(new Map([['/docs/guide/start.en', error]]))
    fsMocks.stat.mockResolvedValue({ mtimeMs: 321 })
    fsMocks.readFile.mockResolvedValue('---\ntitle: Start\n---\n# Start')

    await expect(handler({})).resolves.toMatchObject({ title: 'Start' })
    await expect(handler({})).resolves.toMatchObject({ title: 'Start' })

    // Re-statting proves the resolver ran again, i.e. the degraded response was
    // never stored; readFile stays at one call because the mtime-keyed file
    // cache inside the endpoint is still doing its job.
    expect(fsMocks.stat).toHaveBeenCalledTimes(2)
    expect(fsMocks.readFile).toHaveBeenCalledTimes(1)
    expect(setHeaderMock).not.toHaveBeenCalled()
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

  it('uses local frontmatter for development metadata requests before querying Nuxt Content', async () => {
    process.env.NODE_ENV = 'development'
    getQueryMock.mockReturnValue({ path: '/docs/dev/components/fusion', locale: 'en', body: '0' })
    mockDocsCollection(new Map([['/docs/dev/components/fusion.en', {
      path: '/docs/dev/components/fusion.en',
      title: 'Fusion from content',
      body: { type: 'root', children: [] },
    }]]))
    fsMocks.stat.mockResolvedValue({ mtimeMs: 126 })
    fsMocks.readFile.mockResolvedValue([
      '---',
      'title: "Fusion"',
      'description: "Gooey two-slot fusion effect."',
      'category: Basic',
      'syncStatus: migrated',
      '---',
      '# Fusion',
      ':::TuffDemoWrapper{demo="FusionFusionDemo"}',
      ':::',
    ].join('\n'))

    await expect(handler({})).resolves.toEqual({
      title: 'Fusion',
      description: 'Gooey two-slot fusion effect.',
      category: 'Basic',
      syncStatus: 'migrated',
      path: '/docs/dev/components/fusion.en',
      _path: '/docs/dev/components/fusion.en',
      meta: {
        title: 'Fusion',
        description: 'Gooey two-slot fusion effect.',
        category: 'Basic',
        syncStatus: 'migrated',
      },
    })
    expect(requestedPaths).toEqual([])
    expect(contentMocks.queryCollection).not.toHaveBeenCalled()
    expect(mdcMocks.parseMarkdown).not.toHaveBeenCalled()
  })

  it('keeps non-component development metadata requests on Nuxt Content', async () => {
    process.env.NODE_ENV = 'development'
    const doc = {
      path: '/docs/guide/start.en',
      title: 'Start',
      body: { type: 'root', children: [] },
    }
    getQueryMock.mockReturnValue({ path: '/docs/guide/start', locale: 'en', body: '0' })
    mockDocsCollection(new Map([['/docs/guide/start.en', doc]]))

    await expect(handler({})).resolves.toEqual({
      path: '/docs/guide/start.en',
      title: 'Start',
    })
    expect(requestedPaths).toEqual(['/docs/guide/start.en'])
    expect(fsMocks.readFile).not.toHaveBeenCalled()
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

  it('reports a missing docs content table as unavailable in production', async () => {
    process.env.NODE_ENV = 'production'
    const error = new Error('no such table: _content_docs')
    getQueryMock.mockReturnValue({ path: '/docs/dev/components/tabs', locale: 'en', body: '1' })
    mockDocsCollection(new Map([['/docs/dev/components/tabs.en', error]]))

    await expect(handler({})).rejects.toMatchObject({ statusCode: 503 })
    expect(fsMocks.readFile).not.toHaveBeenCalled()
    expect(setHeaderMock).not.toHaveBeenCalled()
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
