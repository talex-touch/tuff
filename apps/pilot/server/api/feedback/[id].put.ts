import { getPilotCompatEntity, upsertPilotCompatEntity } from '../../utils/pilot-compat-store'
import { quotaError, quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const id = String(event.context.params?.id || '').trim()
  if (!id) {
    return quotaError(400, 'id is required', null)
  }
  const body = await readBody<Record<string, any>>(event)
  const existing = await getPilotCompatEntity(event, 'feedback.records', id)
  if (!existing) {
    return quotaError(404, 'feedback not found', null)
  }
  const data = await upsertPilotCompatEntity(event, {
    domain: 'feedback.records',
    id,
    payload: {
      ...existing,
      ...body,
      updatedAt: new Date().toISOString(),
    },
  })
  return quotaOk(data)
})
