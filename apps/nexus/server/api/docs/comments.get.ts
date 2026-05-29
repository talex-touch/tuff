import { ensureCommentsSchema, getD1Database, listComments, normalizePath } from '../../utils/docCommentsStore'
import { EvidenceSource } from '../../utils/evidenceSource'

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
  const db = getD1Database(event)

  if (!db) {
    return { comments: [], source: EvidenceSource.Memory }
  }

  try {
    await ensureCommentsSchema(db)
    const result = await listComments(db, normalizedPath)
    return { comments: result.comments, source: EvidenceSource.D1 }
  }
  catch (error) {
    console.warn('[api/docs/comments] D1 read error', error)
    return { comments: [], source: EvidenceSource.Memory }
  }
})
