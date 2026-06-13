export const DOCS_SUPPORTED_LOCALES = ['en', 'zh'] as const

export type DocsLocale = typeof DOCS_SUPPORTED_LOCALES[number]

const DOCS_SUPPORTED_LOCALE_SET = new Set<string>(DOCS_SUPPORTED_LOCALES)
const CONTENT_EXTENSION_PATTERN = /\.(md|mdc)$/i
const LOCALE_SUFFIX_PATTERN = /\.(en|zh)$/i
const DOCS_PATH_PATTERN = /^\/docs(?=\/|$)/

export function isDocsLocale(value: unknown): value is DocsLocale {
  return typeof value === 'string' && DOCS_SUPPORTED_LOCALE_SET.has(value)
}

export function normalizeDocsLocale(value: unknown): DocsLocale {
  return value === 'zh' ? 'zh' : 'en'
}

export function stripDocsLocalePrefix(path: string) {
  if (!path)
    return '/'

  for (const code of DOCS_SUPPORTED_LOCALES) {
    const exact = `/${code}`
    if (path === exact || path === `${exact}/`)
      return '/'

    const prefixed = `${exact}/`
    if (path.startsWith(prefixed))
      return path.slice(exact.length) || '/'
  }

  return path
}

export function resolveDocsLocaleFromRoute(path: string | null | undefined): DocsLocale {
  if (!path)
    return 'en'

  const match = path.match(/^\/(en|zh)(?=\/|$)/)
  return normalizeDocsLocale(match?.[1])
}

export function stripDocsContentExtension(path: string) {
  return path.replace(CONTENT_EXTENSION_PATTERN, '')
}

export function stripDocsLocaleSuffix(path: string) {
  return path.replace(LOCALE_SUFFIX_PATTERN, '')
}

export function normalizeDocsPagePath(path: string | null | undefined) {
  if (!path)
    return '/docs'

  const hasLeadingSlash = path.startsWith('/')
  const raw = path.endsWith('/') && path.length > 1
    ? path.slice(0, -1)
    : path
  const prefixed = raw.startsWith('/') ? raw : `/${raw}`
  const normalized = stripDocsLocaleSuffix(stripDocsContentExtension(stripDocsLocalePrefix(prefixed)))

  if (!normalized || normalized === '/')
    return '/docs'

  if (hasLeadingSlash && !normalized.startsWith('/docs'))
    return normalized

  return normalized.startsWith('/docs')
    ? normalized
    : `/docs${normalized.startsWith('/') ? normalized : `/${normalized}`}`
}

export function toLocalizedDocsPath(path: string | null | undefined, locale: DocsLocale = 'en') {
  if (!isDocsPath(path))
    return path || '/'

  const normalized = normalizeDocsPagePath(path)
  return `/${locale}${normalized}`
}

export function toLocalizedDocsPaths(path: string | null | undefined) {
  if (!isDocsPath(path))
    return [path || '/']

  const normalized = normalizeDocsPagePath(path)
  return DOCS_SUPPORTED_LOCALES.map(locale => `/${locale}${normalized}`)
}

export function isDocsPath(path: string | null | undefined) {
  if (!path)
    return false

  return DOCS_PATH_PATTERN.test(stripDocsLocalePrefix(path))
}
