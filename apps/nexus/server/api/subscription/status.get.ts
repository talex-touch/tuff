import { requireAuth } from '../../utils/auth'
import { getPlanFeatures, getUserSubscription } from '../../utils/subscriptionStore'
import { getCreditSummary } from '../../utils/creditsStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const subscription = await getUserSubscription(event, userId)
  const features = getPlanFeatures(subscription.plan)
  const credits = await getCreditSummary(event, userId)
  const teamUsed = Number((credits.team as any)?.used ?? 0)
  const teamLimit = Number((credits.team as any)?.quota ?? features.aiRequestsLimit)

  return {
    plan: subscription.plan,
    expiresAt: subscription.expiresAt,
    activatedAt: subscription.activatedAt,
    isActive: subscription.isActive,
    features: {
      aiRequests: {
        limit: teamLimit,
        used: teamUsed,
      },
      aiTokens: {
        limit: features.aiTokensLimit,
        used: 0,
      },
      customModels: features.customModels,
      prioritySupport: features.prioritySupport,
      apiAccess: features.apiAccess,
    },
  }
})
