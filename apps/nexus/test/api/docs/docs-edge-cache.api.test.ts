import type { H3Event } from 'h3'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createFakeEdgeCache, flushAfterResponse } from '../../helpers/edge-cache'
import { buildDocsPurgePrefixes, purgeDocsEdgeCache } from '../../../scripts/purge-docs-edge-cache.mjs'

const authMocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  readSessionTokenUserId: vi.fn(),
}))

const authStoreMocks = vi.hoisted(() => ({
  getUserById: vi.fn(),
}))

const commentsStoreMocks = vi.hoisted(() => ({
  ensureCommentsSchema: vi.fn(),
  getD1Database: vi.fn(),
  listComments: vi.fn(),
  createComment: vi.fn(),
  deleteComment: vi.fn(),
  normalizePath: (value: string) => value.replace(/^\/+|\/+$/g, '').toLowerCase(),
  sanitizeContent: (value: string) => value.trim(),
}))

const feedbackStoreMocks = vi.hoisted(() => ({
  DOC_FEEDBACK_TABLE: 'doc_feedback',
  ensureDocFeedbackSchema: vi.fn(),
  normalizeDocFeedbackPath: (value: string) => value.replace(/^\/+|\/+$/g, '').toLowerCase(),
}))

const analyticsStoreMocks = vi.hoisted(() => ({
  ensureDocAnalyticsSchema: vi.fn(),
  isAllowedDocPathForSource: (path: string) => path.startsWith('docs/'),
  normalizeDocPath: (value: string) => value.replace(/^\/+|\/+$/g, '').toLowerCase(),
  normalizeDocSourceType: () => 'docs_page' as const,
}))

const asrCleanupMocks = vi.hoisted(() => ({
  scheduleExpiredAsrResultCleanup: vi.fn(),
}))

const cloudflareState = vi.hoisted(() => ({
  db: null as any,
}))

vi.mock('../../../server/utils/auth', () => authMocks)
vi.mock('../../../server/utils/authStore', () => authStoreMocks)
vi.mock('../../../server/utils/docCommentsStore', () => commentsStoreMocks)
vi.mock('../../../server/utils/docFeedbackStore', () => feedbackStoreMocks)
vi.mock('../../../server/utils/docAnalyticsStore', () => analyticsStoreMocks)
vi.mock('../../../server/utils/asrCleanupSchedule', () => asrCleanupMocks)
vi.mock('../../../server/utils/cloudflare', () => ({
  readCloudflareBindings: () => (cloudflareState.db ? { DB: cloudflareState.db } : undefined),
}))

type Handler = (event: H3Event) => Promise<unknown> | unknown

const handlers = {} as {
  commentsGet: Handler
  commentsPost: Handler
  commentsDelete: Handler
  feedbackGet: Handler
  viewGet: Handler
  asrCleanup: Handler
}

function createFakeEdgeCacheWithDelete() {
  const base = createFakeEdgeCache()
  const deletes: string[] = []
  const store = {
    ...base.store,
    async delete(request: Request): Promise<boolean> {
      deletes.push(request.url)
      return base.copies.delete(request.url)
    },
  }
  return {
    ...base,
    deletes,
    install() {
      vi.stubGlobal('caches', { default: store })
    },
  }
}

function createEvent(
  path: string,
  options: {
    method?: string
    headers?: Record<string, string>
    params?: Record<string, string>
    body?: unknown
  } = {},
): { event: H3Event, responseHeaders: Record<string, string> } {
  const responseHeaders: Record<string, string> = {}
  const event = {
    path,
    method: options.method ?? 'GET',
    node: {
      req: {
        url: path,
        method: options.method ?? 'GET',
        headers: { host: 'tuff.test', ...options.headers },
      },
      res: {
        setHeader: (name: string, value: unknown) => {
          responseHeaders[name.toLowerCase()] = String(value)
        },
        getHeader: (name: string) => responseHeaders[name.toLowerCase()],
      },
    },
    context: {
      params: options.params ?? {},
      __testBody: options.body,
    },
  } as unknown as H3Event
  return { event, responseHeaders }
}

beforeAll(async () => {
  const h3 = await import('h3')
  vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
  vi.stubGlobal('getQuery', h3.getQuery)
  vi.stubGlobal('getRouterParam', h3.getRouterParam)
  vi.stubGlobal('createError', h3.createError)
  vi.stubGlobal('readBody', async (event: any) => event.context.__testBody)

  handlers.commentsGet = (await import('../../../server/api/docs/comments.get')).default as unknown as Handler
  handlers.commentsPost = (await import('../../../server/api/docs/comments.post')).default as unknown as Handler
  handlers.commentsDelete = (await import('../../../server/api/docs/comments/[id].delete')).default as unknown as Handler
  handlers.feedbackGet = (await import('../../../server/api/docs/feedback.get')).default as unknown as Handler
  handlers.viewGet = (await import('../../../server/api/docs/view.get')).default as unknown as Handler
  handlers.asrCleanup = (await import('../../../server/middleware/asr-result-cleanup')).default as unknown as Handler
})

let cache: ReturnType<typeof createFakeEdgeCacheWithDelete>

beforeEach(() => {
  vi.clearAllMocks()
  cloudflareState.db = null
  cache = createFakeEdgeCacheWithDelete()
  cache.install()
})

afterEach(() => {
  delete (globalThis as { caches?: unknown }).caches
})

describe('N4 docs read API edge caching & invalidation', () => {
  it('caches GET /api/docs/comments at the edge and invalidates on POST / DELETE', async () => {
    const first = vi.fn().mockResolvedValue({ user_id: 'u1', path: 'docs/guide/start' })
    const fakeDb = {
      prepare: vi.fn(() => ({ bind: vi.fn(() => ({ first })) })),
    }
    commentsStoreMocks.getD1Database.mockReturnValue(fakeDb)
    commentsStoreMocks.listComments.mockResolvedValue({
      comments: [{ id: 'c1', path: 'docs/guide/start', userId: 'u1', userName: 'Alice', userImage: null, content: 'hi', createdAt: 1 }],
    })
    commentsStoreMocks.createComment.mockResolvedValue({
      id: 'c2',
      path: 'docs/guide/start',
      userId: 'u1',
      userName: 'Alice',
      userImage: null,
      content: 'new',
      createdAt: 2,
    })
    authMocks.requireAuth.mockResolvedValue({ userId: 'u1', user: { name: 'Alice', image: null, role: 'user' } })

    const res1 = await handlers.commentsGet(createEvent('/api/docs/comments?path=/docs/guide/start').event) as Response
    expect(res1.headers.get('x-edge-cache')).toBe('MISS')
    expect(res1.headers.get('cache-control')).toBe('public, max-age=30, stale-while-revalidate=60')
    await flushAfterResponse()

    const res2 = await handlers.commentsGet(createEvent('/api/docs/comments?path=docs/guide/start/').event) as Response
    expect(res2.headers.get('x-edge-cache')).toBe('HIT')
    expect(commentsStoreMocks.listComments).toHaveBeenCalledTimes(1)

    await handlers.commentsPost(createEvent('/api/docs/comments', {
      method: 'POST',
      body: { path: '/docs/guide/start', content: 'new' },
    }).event)
    await flushAfterResponse()
    expect(cache.deletes).toHaveLength(1)

    const res3 = await handlers.commentsGet(createEvent('/api/docs/comments?path=docs/guide/start').event) as Response
    expect(res3.headers.get('x-edge-cache')).toBe('MISS')
    expect(commentsStoreMocks.listComments).toHaveBeenCalledTimes(2)
    await flushAfterResponse()

    await handlers.commentsDelete(createEvent('/api/docs/comments/c2', {
      method: 'DELETE',
      params: { id: 'c2' },
    }).event)
    await flushAfterResponse()
    expect(cache.deletes).toHaveLength(2)

    const res4 = await handlers.commentsGet(createEvent('/api/docs/comments?path=docs/guide/start').event) as Response
    expect(res4.headers.get('x-edge-cache')).toBe('MISS')
    expect(commentsStoreMocks.listComments).toHaveBeenCalledTimes(3)
  })

  it('serves anonymous GET /api/docs/feedback from edge cache (0 D1 reads on hit) and bypasses for signed-in cookies', async () => {
    const first = vi.fn()
      .mockResolvedValueOnce({ helpful: 10, unhelpful: 2 })
      .mockResolvedValueOnce({ helpful: 10, unhelpful: 2, user_vote: 1 })
    cloudflareState.db = {
      prepare: vi.fn(() => ({ bind: vi.fn(() => ({ first })) })),
    }
    authMocks.readSessionTokenUserId.mockResolvedValue('alice')

    const anon1 = await handlers.feedbackGet(createEvent('/api/docs/feedback?path=/docs/guide/start').event) as Response
    expect(anon1.headers.get('x-edge-cache')).toBe('MISS')
    expect(await anon1.json()).toEqual({ helpful: 10, unhelpful: 2, userVote: null })
    expect(authMocks.readSessionTokenUserId).not.toHaveBeenCalled()
    await flushAfterResponse()

    const anon2 = await handlers.feedbackGet(createEvent('/api/docs/feedback?path=docs/guide/start').event) as Response
    expect(anon2.headers.get('x-edge-cache')).toBe('HIT')
    expect(await anon2.json()).toEqual({ helpful: 10, unhelpful: 2, userVote: null })
    expect(first).toHaveBeenCalledTimes(1)

    const { event: authedEvent, responseHeaders } = createEvent('/api/docs/feedback?path=docs/guide/start', {
      headers: { cookie: '__Secure-next-auth.session-token=opaque-token' },
    })
    const authed = await handlers.feedbackGet(authedEvent)
    expect(authed).toEqual({ helpful: 10, unhelpful: 2, userVote: true })
    expect(responseHeaders['cache-control']).toBe('private, no-store')
    expect(authMocks.readSessionTokenUserId).toHaveBeenCalledTimes(1)
    expect(first).toHaveBeenCalledTimes(2)
  })

  it('caches GET /api/docs/view at the edge with 0 D1 reads on hit', async () => {
    const first = vi.fn().mockResolvedValue({ views: 42, updated_at: 1700000000 })
    cloudflareState.db = {
      prepare: vi.fn(() => ({ bind: vi.fn(() => ({ first })) })),
    }

    const res1 = await handlers.viewGet(createEvent('/api/docs/view?path=/docs/guide/start').event) as Response
    expect(res1.headers.get('x-edge-cache')).toBe('MISS')
    expect(await res1.json()).toEqual({ views: 42, updatedAt: 1700000000, source: 'd1' })
    await flushAfterResponse()

    const res2 = await handlers.viewGet(createEvent('/api/docs/view?path=docs/guide/start').event) as Response
    expect(res2.headers.get('x-edge-cache')).toBe('HIT')
    expect(await res2.json()).toEqual({ views: 42, updatedAt: 1700000000, source: 'd1' })
    expect(first).toHaveBeenCalledTimes(1)
  })
})

describe('N4 ASR cleanup middleware gating', () => {
  it('skips docs and public API routes and only runs on speech/intelligence routes', () => {
    handlers.asrCleanup(createEvent('/api/docs/view').event)
    handlers.asrCleanup(createEvent('/api/docs/comments').event)
    handlers.asrCleanup(createEvent('/api/docs/feedback').event)
    expect(asrCleanupMocks.scheduleExpiredAsrResultCleanup).not.toHaveBeenCalled()

    handlers.asrCleanup(createEvent('/api/v1/speech/models').event)
    handlers.asrCleanup(createEvent('/api/dashboard/intelligence/providers').event)
    expect(asrCleanupMocks.scheduleExpiredAsrResultCleanup).toHaveBeenCalledTimes(2)
  })
})

describe('N4 Cloudflare prefix purge script', () => {
  it('builds normalized prefixes and supports dry-run and live POST /zones/{id}/purge_cache', async () => {
    expect(buildDocsPurgePrefixes('https://tuff.tagzxia.com/', ['/en/docs/', 'tuffex'])).toEqual([
      'tuff.tagzxia.com/en/docs',
      'tuff.tagzxia.com/tuffex',
    ])

    const dry = await purgeDocsEdgeCache({ dryRun: true, host: 'https://tuff.tagzxia.com' })
    expect(dry.dryRun).toBe(true)
    expect(dry.prefixes).toContain('tuff.tagzxia.com/en/docs')
    expect(dry.prefixes).toContain('tuff.tagzxia.com/tuffex')

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, result: { id: 'z1' } }), { status: 200 }))
    const live = await purgeDocsEdgeCache({
      zoneId: 'zone-123',
      apiToken: 'token-abc',
      host: 'tuff.tagzxia.com',
      paths: ['/en/docs', '/tuffex'],
      fetchImpl: fetchMock as unknown as typeof fetch,
    })
    expect(live.purgedCount).toBe(2)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.cloudflare.com/client/v4/zones/zone-123/purge_cache',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer token-abc' }),
        body: JSON.stringify({ prefixes: ['tuff.tagzxia.com/en/docs', 'tuff.tagzxia.com/tuffex'] }),
      }),
    )
  })
})
