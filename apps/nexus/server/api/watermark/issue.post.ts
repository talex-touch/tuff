import { createError, getHeader, readBody } from 'h3'
import { createWatermarkToken, hashWatermarkSeed } from '../../utils/watermarkToken'
import { registerWatermarkToken, WATERMARK_RECORD_TTL_MS } from '../../utils/watermarkStore'

interface IssueBody {
  device_id?: string
  session_id?: string
  shot_id?: string
  user_id?: string | null
  anonymous?: boolean
  reason?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<IssueBody>(event)

  const deviceId = body?.device_id || getHeader(event, 'x-device-id')
  if (!deviceId) {
    throw createError({
      statusCode: 428,
      statusMessage: 'Watermark device id missing',
      data: { errorCode: 'WM_MISSING' },
    })
  }

  const now = Date.now()
  const sessionId = body?.session_id || crypto.randomUUID()
  const shotId = body?.shot_id || crypto.randomUUID()
  const token = createWatermarkToken({
    uid: body?.user_id ?? null,
    did: deviceId,
    sid: sessionId,
    shot: shotId,
  }, now)
  const seed = hashWatermarkSeed(token)
  await registerWatermarkToken(event, {
    id: crypto.randomUUID(),
    seed,
    userId: body?.user_id ?? null,
    deviceId,
    sessionId,
    shotId,
    issuedAt: now,
    expiresAt: now + WATERMARK_RECORD_TTL_MS,
  })
  return {
    wm_token: token,
    expires_at: now + 5 * 60 * 1000,
  }
})
