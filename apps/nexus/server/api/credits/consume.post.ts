import { createError, getHeader, readBody } from 'h3'
import { requireVerifiedEmail } from '../../utils/auth'
import { consumeCredits } from '../../utils/creditsStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireVerifiedEmail(event)
  const body = await readBody(event)
  const amount = Number(body?.amount ?? 0)
  const reason = typeof body?.reason === 'string' ? body.reason : 'usage'
  if (!Number.isFinite(amount) || amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid amount.' })
  }
  const result = await consumeCredits(event, userId, amount, reason, body?.metadata ?? null, {
    idempotencyKey: getHeader(event, 'x-idempotency-key') ?? undefined,
  })
  return { success: true, ledgerId: result.ledgerId, idempotencyKey: result.idempotencyKey }
})
