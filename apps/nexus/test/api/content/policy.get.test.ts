import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const contentMocks = vi.hoisted(() => ({
  queryCollection: vi.fn(),
}))

vi.mock('@nuxt/content/server', () => contentMocks)

let handler: (event: any) => Promise<any>
let handlerOptions: any
let getQueryMock: ReturnType<typeof vi.fn>
let setHeaderMock: ReturnType<typeof vi.fn>
let requestedPaths: string[]
let docsByPath: Map<string, unknown>

beforeAll(async () => {
  ;(globalThis as any).defineCachedEventHandler = (fn: any, options: any) => {
    handlerOptions = options
    return fn
  }
  getQueryMock = vi.fn()
  setHeaderMock = vi.fn()
  ;(globalThis as any).getQuery = getQueryMock
  ;(globalThis as any).setHeader = setHeaderMock
  ;(globalThis as any).createError = (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input)
  handler = (await import('../../../server/api/content/policy.get')).default as (event: any) => Promise<any>
})

describe('/api/content/policy', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requestedPaths = []
    docsByPath = new Map()
    getQueryMock.mockReturnValue({ name: 'privacy', locale: 'zh' })
    contentMocks.queryCollection.mockImplementation(() => ({
      path: (path: string) => {
        requestedPaths.push(path)
        return {
          first: async () => docsByPath.get(path) ?? null,
        }
      },
    }))
  })

  it('returns the localized policy document first', async () => {
    const doc = { path: '/app/privacy.zh', title: '隐私政策', body: { type: 'root', children: [] } }
    docsByPath.set('/app/privacy.zh', doc)

    await expect(handler({})).resolves.toEqual({ doc })
    expect(requestedPaths).toEqual(['/app/privacy.zh'])
    expect(setHeaderMock).toHaveBeenCalledWith({}, 'cache-control', 'public, max-age=300, stale-while-revalidate=3600')
  })

  it('falls back to the non-localized policy document', async () => {
    const doc = { path: '/app/privacy', title: 'Privacy' }
    docsByPath.set('/app/privacy', doc)

    await expect(handler({})).resolves.toEqual({ doc })
    expect(requestedPaths).toEqual(['/app/privacy.zh', '/app/privacy'])
  })

  it('rejects invalid policy names before querying content', async () => {
    getQueryMock.mockReturnValue({ name: '../secret', locale: 'en' })

    await expect(handler({})).rejects.toMatchObject({ statusCode: 400 })
    expect(contentMocks.queryCollection).not.toHaveBeenCalled()
  })

  it('uses normalized policy and locale cache keys', () => {
    expect(handlerOptions).toMatchObject({
      maxAge: 300,
      staleMaxAge: 3600,
      name: 'content-policy',
    })
    expect(handlerOptions.getKey({})).toBe('privacy:zh')

    getQueryMock.mockReturnValue({ name: 'License', locale: 'fr' })
    expect(handlerOptions.getKey({})).toBe('license:en')
  })
})
