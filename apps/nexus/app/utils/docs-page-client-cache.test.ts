import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isDocsPageRecordForRoute, requestDocsPage } from './docs-page-client-cache'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('$fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('docs page request path', () => {
  it('reads the prerendered static JSON twin first', async () => {
    fetchMock.mockResolvedValueOnce({ path: '/docs/dev/components/button.en', title: 'Button' })

    await expect(requestDocsPage({ path: '/docs/dev/components/button', locale: 'en', body: '1' }))
      .resolves.toMatchObject({ title: 'Button' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/docs/page/en/body/dev/components/button.json', undefined)
  })

  it('falls back to the query route exactly once when the static read fails', async () => {
    fetchMock
      .mockRejectedValueOnce(Object.assign(new Error('Not Found'), { statusCode: 404 }))
      .mockResolvedValueOnce({ path: '/docs/dev/components/ghost.zh', title: 'Ghost' })

    await expect(requestDocsPage({ path: '/docs/dev/components/ghost', locale: 'zh', body: '0' }))
      .resolves.toMatchObject({ title: 'Ghost' })

    expect(fetchMock.mock.calls).toEqual([
      ['/api/docs/page/zh/meta/dev/components/ghost.json', undefined],
      ['/api/docs/page', { query: { path: '/docs/dev/components/ghost', locale: 'zh', body: '0' } }],
    ])
  })

  it('surfaces the query route failure when both reads fail', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('static down'))
      .mockRejectedValueOnce(new Error('worker down'))

    await expect(requestDocsPage({ path: '/docs/dev/components/missing', locale: 'en', body: '1' }))
      .rejects.toThrow('worker down')
    expect(fetchMock).toHaveBeenCalledTimes(2)
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
