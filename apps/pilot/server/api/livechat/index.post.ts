import { upsertPilotEntity } from '../../utils/pilot-entity-store'
import { quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const body = await readBody<Record<string, any>>(event)
  const now = new Date().toISOString()
  const created = await upsertPilotEntity(event, {
    domain: 'wechat.livechat',
    id: String(body?.id || ''),
    payload: {
      ...body,
      exempted: true,
      createdAt: body?.createdAt || now,
      updatedAt: now,
    },
  })
  return quotaOk(created)
})
