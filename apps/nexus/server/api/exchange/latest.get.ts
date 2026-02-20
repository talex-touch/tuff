import { createError } from 'h3'
import { requireAuth } from '../../utils/auth'
import { consumeCredits } from '../../utils/creditsStore'
import { getUsdRates } from '../../utils/exchangeRateService'

const LATEST_CREDIT_COST = 1

function toIso(value?: number | null): string | null {
  if (!value)
    return null
  return new Date(value).toISOString()
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)

  const { snapshot, source } = await getUsdRates(event)
  const providerUpdatedAt = toIso(snapshot.providerUpdatedAt)
  const fetchedAt = toIso(snapshot.fetchedAt) ?? new Date().toISOString()
  const providerNextUpdateAt = toIso(snapshot.providerNextUpdateAt)
  const asOf = providerUpdatedAt ?? fetchedAt

  try {
    await consumeCredits(event, userId, LATEST_CREDIT_COST, 'exchange-latest', {
      base: 'USD'
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Credits exceeded.'
    throw createError({ statusCode: 402, statusMessage: message })
  }

  return {
    base: 'USD',
    asOf,
    providerUpdatedAt,
    fetchedAt,
    providerNextUpdateAt,
    source,
    rates: snapshot.rates
  }
})
