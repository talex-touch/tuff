import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

export const SUPPORTED_LOCALES = ['en', 'zh'] as const
export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number]

export const NOT_FOUND_PRERENDER_ROUTE = '/__not-found'

const DOC_FILE_PATTERN = /\.(md|mdc)$/i
const LOCALE_SUFFIX_PATTERN = /\.(en|zh)$/i

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/')
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir))
    return []

  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stats = statSync(fullPath)
    if (stats.isDirectory()) {
      files.push(...walkFiles(fullPath))
      continue
    }
    if (stats.isFile())
      files.push(fullPath)
  }
  return files
}

/**
 * Maps a file path relative to `content/docs/` onto its public app route (without `baseURL`).
 *
 * Mapping:
 * - `components/index.{en,zh}.mdc`   -> `/{en,zh}`
 * - `components/<slug>.{en,zh}.mdc`  -> `/{en,zh}/<slug>`
 * - `concepts/index.{en,zh}.mdc`     -> `/{en,zh}/concepts`
 * - `concepts/<slug>.{en,zh}.mdc`    -> `/{en,zh}/concepts/<slug>`
 * - `composition.{en,zh}.mdc`        -> `/{en,zh}/composition`
 */
export function contentFileToAppRoute(relativeFilePath: string): { locale: SupportedLocale, slug: string, route: string } | null {
  const posix = toPosixPath(relativeFilePath).replace(/^\/+/, '')
  if (!DOC_FILE_PATTERN.test(posix))
    return null

  const withoutExt = posix.replace(DOC_FILE_PATTERN, '')
  const localeMatch = withoutExt.match(LOCALE_SUFFIX_PATTERN)
  if (!localeMatch)
    return null

  const locale = localeMatch[1]!.toLowerCase() as SupportedLocale
  const basePath = withoutExt.replace(LOCALE_SUFFIX_PATTERN, '')

  if (basePath === 'components/index')
    return { locale, slug: '', route: `/${locale}` }

  if (basePath.startsWith('components/')) {
    const slug = basePath.slice('components/'.length)
    return { locale, slug, route: `/${locale}/${slug}` }
  }

  if (basePath === 'concepts/index')
    return { locale, slug: 'concepts', route: `/${locale}/concepts` }

  if (basePath.startsWith('concepts/')) {
    const slug = basePath
    return { locale, slug, route: `/${locale}/${slug}` }
  }

  if (basePath === 'composition')
    return { locale, slug: 'composition', route: `/${locale}/composition` }

  return { locale, slug: basePath, route: `/${locale}/${basePath}` }
}

/**
 * Discovers all routes to prerender for `apps/tuffex-docs`:
 * - `/` (locale entry redirect)
 * - `/__not-found` (SSR-rendered 404 staged to `.dist-cf/tuffex/404.html`)
 * - All localized doc routes (`/en`, `/zh`, `/en/<slug>`, `/zh/<slug>`, `/en/concepts/...`, `/en/composition`, ...)
 */
export function createTuffexPrerenderRoutes(appRoot: string): string[] {
  const docsRoot = join(appRoot, 'content/docs')
  const routes = new Set<string>([
    '/',
    NOT_FOUND_PRERENDER_ROUTE,
    '/en',
    '/zh',
  ])

  for (const file of walkFiles(docsRoot)) {
    const rel = relative(docsRoot, file)
    const mapped = contentFileToAppRoute(rel)
    if (mapped)
      routes.add(mapped.route)
  }

  return [...routes].sort((a, b) => a.localeCompare(b))
}
