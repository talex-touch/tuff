import { defineEventHandler, setHeader } from 'h3'
import { openEdgeCache } from '../../utils/edgeCache'
import { getUsdRates } from '../../utils/exchangeRateService'

const EXCHANGE_EDGE_TTL_SECONDS = 300

function toIso(value?: number | null): string | null {
  if (!value)
    return null
  return new Date(value).toISOString()
}

export default defineEventHandler(async (event) => {
  const edge = await openEdgeCache(event, { name: 'exchange/latest', params: { base: 'USD' } }, { conditional: true })
  if (edge?.hit)
    return edge.hit

  const { snapshot, source } = await getUsdRates(event)
  const providerUpdatedAt = toIso(snapshot.providerUpdatedAt)
  const fetchedAt = toIso(snapshot.fetchedAt) ?? new Date().toISOString()
  const providerNextUpdateAt = toIso(snapshot.providerNextUpdateAt)
  const payload = {
    base: snapshot.baseCurrency || 'USD',
    asOf: providerUpdatedAt ?? fetchedAt,
    providerUpdatedAt,
    fetchedAt,
    providerNextUpdateAt,
    source,
    rates: snapshot.rates,
  }
  const etag = `"fx-${snapshot.id}"`

  if (edge) {
    return edge.store({
      body: JSON.stringify(payload),
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'public, max-age=60, s-maxage=300',
        etag,
      },
    }, EXCHANGE_EDGE_TTL_SECONDS)
  }

  setHeader(event, 'Cache-Control', 'public, max-age=60')
  setHeader(event, 'ETag', etag)
  return payload
})
