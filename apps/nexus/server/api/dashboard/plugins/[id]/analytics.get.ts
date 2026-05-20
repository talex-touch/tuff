import { createError, getQuery } from 'h3'
import { requireAuthOrApiKey } from '../../../../utils/auth'
import { getUserById } from '../../../../utils/authStore'
import { getPlatformGovernanceSummary } from '../../../../utils/platformGovernanceStore'
import { getPluginById } from '../../../../utils/pluginsStore'

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

  const [downloads, invocations] = await Promise.all([
    getPlatformGovernanceSummary(event, {
      scope: 'plugin',
      action: 'download',
      resourceType: 'plugin',
      resourceId: id,
      days,
      limit: 5000,
    }),
    getPlatformGovernanceSummary(event, {
      scope: 'plugin',
      action: 'invoke',
      resourceType: 'plugin',
      resourceId: id,
      days,
      limit: 5000,
    }),
  ])

  return {
    pluginId: id,
    slug: plugin.slug,
    days,
    downloads,
    invocations,
    generatedAt: new Date().toISOString(),
  }
})
