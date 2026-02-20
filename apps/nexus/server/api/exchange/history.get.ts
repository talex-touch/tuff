import { createError, getQuery } from 'h3'
import { requireAdmin, requireAuth } from '../../utils/auth'
import { consumeCredits } from '../../utils/creditsStore'
import { getUserSubscription } from '../../utils/subscriptionStore'
import { getRateHistory, getSnapshotHistory } from '../../utils/exchangeRateService'

const CURRENCY_RE = /^[A-Z]{3}$/
const HISTORY_CREDIT_COST = 2

function parseNumber(value: unknown) {
  const numeric = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN
  return Number.isFinite(numeric) ? numeric : undefined
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)
  const subscription = await getUserSubscription(event, userId)
  if (subscription.plan === 'FREE') {
    throw createError({ statusCode: 403, statusMessage: 'Plan required for exchange rate history.' })
  }

  const query = getQuery(event)
  const targetRaw = typeof query.target === 'string' ? query.target.trim().toUpperCase() : ''
  const since = parseNumber(query.since)
  const until = parseNumber(query.until)
  const limit = parseNumber(query.limit)
  const offset = parseNumber(query.offset)
  const includePayload = query.includePayload === 'true'

  if (since !== undefined && until !== undefined && since > until) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid time range.' })
  }

  if (targetRaw) {
    if (!CURRENCY_RE.test(targetRaw)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid target currency code.' })
    }

    const result = await getRateHistory(event, {
      target: targetRaw,
      since,
      until,
      limit,
      offset,
    })

    try {
      await consumeCredits(event, userId, HISTORY_CREDIT_COST, 'exchange-history', {
        base: 'USD',
        target: result.target,
        since,
        until,
        limit,
        offset
      })
    }
    catch (error) {
      const message = error instanceof Error ? error.message : 'Credits exceeded.'
      throw createError({ statusCode: 402, statusMessage: message })
    }

    return {
      base: 'USD',
      target: result.target,
      items: result.items,
      limit: limit ?? 50,
      offset: offset ?? 0,
    }
  }

  if (includePayload) {
    await requireAdmin(event)
  }

  const items = await getSnapshotHistory(event, {
    since,
    until,
    limit,
    offset,
    includePayload,
  })

  try {
    await consumeCredits(event, userId, HISTORY_CREDIT_COST, 'exchange-history', {
      base: 'USD',
      since,
      until,
      limit,
      offset,
      includePayload
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Credits exceeded.'
    throw createError({ statusCode: 402, statusMessage: message })
  }

  return {
    base: 'USD',
    items,
    limit: limit ?? 50,
    offset: offset ?? 0,
  }
})
