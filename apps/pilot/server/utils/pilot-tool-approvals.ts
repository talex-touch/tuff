import type { H3Event } from 'h3'
import { requirePilotDatabase } from './pilot-store'

const TOOL_APPROVALS_TABLE = 'pilot_tool_approvals'

export type PilotToolRiskLevel = 'low' | 'medium' | 'high' | 'critical'
export type PilotToolApprovalStatus = 'pending' | 'approved' | 'rejected'

export interface PilotToolApprovalTicket {
  ticketId: string
  sessionId: string
  userId: string
  requestId: string
  requestHash: string
  callId: string
  toolId: string
  toolName: string
  riskLevel: PilotToolRiskLevel
  status: PilotToolApprovalStatus
  reason?: string
  decisionReason?: string
  inputPreview?: string
  outputPreview?: string
  sources: Array<Record<string, unknown>>
  errorCode?: string
  errorMessage?: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
  decidedAt?: string
}

interface DbTicketRow {
  ticket_id: string
  session_id: string
  user_id: string
  request_id: string
  request_hash: string
  call_id: string
  tool_id: string
  tool_name: string
  risk_level: string
  status: string
  reason: string | null
  decision_reason: string | null
  input_preview: string | null
  output_preview: string | null
  sources_json: string | null
  error_code: string | null
  error_message: string | null
  metadata_json: string | null
  created_at: string
  updated_at: string
  decided_at: string | null
}

function nowIso(): string {
  return new Date().toISOString()
}

function randomId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function normalizeText(value: unknown): string {
  return String(value || '').trim()
}

function parseJsonRecord(value: string | null | undefined): Record<string, unknown> {
  if (!value) {
    return {}
  }
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {}
  }
  catch {
    return {}
  }
}

function parseJsonList(value: string | null | undefined): Array<Record<string, unknown>> {
  if (!value) {
    return []
  }
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .filter(item => item && typeof item === 'object' && !Array.isArray(item))
      .map(item => item as Record<string, unknown>)
  }
  catch {
    return []
  }
}

function toTicketRow(row: DbTicketRow): PilotToolApprovalTicket {
  return {
    ticketId: row.ticket_id,
    sessionId: row.session_id,
    userId: row.user_id,
    requestId: row.request_id,
    requestHash: row.request_hash,
    callId: row.call_id,
    toolId: row.tool_id,
    toolName: row.tool_name,
    riskLevel: normalizeText(row.risk_level) as PilotToolRiskLevel,
    status: normalizeText(row.status) as PilotToolApprovalStatus,
    reason: row.reason || undefined,
    decisionReason: row.decision_reason || undefined,
    inputPreview: row.input_preview || undefined,
    outputPreview: row.output_preview || undefined,
    sources: parseJsonList(row.sources_json),
    errorCode: row.error_code || undefined,
    errorMessage: row.error_message || undefined,
    metadata: parseJsonRecord(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    decidedAt: row.decided_at || undefined,
  }
}

export async function ensurePilotToolApprovalSchema(event: H3Event): Promise<void> {
  const db = requirePilotDatabase(event)
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${TOOL_APPROVALS_TABLE} (
      ticket_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      call_id TEXT NOT NULL,
      tool_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      risk_level TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT,
      decision_reason TEXT,
      input_preview TEXT,
      output_preview TEXT,
      sources_json TEXT,
      error_code TEXT,
      error_message TEXT,
      metadata_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      decided_at TEXT
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_pilot_tool_approvals_session_status
    ON ${TOOL_APPROVALS_TABLE}(session_id, user_id, status, updated_at DESC);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_pilot_tool_approvals_request_hash
    ON ${TOOL_APPROVALS_TABLE}(session_id, user_id, request_hash, updated_at DESC);
  `).run()
}

export async function createPilotToolApprovalTicket(event: H3Event, input: {
  sessionId: string
  userId: string
  requestId: string
  requestHash: string
  callId: string
  toolId: string
  toolName: string
  riskLevel: PilotToolRiskLevel
  reason?: string
  inputPreview?: string
  metadata?: Record<string, unknown>
}): Promise<PilotToolApprovalTicket> {
  await ensurePilotToolApprovalSchema(event)
  const db = requirePilotDatabase(event)
  const now = nowIso()
  const ticketId = randomId('tool_ticket')

  await db.prepare(`
    INSERT INTO ${TOOL_APPROVALS_TABLE}
      (
        ticket_id, session_id, user_id, request_id, request_hash,
        call_id, tool_id, tool_name, risk_level, status,
        reason, decision_reason, input_preview, output_preview,
        sources_json, error_code, error_message, metadata_json,
        created_at, updated_at, decided_at
      )
    VALUES
      (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'pending', ?10, NULL, ?11, NULL, '[]', NULL, NULL, ?12, ?13, ?13, NULL)
  `).bind(
    ticketId,
    input.sessionId,
    input.userId,
    input.requestId,
    input.requestHash,
    input.callId,
    input.toolId,
    input.toolName,
    input.riskLevel,
    input.reason || null,
    input.inputPreview || null,
    JSON.stringify(input.metadata || {}),
    now,
  ).run()

  const created = await getPilotToolApprovalTicket(event, {
    sessionId: input.sessionId,
    userId: input.userId,
    ticketId,
  })
  if (!created) {
    throw new Error('Failed to create tool approval ticket')
  }
  return created
}

export async function getPilotToolApprovalTicket(event: H3Event, input: {
  sessionId: string
  userId: string
  ticketId: string
}): Promise<PilotToolApprovalTicket | null> {
  await ensurePilotToolApprovalSchema(event)
  const db = requirePilotDatabase(event)
  const row = await db.prepare(`
    SELECT
      ticket_id, session_id, user_id, request_id, request_hash, call_id, tool_id, tool_name,
      risk_level, status, reason, decision_reason, input_preview, output_preview, sources_json,
      error_code, error_message, metadata_json, created_at, updated_at, decided_at
    FROM ${TOOL_APPROVALS_TABLE}
    WHERE session_id = ?1
      AND user_id = ?2
      AND ticket_id = ?3
    LIMIT 1
  `).bind(
    input.sessionId,
    input.userId,
    input.ticketId,
  ).first<DbTicketRow>()

  return row ? toTicketRow(row) : null
}

export async function findLatestPilotToolApprovalByRequestHash(event: H3Event, input: {
  sessionId: string
  userId: string
  requestHash: string
}): Promise<PilotToolApprovalTicket | null> {
  await ensurePilotToolApprovalSchema(event)
  const db = requirePilotDatabase(event)
  const row = await db.prepare(`
    SELECT
      ticket_id, session_id, user_id, request_id, request_hash, call_id, tool_id, tool_name,
      risk_level, status, reason, decision_reason, input_preview, output_preview, sources_json,
      error_code, error_message, metadata_json, created_at, updated_at, decided_at
    FROM ${TOOL_APPROVALS_TABLE}
    WHERE session_id = ?1
      AND user_id = ?2
      AND request_hash = ?3
    ORDER BY updated_at DESC
    LIMIT 1
  `).bind(
    input.sessionId,
    input.userId,
    input.requestHash,
  ).first<DbTicketRow>()

  return row ? toTicketRow(row) : null
}

export async function listPilotToolApprovals(event: H3Event, input: {
  sessionId: string
  userId: string
  status?: PilotToolApprovalStatus
  limit?: number
}): Promise<PilotToolApprovalTicket[]> {
  await ensurePilotToolApprovalSchema(event)
  const db = requirePilotDatabase(event)
  const limit = Math.min(Math.max(Number(input.limit || 50), 1), 200)
  const status = normalizeText(input.status)
  const useStatus = status === 'pending' || status === 'approved' || status === 'rejected'

  const sql = useStatus
    ? `
      SELECT
        ticket_id, session_id, user_id, request_id, request_hash, call_id, tool_id, tool_name,
        risk_level, status, reason, decision_reason, input_preview, output_preview, sources_json,
        error_code, error_message, metadata_json, created_at, updated_at, decided_at
      FROM ${TOOL_APPROVALS_TABLE}
      WHERE session_id = ?1
        AND user_id = ?2
        AND status = ?3
      ORDER BY updated_at DESC
      LIMIT ?4
    `
    : `
      SELECT
        ticket_id, session_id, user_id, request_id, request_hash, call_id, tool_id, tool_name,
        risk_level, status, reason, decision_reason, input_preview, output_preview, sources_json,
        error_code, error_message, metadata_json, created_at, updated_at, decided_at
      FROM ${TOOL_APPROVALS_TABLE}
      WHERE session_id = ?1
        AND user_id = ?2
      ORDER BY updated_at DESC
      LIMIT ?3
    `

  const query = useStatus
    ? db.prepare(sql).bind(input.sessionId, input.userId, status, limit)
    : db.prepare(sql).bind(input.sessionId, input.userId, limit)
  const { results } = await query.all<DbTicketRow>()

  return (results || []).map(row => toTicketRow(row))
}

export async function decidePilotToolApproval(event: H3Event, input: {
  sessionId: string
  userId: string
  ticketId: string
  approved: boolean
  reason?: string
}): Promise<PilotToolApprovalTicket | null> {
  await ensurePilotToolApprovalSchema(event)
  const db = requirePilotDatabase(event)
  const now = nowIso()
  const status: PilotToolApprovalStatus = input.approved ? 'approved' : 'rejected'
  await db.prepare(`
    UPDATE ${TOOL_APPROVALS_TABLE}
    SET status = ?1,
        decision_reason = ?2,
        decided_at = ?3,
        updated_at = ?3
    WHERE session_id = ?4
      AND user_id = ?5
      AND ticket_id = ?6
  `).bind(
    status,
    normalizeText(input.reason) || null,
    now,
    input.sessionId,
    input.userId,
    input.ticketId,
  ).run()

  return await getPilotToolApprovalTicket(event, {
    sessionId: input.sessionId,
    userId: input.userId,
    ticketId: input.ticketId,
  })
}

export async function updatePilotToolApprovalTicketResult(event: H3Event, input: {
  sessionId: string
  userId: string
  ticketId: string
  outputPreview?: string
  sources?: Array<Record<string, unknown>>
  errorCode?: string
  errorMessage?: string
}): Promise<void> {
  await ensurePilotToolApprovalSchema(event)
  const db = requirePilotDatabase(event)
  const now = nowIso()
  await db.prepare(`
    UPDATE ${TOOL_APPROVALS_TABLE}
    SET output_preview = COALESCE(?1, output_preview),
        sources_json = COALESCE(?2, sources_json),
        error_code = COALESCE(?3, error_code),
        error_message = COALESCE(?4, error_message),
        updated_at = ?5
    WHERE session_id = ?6
      AND user_id = ?7
      AND ticket_id = ?8
  `).bind(
    normalizeText(input.outputPreview) || null,
    Array.isArray(input.sources) ? JSON.stringify(input.sources) : null,
    normalizeText(input.errorCode) || null,
    normalizeText(input.errorMessage) || null,
    now,
    input.sessionId,
    input.userId,
    input.ticketId,
  ).run()
}
