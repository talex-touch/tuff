import { getQuery } from 'h3'
import { requireAdmin } from '../../../../utils/auth'
import { listPendingPluginReviews } from '../../../../utils/pluginReviewStore'
import { getPluginById } from '../../../../utils/pluginsStore'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const query = getQuery(event)
  const limit = Math.min(Number(query.limit) || 20, 100)
  const offset = Number(query.offset) || 0

  const result = await listPendingPluginReviews(event, { limit, offset })
  const pluginIds = Array.from(new Set(result.reviews.map(review => review.pluginId)))
  const plugins = await Promise.all(pluginIds.map(async (id) => {
    const plugin = await getPluginById(event, id)
    return plugin ? { id: plugin.id, slug: plugin.slug, name: plugin.name } : null
  }))
  const pluginMap = new Map(
    plugins
      .filter((plugin): plugin is { id: string, slug: string, name: string } => Boolean(plugin))
      .map(plugin => [plugin.id, plugin]),
  )

  const reviews = result.reviews.map(review => ({
    ...review,
    plugin: pluginMap.get(review.pluginId) ?? null,
  }))

  return {
    reviews,
    total: result.total,
    limit: result.limit,
    offset: result.offset,
  }
})
