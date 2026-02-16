import type { D1Database } from '@cloudflare/workers-types'
import { Buffer } from 'node:buffer'
import { createHash, randomBytes, randomUUID } from 'node:crypto'

const DOC_VIEWS_TABLE = 'doc_views'
const DOC_VIEWS_DAILY_TABLE = 'doc_views_daily'
const DOC_SECTION_TABLE = 'doc_section_stats'
const DOC_SECTION_DAILY_TABLE = 'doc_section_stats_daily'
const DOC_ACTION_TABLE = 'doc_action_stats'
const DOC_ACTION_DAILY_TABLE = 'doc_action_stats_daily'
const DOC_SESSION_TABLE = 'doc_engagement_sessions'
const DOC_NONCE_TABLE = 'doc_engagement_nonces'
const DOC_CHALLENGE_TABLE = 'doc_engagement_challenges'
const DOC_SECURITY_TABLE = 'doc_analytics_security'

const BASE_BLOCK_MS = 10 * 60_000
const MAX_BLOCK_MS = 24 * 60 * 60_000

const TOKEN_TTL_SECONDS = 15 * 60

let analyticsSchemaInitialized = false

export interface DocTokenPayload {
  typ: 'doc'
  sid: string
  path: string
  cid: string
  rl: number
  iat: number
  exp: number
}

export interface DocSecurityState {
  violationCount: number
  riskLevel: number
  blockedUntil: number | null
}

export interface DocEngagementSession {
  sessionId: string
  path: string
  clientId: string
  ip: string | null
  riskLevel: number
  issuedAt: number
  expectReportAt: number
  reportedAt: number | null
  status: string
  challengeId: string | null
}

export interface DocEngagementChallenge {
  challengeId: string
  sessionId: string
  seed: string
  difficulty: number
  createdAt: number
  expiresAt: number
}

export interface DocEngagementSectionInput {
  id: string
  title: string
  activeMs: number
  totalMs: number
}

export interface DocEngagementActionInput {
  type: string
  source: string
  sectionId: string
  sectionTitle: string
  count: number
}

function normalizeString(value: unknown, maxLength: number): string {
  if (typeof value !== 'string')
    return ''
  const trimmed = value.trim()
  if (!trimmed)
    return ''
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

export function normalizeDocPath(path: string): string {
  return path.replace(/^\/+|\/+$/g, '').toLowerCase()
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value)

  if (Array.isArray(value))
    return `[${value.map(stableSerialize).join(',')}]`

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  )

  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(',')}}`
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = padded.length % 4
  const normalized = padding ? padded + '='.repeat(4 - padding) : padded
  return Buffer.from(normalized, 'base64').toString('utf8')
}

function getDocTokenSecret(): string {
  const config = useRuntimeConfig()
  const candidates = [
    config.appAuthJwtSecret,
    config.auth?.secret,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length >= 16)
      return candidate
  }

  return base64UrlEncode(randomBytes(32).toString('hex'))
}

export function createDocToken(payload: Omit<DocTokenPayload, 'iat' | 'exp' | 'typ'>, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000)
  const exp = issuedAt + TOKEN_TTL_SECONDS
  const tokenPayload: DocTokenPayload = {
    typ: 'doc',
    sid: payload.sid,
    path: payload.path,
    cid: payload.cid,
    rl: payload.rl,
    iat: issuedAt,
    exp,
  }
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64UrlEncode(JSON.stringify(tokenPayload))
  const signingInput = `${header}.${body}`
  const signature = createHash('sha256').update(`${signingInput}.${getDocTokenSecret()}`).digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
  return `${signingInput}.${signature}`
}

export function verifyDocToken(token: string): DocTokenPayload | null {
  if (!token)
    return null
  const parts = token.split('.')
  if (parts.length !== 3)
    return null
  const [headerPart, payloadPart, signaturePart] = parts
  if (!headerPart || !payloadPart || !signaturePart)
    return null

  try {
    const signingInput = `${headerPart}.${payloadPart}`
    const expectedSignature = createHash('sha256').update(`${signingInput}.${getDocTokenSecret()}`).digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
    if (signaturePart.length !== expectedSignature.length)
      return null
    if (signaturePart !== expectedSignature)
      return null

    const payload = JSON.parse(base64UrlDecode(payloadPart)) as DocTokenPayload
    if (payload.typ !== 'doc')
      return null
    if (!payload.sid || !payload.path || !payload.cid)
      return null
    if (payload.exp <= Math.floor(Date.now() / 1000))
      return null
    return payload
  }
  catch {
    return null
  }
}

function resolveRiskLevel(violationCount: number): number {
  if (violationCount >= 4)
    return 2
  if (violationCount >= 2)
    return 1
  return 0
}

function computeBlockMs(violationCount: number): number {
  const exp = Math.min(10, Math.max(0, violationCount - 1))
  return Math.min(BASE_BLOCK_MS * 2 ** exp, MAX_BLOCK_MS)
}

async function ensureDocViewsColumns(db: D1Database) {
  const { results } = await db.prepare(`PRAGMA table_info(${DOC_VIEWS_TABLE});`).all<{ name?: string }>()
  const columns = new Set((results ?? []).map(item => item.name).filter(Boolean) as string[])
  const addColumn = async (name: string, ddl: string) => {
    if (!columns.has(name))
      await db.prepare(`ALTER TABLE ${DOC_VIEWS_TABLE} ADD COLUMN ${ddl};`).run()
  }
  await addColumn('title', 'title TEXT')
  await addColumn('session_count', 'session_count INTEGER NOT NULL DEFAULT 0')
  await addColumn('active_ms', 'active_ms INTEGER NOT NULL DEFAULT 0')
  await addColumn('total_ms', 'total_ms INTEGER NOT NULL DEFAULT 0')
  await addColumn('copy_count', 'copy_count INTEGER NOT NULL DEFAULT 0')
  await addColumn('select_count', 'select_count INTEGER NOT NULL DEFAULT 0')
  await addColumn('last_view_at', 'last_view_at INTEGER')
  await addColumn('last_read_at', 'last_read_at INTEGER')
}

async function ensureSessionColumns(db: D1Database) {
  const { results } = await db.prepare(`PRAGMA table_info(${DOC_SESSION_TABLE});`).all<{ name?: string }>()
  const columns = new Set((results ?? []).map(item => item.name).filter(Boolean) as string[])
  const addColumn = async (name: string, ddl: string) => {
    if (!columns.has(name))
      await db.prepare(`ALTER TABLE ${DOC_SESSION_TABLE} ADD COLUMN ${ddl};`).run()
  }
  await addColumn('challenge_id', 'challenge_id TEXT')
}

export async function ensureDocAnalyticsSchema(db: D1Database) {
  if (analyticsSchemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${DOC_VIEWS_TABLE} (
      path TEXT PRIMARY KEY,
      title TEXT,
      views INTEGER NOT NULL DEFAULT 0,
      session_count INTEGER NOT NULL DEFAULT 0,
      active_ms INTEGER NOT NULL DEFAULT 0,
      total_ms INTEGER NOT NULL DEFAULT 0,
      copy_count INTEGER NOT NULL DEFAULT 0,
      select_count INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL,
      last_view_at INTEGER,
      last_read_at INTEGER
    );
  `).run()

  await ensureDocViewsColumns(db)

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${DOC_VIEWS_DAILY_TABLE} (
      date TEXT NOT NULL,
      path TEXT NOT NULL,
      title TEXT,
      views INTEGER NOT NULL DEFAULT 0,
      session_count INTEGER NOT NULL DEFAULT 0,
      active_ms INTEGER NOT NULL DEFAULT 0,
      total_ms INTEGER NOT NULL DEFAULT 0,
      copy_count INTEGER NOT NULL DEFAULT 0,
      select_count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (date, path)
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${DOC_SECTION_TABLE} (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      section_id TEXT NOT NULL,
      section_title TEXT,
      view_count INTEGER NOT NULL DEFAULT 0,
      active_ms INTEGER NOT NULL DEFAULT 0,
      total_ms INTEGER NOT NULL DEFAULT 0,
      last_read_at INTEGER
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${DOC_SECTION_DAILY_TABLE} (
      date TEXT NOT NULL,
      path TEXT NOT NULL,
      section_id TEXT NOT NULL,
      section_title TEXT,
      view_count INTEGER NOT NULL DEFAULT 0,
      active_ms INTEGER NOT NULL DEFAULT 0,
      total_ms INTEGER NOT NULL DEFAULT 0,
      last_read_at INTEGER,
      PRIMARY KEY (date, path, section_id)
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${DOC_ACTION_TABLE} (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      action_type TEXT NOT NULL,
      source_type TEXT NOT NULL,
      section_id TEXT NOT NULL,
      section_title TEXT,
      count INTEGER NOT NULL DEFAULT 0,
      last_action_at INTEGER
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${DOC_ACTION_DAILY_TABLE} (
      date TEXT NOT NULL,
      path TEXT NOT NULL,
      action_type TEXT NOT NULL,
      source_type TEXT NOT NULL,
      section_id TEXT NOT NULL,
      section_title TEXT,
      count INTEGER NOT NULL DEFAULT 0,
      last_action_at INTEGER,
      PRIMARY KEY (date, path, action_type, source_type, section_id)
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${DOC_SESSION_TABLE} (
      session_id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      client_id TEXT NOT NULL,
      ip TEXT,
      risk_level INTEGER NOT NULL DEFAULT 0,
      issued_at INTEGER NOT NULL,
      expect_report_at INTEGER NOT NULL,
      reported_at INTEGER,
      status TEXT NOT NULL,
      challenge_id TEXT
    );
  `).run()

  await ensureSessionColumns(db)

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${DOC_NONCE_TABLE} (
      nonce_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      nonce_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_nonce_hash ON ${DOC_NONCE_TABLE}(nonce_hash);
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${DOC_CHALLENGE_TABLE} (
      challenge_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      seed TEXT NOT NULL,
      difficulty INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${DOC_SECURITY_TABLE} (
      ip TEXT NOT NULL,
      client_id TEXT NOT NULL,
      violation_count INTEGER NOT NULL DEFAULT 0,
      risk_level INTEGER NOT NULL DEFAULT 0,
      blocked_until INTEGER,
      last_violation_at INTEGER,
      PRIMARY KEY (ip, client_id)
    );
  `).run()

  analyticsSchemaInitialized = true
}

export async function getDocSecurityState(db: D1Database, ip: string, clientId: string): Promise<DocSecurityState | null> {
  const row = await db.prepare(
    `SELECT violation_count, risk_level, blocked_until FROM ${DOC_SECURITY_TABLE} WHERE ip = ?1 AND client_id = ?2`,
  ).bind(ip, clientId).first<{ violation_count?: number, risk_level?: number, blocked_until?: number | null }>()
  if (!row)
    return null
  return {
    violationCount: row.violation_count ?? 0,
    riskLevel: row.risk_level ?? 0,
    blockedUntil: row.blocked_until ?? null,
  }
}

export async function recordDocViolation(
  db: D1Database,
  params: { ip: string, clientId: string, weight: number },
): Promise<DocSecurityState> {
  const now = Date.now()
  const existing = await getDocSecurityState(db, params.ip, params.clientId)
  const prevCount = existing?.violationCount ?? 0
  const nextCount = prevCount + Math.max(0, Math.round(params.weight))
  const riskLevel = resolveRiskLevel(nextCount)
  const blockedUntil = now + computeBlockMs(nextCount)

  await db.prepare(`
    INSERT INTO ${DOC_SECURITY_TABLE} (ip, client_id, violation_count, risk_level, blocked_until, last_violation_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(ip, client_id) DO UPDATE SET
      violation_count = excluded.violation_count,
      risk_level = excluded.risk_level,
      blocked_until = excluded.blocked_until,
      last_violation_at = excluded.last_violation_at;
  `).bind(params.ip, params.clientId, nextCount, riskLevel, blockedUntil, now).run()

  return { violationCount: nextCount, riskLevel, blockedUntil }
}

export async function expirePendingSessions(
  db: D1Database,
  params: { ip: string, clientId: string, now: number },
): Promise<number> {
  const { results } = await db.prepare(`
    SELECT session_id FROM ${DOC_SESSION_TABLE}
    WHERE ip = ?1 AND client_id = ?2 AND status = 'pending' AND expect_report_at < ?3
    LIMIT 20;
  `).bind(params.ip, params.clientId, params.now).all<{ session_id: string }>()

  const ids = (results ?? []).map(item => item.session_id).filter(Boolean)
  if (!ids.length)
    return 0

  const placeholders = ids.map(() => '?').join(',')
  await db.prepare(`
    UPDATE ${DOC_SESSION_TABLE}
    SET status = 'expired'
    WHERE session_id IN (${placeholders});
  `).bind(...ids).run()

  return ids.length
}

export async function createDocEngagementSession(
  db: D1Database,
  params: { path: string, clientId: string, ip: string | null, riskLevel: number, ttlMs: number },
): Promise<DocEngagementSession> {
  const sessionId = randomUUID()
  const issuedAt = Date.now()
  const expectReportAt = issuedAt + params.ttlMs

  await db.prepare(`
    INSERT INTO ${DOC_SESSION_TABLE} (
      session_id, path, client_id, ip, risk_level, issued_at, expect_report_at, status
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'pending');
  `).bind(sessionId, params.path, params.clientId, params.ip, params.riskLevel, issuedAt, expectReportAt).run()

  return {
    sessionId,
    path: params.path,
    clientId: params.clientId,
    ip: params.ip,
    riskLevel: params.riskLevel,
    issuedAt,
    expectReportAt,
    reportedAt: null,
    status: 'pending',
    challengeId: null,
  }
}

export async function getDocEngagementSession(
  db: D1Database,
  sessionId: string,
): Promise<DocEngagementSession | null> {
  const row = await db.prepare(`
    SELECT session_id, path, client_id, ip, risk_level, issued_at, expect_report_at, reported_at, status, challenge_id
    FROM ${DOC_SESSION_TABLE}
    WHERE session_id = ?1
    LIMIT 1;
  `).bind(sessionId).first<Record<string, any>>()

  if (!row)
    return null

  return {
    sessionId: row.session_id,
    path: row.path,
    clientId: row.client_id,
    ip: row.ip ?? null,
    riskLevel: Number(row.risk_level ?? 0),
    issuedAt: Number(row.issued_at ?? 0),
    expectReportAt: Number(row.expect_report_at ?? 0),
    reportedAt: row.reported_at ? Number(row.reported_at) : null,
    status: row.status,
    challengeId: row.challenge_id ?? null,
  }
}

export async function markDocSessionReported(db: D1Database, sessionId: string) {
  await db.prepare(`
    UPDATE ${DOC_SESSION_TABLE}
    SET status = 'reported', reported_at = ?2
    WHERE session_id = ?1;
  `).bind(sessionId, Date.now()).run()
}

export async function createDocChallenge(
  db: D1Database,
  params: { sessionId: string, riskLevel: number, ttlMs: number },
): Promise<DocEngagementChallenge> {
  const challengeId = randomUUID()
  const seed = randomBytes(16).toString('hex')
  const difficulty = params.riskLevel >= 2 ? 3 : 0
  const now = Date.now()
  const expiresAt = now + params.ttlMs

  await db.prepare(`
    INSERT INTO ${DOC_CHALLENGE_TABLE} (challenge_id, session_id, seed, difficulty, created_at, expires_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6);
  `).bind(challengeId, params.sessionId, seed, difficulty, now, expiresAt).run()

  await db.prepare(`
    UPDATE ${DOC_SESSION_TABLE}
    SET challenge_id = ?2
    WHERE session_id = ?1;
  `).bind(params.sessionId, challengeId).run()

  return {
    challengeId,
    sessionId: params.sessionId,
    seed,
    difficulty,
    createdAt: now,
    expiresAt,
  }
}

export async function getDocChallenge(
  db: D1Database,
  challengeId: string,
): Promise<DocEngagementChallenge | null> {
  const row = await db.prepare(`
    SELECT challenge_id, session_id, seed, difficulty, created_at, expires_at
    FROM ${DOC_CHALLENGE_TABLE}
    WHERE challenge_id = ?1
    LIMIT 1;
  `).bind(challengeId).first<Record<string, any>>()

  if (!row)
    return null

  return {
    challengeId: row.challenge_id,
    sessionId: row.session_id,
    seed: row.seed,
    difficulty: Number(row.difficulty ?? 0),
    createdAt: Number(row.created_at ?? 0),
    expiresAt: Number(row.expires_at ?? 0),
  }
}

export async function registerDocNonce(
  db: D1Database,
  params: { sessionId: string, nonceHash: string, ttlMs: number },
): Promise<boolean> {
  const now = Date.now()
  const expiresAt = now + params.ttlMs
  const result = await db.prepare(`
    INSERT OR IGNORE INTO ${DOC_NONCE_TABLE} (nonce_id, session_id, nonce_hash, created_at, expires_at)
    VALUES (?1, ?2, ?3, ?4, ?5);
  `).bind(randomUUID(), params.sessionId, params.nonceHash, now, expiresAt).run()

  return Boolean(result?.meta?.changes)
}

export async function incrementDocView(
  db: D1Database,
  params: { path: string, title: string },
): Promise<number> {
  const now = Date.now()
  await db.prepare(`
    INSERT INTO ${DOC_VIEWS_TABLE} (path, title, views, session_count, updated_at, last_view_at)
    VALUES (?1, ?2, 1, 1, ?3, ?3)
    ON CONFLICT(path) DO UPDATE SET
      title = COALESCE(excluded.title, ${DOC_VIEWS_TABLE}.title),
      views = ${DOC_VIEWS_TABLE}.views + 1,
      session_count = ${DOC_VIEWS_TABLE}.session_count + 1,
      updated_at = excluded.updated_at,
      last_view_at = excluded.last_view_at;
  `).bind(params.path, params.title || null, now).run()

  const row = await db.prepare(
    `SELECT views FROM ${DOC_VIEWS_TABLE} WHERE path = ?1`,
  ).bind(params.path).first<{ views?: number }>()

  const date = new Date(now).toISOString().split('T')[0]
  await db.prepare(`
    INSERT INTO ${DOC_VIEWS_DAILY_TABLE} (date, path, title, views, session_count)
    VALUES (?1, ?2, ?3, 1, 1)
    ON CONFLICT(date, path) DO UPDATE SET
      title = COALESCE(excluded.title, ${DOC_VIEWS_DAILY_TABLE}.title),
      views = ${DOC_VIEWS_DAILY_TABLE}.views + 1,
      session_count = ${DOC_VIEWS_DAILY_TABLE}.session_count + 1;
  `).bind(date, params.path, params.title || null).run()

  return row?.views ?? 1
}

export async function recordDocEngagement(
  db: D1Database,
  params: {
    path: string
    title: string
    activeMs: number
    totalMs: number
    sections: DocEngagementSectionInput[]
    actions: DocEngagementActionInput[]
  },
) {
  const now = Date.now()
  const date = new Date(now).toISOString().split('T')[0]
  const copyCount = params.actions
    .filter(action => action.type === 'copy')
    .reduce((sum, action) => sum + action.count, 0)
  const selectCount = params.actions
    .filter(action => action.type === 'select')
    .reduce((sum, action) => sum + action.count, 0)

  await db.prepare(`
    UPDATE ${DOC_VIEWS_TABLE}
    SET
      title = COALESCE(?2, title),
      active_ms = active_ms + ?3,
      total_ms = total_ms + ?4,
      copy_count = copy_count + ?5,
      select_count = select_count + ?6,
      updated_at = ?7,
      last_read_at = ?7
    WHERE path = ?1;
  `).bind(params.path, params.title || null, params.activeMs, params.totalMs, copyCount, selectCount, now).run()

  await db.prepare(`
    INSERT INTO ${DOC_VIEWS_DAILY_TABLE} (date, path, title, active_ms, total_ms, copy_count, select_count)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
    ON CONFLICT(date, path) DO UPDATE SET
      title = COALESCE(excluded.title, ${DOC_VIEWS_DAILY_TABLE}.title),
      active_ms = ${DOC_VIEWS_DAILY_TABLE}.active_ms + excluded.active_ms,
      total_ms = ${DOC_VIEWS_DAILY_TABLE}.total_ms + excluded.total_ms,
      copy_count = ${DOC_VIEWS_DAILY_TABLE}.copy_count + excluded.copy_count,
      select_count = ${DOC_VIEWS_DAILY_TABLE}.select_count + excluded.select_count;
  `).bind(date, params.path, params.title || null, params.activeMs, params.totalMs, copyCount, selectCount).run()

  for (const section of params.sections) {
    const sectionId = normalizeString(section.id, 120)
    if (!sectionId)
      continue
    const sectionTitle = normalizeString(section.title, 200)
    const entryId = `${params.path}#${sectionId}`
    const activeMs = Math.max(0, Math.round(section.activeMs))
    const totalMs = Math.max(0, Math.round(section.totalMs))
    const viewCount = activeMs > 0 || totalMs > 0 ? 1 : 0

    await db.prepare(`
      INSERT INTO ${DOC_SECTION_TABLE} (id, path, section_id, section_title, view_count, active_ms, total_ms, last_read_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      ON CONFLICT(id) DO UPDATE SET
        section_title = COALESCE(excluded.section_title, ${DOC_SECTION_TABLE}.section_title),
        view_count = ${DOC_SECTION_TABLE}.view_count + excluded.view_count,
        active_ms = ${DOC_SECTION_TABLE}.active_ms + excluded.active_ms,
        total_ms = ${DOC_SECTION_TABLE}.total_ms + excluded.total_ms,
        last_read_at = excluded.last_read_at;
    `).bind(entryId, params.path, sectionId, sectionTitle || null, viewCount, activeMs, totalMs, now).run()

    await db.prepare(`
      INSERT INTO ${DOC_SECTION_DAILY_TABLE} (date, path, section_id, section_title, view_count, active_ms, total_ms, last_read_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      ON CONFLICT(date, path, section_id) DO UPDATE SET
        section_title = COALESCE(excluded.section_title, ${DOC_SECTION_DAILY_TABLE}.section_title),
        view_count = ${DOC_SECTION_DAILY_TABLE}.view_count + excluded.view_count,
        active_ms = ${DOC_SECTION_DAILY_TABLE}.active_ms + excluded.active_ms,
        total_ms = ${DOC_SECTION_DAILY_TABLE}.total_ms + excluded.total_ms,
        last_read_at = excluded.last_read_at;
    `).bind(date, params.path, sectionId, sectionTitle || null, viewCount, activeMs, totalMs, now).run()
  }

  for (const action of params.actions) {
    const actionType = normalizeString(action.type, 16)
    const sourceType = normalizeString(action.source, 16)
    const sectionId = normalizeString(action.sectionId || 'root', 120) || 'root'
    if (!actionType || !sourceType)
      continue
    const sectionTitle = normalizeString(action.sectionTitle, 200)
    const entryId = `${params.path}#${actionType}#${sourceType}#${sectionId}`
    const count = Math.max(0, Math.round(action.count))
    if (!count)
      continue

    await db.prepare(`
      INSERT INTO ${DOC_ACTION_TABLE} (id, path, action_type, source_type, section_id, section_title, count, last_action_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      ON CONFLICT(id) DO UPDATE SET
        section_title = COALESCE(excluded.section_title, ${DOC_ACTION_TABLE}.section_title),
        count = ${DOC_ACTION_TABLE}.count + excluded.count,
        last_action_at = excluded.last_action_at;
    `).bind(entryId, params.path, actionType, sourceType, sectionId, sectionTitle || null, count, now).run()

    await db.prepare(`
      INSERT INTO ${DOC_ACTION_DAILY_TABLE} (date, path, action_type, source_type, section_id, section_title, count, last_action_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
      ON CONFLICT(date, path, action_type, source_type, section_id) DO UPDATE SET
        section_title = COALESCE(excluded.section_title, ${DOC_ACTION_DAILY_TABLE}.section_title),
        count = ${DOC_ACTION_DAILY_TABLE}.count + excluded.count,
        last_action_at = excluded.last_action_at;
    `).bind(date, params.path, actionType, sourceType, sectionId, sectionTitle || null, count, now).run()
  }
}

export function buildPayloadHash(payload: Record<string, unknown>): string {
  return sha256Hex(stableSerialize(payload))
}

export function validatePow(proof: string, powNonce: string, difficulty: number): boolean {
  if (difficulty <= 0)
    return true
  const digest = sha256Hex(`${proof}${powNonce}`)
  return digest.startsWith('0'.repeat(difficulty))
}
