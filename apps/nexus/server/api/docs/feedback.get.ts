import { createError, getHeader, getQuery, setResponseHeader } from 'h3'
import { SESSION_TOKEN_COOKIE_NAMES } from '#shared/utils/session-hint'
import { readSessionTokenUserId } from '../../utils/auth'
import { readCloudflareBindings } from '../../utils/cloudflare'
import { DOC_FEEDBACK_TABLE, ensureDocFeedbackSchema, normalizeDocFeedbackPath } from '../../utils/docFeedbackStore'
import { openEdgeCache } from '../../utils/edgeCache'

const FEEDBACK_EDGE_CACHE_TTL_SECONDS = 120
const FEEDBACK_PUBLIC_CACHE_CONTROL = 'public, max-age=60, stale-while-revalidate=120'
const FEEDBACK_PRIVATE_CACHE_CONTROL = 'private, no-store'

function hasSessionTokenCookie(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader)
    return false

  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1)
      continue
    const name = part.slice(0, separator).trim()
    if ((SESSION_TOKEN_COOKIE_NAMES as readonly string[]).includes(name) && part.slice(separator + 1).trim())
      return true
  }

  return false
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const docPath = query.path as string | undefined

  if (!docPath || typeof docPath !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Missing or invalid path parameter' })
  }

  const normalizedPath = normalizeDocFeedbackPath(docPath)
  const hasSessionCookie = hasSessionTokenCookie(getHeader(event, 'cookie'))

  // Anonymous readers (~95%+) share the colo edge cache with 0 D1 reads and `userVote: null`.
  // Authenticated readers bypass the edge cache and always read their own `userVote` from D1.
  if (!hasSessionCookie) {
    const edge = await openEdgeCache(event, { name: 'docs/feedback', params: { path: normalizedPath } })
    if (edge?.hit)
      return edge.hit

    if (edge) {
      const bindings = readCloudflareBindings(event)
      if (!bindings?.DB)
        return { helpful: 0, unhelpful: 0, userVote: null }

      const db = bindings.DB
      await ensureDocFeedbackSchema(db)
      const row = await db.prepare(`
        SELECT
          COALESCE(SUM(CASE WHEN helpful = 1 THEN 1 ELSE 0 END), 0) AS helpful,
          COALESCE(SUM(CASE WHEN helpful = 0 THEN 1 ELSE 0 END), 0) AS unhelpful
        FROM ${DOC_FEEDBACK_TABLE}
        WHERE path = ?1
      `).bind(normalizedPath).first<{ helpful: number, unhelpful: number }>()

      const payload = {
        helpful: Number(row?.helpful ?? 0),
        unhelpful: Number(row?.unhelpful ?? 0),
        userVote: null,
      }

      return edge.store({
        body: JSON.stringify(payload),
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': FEEDBACK_PUBLIC_CACHE_CONTROL,
        },
      }, FEEDBACK_EDGE_CACHE_TTL_SECONDS)
    }
  }

  const bindings = readCloudflareBindings(event)
  if (!bindings?.DB) {
    if (hasSessionCookie && event.node?.res)
      setResponseHeader(event, 'cache-control', FEEDBACK_PRIVATE_CACHE_CONTROL)
    return { helpful: 0, unhelpful: 0, userVote: null }
  }

  const db = bindings.DB
  // The caller's own vote comes from their session. It used to come from `?userId=`, which answered
  // for whichever account the query named.
  const [userId] = await Promise.all([readSessionTokenUserId(event), ensureDocFeedbackSchema(db)])

  if (event.node?.res) {
    setResponseHeader(
      event,
      'cache-control',
      hasSessionCookie || userId ? FEEDBACK_PRIVATE_CACHE_CONTROL : FEEDBACK_PUBLIC_CACHE_CONTROL,
    )
  }

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
