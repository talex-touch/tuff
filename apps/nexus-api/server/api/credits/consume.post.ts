import { createError, getHeader, readBody } from 'h3'
import { requireVerifiedEmail } from '../../utils/auth'
import { consumeCredits, normalizeCreditIdempotencyKey } from '../../utils/creditsStore'

const CREDITS_EXCEEDED_MESSAGES = new Set([
  'Team credits exceeded.',
  'User credits exceeded.',
  'Credits exceeded.',
])

export default defineEventHandler(async (event) => {
  const { userId } = await requireVerifiedEmail(event)
  const body = await readBody(event)
  const amount = Number(body?.amount ?? 0)
  const reason = typeof body?.reason === 'string' ? body.reason : 'usage'
  if (!Number.isFinite(amount) || amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid amount.' })
  }

  const rawIdempotencyKey = getHeader(event, 'x-idempotency-key')
  let idempotencyKey: string | undefined
  if (rawIdempotencyKey !== undefined && String(rawIdempotencyKey).trim() !== '') {
    const normalized = normalizeCreditIdempotencyKey(rawIdempotencyKey)
    if (!normalized) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid X-Idempotency-Key header.' })
    }
    idempotencyKey = normalized
  }

  try {
    const result = await consumeCredits(event, userId, amount, reason, body?.metadata ?? null, {
      idempotencyKey,
    })
    return { success: true, ledgerId: result.ledgerId, idempotencyKey: result.idempotencyKey }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to consume credits.'
    if (message === 'Credit idempotency conflict.')
      throw createError({ statusCode: 409, statusMessage: message })
    if (message === 'Invalid credit idempotency key.' || message === 'Invalid credit amount.')
      throw createError({ statusCode: 400, statusMessage: message })
    if (CREDITS_EXCEEDED_MESSAGES.has(message))
      throw createError({ statusCode: 402, statusMessage: message })
    if (message === 'Cloudflare D1 database is not available.')
      throw createError({ statusCode: 503, statusMessage: message })
    throw error
  }
})
