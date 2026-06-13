import { DOCS_SUPPORTED_LOCALES, normalizeDocsPagePath, toLocalizedDocsPath, type DocsLocale } from '#shared/utils/docs-path'

export interface DocsSeoHeadInput {
  appName: string
  description: string
  origin: string
  canonicalPath: string
  locale: DocsLocale
  title: string
  hasContent: boolean
  socialImagePath?: string
  modifiedAt?: Date | string | number | null
}

export interface DocsAlternateLink {
  rel: 'alternate'
  hreflang: string
  href: string
}

export function normalizeDocsSeoCanonicalPath(path: string | null | undefined) {
  const normalized = normalizeDocsPagePath(path)
  if (normalized === '/docs/index')
    return '/docs'
  if (normalized.endsWith('/index'))
    return normalized.slice(0, -'/index'.length) || '/docs'
  return normalized
}

export function resolveDocsAbsoluteUrl(origin: string, path: string) {
  const cleanOrigin = origin.replace(/\/$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return new URL(normalizedPath, `${cleanOrigin}/`).toString()
}

export function serializeDocsJsonLd(value: Record<string, unknown>) {
  return JSON.stringify(value).replace(/</g, '\\u003C')
}

export function buildDocsSeoHead(input: DocsSeoHeadInput) {
  const canonicalPath = normalizeDocsSeoCanonicalPath(input.canonicalPath)
  const canonicalLocalePath = toLocalizedDocsPath(canonicalPath, input.locale)
  const canonicalUrl = resolveDocsAbsoluteUrl(input.origin, canonicalLocalePath)
  const title = input.title.trim()
  const pageTitle = `${title || (input.locale === 'zh' ? '文档' : 'Docs')} | ${input.appName}`
  const socialImageUrl = resolveDocsAbsoluteUrl(input.origin, input.socialImagePath ?? '/pwa-512x512.png')
  const alternateLinks: DocsAlternateLink[] = [
    ...DOCS_SUPPORTED_LOCALES.map((targetLocale) => {
      return {
        rel: 'alternate' as const,
        hreflang: targetLocale === 'zh' ? 'zh-CN' : 'en',
        href: resolveDocsAbsoluteUrl(input.origin, toLocalizedDocsPath(canonicalPath, targetLocale)),
      }
    }),
    {
      rel: 'alternate',
      hreflang: 'x-default',
      href: resolveDocsAbsoluteUrl(input.origin, toLocalizedDocsPath(canonicalPath, 'en')),
    },
  ]
  const structuredData: Record<string, unknown> | null = input.hasContent
    ? {
        '@context': 'https://schema.org',
        '@type': 'TechArticle',
        headline: title || pageTitle,
        description: input.description,
        inLanguage: input.locale === 'zh' ? 'zh-CN' : 'en-US',
        url: canonicalUrl,
        mainEntityOfPage: {
          '@type': 'WebPage',
          '@id': canonicalUrl,
        },
        publisher: {
          '@type': 'Organization',
          name: 'Tuff',
          url: resolveDocsAbsoluteUrl(input.origin, '/'),
        },
        isPartOf: {
          '@type': 'CreativeWorkSeries',
          name: input.appName,
        },
      }
    : null

  if (structuredData && input.modifiedAt) {
    const modifiedAt = new Date(input.modifiedAt)
    if (!Number.isNaN(modifiedAt.getTime()))
      structuredData.dateModified = modifiedAt.toISOString()
  }

  return {
    pageTitle,
    description: input.description,
    canonicalPath,
    canonicalUrl,
    alternateLinks,
    robotsContent: input.hasContent ? 'index,follow' : 'noindex,nofollow',
    ogLocale: input.locale === 'zh' ? 'zh_CN' : 'en_US',
    ogAlternateLocale: input.locale === 'zh' ? 'en_US' : 'zh_CN',
    socialImageUrl,
    twitterCard: 'summary_large_image' as const,
    structuredData,
    structuredDataText: structuredData ? serializeDocsJsonLd(structuredData) : '',
  }
}
