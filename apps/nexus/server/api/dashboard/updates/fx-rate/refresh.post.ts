import { requireAdmin } from '../../../../utils/auth'
import { createUpdate } from '../../../../utils/dashboardStore'
import { fetchFxRateSnapshot } from '../../../../utils/fxRateProviderClient'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const snapshot = await fetchFxRateSnapshot(event)
  const asOf = snapshot.providerUpdatedAt ?? snapshot.fetchedAt

  const payload = {
    kind: 'fx-rate',
    base: snapshot.base,
    asOf,
    providerUpdatedAt: snapshot.providerUpdatedAt,
    fetchedAt: snapshot.fetchedAt,
    providerNextUpdateAt: snapshot.providerNextUpdateAt,
    ttlMs: snapshot.ttlMs,
    source: 'nexus',
    rates: snapshot.rates,
  }

  const update = await createUpdate(event, {
    type: 'data',
    scope: 'system',
    channels: [],
    releaseTag: null,
    title: {
      zh: '汇率热数据',
      en: 'Exchange rate data',
    },
    timestamp: asOf,
    summary: {
      zh: 'USD 汇率更新数据',
      en: 'USD exchange rate updates',
    },
    tags: ['fx-rate'],
    link: '/updates?scope=system&type=data',
    payload,
    payloadVersion: String(Date.parse(snapshot.fetchedAt) || Date.now()),
  })

  return { update }
})
