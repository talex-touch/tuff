import { createError, getHeader, readBody } from 'h3'
import { requireAuth } from '../../utils/auth'
import { getOrCreateTrackingCode } from '../../utils/watermarkTrackingStore'

interface TrackingBody {
  device_id?: string
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const body = await readBody<TrackingBody>(event)
  const deviceId = body?.device_id || getHeader(event, 'x-device-id')

  if (!deviceId) {
    throw createError({
      statusCode: 428,
      statusMessage: 'Watermark device id missing',
      data: { errorCode: 'WM_MISSING' },
    })
  }

  const record = await getOrCreateTrackingCode(event, userId ?? null, deviceId)
  return {
    code: record.code,
    userId: record.userId,
    deviceId: record.deviceId,
  }
})
