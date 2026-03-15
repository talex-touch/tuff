import { requirePilotAuth } from '../../utils/auth'
import { bindCouponToUser } from '../../utils/pilot-compat-payment'
import { quotaError, quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const body = await readBody<Record<string, any>>(event)
  const couponId = String(body?.couponId || '').trim()
  if (!couponId) {
    return quotaError(400, 'couponId is required', null)
  }

  const coupon = await bindCouponToUser(event, auth.userId, couponId)
  return quotaOk(coupon)
})
