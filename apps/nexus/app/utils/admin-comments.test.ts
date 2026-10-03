import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope, nextTick, reactive } from 'vue'
import type { EffectScope } from 'vue'
import { useAdminList } from '~/composables/useAdminList'
import { useAdminQueryState } from '~/composables/useAdminQueryState'
import type { CommentQueue, CommentRequest } from './admin-comments'
import {
  COMMENT_QUEUES,
  commentPageQuery,
  createDocCommentListOptions,
  createPluginReviewListOptions,
  docCommentAnalyticsLink,
  docCommentDocumentLink,
  docCommentPath,
  pluginReviewStatusPath,
} from './admin-comments'

/**
 * `/admin/reviews?tab=plugins|docs`. The two queues used to keep their page in
 * component state, so switching queues — which unmounts the one you leave —
 * dropped you back on page 1. Each queue now keeps its page and filters in the
 * URL under its own prefix, and these tests drive the real pieces the page is
 * made of: `useAdminQueryState` for the tab and `useAdminList` for each queue.
 */

type Query = Record<string, string | string[] | undefined>

const scopes: EffectScope[] = []

function installRoute(query: Query = {}) {
  const route = reactive({ path: '/admin/reviews', hash: '', query: { ...query } as Query })
  vi.stubGlobal('useRoute', () => route)
  vi.stubGlobal('useRouter', () => ({
    replace: vi.fn(async (location: { query: Query }) => {
      route.query = { ...location.query }
    }),
  }))
  return route
}

async function settle() {
  for (let index = 0; index < 6; index += 1) {
    await nextTick()
    await Promise.resolve()
  }
}

/** Runs `setup` the way a mounted component would; `stop()` is its unmount. */
function mount<T>(setup: () => T): { value: T, stop: () => void } {
  const scope = effectScope()
  scopes.push(scope)
  return { value: scope.run(setup)!, stop: () => scope.stop() }
}

function reviewPage(total: number) {
  return { reviews: Array.from({ length: Math.min(total, 20) }, (_, index) => ({ id: `r${index}` })), total }
}

function commentPage(total: number) {
  return { comments: Array.from({ length: Math.min(total, 20) }, (_, index) => ({ id: `c${index}` })), total }
}

const reviewsFailed = () => 'Unable to load pending reviews.'
const commentsFailed = () => 'Unable to load comments.'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  for (const scope of scopes.splice(0))
    scope.stop()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('comment queue requests', () => {
  it('pages both endpoints by limit and offset', () => {
    expect(commentPageQuery({ page: 1, limit: 20 })).toEqual({ limit: 20, offset: 0 })
    expect(commentPageQuery({ page: 3, limit: 50 })).toEqual({ limit: 50, offset: 100 })
  })

  it('asks the pending review queue for one page at a time', async () => {
    installRoute({ p_page: '2' })
    const request = vi.fn<CommentRequest>(async () => reviewPage(61))
    const list = mount(() => useAdminList(createPluginReviewListOptions(request, reviewsFailed))).value
    await settle()

    expect(request).toHaveBeenCalledWith('/api/admin/store/reviews/pending', { query: { limit: 20, offset: 20 } })
    expect(list.total.value).toBe(61)
    expect(list.rows.value).toHaveLength(20)
    expect(list.hasActiveFilters.value).toBe(false)
  })

  it('filters doc comments by one document path, trimmed and debounced', async () => {
    const route = installRoute()
    const request = vi.fn<CommentRequest>(async () => commentPage(3))
    const list = mount(() => useAdminList(createDocCommentListOptions(request, commentsFailed))).value
    await settle()
    expect(request).toHaveBeenLastCalledWith('/api/admin/doc-comments', { query: { limit: 20, offset: 0 } })

    list.filters.path = '  guide/intro '
    await settle()
    expect(request).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(300)
    await settle()

    expect(request).toHaveBeenLastCalledWith('/api/admin/doc-comments', { query: { limit: 20, offset: 0, path: 'guide/intro' } })
    expect(route.query).toEqual({ d_path: 'guide/intro' })
    expect(list.hasActiveFilters.value).toBe(true)
  })

  it('reports a failed queue in words, never as the transport\'s request line', async () => {
    installRoute()
    const failing = vi.fn<CommentRequest>(async () => {
      throw new Error('[GET] "/api/admin/store/reviews/pending?limit=20&offset=0": 500')
    })
    const reviews = mount(() => useAdminList(createPluginReviewListOptions(failing, reviewsFailed))).value
    const comments = mount(() => useAdminList(createDocCommentListOptions(failing, commentsFailed))).value
    await settle()

    expect(reviews.error.value).toBe('Unable to load pending reviews.')
    expect(comments.error.value).toBe('Unable to load comments.')
  })
})

describe('switching queues', () => {
  it('lands back on page 2 of the plugin queue after a visit to the doc queue', async () => {
    // The acceptance case: page 2 of plugin reviews → doc comments → back.
    const route = installRoute({ tab: 'plugins' })
    const tab = mount(() => useAdminQueryState<CommentQueue>('tab', COMMENT_QUEUES, 'plugins')).value
    const fetchReviews = vi.fn<CommentRequest>(async () => reviewPage(61))
    const fetchComments = vi.fn<CommentRequest>(async () => commentPage(45))

    const plugins = mount(() => useAdminList(createPluginReviewListOptions(fetchReviews, reviewsFailed)))
    await settle()
    plugins.value.setPage(2)
    await settle()
    expect(route.query).toEqual({ tab: 'plugins', p_page: '2' })

    // Only the open queue is mounted: leaving the plugin queue unmounts it.
    tab.value = 'docs'
    await settle()
    plugins.stop()
    expect(route.query).toEqual({ tab: 'docs', p_page: '2' })

    const docs = mount(() => useAdminList(createDocCommentListOptions(fetchComments, commentsFailed)))
    await settle()
    // The doc queue starts on its own first page, not on the plugin queue's page 2.
    expect(fetchComments).toHaveBeenLastCalledWith('/api/admin/doc-comments', { query: { limit: 20, offset: 0 } })
    docs.value.setPage(3)
    await settle()
    expect(route.query).toEqual({ tab: 'docs', p_page: '2', d_page: '3' })

    tab.value = 'plugins'
    await settle()
    docs.stop()
    // `plugins` is the default tab, so it drops out of the URL; the pages stay.
    expect(route.query).toEqual({ p_page: '2', d_page: '3' })

    const pluginsAgain = mount(() => useAdminList(createPluginReviewListOptions(fetchReviews, reviewsFailed)))
    await settle()
    expect(pluginsAgain.value.page.value).toBe(2)
    expect(fetchReviews).toHaveBeenLastCalledWith('/api/admin/store/reviews/pending', { query: { limit: 20, offset: 20 } })
  })

  it('keeps the doc queue\'s path filter across a visit to the plugin queue', async () => {
    const route = installRoute({ tab: 'docs' })
    const fetchComments = vi.fn<CommentRequest>(async () => commentPage(5))

    const docs = mount(() => useAdminList(createDocCommentListOptions(fetchComments, commentsFailed)))
    await settle()
    docs.value.filters.path = 'guide/intro'
    await settle()
    vi.advanceTimersByTime(300)
    await settle()
    expect(route.query).toEqual({ tab: 'docs', d_path: 'guide/intro' })
    docs.stop()

    route.query = { ...route.query, tab: 'plugins' }
    await settle()
    route.query = { ...route.query, tab: 'docs' }

    const docsAgain = mount(() => useAdminList(createDocCommentListOptions(fetchComments, commentsFailed)))
    await settle()
    expect(docsAgain.value.filters.path).toBe('guide/intro')
    expect(fetchComments).toHaveBeenLastCalledWith('/api/admin/doc-comments', { query: { limit: 20, offset: 0, path: 'guide/intro' } })
  })
})

describe('comment links and actions', () => {
  it('links a comment to its document and to that document\'s analytics', () => {
    // A comment stores the page path the docs page posts, slash-trimmed: `docs/guide/start`.
    // Prefixing `/docs/` again linked every real comment to `/docs/docs/...`.
    expect(docCommentDocumentLink('docs/guide/start', 'zh')).toBe('/zh/docs/guide/start')
    expect(docCommentDocumentLink('docs/dev/api/channel', 'en')).toBe('/en/docs/dev/api/channel')
    expect(docCommentDocumentLink('/docs/dev/components/index', 'zh')).toBe('/zh/docs/dev/components/index')
    // A path stored without the docs segment still lands in the docs tree.
    expect(docCommentDocumentLink('guide/intro', 'en')).toBe('/en/docs/guide/intro')
    expect(docCommentAnalyticsLink()).toBe('/admin/analytics?section=docs')
    expect(docCommentAnalyticsLink('/Guide/Intro/')).toBe('/admin/analytics?section=docs&path=guide%2Fintro')
  })

  it('addresses one review or comment by id', () => {
    expect(pluginReviewStatusPath('3f2a')).toBe('/api/admin/store/reviews/3f2a/status')
    expect(docCommentPath('dc_1727950000000_ab12cd')).toBe('/api/admin/doc-comments/dc_1727950000000_ab12cd')
  })
})
