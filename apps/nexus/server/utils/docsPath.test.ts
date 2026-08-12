import { describe, expect, it } from 'vitest'
import { isDocsPageRecordForRoute } from '../../app/utils/docs-page-client-cache'
import {
  canonicalDocsPageIdentity,
  isDocsPath,
  normalizeDocsPagePath,
  resolveDocsLocaleFromRoute,
  stripDocsLocalePrefix,
  toLocalizedDocsPath,
} from './docsPath'

describe('docsPath', () => {
  it('gives a directory route and its index document one identity', () => {
    expect(canonicalDocsPageIdentity('/docs/dev/index')).toBe('/docs/dev')
    expect(canonicalDocsPageIdentity('/docs/dev/index.en')).toBe('/docs/dev')
    expect(canonicalDocsPageIdentity('/en/docs/dev/components/index.en.mdc')).toBe('/docs/dev/components')
    expect(canonicalDocsPageIdentity('/zh/docs/guide/index.zh')).toBe('/docs/guide')
    expect(canonicalDocsPageIdentity('/docs/dev')).toBe('/docs/dev')
    // The docs root is not an index inside anything, so it must survive untouched.
    expect(canonicalDocsPageIdentity('/docs')).toBe('/docs')
    expect(canonicalDocsPageIdentity('/docs/index')).toBe('/docs')
    // A document that merely contains "index" in its name is not a directory index.
    expect(canonicalDocsPageIdentity('/docs/dev/indexing')).toBe('/docs/dev/indexing')
  })

  it('leaves normalizeDocsPagePath alone so prerender inputs keep their index routes', () => {
    // createDocsPrerenderRoutes goes through this, and the post-build alias materializer
    // depends on /docs/<dir>/index staying a rendered route of its own.
    expect(normalizeDocsPagePath('/docs/dev/index')).toBe('/docs/dev/index')
    expect(normalizeDocsPagePath('/zh/docs/guide/index.zh.mdc')).toBe('/docs/guide/index')
  })

  it('accepts the index record the API returns for a directory request', () => {
    // SSR answered 404 for every /en/docs/<dir> route because the API correctly resolved
    // /docs/<dir>/index.en and this predicate then rejected it as a different route.
    expect(isDocsPageRecordForRoute({ path: '/docs/dev/index.en' } as never, '/docs/dev', 'en')).toBe(true)
    expect(isDocsPageRecordForRoute({ path: '/docs/dev/components/index.en' } as never, '/docs/dev/components', 'en')).toBe(true)
    expect(isDocsPageRecordForRoute({ path: '/docs/guide/index.zh' } as never, '/docs/guide', 'zh')).toBe(true)
    // Stale-route rejection and the locale check must both survive.
    expect(isDocsPageRecordForRoute({ path: '/docs/other/index.en' } as never, '/docs/dev', 'en')).toBe(false)
    expect(isDocsPageRecordForRoute({ path: '/docs/dev/index.zh' } as never, '/docs/dev', 'en')).toBe(false)
  })

  it('normalizes localized markdown component links to the canonical doc path', () => {
    expect(normalizeDocsPagePath('/docs/dev/components/button.zh.md')).toBe('/docs/dev/components/button')
    expect(normalizeDocsPagePath('/zh/docs/dev/components/button.zh.md')).toBe('/docs/dev/components/button')
    expect(normalizeDocsPagePath('/docs/dev/components/button.en.mdc')).toBe('/docs/dev/components/button')
    expect(normalizeDocsPagePath('/en/docs/dev/api/box.en.mdc')).toBe('/docs/dev/api/box')
    expect(normalizeDocsPagePath('dev/api/box.zh.mdc')).toBe('/docs/dev/api/box')
  })

  it('strips locale prefixes without changing regular paths', () => {
    expect(stripDocsLocalePrefix('/zh/docs/dev/components/button')).toBe('/docs/dev/components/button')
    expect(stripDocsLocalePrefix('/en/docs/dev/release/performance-persistence')).toBe('/docs/dev/release/performance-persistence')
    expect(stripDocsLocalePrefix('/docs/dev/release/performance-persistence')).toBe('/docs/dev/release/performance-persistence')
  })

  it('resolves docs locale from localized routes', () => {
    expect(resolveDocsLocaleFromRoute('/zh/docs/dev/components/button')).toBe('zh')
    expect(resolveDocsLocaleFromRoute('/en/docs/dev/components/button')).toBe('en')
    expect(resolveDocsLocaleFromRoute('/docs/dev/components/button')).toBe('en')
  })

  it('builds localized docs paths from canonical docs paths', () => {
    expect(toLocalizedDocsPath('/docs/dev/api/box', 'zh')).toBe('/zh/docs/dev/api/box')
    expect(toLocalizedDocsPath('/en/docs/dev/api/box.en.mdc', 'en')).toBe('/en/docs/dev/api/box')
    expect(toLocalizedDocsPath('/pricing', 'zh')).toBe('/pricing')
    expect(toLocalizedDocsPath('/en/pricing', 'zh')).toBe('/en/pricing')
  })

  it('does not classify docs-like non-doc paths as docs routes', () => {
    expect(isDocsPath('/docs')).toBe(true)
    expect(isDocsPath('/zh/docs/dev/api/box')).toBe(true)
    expect(isDocsPath('/docsfoo')).toBe(false)
    expect(isDocsPath('/en/docsfoo')).toBe(false)
  })
})
