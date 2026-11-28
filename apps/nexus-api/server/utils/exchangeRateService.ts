import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { networkClient } from '@talex-touch/utils/network'
import { createError } from 'h3'
import { useRuntimeConfig } from 'nitropack/runtime'
import { runAfterResponse } from './afterResponse'
import { readCloudflareBindings } from './cloudflare'
import type { ExchangeRateSnapshot } from './exchangeRateStore'
import {
  claimSnapshotRefresh,
  cleanupHistory,
  getLatestSnapshot,
  listRateHistory,
  listSnapshotHistory,
  saveSnapshotWithRates,
} from './exchangeRateStore'

const USD_BASE = 'USD'
const KV_EXCHANGE_KEY = 'exchange-rate:latest:USD'

interface ExchangeRateApiSuccess {
  result: 'success'
  time_last_update_unix?: number
  time_next_update_unix?: number
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
  const bindings = readCloudflareBindings(event)
  const config = useRuntimeConfig(event) as { exchangeRate?: Partial<ExchangeRateConfig> }
  const exchangeRate = config.exchangeRate ?? {}

  const apiKey = (bindings?.EXCHANGE_RATE_API_KEY ?? exchangeRate.apiKey ?? process.env.EXCHANGE_RATE_API_KEY ?? '').trim()
  const baseUrl = (bindings?.EXCHANGE_RATE_BASE_URL ?? exchangeRate.baseUrl ?? 'https://v6.exchangerate-api.com/v6').trim()
  const ttlMs = Math.max(0, Number(bindings?.EXCHANGE_RATE_TTL_MS ?? exchangeRate.ttlMs) || 8 * 60 * 60 * 1000)
  const timeoutMs = Math.max(1000, Number(bindings?.EXCHANGE_RATE_TIMEOUT_MS ?? exchangeRate.timeoutMs) || 10000)
  const historyRetentionDays = Math.max(0, Number(bindings?.EXCHANGE_RATE_HISTORY_RETENTION_DAYS ?? exchangeRate.historyRetentionDays) || 0)
  const storeRateRows = bindings?.EXCHANGE_RATE_STORE_RATE_ROWS !== undefined
    ? bindings.EXCHANGE_RATE_STORE_RATE_ROWS !== 'false'
    : exchangeRate.storeRateRows !== false

  return {
    apiKey,
    baseUrl: baseUrl || 'https://v6.exchangerate-api.com/v6',
    ttlMs,
    timeoutMs,
    historyRetentionDays,
    storeRateRows,
  }
}

function buildLatestEndpoint(baseUrl: string, apiKey: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${apiKey}/latest/${USD_BASE}`
}

function isSnapshotFresh(snapshot: ExchangeRateSnapshot, ttlMs: number, now = Date.now()): boolean {
  return now - snapshot.fetchedAt <= ttlMs
}

function toIso(value?: number | null): string | null {
  if (!value)
    return null
  return new Date(value).toISOString()
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

async function readKvSnapshot(event: H3Event): Promise<ExchangeRateSnapshot | null> {
  const kv = readCloudflareBindings(event)?.TUFF_INTELLIGENCE_RUNTIME
  if (!kv)
    return null
  try {
    const raw = await kv.get(KV_EXCHANGE_KEY)
    if (!raw)
      return null
    const parsed = JSON.parse(raw) as ExchangeRateSnapshot
    if (parsed && typeof parsed.fetchedAt === 'number' && parsed.rates && typeof parsed.rates === 'object')
      return parsed
  }
  catch {
    // Ignore malformed KV cache and fall back to D1.
  }
  return null
}

async function writeKvSnapshot(event: H3Event, snapshot: ExchangeRateSnapshot, ttlMs: number): Promise<void> {
  const kv = readCloudflareBindings(event)?.TUFF_INTELLIGENCE_RUNTIME
  if (!kv)
    return
  try {
    const expirationTtl = Math.max(3600, Math.ceil((ttlMs || 8 * 60 * 60 * 1000) / 1000) * 2)
    await kv.put(KV_EXCHANGE_KEY, JSON.stringify(snapshot), { expirationTtl })
  }
  catch {
    // Best-effort edge KV mirror; D1 remains source of truth.
  }
}

function mapErrorType(errorType: string) {
  const normalized = errorType.trim().toLowerCase()
  if (normalized === 'unsupported-code' || normalized === 'malformed-request')
    return { statusCode: 400, message: `Exchange rate request invalid: ${errorType}` }
  if (normalized === 'invalid-key' || normalized === 'inactive-account')
    return { statusCode: 502, message: `Exchange rate API key invalid: ${errorType}` }
  if (normalized === 'quota-reached')
    return { statusCode: 429, message: 'Exchange rate quota reached.' }
  return { statusCode: 502, message: `Exchange rate request failed: ${errorType}` }
}

async function requestUsdRates(config: ExchangeRateConfig): Promise<{ payload: ExchangeRateApiSuccess, fetchedAt: number }> {
  if (!config.apiKey)
    throw createError({ statusCode: 500, statusMessage: 'Exchange rate API key is not configured.' })

  const endpoint = buildLatestEndpoint(config.baseUrl, config.apiKey)
  let response: { status: number, data: unknown }
  try {
    response = await networkClient.request({
      method: 'GET',
      url: endpoint,
      timeoutMs: config.timeoutMs,
      validateStatus: Array.from({ length: 500 }, (_, index) => index + 100),
    })
  }
  catch {
    throw createError({ statusCode: 502, statusMessage: 'Exchange rate request failed.' })
  }

  const fetchedAt = Date.now()
  const payload = (response.data ?? null) as ExchangeRateApiSuccess | ExchangeRateApiError | null
  if (response.status >= 200 && response.status < 300 && payload && (payload as ExchangeRateApiSuccess).result === 'success') {
    return { payload: payload as ExchangeRateApiSuccess, fetchedAt }
  }

  const errorType = typeof (payload as ExchangeRateApiError | null)?.['error-type'] === 'string'
    ? (payload as ExchangeRateApiError)['error-type'] as string
    : 'unknown-error'
  const mapped = mapErrorType(errorType)
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

export async function refreshUsdRates(
  event: H3Event,
  options: { force?: boolean } = {},
): Promise<{ snapshot: ExchangeRateSnapshot, source: 'cache' | 'live' }> {
  const config = resolveExchangeRateConfig(event)
  const now = Date.now()

  if (!options.force) {
    const kvCached = await readKvSnapshot(event)
    if (kvCached && isSnapshotFresh(kvCached, config.ttlMs, now))
      return { snapshot: kvCached, source: 'cache' }

    const dbCached = await getLatestSnapshot(event, USD_BASE)
    if (dbCached && isSnapshotFresh(dbCached, config.ttlMs, now)) {
      await writeKvSnapshot(event, dbCached, config.ttlMs)
      return { snapshot: dbCached, source: 'cache' }
    }

    if (dbCached && !(await claimSnapshotRefresh(event, USD_BASE, now)))
      return { snapshot: dbCached, source: 'cache' }
  }

  const { payload, fetchedAt } = await requestUsdRates(config)
  const snapshot = buildSnapshot(payload, fetchedAt)
  await saveSnapshotWithRates(event, snapshot, { storeRateRows: config.storeRateRows })
  await writeKvSnapshot(event, snapshot, config.ttlMs)

  if (config.historyRetentionDays > 0) {
    runAfterResponse(event, 'exchange-rate history cleanup', () =>
      cleanupHistory(event, { retentionDays: config.historyRetentionDays, baseCurrency: USD_BASE }))
  }

  return { snapshot, source: 'live' }
}

export async function getUsdRates(event: H3Event): Promise<{ snapshot: ExchangeRateSnapshot, source: 'cache' | 'live' }> {
  return await refreshUsdRates(event, { force: false })
}

export async function convertUsd(
  event: H3Event,
  options: { target: string, amount: number },
): Promise<ExchangeRateConvertResult> {
  const target = options.target.trim().toUpperCase()
  const { snapshot, source } = await getUsdRates(event)
  const rate = Number(snapshot.rates[target])
  if (!Number.isFinite(rate))
    throw createError({ statusCode: 400, statusMessage: 'Unsupported target currency.' })

  const providerUpdatedAt = toIso(snapshot.providerUpdatedAt)
  const fetchedAt = toIso(snapshot.fetchedAt) ?? new Date().toISOString()

  return {
    rate,
    converted: options.amount * rate,
    source,
    updatedAt: providerUpdatedAt ?? fetchedAt,
    providerUpdatedAt,
    fetchedAt,
    providerNextUpdateAt: toIso(snapshot.providerNextUpdateAt),
  }
}

export async function getRateHistory(
  event: H3Event,
  options: { target: string, since?: number, until?: number, limit?: number, offset?: number },
) {
  const target = options.target.trim().toUpperCase()
  const items = await listRateHistory(event, target, options)
  return { target, items }
}

export async function getSnapshotHistory(
  event: H3Event,
  options: { since?: number, until?: number, limit?: number, offset?: number, includePayload?: boolean },
) {
  return await listSnapshotHistory(event, {
    baseCurrency: USD_BASE,
    ...options,
  })
}
