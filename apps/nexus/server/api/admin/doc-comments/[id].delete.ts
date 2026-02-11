import { requireAdmin } from '../../../utils/auth'
import { deleteComment, ensureCommentsSchema, getCommentOwner, getD1Database } from '../../../utils/docCommentsStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

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

  await deleteComment(db, id)
  return { success: true }
})
