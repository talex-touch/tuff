import { requireAdmin } from '../../../utils/auth'
import { ensureCommentsSchema, getD1Database, listAllComments, normalizePath } from '../../../utils/docCommentsStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)
  const limit = Math.min(Number(query.limit) || 20, 100)
  const offset = Number(query.offset) || 0
  const pathFilter = typeof query.path === 'string' && query.path.trim()
    ? normalizePath(query.path as string)
    : undefined

  const db = getD1Database(event)
  if (!db) {
    return { comments: [], total: 0, limit, offset }
  }

  await ensureCommentsSchema(db)

  return await listAllComments(db, { limit, offset, path: pathFilter })
})
