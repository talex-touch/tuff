import { readCloudflareBindings } from '../../utils/cloudflare'

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
  const query = getQuery(event)
  const docPath = query.path as string | undefined

  if (!docPath || typeof docPath !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing or invalid path parameter' })
  }

  const normalizedPath = docPath.replace(/^\/+|\/+$/g, '').toLowerCase()

  const bindings = readCloudflareBindings(event)
  if (!bindings?.DB) {
    return { helpful: 0, unhelpful: 0, userVote: null }
  }

  const db = bindings.DB
  await ensureFeedbackSchema(db)

  const helpfulResult = await db.prepare(
    `SELECT COUNT(*) as cnt FROM ${DOC_FEEDBACK_TABLE} WHERE path = ?1 AND helpful = 1`,
  ).bind(normalizedPath).first<{ cnt: number }>()

  const unhelpfulResult = await db.prepare(
    `SELECT COUNT(*) as cnt FROM ${DOC_FEEDBACK_TABLE} WHERE path = ?1 AND helpful = 0`,
  ).bind(normalizedPath).first<{ cnt: number }>()

  // Check if current user has voted (optional, via query param)
  let userVote: boolean | null = null
  const userId = query.userId as string | undefined
  if (userId) {
    const userRow = await db.prepare(
      `SELECT helpful FROM ${DOC_FEEDBACK_TABLE} WHERE path = ?1 AND user_id = ?2`,
    ).bind(normalizedPath, userId).first<{ helpful: number }>()
    if (userRow !== null)
      userVote = userRow.helpful === 1
  }

  return {
    helpful: helpfulResult?.cnt ?? 0,
    unhelpful: unhelpfulResult?.cnt ?? 0,
    userVote,
  }
})
