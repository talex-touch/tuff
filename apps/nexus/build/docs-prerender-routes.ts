import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { DOCS_SUPPORTED_LOCALES, normalizeDocsPagePath, toLocalizedDocsPaths, type DocsLocale } from '../shared/utils/docs-path'

const DOC_FILE_PATTERN = /\.(md|mdc)$/i
const LOCALE_SUFFIX_PATTERN = /\.(en|zh)$/i
const COMPONENT_DOC_ROUTE_PREFIX = '/docs/dev/components/'

function toPosixPath(path: string) {
  return path.replace(/\\/g, '/')
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

export function normalizeDocsContentRoute(relativePath: string) {
  const normalized = toPosixPath(relativePath)
    .replace(DOC_FILE_PATTERN, '')
    .replace(LOCALE_SUFFIX_PATTERN, '')
    .replace(/^\/+/, '')

  if (!normalized)
    return []

  const canonicalPath = `/docs/${normalized}`
  const routes = new Set<string>(toLocalizedDocsPaths(canonicalPath))
  if (normalized === 'index') {
    for (const route of toLocalizedDocsPaths('/docs'))
      routes.add(route)
  }
  else if (normalized.endsWith('/index')) {
    const directoryPath = `/docs/${normalized.slice(0, -'/index'.length)}`
    for (const route of toLocalizedDocsPaths(directoryPath))
      routes.add(route)
  }

  return [...routes]
}

export function createDocsPrerenderRoutes(nexusRoot: string) {
  const docsRoot = join(nexusRoot, 'content/docs')
  const routes = new Set<string>()

  for (const file of walkFiles(docsRoot)) {
    if (!DOC_FILE_PATTERN.test(file))
      continue

    const relativePath = relative(docsRoot, file)
    for (const route of normalizeDocsContentRoute(relativePath))
      routes.add(route)
  }

  return [...routes].sort((a, b) => a.localeCompare(b))
}

function buildDocsPageApiRoute(path: string, locale: DocsLocale, includeBody: boolean) {
  const params = new URLSearchParams({
    path,
    locale,
    body: includeBody ? '1' : '0',
  })
  return `/api/docs/page?${params.toString()}`
}

export function createDocsPageApiPrerenderRoutes(nexusRoot: string) {
  const docsRoutes = createDocsPrerenderRoutes(nexusRoot)
  const componentPaths = new Set<string>()

  for (const route of docsRoutes) {
    const normalized = normalizeDocsPagePath(route)
    if (normalized.startsWith(COMPONENT_DOC_ROUTE_PREFIX))
      componentPaths.add(normalized)
  }

  const routes = new Set<string>()
  for (const path of componentPaths) {
    for (const locale of DOCS_SUPPORTED_LOCALES) {
      routes.add(buildDocsPageApiRoute(path, locale, false))
      routes.add(buildDocsPageApiRoute(path, locale, true))
    }
  }

  return [...routes].sort((a, b) => a.localeCompare(b))
}
