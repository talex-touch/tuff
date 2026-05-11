import { createError } from 'h3'
import { requireAuth } from '../../utils/auth'
import { consumeCredits } from '../../utils/creditsStore'
import { getUsdRates } from '../../utils/exchangeRateService'
import { runExchangeLatestScene } from '../../utils/exchangeSceneBridge'

const LATEST_CREDIT_COST = 1

function toIso(value?: number | null): string | null {
  if (!value)
    return null
  return new Date(value).toISOString()
}

export default defineEventHandler(async (event) => {
  const { userId } = await requireAuth(event)

  const sceneResult = await runExchangeLatestScene(event)
  let response = sceneResult.response

  if (!response) {
    const { snapshot, source } = await getUsdRates(event)
    const providerUpdatedAt = toIso(snapshot.providerUpdatedAt)
    const fetchedAt = toIso(snapshot.fetchedAt) ?? new Date().toISOString()
    const providerNextUpdateAt = toIso(snapshot.providerNextUpdateAt)
    const asOf = providerUpdatedAt ?? fetchedAt

    response = {
      base: 'USD',
      asOf,
      providerUpdatedAt,
      fetchedAt,
      providerNextUpdateAt,
      source,
      rates: snapshot.rates,
      sceneRunId: '',
    }
  }

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
    base: response.base,
    asOf: response.asOf,
    providerUpdatedAt: response.providerUpdatedAt,
    fetchedAt: response.fetchedAt,
    providerNextUpdateAt: response.providerNextUpdateAt,
    source: response.source,
    rates: response.rates,
    sceneRunId: response.sceneRunId || undefined,
    degradedReason: response.sceneRunId ? undefined : sceneResult.degradedReason,
  }
})
