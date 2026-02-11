import { readCloudflareBindings } from '../../utils/cloudflare'
import { requireAuth } from '../../utils/auth'

const DOC_FEEDBACK_TABLE = 'doc_feedback'

let feedbackSchemaInitialized = false

async function ensureFeedbackSchema(db: D1Database) {
  if (feedbackSchemaInitialized)
    return
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${DOC_FEEDBACK_TABLE} (
      path TEXT NOT NULL,
      user_id TEXT NOT NULL,
      helpful INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (path, user_id)
    );
  `).run()
  feedbackSchemaInitialized = true
}

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

  const normalizedPath = docPath.replace(/^\/+|\/+$/g, '').toLowerCase()

  const bindings = readCloudflareBindings(event)
  if (!bindings?.DB) {
    throw createError({ statusCode: 503, statusMessage: 'Database not available' })
  }

  const db = bindings.DB
  await ensureFeedbackSchema(db)

  const now = Date.now()

  // Check existing vote
  const existing = await db.prepare(
    `SELECT helpful FROM ${DOC_FEEDBACK_TABLE} WHERE path = ?1 AND user_id = ?2`,
  ).bind(normalizedPath, userId).first<{ helpful: number }>()

  if (existing !== null) {
    const currentVote = existing.helpful === 1
    if (currentVote === helpful) {
      // Toggle off: remove the vote
      await db.prepare(
        `DELETE FROM ${DOC_FEEDBACK_TABLE} WHERE path = ?1 AND user_id = ?2`,
      ).bind(normalizedPath, userId).run()
      return { success: true, userVote: null }
    }
    else {
      // Switch vote
      await db.prepare(
        `UPDATE ${DOC_FEEDBACK_TABLE} SET helpful = ?1, created_at = ?2 WHERE path = ?3 AND user_id = ?4`,
      ).bind(helpful ? 1 : 0, now, normalizedPath, userId).run()
      return { success: true, userVote: helpful }
    }
  }

  // New vote
  await db.prepare(
    `INSERT INTO ${DOC_FEEDBACK_TABLE} (path, user_id, helpful, created_at) VALUES (?1, ?2, ?3, ?4)`,
  ).bind(normalizedPath, userId, helpful ? 1 : 0, now).run()

  return { success: true, userVote: helpful }
})
