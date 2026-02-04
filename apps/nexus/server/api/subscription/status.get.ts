import { requireAuth } from '../../utils/auth'
import { getPlanFeatures } from '../../utils/subscriptionStore'
import { getCreditSummary } from '../../utils/creditsStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const subscriptionPlan = 'FREE'
  const features = getPlanFeatures(subscriptionPlan)
  const credits = await getCreditSummary(event, userId)
  const teamUsed = Number((credits.team as any)?.used ?? 0)
  const teamLimit = Number((credits.team as any)?.quota ?? features.aiRequestsLimit)

  return {
    plan: subscriptionPlan,
    expiresAt: null,
    activatedAt: null,
    isActive: true,
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
