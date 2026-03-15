import { getOrderStatistics } from '../../../utils/pilot-compat-payment'
import { quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const stats = await getOrderStatistics(event)
  return quotaOk(stats)
})
