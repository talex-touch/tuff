import { setResponseHeader } from 'h3'
import { ensureCommentsSchema, getD1Database, listComments, normalizePath } from '../../utils/docCommentsStore'
import { openEdgeCache } from '../../utils/edgeCache'
import { EvidenceSource } from '../../utils/evidenceSource'

const COMMENTS_EDGE_CACHE_TTL_SECONDS = 60
const COMMENTS_CACHE_CONTROL = 'public, max-age=30, stale-while-revalidate=60'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const docPath = query.path as string | undefined

  if (!docPath || typeof docPath !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing or invalid path parameter',
    })
  }

  const normalizedPath = normalizePath(docPath)
  const edge = await openEdgeCache(event, { name: 'docs/comments', params: { path: normalizedPath } })
  if (edge?.hit)
    return edge.hit

  const db = getD1Database(event)
  if (!db) {
    return { comments: [], source: EvidenceSource.Memory }
  }

  try {
    await ensureCommentsSchema(db)
    const result = await listComments(db, normalizedPath)
    const payload = { comments: result.comments, source: EvidenceSource.D1 }

    if (edge) {
      return edge.store({
        body: JSON.stringify(payload),
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': COMMENTS_CACHE_CONTROL,
        },
      }, COMMENTS_EDGE_CACHE_TTL_SECONDS)
    }

    if (event.node?.res)
      setResponseHeader(event, 'cache-control', COMMENTS_CACHE_CONTROL)
    return payload
  }
  catch (error) {
    console.warn('[api/docs/comments] D1 read error', error)
    return { comments: [], source: EvidenceSource.Memory }
  }
})
