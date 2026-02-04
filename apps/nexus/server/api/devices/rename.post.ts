import { readBody, createError } from 'h3'
import { requireAuth } from '../../utils/auth'
import { upsertDevice } from '../../utils/authStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const body = await readBody(event)
  const deviceId = typeof body?.deviceId === 'string' ? body.deviceId.trim() : ''
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!deviceId || !name) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid payload.' })
  }
  const device = await upsertDevice(event, userId, deviceId, { deviceName: name })
  return device
})

