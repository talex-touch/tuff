import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import crypto from 'uncrypto'
import { readCloudflareBindings } from './cloudflare'

const RUNTIME_SESSIONS_TABLE = 'intelligence_runtime_sessions'
const RUNTIME_TRACE_TABLE = 'intelligence_runtime_trace_events'
const RUNTIME_CHECKPOINTS_TABLE = 'intelligence_runtime_checkpoints'

let runtimeSchemaInitialized = false

export type TuffIntelligencePauseReason
  = | 'client_disconnect'
    | 'heartbeat_timeout'
    | 'manual_pause'
    | 'system_preempted'

export type TuffIntelligenceRuntimeStatus
  = | 'idle'
    | 'planning'
    | 'executing'
    | 'reflecting'
    | 'waiting_approval'
    | 'paused_disconnect'
    | 'completed'
    | 'failed'
    | 'cancelled'

interface RuntimeSessionRow {
  session_id: string
  user_id: string
  run_id: string | null
  status: string
  phase: string | null
  objective: string | null
  history_json: string | null
  state_json: string | null
  pause_reason: string | null
  last_event_seq: number
  last_trace_id: string | null
  last_heartbeat_at: string | null
  last_checkpoint_at: string | null
  created_at: string
  updated_at: string
}

interface RuntimeTraceRow {
  id: string
  session_id: string
  user_id: string
  run_id: string | null
  seq: number
  event_type: string
  phase: string | null
  trace_id: string | null
  payload_json: string
  created_at: string
}

interface RuntimeCheckpointRow {
  id: string
  session_id: string
  user_id: string
  run_id: string | null
  seq: number
  phase: string | null
  state_json: string
  created_at: string
}

export interface RuntimeSessionState {
  [key: string]: unknown
}

export interface RuntimeTraceEnvelope {
  [key: string]: unknown
}

export interface RuntimeCheckpointRecord {
  id: string
  sessionId: string
  userId: string
  runId: string | null
  seq: number
  phase: string | null
  state: RuntimeSessionState
  createdAt: string
}

export interface RuntimeTraceRecord {
  id: string
  sessionId: string
  userId: string
  runId: string | null
  seq: number
  eventType: string
  phase: string | null
  traceId: string | null
  payload: RuntimeTraceEnvelope
  createdAt: string
}

export interface RuntimeSessionRecord {
  sessionId: string
  userId: string
  runId: string | null
  status: TuffIntelligenceRuntimeStatus
  phase: string | null
  objective: string | null
  history: unknown[] | null
  state: RuntimeSessionState | null
  pauseReason: TuffIntelligencePauseReason | null
  lastEventSeq: number
  lastTraceId: string | null
  lastHeartbeatAt: string | null
  lastCheckpointAt: string | null
  createdAt: string
  updatedAt: string
}

export interface UpsertRuntimeSessionInput {
  sessionId: string
  userId: string
  runId?: string | null
  status?: TuffIntelligenceRuntimeStatus
  phase?: string | null
  objective?: string | null
  history?: unknown[] | null
  state?: RuntimeSessionState | null
  pauseReason?: TuffIntelligencePauseReason | null
  lastEventSeq?: number
  lastTraceId?: string | null
  lastHeartbeatAt?: string | null
  lastCheckpointAt?: string | null
}

interface AppendTraceInput {
  sessionId: string
  userId: string
  runId?: string | null
  eventType: string
  phase?: string | null
  traceId?: string | null
  payload: RuntimeTraceEnvelope
  status?: TuffIntelligenceRuntimeStatus
}

interface SaveCheckpointInput {
  sessionId: string
  userId: string
  runId?: string | null
  seq: number
  phase?: string | null
  state: RuntimeSessionState
}

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

function requireDatabase(event: H3Event): D1Database {
  const db = getD1Database(event)
  if (!db) {
    throw new Error('Cloudflare D1 database is not available.')
  }
  return db
}

function safeParseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value)
    return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function safeStringify(value: unknown, fallback = '{}'): string {
  try {
    return JSON.stringify(value ?? {})
  } catch {
    return fallback
  }
}

function generateId(prefix: string): string {
  if (typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`
  }
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return `${prefix}_${Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')}`
}

function mapRuntimeSession(row: RuntimeSessionRow): RuntimeSessionRecord {
  return {
    sessionId: row.session_id,
    userId: row.user_id,
    runId: row.run_id,
    status: row.status as TuffIntelligenceRuntimeStatus,
    phase: row.phase,
    objective: row.objective,
    history: safeParseJson<unknown[] | null>(row.history_json, null),
    state: safeParseJson<RuntimeSessionState | null>(row.state_json, null),
    pauseReason: (row.pause_reason as TuffIntelligencePauseReason | null) ?? null,
    lastEventSeq: Number(row.last_event_seq || 0),
    lastTraceId: row.last_trace_id,
    lastHeartbeatAt: row.last_heartbeat_at,
    lastCheckpointAt: row.last_checkpoint_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapRuntimeTrace(row: RuntimeTraceRow): RuntimeTraceRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    runId: row.run_id,
    seq: Number(row.seq || 0),
    eventType: row.event_type,
    phase: row.phase,
    traceId: row.trace_id,
    payload: safeParseJson<RuntimeTraceEnvelope>(row.payload_json, {}),
    createdAt: row.created_at,
  }
}

function mapRuntimeCheckpoint(row: RuntimeCheckpointRow): RuntimeCheckpointRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    runId: row.run_id,
    seq: Number(row.seq || 0),
    phase: row.phase,
    state: safeParseJson<RuntimeSessionState>(row.state_json, {}),
    createdAt: row.created_at,
  }
}

async function ensureRuntimeSchema(db: D1Database) {
  if (runtimeSchemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${RUNTIME_SESSIONS_TABLE} (
      session_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      run_id TEXT,
      status TEXT NOT NULL,
      phase TEXT,
      objective TEXT,
      history_json TEXT,
      state_json TEXT,
      pause_reason TEXT,
      last_event_seq INTEGER NOT NULL DEFAULT 0,
      last_trace_id TEXT,
      last_heartbeat_at TEXT,
      last_checkpoint_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_intelligence_runtime_sessions_user_status
    ON ${RUNTIME_SESSIONS_TABLE}(user_id, status, updated_at);
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${RUNTIME_TRACE_TABLE} (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      run_id TEXT,
      seq INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      phase TEXT,
      trace_id TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_intelligence_runtime_trace_session_seq
    ON ${RUNTIME_TRACE_TABLE}(session_id, seq);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_intelligence_runtime_trace_session_created
    ON ${RUNTIME_TRACE_TABLE}(session_id, created_at);
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${RUNTIME_CHECKPOINTS_TABLE} (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      run_id TEXT,
      seq INTEGER NOT NULL,
      phase TEXT,
      state_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_intelligence_runtime_checkpoints_session_seq
    ON ${RUNTIME_CHECKPOINTS_TABLE}(session_id, seq DESC);
  `).run()

  runtimeSchemaInitialized = true
}

export async function getRuntimeSession(
  event: H3Event,
  userId: string,
  sessionId: string,
): Promise<RuntimeSessionRecord | null> {
  const db = requireDatabase(event)
  await ensureRuntimeSchema(db)
  const row = await db.prepare(`
    SELECT * FROM ${RUNTIME_SESSIONS_TABLE}
    WHERE session_id = ? AND user_id = ?
    LIMIT 1
  `).bind(sessionId, userId).first<RuntimeSessionRow>()
  return row ? mapRuntimeSession(row) : null
}

export async function upsertRuntimeSession(
  event: H3Event,
  input: UpsertRuntimeSessionInput,
): Promise<RuntimeSessionRecord> {
  const db = requireDatabase(event)
  await ensureRuntimeSchema(db)

  const existing = await getRuntimeSession(event, input.userId, input.sessionId)
  const now = new Date().toISOString()
  const createdAt = existing?.createdAt || now

  const merged: RuntimeSessionRecord = {
    sessionId: input.sessionId,
    userId: input.userId,
    runId: input.runId !== undefined ? (input.runId ?? null) : (existing?.runId ?? null),
    status: input.status ?? existing?.status ?? 'idle',
    phase: input.phase !== undefined ? (input.phase ?? null) : (existing?.phase ?? null),
    objective: input.objective !== undefined ? (input.objective ?? null) : (existing?.objective ?? null),
    history: input.history !== undefined ? (input.history ?? null) : (existing?.history ?? null),
    state: input.state !== undefined ? (input.state ?? null) : (existing?.state ?? null),
    pauseReason: input.pauseReason !== undefined ? (input.pauseReason ?? null) : (existing?.pauseReason ?? null),
    lastEventSeq: typeof input.lastEventSeq === 'number'
      ? input.lastEventSeq
      : (existing?.lastEventSeq ?? 0),
    lastTraceId: input.lastTraceId !== undefined ? (input.lastTraceId ?? null) : (existing?.lastTraceId ?? null),
    lastHeartbeatAt: input.lastHeartbeatAt !== undefined
      ? (input.lastHeartbeatAt ?? null)
      : (existing?.lastHeartbeatAt ?? now),
    lastCheckpointAt: input.lastCheckpointAt !== undefined
      ? (input.lastCheckpointAt ?? null)
      : (existing?.lastCheckpointAt ?? null),
    createdAt,
    updatedAt: now,
  }

  await db.prepare(`
    INSERT INTO ${RUNTIME_SESSIONS_TABLE}
      (session_id, user_id, run_id, status, phase, objective, history_json, state_json, pause_reason, last_event_seq, last_trace_id, last_heartbeat_at, last_checkpoint_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(session_id) DO UPDATE SET
      user_id = excluded.user_id,
      run_id = excluded.run_id,
      status = excluded.status,
      phase = excluded.phase,
      objective = excluded.objective,
      history_json = excluded.history_json,
      state_json = excluded.state_json,
      pause_reason = excluded.pause_reason,
      last_event_seq = excluded.last_event_seq,
      last_trace_id = excluded.last_trace_id,
      last_heartbeat_at = excluded.last_heartbeat_at,
      last_checkpoint_at = excluded.last_checkpoint_at,
      updated_at = excluded.updated_at
  `).bind(
    merged.sessionId,
    merged.userId,
    merged.runId,
    merged.status,
    merged.phase,
    merged.objective,
    merged.history ? safeStringify(merged.history, '[]') : null,
    merged.state ? safeStringify(merged.state) : null,
    merged.pauseReason,
    merged.lastEventSeq,
    merged.lastTraceId,
    merged.lastHeartbeatAt,
    merged.lastCheckpointAt,
    merged.createdAt,
    merged.updatedAt,
  ).run()

  return merged
}

export async function touchRuntimeSessionHeartbeat(
  event: H3Event,
  input: { sessionId: string, userId: string },
): Promise<RuntimeSessionRecord | null> {
  const now = new Date().toISOString()
  const session = await getRuntimeSession(event, input.userId, input.sessionId)
  if (!session)
    return null
  return await upsertRuntimeSession(event, {
    sessionId: input.sessionId,
    userId: input.userId,
    lastHeartbeatAt: now,
  })
}

export async function shouldPauseByHeartbeat(
  event: H3Event,
  input: { sessionId: string, userId: string, timeoutMs: number },
): Promise<{ shouldPause: boolean, lastHeartbeatAt: string | null }> {
  const session = await getRuntimeSession(event, input.userId, input.sessionId)
  if (!session)
    return { shouldPause: false, lastHeartbeatAt: null }
  if (!session.lastHeartbeatAt)
    return { shouldPause: false, lastHeartbeatAt: null }
  const elapsed = Date.now() - new Date(session.lastHeartbeatAt).getTime()
  return {
    shouldPause: elapsed > input.timeoutMs,
    lastHeartbeatAt: session.lastHeartbeatAt,
  }
}

export async function markRuntimeSessionPaused(
  event: H3Event,
  input: {
    sessionId: string
    userId: string
    pauseReason: TuffIntelligencePauseReason
  },
): Promise<RuntimeSessionRecord> {
  return await upsertRuntimeSession(event, {
    sessionId: input.sessionId,
    userId: input.userId,
    status: 'paused_disconnect',
    pauseReason: input.pauseReason,
  })
}

export async function appendRuntimeTraceEvent(
  event: H3Event,
  input: AppendTraceInput,
): Promise<RuntimeTraceRecord> {
  const db = requireDatabase(event)
  await ensureRuntimeSchema(db)

  const now = new Date().toISOString()
  const currentSession = await upsertRuntimeSession(event, {
    sessionId: input.sessionId,
    userId: input.userId,
    runId: input.runId ?? null,
    status: input.status,
    phase: input.phase ?? null,
  })

  const seq = (currentSession.lastEventSeq || 0) + 1
  const id = generateId('irte')
  const payloadJson = safeStringify(input.payload)

  await db.prepare(`
    INSERT INTO ${RUNTIME_TRACE_TABLE}
      (id, session_id, user_id, run_id, seq, event_type, phase, trace_id, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    input.sessionId,
    input.userId,
    input.runId ?? currentSession.runId ?? null,
    seq,
    input.eventType,
    input.phase ?? null,
    input.traceId ?? null,
    payloadJson,
    now,
  ).run()

  await upsertRuntimeSession(event, {
    sessionId: input.sessionId,
    userId: input.userId,
    runId: input.runId ?? currentSession.runId ?? null,
    status: input.status ?? currentSession.status,
    phase: input.phase ?? currentSession.phase,
    lastEventSeq: seq,
    lastTraceId: input.traceId ?? currentSession.lastTraceId,
  })

  return {
    id,
    sessionId: input.sessionId,
    userId: input.userId,
    runId: input.runId ?? currentSession.runId ?? null,
    seq,
    eventType: input.eventType,
    phase: input.phase ?? null,
    traceId: input.traceId ?? null,
    payload: safeParseJson<RuntimeTraceEnvelope>(payloadJson, {}),
    createdAt: now,
  }
}

export async function listRuntimeTraceEvents(
  event: H3Event,
  input: { sessionId: string, userId: string, fromSeq?: number, limit?: number },
): Promise<RuntimeTraceRecord[]> {
  const db = requireDatabase(event)
  await ensureRuntimeSchema(db)
  const fromSeq = Math.max(1, input.fromSeq ?? 1)
  const limit = Math.min(Math.max(input.limit ?? 200, 1), 1000)

  const { results } = await db.prepare(`
    SELECT * FROM ${RUNTIME_TRACE_TABLE}
    WHERE session_id = ? AND user_id = ? AND seq >= ?
    ORDER BY seq ASC
    LIMIT ?
  `).bind(input.sessionId, input.userId, fromSeq, limit).all<RuntimeTraceRow>()

  return (results || []).map(mapRuntimeTrace)
}

export async function saveRuntimeCheckpoint(
  event: H3Event,
  input: SaveCheckpointInput,
): Promise<RuntimeCheckpointRecord> {
  const db = requireDatabase(event)
  await ensureRuntimeSchema(db)
  const id = generateId('irtc')
  const now = new Date().toISOString()
  const stateJson = safeStringify(input.state)

  await db.prepare(`
    INSERT INTO ${RUNTIME_CHECKPOINTS_TABLE}
      (id, session_id, user_id, run_id, seq, phase, state_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    input.sessionId,
    input.userId,
    input.runId ?? null,
    input.seq,
    input.phase ?? null,
    stateJson,
    now,
  ).run()

  await upsertRuntimeSession(event, {
    sessionId: input.sessionId,
    userId: input.userId,
    runId: input.runId ?? null,
    state: safeParseJson<RuntimeSessionState>(stateJson, {}),
    lastCheckpointAt: now,
  })

  return {
    id,
    sessionId: input.sessionId,
    userId: input.userId,
    runId: input.runId ?? null,
    seq: input.seq,
    phase: input.phase ?? null,
    state: safeParseJson<RuntimeSessionState>(stateJson, {}),
    createdAt: now,
  }
}

export async function getLatestRuntimeCheckpoint(
  event: H3Event,
  input: { sessionId: string, userId: string },
): Promise<RuntimeCheckpointRecord | null> {
  const db = requireDatabase(event)
  await ensureRuntimeSchema(db)
  const row = await db.prepare(`
    SELECT * FROM ${RUNTIME_CHECKPOINTS_TABLE}
    WHERE session_id = ? AND user_id = ?
    ORDER BY seq DESC, created_at DESC
    LIMIT 1
  `).bind(input.sessionId, input.userId).first<RuntimeCheckpointRow>()
  return row ? mapRuntimeCheckpoint(row) : null
}

export async function listRuntimeSessions(
  event: H3Event,
  input: {
    userId: string
    limit?: number
    statuses?: TuffIntelligenceRuntimeStatus[]
  },
): Promise<RuntimeSessionRecord[]> {
  const db = requireDatabase(event)
  await ensureRuntimeSchema(db)
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 200)
  const statuses = Array.isArray(input.statuses)
    ? input.statuses.filter(Boolean)
    : []

  const queryBase = `
    SELECT * FROM ${RUNTIME_SESSIONS_TABLE}
    WHERE user_id = ?
  `
  if (statuses.length <= 0) {
    const { results } = await db.prepare(`
      ${queryBase}
      ORDER BY updated_at DESC
      LIMIT ?
    `).bind(input.userId, limit).all<RuntimeSessionRow>()
    return (results || []).map(mapRuntimeSession)
  }

  const placeholders = statuses.map(() => '?').join(', ')
  const statement = db.prepare(`
    ${queryBase}
      AND status IN (${placeholders})
    ORDER BY updated_at DESC
    LIMIT ?
  `)
  const binds: Array<string | number> = [input.userId, ...statuses, limit]
  const { results } = await statement.bind(...binds).all<RuntimeSessionRow>()
  return (results || []).map(mapRuntimeSession)
}
