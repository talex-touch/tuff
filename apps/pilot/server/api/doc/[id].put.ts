import { getPilotEntity, upsertPilotEntity } from '../../utils/pilot-entity-store'
import { quotaError, quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const id = String(event.context.params?.id || '').trim()
  if (!id) {
    return quotaError(400, 'id is required', null)
  }
  const body = await readBody<Record<string, any>>(event)
  const existing = await getPilotEntity(event, 'doc.documents', id)
  if (!existing) {
    return quotaError(404, 'doc not found', null)
  }

  const data = await upsertPilotEntity(event, {
    domain: 'doc.documents',
    id,
    payload: {
      ...existing,
      ...body,
      updatedAt: new Date().toISOString(),
    },
  })
  return quotaOk(data)
})
