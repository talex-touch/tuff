import type { AdminListFetchParams, AdminListOptions, AdminListPage } from '~/composables/useAdminList'
import { toLocalizedDocsPath } from '#shared/utils/docs-path'

/**
 * Comment management (`/admin/reviews?tab=plugins|docs`): the request each queue
 * sends and the links a doc comment row offers. Two separate queues with their
 * own endpoint, filters, actions and paging; on the shared route their URL keys
 * carry `p_` / `d_`, so one queue's page or filter never moves the other's.
 * Labels stay in the panels, where the i18n guards read them.
 */

/** The endpoints cap a page at 100 rows. */
export const ADMIN_COMMENT_PAGE_SIZES = [20, 50, 100]

export type CommentQueue = 'plugins' | 'docs'
export const COMMENT_QUEUES: readonly CommentQueue[] = ['plugins', 'docs']

export const PLUGIN_REVIEW_QUERY_PREFIX = 'p_'
export const DOC_COMMENT_QUERY_PREFIX = 'd_'

export interface PendingPluginReview {
  id: string
  pluginId: string
  rating: number
  title?: string | null
  content: string
  author: {
    name: string
    avatarUrl?: string | null
  }
  status?: 'pending' | 'approved' | 'rejected'
  createdAt: string
  updatedAt: string
  plugin?: { id: string, slug: string, name: string } | null
}

export type PluginReviewDecision = 'approved' | 'rejected'

export interface DocComment {
  id: string
  path: string
  userId: string
  userName: string | null
  userImage: string | null
  content: string
  createdAt: number
}

export interface DocCommentFilters extends Record<string, string> {
  path: string
}

export const DOC_COMMENT_FILTER_DEFAULTS: DocCommentFilters = { path: '' }

export type CommentRequest = (path: string, options: { query: Record<string, string | number> }) => Promise<unknown>

/** `limit` / `offset` paging, which is what both comment endpoints read. */
export function commentPageQuery(params: Pick<AdminListFetchParams<Record<string, string>>, 'page' | 'limit'>): { limit: number, offset: number } {
  return { limit: params.limit, offset: (params.page - 1) * params.limit }
}

/** The pending plugin review queue: `GET /api/admin/store/reviews/pending`. It has no filters. */
export function createPluginReviewListOptions(
  request: CommentRequest,
  errorFallback: () => string,
): AdminListOptions<PendingPluginReview, Record<string, string>> {
  return {
    async fetch(params): Promise<AdminListPage<PendingPluginReview>> {
      const response = await request('/api/admin/store/reviews/pending', { query: commentPageQuery(params) }) as {
        reviews?: unknown
        total?: unknown
      } | null
      return {
        rows: Array.isArray(response?.reviews) ? response.reviews as PendingPluginReview[] : [],
        total: Number(response?.total) || 0,
      }
    },
    defaults: {},
    defaultLimit: 20,
    pageSizes: ADMIN_COMMENT_PAGE_SIZES,
    queryKeyPrefix: PLUGIN_REVIEW_QUERY_PREFIX,
    errorFallback,
  }
}

/** Every doc comment, newest first: `GET /api/admin/doc-comments`, filtered by one document path. */
export function createDocCommentListOptions(
  request: CommentRequest,
  errorFallback: () => string,
): AdminListOptions<DocComment, DocCommentFilters> {
  return {
    async fetch(params): Promise<AdminListPage<DocComment>> {
      const query: Record<string, string | number> = commentPageQuery(params)
      const path = params.filters.path.trim()
      if (path)
        query.path = path
      const response = await request('/api/admin/doc-comments', { query }) as {
        comments?: unknown
        total?: unknown
      } | null
      return {
        rows: Array.isArray(response?.comments) ? response.comments as DocComment[] : [],
        total: Number(response?.total) || 0,
      }
    },
    defaults: DOC_COMMENT_FILTER_DEFAULTS,
    defaultLimit: 20,
    pageSizes: ADMIN_COMMENT_PAGE_SIZES,
    debounceKeys: ['path'],
    queryKeyPrefix: DOC_COMMENT_QUERY_PREFIX,
    errorFallback,
  }
}

/** `PATCH /api/admin/store/reviews/:id/status`. */
export function pluginReviewStatusPath(id: string): string {
  return `/api/admin/store/reviews/${encodeURIComponent(id)}/status`
}

/** `DELETE /api/admin/doc-comments/:id`. */
export function docCommentPath(id: string): string {
  return `/api/admin/doc-comments/${encodeURIComponent(id)}`
}

/**
 * Where the commented document lives on the docs site, in the administrator's locale. A
 * comment stores its page path without the leading slash (`docs/guide/start`), so prefixing
 * `/docs/` again linked every comment to `/docs/docs/...`; and an unprefixed docs link opens
 * the English page.
 */
export function docCommentDocumentLink(path: string, locale: 'en' | 'zh'): string {
  const trimmed = path.replace(/^\/+/, '')
  const docsPath = trimmed === 'docs' || trimmed.startsWith('docs/') ? `/${trimmed}` : `/docs/${trimmed}`
  return toLocalizedDocsPath(docsPath, locale)
}

function normalizeDocPath(path: string): string {
  return path.replace(/^\/+|\/+$/g, '').toLowerCase()
}

/** The docs panel of Analytics, narrowed to one document when a path is given. */
export function docCommentAnalyticsLink(path?: string): string {
  const params = new URLSearchParams()
  params.set('section', 'docs')
  if (path)
    params.set('path', normalizeDocPath(path))
  return `/admin/analytics?${params.toString()}`
}
