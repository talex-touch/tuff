import { defineEventHandler } from 'h3'
import { requireAdmin } from '../../../utils/auth'
import { refreshUsdRates } from '../../../utils/exchangeRateService'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { snapshot, source } = await refreshUsdRates(event, { force: true })

  return {
    ok: true,
    source,
    snapshot: {
      id: snapshot.id,
      base: snapshot.baseCurrency,
      fetchedAt: new Date(snapshot.fetchedAt).toISOString(),
      providerUpdatedAt: snapshot.providerUpdatedAt ? new Date(snapshot.providerUpdatedAt).toISOString() : null,
      providerNextUpdateAt: snapshot.providerNextUpdateAt ? new Date(snapshot.providerNextUpdateAt).toISOString() : null,
      currencyCount: Object.keys(snapshot.rates).length,
    },
  }
})
