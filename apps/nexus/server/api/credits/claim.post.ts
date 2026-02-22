import { createError } from 'h3'
import { requireVerifiedEmail } from '../../utils/auth'
import { claimCreditBoost, getCreditSummary } from '../../utils/creditsStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireVerifiedEmail(event)
  const result = await claimCreditBoost(event, userId)

  if (!result.eligible) {
    throw createError({ statusCode: 403, statusMessage: 'Credit boost not eligible.' })
  }

  const summary = await getCreditSummary(event, userId)
  return {
    claimed: result.claimed,
    reason: result.reason,
    delta: result.delta ?? 0,
    boost: result.boost ?? summary.boost,
    summary,
  }
})
