import type { H3Event } from 'h3'
import { afterEach, describe, expect, it } from 'vitest'
import { createFakeEdgeCache, flushAfterResponse } from '../../test/helpers/edge-cache'
import { edgeCacheKeyUrl, openEdgeCache } from './edgeCache'

function eventFor(path = '/api/example', headers: Record<string, string> = {}): H3Event {
  return {
    path,
    node: { req: { url: path, headers: { host: 'tuff.test', ...headers } } },
    context: {},
  } as unknown as H3Event
}

const KEY = { name: 'example', params: { channel: 'RELEASE' } }

afterEach(() => {
  // Each test installs its own cache.
  delete (globalThis as { caches?: unknown }).caches
})

describe('openEdgeCache', () => {
  it('stays out of the way where the runtime has no edge cache', async () => {
    expect(await openEdgeCache(eventFor(), KEY)).toBeNull()
  })

  it('answers the next request from the copy the first one stored, with the client cache-control', async () => {
    const cache = createFakeEdgeCache()
    cache.install()

    const first = await openEdgeCache(eventFor(), KEY)
    expect(first?.hit).toBeNull()
    const miss = first!.store({
      body: '{"ok":true}',
      headers: { 'content-type': 'application/json', 'cache-control': 'private, max-age=0' },
    }, 60)
    expect(miss.headers.get('x-edge-cache')).toBe('MISS')
    expect(miss.headers.get('cache-control')).toBe('private, max-age=0')
    expect(await miss.text()).toBe('{"ok":true}')
    await flushAfterResponse()

    const second = await openEdgeCache(eventFor(), KEY)
    const hit = second!.hit!
    expect(hit.status).toBe(200)
    expect(hit.headers.get('x-edge-cache')).toBe('HIT')
    expect(hit.headers.get('content-type')).toBe('application/json')
    // The edge TTL is the cache's business; the client sees what the route always sent.
    expect(hit.headers.get('cache-control')).toBe('private, max-age=0')
    expect(hit.headers.has('x-edge-cache-client-cache-control')).toBe(false)
    expect(await hit.text()).toBe('{"ok":true}')
  })

  it('serves a copy only for its TTL', async () => {
    let now = 1_000_000
    const cache = createFakeEdgeCache(() => now)
    cache.install()

    ;(await openEdgeCache(eventFor(), KEY))!.store({ body: 'a', headers: {} }, 60)
    await flushAfterResponse()

    now += 59_000
    expect((await openEdgeCache(eventFor(), KEY))!.hit).not.toBeNull()
    now += 2_000
    expect((await openEdgeCache(eventFor(), KEY))!.hit).toBeNull()
  })

  it('does not store a copy whose TTL is under a second', async () => {
    const cache = createFakeEdgeCache()
    cache.install()

    const response = (await openEdgeCache(eventFor(), KEY))!.store({ body: 'a', headers: {} }, 0.5)
    await flushAfterResponse()

    expect(await response.text()).toBe('a')
    expect(cache.puts).toEqual([])
  })

  it('never stores or replays set-cookie', async () => {
    const cache = createFakeEdgeCache()
    cache.install()

    const response = (await openEdgeCache(eventFor(), KEY))!.store({
      body: 'a',
      headers: { 'set-cookie': 'session=secret' },
    }, 60)
    await flushAfterResponse()

    expect(response.headers.has('set-cookie')).toBe(false)
    const hit = (await openEdgeCache(eventFor(), KEY))!.hit!
    expect(hit.headers.has('set-cookie')).toBe(false)
  })

  it('keys only on the declared inputs, in any order', () => {
    const origin = 'https://tuff.test'
    expect(edgeCacheKeyUrl(origin, { name: 'list', params: { b: 2, a: 1, skipped: undefined } }))
      .toBe(edgeCacheKeyUrl(origin, { name: 'list', params: { a: 1, b: 2 } }))
    expect(edgeCacheKeyUrl(origin, { name: 'list', params: { a: 1 } }))
      .not.toBe(edgeCacheKeyUrl(origin, { name: 'list', params: { a: 2 } }))
    expect(edgeCacheKeyUrl(origin, { name: 'list' })).not.toBe(edgeCacheKeyUrl(origin, { name: 'other' }))
  })

  it('answers a conditional request 304 when the etag matches, from a miss or a hit', async () => {
    const cache = createFakeEdgeCache()
    cache.install()
    const entry = { body: 'payload', headers: { etag: '"v1"', 'content-type': 'text/plain' } }

    const fromMiss = (await openEdgeCache(eventFor('/x', { 'if-none-match': '"v1"' }), KEY, { conditional: true }))!
      .store(entry, 60)
    expect(fromMiss.status).toBe(304)
    expect(fromMiss.headers.get('etag')).toBe('"v1"')
    await flushAfterResponse()

    const fromHit = (await openEdgeCache(eventFor('/x', { 'if-none-match': '"v1"' }), KEY, { conditional: true }))!.hit!
    expect(fromHit.status).toBe(304)
    expect(fromHit.headers.get('x-edge-cache')).toBe('HIT')

    const changed = (await openEdgeCache(eventFor('/x', { 'if-none-match': '"v0"' }), KEY, { conditional: true }))!.hit!
    expect(changed.status).toBe(200)
    expect(await changed.text()).toBe('payload')
  })

  it('treats a cache that fails to answer as a miss', async () => {
    (globalThis as { caches?: unknown }).caches = {
      default: {
        match: async () => { throw new Error('cache unavailable') },
        put: async () => {},
      },
    }

    const handle = await openEdgeCache(eventFor(), KEY)
    expect(handle?.hit).toBeNull()
  })
})
