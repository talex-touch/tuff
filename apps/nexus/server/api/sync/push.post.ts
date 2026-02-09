import { readBody } from 'h3'
import { requireVerifiedEmail } from '../../utils/auth'
import { pushSyncItems } from '../../utils/syncStore'

export default defineEventHandler(async (event) => {
  const { userId, deviceId } = await requireVerifiedEmail(event)
  const body = await readBody(event)
  interface LegacySyncItem {
    namespace?: string
    key?: string
    value?: unknown
    updatedAt?: string
    deviceId?: string | null
  }
  const items = Array.isArray(body?.items) ? (body.items as LegacySyncItem[]) : []
  const payload = items
    .filter(item => typeof item.namespace === 'string' && typeof item.key === 'string')
    .map(item => ({
      namespace: item.namespace as string,
      key: item.key as string,
      value: item.value,
      updatedAt: item.updatedAt,
      deviceId: item.deviceId ?? deviceId ?? null
    }))
  await pushSyncItems(event, userId, payload)
  return { success: true }
})
