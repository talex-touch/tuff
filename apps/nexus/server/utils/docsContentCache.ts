import type { H3Event } from 'h3'
import process from 'node:process'
import { isMissingDocsContentTableError } from './docsContentError'

export const DOCS_CONTENT_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=3600'
export const DOCS_CONTENT_CACHE_MAX_AGE_SECONDS = 300
export const DOCS_CONTENT_CACHE_STALE_MAX_AGE_SECONDS = 3600

const DOCS_CONTENT_DEGRADED_WINDOW_MS = 30_000

let degradedUntil = 0

/**
 * Shared by every docs endpoint. An empty payload is indistinguishable from a
 * collection that is still importing, so once any endpoint proves the content
 * database is down the others stop trusting emptiness until the window closes.
 */
export const docsContentAvailability = {
  markUnavailable() {
    degradedUntil = Date.now() + DOCS_CONTENT_DEGRADED_WINDOW_MS
  },
  isDegraded() {
    return Date.now() < degradedUntil
  },
  /** Test-only: module-level state would otherwise leak between cases. */
  reset() {
    degradedUntil = 0
  },
}

class UncacheableDocsContentError extends Error {
  constructor(readonly payload: unknown) {
    super('Docs content resolved to an uncacheable payload')
    this.name = 'UncacheableDocsContentError'
  }
}

/**
 * Hands `value` back to the caller without storing it. Throwing is what tells
 * nitro to skip the cache write, so a degraded response cannot outlive the
 * outage that produced it.
 */
export function uncacheableDocsContent(value: unknown): never {
  throw new UncacheableDocsContentError(value)
}

function isEmptyByDefault(result: unknown) {
  if (result === null || result === undefined)
    return true

  return Array.isArray(result) && result.length === 0
}

function createDocsContentUnavailableError(error: unknown) {
  const isProduction = process.env.NODE_ENV === 'production'

  if (!isProduction)
    console.warn('[docs-content] Nuxt Content could not query the docs collection.', error)

  // A silent empty payload reads as "this section has no pages"; 503 keeps the
  // docs UI on its error state so a broken content database stays visible.
  return createError({
    statusCode: 503,
    statusMessage: 'Docs content database is unavailable',
    message: isProduction
      ? 'Docs content is temporarily unavailable.'
      : 'Nuxt Content could not query the docs collection. Run `pnpm rebuild -r better-sqlite3`, then reload.',
  })
}

export interface DocsContentCacheOptions<A extends unknown[], R> {
  name: string
  getKey: (...args: A) => string
  /** Defaults to null, undefined, or an empty array. */
  isEmpty?: (result: R) => boolean
  /** Collection-wide reads: an empty payload is never legitimate. */
  treatEmptyAsUnavailable?: boolean
  maxAge?: number
  staleMaxAge?: number
}

/**
 * Wraps a docs content read with the caching policy every docs endpoint shares:
 * only meaningful results are cached, and an unreachable content database is
 * reported as 503 rather than served as a successful empty response.
 *
 * The cache sits inside the success path on purpose. nitro stores a value only
 * after the wrapped function resolves, so throwing is the whole mechanism that
 * keeps degraded payloads out of the cache. Once a good value is cached, nitro's
 * stale-while-revalidate keeps serving it and swallows failed background
 * refreshes, which is the behaviour we want during a transient outage.
 */
export function cacheDocsContent<A extends unknown[], R>(
  resolve: (event: H3Event, ...args: A) => Promise<R>,
  options: DocsContentCacheOptions<A, R>,
) {
  const isEmpty = options.isEmpty ?? (isEmptyByDefault as (result: R) => boolean)

  const resolveCached = defineCachedFunction(async (event: H3Event, ...args: A) => {
    const result = await resolve(event, ...args)

    if (isEmpty(result) && (options.treatEmptyAsUnavailable || docsContentAvailability.isDegraded()))
      uncacheableDocsContent(result)

    return result
  }, {
    name: options.name,
    maxAge: options.maxAge ?? DOCS_CONTENT_CACHE_MAX_AGE_SECONDS,
    staleMaxAge: options.staleMaxAge ?? DOCS_CONTENT_CACHE_STALE_MAX_AGE_SECONDS,
    getKey: (_event: H3Event, ...args: A) => options.getKey(...args),
  })

  return async (event: H3Event, ...args: A): Promise<R> => {
    try {
      const result = await resolveCached(event, ...args)
      setHeader(event, 'cache-control', DOCS_CONTENT_CACHE_CONTROL)
      return result
    }
    catch (error) {
      if (error instanceof UncacheableDocsContentError)
        return error.payload as R

      if (!isMissingDocsContentTableError(error))
        throw error

      docsContentAvailability.markUnavailable()
      throw createDocsContentUnavailableError(error)
    }
  }
}
