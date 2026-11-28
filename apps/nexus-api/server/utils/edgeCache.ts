import type { H3Event } from 'h3'
import { getRequestHeader, getRequestURL } from 'h3'
import { runAfterResponse } from './afterResponse'

/**
 * Cloudflare's edge cache, used explicitly, for public responses that do not depend on who asks.
 *
 * A Pages Function runs in front of the CDN cache: a `Cache-Control` header on its response keeps
 * nothing at the edge, so every desktop update check, Store page and icon reached the Worker and paid
 * its D1 round trips (150–250 ms each from where CN traffic lands) and its R2 read. `caches.default` is
 * shared by every isolate in a colo, so a copy put there answers the next request in that colo with no
 * D1 or R2 at all.
 *
 * What it does not do, by design:
 * - Invalidate. `cache.delete` only reaches the local colo, so a copy lives out its TTL everywhere; the
 *   TTL of each route is therefore the staleness it can tolerate.
 * - Revalidate. The Cache API ignores `stale-while-revalidate`; a copy past its TTL is simply a miss.
 * - Run anywhere but a Worker on a zone. Without `caches.default` (Node dev, tests) callers take their
 *   original path untouched, and on `*.pages.dev` hosts the Cache API is a no-op, so a Preview
 *   deployment always reports `x-edge-cache: MISS`.
 *
 * A hit skips the handler, so it also skips whatever the handler would have recorded or enforced —
 * storage usage events, storage-channel policies, download counters. Only routes where that is
 * acceptable may use it.
 */

/** Response header that says whether the edge cache answered. */
export const EDGE_CACHE_STATUS_HEADER = 'x-edge-cache'

/** The client-facing `cache-control`, kept beside the one that sets the edge TTL. */
const CLIENT_CACHE_CONTROL_HEADER = 'x-edge-cache-client-cache-control'

const KEY_PATH_PREFIX = '/__edge-cache'

interface EdgeCacheStore {
  match: (request: Request) => Promise<Response | undefined>
  put: (request: Request, response: Response) => Promise<void>
}

export interface EdgeCacheKey {
  /** The route the copy belongs to; part of the key path. */
  name: string
  /**
   * Every input the response depends on, already normalized. Nothing else enters the key, so two
   * requests that differ only in an ignored parameter share a copy.
   */
  params?: Record<string, string | number | boolean | null | undefined>
}

/** A cacheable answer: always a 200, never carrying `set-cookie`. */
export interface EdgeCacheEntry {
  body: string | Uint8Array | ArrayBuffer
  headers: Record<string, string>
}

export interface EdgeCacheHandle {
  /** The stored copy, ready to return — or, for a conditional request it satisfies, a 304. */
  hit: Response | null
  /**
   * Answers with `entry` and stores it for `ttlSeconds` after the response. A TTL below one second
   * answers without storing.
   */
  store: (entry: EdgeCacheEntry, ttlSeconds: number) => Response
}

function resolveEdgeCacheStore(): EdgeCacheStore | null {
  const storage = (globalThis as { caches?: { default?: EdgeCacheStore } }).caches
  const store = storage?.default
  return store && typeof store.match === 'function' && typeof store.put === 'function' ? store : null
}

export function edgeCacheKeyUrl(origin: string, key: EdgeCacheKey): string {
  const url = new URL(`${KEY_PATH_PREFIX}/${key.name.replace(/^\/+/, '')}`, origin)
  for (const name of Object.keys(key.params ?? {}).sort()) {
    const value = key.params![name]
    if (value === undefined || value === null)
      continue
    url.searchParams.set(name, String(value))
  }
  return url.toString()
}

/** Any typed array is a valid body; the DOM types only admit ones over an `ArrayBuffer`. */
function bodyInit(body: EdgeCacheEntry['body']): BodyInit {
  return (body instanceof ArrayBuffer ? new Uint8Array(body) : body) as BodyInit
}

function notModified(headers: Headers): Response {
  const result = new Headers()
  for (const name of ['etag', 'cache-control', 'x-content-sha256', EDGE_CACHE_STATUS_HEADER]) {
    const value = headers.get(name)
    if (value !== null)
      result.set(name, value)
  }
  return new Response(null, { status: 304, headers: result })
}

function matchesIfNoneMatch(event: H3Event, headers: Headers): boolean {
  const etag = headers.get('etag')
  const ifNoneMatch = getRequestHeader(event, 'if-none-match')
  return Boolean(etag && ifNoneMatch && ifNoneMatch === etag)
}

/** The stored copy as the client should see it: its own `cache-control`, not the edge TTL. */
function clientResponseFromStored(stored: Response): Response {
  const headers = new Headers(stored.headers)
  const clientCacheControl = headers.get(CLIENT_CACHE_CONTROL_HEADER)
  headers.delete(CLIENT_CACHE_CONTROL_HEADER)
  headers.delete('cache-control')
  // Freshness the edge may have derived from its own TTL, which the client was never meant to keep.
  headers.delete('expires')
  headers.delete('set-cookie')
  if (clientCacheControl)
    headers.set('cache-control', clientCacheControl)
  headers.set(EDGE_CACHE_STATUS_HEADER, 'HIT')
  return new Response(stored.body, { status: 200, headers })
}

/**
 * Looks `key` up in the colo's edge cache. Resolves to `null` where there is no edge cache, and the
 * caller then answers exactly as it did before this cache existed.
 *
 * With `conditional`, a request whose `If-None-Match` equals the copy's `etag` is answered 304, as
 * the routes that send an `etag` already did.
 */
export async function openEdgeCache(
  event: H3Event,
  key: EdgeCacheKey,
  options: { conditional?: boolean } = {},
): Promise<EdgeCacheHandle | null> {
  const store = resolveEdgeCacheStore()
  if (!store)
    return null

  const keyUrl = edgeCacheKeyUrl(getRequestURL(event).origin, key)
  // A cache that cannot answer is a miss, never a failed request.
  const stored = await store.match(new Request(keyUrl)).catch(() => undefined)

  let hit: Response | null = null
  if (stored && stored.status === 200) {
    hit = clientResponseFromStored(stored)
    if (options.conditional && matchesIfNoneMatch(event, hit.headers)) {
      await hit.body?.cancel()
      hit = notModified(hit.headers)
    }
  }

  return {
    hit,
    store(entry, ttlSeconds) {
      const body = bodyInit(entry.body)
      const headers = new Headers(entry.headers)
      headers.delete('set-cookie')
      const ttl = Math.floor(ttlSeconds)

      if (ttl >= 1) {
        const storedHeaders = new Headers(headers)
        const clientCacheControl = storedHeaders.get('cache-control')
        if (clientCacheControl)
          storedHeaders.set(CLIENT_CACHE_CONTROL_HEADER, clientCacheControl)
        storedHeaders.set('cache-control', `public, max-age=${ttl}, s-maxage=${ttl}`)
        const copy = new Response(body, { status: 200, headers: storedHeaders })
        runAfterResponse(event, 'edge cache put', () => store.put(new Request(keyUrl), copy))
      }

      headers.set(EDGE_CACHE_STATUS_HEADER, 'MISS')
      if (options.conditional && matchesIfNoneMatch(event, headers))
        return notModified(headers)
      return new Response(body, { status: 200, headers })
    },
  }
}
