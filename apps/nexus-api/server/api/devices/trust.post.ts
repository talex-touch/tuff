import { readBody, createError } from 'h3'
import { requireAuth } from '../../utils/auth'
import { recordDeviceAuthAudit, setDeviceTrusted } from '../../utils/authStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const body = await readBody(event)
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : ''
  const trusted = body?.trusted === true
  if (!deviceId) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload.' })
  }

  const device = await setDeviceTrusted(event, userId, deviceId, trusted)
  if (!device) {
    throw createError({ statusCode: 404, statusMessage: 'Device not found.' })
  }

  await recordDeviceAuthAudit(event, {
    action: trusted ? 'trust' : 'untrust',
    status: 'success',
    userId,
    deviceId,
    actorUserId: userId,
    reason: trusted ? 'user_trusted' : 'user_untrusted',
  })

  return device
})
