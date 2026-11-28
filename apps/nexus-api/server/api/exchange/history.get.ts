import { createError, defineEventHandler, getQuery, setHeader } from 'h3'
import { openEdgeCache } from '../../utils/edgeCache'
import { getRateHistory, getSnapshotHistory } from '../../utils/exchangeRateService'

const CURRENCY_RE = /^[A-Z]{3}$/
const EXCHANGE_HISTORY_EDGE_TTL_SECONDS = 300

function parseNumber(value: unknown): number | undefined {
  const numeric = typeof value === 'string' || typeof value === 'number' ? Number(value) : Number.NaN
  return Number.isFinite(numeric) ? numeric : undefined
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const targetRaw = typeof query.target === 'string' ? query.target.trim().toUpperCase() : ''
  const since = parseNumber(query.since)
  const until = parseNumber(query.until)
  const limit = Math.min(Math.max(parseNumber(query.limit) ?? 50, 1), 200)
  const offset = Math.max(parseNumber(query.offset) ?? 0, 0)

  if (since !== undefined && until !== undefined && since > until)
    throw createError({ statusCode: 400, statusMessage: 'Invalid time range.' })
  if (targetRaw && !CURRENCY_RE.test(targetRaw))
    throw createError({ statusCode: 400, statusMessage: 'Invalid target currency code.' })

  const edge = await openEdgeCache(event, {
    name: 'exchange/history',
    params: { target: targetRaw || 'ALL', since: since ?? null, until: until ?? null, limit, offset },
  })
  if (edge?.hit)
    return edge.hit

  const payload = targetRaw
    ? {
        base: 'USD',
        ...(await getRateHistory(event, { target: targetRaw, since, until, limit, offset })),
        limit,
        offset,
      }
    : {
        base: 'USD',
        items: await getSnapshotHistory(event, { since, until, limit, offset, includePayload: false }),
        limit,
        offset,
      }

  if (edge) {
    return edge.store({
      body: JSON.stringify(payload),
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=60, s-maxage=300',
      },
    }, EXCHANGE_HISTORY_EDGE_TTL_SECONDS)
  }

  setHeader(event, 'Cache-Control', 'public, max-age=60')
  return payload
})
