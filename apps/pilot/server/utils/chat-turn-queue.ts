import type { H3Event } from 'h3'
import { requirePilotDatabase } from './pilot-store'

export type ChatTurnStatus
  = | 'pending'
    | 'accepted'
    | 'executing'
    | 'title'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'timeout'

export type ChatRunState
  = | 'idle'
    | 'queued'
    | 'executing'
    | 'title'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'timeout'

export interface SessionRunStateSnapshot {
  runState: ChatRunState
  activeTurnId: string | null
  pendingCount: number
}

export interface ChatTurnQueueRow {
  id: number
  sessionId: string
  userId: string
  requestId: string
  turnId: string
  turnNo: number
  model: string
  payload: string
  status: ChatTurnStatus
  responseText: string
  errorText: string
  createdAt: string
  updatedAt: string
}

const CHAT_TURN_QUEUE_TABLE = 'pilot_chat_turn_queue'
const SESSION_LOCK_OWNERS = new Map<string, string>()
const ACTIVE_STATUSES_SQL = `'pending','accepted','executing','title'`

function nowIso(): string {
  return new Date().toISOString()
}

function mapQueueRow(row: {
  id: number
  session_id: string
  user_id: string
  request_id: string
  turn_id: string
  turn_no: number
  model: string
  payload: string
  status: string
  response_text: string | null
  error_text: string | null
  created_at: string
  updated_at: string
}): ChatTurnQueueRow {
  return {
    id: Number(row.id || 0),
    sessionId: row.session_id,
    userId: row.user_id,
    requestId: row.request_id,
    turnId: row.turn_id,
    turnNo: Number(row.turn_no || 0),
    model: String(row.model || ''),
    payload: String(row.payload || ''),
    status: String(row.status || 'pending') as ChatTurnStatus,
    responseText: String(row.response_text || ''),
    errorText: String(row.error_text || ''),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function randomTurnId(prefix: 'request' | 'turn'): string {
  if (prefix === 'request') {
    return `req-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString().slice(-6)}`
  }
  return `turn-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString().slice(-6)}`
}

export async function ensureChatTurnQueueSchema(event: H3Event): Promise<void> {
  const db = requirePilotDatabase(event)

  const createTableSqlList = [
    `
      CREATE TABLE IF NOT EXISTS ${CHAT_TURN_QUEUE_TABLE} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        turn_no INTEGER NOT NULL,
        model TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL,
        response_text TEXT,
        error_text TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(session_id, user_id, request_id)
      );
    `,
    `
      CREATE TABLE IF NOT EXISTS ${CHAT_TURN_QUEUE_TABLE} (
        id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        request_id TEXT NOT NULL,
        turn_id TEXT NOT NULL,
        turn_no INTEGER NOT NULL,
        model TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL,
        response_text TEXT,
        error_text TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(session_id, user_id, request_id)
      );
    `,
  ]

  let tableReady = false
  let lastError: unknown = null
  for (const sql of createTableSqlList) {
    try {
      await db.prepare(sql).run()
      tableReady = true
      break
    }
    catch (error) {
      lastError = error
    }
  }

  if (!tableReady) {
    throw lastError instanceof Error ? lastError : new Error('Failed to create chat turn queue table')
  }

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_turn_queue_session_status_created
    ON ${CHAT_TURN_QUEUE_TABLE}(session_id, user_id, status, id ASC);
  `).run()
}

export async function countSessionActiveTurns(
  event: H3Event,
  userId: string,
  sessionId: string,
): Promise<number> {
  const db = requirePilotDatabase(event)
  const row = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM ${CHAT_TURN_QUEUE_TABLE}
    WHERE user_id = ?1
      AND session_id = ?2
      AND status IN (${ACTIVE_STATUSES_SQL})
  `).bind(userId, sessionId).first<{ total?: number | string }>()

  return Number(row?.total || 0)
}

export async function countSessionTurns(
  event: H3Event,
  userId: string,
  sessionId: string,
): Promise<number> {
  const db = requirePilotDatabase(event)
  const row = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM ${CHAT_TURN_QUEUE_TABLE}
    WHERE user_id = ?1
      AND session_id = ?2
  `).bind(userId, sessionId).first<{ total?: number | string }>()

  return Number(row?.total || 0)
}

export async function enqueueChatTurn(
  event: H3Event,
  input: {
    sessionId: string
    userId: string
    requestId: string
    turnId: string
    turnNo: number
    model: string
    payload: string
  },
): Promise<{ row: ChatTurnQueueRow, queuePos: number }> {
  await ensureChatTurnQueueSchema(event)
  const db = requirePilotDatabase(event)
  const now = nowIso()
  const queuePos = await countSessionActiveTurns(event, input.userId, input.sessionId)

  await db.prepare(`
    INSERT INTO ${CHAT_TURN_QUEUE_TABLE}
      (session_id, user_id, request_id, turn_id, turn_no, model, payload, status, response_text, error_text, created_at, updated_at)
    VALUES
      (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending', '', '', ?8, ?8)
  `).bind(
    input.sessionId,
    input.userId,
    input.requestId,
    input.turnId,
    input.turnNo,
    input.model,
    input.payload,
    now,
  ).run()

  const row = await getChatTurnByRequestId(event, input.userId, input.sessionId, input.requestId)
  if (!row) {
    throw new Error('Failed to read queued turn')
  }

  return {
    row,
    queuePos,
  }
}

export async function getChatTurnByRequestId(
  event: H3Event,
  userId: string,
  sessionId: string,
  requestId: string,
): Promise<ChatTurnQueueRow | null> {
  const db = requirePilotDatabase(event)
  const row = await db.prepare(`
    SELECT id, session_id, user_id, request_id, turn_id, turn_no, model, payload, status, response_text, error_text, created_at, updated_at
    FROM ${CHAT_TURN_QUEUE_TABLE}
    WHERE user_id = ?1
      AND session_id = ?2
      AND request_id = ?3
    LIMIT 1
  `).bind(userId, sessionId, requestId).first<{
    id: number
    session_id: string
    user_id: string
    request_id: string
    turn_id: string
    turn_no: number
    model: string
    payload: string
    status: string
    response_text: string | null
    error_text: string | null
    created_at: string
    updated_at: string
  }>()

  return row ? mapQueueRow(row) : null
}

export async function getQueuePosition(
  event: H3Event,
  userId: string,
  sessionId: string,
  requestId: string,
): Promise<number> {
  const db = requirePilotDatabase(event)
  const row = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM ${CHAT_TURN_QUEUE_TABLE}
    WHERE user_id = ?1
      AND session_id = ?2
      AND status IN (${ACTIVE_STATUSES_SQL})
      AND id < (
        SELECT id
        FROM ${CHAT_TURN_QUEUE_TABLE}
        WHERE user_id = ?1 AND session_id = ?2 AND request_id = ?3
        LIMIT 1
      )
  `).bind(userId, sessionId, requestId).first<{ total?: number | string }>()

  return Number(row?.total || 0)
}

export async function pickSessionHeadTurn(
  event: H3Event,
  userId: string,
  sessionId: string,
): Promise<ChatTurnQueueRow | null> {
  const db = requirePilotDatabase(event)
  const row = await db.prepare(`
    SELECT id, session_id, user_id, request_id, turn_id, turn_no, model, payload, status, response_text, error_text, created_at, updated_at
    FROM ${CHAT_TURN_QUEUE_TABLE}
    WHERE user_id = ?1
      AND session_id = ?2
      AND status IN ('pending','accepted')
    ORDER BY id ASC
    LIMIT 1
  `).bind(userId, sessionId).first<{
    id: number
    session_id: string
    user_id: string
    request_id: string
    turn_id: string
    turn_no: number
    model: string
    payload: string
    status: string
    response_text: string | null
    error_text: string | null
    created_at: string
    updated_at: string
  }>()

  return row ? mapQueueRow(row) : null
}

export async function updateChatTurnStatus(
  event: H3Event,
  userId: string,
  sessionId: string,
  requestId: string,
  status: ChatTurnStatus,
  patch: {
    responseText?: string
    errorText?: string
  } = {},
): Promise<void> {
  const db = requirePilotDatabase(event)
  const now = nowIso()
  await db.prepare(`
    UPDATE ${CHAT_TURN_QUEUE_TABLE}
    SET status = ?1,
        response_text = ?2,
        error_text = ?3,
        updated_at = ?4
    WHERE user_id = ?5
      AND session_id = ?6
      AND request_id = ?7
  `).bind(
    status,
    String(patch.responseText || ''),
    String(patch.errorText || ''),
    now,
    userId,
    sessionId,
    requestId,
  ).run()
}

export async function getSessionRunState(
  event: H3Event,
  userId: string,
  sessionId: string,
): Promise<SessionRunStateSnapshot> {
  const db = requirePilotDatabase(event)

  const active = await db.prepare(`
    SELECT turn_id, status
    FROM ${CHAT_TURN_QUEUE_TABLE}
    WHERE user_id = ?1
      AND session_id = ?2
      AND status IN (${ACTIVE_STATUSES_SQL})
    ORDER BY id ASC
    LIMIT 1
  `).bind(userId, sessionId).first<{ turn_id?: string, status?: string }>()

  const pendingCountRow = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM ${CHAT_TURN_QUEUE_TABLE}
    WHERE user_id = ?1
      AND session_id = ?2
      AND status IN ('pending','accepted')
  `).bind(userId, sessionId).first<{ total?: number | string }>()

  const pendingCount = Number(pendingCountRow?.total || 0)

  if (active?.turn_id) {
    const status = String(active.status || '')
    if (status === 'title') {
      return {
        runState: 'title',
        activeTurnId: String(active.turn_id),
        pendingCount,
      }
    }
    if (status === 'executing') {
      return {
        runState: 'executing',
        activeTurnId: String(active.turn_id),
        pendingCount,
      }
    }
    return {
      runState: 'queued',
      activeTurnId: String(active.turn_id),
      pendingCount,
    }
  }

  const latest = await db.prepare(`
    SELECT status
    FROM ${CHAT_TURN_QUEUE_TABLE}
    WHERE user_id = ?1
      AND session_id = ?2
    ORDER BY id DESC
    LIMIT 1
  `).bind(userId, sessionId).first<{ status?: string }>()

  const latestStatus = String(latest?.status || '')
  if (latestStatus === 'completed') {
    return { runState: 'completed', activeTurnId: null, pendingCount }
  }
  if (latestStatus === 'failed') {
    return { runState: 'failed', activeTurnId: null, pendingCount }
  }
  if (latestStatus === 'cancelled') {
    return { runState: 'cancelled', activeTurnId: null, pendingCount }
  }
  if (latestStatus === 'timeout') {
    return { runState: 'timeout', activeTurnId: null, pendingCount }
  }

  return { runState: 'idle', activeTurnId: null, pendingCount }
}

function buildSessionStateFromRows(input: {
  activeStatus?: string | null
  activeTurnId?: string | null
  latestStatus?: string | null
  pendingCount?: number
}): SessionRunStateSnapshot {
  const pendingCount = Number.isFinite(input.pendingCount)
    ? Math.max(0, Math.floor(Number(input.pendingCount)))
    : 0
  const activeStatus = String(input.activeStatus || '').trim()
  const activeTurnId = String(input.activeTurnId || '').trim()

  if (activeTurnId) {
    if (activeStatus === 'title') {
      return {
        runState: 'title',
        activeTurnId,
        pendingCount,
      }
    }
    if (activeStatus === 'executing') {
      return {
        runState: 'executing',
        activeTurnId,
        pendingCount,
      }
    }
    return {
      runState: 'queued',
      activeTurnId,
      pendingCount,
    }
  }

  const latestStatus = String(input.latestStatus || '').trim()
  if (latestStatus === 'completed') {
    return { runState: 'completed', activeTurnId: null, pendingCount }
  }
  if (latestStatus === 'failed') {
    return { runState: 'failed', activeTurnId: null, pendingCount }
  }
  if (latestStatus === 'cancelled') {
    return { runState: 'cancelled', activeTurnId: null, pendingCount }
  }
  if (latestStatus === 'timeout') {
    return { runState: 'timeout', activeTurnId: null, pendingCount }
  }

  return { runState: 'idle', activeTurnId: null, pendingCount }
}

export async function getSessionRunStateMap(
  event: H3Event,
  userId: string,
  sessionIds: string[],
): Promise<Map<string, SessionRunStateSnapshot>> {
  const uniqueSessionIds = Array.from(new Set(sessionIds.map(id => String(id || '').trim()).filter(Boolean)))
  if (uniqueSessionIds.length <= 0) {
    return new Map()
  }

  const db = requirePilotDatabase(event)
  const placeholders = uniqueSessionIds.map((_, index) => `?${index + 2}`).join(',')
  const bindings = [userId, ...uniqueSessionIds]

  const activeRows = await db.prepare(`
    SELECT session_id, turn_id, status, id
    FROM ${CHAT_TURN_QUEUE_TABLE}
    WHERE user_id = ?1
      AND session_id IN (${placeholders})
      AND status IN (${ACTIVE_STATUSES_SQL})
    ORDER BY session_id ASC, id ASC
  `).bind(...bindings).all<{
    session_id: string
    turn_id: string | null
    status: string | null
    id: number
  }>()

  const activeMap = new Map<string, { turnId: string | null, status: string | null }>()
  for (const row of activeRows.results || []) {
    if (!activeMap.has(row.session_id)) {
      activeMap.set(row.session_id, {
        turnId: row.turn_id,
        status: row.status,
      })
    }
  }

  const pendingRows = await db.prepare(`
    SELECT session_id, COUNT(*) AS total
    FROM ${CHAT_TURN_QUEUE_TABLE}
    WHERE user_id = ?1
      AND session_id IN (${placeholders})
      AND status IN ('pending','accepted')
    GROUP BY session_id
  `).bind(...bindings).all<{
    session_id: string
    total: number | string
  }>()

  const pendingMap = new Map<string, number>()
  for (const row of pendingRows.results || []) {
    pendingMap.set(row.session_id, Number(row.total || 0))
  }

  const latestRows = await db.prepare(`
    SELECT session_id, status, id
    FROM ${CHAT_TURN_QUEUE_TABLE}
    WHERE user_id = ?1
      AND session_id IN (${placeholders})
    ORDER BY session_id ASC, id DESC
  `).bind(...bindings).all<{
    session_id: string
    status: string | null
    id: number
  }>()

  const latestMap = new Map<string, string | null>()
  for (const row of latestRows.results || []) {
    if (!latestMap.has(row.session_id)) {
      latestMap.set(row.session_id, row.status)
    }
  }

  const stateMap = new Map<string, SessionRunStateSnapshot>()
  for (const sessionId of uniqueSessionIds) {
    const active = activeMap.get(sessionId)
    stateMap.set(sessionId, buildSessionStateFromRows({
      activeStatus: active?.status,
      activeTurnId: active?.turnId,
      latestStatus: latestMap.get(sessionId),
      pendingCount: pendingMap.get(sessionId) ?? 0,
    }))
  }

  return stateMap
}

export async function getSessionRunStateSafe(
  event: H3Event,
  userId: string,
  sessionId: string,
): Promise<SessionRunStateSnapshot> {
  try {
    await ensureChatTurnQueueSchema(event)
    return await getSessionRunState(event, userId, sessionId)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error || '')
    console.error('[pilot][turn-queue] run_state fallback to idle', {
      userId,
      sessionId,
      error: message,
    })
    return buildSessionStateFromRows({})
  }
}

export async function getSessionRunStateMapSafe(
  event: H3Event,
  userId: string,
  sessionIds: string[],
): Promise<Map<string, SessionRunStateSnapshot>> {
  try {
    await ensureChatTurnQueueSchema(event)
    return await getSessionRunStateMap(event, userId, sessionIds)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error || '')
    console.error('[pilot][turn-queue] run_state map fallback to idle', {
      userId,
      count: sessionIds.length,
      error: message,
    })

    const fallback = new Map<string, SessionRunStateSnapshot>()
    for (const sessionId of Array.from(new Set(sessionIds.map(id => String(id || '').trim()).filter(Boolean)))) {
      fallback.set(sessionId, buildSessionStateFromRows({}))
    }
    return fallback
  }
}

export function tryAcquireSessionExecutionLock(sessionId: string, owner: string): boolean {
  const currentOwner = SESSION_LOCK_OWNERS.get(sessionId)
  if (!currentOwner || currentOwner === owner) {
    SESSION_LOCK_OWNERS.set(sessionId, owner)
    return true
  }
  return false
}

export function releaseSessionExecutionLock(sessionId: string, owner: string): void {
  const currentOwner = SESSION_LOCK_OWNERS.get(sessionId)
  if (currentOwner === owner) {
    SESSION_LOCK_OWNERS.delete(sessionId)
  }
}
