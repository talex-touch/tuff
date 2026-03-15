import { getAigcChatLogStatistics } from '../../../utils/pilot-compat-aigc'
import { quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const data = await getAigcChatLogStatistics(event)
  return quotaOk(data)
})
