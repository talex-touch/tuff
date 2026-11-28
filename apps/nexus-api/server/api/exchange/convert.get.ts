import { createError, defineEventHandler, getQuery, setHeader } from 'h3'
import { openEdgeCache } from '../../utils/edgeCache'
import { convertUsd } from '../../utils/exchangeRateService'

const CURRENCY_RE = /^[A-Z]{3}$/
const EXCHANGE_CONVERT_EDGE_TTL_SECONDS = 300

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const rawBase = query.base ?? query.from
  const rawTarget = query.target ?? query.to
  const baseRaw = typeof rawBase === 'string' ? rawBase.trim().toUpperCase() : ''
  const targetRaw = typeof rawTarget === 'string' ? rawTarget.trim().toUpperCase() : ''
  const amountRaw = typeof query.amount === 'string' || typeof query.amount === 'number'
    ? Number(query.amount)
    : Number.NaN

  if (baseRaw && baseRaw !== 'USD')
    throw createError({ statusCode: 400, statusMessage: 'Only USD base is supported.' })
  if (!CURRENCY_RE.test(targetRaw))
    throw createError({ statusCode: 400, statusMessage: 'Invalid target currency code.' })
  if (!Number.isFinite(amountRaw) || amountRaw <= 0)
    throw createError({ statusCode: 400, statusMessage: 'Invalid amount.' })

  const edge = await openEdgeCache(event, {
    name: 'exchange/convert',
    params: { base: 'USD', target: targetRaw, amount: amountRaw },
  })
  if (edge?.hit)
    return edge.hit

  const result = await convertUsd(event, { target: targetRaw, amount: amountRaw })
  const payload = {
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

  if (edge) {
    return edge.store({
      body: JSON.stringify(payload),
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=60, s-maxage=300',
      },
    }, EXCHANGE_CONVERT_EDGE_TTL_SECONDS)
  }

  setHeader(event, 'Cache-Control', 'public, max-age=60')
  return payload
})
