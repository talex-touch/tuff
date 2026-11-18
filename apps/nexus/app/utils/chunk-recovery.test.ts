import { describe, expect, it, vi } from 'vitest'
import {
  buildCacheBustReloadUrl,
  isStaleChunkError,
  recoverFromStaleChunkError,
  stripCacheBustParamFromUrl,
} from './chunk-recovery'

function createMemoryStorage() {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  }
}

describe('chunk-recovery helpers', () => {
  it('recognizes stale dynamic import and preload failures while ignoring ordinary errors', () => {
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: https://tuff.tagzxia.com/_nuxt/BD6591FE.js'))).toBe(true)
    expect(isStaleChunkError({ message: 'Importing a module script failed.' })).toBe(true)
    expect(isStaleChunkError({ payload: new Error('Unable to preload CSS for /_nuxt/foo.css') })).toBe(true)
    expect(isStaleChunkError({ cause: new Error('ChunkLoadError: Loading chunk 42 failed.') })).toBe(true)

    expect(isStaleChunkError(new Error('Network timeout calling /api/updates'))).toBe(false)
    expect(isStaleChunkError(null)).toBe(false)
  })

  it('adds and strips the temporary cache-bust token without dropping route query or hash', () => {
    const busted = buildCacheBustReloadUrl('https://tuff.tagzxia.com/en/docs?tab=api#install', 1795004000)
    expect(busted).toBe('https://tuff.tagzxia.com/en/docs?tab=api&__nexus_v=1795004000#install')
    expect(stripCacheBustParamFromUrl(busted)).toBe('/en/docs?tab=api#install')
    expect(stripCacheBustParamFromUrl('https://tuff.tagzxia.com/updates')).toBeNull()
  })

  it('reloads once with cache busting and blocks repeated reloads within cooldown', () => {
    const storage = createMemoryStorage()
    const navigate = vi.fn()
    const err = new TypeError('Failed to fetch dynamically imported module: https://tuff.tagzxia.com/_nuxt/old.js')

    expect(recoverFromStaleChunkError(err, {
      now: 1000,
      cooldownMs: 15_000,
      href: 'https://tuff.tagzxia.com/',
      pathname: '/',
      storage,
      navigate,
    })).toBe(true)
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith('https://tuff.tagzxia.com/?__nexus_v=1000')

    // Within cooldown window: skip reload to prevent infinite reload loops
    expect(recoverFromStaleChunkError(err, {
      now: 5000,
      cooldownMs: 15_000,
      href: 'https://tuff.tagzxia.com/',
      pathname: '/',
      storage,
      navigate,
    })).toBe(false)
    expect(navigate).toHaveBeenCalledTimes(1)

    // After cooldown expires: allows another recovery reload
    expect(recoverFromStaleChunkError(err, {
      now: 20_000,
      cooldownMs: 15_000,
      href: 'https://tuff.tagzxia.com/',
      pathname: '/',
      storage,
      navigate,
    })).toBe(true)
    expect(navigate).toHaveBeenCalledTimes(2)
  })

  it('retains unexpired cooldown deadlines independently per pathname', () => {
    const storage = createMemoryStorage()
    const navigate = vi.fn()
    const err = new TypeError('Failed to fetch dynamically imported module: https://tuff.tagzxia.com/_nuxt/old.js')

    expect(recoverFromStaleChunkError(err, {
      now: 1000,
      cooldownMs: 15_000,
      href: 'https://tuff.tagzxia.com/updates?view=all',
      pathname: '/updates',
      storage,
      navigate,
    })).toBe(true)

    expect(recoverFromStaleChunkError(err, {
      now: 2000,
      cooldownMs: 15_000,
      href: 'https://tuff.tagzxia.com/store',
      pathname: '/store',
      storage,
      navigate,
    })).toBe(true)

    // Returning to /updates within its 15s cooldown is still blocked even after /store reloaded.
    expect(recoverFromStaleChunkError(err, {
      now: 5000,
      cooldownMs: 15_000,
      href: 'https://tuff.tagzxia.com/updates?view=all',
      pathname: '/updates',
      storage,
      navigate,
    })).toBe(false)
    expect(navigate).toHaveBeenCalledTimes(2)
  })

  it('skips reload when cooldown storage writes fail or sessionStorage getter throws', () => {
    const err = new TypeError('Failed to fetch dynamically imported module: https://tuff.tagzxia.com/_nuxt/old.js')
    const navigate = vi.fn()
    const writeFailingStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }

    expect(recoverFromStaleChunkError(err, {
      now: 1000,
      href: 'https://tuff.tagzxia.com/',
      pathname: '/',
      storage: writeFailingStorage,
      navigate,
    })).toBe(false)
    expect(navigate).not.toHaveBeenCalled()

    vi.stubGlobal('window', Object.defineProperty(
      { location: { href: 'https://tuff.tagzxia.com/', pathname: '/', replace: navigate } },
      'sessionStorage',
      {
        configurable: true,
        get() {
          throw new Error('SecurityError')
        },
      },
    ))
    try {
      expect(recoverFromStaleChunkError(err, { now: 2000 })).toBe(false)
      expect(navigate).not.toHaveBeenCalled()
    }
    finally {
      vi.unstubAllGlobals()
    }
  })
})
