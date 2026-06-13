import { describe, expect, it } from 'vitest'
import { buildDocsSeoHead, normalizeDocsSeoCanonicalPath } from './docs-seo'

describe('docs SEO head', () => {
  it('normalizes docs index routes to localized canonical and alternates', () => {
    const seo = buildDocsSeoHead({
      appName: 'Tuff Docs',
      description: 'Official docs',
      origin: 'https://docs.tuff.chat/',
      canonicalPath: '/docs/index',
      locale: 'zh',
      title: 'Tuff 文档',
      hasContent: true,
      modifiedAt: '2026-06-13T10:00:00.000Z',
    })

    expect(seo.pageTitle).toBe('Tuff 文档 | Tuff Docs')
    expect(seo.canonicalPath).toBe('/docs')
    expect(seo.canonicalUrl).toBe('https://docs.tuff.chat/zh/docs')
    expect(seo.robotsContent).toBe('index,follow')
    expect(seo.ogLocale).toBe('zh_CN')
    expect(seo.ogAlternateLocale).toBe('en_US')
    expect(seo.socialImageUrl).toBe('https://docs.tuff.chat/pwa-512x512.png')
    expect(seo.twitterCard).toBe('summary_large_image')
    expect(seo.alternateLinks).toEqual([
      { rel: 'alternate', hreflang: 'en', href: 'https://docs.tuff.chat/en/docs' },
      { rel: 'alternate', hreflang: 'zh-CN', href: 'https://docs.tuff.chat/zh/docs' },
      { rel: 'alternate', hreflang: 'x-default', href: 'https://docs.tuff.chat/en/docs' },
    ])
    expect(seo.structuredData).toMatchObject({
      '@type': 'TechArticle',
      headline: 'Tuff 文档',
      inLanguage: 'zh-CN',
      url: 'https://docs.tuff.chat/zh/docs',
      dateModified: '2026-06-13T10:00:00.000Z',
    })
    expect(seo.structuredDataText).toContain('"@type":"TechArticle"')
  })

  it('marks missing docs content as noindex without structured data', () => {
    const seo = buildDocsSeoHead({
      appName: 'Tuff Docs',
      description: 'Missing',
      origin: 'https://docs.tuff.chat',
      canonicalPath: '/en/docs/dev/missing.en.mdc',
      locale: 'en',
      title: '',
      hasContent: false,
    })

    expect(seo.pageTitle).toBe('Docs | Tuff Docs')
    expect(seo.canonicalPath).toBe('/docs/dev/missing')
    expect(seo.canonicalUrl).toBe('https://docs.tuff.chat/en/docs/dev/missing')
    expect(seo.robotsContent).toBe('noindex,nofollow')
    expect(seo.structuredData).toBeNull()
    expect(seo.structuredDataText).toBe('')
  })

  it('normalizes directory index canonical paths', () => {
    expect(normalizeDocsSeoCanonicalPath('/docs/dev/index')).toBe('/docs/dev')
    expect(normalizeDocsSeoCanonicalPath('/zh/docs/dev/components/index.zh.mdc')).toBe('/docs/dev/components')
  })
})
