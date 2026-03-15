import { getPilotCompatEntity, upsertPilotCompatEntity } from '../../../utils/pilot-compat-store'
import { quotaError, quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const id = String(event.context.params?.id || '').trim()
  if (!id) {
    return quotaError(400, 'id is required', null)
  }
  const existing = await getPilotCompatEntity(event, 'doc.documents', id)
  if (!existing) {
    return quotaError(404, 'doc not found', false)
  }

  await upsertPilotCompatEntity(event, {
    domain: 'doc.documents',
    id,
    payload: {
      ...existing,
      published: true,
      updatedAt: new Date().toISOString(),
    },
  })
  return quotaOk(true)
})
