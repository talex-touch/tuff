import { readBody } from 'h3'
import { requireVerifiedEmail } from '../../utils/auth'
import { pushSyncItems } from '../../utils/syncStore'

export default defineEventHandler(async (event) => {
  const { userId, deviceId } = await requireVerifiedEmail(event)
  const body = await readBody(event)
  const items = Array.isArray(body?.items) ? body.items : []
  const payload = items.map(item => ({
    namespace: item.namespace,
    key: item.key,
    value: item.value,
    updatedAt: item.updatedAt,
    deviceId: item.deviceId ?? deviceId ?? null
  }))
  await pushSyncItems(event, userId, payload)
  return { success: true }
})
