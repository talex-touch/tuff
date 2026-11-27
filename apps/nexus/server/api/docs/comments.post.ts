import { getRequestURL } from 'h3'
import { runAfterResponse } from '../../utils/afterResponse'
import { requireAuth } from '../../utils/auth'
import { getUserById } from '../../utils/authStore'
import { createComment, ensureCommentsSchema, getD1Database, normalizePath, sanitizeContent } from '../../utils/docCommentsStore'
import { edgeCacheKeyUrl } from '../../utils/edgeCache'

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

  const body = await readBody<{ path: string, content: string }>(event)
  const docPath = body?.path
  const rawContent = body?.content?.trim()

  if (!docPath || typeof docPath !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing or invalid path' })
  }
  if (!rawContent || typeof rawContent !== 'string' || rawContent.length > 2000) {
    throw createError({ statusCode: 400, statusMessage: 'Comment content is required and must be under 2000 characters' })
  }

  const content = sanitizeContent(rawContent)
  if (!content) {
    throw createError({ statusCode: 400, statusMessage: 'Comment content must not be empty after sanitization' })
  }

  const normalizedPath = normalizePath(docPath)
  const db = getD1Database(event)

  if (!db) {
    throw createError({ statusCode: 503, statusMessage: 'Database not available' })
  }

  await ensureCommentsSchema(db)

  const user = auth.user ?? await getUserById(event, userId)
  const userName = user?.name ?? null
  const userImage = user?.image ?? null

  const comment = await createComment(db, {
    path: normalizedPath,
    userId,
    userName,
    userImage,
    content,
  })

  invalidateCommentsEdgeCache(event, normalizedPath)

  return { success: true, comment }
})
