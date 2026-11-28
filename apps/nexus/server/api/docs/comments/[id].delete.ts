import { getRequestURL } from 'h3'
import { runAfterResponse } from '../../../utils/afterResponse'
import { requireAuth } from '../../../utils/auth'
import { getUserById } from '../../../utils/authStore'
import { deleteComment, ensureCommentsSchema, getD1Database, normalizePath } from '../../../utils/docCommentsStore'
import { edgeCacheKeyUrl } from '../../../utils/edgeCache'

function invalidateCommentsEdgeCache(event: Parameters<typeof getRequestURL>[0], normalizedPath: string) {
  const store = (globalThis as { caches?: { default?: { delete?: (request: Request) => Promise<boolean> } } }).caches?.default
  if (!store || typeof store.delete !== 'function')
    return

  const keyUrl = edgeCacheKeyUrl(getRequestURL(event).origin, {
    name: 'docs/comments',
    params: { path: normalizedPath },
  })
  runAfterResponse(event, 'docs comments edge cache invalidate', async () => {
    await store.delete!(new Request(keyUrl))
  })
}

export default defineEventHandler(async (event) => {
  const auth = await requireAuth(event)
  const { userId } = auth

  const id = getRouterParam(event, 'id')
  if (!id || typeof id !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing comment id' })
  }

  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 503, statusMessage: 'Database not available' })
  }

  await ensureCommentsSchema(db)

  const existing = await db.prepare(
    'SELECT user_id, path FROM doc_comments WHERE id = ?1',
  ).bind(id).first<{ user_id: string, path: string }>()
  if (!existing?.user_id) {
    throw createError({ statusCode: 404, statusMessage: 'Comment not found' })
  }

  const user = auth.user ?? await getUserById(event, userId)
  const isAdmin = user?.role === 'admin'

  if (existing.user_id !== userId && !isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  await deleteComment(db, id)
  if (existing.path)
    invalidateCommentsEdgeCache(event, normalizePath(existing.path))

  return { success: true }
})
