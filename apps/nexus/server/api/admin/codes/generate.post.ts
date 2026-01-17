import type { SubscriptionPlan } from '../../../utils/subscriptionStore'
import { requireAdmin } from '../../../utils/auth'
import { createActivationCode } from '../../../utils/subscriptionStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAdmin(event)
  const body = await readBody(event)

  const { plan, durationDays, maxUses, expiresInDays, count } = body

  // Validate plan
  const validPlans: SubscriptionPlan[] = ['FREE', 'PLUS', 'PRO', 'ENTERPRISE', 'TEAM']
  if (!plan || !validPlans.includes(plan)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid plan type' })
  }

  // Validate duration
  if (!durationDays || typeof durationDays !== 'number' || durationDays < 1 || durationDays > 365) {
    throw createError({ statusCode: 400, statusMessage: 'Duration must be between 1 and 365 days' })
  }

  // Validate count
  const codeCount = Math.min(Math.max(1, count || 1), 100)

  try {
    const codes = []
    for (let i = 0; i < codeCount; i++) {
      const code = await createActivationCode(event, {
        plan: plan as SubscriptionPlan,
        durationDays,
        maxUses: maxUses || 1,
        expiresInDays: expiresInDays || undefined,
        createdBy: userId,
      })
      codes.push(code)
    }

    return {
      success: true,
      codes,
    }
  }
  catch (error: any) {
    console.error('[admin/codes/generate] Error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to generate activation codes',
    })
  }
})
