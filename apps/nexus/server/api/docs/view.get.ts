import { setResponseHeader } from 'h3'
import { readCloudflareBindings } from '../../utils/cloudflare'
import { ensureDocAnalyticsSchema, isAllowedDocPathForSource, normalizeDocPath, normalizeDocSourceType } from '../../utils/docAnalyticsStore'
import { openEdgeCache } from '../../utils/edgeCache'
import { EvidenceSource } from '../../utils/evidenceSource'

const VIEW_EDGE_CACHE_TTL_SECONDS = 60
const VIEW_CACHE_CONTROL = 'public, max-age=30, stale-while-revalidate=60'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const docPath = query.path as string | undefined
  const sourceType = normalizeDocSourceType(query.source)

  if (!docPath || typeof docPath !== 'string') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing or invalid path parameter',
    })
  }

  const normalizedPath = normalizeDocPath(docPath)
  if (!isAllowedDocPathForSource(normalizedPath, sourceType)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid doc path',
    })
  }

  const edge = await openEdgeCache(event, { name: 'docs/view', params: { path: normalizedPath, source: sourceType } })
  if (edge?.hit)
    return edge.hit

  const bindings = readCloudflareBindings(event)

  if (bindings?.DB) {
    try {
      await ensureDocAnalyticsSchema(bindings.DB)
      const result = await bindings.DB.prepare(
        'SELECT views, updated_at FROM doc_views WHERE path = ?1',
      ).bind(normalizedPath).first<{ views: number, updated_at: number }>()

      const payload = {
        views: result?.views ?? 0,
        updatedAt: result?.updated_at ?? null,
        source: EvidenceSource.D1,
      }

      if (edge) {
        return edge.store({
          body: JSON.stringify(payload),
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': VIEW_CACHE_CONTROL,
          },
        }, VIEW_EDGE_CACHE_TTL_SECONDS)
      }

      if (event.node?.res)
        setResponseHeader(event, 'cache-control', VIEW_CACHE_CONTROL)
      return payload
    }
    catch (error) {
      console.warn('[api/docs/view] D1 read error', error)
    }
  }

  return {
    views: 0,
    updatedAt: null,
    source: EvidenceSource.Memory,
  }
})
