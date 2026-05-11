import { listOrderPage } from '../../../utils/pilot-payment-service'
import { quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event)
  const page = await listOrderPage(event, body || {})
  return quotaOk(page)
})
