import { invalidateCoupon } from '../../utils/pilot-compat-payment'
import { quotaError, quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, any>>(event)
  const couponId = String(body?.couponId || '').trim()
  if (!couponId) {
    return quotaError(400, 'couponId is required', null)
  }
  const ok = await invalidateCoupon(event, couponId)
  if (!ok) {
    return quotaError(404, 'coupon not found', null)
  }
  return quotaOk(true)
})
