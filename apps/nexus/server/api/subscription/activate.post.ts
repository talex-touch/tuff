import { clerkClient } from '@clerk/nuxt/server'
import { requireAuth } from '../../utils/auth'
import { activateCode, getPlanFeatures } from '../../utils/subscriptionStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const client = clerkClient(event)
  const body = await readBody(event)

  const { code } = body
  if (!code || typeof code !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Activation code is required' })
  }

  // Validate and use the activation code
  const result = await activateCode(event, code, userId)

  // Update user's public metadata with subscription info
  const features = getPlanFeatures(result.plan)

  await client.users.updateUserMetadata(userId, {
    publicMetadata: {
      subscription: {
        plan: result.plan,
        expiresAt: result.expiresAt,
        activatedAt: new Date().toISOString(),
        activationCode: `${code.substring(0, 12)}****`, // Mask code
      },
      quotas: {
        aiRequests: { used: 0, limit: features.aiRequestsLimit },
        aiTokens: { used: 0, limit: features.aiTokensLimit },
      },
    },
  })

  return {
    success: true,
    plan: result.plan,
    expiresAt: result.expiresAt,
    features,
  }
})
