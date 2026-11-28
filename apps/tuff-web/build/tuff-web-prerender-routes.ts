import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

export type SupportedLocale = 'en' | 'zh'
export type PolicyDocName = 'license' | 'privacy' | 'protocol'

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = ['en', 'zh']
export const POLICY_DOC_NAMES: readonly PolicyDocName[] = ['license', 'privacy', 'protocol']

export const PUBLIC_BASE_ROUTES = [
  '/',
  '/pricing',
  '/updates',
  '/updates/all',
  '/store',
  '/license',
  '/privacy',
  '/protocol',
] as const

export const NOT_FOUND_PRERENDER_ROUTE = '/__not-found'

export interface MappedDocRoute {
  locale: SupportedLocale
  /** Normalized slash-trimmed slug below `/docs` (empty string for `/docs` root). */
  slug: string
  /** Canonical app route (e.g. `/en/docs`, `/zh/docs/guide/start`, `/en/docs/dev`). */
  route: string
  /** Relative paths under `.dist-cf/` for raw Markdown twins. */
  rawTargets: string[]
  /** Canonical public raw Markdown path (starts with `/en/docs/` or `/zh/docs/`). */
  canonicalRawPath: string
}

export interface LegacyRedirectRule {
  from: string
  to: string
  status: 308
}

/**
 * Cloudflare Workers Static Assets `_redirects` rules (static before dynamic,
 * TuffEx redirects strictly before `/docs/*` so `/docs/*` never shadows them).
 */
export const LEGACY_REDIRECT_RULES: readonly LegacyRedirectRule[] = [
  // Static exact rules first
  { from: '/en/docs/dev/components', to: '/tuffex/en', status: 308 },
  { from: '/zh/docs/dev/components', to: '/tuffex/zh', status: 308 },
  { from: '/en/docs/dev/concepts', to: '/tuffex/en/concepts', status: 308 },
  { from: '/zh/docs/dev/concepts', to: '/tuffex/zh/concepts', status: 308 },
  { from: '/docs/dev/components', to: '/tuffex/en', status: 308 },
  { from: '/docs/dev/concepts', to: '/tuffex/en/concepts', status: 308 },
  { from: '/en/docs/dev/getting-started/tuffex-composition', to: '/tuffex/en/composition', status: 308 },
  { from: '/zh/docs/dev/getting-started/tuffex-composition', to: '/tuffex/zh/composition', status: 308 },
  { from: '/llms.txt', to: '/tuffex/llms.txt', status: 308 },
  { from: '/docs', to: '/en/docs', status: 308 },
  { from: '/terms', to: '/license', status: 308 },
  // Dynamic splat rules: TuffEx subpaths MUST precede `/docs/*`
  { from: '/en/docs/dev/components/*', to: '/tuffex/en/:splat', status: 308 },
  { from: '/zh/docs/dev/components/*', to: '/tuffex/zh/:splat', status: 308 },
  { from: '/en/docs/dev/concepts/*', to: '/tuffex/en/concepts/:splat', status: 308 },
  { from: '/zh/docs/dev/concepts/*', to: '/tuffex/zh/concepts/:splat', status: 308 },
  { from: '/docs/dev/components/*', to: '/tuffex/en/:splat', status: 308 },
  { from: '/docs/dev/concepts/*', to: '/tuffex/en/concepts/:splat', status: 308 },
  { from: '/docs/*', to: '/en/docs/:splat', status: 308 },
]

const DOC_FILE_PATTERN = /\.(mdc|md)$/i
const LOCALE_SUFFIX_PATTERN = /\.(en|zh)$/i

function toPosix(value: string): string {
  return value.replace(/\\/g, '/')
}

function walkFiles(dir: string): string[] {
  if (!existsSync(dir))
    return []
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory())
      out.push(...walkFiles(full))
    else if (st.isFile())
      out.push(full)
  }
  return out
}

export function docContentFileToAppRoute(relativePath: string): MappedDocRoute | null {
  const posix = toPosix(relativePath).replace(/^\/+/, '')
  if (!DOC_FILE_PATTERN.test(posix))
    return null

  const withoutExt = posix.replace(DOC_FILE_PATTERN, '')
  const localeMatch = withoutExt.match(LOCALE_SUFFIX_PATTERN)
  if (!localeMatch)
    return null

  const locale = localeMatch[1]!.toLowerCase() as SupportedLocale
  const basePath = withoutExt.replace(LOCALE_SUFFIX_PATTERN, '')

  if (basePath === 'index') {
    return {
      locale,
      slug: '',
      route: `/${locale}/docs`,
      rawTargets: [`${locale}/docs.md`, `${locale}/docs/index.md`],
      canonicalRawPath: `/${locale}/docs/index.md`,
    }
  }

  if (basePath.endsWith('/index')) {
    const slug = basePath.slice(0, -'/index'.length)
    return {
      locale,
      slug,
      route: `/${locale}/docs/${slug}`,
      rawTargets: [`${locale}/docs/${slug}.md`, `${locale}/docs/${slug}/index.md`],
      canonicalRawPath: `/${locale}/docs/${slug}.md`,
    }
  }

  return {
    locale,
    slug: basePath,
    route: `/${locale}/docs/${basePath}`,
    rawTargets: [`${locale}/docs/${basePath}.md`],
    canonicalRawPath: `/${locale}/docs/${basePath}.md`,
  }
}

export function createPublicPrerenderRoutes(): string[] {
  const routes = new Set<string>(PUBLIC_BASE_ROUTES)
  for (const locale of SUPPORTED_LOCALES) {
    routes.add(`/${locale}`)
    for (const base of PUBLIC_BASE_ROUTES) {
      if (base !== '/')
        routes.add(`/${locale}${base}`)
    }
  }
  return [...routes].sort((a, b) => a.localeCompare(b))
}

export function createTuffWebDocPrerenderRoutes(appRoot: string): string[] {
  const contentDocsDir = resolve(appRoot, 'content/docs')
  const routes = new Set<string>()
  for (const file of walkFiles(contentDocsDir)) {
    const mapped = docContentFileToAppRoute(relative(contentDocsDir, file))
    if (mapped)
      routes.add(mapped.route)
  }
  return [...routes].sort((a, b) => a.localeCompare(b))
}

export function createTuffWebPrerenderRoutes(appRoot: string): string[] {
  const routes = new Set<string>([
    NOT_FOUND_PRERENDER_ROUTE,
    ...createPublicPrerenderRoutes(),
    ...createTuffWebDocPrerenderRoutes(appRoot),
  ])
  return [...routes].sort((a, b) => a.localeCompare(b))
}
