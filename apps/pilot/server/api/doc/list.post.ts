import { listPilotEntities } from '../../utils/pilot-entity-store'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, any>>(event)
  const page = await listPilotEntities(event, 'doc.documents', {
    query: body || {},
    defaultPageSize: 20,
  })
  return quotaOk(page)
})
