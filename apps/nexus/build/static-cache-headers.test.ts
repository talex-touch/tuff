import { describe, expect, it } from 'vitest'
import { checkEarlyHints, checkHeadersFileLimits, checkStaticCacheHeaders, parseCloudflareHeadersFile } from './check-worker-bundle.mjs'
import {
  CLOUDFLARE_HEADERS_MAX_LINE_LENGTH,
  CLOUDFLARE_HEADERS_MAX_RULES,
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

  it('reads the file the way Pages does: comments skipped, a repeated pattern keeps only its last block', () => {
    const source = [
      '# written by nitro',
      '/en/docs/*',
      `  cache-control: ${DOCS_STATIC_CACHE_CONTROL}`,
      '',
      '# nexus: early hints (build/write-early-hints.mjs)',
      '/en/docs/*',
      '  Link: </_nuxt/e.js>; rel=modulepreload; crossorigin',
    ].join('\n')

    expect(parseCloudflareHeadersFile(source)).toEqual([
      { pattern: '/en/docs/*', headers: { link: '</_nuxt/e.js>; rel=modulepreload; crossorigin' } },
    ])
    // …which is exactly how a second block for a pattern drops the docs cache window.
    expect(checkStaticCacheHeaders(source).findings).toContain(
      `/en/docs/*: cache-control is "", expected "${DOCS_STATIC_CACHE_CONTROL}"`,
    )
  })

  it('joins a header named twice in one block the way Pages sends it', () => {
    const source = [
      '/',
      '  Link: </_nuxt/e.js>; rel=modulepreload; crossorigin',
      '  Link: </_nuxt/entry.css>; rel=preload; as=style; crossorigin',
    ].join('\n')

    expect(parseCloudflareHeadersFile(source)).toEqual([{
      pattern: '/',
      headers: { link: '</_nuxt/e.js>; rel=modulepreload; crossorigin, </_nuxt/entry.css>; rel=preload; as=style; crossorigin' },
    }])
    // …so the early-hints guard sees both targets, not just the last line's.
    expect(checkEarlyHints(source, target => target === '/_nuxt/e.js').findings).toContain(
      '/: Link targets missing from dist: /_nuxt/entry.css',
    )
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

describe('_headers file limits', () => {
  it('accepts the file the shared route rules produce', () => {
    const result = checkHeadersFileLimits(renderHeadersFile(createStaticCacheRouteRules()))
    expect(result.findings).toEqual([])
    expect(result.rules).toBeGreaterThan(0)
  })

  it('names an over-long line, a duplicated pattern, and too many rules', () => {
    const longLine = `  Link: ${'</_nuxt/a.css>; rel=preload; as=style; crossorigin, '.repeat(60)}`
    const source = ['/en/docs/*', '  cache-control: a', '/en/docs/*', '  Link: b', '/', longLine].join('\n')
    expect(checkHeadersFileLimits(source).findings).toEqual([
      `line 6 is ${longLine.trim().length} chars > ${CLOUDFLARE_HEADERS_MAX_LINE_LENGTH}; Pages ignores it`,
      '/en/docs/* appears 2 times; Pages keeps only the last block',
    ])

    const tooMany = Array.from({ length: CLOUDFLARE_HEADERS_MAX_RULES + 1 }, (_, index) => `/r${index}\n  x-a: b`).join('\n')
    expect(checkHeadersFileLimits(tooMany).findings).toEqual([
      `${CLOUDFLARE_HEADERS_MAX_RULES + 1} rules > ${CLOUDFLARE_HEADERS_MAX_RULES}; Pages drops the rest`,
    ])
    expect(checkHeadersFileLimits(null).findings).toEqual(['_headers is missing'])
  })
})

describe('early hints guard', () => {
  const docsLink = '</_nuxt/e.js>; rel=modulepreload; crossorigin, </_nuxt/docs.css>; rel=preload; as=style; crossorigin'
  const docsBlocks = [
    '/en/docs/*',
    `  cache-control: ${DOCS_STATIC_CACHE_CONTROL}`,
    `  Link: ${docsLink}`,
    '/zh/docs/*',
    `  cache-control: ${DOCS_STATIC_CACHE_CONTROL}`,
    `  Link: ${docsLink}`,
  ]
  const landingBlocks = [
    '',
    '# nexus: early hints (build/write-early-hints.mjs)',
    '/',
    '  Link: </_nuxt/e.js>; rel=modulepreload; crossorigin, </_nuxt/entry.css>; rel=preload; as=style; crossorigin',
  ]
  const headers = [...docsBlocks, ...landingBlocks].join('\n')

  it('verifies every Link target exists and every required family has a block', () => {
    const assets = new Set(['/_nuxt/e.js', '/_nuxt/entry.css', '/_nuxt/docs.css'])
    const result = checkEarlyHints(headers, target => assets.has(target))
    expect(result.findings).toEqual([])
    expect(result.verified).toBe(3)
    // The docs blocks keep their cache window next to the hint.
    expect(checkStaticCacheHeaders(headers).findings).not.toContain(
      `/en/docs/*: cache-control is "", expected "${DOCS_STATIC_CACHE_CONTROL}"`,
    )
  })

  it('names missing targets and missing families', () => {
    const assets = new Set(['/_nuxt/e.js', '/_nuxt/entry.css'])
    expect(checkEarlyHints(headers, target => assets.has(target)).findings).toEqual([
      '/en/docs/*: Link targets missing from dist: /_nuxt/docs.css',
      '/zh/docs/*: Link targets missing from dist: /_nuxt/docs.css',
    ])
    expect(checkEarlyHints(landingBlocks.join('\n'), () => true).findings).toEqual([
      '/en/docs/*: no Link block for early hints',
      '/zh/docs/*: no Link block for early hints',
    ])
    expect(checkEarlyHints(null, () => true).findings).toEqual(['_headers is missing'])
  })

  it('rejects a hint whose credentials mode differs from the tag it stands in for', () => {
    const anonymous = [
      ...docsBlocks,
      '',
      '/',
      '  Link: </_nuxt/e.js>; rel=modulepreload, </_nuxt/entry.css>; rel=preload; as=style; crossorigin',
    ].join('\n')
    expect(checkEarlyHints(anonymous, () => true).findings).toEqual([
      '/: Link entries without crossorigin: /_nuxt/e.js',
    ])
  })
})
