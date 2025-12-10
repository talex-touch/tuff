import { readCloudflareBindings } from '../../utils/cloudflare'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ path: string }>(event)
  const docPath = body?.path

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
      await bindings.DB.prepare(`
        CREATE TABLE IF NOT EXISTS doc_views (
          path TEXT PRIMARY KEY,
          views INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL
        );
      `).run()

      const existing = await bindings.DB.prepare(
        'SELECT views FROM doc_views WHERE path = ?1',
      ).bind(normalizedPath).first<{ views: number }>()

      const nextViews = (existing?.views ?? 0) + 1
      const now = Date.now()

      await bindings.DB.prepare(`
        INSERT INTO doc_views (path, views, updated_at)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(path) DO UPDATE SET views = excluded.views, updated_at = excluded.updated_at;
      `).bind(normalizedPath, nextViews, now).run()

      return {
        success: true,
        views: nextViews,
        source: 'd1',
      }
    }
    catch (error) {
      console.warn('[api/docs/view] D1 error', error)
    }
  }

  return {
    success: true,
    views: 1,
    source: 'memory',
  }
})
