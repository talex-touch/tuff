import { assignCouponToUser } from '../../utils/pilot-compat-payment'
import { quotaError, quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, any>>(event)
  const couponId = String(body?.couponId || '').trim()
  const uid = String(body?.uid || '').trim()
  if (!couponId || !uid) {
    return quotaError(400, 'couponId and uid are required', null)
  }
  const assigned = await assignCouponToUser(event, couponId, uid)
  if (!assigned) {
    return quotaError(404, 'coupon not found', null)
  }
  return quotaOk(assigned)
})
