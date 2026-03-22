import { upsertPilotEntity } from '../../../utils/pilot-entity-store'
import { quotaOk } from '../../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, any>>(event)
  const now = new Date().toISOString()
  const data = await upsertPilotEntity(event, {
    domain: 'marketing.banner',
    id: String(body?.id || ''),
    payload: {
      ...body,
      status: Number(body?.status ?? 1),
      createdAt: body?.createdAt || now,
      updatedAt: now,
    },
  })
  return quotaOk(data)
})
