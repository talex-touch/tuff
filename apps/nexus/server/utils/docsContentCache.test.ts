import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cacheDocsContent,
  docsContentAvailability,
  uncacheableDocsContent,
} from './docsContentCache'

let setHeaderMock: ReturnType<typeof vi.fn>
let warnSpy: ReturnType<typeof vi.spyOn>
const cacheStore = new Map<string, unknown>()

beforeAll(() => {
  // Mirrors nitro: a value is stored only after the wrapped function resolves,
  // so a rejected call leaves the cache untouched.
  ;(globalThis as any).defineCachedFunction = (fn: any, options: any) => async (...args: any[]) => {
    const key = `${options.name}:${await options.getKey(...args)}`
    if (cacheStore.has(key))
      return cacheStore.get(key)
    const result = await fn(...args)
    cacheStore.set(key, result)
    return result
  }
  ;(globalThis as any).createError = (input: any) =>
    Object.assign(new Error(input.message ?? input.statusMessage), input)
  setHeaderMock = vi.fn()
  ;(globalThis as any).setHeader = setHeaderMock
})

describe('cacheDocsContent', () => {
  const previousNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    vi.clearAllMocks()
    cacheStore.clear()
    docsContentAvailability.reset()
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    process.env.NODE_ENV = previousNodeEnv
  })

  afterEach(() => {
    warnSpy.mockRestore()
    docsContentAvailability.reset()
    process.env.NODE_ENV = previousNodeEnv
  })

  it('caches a meaningful result and marks it cacheable', async () => {
    const resolve = vi.fn().mockResolvedValue([{ path: '/docs' }])
    const read = cacheDocsContent(resolve, { name: 'docs-test', getKey: () => 'key' })

    await expect(read({} as any)).resolves.toEqual([{ path: '/docs' }])
    await expect(read({} as any)).resolves.toEqual([{ path: '/docs' }])

    expect(resolve).toHaveBeenCalledTimes(1)
    expect(setHeaderMock).toHaveBeenCalledWith({}, 'cache-control', 'public, max-age=300, stale-while-revalidate=3600')
  })

  it('never caches an empty collection read', async () => {
    const resolve = vi.fn().mockResolvedValue([])
    const read = cacheDocsContent(resolve, {
      name: 'docs-test',
      getKey: () => 'key',
      treatEmptyAsUnavailable: true,
    })

    await expect(read({} as any)).resolves.toEqual([])
    await expect(read({} as any)).resolves.toEqual([])

    expect(resolve).toHaveBeenCalledTimes(2)
    expect(setHeaderMock).not.toHaveBeenCalled()
  })

  it('caches a legitimately empty single-page read', async () => {
    const resolve = vi.fn().mockResolvedValue(null)
    const read = cacheDocsContent(resolve, { name: 'docs-test', getKey: () => 'key' })

    await expect(read({} as any)).resolves.toBeNull()
    await expect(read({} as any)).resolves.toBeNull()

    expect(resolve).toHaveBeenCalledTimes(1)
  })

  it('stops caching empty reads while the content database is degraded', async () => {
    docsContentAvailability.markUnavailable()
    const resolve = vi.fn().mockResolvedValue(null)
    const read = cacheDocsContent(resolve, { name: 'docs-test', getKey: () => 'key' })

    await expect(read({} as any)).resolves.toBeNull()
    await expect(read({} as any)).resolves.toBeNull()

    expect(resolve).toHaveBeenCalledTimes(2)
  })

  it('honours a custom emptiness predicate', async () => {
    const resolve = vi.fn().mockResolvedValue({ items: [] })
    const read = cacheDocsContent(resolve, {
      name: 'docs-test',
      getKey: () => 'key',
      isEmpty: result => result.items.length === 0,
      treatEmptyAsUnavailable: true,
    })

    await expect(read({} as any)).resolves.toEqual({ items: [] })
    await expect(read({} as any)).resolves.toEqual({ items: [] })

    expect(resolve).toHaveBeenCalledTimes(2)
  })

  it('returns an explicitly uncacheable payload without storing it', async () => {
    const resolve = vi.fn().mockImplementation(async () => uncacheableDocsContent({ path: '/docs', fallback: true }))
    const read = cacheDocsContent(resolve, { name: 'docs-test', getKey: () => 'key' })

    await expect(read({} as any)).resolves.toEqual({ path: '/docs', fallback: true })
    await expect(read({} as any)).resolves.toEqual({ path: '/docs', fallback: true })

    expect(resolve).toHaveBeenCalledTimes(2)
    expect(setHeaderMock).not.toHaveBeenCalled()
  })

  it('reports an unreachable content database as 503 and flags it degraded', async () => {
    process.env.NODE_ENV = 'development'
    const error = new Error('no such table: _content_docs')
    const resolve = vi.fn().mockRejectedValue(error)
    const read = cacheDocsContent(resolve, { name: 'docs-test', getKey: () => 'key' })

    await expect(read({} as any)).rejects.toMatchObject({
      statusCode: 503,
      message: expect.stringContaining('pnpm rebuild -r better-sqlite3'),
    })
    expect(docsContentAvailability.isDegraded()).toBe(true)
    expect(warnSpy).toHaveBeenCalledWith(
      '[docs-content] Nuxt Content could not query the docs collection.',
      error,
    )
    expect(setHeaderMock).not.toHaveBeenCalled()
  })

  it('keeps internal details out of the production error', async () => {
    process.env.NODE_ENV = 'production'
    const resolve = vi.fn().mockRejectedValue(new Error('no such table: _content_docs'))
    const read = cacheDocsContent(resolve, { name: 'docs-test', getKey: () => 'key' })

    await expect(read({} as any)).rejects.toMatchObject({
      statusCode: 503,
      message: 'Docs content is temporarily unavailable.',
    })
    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('does not swallow unrelated errors', async () => {
    const resolve = vi.fn().mockRejectedValue(new Error('database is locked'))
    const read = cacheDocsContent(resolve, { name: 'docs-test', getKey: () => 'key' })

    await expect(read({} as any)).rejects.toThrow('database is locked')
    expect(docsContentAvailability.isDegraded()).toBe(false)
  })

  it('scopes cache entries by key', async () => {
    const resolve = vi.fn().mockImplementation(async (_event: any, locale: string) => [locale])
    const read = cacheDocsContent(resolve, {
      name: 'docs-test',
      getKey: (locale: string) => `locale:${locale}`,
    })

    await expect(read({} as any, 'zh')).resolves.toEqual(['zh'])
    await expect(read({} as any, 'en')).resolves.toEqual(['en'])
    await expect(read({} as any, 'zh')).resolves.toEqual(['zh'])

    expect(resolve).toHaveBeenCalledTimes(2)
  })
})

describe('docsContentAvailability', () => {
  it('opens and closes the degraded window', () => {
    expect(docsContentAvailability.isDegraded()).toBe(false)

    docsContentAvailability.markUnavailable()
    expect(docsContentAvailability.isDegraded()).toBe(true)

    docsContentAvailability.reset()
    expect(docsContentAvailability.isDegraded()).toBe(false)
  })
})
