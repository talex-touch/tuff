import type { H3Event } from 'h3'
import { createError, getHeader, readBody } from 'h3'
import { requireSessionAuth } from '../../utils/auth'
import { consumeLoginToken, recordDeviceAuthAudit, setDeviceTrusted } from '../../utils/authStore'

async function requirePasskeyStepUp(event: H3Event, userId: string) {
  const token = getHeader(event, 'x-login-token')
  if (!token) {
    throw createError({ statusCode: 403, statusMessage: 'Passkey step-up required.' })
  }

  const stepUpUser = await consumeLoginToken(event, token, 'passkey')
  if (!stepUpUser || stepUpUser.id !== userId) {
    throw createError({ statusCode: 403, statusMessage: 'Passkey step-up required.' })
  }
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireSessionAuth(event)
  const body = await readBody(event)
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : ''
  const trusted = body?.trusted === true
  if (!deviceId) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload.' })
  }

  await requirePasskeyStepUp(event, userId)

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
