import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { normalizeDocsPagePath, toLocalizedDocsPaths } from '../shared/utils/docs-path'
import { toStaticDocsPageJsonPaths } from '../shared/utils/docs-page-json'

const DOC_FILE_PATTERN = /\.(md|mdc)$/i
const LOCALE_SUFFIX_PATTERN = /\.(en|zh)$/i

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

  return toLocalizedDocsPaths(`/docs/${normalized}`)
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

/**
 * The static JSON twin of every docs page: `/api/docs/page/<locale>/<mode>/<path>.json` for
 * both locales and both body modes. Path-shaped on purpose — a query-string route cannot be a
 * file on Cloudflare Pages, which is what sank the earlier attempt (`af99441e0`). With these
 * prerendered, client-side navigation between docs pages reads a static asset instead of
 * asking the Worker.
 */
export function createDocsPageApiPrerenderRoutes(nexusRoot: string) {
  const routes = new Set<string>()

  for (const route of createDocsPrerenderRoutes(nexusRoot)) {
    for (const jsonRoute of toStaticDocsPageJsonPaths(normalizeDocsPagePath(route)))
      routes.add(jsonRoute)
  }

  return [...routes].sort((a, b) => a.localeCompare(b))
}
