import { clerkClient } from '@clerk/nuxt/server'
import { requireAuth } from '../../utils/auth'
import { getSubscriptionFromMetadata, getPlanFeatures } from '../../utils/subscriptionStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const client = clerkClient(event)

  const user = await client.users.getUser(userId)
  const subscription = getSubscriptionFromMetadata(user.publicMetadata)
  const features = getPlanFeatures(subscription.plan)

  // Get quota usage from metadata
  const quotas = (user.publicMetadata as any)?.quotas || {
    aiRequests: { used: 0, limit: features.aiRequestsLimit },
    aiTokens: { used: 0, limit: features.aiTokensLimit },
  }

  return {
    plan: subscription.plan,
    expiresAt: subscription.expiresAt,
    activatedAt: subscription.activatedAt,
    isActive: subscription.isActive,
    features: {
      aiRequests: {
        limit: features.aiRequestsLimit,
        used: quotas.aiRequests?.used || 0,
      },
      aiTokens: {
        limit: features.aiTokensLimit,
        used: quotas.aiTokens?.used || 0,
      },
      customModels: features.customModels,
      prioritySupport: features.prioritySupport,
      apiAccess: features.apiAccess,
    },
  }
})
