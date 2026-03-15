import { getPilotCompatEntity, upsertPilotCompatEntity } from '../../utils/pilot-compat-store'
import { quotaError, quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const id = String(event.context.params?.id || '').trim()
  if (!id) {
    return quotaError(400, 'id is required', null)
  }

  const body = await readBody<Record<string, any>>(event)
  const existing = await getPilotCompatEntity(event, 'wechat.livechat', id)
  if (!existing) {
    return quotaError(404, 'livechat not found', null)
  }

  const next = await upsertPilotCompatEntity(event, {
    domain: 'wechat.livechat',
    id,
    payload: {
      ...existing,
      ...body,
      exempted: true,
      updatedAt: new Date().toISOString(),
    },
  })
  return quotaOk(next)
})
