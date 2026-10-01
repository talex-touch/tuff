import { createError, getQuery } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { getRateHistory, getSnapshotHistory } from '../../../utils/exchangeRateService'

const CURRENCY_RE = /^[A-Z]{3}$/

function parseNumber(value: unknown) {
  const numeric = typeof value === 'string' || typeof value === 'number' ? Number(value) : NaN
  return Number.isFinite(numeric) ? numeric : undefined
}

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

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

    return {
      base: 'USD',
      target: result.target,
      items: result.items,
      limit: limit ?? 50,
      offset: offset ?? 0,
    }
  }

  const items = await getSnapshotHistory(event, {
    since,
    until,
    limit,
    offset,
    includePayload,
  })

  return {
    base: 'USD',
    items,
    limit: limit ?? 50,
    offset: offset ?? 0,
  }
})
