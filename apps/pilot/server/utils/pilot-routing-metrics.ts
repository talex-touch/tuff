import type { H3Event } from 'h3'
import type { PilotProviderTargetType } from './pilot-channel'
import { requirePilotDatabase } from './pilot-store'

const ROUTING_METRICS_TABLE = 'pilot_routing_metrics'

export interface PilotRoutingMetricRecord {
  id: number
  requestId: string
  sessionId: string
  userId: string
  modelId: string
  routeComboId: string
  channelId: string
  providerModel: string
  queueWaitMs: number
  ttftMs: number
  totalDurationMs: number
  outputChars: number
  outputTokens: number
  success: boolean
  errorCode: string
  finishReason: string
  createdAt: string
  metadata?: Record<string, unknown>
}

export interface PilotRoutingMetricInput {
  requestId?: string
  sessionId: string
  userId: string
  modelId?: string
  routeComboId?: string
  channelId: string
  providerModel: string
  providerTargetType?: PilotProviderTargetType
  queueWaitMs?: number
  ttftMs?: number
  totalDurationMs?: number
  outputChars?: number
  outputTokens?: number
  success: boolean
  errorCode?: string
  finishReason?: string
  metadata?: Record<string, unknown>
}

export interface PilotRoutingMetricQuery {
  limit?: number
  channelId?: string
  providerModel?: string
  routeComboId?: string
  userId?: string
  fromTs?: string
}

function nowIso(): string {
  return new Date().toISOString()
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function normalizeNumber(value: unknown, fallback = 0, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return fallback
  }
  return Math.min(Math.max(Math.floor(parsed), min), max)
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? {})
  }
  catch {
    return '{}'
  }
}

function parseJsonObject(value: string | null | undefined): Record<string, unknown> | undefined {
  const raw = normalizeText(value)
  if (!raw) {
    return undefined
  }
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined
  }
  catch {
    return undefined
  }
}

function mapRow(row: {
  id: number
  request_id: string
  session_id: string
  user_id: string
  model_id: string
  route_combo_id: string
  channel_id: string
  provider_model: string
  queue_wait_ms: number
  ttft_ms: number
  total_duration_ms: number
  output_chars: number
  output_tokens: number
  success: number
  error_code: string | null
  finish_reason: string | null
  created_at: string
  metadata_json: string | null
}): PilotRoutingMetricRecord {
  return {
    id: Number(row.id || 0),
    requestId: normalizeText(row.request_id),
    sessionId: normalizeText(row.session_id),
    userId: normalizeText(row.user_id),
    modelId: normalizeText(row.model_id),
    routeComboId: normalizeText(row.route_combo_id),
    channelId: normalizeText(row.channel_id),
    providerModel: normalizeText(row.provider_model),
    queueWaitMs: normalizeNumber(row.queue_wait_ms, 0, 0),
    ttftMs: normalizeNumber(row.ttft_ms, 0, 0),
    totalDurationMs: normalizeNumber(row.total_duration_ms, 0, 0),
    outputChars: normalizeNumber(row.output_chars, 0, 0),
    outputTokens: normalizeNumber(row.output_tokens, 0, 0),
    success: Number(row.success || 0) > 0,
    errorCode: normalizeText(row.error_code),
    finishReason: normalizeText(row.finish_reason),
    createdAt: normalizeText(row.created_at),
    metadata: parseJsonObject(row.metadata_json),
  }
}

export async function ensurePilotRoutingMetricsSchema(event: H3Event): Promise<void> {
  const db = requirePilotDatabase(event)

  const createTableSqlList = [
    `
      CREATE TABLE IF NOT EXISTS ${ROUTING_METRICS_TABLE} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        request_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        route_combo_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        provider_model TEXT NOT NULL,
        queue_wait_ms INTEGER NOT NULL DEFAULT 0,
        ttft_ms INTEGER NOT NULL DEFAULT 0,
        total_duration_ms INTEGER NOT NULL DEFAULT 0,
        output_chars INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        success INTEGER NOT NULL DEFAULT 0,
        error_code TEXT,
        finish_reason TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );
    `,
    `
      CREATE TABLE IF NOT EXISTS ${ROUTING_METRICS_TABLE} (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        request_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        route_combo_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        provider_model TEXT NOT NULL,
        queue_wait_ms INTEGER NOT NULL DEFAULT 0,
        ttft_ms INTEGER NOT NULL DEFAULT 0,
        total_duration_ms INTEGER NOT NULL DEFAULT 0,
        output_chars INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        success INTEGER NOT NULL DEFAULT 0,
        error_code TEXT,
        finish_reason TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );
    `,
  ]

  let lastError: unknown = null
  for (const sql of createTableSqlList) {
    try {
      await db.prepare(sql).run()
      lastError = null
      break
    }
    catch (error) {
      lastError = error
    }
  }

  if (lastError) {
    throw lastError
  }

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_pilot_routing_metrics_created
    ON ${ROUTING_METRICS_TABLE}(created_at DESC);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_pilot_routing_metrics_channel_model
    ON ${ROUTING_METRICS_TABLE}(channel_id, provider_model, created_at DESC);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_pilot_routing_metrics_user
    ON ${ROUTING_METRICS_TABLE}(user_id, created_at DESC);
  `).run()
}

export async function recordPilotRoutingMetric(
  event: H3Event,
  input: PilotRoutingMetricInput,
): Promise<void> {
  await ensurePilotRoutingMetricsSchema(event)
  const db = requirePilotDatabase(event)

  const requestId = normalizeText(input.requestId) || `routing_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const sessionId = normalizeText(input.sessionId)
  const userId = normalizeText(input.userId)
  const channelId = normalizeText(input.channelId)
  const providerModel = normalizeText(input.providerModel)
  if (!sessionId || !userId || !channelId || !providerModel) {
    return
  }

  const outputChars = normalizeNumber(input.outputChars, 0, 0)
  const estimatedTokens = Math.max(0, Math.ceil(outputChars / 4))
  const outputTokens = normalizeNumber(input.outputTokens, estimatedTokens, 0)

  await db.prepare(`
    INSERT INTO ${ROUTING_METRICS_TABLE}
      (request_id, session_id, user_id, model_id, route_combo_id, channel_id, provider_model, queue_wait_ms, ttft_ms, total_duration_ms, output_chars, output_tokens, success, error_code, finish_reason, metadata_json, created_at)
    VALUES
      (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
  `).bind(
    requestId,
    sessionId,
    userId,
    normalizeText(input.modelId) || providerModel,
    normalizeText(input.routeComboId) || 'default-auto',
    channelId,
    providerModel,
    normalizeNumber(input.queueWaitMs, 0, 0),
    normalizeNumber(input.ttftMs, 0, 0),
    normalizeNumber(input.totalDurationMs, 0, 0),
    outputChars,
    outputTokens,
    input.success ? 1 : 0,
    normalizeText(input.errorCode) || null,
    normalizeText(input.finishReason) || null,
    safeStringify({
      ...(input.metadata || {}),
      providerTargetType: input.providerTargetType || 'model',
    }),
    nowIso(),
  ).run()
}

export async function listPilotRoutingMetrics(
  event: H3Event,
  query: PilotRoutingMetricQuery = {},
): Promise<PilotRoutingMetricRecord[]> {
  await ensurePilotRoutingMetricsSchema(event)
  const db = requirePilotDatabase(event)

  const conditions: string[] = []
  const params: unknown[] = []

  const pushCondition = (sql: string, value: unknown) => {
    params.push(value)
    conditions.push(sql.replace('?$', `?${params.length}`))
  }

  const channelId = normalizeText(query.channelId)
  const providerModel = normalizeText(query.providerModel)
  const routeComboId = normalizeText(query.routeComboId)
  const userId = normalizeText(query.userId)
  const fromTs = normalizeText(query.fromTs)

  if (channelId) {
    pushCondition('channel_id = ?$', channelId)
  }
  if (providerModel) {
    pushCondition('provider_model = ?$', providerModel)
  }
  if (routeComboId) {
    pushCondition('route_combo_id = ?$', routeComboId)
  }
  if (userId) {
    pushCondition('user_id = ?$', userId)
  }
  if (fromTs) {
    pushCondition('created_at >= ?$', fromTs)
  }

  const limit = normalizeNumber(query.limit, 100, 1, 2000)
  params.push(limit)

  const whereClause = conditions.length > 0
    ? `WHERE ${conditions.join(' AND ')}`
    : ''

  const { results } = await db.prepare(`
    SELECT id, request_id, session_id, user_id, model_id, route_combo_id, channel_id, provider_model, queue_wait_ms, ttft_ms, total_duration_ms, output_chars, output_tokens, success, error_code, finish_reason, metadata_json, created_at
    FROM ${ROUTING_METRICS_TABLE}
    ${whereClause}
    ORDER BY id DESC
    LIMIT ?${params.length}
  `).bind(...params).all<{
    id: number
    request_id: string
    session_id: string
    user_id: string
    model_id: string
    route_combo_id: string
    channel_id: string
    provider_model: string
    queue_wait_ms: number
    ttft_ms: number
    total_duration_ms: number
    output_chars: number
    output_tokens: number
    success: number
    error_code: string | null
    finish_reason: string | null
    metadata_json: string | null
    created_at: string
  }>()

  return (results || []).map(item => mapRow(item))
}
