import { deletePilotCompatEntities } from '../../../utils/pilot-compat-store'
import { quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, any>>(event)
  const ids = Array.isArray(body?.ids) ? body.ids : []
  const deleted = await deletePilotCompatEntities(event, 'tools.storage', ids)
  return quotaOk({ deleted })
})
