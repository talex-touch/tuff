import { createError, getQuery } from 'h3'
import { requireAuthOrApiKey } from '../../../../utils/auth'
import { getUserById } from '../../../../utils/authStore'
import { getPluginGovernanceAnalytics } from '../../../../utils/platformGovernanceStore'
import { getPluginById } from '../../../../utils/pluginsStore'
import { getPluginReviewAnalytics } from '../../../../utils/pluginReviewStore'

function readPositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'string')
    return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
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
  const days = readPositiveInt(query.days, 30)
  const limit = readPositiveInt(query.limit, 5000)
  const topLimit = readPositiveInt(query.topLimit, 12)

  const [analytics, reviews] = await Promise.all([
    getPluginGovernanceAnalytics(event, id, {
      days,
      limit,
      topLimit,
    }),
    getPluginReviewAnalytics(event, id),
  ])

  return {
    pluginId: id,
    slug: plugin.slug,
    days: analytics.days,
    analytics: {
      ...analytics,
      reviews,
    },
    generatedAt: new Date().toISOString(),
  }
})
