import { getOrderById } from '../../../utils/pilot-compat-payment'
import { quotaError, quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const id = String(getQuery(event).id || '').trim()
  if (!id) {
    return quotaError(400, 'id is required', null)
  }

  const order = await getOrderById(event, id)
  if (!order) {
    return quotaError(404, 'order not found', null)
  }

  return quotaOk(order)
})
