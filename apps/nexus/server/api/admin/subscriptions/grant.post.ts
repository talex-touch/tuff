import { createError, readBody } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { getUserByEmail, getUserById } from '../../../utils/authStore'
import type { SubscriptionPlan } from '../../../utils/subscriptionStore'
import { activateCode, createActivationCode } from '../../../utils/subscriptionStore'
import { logAdminAudit } from '../../../utils/adminAuditStore'

const ALLOWED_PLANS: SubscriptionPlan[] = ['PLUS', 'PRO', 'TEAM', 'ENTERPRISE']

export default defineEventHandler(async (event) => {
  const { userId: adminId } = await requireAdmin(event)

  const body = await readBody<{
    userId?: string
    email?: string
    plan?: string
    durationDays?: number
    expiresInDays?: number
  }>(event)

  const targetUserId = body?.userId?.trim()
  const targetEmail = body?.email?.trim().toLowerCase()
  const plan = body?.plan?.trim().toUpperCase()
  const durationDays = Number(body?.durationDays)
  const expiresInDays = body?.expiresInDays != null ? Number(body.expiresInDays) : Math.max(7, durationDays)

  if (!targetUserId && !targetEmail)
    throw createError({ statusCode: 400, statusMessage: 'User id or email is required.' })

  if (!plan || !ALLOWED_PLANS.includes(plan as SubscriptionPlan))
    throw createError({ statusCode: 400, statusMessage: 'Invalid plan.' })

  if (!Number.isFinite(durationDays) || durationDays <= 0)
    throw createError({ statusCode: 400, statusMessage: 'Invalid duration.' })

  if (!Number.isFinite(expiresInDays) || expiresInDays <= 0)
    throw createError({ statusCode: 400, statusMessage: 'Invalid expiry.' })

  const targetUser = targetUserId
    ? await getUserById(event, targetUserId)
    : await getUserByEmail(event, targetEmail as string)

  if (!targetUser)
    throw createError({ statusCode: 404, statusMessage: 'User not found.' })
  if (targetUser.status !== 'active')
    throw createError({ statusCode: 400, statusMessage: 'User is not active.' })

  const code = await createActivationCode(event, {
    plan: plan as SubscriptionPlan,
    durationDays,
    maxUses: 1,
    expiresInDays,
    createdBy: adminId,
  })

  const activated = await activateCode(event, code.code, targetUser.id)

  await logAdminAudit(event, {
    adminUserId: adminId,
    action: 'subscription.grant',
    targetType: 'user',
    targetId: targetUser.id,
    targetLabel: targetUser.email,
    metadata: {
      plan: activated.plan,
      durationDays,
      expiresAt: activated.expiresAt,
      codeId: code.id,
    },
  })

  return {
    userId: targetUser.id,
    plan: activated.plan,
    expiresAt: activated.expiresAt,
  }
})
