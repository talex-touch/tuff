import { createError } from 'h3'
import { getPluginBySlug } from '../../../../utils/pluginsStore'
import { getPluginRatingSummary } from '../../../../utils/pluginRatingStore'

export default defineEventHandler(async (event) => {
  const slug = event.context.params?.slug

  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Plugin slug is required.' })
  }

  const plugin = await getPluginBySlug(event, slug, {
    includeVersions: false,
    forMarket: true,
  })

  if (!plugin) {
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })
  }

  const rating = await getPluginRatingSummary(event, plugin.id)

  return {
    slug: plugin.slug,
    rating,
  }
})

