import { getAigcConsumptionStatistics } from '../../utils/pilot-compat-aigc'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const data = await getAigcConsumptionStatistics(event)
  return quotaOk(data)
})
