import { describe, expect, it } from 'vitest'
import { checkStaticCacheHeaders, parseCloudflareHeadersFile } from './check-worker-bundle.mjs'
import {
  DOCS_STATIC_CACHE_CONTROL,
  I18N_MESSAGES_CACHE_CONTROL,
  createStaticCacheRouteRules,
  docsStaticHtmlHeaderRoutes,
  docsStaticJsonHeaderRoutes,
  i18nMessagesHeaderRoutes,
} from './nexus-static-routes.mjs'

/** Renders route rules the way nitro's Cloudflare preset writes `_headers` (`/**` → `/*`). */
function renderHeadersFile(rules: Record<string, { headers?: Record<string, string> }>) {
  return Object.entries(rules)
    .filter(([, rule]) => rule.headers)
    .map(([route, rule]) => [
      route.replace('/**', '/*'),
      ...Object.entries(rule.headers ?? {}).map(([name, value]) => `  ${name}: ${value}`),
    ].join('\n'))
    .join('\n')
}

describe('static cache headers guard', () => {
  it('parses Cloudflare _headers blocks with case-insensitive header names', () => {
    const blocks = parseCloudflareHeadersFile([
      '/_nuxt/*',
      '  cache-control: public, max-age=31536000, immutable',
      '',
      '/api/docs/navigation/*',
      '  Cache-Control: public, max-age=300, s-maxage=3600',
      '  Content-Type: application/json; charset=utf-8',
    ].join('\n'))

    expect(blocks).toEqual([
      { pattern: '/_nuxt/*', headers: { 'cache-control': 'public, max-age=31536000, immutable' } },
      {
        pattern: '/api/docs/navigation/*',
        headers: {
          'cache-control': 'public, max-age=300, s-maxage=3600',
          'content-type': 'application/json; charset=utf-8',
        },
      },
    ])
  })

  it('accepts the _headers file the shared route rules produce', () => {
    const result = checkStaticCacheHeaders(renderHeadersFile(createStaticCacheRouteRules()))

    expect(result.findings).toEqual([])
    expect(result.verified).toBe(
      docsStaticHtmlHeaderRoutes.length + docsStaticJsonHeaderRoutes.length + i18nMessagesHeaderRoutes.length,
    )
  })

  it('names every route whose block is missing, and a missing file', () => {
    expect(checkStaticCacheHeaders(null).findings).toEqual(['_headers is missing'])

    const onlyHtml = renderHeadersFile({
      '/en/docs/**': { headers: { 'cache-control': DOCS_STATIC_CACHE_CONTROL } },
    })
    const result = checkStaticCacheHeaders(onlyHtml)

    expect(result.verified).toBe(1)
    expect(result.findings).toContain('/zh/docs/*: no _headers block')
    expect(result.findings).toContain('/_i18n/*: no _headers block')
    expect(result.findings).toContain('/api/docs/component-sync: no _headers block')
  })

  it('rejects a block that lost its edge cache window or JSON content type', () => {
    const rules = createStaticCacheRouteRules()
    rules['/en/docs/**'] = { headers: { 'cache-control': 'public, max-age=0, must-revalidate' } }
    rules['/api/docs/search/**'] = { headers: { 'cache-control': DOCS_STATIC_CACHE_CONTROL } }
    const result = checkStaticCacheHeaders(renderHeadersFile(rules))

    expect(result.findings).toEqual([
      `/en/docs/*: cache-control is "public, max-age=0, must-revalidate", expected "${DOCS_STATIC_CACHE_CONTROL}"`,
      '/api/docs/search/*: content-type is "", expected application/json',
    ])
  })

  it('keeps the shared windows edge-cacheable', () => {
    expect(DOCS_STATIC_CACHE_CONTROL).toMatch(/\bs-maxage=[1-9]\d*/)
    expect(DOCS_STATIC_CACHE_CONTROL).toMatch(/\bstale-while-revalidate=[1-9]\d*/)
    expect(I18N_MESSAGES_CACHE_CONTROL).toMatch(/\bs-maxage=[1-9]\d*/)
  })
})
