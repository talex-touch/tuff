import { getAigcChatLogStatistics } from '../../../utils/pilot-aigc-service'
import { quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const data = await getAigcChatLogStatistics(event)
  return quotaOk(data)
})
