import { listPilotEntities } from '../../../utils/pilot-entity-store'
import { quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const page = await listPilotEntities(event, 'tools.storage', {
    query: getQuery(event),
    defaultPageSize: 20,
  })
  return quotaOk(page)
})
