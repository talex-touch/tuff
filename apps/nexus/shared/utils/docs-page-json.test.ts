import { describe, expect, it } from 'vitest'
import { parseStaticDocsPageJsonParams, toStaticDocsPageJsonPath, toStaticDocsPageJsonPaths } from './docs-page-json'

describe('static docs page JSON paths', () => {
  it('builds a path-shaped, query-free URL for a document', () => {
    expect(toStaticDocsPageJsonPath('/docs/dev/components/button', 'en', 'body'))
      .toBe('/api/docs/page/en/body/dev/components/button.json')
    expect(toStaticDocsPageJsonPath('/zh/docs/dev/components/button.zh.mdc', 'zh', 'meta'))
      .toBe('/api/docs/page/zh/meta/dev/components/button.json')
  })

  it('gives the docs root a file name of its own', () => {
    expect(toStaticDocsPageJsonPath('/docs', 'en', 'meta')).toBe('/api/docs/page/en/meta/index.json')
    expect(toStaticDocsPageJsonPath('/docs/index', 'en', 'meta')).toBe('/api/docs/page/en/meta/index.json')
    expect(toStaticDocsPageJsonPath(undefined, 'en', 'body')).toBe('/api/docs/page/en/body/index.json')
  })

  it('lists both locales and both modes for the prerender list', () => {
    expect(toStaticDocsPageJsonPaths('/docs/guide/start')).toEqual([
      '/api/docs/page/en/meta/guide/start.json',
      '/api/docs/page/en/body/guide/start.json',
      '/api/docs/page/zh/meta/guide/start.json',
      '/api/docs/page/zh/body/guide/start.json',
    ])
  })

  it('round-trips through the route params the handler receives', () => {
    expect(parseStaticDocsPageJsonParams({ locale: 'en', mode: 'body', path: 'dev/components/button.json' }))
      .toEqual({ locale: 'en', mode: 'body', path: '/docs/dev/components/button' })
    expect(parseStaticDocsPageJsonParams({ locale: 'zh', mode: 'meta', path: 'index.json' }))
      .toEqual({ locale: 'zh', mode: 'meta', path: '/docs' })
  })

  it('rejects anything that is not exactly the static shape', () => {
    expect(parseStaticDocsPageJsonParams({ locale: 'fr', mode: 'body', path: 'a.json' })).toBeNull()
    expect(parseStaticDocsPageJsonParams({ locale: 'en', mode: 'full', path: 'a.json' })).toBeNull()
    expect(parseStaticDocsPageJsonParams({ locale: 'en', mode: 'body', path: 'a' })).toBeNull()
    expect(parseStaticDocsPageJsonParams({ locale: 'en', mode: 'body', path: '.json' })).toBeNull()
    expect(parseStaticDocsPageJsonParams({ locale: 'en', mode: 'body', path: '../etc/passwd.json' })).toBeNull()
    expect(parseStaticDocsPageJsonParams({ locale: 'en', mode: 'body', path: 'a//b.json' })).toBeNull()
    expect(parseStaticDocsPageJsonParams(undefined)).toBeNull()
  })
})
