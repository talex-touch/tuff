import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { Buffer } from 'node:buffer'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readCloudflareBindings } from './cloudflare'
import { assertRuntimeCredential, isLocalDevelopmentRuntime, selectRuntimeCredential } from './runtimeCredentialPolicy'
import { defineD1Schema, ensureD1Schema } from './d1Schema'

const DOC_VIEWS_TABLE = 'doc_views'
const DOC_VIEWS_DAILY_TABLE = 'doc_views_daily'
const DOC_SECTION_TABLE = 'doc_section_stats'
const DOC_SECTION_DAILY_TABLE = 'doc_section_stats_daily'
const DOC_ACTION_TABLE = 'doc_action_stats'
const DOC_ACTION_DAILY_TABLE = 'doc_action_stats_daily'
const DOC_HEATMAP_TABLE = 'doc_section_heatmap'
const DOC_HEATMAP_DAILY_TABLE = 'doc_section_heatmap_daily'
const DOC_EVIDENCE_TABLE = 'doc_action_evidence'
const DOC_EVIDENCE_DAILY_TABLE = 'doc_action_evidence_daily'
const DOC_SESSION_TABLE = 'doc_engagement_sessions'
const DOC_NONCE_TABLE = 'doc_engagement_nonces'
const DOC_CHALLENGE_TABLE = 'doc_engagement_challenges'
const DOC_SECURITY_TABLE = 'doc_analytics_security'

const BASE_BLOCK_MS = 10 * 60_000
const MAX_BLOCK_MS = 24 * 60 * 60_000

const TOKEN_TTL_SECONDS = 15 * 60
const EVIDENCE_RETENTION_DAYS = 90
const CLEANUP_INTERVAL_MS = 6 * 60 * 60_000

let analyticsCleanupAt = 0

export type DocEngagementSourceType = 'docs_page' | 'doc_comments_admin'

export interface DocTokenPayload {
  typ: 'doc'
  sid: string
  path: string
  cid: string
  src: DocEngagementSourceType
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
  sourceType: DocEngagementSourceType
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
  buckets?: Array<{
    bucket: number
    activeMs: number
    totalMs: number
  }>
}

export interface DocEngagementActionInput {
  type: string
  source: string
  sectionId: string
  sectionTitle: string
  count: number
  textHash?: string
  textLength?: number
  anchorStart?: number
  anchorEnd?: number
  anchorBucket?: number
}

export interface DocAnalyticsSummaryItem {
  path: string
  title: string
  views: number
  sessionCount: number
  activeMs: number
  totalMs: number
  copyCount: number
  selectCount: number
  lastActivity: number | null
}

export interface DocAnalyticsDashboardResult {
  overview: {
    docCount: number
    totalViews: number
    totalSessionCount: number
    totalActiveMs: number
    totalTotalMs: number
    totalCopyCount: number
    totalSelectCount: number
  }
  docs: DocAnalyticsSummaryItem[]
  detail: null | {
    path: string
    sections: Array<{
      sectionId: string
      sectionTitle: string
      viewCount: number
      activeMs: number
      totalMs: number
      lastReadAt: number | null
    }>
    heatmap: Array<{
      sourceType: DocEngagementSourceType
      sectionId: string
      sectionTitle: string
      bucket: number
      activeMs: number
      totalMs: number
      lastReadAt: number | null
    }>
    evidence: Array<{
      sourceType: DocEngagementSourceType
      actionType: string
      actionSource: string
      sectionId: string
      sectionTitle: string
      textHash: string
      textLength: number
      anchorStart: number
      anchorEnd: number
      anchorBucket: number
      count: number
      lastActionAt: number | null
    }>
  }
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

export function normalizeDocSourceType(value: unknown): DocEngagementSourceType {
  return value === 'doc_comments_admin' ? 'doc_comments_admin' : 'docs_page'
}

export function isAllowedDocPathForSource(path: string, sourceType: DocEngagementSourceType): boolean {
  if (sourceType === 'doc_comments_admin')
    return path === 'admin/doc-comments'
  return path.startsWith('docs/')
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

/** Only reachable when isLocalDevelopmentRuntime() is true; never on a deployed runtime. */
const DEV_FALLBACK_DOC_TOKEN_SECRET = 'nexus-doc-analytics-local-development-secret'

/**
 * Resolves the doc-token signing secret the way every other credential here is resolved.
 *
 * This used to read only useRuntimeConfig() and process.env, and fell back to a hardcoded
 * constant when neither produced 16 characters. On Cloudflare Pages secrets arrive as
 * bindings on event.context.cloudflare.env, and selectRuntimeCredential deliberately ignores
 * the process.env fallbacks once bindings exist (runtimeCredentialPolicy.ts:57) — so a
 * deployed Pages runtime signed every doc token with a constant published in this repo,
 * and anyone could mint one (#920).
 *
 * Fails closed off local development rather than substituting a constant: a signing secret
 * that silently degrades to a known value is worse than an endpoint that stops working,
 * because nothing observable distinguishes it from a working one.
 */
function getDocTokenSecret(event: H3Event): string {
  const bindings = readCloudflareBindings(event)
  const config = useRuntimeConfig()
  const configured = selectRuntimeCredential(
    bindings,
    bindings?.NUXT_DOC_TOKEN_SECRET ?? bindings?.AUTH_SECRET,
    [config.appAuthJwtSecret, config.auth?.secret, process.env.NUXT_DOC_TOKEN_SECRET, process.env.AUTH_SECRET],
  )
  const localDevelopment = isLocalDevelopmentRuntime(bindings?.NEXUS_LOCAL_PAGES_PREVIEW, bindings)

  if (configured !== undefined && configured !== null)
    return assertRuntimeCredential('NUXT_DOC_TOKEN_SECRET', configured, { localDevelopment })

  if (!localDevelopment)
    return assertRuntimeCredential('NUXT_DOC_TOKEN_SECRET', configured, { localDevelopment: false })

  return DEV_FALLBACK_DOC_TOKEN_SECRET
}

export function createDocToken(event: H3Event, payload: Omit<DocTokenPayload, 'iat' | 'exp' | 'typ'>, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1000)
  const exp = issuedAt + TOKEN_TTL_SECONDS
  const tokenPayload: DocTokenPayload = {
    typ: 'doc',
    sid: payload.sid,
    path: payload.path,
    cid: payload.cid,
    src: payload.src,
    rl: payload.rl,
    iat: issuedAt,
    exp,
  }
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64UrlEncode(JSON.stringify(tokenPayload))
  const signingInput = `${header}.${body}`
  const signature = createHash('sha256').update(`${signingInput}.${getDocTokenSecret(event)}`).digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
  return `${signingInput}.${signature}`
}

export function verifyDocToken(event: H3Event, token: string): DocTokenPayload | null {
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
    const expectedSignature = createHash('sha256').update(`${signingInput}.${getDocTokenSecret(event)}`).digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')
    if (signaturePart.length !== expectedSignature.length)
      return null
    if (signaturePart !== expectedSignature)
      return null

    const payload = JSON.parse(base64UrlDecode(payloadPart)) as Partial<DocTokenPayload>
    if (payload.typ !== 'doc')
      return null
    if (!payload.sid || !payload.path || !payload.cid)
      return null
    if (!payload.exp || payload.exp <= Math.floor(Date.now() / 1000))
      return null
    return {
      typ: 'doc',
      sid: payload.sid,
      path: payload.path,
      cid: payload.cid,
      src: normalizeDocSourceType(payload.src),
      rl: Number(payload.rl ?? 0),
      iat: Number(payload.iat ?? 0),
      exp: Number(payload.exp),
    }
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

const DOC_ANALYTICS_SCHEMA = defineD1Schema('doc-analytics', {
  statements: [
    `CREATE TABLE IF NOT EXISTS ${DOC_VIEWS_TABLE} (
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
      )`,
    `CREATE TABLE IF NOT EXISTS ${DOC_VIEWS_DAILY_TABLE} (
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
      )`,
    `CREATE TABLE IF NOT EXISTS ${DOC_SECTION_TABLE} (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        section_id TEXT NOT NULL,
        section_title TEXT,
        view_count INTEGER NOT NULL DEFAULT 0,
        active_ms INTEGER NOT NULL DEFAULT 0,
        total_ms INTEGER NOT NULL DEFAULT 0,
        last_read_at INTEGER
      )`,
    `CREATE TABLE IF NOT EXISTS ${DOC_SECTION_DAILY_TABLE} (
        date TEXT NOT NULL,
        path TEXT NOT NULL,
        section_id TEXT NOT NULL,
        section_title TEXT,
        view_count INTEGER NOT NULL DEFAULT 0,
        active_ms INTEGER NOT NULL DEFAULT 0,
        total_ms INTEGER NOT NULL DEFAULT 0,
        last_read_at INTEGER,
        PRIMARY KEY (date, path, section_id)
      )`,
    `CREATE TABLE IF NOT EXISTS ${DOC_ACTION_TABLE} (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        action_type TEXT NOT NULL,
        source_type TEXT NOT NULL,
        section_id TEXT NOT NULL,
        section_title TEXT,
        count INTEGER NOT NULL DEFAULT 0,
        last_action_at INTEGER
      )`,
    `CREATE TABLE IF NOT EXISTS ${DOC_ACTION_DAILY_TABLE} (
        date TEXT NOT NULL,
        path TEXT NOT NULL,
        action_type TEXT NOT NULL,
        source_type TEXT NOT NULL,
        section_id TEXT NOT NULL,
        section_title TEXT,
        count INTEGER NOT NULL DEFAULT 0,
        last_action_at INTEGER,
        PRIMARY KEY (date, path, action_type, source_type, section_id)
      )`,
    `CREATE TABLE IF NOT EXISTS ${DOC_HEATMAP_TABLE} (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        source_type TEXT NOT NULL,
        section_id TEXT NOT NULL,
        section_title TEXT,
        bucket INTEGER NOT NULL,
        active_ms INTEGER NOT NULL DEFAULT 0,
        total_ms INTEGER NOT NULL DEFAULT 0,
        last_read_at INTEGER
      )`,
    `CREATE TABLE IF NOT EXISTS ${DOC_HEATMAP_DAILY_TABLE} (
        date TEXT NOT NULL,
        path TEXT NOT NULL,
        source_type TEXT NOT NULL,
        section_id TEXT NOT NULL,
        section_title TEXT,
        bucket INTEGER NOT NULL,
        active_ms INTEGER NOT NULL DEFAULT 0,
        total_ms INTEGER NOT NULL DEFAULT 0,
        last_read_at INTEGER,
        PRIMARY KEY (date, path, source_type, section_id, bucket)
      )`,
    `CREATE TABLE IF NOT EXISTS ${DOC_EVIDENCE_TABLE} (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        source_type TEXT NOT NULL,
        action_type TEXT NOT NULL,
        action_source TEXT NOT NULL,
        section_id TEXT NOT NULL,
        section_title TEXT,
        text_hash TEXT,
        text_length INTEGER,
        anchor_start INTEGER,
        anchor_end INTEGER,
        anchor_bucket INTEGER,
        count INTEGER NOT NULL DEFAULT 0,
        last_action_at INTEGER
      )`,
    `CREATE TABLE IF NOT EXISTS ${DOC_EVIDENCE_DAILY_TABLE} (
        date TEXT NOT NULL,
        path TEXT NOT NULL,
        source_type TEXT NOT NULL,
        action_type TEXT NOT NULL,
        action_source TEXT NOT NULL,
        section_id TEXT NOT NULL,
        section_title TEXT,
        text_hash TEXT,
        text_length INTEGER,
        anchor_start INTEGER,
        anchor_end INTEGER,
        anchor_bucket INTEGER,
        count INTEGER NOT NULL DEFAULT 0,
        last_action_at INTEGER,
        PRIMARY KEY (date, path, source_type, action_type, action_source, section_id, text_hash, anchor_bucket)
      )`,
    `CREATE TABLE IF NOT EXISTS ${DOC_SESSION_TABLE} (
        session_id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        source_type TEXT NOT NULL DEFAULT 'docs_page',
        client_id TEXT NOT NULL,
        ip TEXT,
        risk_level INTEGER NOT NULL DEFAULT 0,
        issued_at INTEGER NOT NULL,
        expect_report_at INTEGER NOT NULL,
        reported_at INTEGER,
        status TEXT NOT NULL,
        challenge_id TEXT
      )`,
    `CREATE TABLE IF NOT EXISTS ${DOC_NONCE_TABLE} (
        nonce_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        nonce_hash TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_nonce_hash ON ${DOC_NONCE_TABLE}(nonce_hash)`,
    `CREATE TABLE IF NOT EXISTS ${DOC_CHALLENGE_TABLE} (
        challenge_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        seed TEXT NOT NULL,
        difficulty INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )`,
    `CREATE TABLE IF NOT EXISTS ${DOC_SECURITY_TABLE} (
        ip TEXT NOT NULL,
        client_id TEXT NOT NULL,
        violation_count INTEGER NOT NULL DEFAULT 0,
        risk_level INTEGER NOT NULL DEFAULT 0,
        blocked_until INTEGER,
        last_violation_at INTEGER,
        PRIMARY KEY (ip, client_id)
      )`,
    `CREATE INDEX IF NOT EXISTS idx_doc_heatmap_path ON ${DOC_HEATMAP_TABLE}(path, source_type, active_ms DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_doc_evidence_path ON ${DOC_EVIDENCE_TABLE}(path, source_type, action_type, count DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_doc_session_source ON ${DOC_SESSION_TABLE}(source_type, path, issued_at DESC)`,
    // `expirePendingSessions` looks sessions up by owner on every docs view; none of the indexes led
    // with it, so it read every session ever issued (2,022 rows a run in production, and growing).
    `CREATE INDEX IF NOT EXISTS idx_doc_session_pending_owner ON ${DOC_SESSION_TABLE}(ip, client_id, expect_report_at) WHERE status = 'pending'`,
  ],
  columns: [
    {
      table: DOC_VIEWS_TABLE,
      columns: [
        { name: 'title', ddl: 'title TEXT' },
        { name: 'session_count', ddl: 'session_count INTEGER NOT NULL DEFAULT 0' },
        { name: 'active_ms', ddl: 'active_ms INTEGER NOT NULL DEFAULT 0' },
        { name: 'total_ms', ddl: 'total_ms INTEGER NOT NULL DEFAULT 0' },
        { name: 'copy_count', ddl: 'copy_count INTEGER NOT NULL DEFAULT 0' },
        { name: 'select_count', ddl: 'select_count INTEGER NOT NULL DEFAULT 0' },
        { name: 'last_view_at', ddl: 'last_view_at INTEGER' },
        { name: 'last_read_at', ddl: 'last_read_at INTEGER' },
      ],
    },
    {
      table: DOC_EVIDENCE_TABLE,
      columns: [
        { name: 'anchor_start', ddl: 'anchor_start INTEGER' },
        { name: 'anchor_end', ddl: 'anchor_end INTEGER' },
      ],
    },
    {
      table: DOC_EVIDENCE_DAILY_TABLE,
      columns: [
        { name: 'anchor_start', ddl: 'anchor_start INTEGER' },
        { name: 'anchor_end', ddl: 'anchor_end INTEGER' },
      ],
    },
    {
      table: DOC_SESSION_TABLE,
      columns: [
        { name: 'challenge_id', ddl: 'challenge_id TEXT' },
        { name: 'source_type', ddl: "source_type TEXT NOT NULL DEFAULT 'docs_page'" },
      ],
    },
  ],
})

export async function ensureDocAnalyticsSchema(db: D1Database) {
  await ensureD1Schema(db, DOC_ANALYTICS_SCHEMA)
}

/** How long engagement sessions, their nonces and challenges are kept: far past the ten-minute report window. */
const DOC_ENGAGEMENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Deletes engagement sessions, nonces and challenges older than the retention window, in one round
 * trip. Nothing deleted them before: the sessions table only grew, and with it the work behind every
 * page view's check for the client's overdue sessions. Run by the scheduled maintenance Worker.
 */
export async function cleanupDocEngagementRecords(db: D1Database, now = Date.now()) {
  await ensureDocAnalyticsSchema(db)
  const cutoff = now - DOC_ENGAGEMENT_RETENTION_MS
  const [sessions, nonces, challenges] = await db.batch([
    db.prepare(`DELETE FROM ${DOC_SESSION_TABLE} WHERE issued_at < ?1;`).bind(cutoff),
    db.prepare(`DELETE FROM ${DOC_NONCE_TABLE} WHERE created_at < ?1;`).bind(cutoff),
    db.prepare(`DELETE FROM ${DOC_CHALLENGE_TABLE} WHERE created_at < ?1;`).bind(cutoff),
  ])
  const changes = (result: { meta?: { changes?: number } } | undefined) => Number(result?.meta?.changes ?? 0)
  return { sessions: changes(sessions), nonces: changes(nonces), challenges: changes(challenges) }
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

/**
 * Expires up to 20 of the client's overdue pending sessions and says how many. One statement: it was a
 * read and then an update by id, so two requests at once could both count the same sessions.
 */
export async function expirePendingSessions(
  db: D1Database,
  params: { ip: string, clientId: string, now: number },
): Promise<number> {
  const { results } = await db.prepare(`
    UPDATE ${DOC_SESSION_TABLE}
    SET status = 'expired'
    WHERE session_id IN (
      SELECT session_id FROM ${DOC_SESSION_TABLE}
      WHERE ip = ?1 AND client_id = ?2 AND status = 'pending' AND expect_report_at < ?3
      LIMIT 20
    )
    RETURNING session_id;
  `).bind(params.ip, params.clientId, params.now).all<{ session_id: string }>()

  return results?.length ?? 0
}

export async function getDocEngagementSession(
  db: D1Database,
  sessionId: string,
): Promise<DocEngagementSession | null> {
  const row = await db.prepare(`
    SELECT session_id, path, source_type, client_id, ip, risk_level, issued_at, expect_report_at, reported_at, status, challenge_id
    FROM ${DOC_SESSION_TABLE}
    WHERE session_id = ?1
    LIMIT 1;
  `).bind(sessionId).first<Record<string, any>>()

  if (!row)
    return null

  return {
    sessionId: row.session_id,
    path: row.path,
    sourceType: normalizeDocSourceType(row.source_type),
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

/** The page's view counters, the first answering with the page's views: for callers batching them. */
function prepareDocViewCount(db: D1Database, params: { path: string, title: string }, now: number): D1PreparedStatement[] {
  const date = new Date(now).toISOString().split('T')[0]
  return [
    db.prepare(`
      INSERT INTO ${DOC_VIEWS_TABLE} (path, title, views, session_count, updated_at, last_view_at)
      VALUES (?1, ?2, 1, 1, ?3, ?3)
      ON CONFLICT(path) DO UPDATE SET
        title = COALESCE(excluded.title, ${DOC_VIEWS_TABLE}.title),
        views = ${DOC_VIEWS_TABLE}.views + 1,
        session_count = ${DOC_VIEWS_TABLE}.session_count + 1,
        updated_at = excluded.updated_at,
        last_view_at = excluded.last_view_at
      RETURNING views;
    `).bind(params.path, params.title || null, now),
    db.prepare(`
      INSERT INTO ${DOC_VIEWS_DAILY_TABLE} (date, path, title, views, session_count)
      VALUES (?1, ?2, ?3, 1, 1)
      ON CONFLICT(date, path) DO UPDATE SET
        title = COALESCE(excluded.title, ${DOC_VIEWS_DAILY_TABLE}.title),
        views = ${DOC_VIEWS_DAILY_TABLE}.views + 1,
        session_count = ${DOC_VIEWS_DAILY_TABLE}.session_count + 1;
    `).bind(date, params.path, params.title || null),
  ]
}

function readViews(result: { results?: unknown[] } | undefined): number {
  return Number((result?.results?.[0] as { views?: number } | undefined)?.views ?? 1)
}

/** Counts a page view and answers with the page's views, in one round trip; it was three. */
export async function incrementDocView(
  db: D1Database,
  params: { path: string, title: string },
): Promise<number> {
  const [view] = await db.batch(prepareDocViewCount(db, params, Date.now()))
  return readViews(view)
}

export interface DocViewOpening {
  views: number
  session: DocEngagementSession
  challenge: DocEngagementChallenge | null
}

/**
 * Counts a page view and opens its engagement session, with a challenge when the client's risk level
 * calls for one, in one round trip. They were up to six statements one after another: the view, a read
 * of its count, the daily view, the session, the challenge, and the session's link to it.
 */
export async function openDocViewSession(
  db: D1Database,
  params: {
    path: string
    title: string
    sourceType: DocEngagementSourceType
    clientId: string
    ip: string | null
    riskLevel: number
    sessionTtlMs: number
    challengeTtlMs: number
  },
): Promise<DocViewOpening> {
  const now = Date.now()
  const sessionId = randomUUID()
  const challenge: DocEngagementChallenge | null = params.riskLevel >= 1
    ? {
        challengeId: randomUUID(),
        sessionId,
        seed: randomBytes(16).toString('hex'),
        difficulty: params.riskLevel >= 2 ? 3 : 0,
        createdAt: now,
        expiresAt: now + params.challengeTtlMs,
      }
    : null
  const session: DocEngagementSession = {
    sessionId,
    path: params.path,
    sourceType: params.sourceType,
    clientId: params.clientId,
    ip: params.ip,
    riskLevel: params.riskLevel,
    issuedAt: now,
    expectReportAt: now + params.sessionTtlMs,
    reportedAt: null,
    status: 'pending',
    challengeId: challenge?.challengeId ?? null,
  }

  const [view] = await db.batch([
    ...prepareDocViewCount(db, params, now),
    db.prepare(`
      INSERT INTO ${DOC_SESSION_TABLE} (
        session_id, path, source_type, client_id, ip, risk_level, issued_at, expect_report_at, status, challenge_id
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'pending', ?9);
    `).bind(
      session.sessionId,
      session.path,
      session.sourceType,
      session.clientId,
      session.ip,
      session.riskLevel,
      session.issuedAt,
      session.expectReportAt,
      session.challengeId,
    ),
    ...(challenge
      ? [db.prepare(`
          INSERT INTO ${DOC_CHALLENGE_TABLE} (challenge_id, session_id, seed, difficulty, created_at, expires_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6);
        `).bind(challenge.challengeId, challenge.sessionId, challenge.seed, challenge.difficulty, challenge.createdAt, challenge.expiresAt)]
      : []),
  ])

  return { views: readViews(view), session, challenge }
}

/**
 * Adds one engagement report to every counter it feeds, in one round trip and one transaction: each
 * table is a single upsert over the report's rows (`json_each`), applied in report order. A section,
 * a heatmap bucket and an action were two to four statements each, one after another — about 80 round
 * trips for a typical page, and close to 900 statements for the largest report the handler accepts.
 *
 * `sessionId`, when given, is the engagement session the report closes; it is marked reported in the
 * same batch.
 */
export async function recordDocEngagement(
  db: D1Database,
  params: {
    path: string
    title: string
    sourceType: DocEngagementSourceType
    activeMs: number
    totalMs: number
    sections: DocEngagementSectionInput[]
    actions: DocEngagementActionInput[]
    sessionId?: string
  },
) {
  const now = Date.now()
  const date = new Date(now).toISOString().split('T')[0]
  const sourceType = normalizeDocSourceType(params.sourceType)
  const copyCount = params.actions
    .filter(action => action.type === 'copy')
    .reduce((sum, action) => sum + action.count, 0)
  const selectCount = params.actions
    .filter(action => action.type === 'select')
    .reduce((sum, action) => sum + action.count, 0)

  const sections: Array<{ id: string, sectionId: string, title: string | null, viewCount: number, activeMs: number, totalMs: number }> = []
  const buckets: Array<{ id: string, sectionId: string, title: string | null, bucket: number, activeMs: number, totalMs: number }> = []
  for (const section of params.sections) {
    const sectionId = normalizeString(section.id, 120)
    if (!sectionId)
      continue
    const sectionTitle = normalizeString(section.title, 200)
    const activeMs = Math.max(0, Math.round(section.activeMs))
    const totalMs = Math.max(0, Math.round(section.totalMs))
    sections.push({
      id: `${params.path}#${sectionId}`,
      sectionId,
      title: sectionTitle || null,
      viewCount: activeMs > 0 || totalMs > 0 ? 1 : 0,
      activeMs,
      totalMs,
    })

    const sectionBuckets = Array.isArray(section.buckets) ? section.buckets : []
    for (const bucketEntry of sectionBuckets) {
      const bucket = Math.max(0, Math.min(19, Math.round(Number(bucketEntry.bucket ?? 0) || 0)))
      const bucketActiveMs = Math.max(0, Math.round(Number(bucketEntry.activeMs ?? 0) || 0))
      const bucketTotalMs = Math.max(0, Math.round(Number(bucketEntry.totalMs ?? 0) || 0))
      if (!bucketActiveMs && !bucketTotalMs)
        continue
      buckets.push({
        id: `${params.path}#${sourceType}#${sectionId}#${bucket}`,
        sectionId,
        title: sectionTitle || null,
        bucket,
        activeMs: bucketActiveMs,
        totalMs: bucketTotalMs,
      })
    }
  }

  const actions: Array<{
    id: string
    evidenceId: string
    actionType: string
    actionSource: string
    sectionId: string
    title: string | null
    textHash: string
    textLength: number
    anchorStart: number
    anchorEnd: number
    anchorBucket: number
    count: number
  }> = []
  for (const action of params.actions) {
    const actionType = normalizeString(action.type, 16)
    const actionSource = normalizeString(action.source, 16)
    const sectionId = normalizeString(action.sectionId || 'root', 120) || 'root'
    if (!actionType || !actionSource)
      continue
    const sectionTitle = normalizeString(action.sectionTitle, 200)
    const count = Math.max(0, Math.round(action.count))
    if (!count)
      continue

    const textHash = normalizeString(action.textHash, 128)
    const textLength = Math.max(0, Math.round(Number(action.textLength ?? 0) || 0))
    const anchorStart = Math.max(0, Math.round(Number(action.anchorStart ?? 0) || 0))
    const anchorEnd = Math.max(0, Math.round(Number(action.anchorEnd ?? 0) || 0))
    const anchorBucket = Math.max(-1, Math.min(19, Math.round(Number(action.anchorBucket ?? -1) || -1)))
    actions.push({
      id: `${params.path}#${actionType}#${actionSource}#${sectionId}`,
      evidenceId: `${params.path}#${sourceType}#${actionType}#${actionSource}#${sectionId}#${textHash || '_'}#${anchorBucket}`,
      actionType,
      actionSource,
      sectionId,
      title: sectionTitle || null,
      textHash: textHash || '',
      textLength: textLength || 0,
      anchorStart: anchorStart || 0,
      anchorEnd: anchorEnd || 0,
      anchorBucket,
      count,
    })
  }

  const statements: D1PreparedStatement[] = [
    db.prepare(`
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
    `).bind(params.path, params.title || null, params.activeMs, params.totalMs, copyCount, selectCount, now),
    db.prepare(`
      INSERT INTO ${DOC_VIEWS_DAILY_TABLE} (date, path, title, active_ms, total_ms, copy_count, select_count)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      ON CONFLICT(date, path) DO UPDATE SET
        title = COALESCE(excluded.title, ${DOC_VIEWS_DAILY_TABLE}.title),
        active_ms = ${DOC_VIEWS_DAILY_TABLE}.active_ms + excluded.active_ms,
        total_ms = ${DOC_VIEWS_DAILY_TABLE}.total_ms + excluded.total_ms,
        copy_count = ${DOC_VIEWS_DAILY_TABLE}.copy_count + excluded.copy_count,
        select_count = ${DOC_VIEWS_DAILY_TABLE}.select_count + excluded.select_count;
    `).bind(date, params.path, params.title || null, params.activeMs, params.totalMs, copyCount, selectCount),
  ]

  // `WHERE true` keeps SQLite from reading the upsert's `ON` as a join constraint; `ORDER BY key`
  // applies the rows in report order, as the statements one per row did.
  if (sections.length) {
    const rows = JSON.stringify(sections)
    statements.push(
      db.prepare(`
        INSERT INTO ${DOC_SECTION_TABLE} (id, path, section_id, section_title, view_count, active_ms, total_ms, last_read_at)
        SELECT json_extract(value, '$.id'), ?1, json_extract(value, '$.sectionId'), json_extract(value, '$.title'), json_extract(value, '$.viewCount'),
          json_extract(value, '$.activeMs'), json_extract(value, '$.totalMs'), ?2
        FROM json_each(?3)
        WHERE true
        ORDER BY key
        ON CONFLICT(id) DO UPDATE SET
          section_title = COALESCE(excluded.section_title, ${DOC_SECTION_TABLE}.section_title),
          view_count = ${DOC_SECTION_TABLE}.view_count + excluded.view_count,
          active_ms = ${DOC_SECTION_TABLE}.active_ms + excluded.active_ms,
          total_ms = ${DOC_SECTION_TABLE}.total_ms + excluded.total_ms,
          last_read_at = excluded.last_read_at;
      `).bind(params.path, now, rows),
      db.prepare(`
        INSERT INTO ${DOC_SECTION_DAILY_TABLE} (date, path, section_id, section_title, view_count, active_ms, total_ms, last_read_at)
        SELECT ?1, ?2, json_extract(value, '$.sectionId'), json_extract(value, '$.title'), json_extract(value, '$.viewCount'),
          json_extract(value, '$.activeMs'), json_extract(value, '$.totalMs'), ?3
        FROM json_each(?4)
        WHERE true
        ORDER BY key
        ON CONFLICT(date, path, section_id) DO UPDATE SET
          section_title = COALESCE(excluded.section_title, ${DOC_SECTION_DAILY_TABLE}.section_title),
          view_count = ${DOC_SECTION_DAILY_TABLE}.view_count + excluded.view_count,
          active_ms = ${DOC_SECTION_DAILY_TABLE}.active_ms + excluded.active_ms,
          total_ms = ${DOC_SECTION_DAILY_TABLE}.total_ms + excluded.total_ms,
          last_read_at = excluded.last_read_at;
      `).bind(date, params.path, now, rows),
    )
  }

  if (buckets.length) {
    const rows = JSON.stringify(buckets)
    statements.push(
      db.prepare(`
        INSERT INTO ${DOC_HEATMAP_TABLE} (id, path, source_type, section_id, section_title, bucket, active_ms, total_ms, last_read_at)
        SELECT json_extract(value, '$.id'), ?1, ?2, json_extract(value, '$.sectionId'), json_extract(value, '$.title'), json_extract(value, '$.bucket'),
          json_extract(value, '$.activeMs'), json_extract(value, '$.totalMs'), ?3
        FROM json_each(?4)
        WHERE true
        ORDER BY key
        ON CONFLICT(id) DO UPDATE SET
          section_title = COALESCE(excluded.section_title, ${DOC_HEATMAP_TABLE}.section_title),
          active_ms = ${DOC_HEATMAP_TABLE}.active_ms + excluded.active_ms,
          total_ms = ${DOC_HEATMAP_TABLE}.total_ms + excluded.total_ms,
          last_read_at = excluded.last_read_at;
      `).bind(params.path, sourceType, now, rows),
      db.prepare(`
        INSERT INTO ${DOC_HEATMAP_DAILY_TABLE} (date, path, source_type, section_id, section_title, bucket, active_ms, total_ms, last_read_at)
        SELECT ?1, ?2, ?3, json_extract(value, '$.sectionId'), json_extract(value, '$.title'), json_extract(value, '$.bucket'),
          json_extract(value, '$.activeMs'), json_extract(value, '$.totalMs'), ?4
        FROM json_each(?5)
        WHERE true
        ORDER BY key
        ON CONFLICT(date, path, source_type, section_id, bucket) DO UPDATE SET
          section_title = COALESCE(excluded.section_title, ${DOC_HEATMAP_DAILY_TABLE}.section_title),
          active_ms = ${DOC_HEATMAP_DAILY_TABLE}.active_ms + excluded.active_ms,
          total_ms = ${DOC_HEATMAP_DAILY_TABLE}.total_ms + excluded.total_ms,
          last_read_at = excluded.last_read_at;
      `).bind(date, params.path, sourceType, now, rows),
    )
  }

  if (actions.length) {
    const rows = JSON.stringify(actions)
    statements.push(
      db.prepare(`
        INSERT INTO ${DOC_ACTION_TABLE} (id, path, action_type, source_type, section_id, section_title, count, last_action_at)
        SELECT json_extract(value, '$.id'), ?1, json_extract(value, '$.actionType'), json_extract(value, '$.actionSource'), json_extract(value, '$.sectionId'),
          json_extract(value, '$.title'), json_extract(value, '$.count'), ?2
        FROM json_each(?3)
        WHERE true
        ORDER BY key
        ON CONFLICT(id) DO UPDATE SET
          section_title = COALESCE(excluded.section_title, ${DOC_ACTION_TABLE}.section_title),
          count = ${DOC_ACTION_TABLE}.count + excluded.count,
          last_action_at = excluded.last_action_at;
      `).bind(params.path, now, rows),
      db.prepare(`
        INSERT INTO ${DOC_ACTION_DAILY_TABLE} (date, path, action_type, source_type, section_id, section_title, count, last_action_at)
        SELECT ?1, ?2, json_extract(value, '$.actionType'), json_extract(value, '$.actionSource'), json_extract(value, '$.sectionId'),
          json_extract(value, '$.title'), json_extract(value, '$.count'), ?3
        FROM json_each(?4)
        WHERE true
        ORDER BY key
        ON CONFLICT(date, path, action_type, source_type, section_id) DO UPDATE SET
          section_title = COALESCE(excluded.section_title, ${DOC_ACTION_DAILY_TABLE}.section_title),
          count = ${DOC_ACTION_DAILY_TABLE}.count + excluded.count,
          last_action_at = excluded.last_action_at;
      `).bind(date, params.path, now, rows),
      db.prepare(`
        INSERT INTO ${DOC_EVIDENCE_TABLE} (
          id, path, source_type, action_type, action_source, section_id, section_title, text_hash, text_length, anchor_start, anchor_end, anchor_bucket, count, last_action_at
        )
        SELECT json_extract(value, '$.evidenceId'), ?1, ?2, json_extract(value, '$.actionType'), json_extract(value, '$.actionSource'), json_extract(value, '$.sectionId'),
          json_extract(value, '$.title'), json_extract(value, '$.textHash'), json_extract(value, '$.textLength'), json_extract(value, '$.anchorStart'),
          json_extract(value, '$.anchorEnd'), json_extract(value, '$.anchorBucket'), json_extract(value, '$.count'), ?3
        FROM json_each(?4)
        WHERE true
        ORDER BY key
        ON CONFLICT(id) DO UPDATE SET
          section_title = COALESCE(excluded.section_title, ${DOC_EVIDENCE_TABLE}.section_title),
          text_length = CASE
            WHEN excluded.text_length > COALESCE(${DOC_EVIDENCE_TABLE}.text_length, 0) THEN excluded.text_length
            ELSE ${DOC_EVIDENCE_TABLE}.text_length
          END,
          anchor_start = CASE
            WHEN excluded.anchor_start > COALESCE(${DOC_EVIDENCE_TABLE}.anchor_start, 0) THEN excluded.anchor_start
            ELSE ${DOC_EVIDENCE_TABLE}.anchor_start
          END,
          anchor_end = CASE
            WHEN excluded.anchor_end > COALESCE(${DOC_EVIDENCE_TABLE}.anchor_end, 0) THEN excluded.anchor_end
            ELSE ${DOC_EVIDENCE_TABLE}.anchor_end
          END,
          count = ${DOC_EVIDENCE_TABLE}.count + excluded.count,
          last_action_at = excluded.last_action_at;
      `).bind(params.path, sourceType, now, rows),
      db.prepare(`
        INSERT INTO ${DOC_EVIDENCE_DAILY_TABLE} (
          date, path, source_type, action_type, action_source, section_id, section_title, text_hash, text_length, anchor_start, anchor_end, anchor_bucket, count, last_action_at
        )
        SELECT ?1, ?2, ?3, json_extract(value, '$.actionType'), json_extract(value, '$.actionSource'), json_extract(value, '$.sectionId'),
          json_extract(value, '$.title'), json_extract(value, '$.textHash'), json_extract(value, '$.textLength'), json_extract(value, '$.anchorStart'),
          json_extract(value, '$.anchorEnd'), json_extract(value, '$.anchorBucket'), json_extract(value, '$.count'), ?4
        FROM json_each(?5)
        WHERE true
        ORDER BY key
        ON CONFLICT(date, path, source_type, action_type, action_source, section_id, text_hash, anchor_bucket) DO UPDATE SET
          section_title = COALESCE(excluded.section_title, ${DOC_EVIDENCE_DAILY_TABLE}.section_title),
          text_length = CASE
            WHEN excluded.text_length > COALESCE(${DOC_EVIDENCE_DAILY_TABLE}.text_length, 0) THEN excluded.text_length
            ELSE ${DOC_EVIDENCE_DAILY_TABLE}.text_length
          END,
          anchor_start = CASE
            WHEN excluded.anchor_start > COALESCE(${DOC_EVIDENCE_DAILY_TABLE}.anchor_start, 0) THEN excluded.anchor_start
            ELSE ${DOC_EVIDENCE_DAILY_TABLE}.anchor_start
          END,
          anchor_end = CASE
            WHEN excluded.anchor_end > COALESCE(${DOC_EVIDENCE_DAILY_TABLE}.anchor_end, 0) THEN excluded.anchor_end
            ELSE ${DOC_EVIDENCE_DAILY_TABLE}.anchor_end
          END,
          count = ${DOC_EVIDENCE_DAILY_TABLE}.count + excluded.count,
          last_action_at = excluded.last_action_at;
      `).bind(date, params.path, sourceType, now, rows),
    )
  }

  if (params.sessionId) {
    statements.push(db.prepare(`
      UPDATE ${DOC_SESSION_TABLE}
      SET status = 'reported', reported_at = ?2
      WHERE session_id = ?1;
    `).bind(params.sessionId, now))
  }

  await db.batch(statements)
  await cleanupDocEvidenceDaily(db, now)
}

async function cleanupDocEvidenceDaily(db: D1Database, now: number) {
  if (analyticsCleanupAt > 0 && now - analyticsCleanupAt < CLEANUP_INTERVAL_MS)
    return
  analyticsCleanupAt = now
  const cutoffDate = new Date(now - EVIDENCE_RETENTION_DAYS * 24 * 60 * 60_000).toISOString().split('T')[0]
  await db.prepare(`
    DELETE FROM ${DOC_EVIDENCE_DAILY_TABLE}
    WHERE date < ?1;
  `).bind(cutoffDate).run()
  await db.prepare(`
    DELETE FROM ${DOC_HEATMAP_DAILY_TABLE}
    WHERE date < ?1;
  `).bind(cutoffDate).run()
}

export async function getDocAnalyticsDashboard(
  db: D1Database,
  params: {
    days: number
    path?: string
    sourceType?: DocEngagementSourceType
    limit?: number
  },
): Promise<DocAnalyticsDashboardResult> {
  const limit = Math.min(Math.max(1, Math.round(params.limit ?? 20)), 100)
  const days = Math.min(Math.max(1, Math.round(params.days || 30)), 365)
  const now = Date.now()
  const cutoffDate = new Date(now - (days - 1) * 24 * 60 * 60_000).toISOString().split('T')[0]
  const normalizedPath = params.path ? normalizeDocPath(params.path) : ''
  const sourceType = params.sourceType ? normalizeDocSourceType(params.sourceType) : null

  const docsRows = await db.prepare(`
    SELECT
      path,
      COALESCE(MAX(title), '') AS title,
      SUM(views) AS views,
      SUM(session_count) AS session_count,
      SUM(active_ms) AS active_ms,
      SUM(total_ms) AS total_ms,
      SUM(copy_count) AS copy_count,
      SUM(select_count) AS select_count,
      MAX(date) AS last_date
    FROM ${DOC_VIEWS_DAILY_TABLE}
    WHERE date >= ?1
      AND (?2 = '' OR path = ?2)
    GROUP BY path
    ORDER BY active_ms DESC, views DESC
    LIMIT ?3;
  `).bind(cutoffDate, normalizedPath, limit).all<Record<string, any>>()

  const docs = (docsRows.results ?? []).map((row) => {
    const lastDate = typeof row.last_date === 'string' && row.last_date.length > 0
      ? new Date(`${row.last_date}T00:00:00Z`).getTime()
      : null
    return {
      path: normalizeDocPath(String(row.path || '')),
      title: String(row.title || ''),
      views: Number(row.views || 0),
      sessionCount: Number(row.session_count || 0),
      activeMs: Number(row.active_ms || 0),
      totalMs: Number(row.total_ms || 0),
      copyCount: Number(row.copy_count || 0),
      selectCount: Number(row.select_count || 0),
      lastActivity: lastDate,
    }
  })

  const resolvedPath = normalizedPath || docs[0]?.path || ''

  let sections: NonNullable<DocAnalyticsDashboardResult['detail']>['sections'] = []
  let heatmap: NonNullable<DocAnalyticsDashboardResult['detail']>['heatmap'] = []
  let evidence: NonNullable<DocAnalyticsDashboardResult['detail']>['evidence'] = []

  if (resolvedPath) {
    const sectionRows = await db.prepare(`
      SELECT
        section_id,
        COALESCE(MAX(section_title), '') AS section_title,
        SUM(view_count) AS view_count,
        SUM(active_ms) AS active_ms,
        SUM(total_ms) AS total_ms,
        MAX(last_read_at) AS last_read_at
      FROM ${DOC_SECTION_DAILY_TABLE}
      WHERE date >= ?1
        AND path = ?2
      GROUP BY section_id
      ORDER BY active_ms DESC, total_ms DESC
      LIMIT 120;
    `).bind(cutoffDate, resolvedPath).all<Record<string, any>>()

    sections = (sectionRows.results ?? []).map(row => ({
      sectionId: String(row.section_id || 'root'),
      sectionTitle: String(row.section_title || ''),
      viewCount: Number(row.view_count || 0),
      activeMs: Number(row.active_ms || 0),
      totalMs: Number(row.total_ms || 0),
      lastReadAt: row.last_read_at ? Number(row.last_read_at) : null,
    }))

    const heatmapRows = await db.prepare(`
      SELECT
        source_type,
        section_id,
        COALESCE(MAX(section_title), '') AS section_title,
        bucket,
        SUM(active_ms) AS active_ms,
        SUM(total_ms) AS total_ms,
        MAX(last_read_at) AS last_read_at
      FROM ${DOC_HEATMAP_DAILY_TABLE}
      WHERE date >= ?1
        AND path = ?2
        AND (?3 IS NULL OR source_type = ?3)
      GROUP BY source_type, section_id, bucket
      ORDER BY active_ms DESC, total_ms DESC
      LIMIT 200;
    `).bind(cutoffDate, resolvedPath, sourceType).all<Record<string, any>>()

    heatmap = (heatmapRows.results ?? []).map(row => ({
      sourceType: normalizeDocSourceType(row.source_type),
      sectionId: String(row.section_id || 'root'),
      sectionTitle: String(row.section_title || ''),
      bucket: Number(row.bucket || 0),
      activeMs: Number(row.active_ms || 0),
      totalMs: Number(row.total_ms || 0),
      lastReadAt: row.last_read_at ? Number(row.last_read_at) : null,
    }))

    const evidenceRows = await db.prepare(`
      SELECT
        source_type,
        action_type,
        action_source,
        section_id,
        COALESCE(MAX(section_title), '') AS section_title,
        text_hash,
        MAX(text_length) AS text_length,
        MAX(anchor_start) AS anchor_start,
        MAX(anchor_end) AS anchor_end,
        anchor_bucket,
        SUM(count) AS count,
        MAX(last_action_at) AS last_action_at
      FROM ${DOC_EVIDENCE_DAILY_TABLE}
      WHERE date >= ?1
        AND path = ?2
        AND (?3 IS NULL OR source_type = ?3)
      GROUP BY source_type, action_type, action_source, section_id, text_hash, anchor_bucket
      ORDER BY count DESC, last_action_at DESC
      LIMIT 120;
    `).bind(cutoffDate, resolvedPath, sourceType).all<Record<string, any>>()

    evidence = (evidenceRows.results ?? []).map(row => ({
      sourceType: normalizeDocSourceType(row.source_type),
      actionType: String(row.action_type || ''),
      actionSource: String(row.action_source || ''),
      sectionId: String(row.section_id || 'root'),
      sectionTitle: String(row.section_title || ''),
      textHash: String(row.text_hash || ''),
      textLength: Number(row.text_length || 0),
      anchorStart: Number(row.anchor_start || 0),
      anchorEnd: Number(row.anchor_end || 0),
      anchorBucket: Number(row.anchor_bucket ?? -1),
      count: Number(row.count || 0),
      lastActionAt: row.last_action_at ? Number(row.last_action_at) : null,
    }))
  }

  const overview = docs.reduce(
    (acc, item) => {
      acc.docCount += 1
      acc.totalViews += item.views
      acc.totalSessionCount += item.sessionCount
      acc.totalActiveMs += item.activeMs
      acc.totalTotalMs += item.totalMs
      acc.totalCopyCount += item.copyCount
      acc.totalSelectCount += item.selectCount
      return acc
    },
    {
      docCount: 0,
      totalViews: 0,
      totalSessionCount: 0,
      totalActiveMs: 0,
      totalTotalMs: 0,
      totalCopyCount: 0,
      totalSelectCount: 0,
    },
  )

  return {
    overview,
    docs,
    detail: resolvedPath
      ? {
          path: resolvedPath,
          sections,
          heatmap,
          evidence,
        }
      : null,
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
