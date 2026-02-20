import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { useStorage } from 'nitropack/runtime/internal/storage'
import { readCloudflareBindings } from './cloudflare'

const EXCHANGE_RATE_TABLE = 'exchange_rate_snapshots'
const EXCHANGE_RATE_RATES_TABLE = 'exchange_rate_rates'
const EXCHANGE_RATE_CACHE_PREFIX = 'exchange-rate:latest'

let exchangeRateSchemaInitialized = false
let exchangeRateRatesSchemaInitialized = false

export interface ExchangeRateSnapshot {
  id: string
  baseCurrency: string
  fetchedAt: number
  providerUpdatedAt?: number | null
  providerNextUpdateAt?: number | null
  payload: Record<string, unknown>
  rates: Record<string, number>
}

export interface ExchangeRateCacheAdapter {
  readCache: (baseCurrency: string) => Promise<ExchangeRateSnapshot | null>
  writeCache: (snapshot: ExchangeRateSnapshot) => Promise<void>
}

export interface ExchangeRateSnapshotSummary {
  id: string
  baseCurrency: string
  fetchedAt: number
  providerUpdatedAt?: number | null
  providerNextUpdateAt?: number | null
  payload?: Record<string, unknown>
}

export interface ExchangeRateRateHistoryItem {
  baseCurrency: string
  targetCurrency: string
  rate: number
  fetchedAt: number
  providerUpdatedAt?: number | null
}

interface D1ExchangeRateRow {
  id: string
  base_currency: string
  fetched_at: number
  provider_updated_at: number | null
  provider_next_update_at: number | null
  payload_json: string
  rates_json: string
}

interface D1ExchangeRateRateRow {
  base_currency: string
  target_currency: string
  rate: number
  fetched_at: number
  provider_updated_at: number | null
}

export interface ExchangeRateSnapshotListOptions {
  baseCurrency?: string
  limit?: number
  since?: number
}

export interface ExchangeRateRateHistoryOptions {
  since?: number
  until?: number
  limit?: number
  offset?: number
}

export interface ExchangeRateSnapshotHistoryOptions {
  baseCurrency?: string
  since?: number
  until?: number
  limit?: number
  offset?: number
  includePayload?: boolean
}

export interface SaveSnapshotOptions {
  storeRateRows?: boolean
}

export interface CleanupHistoryOptions {
  retentionDays: number
  baseCurrency?: string
}

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

async function ensureExchangeRateSchema(db: D1Database): Promise<void> {
  if (exchangeRateSchemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${EXCHANGE_RATE_TABLE} (
      id TEXT PRIMARY KEY,
      base_currency TEXT NOT NULL,
      fetched_at INTEGER NOT NULL,
      provider_updated_at INTEGER,
      provider_next_update_at INTEGER,
      payload_json TEXT NOT NULL,
      rates_json TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_${EXCHANGE_RATE_TABLE}_base_fetched_at
    ON ${EXCHANGE_RATE_TABLE}(base_currency, fetched_at);
  `).run()

  exchangeRateSchemaInitialized = true
}

async function ensureExchangeRateRatesSchema(db: D1Database): Promise<void> {
  if (exchangeRateRatesSchemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${EXCHANGE_RATE_RATES_TABLE} (
      id TEXT PRIMARY KEY,
      base_currency TEXT NOT NULL,
      target_currency TEXT NOT NULL,
      rate REAL NOT NULL,
      fetched_at INTEGER NOT NULL,
      provider_updated_at INTEGER
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_${EXCHANGE_RATE_RATES_TABLE}_target_fetched_at
    ON ${EXCHANGE_RATE_RATES_TABLE}(target_currency, fetched_at);
  `).run()

  exchangeRateRatesSchemaInitialized = true
}

function resolveCacheKey(baseCurrency: string) {
  return `${EXCHANGE_RATE_CACHE_PREFIX}:${baseCurrency}`
}

function safeParseJson<T = unknown>(value: string | null | undefined): T | null {
  if (!value)
    return null
  try {
    return JSON.parse(value) as T
  }
  catch {
    return null
  }
}

function mapExchangeRateRow(row: D1ExchangeRateRow): ExchangeRateSnapshot | null {
  const payload = safeParseJson<Record<string, unknown>>(row.payload_json)
  const rates = safeParseJson<Record<string, number>>(row.rates_json)
  if (!payload || !rates)
    return null

  return {
    id: row.id,
    baseCurrency: row.base_currency,
    fetchedAt: Number(row.fetched_at) || 0,
    providerUpdatedAt: row.provider_updated_at ?? null,
    providerNextUpdateAt: row.provider_next_update_at ?? null,
    payload,
    rates,
  }
}

async function readStoredSnapshot(baseCurrency: string): Promise<ExchangeRateSnapshot | null> {
  const storage = useStorage()
  const item = await storage.getItem<ExchangeRateSnapshot>(resolveCacheKey(baseCurrency))
  return item ?? null
}

async function writeStoredSnapshot(snapshot: ExchangeRateSnapshot): Promise<void> {
  const storage = useStorage()
  await storage.setItem(resolveCacheKey(snapshot.baseCurrency), snapshot)
}

const storageCacheAdapter: ExchangeRateCacheAdapter = {
  readCache: readStoredSnapshot,
  writeCache: writeStoredSnapshot,
}

function mapSnapshotSummary(
  snapshot: ExchangeRateSnapshot,
  includePayload: boolean,
): ExchangeRateSnapshotSummary {
  const base: ExchangeRateSnapshotSummary = {
    id: snapshot.id,
    baseCurrency: snapshot.baseCurrency,
    fetchedAt: snapshot.fetchedAt,
    providerUpdatedAt: snapshot.providerUpdatedAt ?? null,
    providerNextUpdateAt: snapshot.providerNextUpdateAt ?? null,
  }

  if (includePayload)
    base.payload = snapshot.payload

  return base
}

function mapRateHistoryRow(row: D1ExchangeRateRateRow): ExchangeRateRateHistoryItem {
  return {
    baseCurrency: row.base_currency,
    targetCurrency: row.target_currency,
    rate: Number(row.rate) || 0,
    fetchedAt: Number(row.fetched_at) || 0,
    providerUpdatedAt: row.provider_updated_at ?? null,
  }
}

export async function getLatestSnapshot(
  event: H3Event,
  baseCurrency: string,
): Promise<ExchangeRateSnapshot | null> {
  const db = getD1Database(event)

  if (db) {
    await ensureExchangeRateSchema(db)
    const row = await db.prepare(`
      SELECT id, base_currency, fetched_at, provider_updated_at, provider_next_update_at, payload_json, rates_json
      FROM ${EXCHANGE_RATE_TABLE}
      WHERE base_currency = ?1
      ORDER BY fetched_at DESC
      LIMIT 1;
    `).bind(baseCurrency).first<D1ExchangeRateRow>()

    if (row) {
      const mapped = mapExchangeRateRow(row)
      if (mapped)
        return mapped
    }
  }

  return await storageCacheAdapter.readCache(baseCurrency)
}

export async function saveSnapshot(
  event: H3Event,
  snapshot: ExchangeRateSnapshot,
): Promise<void> {
  const db = getD1Database(event)

  if (db) {
    await ensureExchangeRateSchema(db)
    await db.prepare(`
      INSERT INTO ${EXCHANGE_RATE_TABLE} (
        id,
        base_currency,
        fetched_at,
        provider_updated_at,
        provider_next_update_at,
        payload_json,
        rates_json
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7);
    `).bind(
      snapshot.id,
      snapshot.baseCurrency,
      snapshot.fetchedAt,
      snapshot.providerUpdatedAt ?? null,
      snapshot.providerNextUpdateAt ?? null,
      JSON.stringify(snapshot.payload ?? {}),
      JSON.stringify(snapshot.rates ?? {}),
    ).run()
  }

  await storageCacheAdapter.writeCache(snapshot)
}

export async function saveSnapshotWithRates(
  event: H3Event,
  snapshot: ExchangeRateSnapshot,
  options: SaveSnapshotOptions = {},
): Promise<void> {
  const db = getD1Database(event)
  await saveSnapshot(event, snapshot)

  if (!db || options.storeRateRows === false)
    return

  await ensureExchangeRateRatesSchema(db)

  const entries = Object.entries(snapshot.rates || {})
  if (!entries.length)
    return

  for (const [targetCurrency, rate] of entries) {
    await db.prepare(`
      INSERT INTO ${EXCHANGE_RATE_RATES_TABLE} (
        id,
        base_currency,
        target_currency,
        rate,
        fetched_at,
        provider_updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6);
    `).bind(
      randomUUID(),
      snapshot.baseCurrency,
      targetCurrency,
      rate,
      snapshot.fetchedAt,
      snapshot.providerUpdatedAt ?? null,
    ).run()
  }
}

export async function listRateHistory(
  event: H3Event,
  targetCurrency: string,
  options: ExchangeRateRateHistoryOptions = {},
): Promise<ExchangeRateRateHistoryItem[]> {
  const db = getD1Database(event)
  if (!db)
    return []

  await ensureExchangeRateRatesSchema(db)

  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)
  const clauses: string[] = ['target_currency = ?1']
  const params: Array<string | number> = [targetCurrency]

  if (typeof options.since === 'number' && Number.isFinite(options.since)) {
    clauses.push(`fetched_at >= ?${params.length + 1}`)
    params.push(options.since)
  }
  if (typeof options.until === 'number' && Number.isFinite(options.until)) {
    clauses.push(`fetched_at <= ?${params.length + 1}`)
    params.push(options.until)
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const query = `
    SELECT base_currency, target_currency, rate, fetched_at, provider_updated_at
    FROM ${EXCHANGE_RATE_RATES_TABLE}
    ${whereClause}
    ORDER BY fetched_at DESC
    LIMIT ?${params.length + 1}
    OFFSET ?${params.length + 2};
  `

  const { results } = await db.prepare(query).bind(...params, limit, offset).all<D1ExchangeRateRateRow>()
  return (results ?? []).map(mapRateHistoryRow)
}

export async function listSnapshotHistory(
  event: H3Event,
  options: ExchangeRateSnapshotHistoryOptions = {},
): Promise<ExchangeRateSnapshotSummary[]> {
  const baseCurrency = options.baseCurrency ?? 'USD'
  const db = getD1Database(event)
  if (!db)
    return []

  await ensureExchangeRateSchema(db)

  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)
  const clauses: string[] = ['base_currency = ?1']
  const params: Array<string | number> = [baseCurrency]

  if (typeof options.since === 'number' && Number.isFinite(options.since)) {
    clauses.push(`fetched_at >= ?${params.length + 1}`)
    params.push(options.since)
  }
  if (typeof options.until === 'number' && Number.isFinite(options.until)) {
    clauses.push(`fetched_at <= ?${params.length + 1}`)
    params.push(options.until)
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const query = `
    SELECT id, base_currency, fetched_at, provider_updated_at, provider_next_update_at, payload_json, rates_json
    FROM ${EXCHANGE_RATE_TABLE}
    ${whereClause}
    ORDER BY fetched_at DESC
    LIMIT ?${params.length + 1}
    OFFSET ?${params.length + 2};
  `

  const { results } = await db.prepare(query).bind(...params, limit, offset).all<D1ExchangeRateRow>()
  return (results ?? [])
    .map(row => mapExchangeRateRow(row))
    .filter((row): row is ExchangeRateSnapshot => Boolean(row))
    .map(snapshot => mapSnapshotSummary(snapshot, Boolean(options.includePayload)))
}

export async function cleanupHistory(
  event: H3Event,
  options: CleanupHistoryOptions,
): Promise<void> {
  const retentionDays = Math.max(0, Math.floor(options.retentionDays))
  if (!retentionDays)
    return

  const db = getD1Database(event)
  if (!db)
    return

  await ensureExchangeRateSchema(db)
  await ensureExchangeRateRatesSchema(db)

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  const baseCurrency = options.baseCurrency ?? 'USD'

  await db.prepare(`
    DELETE FROM ${EXCHANGE_RATE_TABLE}
    WHERE base_currency = ?1 AND fetched_at < ?2;
  `).bind(baseCurrency, cutoff).run()

  await db.prepare(`
    DELETE FROM ${EXCHANGE_RATE_RATES_TABLE}
    WHERE base_currency = ?1 AND fetched_at < ?2;
  `).bind(baseCurrency, cutoff).run()
}

export async function listSnapshots(
  event: H3Event,
  options: ExchangeRateSnapshotListOptions = {},
): Promise<ExchangeRateSnapshot[]> {
  const baseCurrency = options.baseCurrency ?? 'USD'
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const db = getD1Database(event)

  if (!db) {
    const latest = await storageCacheAdapter.readCache(baseCurrency)
    return latest ? [latest] : []
  }

  await ensureExchangeRateSchema(db)

  const clauses: string[] = ['base_currency = ?1']
  const params: Array<string | number> = [baseCurrency]

  if (typeof options.since === 'number' && Number.isFinite(options.since)) {
    clauses.push(`fetched_at >= ?${params.length + 1}`)
    params.push(options.since)
  }

  const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  const query = `
    SELECT id, base_currency, fetched_at, provider_updated_at, provider_next_update_at, payload_json, rates_json
    FROM ${EXCHANGE_RATE_TABLE}
    ${whereClause}
    ORDER BY fetched_at DESC
    LIMIT ?${params.length + 1};
  `

  const { results } = await db.prepare(query).bind(...params, limit).all<D1ExchangeRateRow>()
  return (results ?? [])
    .map(row => mapExchangeRateRow(row))
    .filter((row): row is ExchangeRateSnapshot => Boolean(row))
}
