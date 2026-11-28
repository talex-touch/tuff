import { createError, defineEventHandler, getQuery } from 'h3'
import { requireAuthOrApiKey } from '../../../../utils/auth'
import { getUserById } from '../../../../utils/authStore'
import { readCloudflareBindings } from '../../../../utils/cloudflare'
import { getPluginById } from '../../../../utils/pluginsStore'
import { getPluginReviewAnalytics } from '../../../../utils/pluginReviewStore'

function readPositiveInt(value: unknown, fallback: number, max = 365): number {
  if (typeof value !== 'string')
    return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuthOrApiKey(event, ['plugin:read'])
  const id = event.context.params?.id
  if (!id)
    throw createError({ statusCode: 400, statusMessage: 'Plugin id is required.' })

  const user = await getUserById(event, userId)
  const isAdmin = user?.role === 'admin'
  const plugin = await getPluginById(event, id)
  if (!plugin)
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })
  if (!isAdmin && plugin.userId !== userId)
    throw createError({ statusCode: 403, statusMessage: 'Forbidden' })

  const query = getQuery(event)
  const days = readPositiveInt(query.days, 30, 365)
  const since = new Date(Date.now() - days * 86_400_000).toISOString()

  const db = readCloudflareBindings(event)?.DB
  let actionCount = 0
  if (db) {
    try {
      const row = await db.prepare(`
        SELECT COUNT(*) AS total
        FROM telemetry_events
        WHERE event_type IN ('plugin_action', 'feature_use')
          AND created_at >= ?1
          AND (
            json_extract(metadata, '$.pluginId') = ?2
            OR json_extract(metadata, '$.pluginSlug') = ?3
            OR json_extract(metadata, '$.pluginName') = ?3
          );
      `).bind(since, plugin.id, plugin.slug).first<{ total?: number }>()
      actionCount = Number(row?.total ?? 0)
    }
    catch {
      actionCount = 0
    }
  }

  const reviews = await getPluginReviewAnalytics(event, id)

  return {
    pluginId: id,
    slug: plugin.slug,
    days,
    analytics: {
      days,
      installs: plugin.installs,
      actions: actionCount,
      reviews,
    },
    generatedAt: new Date().toISOString(),
  }
})
