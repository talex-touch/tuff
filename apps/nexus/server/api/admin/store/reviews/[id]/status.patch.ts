import { readBody } from 'h3'
import { requireAdmin } from '../../../../../utils/auth'
import { logAdminAudit } from '../../../../../utils/adminAuditStore'
import { setPluginReviewStatus } from '../../../../../utils/pluginReviewStore'

const ALLOWED_STATUSES = ['approved', 'rejected'] as const

export default defineEventHandler(async (event) => {
  const { userId: adminId } = await requireAdmin(event)
  const id = event.context.params?.id

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Review id is required.' })
  }

  const body = await readBody<{ status?: string }>(event)
  const status = body?.status?.trim()

  if (!status || !(ALLOWED_STATUSES as readonly string[]).includes(status)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid status.' })
  }

  const review = await setPluginReviewStatus(event, id, status as (typeof ALLOWED_STATUSES)[number])

  if (!review) {
    throw createError({ statusCode: 404, statusMessage: 'Review not found.' })
  }

  // setPluginReviewStatus writes before it reads back, so the prior status is
  // already gone by here; the trail records the decision and its subject.
  await logAdminAudit(event, {
    adminUserId: adminId,
    action: 'store_review.status.update',
    targetType: 'store_review',
    targetId: review.id,
    targetLabel: `${review.pluginId} / ${review.userId}`,
    metadata: {
      after: { status: review.status },
      pluginId: review.pluginId,
      reviewerUserId: review.userId,
      rating: review.rating,
    },
  })

  return { review }
})
