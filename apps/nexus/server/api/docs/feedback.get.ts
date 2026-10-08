import { createError, getQuery } from 'h3'
import { readSessionTokenUserId } from '../../utils/auth'
import { readCloudflareBindings } from '../../utils/cloudflare'
import { DOC_FEEDBACK_TABLE, ensureDocFeedbackSchema, normalizeDocFeedbackPath } from '../../utils/docFeedbackStore'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const docPath = query.path as string | undefined

  if (!docPath || typeof docPath !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing or invalid path parameter' })
  }

  const normalizedPath = normalizeDocFeedbackPath(docPath)

  const bindings = readCloudflareBindings(event)
  if (!bindings?.DB) {
    return { helpful: 0, unhelpful: 0, userVote: null }
  }

  const db = bindings.DB
  // The caller's own vote comes from their session. It used to come from `?userId=`, which answered
  // for whichever account the query named.
  const [userId] = await Promise.all([readSessionTokenUserId(event), ensureDocFeedbackSchema(db)])

  // Both tallies and the caller's vote in one query; they were three round trips.
  const row = await db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN helpful = 1 THEN 1 ELSE 0 END), 0) AS helpful,
      COALESCE(SUM(CASE WHEN helpful = 0 THEN 1 ELSE 0 END), 0) AS unhelpful,
      (SELECT helpful FROM ${DOC_FEEDBACK_TABLE} WHERE path = ?1 AND user_id = ?2) AS user_vote
    FROM ${DOC_FEEDBACK_TABLE}
    WHERE path = ?1
  `).bind(normalizedPath, userId ?? '').first<{ helpful: number, unhelpful: number, user_vote: number | null }>()

  return {
    helpful: Number(row?.helpful ?? 0),
    unhelpful: Number(row?.unhelpful ?? 0),
    userVote: row?.user_vote == null ? null : row.user_vote === 1,
  }
})
