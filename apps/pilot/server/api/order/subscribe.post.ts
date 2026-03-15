import { requirePilotAuth } from '../../utils/auth'
import { createSubscriptionOrder } from '../../utils/pilot-compat-payment'
import { quotaError, quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const body = await readBody<Record<string, any>>(event)
  const type = String(body?.type || '').trim()
  const time = String(body?.time || '').trim()
  if (!type || !time) {
    return quotaError(400, 'type and time are required', null)
  }

  const data = await createSubscriptionOrder(event, {
    userId: auth.userId,
    type,
    time,
    couponCode: String(body?.couponCode || ''),
    paymentMethod: Number(body?.payMethod || 2),
  })

  return quotaOk(data)
})
