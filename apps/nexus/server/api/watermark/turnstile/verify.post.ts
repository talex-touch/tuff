import { createError, readBody } from 'h3'
import { verifyTurnstileToken } from '../../../utils/turnstile'

interface VerifyBody {
  token?: string
  risk_code?: string
  detail?: string
}

export default defineEventHandler(async (event) => {
  const body = await readBody<VerifyBody>(event)
  if (!body?.token) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Turnstile token missing',
    })
  }

  await verifyTurnstileToken(event, { token: body.token, action: 'watermark' })

  return {
    ok: true,
    verified_at: Date.now(),
  }
})
