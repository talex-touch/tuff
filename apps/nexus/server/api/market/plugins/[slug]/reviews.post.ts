import type { User } from '@clerk/backend'
import { clerkClient } from '@clerk/nuxt/server'
import { readBody } from 'h3'
import { getPluginRatingSummary, upsertPluginRating } from '../../../../utils/pluginRatingStore'
import { upsertPluginReview } from '../../../../utils/pluginReviewStore'
import { requireAuth } from '../../../../utils/auth'
import { getPluginBySlug } from '../../../../utils/pluginsStore'

function cleanReview<T extends { userId?: string }>(review: T) {
  const { userId: _userId, ...rest } = review
  return rest
}

function resolveUserName(user: User, userId: string): string {
  const fullName = user.fullName?.trim()
  if (fullName)
    return fullName

  const composed = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  if (composed)
    return composed

  const username = user.username?.trim()
  if (username)
    return username

  const primaryEmail = user.primaryEmailAddressId
    ? user.emailAddresses?.find(address => address.id === user.primaryEmailAddressId)?.emailAddress
    : null

  return primaryEmail ?? user.emailAddresses?.[0]?.emailAddress ?? userId
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

  let client: ReturnType<typeof clerkClient>
  try {
    client = clerkClient(event)
  }
  catch (error: any) {
    throw createError({ statusCode: 500, statusMessage: error?.message || 'Clerk client initialization failed.' })
  }

  let user: User
  try {
    user = await client.users.getUser(userId)
  }
  catch (error: any) {
    const status = typeof error?.status === 'number' ? error.status : undefined
    const statusCode = status === 404 ? 401 : status
    throw createError({
      statusCode: statusCode && statusCode >= 400 && statusCode < 600 ? statusCode : 500,
      statusMessage: error?.message || 'Failed to fetch user info.',
    })
  }
  const authorName = resolveUserName(user, userId)
  const authorAvatarUrl = user.imageUrl || null
  const isAdmin = user.publicMetadata?.role === 'admin'

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
