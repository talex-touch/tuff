import { requireVerifiedEmail } from '../../utils/auth'
import { listCreditPricing } from '../../utils/creditPricingStore'

/**
 * The published price list for paid capabilities.
 *
 * A user is charged in credits only, so this is the answer to "what will this cost
 * me" without exposing which provider or channel serves the capability behind it.
 * `upstreamCostUsdPerUnit` and `reserveMultiplier` are deliberately absent: upstream
 * cost is margin evidence, and the reserve multiplier is an internal hold, not a price.
 */
export default defineEventHandler(async (event) => {
  await requireVerifiedEmail(event)

  const rules = await listCreditPricing(event)

  return {
    unit: 'credits',
    rules: rules
      .filter(rule => rule.active)
      .map(rule => ({
        capability: rule.capability,
        unit: rule.unit,
        creditsPerUnit: rule.creditsPerUnit,
        secondaryUnit: rule.secondaryUnit,
        secondaryCreditsPerUnit: rule.secondaryCreditsPerUnit,
        minCredits: rule.minCredits,
      })),
  }
})
