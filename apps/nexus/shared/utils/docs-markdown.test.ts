import { describe, expect, it } from 'vitest'
import { DOCS_SUPPORTED_LOCALES } from './docs-path'
import {
  isDocsMarkdownRequestPath,
  parseDocsMarkdownRoute,
  toDocsMarkdownPath,
  toDocsMarkdownPaths,
} from './docs-markdown'

describe('docs markdown source paths', () => {
  it('separates a raw-source request from a link that names a content file', () => {
    // Docs cross-link each other by file name (`button.en.md`), and normalizeDocsPagePath
    // resolves those to the rendered page. If the locale-suffixed forms counted as source
    // requests, every in-docs cross-link would start serving Markdown instead of the page.
    expect(isDocsMarkdownRequestPath('/en/docs/dev/components/button.md')).toBe(true)
    expect(isDocsMarkdownRequestPath('/en/docs/dev/components/button.en.md')).toBe(false)
    expect(isDocsMarkdownRequestPath('/zh/docs/dev/components/button.zh.md')).toBe(false)
    expect(isDocsMarkdownRequestPath('/en/docs/dev/components/button')).toBe(false)
  })

  it('parses only the exact localized docs shape, so no other URL reaches a file read', () => {
    expect(parseDocsMarkdownRoute('/en/docs/dev/api/box.md')).toEqual({
      locale: 'en',
      path: '/docs/dev/api/box',
    })
    expect(parseDocsMarkdownRoute('/zh/docs/guide/start.md')).toEqual({
      locale: 'zh',
      path: '/docs/guide/start',
    })

    // A path that merely ends in `.md`, or carries no locale, or an unsupported one.
    expect(parseDocsMarkdownRoute('/en/pricing.md')).toBeNull()
    expect(parseDocsMarkdownRoute('/docs/dev/api/box.md')).toBeNull()
    expect(parseDocsMarkdownRoute('/fr/docs/dev/api/box.md')).toBeNull()
    expect(parseDocsMarkdownRoute('/en/docs/dev/api/box')).toBeNull()
    // `docsfoo` is not the docs tree; the boundary has to be a path segment.
    expect(parseDocsMarkdownRoute('/en/docsfoo/box.md')).toBeNull()
  })

  it('round-trips the docs root, whose URL degenerates out of the /docs/<path> shape', () => {
    // The root is also the one route Cloudflare `_routes.json` needs a dedicated exclusion
    // for, since `/en/docs/*` does not cover `/en/docs.md`. A broken round trip kills it.
    expect(toDocsMarkdownPath('/docs', 'en')).toBe('/en/docs.md')
    expect(parseDocsMarkdownRoute('/en/docs.md')).toEqual({ locale: 'en', path: '/docs' })
  })

  it('publishes a source URL for every supported locale', () => {
    // Derived, not hardcoded: adding a locale must not silently leave its sources unpublished.
    expect(toDocsMarkdownPaths('/docs/dev/api/box')).toEqual(
      DOCS_SUPPORTED_LOCALES.map(locale => `/${locale}/docs/dev/api/box.md`),
    )
  })
})
