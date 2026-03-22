import { listPilotEntities } from '../../utils/pilot-entity-store'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const page = await listPilotEntities(event, 'wechat.livechat', {
    query,
    defaultPageSize: 50,
  })
  return quotaOk(page)
})
