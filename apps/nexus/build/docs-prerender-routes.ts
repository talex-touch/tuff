import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { canonicalDocsPageIdentity, normalizeDocsPagePath, toLocalizedDocsPaths } from '../shared/utils/docs-path'
import { toStaticDocsPageJsonPaths } from '../shared/utils/docs-page-json'
import { toDocsMarkdownPaths } from '../shared/utils/docs-markdown'

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

/**
 * The raw-Markdown twin of every docs page: `/<locale>/docs/<path>.md`, the source an agent
 * reads instead of scraping the rendered HTML.
 *
 * Prerendered rather than served live for the same reason as the JSON twins, plus one that is
 * specific to these: the handler behind them reads the Markdown file off disk, and the
 * deployed Cloudflare Worker has no filesystem. Rendering them during the build — which still
 * runs on Node — is what makes the route work in production at all.
 *
 * A directory index is scanned as `/docs/dev/index` but its page is served at `/docs/dev`, so
 * both spellings get a twin. Only the canonical one is reachable by appending `.md` to a docs
 * URL, and without it that URL would reach the Worker and 404 — the rendered pages solve the
 * same mismatch with a post-build alias copy (`materialize-docs-index-aliases.mjs`).
 */
export function createDocsMarkdownPrerenderRoutes(nexusRoot: string) {
  const routes = new Set<string>()

  for (const route of createDocsPrerenderRoutes(nexusRoot)) {
    const normalized = normalizeDocsPagePath(route)
    for (const markdownRoute of toDocsMarkdownPaths(normalized))
      routes.add(markdownRoute)

    const canonical = canonicalDocsPageIdentity(normalized)
    if (canonical === normalized)
      continue
    for (const markdownRoute of toDocsMarkdownPaths(canonical))
      routes.add(markdownRoute)
  }

  return [...routes].sort((a, b) => a.localeCompare(b))
}
