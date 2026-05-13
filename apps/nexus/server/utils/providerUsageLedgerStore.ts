import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import type { SceneRunFallbackTrailItem, SceneRunResult, SceneRunSelection, SceneRunTraceStep, SceneRunUsage } from './sceneOrchestrator'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'

const LEDGER_TABLE = 'provider_usage_ledger'
const JSON_LIMIT_BYTES = 128 * 1024

const initializedSchemas = new WeakSet<D1Database>()

export type ProviderUsageLedgerStatus = 'planned' | 'completed' | 'failed'
export type ProviderUsageLedgerMode = 'dry_run' | 'execute'

export interface ProviderUsageLedgerEntry {
  id: string
  runId: string
  sceneId: string
  mode: ProviderUsageLedgerMode
  status: ProviderUsageLedgerStatus
  strategyMode: string
  capability: string | null
  providerId: string | null
  unit: string
  quantity: number
  billable: boolean
  estimated: boolean
  pricingRef: string | null
  providerUsageRef: string | null
  errorCode: string | null
  errorMessage: string | null
  trace: Array<Record<string, unknown>>
  fallbackTrail: Array<Record<string, unknown>>
  selected: Array<Record<string, unknown>>
  createdAt: string
}

interface ProviderUsageLedgerRow {
  id: string
  run_id: string
  scene_id: string
  mode: string
  status: string
  strategy_mode: string
  capability: string | null
  provider_id: string | null
  unit: string
  quantity: number
  billable: number
  estimated: number
  pricing_ref: string | null
  provider_usage_ref: string | null
  error_code: string | null
  error_message: string | null
  trace_json: string
  fallback_trail_json: string
  selected_json: string
  created_at: string
}

export interface ListProviderUsageLedgerOptions {
  runId?: string
  sceneId?: string
  providerId?: string
  capability?: string
  status?: ProviderUsageLedgerStatus
  mode?: ProviderUsageLedgerMode
  page?: number
  limit?: number
}

export interface ProviderUsageLedgerList {
  entries: ProviderUsageLedgerEntry[]
  page: number
  limit: number
  total: number
}

interface NormalizedLedgerUsage {
  unit: string
  quantity: number
  billable: boolean
  providerId: string | null
  capability: string | null
  estimated: boolean
  pricingRef: string | null
  providerUsageRef: string | null
}

function getD1Database(event: H3Event): D1Database {
  const db = readCloudflareBindings(event)?.DB
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }
  return db
}

async function ensureProviderUsageLedgerSchema(db: D1Database) {
  if (initializedSchemas.has(db))
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${LEDGER_TABLE} (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      scene_id TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      strategy_mode TEXT NOT NULL,
      capability TEXT,
      provider_id TEXT,
      unit TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      billable INTEGER NOT NULL DEFAULT 0,
      estimated INTEGER NOT NULL DEFAULT 0,
      pricing_ref TEXT,
      provider_usage_ref TEXT,
      error_code TEXT,
      error_message TEXT,
      trace_json TEXT NOT NULL,
      fallback_trail_json TEXT NOT NULL,
      selected_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_provider_usage_ledger_run ON ${LEDGER_TABLE}(run_id);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_provider_usage_ledger_scene ON ${LEDGER_TABLE}(scene_id, created_at);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_provider_usage_ledger_provider ON ${LEDGER_TABLE}(provider_id, created_at);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_provider_usage_ledger_capability ON ${LEDGER_TABLE}(capability, created_at);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_provider_usage_ledger_status ON ${LEDGER_TABLE}(status, created_at);`).run()

  initializedSchemas.add(db)
}

function clampText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string')
    return null
  const trimmed = value.trim()
  if (!trimmed)
    return null
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

function readOptionalString(value: unknown, field: string, maxLength = 180): string | undefined {
  if (value == null)
    return undefined
  const normalized = clampText(value, maxLength)
  if (!normalized) {
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  }
  return normalized
}

function assertEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T | undefined {
  if (value == null)
    return undefined
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  }
  return value as T
}

function clampPagination(page?: number, limit?: number) {
  const safePage = Number.isFinite(page) && page && page > 0 ? Math.floor(page) : 1
  const safeLimit = Number.isFinite(limit) && limit && limit > 0 ? Math.min(Math.floor(limit), 100) : 50
  return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit }
}

function safeJsonArray(value: Array<Record<string, unknown>>): string {
  const json = JSON.stringify(value)
  if (new TextEncoder().encode(json).length > JSON_LIMIT_BYTES) {
    return JSON.stringify([{
      truncated: true,
      originalItems: value.length,
    }])
  }
  return json
}

function parseJsonArray(value: string): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed))
      return []
    return parsed.filter(item => item && typeof item === 'object' && !Array.isArray(item)) as Array<Record<string, unknown>>
  }
  catch {
    return []
  }
}

function normalizeQuantity(value: unknown): number {
  const quantity = Number(value)
  return Number.isFinite(quantity) && quantity >= 0 ? quantity : 0
}

function sanitizeMetadata(metadata: SceneRunTraceStep['metadata']) {
  if (!metadata)
    return undefined

  const safe: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === 'string') {
      safe[key] = value.length > 240 ? value.slice(0, 240) : value
    }
    else if (typeof value === 'number' || typeof value === 'boolean' || value == null) {
      safe[key] = value
    }
  }
  return safe
}

function sanitizeTrace(trace: SceneRunTraceStep[]): Array<Record<string, unknown>> {
  return trace.map(step => ({
    phase: step.phase,
    status: step.status,
    at: step.at,
    message: clampText(step.message, 500) ?? '',
    metadata: sanitizeMetadata(step.metadata),
  }))
}

function sanitizeFallbackTrail(fallbackTrail: SceneRunFallbackTrailItem[]): Array<Record<string, unknown>> {
  return fallbackTrail.map(item => ({
    providerId: item.providerId,
    capability: item.capability,
    status: item.status,
    reason: clampText(item.reason, 500),
  }))
}

function sanitizeSelection(selected: SceneRunSelection[]): Array<Record<string, unknown>> {
  return selected.map(item => ({
    providerId: item.providerId,
    providerName: item.providerName,
    vendor: item.vendor,
    capability: item.capability,
    priority: item.priority,
    weight: item.weight,
    bindingId: item.bindingId,
    region: item.region,
  }))
}

function normalizeUsageItem(run: SceneRunResult, usage: SceneRunUsage, index: number): NormalizedLedgerUsage {
  const capability = clampText(usage.capability, 160)
    ?? run.requestedCapabilities[index]
    ?? run.requestedCapabilities[0]
    ?? null
  const selected = capability
    ? run.selected.find(item => item.capability === capability)
    : run.selected[0]

  return {
    unit: clampText(usage.unit, 80) ?? 'request',
    quantity: normalizeQuantity(usage.quantity),
    billable: usage.billable === true,
    providerId: clampText(usage.providerId, 180) ?? selected?.providerId ?? null,
    capability,
    estimated: usage.estimated === true,
    pricingRef: clampText(usage.pricingRef, 255),
    providerUsageRef: clampText(usage.providerUsageRef, 255),
  }
}

function normalizeRunUsage(run: SceneRunResult): NormalizedLedgerUsage[] {
  if (run.usage.length > 0)
    return run.usage.map((usage, index) => normalizeUsageItem(run, usage, index))

  const capability = run.requestedCapabilities[0] ?? null
  const selected = capability
    ? run.selected.find(item => item.capability === capability)
    : run.selected[0]

  return [{
    unit: 'run',
    quantity: 1,
    billable: false,
    providerId: selected?.providerId ?? null,
    capability,
    estimated: false,
    pricingRef: null,
    providerUsageRef: null,
  }]
}

function mapLedgerRow(row: ProviderUsageLedgerRow): ProviderUsageLedgerEntry {
  return {
    id: row.id,
    runId: row.run_id,
    sceneId: row.scene_id,
    mode: row.mode as ProviderUsageLedgerMode,
    status: row.status as ProviderUsageLedgerStatus,
    strategyMode: row.strategy_mode,
    capability: row.capability,
    providerId: row.provider_id,
    unit: row.unit,
    quantity: Number(row.quantity),
    billable: Number(row.billable) === 1,
    estimated: Number(row.estimated) === 1,
    pricingRef: row.pricing_ref,
    providerUsageRef: row.provider_usage_ref,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    trace: parseJsonArray(row.trace_json),
    fallbackTrail: parseJsonArray(row.fallback_trail_json),
    selected: parseJsonArray(row.selected_json),
    createdAt: row.created_at,
  }
}

function buildLedgerWhere(options: ListProviderUsageLedgerOptions) {
  const conditions: string[] = []
  const values: string[] = []

  if (options.runId) {
    conditions.push('run_id = ?')
    values.push(options.runId)
  }
  if (options.sceneId) {
    conditions.push('scene_id = ?')
    values.push(options.sceneId)
  }
  if (options.providerId) {
    conditions.push('provider_id = ?')
    values.push(options.providerId)
  }
  if (options.capability) {
    conditions.push('capability = ?')
    values.push(options.capability)
  }
  if (options.status) {
    conditions.push('status = ?')
    values.push(options.status)
  }
  if (options.mode) {
    conditions.push('mode = ?')
    values.push(options.mode)
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    values,
  }
}

export async function recordProviderUsageLedger(event: H3Event, run: SceneRunResult): Promise<ProviderUsageLedgerEntry[]> {
  const db = getD1Database(event)
  await ensureProviderUsageLedgerSchema(db)

  const now = new Date().toISOString()
  const traceJson = safeJsonArray(sanitizeTrace(run.trace))
  const fallbackTrailJson = safeJsonArray(sanitizeFallbackTrail(run.fallbackTrail))
  const selectedJson = safeJsonArray(sanitizeSelection(run.selected))
  const errorCode = clampText(run.error?.code, 120)
  const errorMessage = clampText(run.error?.message, 500)
  const usageItems = normalizeRunUsage(run)
  const entries: ProviderUsageLedgerEntry[] = []

  for (const usage of usageItems) {
    const id = randomUUID()
    await db.prepare(`
      INSERT INTO ${LEDGER_TABLE} (
        id, run_id, scene_id, mode, status, strategy_mode, capability, provider_id,
        unit, quantity, billable, estimated, pricing_ref, provider_usage_ref,
        error_code, error_message, trace_json, fallback_trail_json, selected_json, created_at
      )
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20);
    `).bind(
      id,
      run.runId,
      run.sceneId,
      run.mode,
      run.status,
      run.strategyMode,
      usage.capability,
      usage.providerId,
      usage.unit,
      usage.quantity,
      usage.billable ? 1 : 0,
      usage.estimated ? 1 : 0,
      usage.pricingRef,
      usage.providerUsageRef,
      errorCode,
      errorMessage,
      traceJson,
      fallbackTrailJson,
      selectedJson,
      now,
    ).run()

    entries.push({
      id,
      runId: run.runId,
      sceneId: run.sceneId,
      mode: run.mode,
      status: run.status,
      strategyMode: run.strategyMode,
      capability: usage.capability,
      providerId: usage.providerId,
      unit: usage.unit,
      quantity: usage.quantity,
      billable: usage.billable,
      estimated: usage.estimated,
      pricingRef: usage.pricingRef,
      providerUsageRef: usage.providerUsageRef,
      errorCode,
      errorMessage,
      trace: parseJsonArray(traceJson),
      fallbackTrail: parseJsonArray(fallbackTrailJson),
      selected: parseJsonArray(selectedJson),
      createdAt: now,
    })
  }

  return entries
}

export async function listProviderUsageLedgerEntries(
  event: H3Event,
  options: ListProviderUsageLedgerOptions = {},
): Promise<ProviderUsageLedgerList> {
  const db = getD1Database(event)
  await ensureProviderUsageLedgerSchema(db)

  const normalized: ListProviderUsageLedgerOptions = {
    runId: readOptionalString(options.runId, 'runId', 180),
    sceneId: readOptionalString(options.sceneId, 'sceneId', 180),
    providerId: readOptionalString(options.providerId, 'providerId', 180),
    capability: readOptionalString(options.capability, 'capability', 160),
    status: assertEnum(options.status, 'status', ['planned', 'completed', 'failed'] as const),
    mode: assertEnum(options.mode, 'mode', ['dry_run', 'execute'] as const),
    page: options.page,
    limit: options.limit,
  }
  const { clause, values } = buildLedgerWhere(normalized)
  const { page, limit, offset } = clampPagination(options.page, options.limit)

  const countRow = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM ${LEDGER_TABLE}
    ${clause};
  `).bind(...values).first<{ total: number }>()

  const { results } = await db.prepare(`
    SELECT id, run_id, scene_id, mode, status, strategy_mode, capability, provider_id,
      unit, quantity, billable, estimated, pricing_ref, provider_usage_ref,
      error_code, error_message, trace_json, fallback_trail_json, selected_json, created_at
    FROM ${LEDGER_TABLE}
    ${clause}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?;
  `).bind(...values, limit, offset).all<ProviderUsageLedgerRow>()

  return {
    entries: (results ?? []).map(mapLedgerRow),
    page,
    limit,
    total: Number(countRow?.total ?? 0),
  }
}
