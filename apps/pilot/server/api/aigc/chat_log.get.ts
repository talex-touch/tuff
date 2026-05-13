import { listAigcChatLogs } from '../../utils/pilot-aigc-service'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const data = await listAigcChatLogs(event, getQuery(event))
  return quotaOk(data)
})
