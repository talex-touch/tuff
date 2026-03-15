import { getPilotCompatEntity, upsertPilotCompatEntity } from '../../../utils/pilot-compat-store'
import { quotaError, quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const id = String(event.context.params?.id || '').trim()
  const key = String(getQuery(event).key || '').trim()
  if (!id || !key) {
    return quotaError(400, 'id and key are required', null)
  }

  const doc = await getPilotCompatEntity(event, 'doc.documents', id)
  if (!doc) {
    return quotaError(404, 'doc not found', null)
  }

  const linked = await upsertPilotCompatEntity(event, {
    domain: 'doc.agreements',
    id: key,
    payload: {
      id: key,
      key,
      docId: id,
      title: doc.title || key,
      content: doc.content || '',
      updatedAt: new Date().toISOString(),
    },
  })
  return quotaOk(linked)
})
