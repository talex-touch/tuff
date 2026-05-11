import { requirePilotAuth } from '../../utils/auth'
import { listCouponByUser } from '../../utils/pilot-payment-service'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const list = await listCouponByUser(event, auth.userId)
  return quotaOk(list)
})
