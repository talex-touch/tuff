import type { H3Event } from 'h3'
import { useRuntimeConfig } from '#imports'
import { getUsdRates } from './exchangeRateService'

const DEFAULT_TTL_MS = 8 * 60 * 60 * 1000

export interface FxRateProviderResult {
  base: string
  rates: Record<string, number>
  providerUpdatedAt: string | null
  fetchedAt: string
  providerNextUpdateAt: string | null
  ttlMs: number
}

function resolveTtlMs(event: H3Event): number {
  const config = useRuntimeConfig(event) as { exchangeRate?: { ttlMs?: number } }
  const ttlMs = Number(config.exchangeRate?.ttlMs ?? DEFAULT_TTL_MS)
  return Math.max(0, Number.isFinite(ttlMs) ? ttlMs : DEFAULT_TTL_MS)
}

function toIso(value?: number | null): string | null {
  if (!value)
    return null
  return new Date(value).toISOString()
}

export async function fetchFxRateSnapshot(event: H3Event): Promise<FxRateProviderResult> {
  const { snapshot } = await getUsdRates(event)

  return {
    base: snapshot.baseCurrency,
    rates: snapshot.rates,
    providerUpdatedAt: toIso(snapshot.providerUpdatedAt),
    fetchedAt: new Date(snapshot.fetchedAt).toISOString(),
    providerNextUpdateAt: toIso(snapshot.providerNextUpdateAt),
    ttlMs: resolveTtlMs(event),
  }
}
