import { requirePilotAuth } from '../../utils/auth'
import { getLatestPendingOrder } from '../../utils/pilot-compat-payment'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const data = await getLatestPendingOrder(event, auth.userId)
  return quotaOk(data)
})
