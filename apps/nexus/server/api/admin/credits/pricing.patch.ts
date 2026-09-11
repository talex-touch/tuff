import { createError, readBody } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { logAdminAudit } from '../../../utils/adminAuditStore'
import { updateCreditPricing } from '../../../utils/creditPricingStore'

/** Beyond this a per-unit price stops being a price and becomes a billing accident. */
const MAX_CREDITS_PER_UNIT = 1_000_000
const MAX_RESERVE_MULTIPLIER = 100

export default defineEventHandler(async (event) => {
  const { userId: adminId } = await requireAdmin(event)

  const body = await readBody<{
    capability?: string
    creditsPerUnit?: number | string
    minCredits?: number | string
    reserveMultiplier?: number | string
    upstreamCostUsdPerUnit?: number | string | null
    active?: boolean
  }>(event)

  const capability = typeof body?.capability === 'string' ? body.capability.trim() : ''
  if (!capability)
    throw createError({ statusCode: 400, statusMessage: 'Capability is required.' })

  const patch: Parameters<typeof updateCreditPricing>[2] = {}

  if (body?.creditsPerUnit !== undefined) {
    const creditsPerUnit = Number(body.creditsPerUnit)
    if (!Number.isFinite(creditsPerUnit) || creditsPerUnit <= 0 || creditsPerUnit > MAX_CREDITS_PER_UNIT)
      throw createError({ statusCode: 400, statusMessage: 'Invalid credits per unit.' })
    patch.creditsPerUnit = creditsPerUnit
  }

  if (body?.minCredits !== undefined) {
    const minCredits = Number(body.minCredits)
    if (!Number.isInteger(minCredits) || minCredits < 0 || minCredits > MAX_CREDITS_PER_UNIT)
      throw createError({ statusCode: 400, statusMessage: 'Invalid minimum credits.' })
    patch.minCredits = minCredits
  }

  if (body?.reserveMultiplier !== undefined) {
    const reserveMultiplier = Number(body.reserveMultiplier)
    if (!Number.isFinite(reserveMultiplier) || reserveMultiplier < 1 || reserveMultiplier > MAX_RESERVE_MULTIPLIER)
      throw createError({ statusCode: 400, statusMessage: 'Invalid reserve multiplier.' })
    patch.reserveMultiplier = reserveMultiplier
  }

  if (body?.upstreamCostUsdPerUnit !== undefined) {
    if (body.upstreamCostUsdPerUnit === null) {
      patch.upstreamCostUsdPerUnit = null
    }
    else {
      const cost = Number(body.upstreamCostUsdPerUnit)
      if (!Number.isFinite(cost) || cost < 0)
        throw createError({ statusCode: 400, statusMessage: 'Invalid upstream cost.' })
      patch.upstreamCostUsdPerUnit = cost
    }
  }

  if (body?.active !== undefined) {
    if (typeof body.active !== 'boolean')
      throw createError({ statusCode: 400, statusMessage: 'Invalid active flag.' })
    patch.active = body.active
  }

  if (!Object.keys(patch).length)
    throw createError({ statusCode: 400, statusMessage: 'No pricing fields to update.' })

  const updated = await updateCreditPricing(event, capability, patch)
  if (!updated)
    throw createError({ statusCode: 404, statusMessage: 'Capability has no price.' })

  await logAdminAudit(event, {
    adminUserId: adminId,
    action: 'credits.pricing.update',
    targetType: 'capability',
    targetId: capability,
    metadata: {
      creditsPerUnit: updated.creditsPerUnit,
      minCredits: updated.minCredits,
      reserveMultiplier: updated.reserveMultiplier,
      active: updated.active,
    },
  })

  return { rule: updated }
})
