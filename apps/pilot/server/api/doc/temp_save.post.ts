import { getPilotCompatEntity, upsertPilotCompatEntity } from '../../utils/pilot-compat-store'
import { quotaError, quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const id = String(getQuery(event).id || '').trim()
  if (!id) {
    return quotaError(400, 'id is required', null)
  }
  const body = await readBody<Record<string, any>>(event)
  const existing = await getPilotCompatEntity(event, 'doc.documents', id)
  const now = new Date().toISOString()
  const data = await upsertPilotCompatEntity(event, {
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
