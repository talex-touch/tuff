import { readBody, createError } from 'h3'
import { requireAuth } from '../../utils/auth'
import { revokeDevice } from '../../utils/authStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const body = await readBody(event)
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : ''
  if (!deviceId) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload.' })
  }
  await revokeDevice(event, userId, deviceId)
  return { success: true }
})

