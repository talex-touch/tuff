import { calcSubscriptionPrice } from '../../utils/pilot-compat-payment'
import { quotaError, quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const type = String(query.type || '').trim()
  const time = String(query.time || '').trim()
  if (!type || !time) {
    return quotaError(400, 'type and time are required', null)
  }

  const priced = await calcSubscriptionPrice(event, {
    type,
    time,
    couponCode: String(query.couponCode || ''),
  })

  return quotaOk(priced)
})
