import type * as DocsPageClientCache from './docs-page-client-cache'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { isDocsPageRecordForRoute } from './docs-page-client-cache'

const fetchMock = vi.fn()
let production: typeof DocsPageClientCache
let development: typeof DocsPageClientCache

async function loadDocsPageCache(dev: boolean) {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const server = await createServer({
    configFile: false,
    root,
    logLevel: 'silent',
    define: {
      'import.meta.dev': JSON.stringify(dev),
      'import.meta.client': 'false',
    },
    resolve: {
      alias: {
        '~': fileURLToPath(new URL('../', import.meta.url)),
        '#shared': fileURLToPath(new URL('../../shared/', import.meta.url)),
      },
    },
    server: { middlewareMode: true, watch: null, preTransformRequests: false },
  })
  try {
    return await server.ssrLoadModule('/app/utils/docs-page-client-cache.ts') as typeof DocsPageClientCache
  }
  finally {
    await server.close()
  }
}

beforeAll(async () => {
  production = await loadDocsPageCache(false)
  development = await loadDocsPageCache(true)
})

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('docs page request path', () => {
  it.each(['production', 'development'] as const)('returns the static JSON record directly in %s', async (mode) => {
    const record = { path: '/docs/dev/components/button.en', title: 'Button' }
    fetchMock.mockResolvedValueOnce(record)
    const cache = mode === 'production' ? production : development

    await expect(cache.requestDocsPage({ path: '/docs/dev/components/button', locale: 'en', body: '1' }))
      .resolves.toEqual(record)

    expect(fetchMock.mock.calls).toEqual([
      ['/api/docs/page/en/body/dev/components/button.json', undefined],
    ])
  })

  it.each([
    { name: 'HTTP status', error: Object.assign(new Error('Not Found'), { statusCode: 404 }) },
    { name: 'response payload status', error: Object.assign(new Error('Not Found'), { data: { statusCode: 404 } }) },
  ])('returns missing content for a production 404 from $name without querying the Worker', async ({ error }) => {
    fetchMock.mockRejectedValueOnce(error)
      .mockResolvedValueOnce({ path: '/docs/dev/components/ghost.zh', title: 'Unexpected fallback' })

    await expect(production.requestDocsPage({ path: '/docs/dev/components/ghost', locale: 'zh', body: '0' }))
      .resolves.toBeNull()

    expect(fetchMock.mock.calls).toEqual([
      ['/api/docs/page/zh/meta/dev/components/ghost.json', undefined],
    ])
  })

  it.each([
    { name: 'network failure', error: new TypeError('Failed to fetch') },
    { name: 'HTTP 503', error: Object.assign(new Error('Service Unavailable'), { statusCode: 503 }) },
    { name: 'payload HTTP 502', error: Object.assign(new Error('Bad Gateway'), { data: { statusCode: 502 } }) },
    { name: '404 text without an HTTP status', error: new Error('404 Not Found') },
  ])('preserves the original production $name instead of reporting missing content', async ({ error }) => {
    fetchMock.mockRejectedValueOnce(error)
      .mockRejectedValueOnce(Object.assign(new Error('Query route absent'), { statusCode: 404 }))

    await expect(production.requestDocsPage({ path: '/docs/dev/components/missing', locale: 'en', body: '1' }))
      .rejects.toBe(error)

    expect(fetchMock.mock.calls).toEqual([
      ['/api/docs/page/en/body/dev/components/missing.json', undefined],
    ])
  })

  it('uses the query record exactly once in development when the static read fails', async () => {
    const record = { path: '/docs/dev/components/ghost.zh', title: 'Ghost' }
    fetchMock
      .mockRejectedValueOnce(Object.assign(new Error('Not Found'), { statusCode: 404 }))
      .mockResolvedValueOnce(record)

    await expect(development.requestDocsPage({ path: '/docs/dev/components/ghost', locale: 'zh', body: '0' }))
      .resolves.toEqual(record)

    expect(fetchMock.mock.calls).toEqual([
      ['/api/docs/page/zh/meta/dev/components/ghost.json', undefined],
      ['/api/docs/page', { query: { path: '/docs/dev/components/ghost', locale: 'zh', body: '0' } }],
    ])
  })

  it('surfaces the query route error in development when both reads fail', async () => {
    const queryError = new Error('worker down')
    fetchMock
      .mockRejectedValueOnce(new Error('static down'))
      .mockRejectedValueOnce(queryError)

    await expect(development.requestDocsPage({ path: '/docs/dev/components/missing', locale: 'en', body: '1' }))
      .rejects.toBe(queryError)
    expect(fetchMock.mock.calls).toEqual([
      ['/api/docs/page/en/body/dev/components/missing.json', undefined],
      ['/api/docs/page', { query: { path: '/docs/dev/components/missing', locale: 'en', body: '1' } }],
    ])
  })
})

describe('docs page route ownership', () => {
  it('accepts a record only for the active localized route', () => {
    const english = { path: '/docs/guide/input.en', title: 'Input' }

    expect(isDocsPageRecordForRoute(english, '/docs/guide/input', 'en')).toBe(true)
    expect(isDocsPageRecordForRoute(english, '/docs/guide/input', 'zh')).toBe(false)
    expect(isDocsPageRecordForRoute(english, '/docs/guide/button', 'en')).toBe(false)
  })

  it('accepts locale-neutral records only when their normalized path matches', () => {
    const neutral = { _path: '/docs/index/', title: 'Docs' }

    expect(isDocsPageRecordForRoute(neutral, '/docs/index', 'en')).toBe(true)
    expect(isDocsPageRecordForRoute(neutral, '/docs/index', 'zh')).toBe(true)
    expect(isDocsPageRecordForRoute(null, '/docs/index', 'en')).toBe(false)
  })
})
