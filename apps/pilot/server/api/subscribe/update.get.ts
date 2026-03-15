import { upsertPilotCompatEntity } from '../../utils/pilot-compat-store'
import { quotaError, quotaOk } from '../../utils/quota-api'

export default defineEventHandler(async (event) => {
  const uid = String(getQuery(event).uid || '').trim()
  if (!uid) {
    return quotaError(400, 'uid is required', null)
  }
  const now = new Date().toISOString()
  const data = await upsertPilotCompatEntity(event, {
    domain: 'order.subscriptions',
    id: uid,
    payload: {
      id: uid,
      uid,
      type: 'STANDARD',
      time: 'MONTH',
      status: 1,
      updatedAt: now,
      createdAt: now,
      expiredAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    },
  })
  return quotaOk(data)
})
