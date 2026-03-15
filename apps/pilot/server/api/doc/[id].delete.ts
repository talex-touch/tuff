import { deletePilotCompatEntity } from '../../utils/pilot-compat-store'
import { quotaError, quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const id = String(event.context.params?.id || '').trim()
  if (!id) {
    return quotaError(400, 'id is required', null)
  }
  const deleted = await deletePilotCompatEntity(event, 'doc.documents', id)
  return quotaOk({ deleted })
})
