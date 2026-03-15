import { listAigcChatLogs } from '../../utils/pilot-compat-aigc'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const data = await listAigcChatLogs(event, getQuery(event))
  return quotaOk(data)
})
