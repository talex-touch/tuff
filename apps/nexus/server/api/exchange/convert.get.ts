import { createError, getQuery } from 'h3'
import { requireAuth } from '../../utils/auth'
import { consumeCredits } from '../../utils/creditsStore'
import { convertUsd } from '../../utils/exchangeRateService'

const CURRENCY_RE = /^[A-Z]{3}$/
const CONVERT_CREDIT_COST = 0.1

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const query = getQuery(event)
  const baseRaw = typeof query.base === 'string' ? query.base.trim() : ''
  const targetRaw = typeof query.target === 'string' ? query.target.trim().toUpperCase() : ''
  const amountRaw = typeof query.amount === 'string' || typeof query.amount === 'number'
    ? Number(query.amount)
    : NaN

  if (baseRaw && baseRaw.toUpperCase() !== 'USD') {
    throw createError({ statusCode: 400, statusMessage: 'Only USD base is supported.' })
  }

  if (!CURRENCY_RE.test(targetRaw)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid target currency code.' })
  }

  if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid amount.' })
  }

  const result = await convertUsd(event, { target: targetRaw, amount: amountRaw })

  try {
    await consumeCredits(event, userId, CONVERT_CREDIT_COST, 'exchange-convert', {
      base: 'USD',
      target: targetRaw,
      amount: amountRaw
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Credits exceeded.'
    throw createError({ statusCode: 402, statusMessage: message })
  }

  return {
    base: 'USD',
    target: targetRaw,
    amount: amountRaw,
    rate: result.rate,
    converted: result.converted,
    source: result.source,
    updatedAt: result.updatedAt,
    providerUpdatedAt: result.providerUpdatedAt,
    fetchedAt: result.fetchedAt,
    providerNextUpdateAt: result.providerNextUpdateAt,
  }
})
