import { readCloudflareBindings } from '../../utils/cloudflare'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const docPath = query.path as string | undefined

  if (!docPath || typeof docPath !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing or invalid path parameter',
    })
  }

  const normalizedPath = docPath.replace(/^\/+|\/+$/g, '').toLowerCase()
  if (!normalizedPath.startsWith('docs/')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid doc path',
    })
  }

  const bindings = readCloudflareBindings(event)

  if (bindings?.DB) {
    try {
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
