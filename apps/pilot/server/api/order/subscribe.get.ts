import { requirePilotAuth } from '../../utils/auth'
import { getUserSubscription } from '../../utils/pilot-payment-service'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const data = await getUserSubscription(event, auth.userId)
  return quotaOk(data)
})
