import type { H3Event } from 'h3'
import { createError } from 'h3'
import { randomUUID } from 'node:crypto'
import { useRuntimeConfig } from '#imports'
import type { ExchangeRateSnapshot } from './exchangeRateStore'
import { cleanupHistory, getLatestSnapshot, listRateHistory, listSnapshotHistory, saveSnapshotWithRates } from './exchangeRateStore'
import { recordTelemetryMessages } from './messageStore'

const USD_BASE = 'USD'

interface ExchangeRateApiSuccess {
  result: 'success'
  documentation?: string
  terms_of_use?: string
  time_last_update_unix?: number
  time_last_update_utc?: string
  time_next_update_unix?: number
  time_next_update_utc?: string
  base_code?: string
  conversion_rates?: Record<string, number>
}

interface ExchangeRateApiError {
  result: 'error'
  'error-type'?: string
}

interface ExchangeRateConfig {
  apiKey: string
  baseUrl: string
  ttlMs: number
  timeoutMs: number
  historyRetentionDays: number
  storeRateRows: boolean
}

export interface ExchangeRateConvertResult {
  rate: number
  converted: number
  source: 'cache' | 'live'
  updatedAt: string
  providerUpdatedAt: string | null
  fetchedAt: string
  providerNextUpdateAt: string | null
}

function resolveExchangeRateConfig(event: H3Event): ExchangeRateConfig {
  const config = useRuntimeConfig(event) as { exchangeRate?: Partial<ExchangeRateConfig> }
  const exchangeRate = config.exchangeRate ?? {}

  return {
    apiKey: typeof exchangeRate.apiKey === 'string' ? exchangeRate.apiKey.trim() : '',
    baseUrl: typeof exchangeRate.baseUrl === 'string' && exchangeRate.baseUrl.trim().length > 0
      ? exchangeRate.baseUrl.trim()
      : 'https://v6.exchangerate-api.com/v6',
    ttlMs: Math.max(0, Number(exchangeRate.ttlMs) || 8 * 60 * 60 * 1000),
    timeoutMs: Math.max(1000, Number(exchangeRate.timeoutMs) || 10000),
    historyRetentionDays: Math.max(0, Number(exchangeRate.historyRetentionDays) || 0),
    storeRateRows: exchangeRate.storeRateRows !== false,
  }
}

function trimBaseUrl(value: string): string {
  return value.replace(/\/+$/, '')
}

function buildLatestEndpoint(baseUrl: string, apiKey: string): string {
  const trimmed = trimBaseUrl(baseUrl)
  return `${trimmed}/${apiKey}/latest/${USD_BASE}`
}

function isSnapshotFresh(snapshot: ExchangeRateSnapshot, ttlMs: number, now = Date.now()): boolean {
  return now - snapshot.fetchedAt <= ttlMs
}

function resolveUpdatedAt(snapshot: ExchangeRateSnapshot): string {
  const timestamp = snapshot.providerUpdatedAt ?? snapshot.fetchedAt
  return new Date(timestamp).toISOString()
}

function resolveProviderUpdatedAt(snapshot: ExchangeRateSnapshot): string | null {
  if (!snapshot.providerUpdatedAt)
    return null
  return new Date(snapshot.providerUpdatedAt).toISOString()
}

function resolveProviderNextUpdateAt(snapshot: ExchangeRateSnapshot): string | null {
  if (!snapshot.providerNextUpdateAt)
    return null
  return new Date(snapshot.providerNextUpdateAt).toISOString()
}

function resolveFetchedAt(snapshot: ExchangeRateSnapshot): string {
  return new Date(snapshot.fetchedAt).toISOString()
}

function normalizeRates(rates: Record<string, number> | undefined): Record<string, number> {
  const output: Record<string, number> = {}
  if (!rates)
    return output

  for (const [key, value] of Object.entries(rates)) {
    const numeric = Number(value)
    if (Number.isFinite(numeric))
      output[key.toUpperCase()] = numeric
  }

  return output
}

function mapErrorType(errorType: string) {
  const normalized = errorType.trim().toLowerCase()
  if (normalized === 'unsupported-code' || normalized === 'malformed-request') {
    return { statusCode: 400, message: `Exchange rate request invalid: ${errorType}`, severity: 'warn' as const }
  }
  if (normalized === 'invalid-key' || normalized === 'inactive-account') {
    return { statusCode: 502, message: `Exchange rate API key invalid: ${errorType}`, severity: 'error' as const }
  }
  if (normalized === 'quota-reached') {
    return { statusCode: 429, message: 'Exchange rate quota reached.', severity: 'warn' as const }
  }
  return { statusCode: 502, message: `Exchange rate request failed: ${errorType}`, severity: 'error' as const }
}

async function recordExchangeRateError(event: H3Event, input: {
  title: string
  message: string
  errorType?: string
  status?: number
  meta?: Record<string, unknown>
  severity?: 'warn' | 'error'
}) {
  try {
    await recordTelemetryMessages(event, [{
      source: 'exchange-rate',
      severity: input.severity ?? 'error',
      title: input.title,
      message: input.message,
      meta: {
        errorType: input.errorType,
        status: input.status,
        ...input.meta,
      },
      status: 'unread',
      isAnonymous: true,
      createdAt: Date.now(),
    }])
  }
  catch {
    // ignore telemetry failures
  }
}

async function requestUsdRates(event: H3Event, config: ExchangeRateConfig): Promise<{ payload: ExchangeRateApiSuccess, fetchedAt: number }> {
  if (!config.apiKey) {
    throw createError({ statusCode: 500, statusMessage: 'Exchange rate API key is not configured.' })
  }

  const endpoint = buildLatestEndpoint(config.baseUrl, config.apiKey)
  let response: Response

  try {
    response = await fetch(endpoint, {
      signal: AbortSignal.timeout(config.timeoutMs),
    })
  }
  catch (error: any) {
    await recordExchangeRateError(event, {
      title: 'Exchange rate request failed',
      message: error?.message || 'Network error while fetching exchange rate.',
      errorType: 'network-error',
      status: 502,
      meta: { endpoint },
    })
    throw createError({ statusCode: 502, statusMessage: 'Exchange rate request failed.' })
  }

  const fetchedAt = Date.now()
  let payload: ExchangeRateApiSuccess | ExchangeRateApiError | null = null

  try {
    payload = await response.json() as ExchangeRateApiSuccess | ExchangeRateApiError
  }
  catch {
    await recordExchangeRateError(event, {
      title: 'Exchange rate response invalid',
      message: 'Failed to parse exchange rate response JSON.',
      errorType: 'invalid-json',
      status: 502,
      meta: { endpoint, status: response.status },
    })
    throw createError({ statusCode: 502, statusMessage: 'Exchange rate response invalid.' })
  }

  if (response.ok && payload && (payload as ExchangeRateApiSuccess).result === 'success') {
    return { payload: payload as ExchangeRateApiSuccess, fetchedAt }
  }

  const errorType = typeof (payload as ExchangeRateApiError | null)?.['error-type'] === 'string'
    ? (payload as ExchangeRateApiError)['error-type'] as string
    : 'unknown-error'
  const mapped = mapErrorType(errorType)

  await recordExchangeRateError(event, {
    title: 'Exchange rate API error',
    message: mapped.message,
    errorType,
    status: mapped.statusCode,
    severity: mapped.severity,
    meta: {
      endpoint,
      status: response.status,
      payload,
    },
  })

  throw createError({ statusCode: mapped.statusCode, statusMessage: mapped.message })
}

function buildSnapshot(payload: ExchangeRateApiSuccess, fetchedAt: number): ExchangeRateSnapshot {
  const rates = normalizeRates(payload.conversion_rates)
  return {
    id: randomUUID(),
    baseCurrency: USD_BASE,
    fetchedAt,
    providerUpdatedAt: payload.time_last_update_unix ? payload.time_last_update_unix * 1000 : null,
    providerNextUpdateAt: payload.time_next_update_unix ? payload.time_next_update_unix * 1000 : null,
    payload: payload as unknown as Record<string, unknown>,
    rates,
  }
}

export async function getUsdRates(event: H3Event): Promise<{ snapshot: ExchangeRateSnapshot, source: 'cache' | 'live' }> {
  const config = resolveExchangeRateConfig(event)
  const now = Date.now()
  const cached = await getLatestSnapshot(event, USD_BASE)

  if (cached && isSnapshotFresh(cached, config.ttlMs, now))
    return { snapshot: cached, source: 'cache' }

  const { payload, fetchedAt } = await requestUsdRates(event, config)
  const snapshot = buildSnapshot(payload, fetchedAt)
  await saveSnapshotWithRates(event, snapshot, { storeRateRows: config.storeRateRows })
  if (config.historyRetentionDays > 0) {
    await cleanupHistory(event, { retentionDays: config.historyRetentionDays, baseCurrency: USD_BASE })
  }
  return { snapshot, source: 'live' }
}

export async function convertUsd(
  event: H3Event,
  options: { target: string, amount: number },
): Promise<ExchangeRateConvertResult> {
  const target = options.target.trim().toUpperCase()
  const { snapshot, source } = await getUsdRates(event)
  const rawRate = snapshot.rates[target]
  const rate = Number(rawRate)

  if (!Number.isFinite(rate)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported target currency.' })
  }

  const converted = options.amount * rate

  return {
    rate,
    converted,
    source,
    updatedAt: resolveUpdatedAt(snapshot),
    providerUpdatedAt: resolveProviderUpdatedAt(snapshot),
    fetchedAt: resolveFetchedAt(snapshot),
    providerNextUpdateAt: resolveProviderNextUpdateAt(snapshot),
  }
}

export async function getRateHistory(
  event: H3Event,
  options: { target: string, since?: number, until?: number, limit?: number, offset?: number },
) {
  const target = options.target.trim().toUpperCase()
  const items = await listRateHistory(event, target, {
    since: options.since,
    until: options.until,
    limit: options.limit,
    offset: options.offset,
  })
  return { target, items }
}

export async function getSnapshotHistory(
  event: H3Event,
  options: { since?: number, until?: number, limit?: number, offset?: number, includePayload?: boolean },
) {
  const items = await listSnapshotHistory(event, {
    baseCurrency: USD_BASE,
    since: options.since,
    until: options.until,
    limit: options.limit,
    offset: options.offset,
    includePayload: options.includePayload,
  })
  return items
}
