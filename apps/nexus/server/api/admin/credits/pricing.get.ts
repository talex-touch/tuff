import { requireAdmin } from '../../../utils/auth'
import { listCreditPricing } from '../../../utils/creditPricingStore'

/** Admin price list, including the upstream cost and reserve evidence users never see. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const rules = await listCreditPricing(event)

  return { unit: 'credits', rules }
})
