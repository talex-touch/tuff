import { requireAuth } from '../../utils/auth'
import { activateCode, getPlanFeatures } from '../../utils/subscriptionStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const body = await readBody(event)

  const { code } = body
  if (!code || typeof code !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Activation code is required' })
  }

  // Validate and use the activation code
  const result = await activateCode(event, code, userId)

  const features = getPlanFeatures(result.plan)

  return {
    success: true,
    plan: result.plan,
    expiresAt: result.expiresAt,
    features,
  }
})
