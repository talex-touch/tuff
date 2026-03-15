import { upsertPilotCompatEntity } from '../../utils/pilot-compat-store'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, any>>(event)
  const now = new Date().toISOString()
  const data = await upsertPilotCompatEntity(event, {
    domain: 'feedback.records',
    id: String(body?.id || ''),
    payload: {
      ...body,
      status: Number(body?.status || 0),
      createdAt: body?.createdAt || now,
      updatedAt: now,
    },
  })
  return quotaOk(data)
})
