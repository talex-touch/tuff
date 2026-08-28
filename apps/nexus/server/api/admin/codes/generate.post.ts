import type { SubscriptionPlan } from '../../../utils/subscriptionStore'
import { requireAdmin } from '../../../utils/auth'
import { logAdminAudit } from '../../../utils/adminAuditStore'
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

  // Validate max uses
  if (maxUses !== undefined && maxUses !== null
    && (typeof maxUses !== 'number' || !Number.isInteger(maxUses) || maxUses < 1 || maxUses > 1000)) {
    throw createError({ statusCode: 400, statusMessage: 'Max uses must be between 1 and 1000' })
  }

  // Validate expiry window
  if (expiresInDays !== undefined && expiresInDays !== null
    && (typeof expiresInDays !== 'number' || !Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365)) {
    throw createError({ statusCode: 400, statusMessage: 'Expiry must be between 1 and 365 days' })
  }

  // Validate count
  const codeCount = Math.min(Math.max(1, count || 1), 100)

  const codes: Awaited<ReturnType<typeof createActivationCode>>[] = []

  try {
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
  }
  catch (error: any) {
    console.error('[admin/codes/generate] Error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Failed to generate activation codes',
    })
  }

  // One entry for the batch rather than one per code: the admin performed a
  // single action, and the redeemable reach of it is codeCount * maxUses.
  await logAdminAudit(event, {
    adminUserId: userId,
    action: 'activation_code.generate',
    targetType: 'activation_code',
    targetId: null,
    targetLabel: `${plan} x${codeCount}`,
    metadata: {
      plan,
      durationDays,
      count: codeCount,
      maxUses: maxUses || 1,
      expiresInDays: expiresInDays ?? null,
      codeIds: codes.map(code => code.id),
    },
  })

  return {
    success: true,
    codes,
  }
})
