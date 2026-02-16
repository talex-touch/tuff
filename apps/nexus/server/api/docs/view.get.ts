import { readCloudflareBindings } from '../../utils/cloudflare'
import { ensureDocAnalyticsSchema, normalizeDocPath } from '../../utils/docAnalyticsStore'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const docPath = query.path as string | undefined

  if (!docPath || typeof docPath !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing or invalid path parameter',
    })
  }

  const normalizedPath = normalizeDocPath(docPath)
  if (!normalizedPath.startsWith('docs/')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid doc path',
    })
  }

  const bindings = readCloudflareBindings(event)

  if (bindings?.DB) {
    try {
      await ensureDocAnalyticsSchema(bindings.DB)
      const result = await bindings.DB.prepare(
        'SELECT views, updated_at FROM doc_views WHERE path = ?1',
      ).bind(normalizedPath).first<{ views: number, updated_at: number }>()

      return {
        views: result?.views ?? 0,
        updatedAt: result?.updated_at ?? null,
        source: 'd1',
      }
    }
    catch (error) {
      console.warn('[api/docs/view] D1 read error', error)
    }
  }

  return {
    views: 0,
    updatedAt: null,
    source: 'memory',
  }
})
