import { deletePilotEntities } from '../../../utils/pilot-entity-store'
import { quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, any>>(event)
  const ids = Array.isArray(body?.ids) ? body.ids : []
  const deleted = await deletePilotEntities(event, 'tools.storage', ids)
  return quotaOk({ deleted })
})
