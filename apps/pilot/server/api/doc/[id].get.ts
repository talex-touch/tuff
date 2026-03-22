import { getPilotEntity } from '../../utils/pilot-entity-store'
import { quotaError, quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const id = String(event.context.params?.id || '').trim()
  if (!id) {
    return quotaError(400, 'id is required', null)
  }
  const doc = await getPilotEntity(event, 'doc.documents', id)
  if (!doc) {
    return quotaError(404, 'doc not found', null)
  }
  return quotaOk([doc, { content: String(doc.content || '') }])
})
