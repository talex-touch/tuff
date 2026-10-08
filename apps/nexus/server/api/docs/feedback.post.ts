import { createError, readBody } from 'h3'
import { requireAuth } from '../../utils/auth'
import { readCloudflareBindings } from '../../utils/cloudflare'
import { DOC_FEEDBACK_TABLE, ensureDocFeedbackSchema, normalizeDocFeedbackPath } from '../../utils/docFeedbackStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)

  const body = await readBody<{ path: string, helpful: boolean }>(event)
  const docPath = body?.path
  const helpful = body?.helpful

  if (!docPath || typeof docPath !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing or invalid path' })
  }
  if (typeof helpful !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'helpful must be a boolean' })
  }

  const normalizedPath = normalizeDocFeedbackPath(docPath)

  const bindings = readCloudflareBindings(event)
  if (!bindings?.DB) {
    throw createError({ statusCode: 503, statusMessage: 'Database not available' })
  }

  const db = bindings.DB
  await ensureDocFeedbackSchema(db)

  // A new vote and a switched vote are one upsert, and it says which happened by returning the row.
  // A repeat of the vote already cast leaves the row alone and returns nothing: that is the toggle-off,
  // the one case that needs a second statement. It used to read the row first, every time.
  const written = await db.prepare(`
    INSERT INTO ${DOC_FEEDBACK_TABLE} (path, user_id, helpful, created_at)
    VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT(path, user_id) DO UPDATE SET
      helpful = excluded.helpful,
      created_at = excluded.created_at
    WHERE ${DOC_FEEDBACK_TABLE}.helpful != excluded.helpful
    RETURNING helpful
  `).bind(normalizedPath, userId, helpful ? 1 : 0, Date.now()).first<{ helpful: number }>()

  if (written)
    return { success: true, userVote: helpful }

  await db.prepare(
    `DELETE FROM ${DOC_FEEDBACK_TABLE} WHERE path = ?1 AND user_id = ?2 AND helpful = ?3`,
  ).bind(normalizedPath, userId, helpful ? 1 : 0).run()
  return { success: true, userVote: null }
})
