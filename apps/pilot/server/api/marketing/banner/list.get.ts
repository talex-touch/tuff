import { listPilotCompatEntities } from '../../../utils/pilot-compat-store'
import { quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const page = await listPilotCompatEntities(event, 'marketing.banner', {
    query: getQuery(event),
    defaultPageSize: 20,
  })
  return quotaOk(page)
})
