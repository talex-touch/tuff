import { requestJson } from '~/utils/request'
import { toStaticDocsPageJsonPath } from '#shared/utils/docs-page-json'
import { canonicalDocsPageIdentity, normalizeDocsPagePath } from '#shared/utils/docs-path'

type DocsPageBodyMode = '0' | '1'
type DocsPageLocale = 'en' | 'zh'
type DocsPageRecord = Record<string, any> | null

interface DocsPageRequestInput {
  path: string
  locale: DocsPageLocale
  body: DocsPageBodyMode
}

interface DocsPageRequestCacheEntry {
  cachedAt: number
  value: DocsPageRecord
}

const DOCS_PAGE_REQUEST_CACHE_LIMIT = 48
const DOCS_PAGE_REQUEST_CACHE_TTL_MS = 30_000
const DOCS_FULL_BODY_CACHE_LIMIT = 24
const docsPageRequestCache = new Map<string, DocsPageRequestCacheEntry>()
const docsPageRequestPending = new Map<string, Promise<DocsPageRecord>>()

/**
 * Rendered docs bodies, keyed by `doc-full:<path>:<locale>`. This lives at module
 * scope on purpose: the docs page remounts on every navigation, so an in-component
 * cache would be thrown away exactly when it is most useful.
 */
const docsFullBodyCache = new Map<string, DocsPageRecord>()

export function resolveDocsFullBodyCacheKey(path: string, locale: DocsPageLocale) {
  return `doc-full:${canonicalDocsPageIdentity(path)}:${locale}`
}

export function isDocsPageRecordForRoute(
  value: DocsPageRecord,
  path: string,
  locale: DocsPageLocale,
) {
  const rawPath = typeof value?.path === 'string'
    ? value.path
    : typeof value?._path === 'string'
      ? value._path
      : ''
  if (!rawPath)
    return false

  const localeMatch = rawPath.match(/\.(en|zh)$/)
  if (localeMatch?.[1] && localeMatch[1] !== locale)
    return false

  // A directory route resolves to its index document, so `/docs/dev` must accept the
  // `/docs/dev/index.en` record the API returns. Comparing them raw left SSR in `not-found`
  // and answered 404 for every directory alias.
  return canonicalDocsPageIdentity(rawPath.replace(/\.(en|zh)$/, ''))
    === canonicalDocsPageIdentity(path)
}

function resolveDocsFullBodyCacheKeyFromDoc(value: DocsPageRecord) {
  const rawPath = typeof value?.path === 'string'
    ? value.path
    : typeof value?._path === 'string'
      ? value._path
      : ''
  if (!rawPath)
    return null

  const locale = rawPath.match(/\.(en|zh)$/)?.[1] as DocsPageLocale | undefined
  if (!locale)
    return null

  return resolveDocsFullBodyCacheKey(rawPath.replace(/\.(en|zh)$/, ''), locale)
}

export function readCachedDocsFullBody(cacheKey: string) {
  if (!import.meta.client)
    return undefined
  return docsFullBodyCache.get(cacheKey)
}

export function hasCachedDocsFullBody(cacheKey: string) {
  return import.meta.client && docsFullBodyCache.has(cacheKey)
}

export function cacheDocsFullBody(value: DocsPageRecord) {
  if (!import.meta.client || value == null)
    return value

  const cacheKey = resolveDocsFullBodyCacheKeyFromDoc(value)
  if (!cacheKey)
    return value

  if (docsFullBodyCache.has(cacheKey))
    docsFullBodyCache.delete(cacheKey)
  docsFullBodyCache.set(cacheKey, value)

  const [, path, locale] = cacheKey.match(/^doc-full:(.*):(en|zh)$/) ?? []
  if (path && locale)
    primeDocsPageRequestCache({ path, locale: locale as DocsPageLocale, body: '1' }, value)

  while (docsFullBodyCache.size > DOCS_FULL_BODY_CACHE_LIMIT) {
    const oldestKey = docsFullBodyCache.keys().next().value
    if (!oldestKey)
      break
    docsFullBodyCache.delete(oldestKey)
  }

  return value
}

export function resolveDocsPageRequestCacheKey(input: DocsPageRequestInput) {
  return `docs-page:${canonicalDocsPageIdentity(input.path)}:${input.locale}:${input.body}`
}

function readCachedDocsPageRequest(cacheKey: string) {
  if (!import.meta.client)
    return undefined

  const cached = docsPageRequestCache.get(cacheKey)
  if (!cached)
    return undefined

  if (Date.now() - cached.cachedAt > DOCS_PAGE_REQUEST_CACHE_TTL_MS) {
    docsPageRequestCache.delete(cacheKey)
    return undefined
  }

  return cached.value
}

export function primeDocsPageRequestCache(input: DocsPageRequestInput, value: DocsPageRecord) {
  if (!import.meta.client)
    return value

  const cacheKey = resolveDocsPageRequestCacheKey(input)
  if (docsPageRequestCache.has(cacheKey))
    docsPageRequestCache.delete(cacheKey)
  docsPageRequestCache.set(cacheKey, {
    cachedAt: Date.now(),
    value,
  })

  while (docsPageRequestCache.size > DOCS_PAGE_REQUEST_CACHE_LIMIT) {
    const oldestKey = docsPageRequestCache.keys().next().value
    if (!oldestKey)
      break
    docsPageRequestCache.delete(oldestKey)
  }

  return value
}

/**
 * Reads the document from its prerendered static twin first and falls back to the Worker route
 * only when that read fails.
 *
 * The static file is what makes page-to-page navigation cheap: it is served by Cloudflare Pages
 * with the docs cache window, so it costs an edge hit rather than a Worker round trip (1–2 s
 * from CN). A document that is not on the prerender list (a route added between deploys, a dev
 * server with no prerender at all) answers 404 there, and the query route still knows how to
 * resolve it — including the development Markdown fallback — so the reader never sees the gap.
 * A rejected static read is retried exactly once through the query route, never looped.
 */
async function fetchDocsPageRecord(input: DocsPageRequestInput): Promise<DocsPageRecord> {
  const { path, locale, body } = input
  try {
    return await requestJson<DocsPageRecord>(toStaticDocsPageJsonPath(path, locale, body === '1' ? 'body' : 'meta'))
  }
  catch {
    return await requestJson<DocsPageRecord>('/api/docs/page', {
      query: {
        path,
        locale,
        body,
      },
    })
  }
}

export function requestDocsPage(input: DocsPageRequestInput) {
  const path = normalizeDocsPagePath(input.path)
  const { locale, body } = input
  const cacheKey = resolveDocsPageRequestCacheKey({ path, locale, body })
  const cached = readCachedDocsPageRequest(cacheKey)
  if (cached !== undefined)
    return Promise.resolve(cached)

  if (import.meta.client) {
    const pending = docsPageRequestPending.get(cacheKey)
    if (pending)
      return pending
  }

  const request = fetchDocsPageRecord({ path, locale, body }).then((value) => {
    primeDocsPageRequestCache({ path, locale, body }, value)
    return value
  }).finally(() => {
    if (import.meta.client)
      docsPageRequestPending.delete(cacheKey)
  })

  if (import.meta.client)
    docsPageRequestPending.set(cacheKey, request)

  return request
}
