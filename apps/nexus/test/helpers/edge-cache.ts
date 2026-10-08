import { vi } from 'vitest'

interface StoredCopy {
  expiresAt: number
  status: number
  headers: Array<[string, string]>
  body: ArrayBuffer
}

/**
 * A stand-in for Cloudflare's `caches.default`: copies keyed by URL, kept for the `s-maxage` (or
 * `max-age`) their `cache-control` names, and refused when they carry `set-cookie`, as the edge refuses
 * them. `install()` puts it where `server/utils/edgeCache.ts` looks; `vi.unstubAllGlobals()` removes it.
 */
export function createFakeEdgeCache(now: () => number = () => Date.now()) {
  const copies = new Map<string, StoredCopy>()
  const puts: string[] = []

  const store = {
    async match(request: Request): Promise<Response | undefined> {
      const copy = copies.get(request.url)
      if (!copy || copy.expiresAt <= now())
        return undefined
      return new Response(copy.body.slice(0), { status: copy.status, headers: copy.headers })
    },
    async put(request: Request, response: Response): Promise<void> {
      puts.push(request.url)
      if (response.headers.has('set-cookie'))
        return
      const cacheControl = response.headers.get('cache-control') ?? ''
      const seconds = Number(/s-maxage=(\d+)/.exec(cacheControl)?.[1] ?? /max-age=(\d+)/.exec(cacheControl)?.[1] ?? 0)
      if (!(seconds > 0))
        return
      copies.set(request.url, {
        expiresAt: now() + seconds * 1000,
        status: response.status,
        headers: [...response.headers],
        body: await response.arrayBuffer(),
      })
    },
  }

  return {
    store,
    copies,
    puts,
    install() {
      vi.stubGlobal('caches', { default: store })
    },
  }
}

/** Lets the puts the handler scheduled for after its response land. */
export async function flushAfterResponse(): Promise<void> {
  for (let round = 0; round < 3; round += 1)
    await new Promise<void>(resolve => setImmediate(resolve))
}
