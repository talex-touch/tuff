import { getPilotEntity, upsertPilotEntity } from '../../utils/pilot-entity-store'
import { quotaError, quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const id = String(getQuery(event).id || '').trim()
  if (!id) {
    return quotaError(400, 'id is required', null)
  }
  const body = await readBody<Record<string, any>>(event)
  const existing = await getPilotEntity(event, 'doc.documents', id)
  const now = new Date().toISOString()
  const data = await upsertPilotEntity(event, {
    domain: 'doc.documents',
    id,
    payload: {
      ...(existing || {}),
      ...body,
      id,
      published: false,
      updatedAt: now,
      createdAt: existing?.createdAt || now,
    },
  })
  return quotaOk(data)
})
