import type { H3Event } from 'h3'
import { queryCollectionNavigation } from '@nuxt/content/server'
import { isMissingDocsContentTableError } from '../../utils/docsContentError'

const DEV_NAVIGATION_RETRY_ATTEMPTS = 3
const DEV_NAVIGATION_RETRY_DELAY_MS = 80
const NAVIGATION_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600'
const NAVIGATION_CACHE_MAX_AGE_SECONDS = 300
const NAVIGATION_CACHE_STALE_MAX_AGE_SECONDS = 3600

function toPlainJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeLocale(value: unknown): 'en' | 'zh' | null {
  if (typeof value !== 'string')
    return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'en' || normalized === 'zh')
    return normalized
  return null
}

function resolvePathLocale(path: unknown): 'en' | 'zh' | null {
  if (typeof path !== 'string')
    return null
  if (path.endsWith('.zh'))
    return 'zh'
  if (path.endsWith('.en'))
    return 'en'
  return null
}

function filterNavigationByLocale(items: unknown, locale: 'en' | 'zh' | null): unknown {
  if (!locale || !Array.isArray(items))
    return items

  return items
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item))
        return item

      const record = item as Record<string, unknown>
      const pathLocale = resolvePathLocale(record.path)
      if (pathLocale && pathLocale !== locale)
        return null

      const children = filterNavigationByLocale(record.children, locale)
      return Array.isArray(children)
        ? { ...record, children }
        : record
    })
    .filter(Boolean)
}

async function queryDocsNavigation(event: H3Event) {
  const isProduction = process.env.NODE_ENV === 'production'
  const maxAttempts = isProduction ? 1 : DEV_NAVIGATION_RETRY_ATTEMPTS
  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await queryCollectionNavigation(event, 'docs')
    }
    catch (error) {
      lastError = error
      if (isProduction || !isMissingDocsContentTableError(error) || attempt >= maxAttempts)
        break
      await sleep(DEV_NAVIGATION_RETRY_DELAY_MS)
    }
  }

  if (!isProduction && isMissingDocsContentTableError(lastError)) {
    console.warn('[api/docs/navigation] Nuxt Content docs table is not ready; returning an empty navigation tree in development.', lastError)
    return []
  }

  throw lastError
}

function resolveNavigationCacheKey(event: H3Event) {
  const locale = normalizeLocale(getQuery(event).locale)
  return locale ? `locale:${locale}` : 'locale:all'
}

export default defineCachedEventHandler(async (event) => {
  const locale = normalizeLocale(getQuery(event).locale)
  const navigation = await queryDocsNavigation(event)
  const localizedNavigation = filterNavigationByLocale(navigation, locale)

  setHeader(event, 'cache-control', NAVIGATION_CACHE_CONTROL)

  return toPlainJson(Array.isArray(localizedNavigation) ? localizedNavigation : [])
}, {
  maxAge: NAVIGATION_CACHE_MAX_AGE_SECONDS,
  staleMaxAge: NAVIGATION_CACHE_STALE_MAX_AGE_SECONDS,
  name: 'docs-navigation',
  getKey: resolveNavigationCacheKey,
})
