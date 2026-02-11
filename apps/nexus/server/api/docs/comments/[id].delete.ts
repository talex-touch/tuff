import { requireAuth } from '../../../utils/auth'
import { getUserById } from '../../../utils/authStore'
import { deleteComment, ensureCommentsSchema, getCommentOwner, getD1Database } from '../../../utils/docCommentsStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id || typeof id !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing comment id' })
  }

  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 503, statusMessage: 'Database not available' })
  }

  await ensureCommentsSchema(db)

  const ownerId = await getCommentOwner(db, id)
  if (!ownerId) {
    throw createError({ statusCode: 404, statusMessage: 'Comment not found' })
  }

  const user = await getUserById(event, userId)
  const isAdmin = user?.role === 'admin'

  if (ownerId !== userId && !isAdmin) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })
  }

  await deleteComment(db, id)
  return { success: true }
})
