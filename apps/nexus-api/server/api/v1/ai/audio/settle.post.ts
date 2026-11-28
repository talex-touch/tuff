import { createError, defineEventHandler, readBody } from 'h3'
import { requireAppAuth } from '../../../../utils/auth'

export default defineEventHandler(async (event) => {
  await requireAppAuth(event)
  const body = await readBody(event)

  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'INVALID_REQUEST_BODY' })
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
  const durationMs = Number(body.durationMs)

  if (!sessionId || !Number.isFinite(durationMs) || durationMs < 0) {
    throw createError({ statusCode: 400, statusMessage: 'INVALID_USAGE_PARAMETERS' })
  }

  return {
    settled: true,
    creditsCharged: 0,
  }
})
