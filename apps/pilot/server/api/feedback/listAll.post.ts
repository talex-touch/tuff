import { listPilotCompatEntities } from '../../utils/pilot-compat-store'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, any>>(event)
  const page = await listPilotCompatEntities(event, 'feedback.records', {
    query: body || {},
    defaultPageSize: 20,
  })
  return quotaOk(page)
})
