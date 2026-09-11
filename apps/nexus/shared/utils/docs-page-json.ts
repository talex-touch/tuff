import { DOCS_SUPPORTED_LOCALES, isDocsLocale, normalizeDocsPagePath, type DocsLocale } from './docs-path'

export const DOCS_PAGE_JSON_MODES = ['meta', 'body'] as const
export type DocsPageJsonMode = typeof DOCS_PAGE_JSON_MODES[number]

const DOCS_PAGE_JSON_ROUTE_PREFIX = '/api/docs/page'
const JSON_SUFFIX_PATTERN = /\.json$/i

export function isDocsPageJsonMode(value: unknown): value is DocsPageJsonMode {
  return value === 'meta' || value === 'body'
}

/**
 * The static URL of one document in one locale and body mode:
 * `/api/docs/page/en/body/dev/components/button.json`.
 *
 * The docs root (`/docs`) becomes `index.json` so the route always ends in a file name.
 */
export function toStaticDocsPageJsonPath(path: string | null | undefined, locale: DocsLocale, mode: DocsPageJsonMode) {
  const normalized = normalizeDocsPagePath(path)
  const relative = normalized === '/docs' ? '/index' : normalized.slice('/docs'.length)
  return `${DOCS_PAGE_JSON_ROUTE_PREFIX}/${locale}/${mode}${relative}.json`
}

/** Every static URL a document owns: both locales × both modes. */
export function toStaticDocsPageJsonPaths(path: string | null | undefined) {
  return DOCS_SUPPORTED_LOCALES.flatMap(locale =>
    DOCS_PAGE_JSON_MODES.map(mode => toStaticDocsPageJsonPath(path, locale, mode)),
  )
}

export interface StaticDocsPageJsonParams {
  locale: DocsLocale
  mode: DocsPageJsonMode
  /** The `/docs/...` page path the JSON describes. */
  path: string
}

/**
 * Parses the route params of `/api/docs/page/[locale]/[mode]/[...path].json`; `null` for
 * anything that is not exactly that shape.
 */
export function parseStaticDocsPageJsonParams(params: Record<string, unknown> | undefined | null): StaticDocsPageJsonParams | null {
  if (!params)
    return null

  const { locale, mode, path } = params
  if (!isDocsLocale(locale) || !isDocsPageJsonMode(mode) || typeof path !== 'string' || !path)
    return null

  if (!JSON_SUFFIX_PATTERN.test(path))
    return null

  const stem = path.replace(JSON_SUFFIX_PATTERN, '')
  if (!stem || stem.split('/').some(segment => !segment || segment === '.' || segment === '..'))
    return null

  return {
    locale,
    mode,
    path: stem === 'index' ? '/docs' : `/docs/${stem}`,
  }
}
