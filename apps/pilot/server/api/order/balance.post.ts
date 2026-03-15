import { requirePilotAuth } from '../../utils/auth'
import { createDummyOrder } from '../../utils/pilot-compat-payment'
import { quotaError, quotaOk } from '../../utils/quota-api'

interface DummyOrderBody {
  value?: number
  couponCode?: string
  payMethod?: number
}

export default defineEventHandler(async (event) => {
  const auth = requirePilotAuth(event)
  const body = await readBody<DummyOrderBody>(event)
  const value = Number(body?.value)
  if (!Number.isFinite(value) || value <= 0) {
    return quotaError(400, 'value must be a positive number', null)
  }

  const data = await createDummyOrder(event, {
    userId: auth.userId,
    value,
    couponCode: String(body?.couponCode || ''),
    paymentMethod: Number(body?.payMethod || 2),
  })

  return quotaOk(data)
})
