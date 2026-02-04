import { readBody } from 'h3'
import { getPluginRatingSummary, upsertPluginRating } from '../../../../utils/pluginRatingStore'
import { upsertPluginReview } from '../../../../utils/pluginReviewStore'
import { requireAuth } from '../../../../utils/auth'
import { getUserById } from '../../../../utils/authStore'
import { getPluginBySlug } from '../../../../utils/pluginsStore'

function cleanReview<T extends { userId?: string }>(review: T) {
  const { userId: _userId, ...rest } = review
  return rest
}

function resolveUserName(user: { name: string | null, email: string }): string {
  if (user.name && user.name.trim())
    return user.name.trim()
  return user.email
}

export default defineEventHandler(async (event) => {
  const slug = event.context.params?.slug

  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Plugin slug is required.' })
  }

  const { userId } = await requireAuth(event)
  const body = await readBody<{ rating?: number, title?: string, content?: string }>(event)
  const ratingValue = Math.round(Number(body?.rating))

  if (!Number.isFinite(ratingValue) || ratingValue < 1 || ratingValue > 5) {
    throw createError({ statusCode: 400, statusMessage: 'Rating must be an integer from 1 to 5.' })
  }

  const content = body?.content?.trim() ?? ''
  if (!content) {
    throw createError({ statusCode: 400, statusMessage: 'Review content is required.' })
  }

  const title = body?.title?.trim() || null
  const plugin = await getPluginBySlug(event, slug, {
    includeVersions: false,
    forMarket: true,
  })

  if (!plugin) {
    throw createError({ statusCode: 404, statusMessage: 'Plugin not found.' })
  }

  const user = await getUserById(event, userId)
  if (!user) {
    throw createError({ statusCode: 401, statusMessage: 'User not found.' })
  }
  const authorName = resolveUserName(user)
  const authorAvatarUrl = user.image || null
  const isAdmin = user.role === 'admin'

  const review = await upsertPluginReview(event, {
    pluginId: plugin.id,
    userId,
    authorName,
    authorAvatarUrl,
    rating: ratingValue,
    title,
    content,
    status: isAdmin ? 'approved' : 'pending',
  })

  await upsertPluginRating(event, { pluginId: plugin.id, userId, rating: ratingValue })
  const rating = await getPluginRatingSummary(event, plugin.id)

  return {
    review: cleanReview(review),
    rating,
  }
})
