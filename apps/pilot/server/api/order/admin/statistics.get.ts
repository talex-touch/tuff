import { getOrderStatistics } from '../../../utils/pilot-payment-service'
import { quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const stats = await getOrderStatistics(event)
  return quotaOk(stats)
})
