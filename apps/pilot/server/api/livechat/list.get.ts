import { listPilotCompatEntities } from '../../utils/pilot-compat-store'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = await listPilotCompatEntities(event, 'wechat.livechat', {
    query,
    defaultPageSize: 50,
  })
  return quotaOk(page)
})
