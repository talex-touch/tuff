import { requirePilotAuth } from '../../utils/auth'
import { getOrderListByUser } from '../../utils/pilot-payment-service'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const data = await getOrderListByUser(event, auth.userId)
  return quotaOk(data)
})
