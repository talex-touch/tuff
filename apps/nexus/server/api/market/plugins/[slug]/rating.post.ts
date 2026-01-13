import { createError, readBody } from 'h3'
import { requireAuth } from '../../../../utils/auth'
import { getPluginBySlug } from '../../../../utils/pluginsStore'
import { getPluginRatingSummary, upsertPluginRating } from '../../../../utils/pluginRatingStore'

export default defineEventHandler(async (event) => {
  const slug = event.context.params?.slug

  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Plugin slug is required.' })
  }

  const { userId } = await requireAuth(event)

  const body = await readBody<{ rating?: number }>(event)
  const ratingValue = Math.round(Number(body?.rating))

  if (!Number.isFinite(ratingValue) || ratingValue < 1 || ratingValue > 5) {
    throw createError({ statusCode: 400, statusMessage: 'Rating must be an integer from 1 to 5.' })
  }

  const plugin = await getPluginBySlug(event, slug, {
    includeVersions: false,
    forMarket: true,
  })

  if (!plugin) {
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })
  }

  await upsertPluginRating(event, { pluginId: plugin.id, userId, rating: ratingValue })

  const rating = await getPluginRatingSummary(event, plugin.id)

  return {
    slug: plugin.slug,
    rating,
  }
})

