import { getQuery } from 'h3'
import { requireAuth } from '../../utils/auth'
import { listDeviceAuthAudits } from '../../utils/authStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const query = getQuery(event)
  const deviceId = typeof query.deviceId === 'string' ? query.deviceId.trim() : ''
  const limit = Math.min(200, Math.max(1, Number(query.limit) || 50))
  const audits = await listDeviceAuthAudits(event, {
    userId,
    deviceId: deviceId || undefined,
    limit,
  })

  return {
    audits: audits.map(record => ({
      id: record.id,
      action: record.action,
      status: record.status,
      deviceId: record.deviceId,
      clientType: record.clientType,
      actorUserId: record.actorUserId,
      reason: record.reason,
      ipMasked: record.ipMasked,
      metadata: record.metadata,
      createdAt: record.createdAt,
    })),
  }
})
