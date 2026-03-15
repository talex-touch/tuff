import { listOrderPage } from '../../../utils/pilot-compat-payment'
import { quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, unknown>>(event)
  const page = await listOrderPage(event, body || {})
  return quotaOk(page)
})
