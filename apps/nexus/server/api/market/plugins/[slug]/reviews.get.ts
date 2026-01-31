import { getQuery } from 'h3'
import { listPluginReviews } from '../../../../utils/pluginReviewStore'
import { requireAuth } from '../../../../utils/auth'
import { getPluginBySlug } from '../../../../utils/pluginsStore'

function cleanReview<T extends { userId?: string }>(review: T) {
  const { userId: _userId, ...rest } = review
  return rest
}

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

  const query = getQuery(event)
  const limit = Math.min(Number(query.limit) || 20, 50)
  const offset = Number(query.offset) || 0

  let viewerId: string | undefined
  if (event.context.auth || event.node.req.headers.authorization) {
    try {
      const auth = await requireAuth(event)
      viewerId = auth.userId
    }
    catch {
      viewerId = undefined
    }
  }

  const result = await listPluginReviews(event, plugin.id, { limit, offset, viewerId })
  const reviews = result.reviews.map(cleanReview)

  return {
    slug: plugin.slug,
    ...result,
    reviews,
  }
})
