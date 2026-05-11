import { requirePilotAuth } from '../../../utils/auth'
import {
  calcDummyPrice,
  getPaymentProviderUnavailablePayload,
  isPilotPaymentMockEnabled,
  PAYMENT_PROVIDER_UNAVAILABLE,
} from '../../../utils/pilot-payment-service'
import { quotaError, quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  requirePilotAuth(event)
  const query = getQuery(event)
  const value = Number(query.value)

  if (!Number.isFinite(value) || value <= 0) {
    return quotaError(400, 'value must be a positive number', null)
  }
  if (!isPilotPaymentMockEnabled()) {
    return quotaError(503, PAYMENT_PROVIDER_UNAVAILABLE, getPaymentProviderUnavailablePayload())
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
