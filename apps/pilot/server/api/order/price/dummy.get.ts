import { requirePilotAuth } from '../../../utils/auth'
import { calcDummyPrice } from '../../../utils/pilot-compat-payment'
import { quotaError, quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  requirePilotAuth(event)
  const query = getQuery(event)
  const value = Number(query.value)

  if (!Number.isFinite(value) || value <= 0) {
    return quotaError(400, 'value must be a positive number', null)
  }

  const priced = await calcDummyPrice(event, {
    value,
    couponCode: String(query.couponCode || ''),
  })

  return quotaOk({
    ...priced,
    type: 'DUMMY',
    value,
  })
})
