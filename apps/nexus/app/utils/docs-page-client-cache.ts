import { requestJson } from '~/utils/request'
import { normalizeDocsPagePath } from '#shared/utils/docs-path'

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
const docsPageRequestCache = new Map<string, DocsPageRequestCacheEntry>()
const docsPageRequestPending = new Map<string, Promise<DocsPageRecord>>()

export function resolveDocsPageRequestCacheKey(input: DocsPageRequestInput) {
  return `docs-page:${normalizeDocsPagePath(input.path)}:${input.locale}:${input.body}`
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

  const request = requestJson<DocsPageRecord>('/api/docs/page', {
    query: {
      path,
      locale,
      body,
    },
  }).then((value) => {
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
