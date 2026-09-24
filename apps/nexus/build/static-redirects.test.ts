import { describe, expect, it } from 'vitest'
import { checkStaticFallback, checkStaticRedirects, isExcludedFromWorker } from './check-worker-bundle.mjs'
import { docsStaticRedirects } from './nexus-static-routes.mjs'
import { formatRedirectRule, isDynamicRedirect, isValidRedirectStatus, mergeStaticRedirects, parseRedirectsFile } from './write-static-redirects.mjs'

/** What Nitro's Cloudflare preset writes: tab-separated, from `routeRules` redirects. */
const nitroRedirects = ['/terms\t/license\t307', ''].join('\n')
/** The same file when Nitro saw a `404.html` at compile time: it adds a line Pages rejects. */
const nitroRedirectsWithInvalidFallback = ['/terms\t/license\t307', '/*\t/404.html\t404', ''].join('\n')

describe('static redirects writer', () => {
  it('reads the file the way Pages does: whitespace-separated, comments and blanks skipped, 302 by default', () => {
    expect(parseRedirectsFile(['# nitro', '', '/terms\t/license\t307', '/old /new', '/* /preview/:splat 302 Cookie=preview'].join('\n'))).toEqual([
      { from: '/terms', to: '/license', status: 307, conditions: [], raw: '/terms\t/license\t307' },
      { from: '/old', to: '/new', status: 302, conditions: [], raw: '/old /new' },
      { from: '/*', to: '/preview/:splat', status: 302, conditions: ['Cookie=preview'], raw: '/* /preview/:splat 302 Cookie=preview' },
    ])
  })

  it('tells a dynamic rule (splat or placeholder source) from a static one, and a status Pages accepts from one it drops', () => {
    expect(isDynamicRedirect({ from: '/docs' })).toBe(false)
    expect(isDynamicRedirect({ from: '/docs/*' })).toBe(true)
    expect(isDynamicRedirect({ from: '/users/:id' })).toBe(true)
    expect(isValidRedirectStatus({ status: 308 })).toBe(true)
    expect(isValidRedirectStatus({ status: 200 })).toBe(true)
    expect(isValidRedirectStatus({ status: 404 })).toBe(false)
  })

  it('writes the docs rules into an empty file, static first', () => {
    expect(mergeStaticRedirects('')).toBe('/docs /en/docs 308\n/docs/* /en/docs/:splat 308\n')
  })

  it('keeps every valid Nitro rule and puts static rules before dynamic ones', () => {
    expect(mergeStaticRedirects(nitroRedirects)).toBe([
      '/docs /en/docs 308',
      '/terms\t/license\t307',
      '/docs/* /en/docs/:splat 308',
      '',
    ].join('\n'))
  })

  it('drops a line with a status Pages rejects instead of shipping a warning on every deploy', () => {
    // wrangler 4.107: "Found 1 invalid redirect rule: Valid status codes are 200, 301, 302
    // (default), 303, 307, or 308. Got 404." — Pages serves 404.html natively, no rule needed.
    expect(mergeStaticRedirects(nitroRedirectsWithInvalidFallback)).toBe(mergeStaticRedirects(nitroRedirects))
    expect(mergeStaticRedirects(nitroRedirectsWithInvalidFallback)).not.toContain('404')
  })

  it('is idempotent and owns the docs sources: a stale docs line is rewritten, not duplicated', () => {
    const once = mergeStaticRedirects(nitroRedirects)
    expect(mergeStaticRedirects(once)).toBe(once)

    const stale = ['/docs\t/zh/docs\t301', ...nitroRedirects.split('\n')].join('\n')
    const merged = mergeStaticRedirects(stale)
    expect(merged.match(/^\/docs\s/gm)).toHaveLength(1)
    expect(merged).toContain('/docs /en/docs 308')
    expect(merged).not.toContain('/zh/docs')
  })
})

describe('static redirects guard', () => {
  it('accepts the file the writer produces on top of Nitro output', () => {
    const result = checkStaticRedirects(mergeStaticRedirects(nitroRedirects))
    expect(result.findings).toEqual([])
    expect(result.verified).toBe(docsStaticRedirects.length)
  })

  it('names a missing rule, a wrong target, and a missing file', () => {
    expect(checkStaticRedirects(null).findings).toEqual(['_redirects is missing'])
    expect(checkStaticRedirects('/docs /en/docs 308\n').findings).toEqual(['/docs/*: no _redirects rule'])
    expect(checkStaticRedirects('/docs /zh/docs 308\n/docs/* /en/docs/:splat 308\n').findings).toEqual([
      '/docs: redirects to /zh/docs 308, expected /en/docs 308',
    ])
  })

  it('rejects a docs rule that sits below a /* catch-all, where Pages never reaches it', () => {
    const shadowed = ['/docs /en/docs 308', '/* /index.html 200', '/docs/* /en/docs/:splat 308', ''].join('\n')
    expect(checkStaticRedirects(shadowed).findings).toEqual([
      '/docs/*: listed after the /* catch-all; Pages reads rules in order',
    ])
  })

  it('rejects a static rule that drifted below the dynamic rules', () => {
    const drifted = ['/docs/* /en/docs/:splat 308', '/docs /en/docs 308', ''].join('\n')
    expect(checkStaticRedirects(drifted).findings).toEqual([
      '/docs: static rule listed after dynamic rules; Pages documents static rules first',
    ])
  })

  it('rejects a line whose status Pages drops, so the invalid Nitro fallback cannot come back', () => {
    const withInvalid = `${formatRedirectRule(docsStaticRedirects[0])}\n${formatRedirectRule(docsStaticRedirects[1])}\n/* /404.html 404\n`
    expect(checkStaticRedirects(withInvalid).findings).toEqual([
      '/* /404.html 404: status 404 is not a _redirects status Pages accepts; the line is dropped with a warning',
    ])
  })
})

describe('static 404 fallback guard', () => {
  const renderedNotFound = '<html><body><div id="__nuxt"><main><div role="img" aria-label="404">4 4</div><h1>Page not found</h1></main></div></body></html>'
  const emptyShell = '<html><body><div id="__nuxt"></div><div id="teleports"></div></body></html>'

  it('passes when the rendered page is there', () => {
    expect(checkStaticFallback({ notFoundHtml: renderedNotFound })).toEqual({ findings: [], verified: 1 })
  })

  it('names a missing file and an empty no-SSR shell', () => {
    expect(checkStaticFallback({ notFoundHtml: null }).findings).toEqual([
      '404.html is missing from dist; Pages serves index.html with status 200 for every unknown static path',
    ])
    // The shell is what a literal `/404.html` prerender produced on 2026-09-24: 3.6 KB, no title, no text.
    expect(checkStaticFallback({ notFoundHtml: emptyShell }).findings).toEqual([
      '404.html is an empty no-SSR shell; prerender the not-found page under a route Nuxt renders with SSR',
      '404.html does not contain the rendered not-found page (aria-label="404")',
    ])
  })
})

describe('worker exclusion matching', () => {
  it('honours a Pages splat pattern for the paths under it and nothing else', () => {
    const excluded = new Set(['/en/docs', '/en/docs/*', '/pricing'])
    expect(isExcludedFromWorker('/pricing', excluded)).toBe(true)
    expect(isExcludedFromWorker('/en/docs', excluded)).toBe(true)
    expect(isExcludedFromWorker('/en/docs/dev/components', excluded)).toBe(true)
    expect(isExcludedFromWorker('/en/docsx', excluded)).toBe(false)
    expect(isExcludedFromWorker('/zh/docs/dev', excluded)).toBe(false)
  })
})
