import { requirePilotAuth } from '../../utils/auth'
import {
  getLatestPendingOrder,
  getPaymentProviderUnavailablePayload,
  PAYMENT_PROVIDER_UNAVAILABLE,
} from '../../utils/pilot-payment-service'
import { quotaError, quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  try {
    const data = await getLatestPendingOrder(event, auth.userId)
    return quotaOk(data)
  }
  catch (error) {
    if (error instanceof Error && error.message === PAYMENT_PROVIDER_UNAVAILABLE) {
      return quotaError(503, PAYMENT_PROVIDER_UNAVAILABLE, getPaymentProviderUnavailablePayload())
    }
    throw error
  }
})
