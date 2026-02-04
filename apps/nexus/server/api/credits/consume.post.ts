import { createError, readBody } from 'h3'
import { requireAuth } from '../../utils/auth'
import { consumeCredits } from '../../utils/creditsStore'

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const body = await readBody(event)
  const amount = Number(body?.amount ?? 0)
  const reason = typeof body?.reason === 'string' ? body.reason : 'usage'
  if (!Number.isFinite(amount) || amount <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid amount.' })
  }
  await consumeCredits(event, userId, amount, reason, body?.metadata ?? null)
  return { success: true }
})

