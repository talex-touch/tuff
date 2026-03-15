import { createCouponBatches } from '../../utils/pilot-compat-payment'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event)
  const data = await createCouponBatches(event, body || {})
  return quotaOk(data)
})
