import type { H3Event } from 'h3'
import { queryCollection } from '@nuxt/content/server'
import { isMissingDocsContentTableError } from '../../utils/docsContentError'
import { normalizeDocsPagePath } from '../../utils/docsPath'

const DOCS_PAGE_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600'
const DOCS_PAGE_CACHE_MAX_AGE_SECONDS = 300
const DOCS_PAGE_CACHE_STALE_MAX_AGE_SECONDS = 3600
const DEV_DOCS_CONTENT_FALLBACK_WINDOW_MS = 10_000

type DocsPageRecord = Record<string, unknown> & {
  body?: unknown
  path?: string
  _path?: string
}

interface DevDocsPageCacheEntry {
  mtimeMs: number
  fullDoc?: DocsPageRecord
  metaDoc?: DocsPageRecord
}

const devDocsPageFileCache = new Map<string, DevDocsPageCacheEntry>()
let devDocsContentFallbackUntil = 0

function normalizeLocale(value: unknown): 'en' | 'zh' {
  if (typeof value !== 'string')
    return 'en'
  const normalized = value.trim().toLowerCase()
  return normalized === 'zh' ? 'zh' : 'en'
}

function toPlainJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function parseFrontmatterScalar(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed)
    return ''
  if (trimmed === 'true')
    return true
  if (trimmed === 'false')
    return false
  if (trimmed === 'null')
    return null
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed))
    return Number(trimmed)
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
    || (trimmed.startsWith('\'') && trimmed.endsWith('\''))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function parseFrontmatterMetadata(raw: string) {
  if (!raw.startsWith('---'))
    return {}

  const frontmatterEnd = raw.indexOf('\n---', 3)
  if (frontmatterEnd === -1)
    return {}

  const metadata: Record<string, unknown> = {}
  const frontmatter = raw.slice(3, frontmatterEnd).trim()
  for (const line of frontmatter.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#'))
      continue

    const separatorIndex = trimmed.indexOf(':')
    if (separatorIndex <= 0)
      continue

    const key = trimmed.slice(0, separatorIndex).trim()
    if (!key)
      continue

    metadata[key] = parseFrontmatterScalar(trimmed.slice(separatorIndex + 1))
  }

  return metadata
}

function shouldIncludeBody(value: unknown) {
  if (typeof value !== 'string')
    return true
  const normalized = value.trim().toLowerCase()
  return !['0', 'false', 'no', 'off'].includes(normalized)
}

function serializeDoc<T extends { body?: unknown } | null>(doc: T, includeBody: boolean) {
  if (!doc || includeBody)
    return toPlainJson(doc)

  const { body: _body, ...metadata } = toPlainJson(doc)
  return toPlainJson(metadata)
}

function buildDocsPageLookupPaths(docPath: string, locale: 'en' | 'zh') {
  const localizedPath = `${docPath}.${locale}`
  const baseDocPath = docPath.replace(/\/index$/, '')
  const localizedIndexPath = `${baseDocPath}/index.${locale}`
  const indexPath = `${baseDocPath}/index`
  const shouldTryIndex = !docPath.endsWith('/index')

  return [
    localizedPath,
    ...(shouldTryIndex ? [localizedIndexPath] : []),
    docPath,
    ...(shouldTryIndex ? [indexPath] : []),
  ]
}

async function queryDocsPage(event: H3Event, lookupPaths: string[]) {
  for (const path of lookupPaths) {
    const doc = await queryCollection(event, 'docs').path(path).first()
    if (doc)
      return doc
  }

  return null
}

function isProduction() {
  return process.env.NODE_ENV === 'production'
}

function shouldPreferDevDocsFallback() {
  return !isProduction() && Date.now() < devDocsContentFallbackUntil
}

function shouldPreferDevDocsMetadataFileLookup(docPath: string, includeBody: boolean) {
  return process.env.NODE_ENV === 'development' && !includeBody && docPath.includes('/docs/dev/components')
}

function markDevDocsContentUnavailable() {
  devDocsContentFallbackUntil = Date.now() + DEV_DOCS_CONTENT_FALLBACK_WINDOW_MS
}

function normalizeDocsContentStem(contentPath: string) {
  if (contentPath === '/docs')
    return 'index'

  if (contentPath.startsWith('/docs/'))
    return contentPath.slice('/docs/'.length) || 'index'

  if (contentPath.startsWith('/docs.'))
    return `index${contentPath.slice('/docs'.length)}`

  return null
}

function isSafeContentStem(stem: string) {
  if (!stem || stem.includes('\0'))
    return false

  return stem
    .split('/')
    .every(segment => segment && segment !== '.' && segment !== '..')
}

function buildDevDocsContentCandidates(contentPath: string) {
  const stem = normalizeDocsContentStem(contentPath)
  if (!stem || !isSafeContentStem(stem))
    return []

  return [`${stem}.mdc`, `${stem}.md`]
}

function isFileNotFound(error: unknown) {
  return Boolean(
    error
    && typeof error === 'object'
    && (error as { code?: unknown }).code === 'ENOENT',
  )
}

async function readDevDocsPageFromFile(contentPath: string, includeBody: boolean): Promise<DocsPageRecord | null> {
  if (isProduction())
    return null

  const candidates = buildDevDocsContentCandidates(contentPath)
  if (!candidates.length)
    return null

  const [{ readFile, stat }, { resolve, sep }] = await Promise.all([
    import('node:fs/promises'),
    import('node:path'),
  ])
  const docsRoot = resolve(process.cwd(), 'content/docs')
  const docsRootPrefix = `${docsRoot}${sep}`

  for (const relativeFile of candidates) {
    const filePath = resolve(docsRoot, relativeFile)
    if (filePath !== docsRoot && !filePath.startsWith(docsRootPrefix))
      continue

    let fileStat: { mtimeMs: number }
    try {
      fileStat = await stat(filePath)
    }
    catch (error) {
      if (isFileNotFound(error))
        continue
      throw error
    }

    const cached = devDocsPageFileCache.get(filePath)
    if (cached && cached.mtimeMs === fileStat.mtimeMs) {
      const cachedDoc = includeBody ? cached.fullDoc : cached.metaDoc
      if (cachedDoc)
        return cachedDoc
    }

    const raw = await readFile(filePath, 'utf8')
    if (!includeBody) {
      const data = parseFrontmatterMetadata(raw)
      const doc: DocsPageRecord = {
        ...data,
        path: contentPath,
        _path: contentPath,
        meta: data,
      }
      const nextCache = cached && cached.mtimeMs === fileStat.mtimeMs
        ? cached
        : { mtimeMs: fileStat.mtimeMs }
      nextCache.metaDoc = doc
      devDocsPageFileCache.set(filePath, nextCache)
      return doc
    }

    const { parseMarkdown } = await import('@nuxtjs/mdc/runtime')
    const parsed = await parseMarkdown(raw, {
      highlight: false,
      toc: { depth: 4, searchDepth: 4 },
    })
    const data = parsed.data && typeof parsed.data === 'object'
      ? parsed.data as Record<string, unknown>
      : {}
    const body = parsed.body && typeof parsed.body === 'object'
      ? { ...parsed.body, toc: parsed.toc }
      : parsed.body
    const doc: DocsPageRecord = {
      ...data,
      path: contentPath,
      _path: contentPath,
      meta: data,
      body,
      toc: parsed.toc,
    }
    const nextCache = cached && cached.mtimeMs === fileStat.mtimeMs
      ? cached
      : { mtimeMs: fileStat.mtimeMs }
    nextCache.fullDoc = doc
    devDocsPageFileCache.set(filePath, nextCache)
    return doc
  }

  return null
}

async function readDevDocsPageFallback(lookupPaths: string[], includeBody: boolean) {
  for (const path of lookupPaths) {
    const doc = await readDevDocsPageFromFile(path, includeBody)
    if (doc)
      return doc
  }

  return null
}

function resolveDocsPageCacheKey(event: H3Event) {
  const query = getQuery(event)
  const docPath = normalizeDocsPagePath(typeof query.path === 'string' ? query.path : '/docs')
  const locale = normalizeLocale(query.locale)
  const body = shouldIncludeBody(query.body) ? 'body' : 'meta'
  return `${docPath}:${locale}:${body}`
}

export default defineCachedEventHandler(async (event) => {
  const query = getQuery(event)
  const docPath = normalizeDocsPagePath(typeof query.path === 'string' ? query.path : '/docs')
  const locale = normalizeLocale(query.locale)
  const includeBody = shouldIncludeBody(query.body)
  const lookupPaths = buildDocsPageLookupPaths(docPath, locale)

  if (shouldPreferDevDocsMetadataFileLookup(docPath, includeBody)) {
    const fallbackDoc = await readDevDocsPageFallback(lookupPaths, includeBody)
    if (fallbackDoc) {
      setHeader(event, 'cache-control', DOCS_PAGE_CACHE_CONTROL)
      return serializeDoc(fallbackDoc, includeBody)
    }
  }

  if (shouldPreferDevDocsFallback()) {
    const fallbackDoc = await readDevDocsPageFallback(lookupPaths, includeBody)
    if (fallbackDoc) {
      setHeader(event, 'cache-control', DOCS_PAGE_CACHE_CONTROL)
      return serializeDoc(fallbackDoc, includeBody)
    }
  }

  try {
    const doc = await queryDocsPage(event, lookupPaths)
    setHeader(event, 'cache-control', DOCS_PAGE_CACHE_CONTROL)
    return doc ? serializeDoc(doc, includeBody) : null
  }
  catch (error) {
    if (isProduction() || !isMissingDocsContentTableError(error))
      throw error

    markDevDocsContentUnavailable()
    const fallbackDoc = await readDevDocsPageFallback(lookupPaths, includeBody)
    setHeader(event, 'cache-control', DOCS_PAGE_CACHE_CONTROL)

    if (fallbackDoc) {
      console.warn('[api/docs/page] Nuxt Content docs table is not ready; rendering the local Markdown file in development.', error)
      return serializeDoc(fallbackDoc, includeBody)
    }

    return null
  }
}, {
  maxAge: DOCS_PAGE_CACHE_MAX_AGE_SECONDS,
  staleMaxAge: DOCS_PAGE_CACHE_STALE_MAX_AGE_SECONDS,
  name: 'docs-page',
  getKey: resolveDocsPageCacheKey,
})
