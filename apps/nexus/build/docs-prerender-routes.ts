import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const DOC_FILE_PATTERN = /\.(md|mdc)$/i
const LOCALE_SUFFIX_PATTERN = /\.(en|zh)$/i
const STATIC_DOC_ROUTE_ALLOWLIST = new Set([
  'dev/index',
  'guide/features/preview',
  'guide/index',
  'guide/start',
  'hello',
  'index',
])

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

  if (!normalized || !STATIC_DOC_ROUTE_ALLOWLIST.has(normalized))
    return []

  const routes = new Set<string>([`/docs/${normalized}`])
  if (normalized === 'index') {
    routes.add('/docs')
  }
  else if (normalized.endsWith('/index')) {
    routes.add(`/docs/${normalized.slice(0, -'/index'.length)}`)
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
