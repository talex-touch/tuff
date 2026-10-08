import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createHash } from 'node:crypto'
import crypto from 'uncrypto'
import { readCloudflareBindings } from './cloudflare'
import { getUserSubscription } from './subscriptionStore'
import { getTeamQuota } from './teamStore'
import { defineD1Schema, ensureD1Schema } from './d1Schema'

type CreditPlan = 'FREE' | 'PLUS' | 'PRO' | 'TEAM' | 'ENTERPRISE'

const TEAMS_TABLE = 'teams'
const TEAM_MEMBERS_TABLE = 'team_members'
const CREDIT_PLANS_TABLE = 'credit_plans'
const CREDIT_BALANCES_TABLE = 'credit_balances'
const CREDIT_LEDGER_TABLE = 'credit_ledger'
const CREDIT_BOOST_CLAIMS_TABLE = 'credit_boost_claims'
const CREDIT_CHECKINS_TABLE = 'credit_checkins'
const USERS_TABLE = 'auth_users'
const ACCOUNTS_TABLE = 'auth_accounts'
const PASSKEYS_TABLE = 'auth_passkeys'

const DEFAULT_TEAM_QUOTA = 2000000
/**
 * Free monthly allowance, in credits. The credit is anchored to chat tokens — one
 * credit buys one token (`creditPricingStore.ts`) — so this number only means
 * something read in calls: a 1,000-token reply costs 1,000 credits, so 20,000 covers
 * about twenty replies, or ten `vision.ocr` images, in any mix. The shipped 1,000
 * bought a single short conversation, which made the free tier unusable rather than
 * cheap; the ladder above it (PLUS 100,000 = 10×, PRO 240,000 = 12×) was already
 * shaped for this size.
 */
const DEFAULT_PERSONAL_QUOTA = 20000
/**
 * Allowance for a FREE account that verified its email and bound OAuth/passkey.
 * Twice the free allowance, and deliberately below the cheapest paid tier (PLUS,
 * 100,000): completing a profile must not hand out a paid plan.
 */
const BOOSTED_PERSONAL_QUOTA = 40000
/**
 * Daily check-in top-up, added on top of the month's quota. A whole month of
 * check-ins stays inside the allowance it supplements: 30 × 500 = 15,000 < 20,000.
 * The shipped 1 credit — one token — was invisible next to any real call.
 */
const CHECKIN_REWARD = 500
const TEAM_BASE_SEATS = 5
const TEAM_POOL_PER_SEAT = 400000
const DEFAULT_PLAN_ID = 'default'
const CREDIT_IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/

export type TeamType = 'personal' | 'organization'
export type TeamMemberRole = 'owner' | 'admin' | 'member'

interface D1TeamRow {
  id: string
  name: string
  type: string
  owner_user_id: string
  created_at: string
}

interface D1TeamMemberRow {
  team_id: string
  user_id: string
  role: string
  joined_at: string
}

interface D1UserRow {
  id: string
  email_state: string | null
}

export interface TeamRecord {
  id: string
  name: string
  type: TeamType
  ownerUserId: string
  createdAt: string
}

export interface TeamMemberRecord {
  teamId: string
  userId: string
  role: TeamMemberRole
  joinedAt: string
}

export interface UserTeamRecord extends TeamRecord {
  role: TeamMemberRole
  joinedAt: string
}

function mapTeamRow(row: D1TeamRow): TeamRecord {
  return {
    id: row.id,
    name: row.name,
    type: row.type === 'organization' ? 'organization' : 'personal',
    ownerUserId: row.owner_user_id,
    createdAt: row.created_at,
  }
}

function mapTeamMemberRow(row: D1TeamMemberRow): TeamMemberRecord {
  return {
    teamId: row.team_id,
    userId: row.user_id,
    role: (row.role || 'member') as TeamMemberRole,
    joinedAt: row.joined_at,
  }
}

function normalizeCreditAmount(value: number): number {
  if (!Number.isFinite(value))
    return 0
  return Math.max(0, Math.round(value))
}

function resolveCreditAmount(value: unknown): number {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric))
    return 0
  if (numeric === 0)
    return 0
  return Math.sign(numeric) * Math.max(1, Math.round(Math.abs(numeric)))
}

function sumCredits(...values: number[]): number {
  const total = values.reduce((acc, current) => acc + current, 0)
  return Math.round(total)
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object')
    return JSON.stringify(value)
  if (Array.isArray(value))
    return `[${value.map(stableSerialize).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(',')}}`
}

function digestCreditConsumptionPayload(value: unknown): string {
  return createHash('sha256').update(stableSerialize(value)).digest('hex')
}

function normalizeCreditIdempotencyKey(value: unknown): string | null {
  if (typeof value !== 'string')
    return null
  const trimmed = value.trim()
  return CREDIT_IDEMPOTENCY_KEY_PATTERN.test(trimmed) ? trimmed : null
}

function normalizeCreditBalanceRow<T extends { quota?: unknown; used?: unknown }>(
  row: T | null | undefined
): T | null {
  if (!row)
    return null
  return {
    ...row,
    quota: resolveCreditAmount(row.quota),
    used: resolveCreditAmount(row.used)
  }
}

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

export function requireDatabase(event: H3Event): D1Database {
  const db = getD1Database(event)
  if (!db)
    throw new Error('Cloudflare D1 database is not available.')
  return db
}

const CREDITS_SCHEMA = defineD1Schema('credits', {
  statements: [
    `CREATE TABLE IF NOT EXISTS ${TEAMS_TABLE} (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
    `CREATE TABLE IF NOT EXISTS ${TEAM_MEMBERS_TABLE} (
        team_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL,
        joined_at TEXT NOT NULL,
        PRIMARY KEY (team_id, user_id)
      )`,
    `CREATE TABLE IF NOT EXISTS ${CREDIT_PLANS_TABLE} (
        plan_id TEXT PRIMARY KEY,
        monthly_quota REAL NOT NULL,
        personal_quota REAL NOT NULL
      )`,
    `CREATE TABLE IF NOT EXISTS ${CREDIT_BALANCES_TABLE} (
        scope TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        month TEXT NOT NULL,
        quota REAL NOT NULL,
        used REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (scope, scope_id, month)
      )`,
    `CREATE TABLE IF NOT EXISTS ${CREDIT_LEDGER_TABLE} (
        id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        scope_id TEXT NOT NULL,
        delta REAL NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        metadata TEXT,
        idempotency_key TEXT,
        idempotency_hash TEXT
      )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_ledger_idempotency
      ON ${CREDIT_LEDGER_TABLE}(scope, scope_id, reason, idempotency_key)
      WHERE idempotency_key IS NOT NULL`,
    `CREATE TABLE IF NOT EXISTS ${CREDIT_BOOST_CLAIMS_TABLE} (
        user_id TEXT NOT NULL,
        month TEXT NOT NULL,
        claimed_at TEXT NOT NULL,
        PRIMARY KEY (user_id, month)
      )`,
    `CREATE TABLE IF NOT EXISTS ${CREDIT_CHECKINS_TABLE} (
        user_id TEXT NOT NULL,
        day TEXT NOT NULL,
        claimed_at TEXT NOT NULL,
        PRIMARY KEY (user_id, day)
      )`,
    // Per-user and per-scope reads that used to scan: `listUserTeams` (every credit and team request,
    // and `team_members`' key leads with the team) and the ledger pages and trends.
    `CREATE INDEX IF NOT EXISTS idx_team_members_user ON ${TEAM_MEMBERS_TABLE}(user_id, team_id)`,
    `CREATE INDEX IF NOT EXISTS idx_credit_ledger_scope_created ON ${CREDIT_LEDGER_TABLE}(scope, scope_id, created_at)`,
    // Nothing reads `credit_plans`; the row is kept as it was, written when the definition (and with it
    // the default quotas) changes rather than twice on every cold isolate.
    `INSERT INTO ${CREDIT_PLANS_TABLE} (plan_id, monthly_quota, personal_quota)
      VALUES ('${DEFAULT_PLAN_ID}', ${DEFAULT_TEAM_QUOTA}, ${DEFAULT_PERSONAL_QUOTA})
      ON CONFLICT(plan_id) DO UPDATE SET
        monthly_quota = excluded.monthly_quota,
        personal_quota = excluded.personal_quota`,
  ],
  columns: [
    {
      table: CREDIT_LEDGER_TABLE,
      columns: [
        { name: 'idempotency_key', ddl: 'idempotency_key TEXT' },
        { name: 'idempotency_hash', ddl: 'idempotency_hash TEXT' },
      ],
    },
  ],
})

async function ensureCreditsSchema(db: D1Database) {
  await ensureD1Schema(db, CREDITS_SCHEMA)
}

function getMonthKey(date = new Date()): string {
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  return `${year}-${month}`
}

function getDayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

interface CreditBoostRequirements {
  emailVerified: boolean
  oauthLinked: boolean
  passkeyBound: boolean
}

export interface CreditBoostStatus {
  eligible: boolean
  requirements: CreditBoostRequirements
  claimedThisMonth: boolean
  baseQuota: number
  boostedQuota: number
}

interface BoostContext {
  requirements: CreditBoostRequirements
  eligible: boolean
  activatedMonth: string | null
}

export interface CreditCheckinStatus {
  day: string
  checkedInToday: boolean
  reward: number
}

const PERSONAL_QUOTA_BY_PLAN: Record<CreditPlan, number> = {
  FREE: DEFAULT_PERSONAL_QUOTA,
  PLUS: 100000,
  PRO: 240000,
  TEAM: 1000000,
  ENTERPRISE: 1000000,
}

async function resolvePlanForScope(event: H3Event, scope: 'team' | 'user', scopeId: string): Promise<CreditPlan> {
  if (scope === 'user') {
    const subscription = await getUserSubscription(event, scopeId)
    return subscription.plan
  }

  const db = requireDatabase(event)
  await ensureCreditsSchema(db)
  const row = await db.prepare(`
    SELECT owner_user_id FROM ${TEAMS_TABLE}
    WHERE id = ?
    LIMIT 1
  `).bind(scopeId).first<{ owner_user_id?: string | null }>()

  const ownerId = row?.owner_user_id
  if (!ownerId)
    return 'FREE'

  const subscription = await getUserSubscription(event, ownerId)
  return subscription.plan
}

async function resolveTeamQuotaByPlan(
  event: H3Event,
  teamId: string,
  plan: CreditPlan,
): Promise<number> {
  if (plan !== 'TEAM' && plan !== 'ENTERPRISE')
    return DEFAULT_TEAM_QUOTA

  const team = await getTeamById(event, teamId)
  if (!team || team.type !== 'organization')
    return DEFAULT_TEAM_QUOTA

  const quota = await getTeamQuota(event, teamId, plan)
  const seatsLimit = Math.max(TEAM_BASE_SEATS, quota.seatsLimit || TEAM_BASE_SEATS)
  return DEFAULT_TEAM_QUOTA + Math.max(0, seatsLimit - TEAM_BASE_SEATS) * TEAM_POOL_PER_SEAT
}

interface BoostFactsRow {
  email_state?: string | null
  email_verified?: string | null
  oauth_total?: number | null
  oauth_latest?: string | null
  passkey_total?: number | null
  passkey_latest?: string | null
  boost_claimed_at?: string | null
}

/**
 * Everything the FREE boost decision reads, in one statement: it was up to five sequential reads
 * (the user, an accounts count, a passkeys count, then the latest of each), and the summary ran
 * that sequence twice.
 */
function prepareBoostFactsQuery(db: D1Database, userId: string, month: string): D1PreparedStatement {
  return db.prepare(`
    SELECT
      (SELECT email_state FROM ${USERS_TABLE} WHERE id = ?1) AS email_state,
      (SELECT email_verified FROM ${USERS_TABLE} WHERE id = ?1) AS email_verified,
      (SELECT COUNT(1) FROM ${ACCOUNTS_TABLE} WHERE user_id = ?1) AS oauth_total,
      (SELECT MAX(created_at) FROM ${ACCOUNTS_TABLE} WHERE user_id = ?1) AS oauth_latest,
      (SELECT COUNT(1) FROM ${PASSKEYS_TABLE} WHERE user_id = ?1) AS passkey_total,
      (SELECT MAX(created_at) FROM ${PASSKEYS_TABLE} WHERE user_id = ?1) AS passkey_latest,
      (SELECT claimed_at FROM ${CREDIT_BOOST_CLAIMS_TABLE} WHERE user_id = ?1 AND month = ?2 LIMIT 1) AS boost_claimed_at
  `).bind(userId, month)
}

function deriveBoostContext(row: BoostFactsRow | null | undefined): BoostContext {
  const emailVerified = row?.email_state === 'verified'
  const oauthLinked = Number(row?.oauth_total ?? 0) > 0
  const passkeyBound = Number(row?.passkey_total ?? 0) > 0
  const eligible = emailVerified && oauthLinked && passkeyBound

  let activatedMonth: string | null = null
  if (eligible) {
    const emailVerifiedAt = row?.email_verified ? Date.parse(row.email_verified) : Number.NaN
    const oauthAt = row?.oauth_latest ? Date.parse(row.oauth_latest) : Number.NaN
    const passkeyAt = row?.passkey_latest ? Date.parse(row.passkey_latest) : Number.NaN
    const latest = Math.max(
      Number.isNaN(emailVerifiedAt) ? 0 : emailVerifiedAt,
      Number.isNaN(oauthAt) ? 0 : oauthAt,
      Number.isNaN(passkeyAt) ? 0 : passkeyAt,
    )
    if (latest > 0) {
      activatedMonth = getMonthKey(new Date(latest))
    }
  }

  return {
    requirements: {
      emailVerified,
      oauthLinked,
      passkeyBound,
    },
    eligible,
    activatedMonth,
  }
}

async function readBoostFacts(event: H3Event, userId: string, month: string): Promise<BoostFactsRow | null> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)
  return await prepareBoostFactsQuery(db, userId, month).first<BoostFactsRow>()
}

function personalQuotaFromBoost(baseQuota: number, month: string, plan: CreditPlan, context: BoostContext): number {
  if (plan !== 'FREE')
    return baseQuota
  if (!context.eligible)
    return baseQuota
  if (context.activatedMonth && context.activatedMonth !== month)
    return BOOSTED_PERSONAL_QUOTA
  return baseQuota
}

export async function getCreditBoostStatus(
  event: H3Event,
  userId: string,
  month: string = getMonthKey(),
  plan: CreditPlan = 'FREE',
): Promise<CreditBoostStatus> {
  if (plan !== 'FREE') {
    return {
      eligible: false,
      requirements: {
        emailVerified: false,
        oauthLinked: false,
        passkeyBound: false,
      },
      claimedThisMonth: false,
      baseQuota: DEFAULT_PERSONAL_QUOTA,
      boostedQuota: BOOSTED_PERSONAL_QUOTA,
    }
  }
  const facts = await readBoostFacts(event, userId, month)
  return boostStatusFromFacts(facts)
}

function boostStatusFromFacts(facts: BoostFactsRow | null | undefined): CreditBoostStatus {
  const context = deriveBoostContext(facts)
  return {
    eligible: context.eligible,
    requirements: context.requirements,
    claimedThisMonth: Boolean(facts?.boost_claimed_at),
    baseQuota: DEFAULT_PERSONAL_QUOTA,
    boostedQuota: BOOSTED_PERSONAL_QUOTA,
  }
}

/** The two idempotent inserts that give a user their personal team, for callers batching them. */
export function preparePersonalTeamStatements(db: D1Database, userId: string): D1PreparedStatement[] {
  const teamId = `team_${userId}`
  const now = new Date().toISOString()
  return [
    db.prepare(`
      INSERT OR IGNORE INTO ${TEAMS_TABLE} (id, name, type, owner_user_id, created_at)
      VALUES (?, ?, 'personal', ?, ?)
    `).bind(teamId, 'Personal', userId, now),
    db.prepare(`
      INSERT OR IGNORE INTO ${TEAM_MEMBERS_TABLE} (team_id, user_id, role, joined_at)
      VALUES (?, ?, 'owner', ?)
    `).bind(teamId, userId, now),
  ]
}

export async function ensurePersonalTeam(event: H3Event, userId: string): Promise<string> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)
  // One round trip for both inserts; they were two.
  await db.batch(preparePersonalTeamStatements(db, userId))
  return `team_${userId}`
}

/** The statement that counts a team's members, for callers batching it with other reads. */
export function prepareTeamMemberCountQuery(db: D1Database, teamId: string): D1PreparedStatement {
  return db.prepare(`
    SELECT COUNT(*) AS total
    FROM ${TEAM_MEMBERS_TABLE}
    WHERE team_id = ?
  `).bind(teamId)
}

export async function ensureCreditsTables(db: D1Database): Promise<void> {
  await ensureCreditsSchema(db)
}

export async function getTeamById(event: H3Event, teamId: string): Promise<TeamRecord | null> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)

  const row = await db.prepare(`
    SELECT * FROM ${TEAMS_TABLE}
    WHERE id = ?
    LIMIT 1
  `).bind(teamId).first<D1TeamRow>()

  return row ? mapTeamRow(row) : null
}

/** The statement listing a user's teams: organizations first, then by join time. */
function prepareUserTeamsQuery(db: D1Database, userId: string): D1PreparedStatement {
  return db.prepare(`
    SELECT
      t.id,
      t.name,
      t.type,
      t.owner_user_id,
      t.created_at,
      tm.role,
      tm.joined_at
    FROM ${TEAM_MEMBERS_TABLE} tm
    INNER JOIN ${TEAMS_TABLE} t ON t.id = tm.team_id
    WHERE tm.user_id = ?
    ORDER BY
      CASE WHEN t.type = 'organization' THEN 0 ELSE 1 END,
      tm.joined_at ASC
  `).bind(userId)
}

function mapUserTeamRows(rows: Array<D1TeamRow & { role: string, joined_at: string }>): UserTeamRecord[] {
  return rows.map((row) => {
    const team = mapTeamRow(row)
    return {
      ...team,
      role: (row.role || 'member') as TeamMemberRole,
      joinedAt: row.joined_at,
    }
  })
}

export async function listUserTeams(event: H3Event, userId: string): Promise<UserTeamRecord[]> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)
  const result = await prepareUserTeamsQuery(db, userId).all<D1TeamRow & { role: string, joined_at: string }>()
  return mapUserTeamRows(result.results ?? [])
}

export interface TeamMemberWithProfile extends TeamMemberRecord {
  name: string | null
  email: string | null
}

/** A team's members with their name and email, in one query; the team page read each user separately. */
export async function listTeamMembersWithProfiles(event: H3Event, teamId: string): Promise<TeamMemberWithProfile[]> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)

  const result = await db.prepare(`
    SELECT tm.team_id, tm.user_id, tm.role, tm.joined_at, u.name AS user_name, u.email AS user_email
    FROM ${TEAM_MEMBERS_TABLE} tm
    LEFT JOIN ${USERS_TABLE} u ON u.id = tm.user_id
    WHERE tm.team_id = ?
    ORDER BY tm.joined_at ASC
  `).bind(teamId).all<D1TeamMemberRow & { user_name: string | null, user_email: string | null }>()

  return (result.results ?? []).map(row => ({
    ...mapTeamMemberRow(row),
    name: row.user_name ?? null,
    email: row.user_email ?? null,
  }))
}

export async function listTeamMembers(event: H3Event, teamId: string): Promise<TeamMemberRecord[]> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)

  const result = await db.prepare(`
    SELECT team_id, user_id, role, joined_at
    FROM ${TEAM_MEMBERS_TABLE}
    WHERE team_id = ?
    ORDER BY joined_at ASC
  `).bind(teamId).all<D1TeamMemberRow>()

  return (result.results ?? []).map(mapTeamMemberRow)
}

export async function getUserRoleInTeam(
  event: H3Event,
  teamId: string,
  userId: string,
): Promise<TeamMemberRole | null> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)

  const row = await db.prepare(`
    SELECT role
    FROM ${TEAM_MEMBERS_TABLE}
    WHERE team_id = ? AND user_id = ?
    LIMIT 1
  `).bind(teamId, userId).first<{ role: string }>()

  return row?.role ? (row.role as TeamMemberRole) : null
}

export async function isUserTeamMember(
  event: H3Event,
  teamId: string,
  userId: string,
): Promise<boolean> {
  const role = await getUserRoleInTeam(event, teamId, userId)
  return Boolean(role)
}

export async function countTeamMembers(event: H3Event, teamId: string): Promise<number> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)

  const row = await db.prepare(`
    SELECT COUNT(*) AS total
    FROM ${TEAM_MEMBERS_TABLE}
    WHERE team_id = ?
  `).bind(teamId).first<{ total: number | string }>()

  return Number(row?.total ?? 0)
}

export async function addTeamMember(
  event: H3Event,
  teamId: string,
  userId: string,
  role: TeamMemberRole = 'member',
): Promise<void> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)

  const now = new Date().toISOString()

  await db.prepare(`
    INSERT OR IGNORE INTO ${TEAM_MEMBERS_TABLE} (team_id, user_id, role, joined_at)
    VALUES (?, ?, ?, ?)
  `).bind(teamId, userId, role, now).run()

  await db.prepare(`
    UPDATE ${TEAM_MEMBERS_TABLE}
    SET role = ?
    WHERE team_id = ? AND user_id = ?
  `).bind(role, teamId, userId).run()
}

export async function removeTeamMember(
  event: H3Event,
  teamId: string,
  userId: string,
): Promise<boolean> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)

  const result = await db.prepare(`
    DELETE FROM ${TEAM_MEMBERS_TABLE}
    WHERE team_id = ? AND user_id = ?
  `).bind(teamId, userId).run()

  const changes = (result.meta as { changes?: number } | undefined)?.changes ?? 0
  return changes > 0
}

export async function createOrganizationTeam(
  event: H3Event,
  ownerUserId: string,
  name?: string,
): Promise<TeamRecord> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)

  const teamId = `org_${crypto.randomUUID().replace(/-/g, '').slice(0, 24)}`
  const now = new Date().toISOString()
  const teamName = (name || '').trim() || 'My Team'

  await db.prepare(`
    INSERT INTO ${TEAMS_TABLE} (id, name, type, owner_user_id, created_at)
    VALUES (?, ?, 'organization', ?, ?)
  `).bind(teamId, teamName, ownerUserId, now).run()

  await addTeamMember(event, teamId, ownerUserId, 'owner')

  return {
    id: teamId,
    name: teamName,
    type: 'organization',
    ownerUserId,
    createdAt: now,
  }
}

export async function deleteTeam(event: H3Event, teamId: string): Promise<void> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)

  await db.prepare(`
    DELETE FROM ${TEAM_MEMBERS_TABLE}
    WHERE team_id = ?
  `).bind(teamId).run()

  await db.prepare(`
    DELETE FROM ${TEAMS_TABLE}
    WHERE id = ?
  `).bind(teamId).run()
}

/**
 * The quota a user's month balance never goes below: the plan's personal
 * allowance — for FREE, the boosted allowance once the profile was completed in
 * an earlier month (`personalQuotaFromBoost`).
 *
 * `ensureBalance` raises a user's balance to it on every read and write, and an
 * administrator's deduction may not take the quota under it (`adjustUserCredits`).
 * Both read it here: a deduction checked against a different number than the one
 * the next read raises the balance back to "succeeds" and is then undone by that
 * read, with its ledger row and audit left behind.
 */
async function resolveUserQuotaFloor(event: H3Event, userId: string, month: string): Promise<number> {
  return (await readUserAllowance(event, userId, month)).floor
}

/**
 * The user's plan and boost facts, read side by side, and the quota floor they set. The two reads
 * used to run one after the other.
 */
async function readUserAllowance(event: H3Event, userId: string, month: string) {
  const [subscription, facts] = await Promise.all([
    getUserSubscription(event, userId),
    readBoostFacts(event, userId, month),
  ])
  const plan = subscription.plan as CreditPlan
  const basePersonalQuota = resolveCreditAmount(PERSONAL_QUOTA_BY_PLAN[plan] ?? DEFAULT_PERSONAL_QUOTA)
  return { plan, facts, floor: personalQuotaFromBoost(basePersonalQuota, month, plan, deriveBoostContext(facts)) }
}

/** Opens the scope's month row at `floor` and raises an existing row to it, for callers batching them. */
function prepareBalanceOpen(db: D1Database, scope: 'team' | 'user', scopeId: string, month: string, floor: number): D1PreparedStatement[] {
  return [
    db.prepare(`
      INSERT OR IGNORE INTO ${CREDIT_BALANCES_TABLE} (scope, scope_id, month, quota, used)
      VALUES (?, ?, ?, ?, 0)
    `).bind(scope, scopeId, month, floor),
    db.prepare(`
      UPDATE ${CREDIT_BALANCES_TABLE}
      SET quota = ?
      WHERE scope = ? AND scope_id = ? AND month = ? AND quota < ?
    `).bind(floor, scope, scopeId, month, floor),
  ]
}

/**
 * Opens this month's balance for the scope and raises its quota to the scope's
 * allowance — a user's quota floor (`resolveUserQuotaFloor`), a team's pool —
 * which it returns.
 */
async function ensureBalance(event: H3Event, scope: 'team' | 'user', scopeId: string): Promise<number> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)
  const month = getMonthKey()
  const quota = scope === 'user'
    ? await resolveUserQuotaFloor(event, scopeId, month)
    : await resolveTeamQuotaByPlan(event, scopeId, await resolvePlanForScope(event, scope, scopeId))
  // Open the month's row and raise it to the floor in one round trip; they were two.
  await db.batch(prepareBalanceOpen(db, scope, scopeId, month, quota))
  return quota
}

async function resolveActiveCreditTeam(event: H3Event, userId: string) {
  const personalTeamId = `team_${userId}`
  const teams = await listUserTeams(event, userId)
  const organizationTeam = teams.find(team => team.type === 'organization') || null
  let personalTeam = teams.find(team => team.id === personalTeamId) || null
  if (!personalTeam) {
    await ensurePersonalTeam(event, userId)
    personalTeam = {
      id: personalTeamId,
      name: 'Personal',
      type: 'personal',
      ownerUserId: userId,
      createdAt: new Date().toISOString(),
      role: 'owner',
      joinedAt: new Date().toISOString(),
    }
  }
  const activeTeam = organizationTeam || personalTeam
  return {
    personalTeamId,
    activeTeam,
    teamId: activeTeam?.id || personalTeamId,
    hasTeamPool: activeTeam?.type === 'organization',
  }
}

/**
 * The balance a credit-pool scope draws from for the active team: the user's first organization (by
 * join time), else their personal team — `resolveActiveCreditTeam`'s choice, as SQL, so the summary
 * can read that team's balance in the same batch as everything else.
 */
const ACTIVE_CREDIT_TEAM_SQL = `COALESCE(
  (
    SELECT t.id FROM ${TEAM_MEMBERS_TABLE} tm
    INNER JOIN ${TEAMS_TABLE} t ON t.id = tm.team_id
    WHERE tm.user_id = ?1 AND t.type = 'organization'
    ORDER BY tm.joined_at ASC
    LIMIT 1
  ),
  'team_' || ?1
)`

interface BalanceRow { quota?: unknown, used?: unknown }

/**
 * The credit summary in one round trip in the steady state: teams, both balances and the boost facts
 * in a single batch, the plan read beside it. It was nine to thirteen sequential reads for a FREE user (the boost
 * context alone ran twice), on every page of the web dashboard and on the desktop. A balance row
 * that is missing or below its floor still goes through `ensureBalance`, as before.
 */
export async function getCreditSummary(event: H3Event, userId: string) {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)
  const month = getMonthKey()

  // The plan is read alongside the batch, not after it: both are one round trip of latency.
  const [[teamsResult, teamBalanceResult, userBalanceResult, boostResult], subscription] = await Promise.all([db.batch([
    prepareUserTeamsQuery(db, userId),
    db.prepare(`
      SELECT * FROM ${CREDIT_BALANCES_TABLE} WHERE scope = 'team' AND scope_id = ${ACTIVE_CREDIT_TEAM_SQL} AND month = ?2
    `).bind(userId, month),
    db.prepare(`
      SELECT * FROM ${CREDIT_BALANCES_TABLE} WHERE scope = 'user' AND scope_id = ? AND month = ?
    `).bind(userId, month),
    prepareBoostFactsQuery(db, userId, month),
  ]), getUserSubscription(event, userId)])

  const teams = mapUserTeamRows((teamsResult?.results ?? []) as Array<D1TeamRow & { role: string, joined_at: string }>)
  const plan = subscription.plan as CreditPlan
  const boostFacts = (boostResult?.results?.[0] ?? null) as BoostFactsRow | null
  let teamBalance = (teamBalanceResult?.results?.[0] ?? null) as BalanceRow | null
  let userBalance = (userBalanceResult?.results?.[0] ?? null) as BalanceRow | null

  const personalTeamId = `team_${userId}`
  const organizationTeam = teams.find(team => team.type === 'organization') || null
  let personalTeam = teams.find(team => team.id === personalTeamId) || null
  if (!personalTeam) {
    await ensurePersonalTeam(event, userId)
    personalTeam = {
      id: personalTeamId,
      name: 'Personal',
      type: 'personal',
      ownerUserId: userId,
      createdAt: new Date().toISOString(),
      role: 'owner',
      joinedAt: new Date().toISOString(),
    }
  }
  const activeTeam = organizationTeam || personalTeam
  const activeCreditTeam = {
    personalTeamId,
    activeTeam,
    teamId: activeTeam.id,
    hasTeamPool: activeTeam.type === 'organization',
  }

  const basePersonalQuota = resolveCreditAmount(PERSONAL_QUOTA_BY_PLAN[plan] ?? DEFAULT_PERSONAL_QUOTA)
  const expectedPersonalQuota = personalQuotaFromBoost(basePersonalQuota, month, plan, deriveBoostContext(boostFacts))
  const expectedTeamQuota = activeCreditTeam.hasTeamPool
    ? await resolveTeamQuotaByPlan(event, activeCreditTeam.teamId, plan)
    : DEFAULT_TEAM_QUOTA

  const needsUserEnsure = !userBalance || Number(userBalance.quota ?? 0) < expectedPersonalQuota
  const needsTeamEnsure = !teamBalance || Number(teamBalance.quota ?? 0) < expectedTeamQuota

  if (needsUserEnsure || needsTeamEnsure) {
    await Promise.all([
      needsUserEnsure ? ensureBalance(event, 'user', userId) : null,
      needsTeamEnsure ? ensureBalance(event, 'team', activeCreditTeam.personalTeamId) : null,
      needsTeamEnsure && activeCreditTeam.hasTeamPool ? ensureBalance(event, 'team', activeCreditTeam.teamId) : null,
    ])
    const [teamReread, userReread] = await db.batch([
      db.prepare(`
        SELECT * FROM ${CREDIT_BALANCES_TABLE} WHERE scope = 'team' AND scope_id = ? AND month = ?
      `).bind(activeCreditTeam.teamId, month),
      db.prepare(`
        SELECT * FROM ${CREDIT_BALANCES_TABLE} WHERE scope = 'user' AND scope_id = ? AND month = ?
      `).bind(userId, month),
    ])
    if (needsTeamEnsure)
      teamBalance = (teamReread?.results?.[0] ?? null) as BalanceRow | null
    if (needsUserEnsure)
      userBalance = (userReread?.results?.[0] ?? null) as BalanceRow | null
  }

  const boost = plan === 'FREE' ? boostStatusFromFacts(boostFacts) : null
  const userQuota = resolveCreditAmount(userBalance?.quota ?? 0)
  const canClaimNow = boost ? (boost.eligible && !boost.claimedThisMonth && userQuota < BOOSTED_PERSONAL_QUOTA) : false
  return {
    month,
    team: normalizeCreditBalanceRow(teamBalance),
    user: normalizeCreditBalanceRow(userBalance),
    teamContext: activeCreditTeam.activeTeam
      ? {
          id: activeCreditTeam.activeTeam.id,
          name: activeCreditTeam.activeTeam.name,
          type: activeCreditTeam.activeTeam.type,
          hasTeamPool: activeCreditTeam.hasTeamPool,
        }
      : null,
    boost: boost
      ? {
          ...boost,
          canClaimNow,
        }
      : null,
  }
}

/**
 * Raises a FREE user's month to the boosted allowance, once a month: one read, then one atomic batch.
 * It was the plan and boost reads (twice: again inside `ensureBalance`), the claim, a balance read and
 * two writes, with a compensating delete when a write threw — and a request that died in between left
 * the month claimed and the boost never applied.
 *
 * The writes are conditioned on the month being unclaimed and the claim row is written last. D1 runs
 * a batch on its own, as one transaction, so racing requests apply the boost once.
 */
export async function claimCreditBoost(event: H3Event, userId: string) {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)
  const month = getMonthKey()
  const { plan, facts, floor } = await readUserAllowance(event, userId, month)
  if (plan !== 'FREE') {
    return {
      eligible: false,
      claimed: false,
      reason: 'not-free',
      boost: null,
    }
  }
  const boost = boostStatusFromFacts(facts)
  if (!boost.eligible) {
    return {
      eligible: false,
      claimed: false,
      reason: 'not-eligible',
      boost,
    }
  }
  if (boost.claimedThisMonth) {
    return {
      eligible: true,
      claimed: false,
      reason: 'already-claimed',
      boost,
    }
  }

  const now = new Date().toISOString()
  const ledgerId = crypto.randomUUID()
  const unclaimed = `NOT EXISTS (SELECT 1 FROM ${CREDIT_BOOST_CLAIMS_TABLE} WHERE user_id = ? AND month = ?)`
  const results = await db.batch([
    ...prepareBalanceOpen(db, 'user', userId, month, floor),
    db.prepare(`
      INSERT INTO ${CREDIT_LEDGER_TABLE} (id, scope, scope_id, delta, reason, created_at, metadata)
      SELECT ?, 'user', ?, ? - quota, 'verification-boost', ?, ?
      FROM ${CREDIT_BALANCES_TABLE}
      WHERE scope = 'user' AND scope_id = ? AND month = ? AND quota < ? AND ${unclaimed}
    `).bind(
      ledgerId,
      userId,
      BOOSTED_PERSONAL_QUOTA,
      now,
      JSON.stringify({ userId, month }),
      userId,
      month,
      BOOSTED_PERSONAL_QUOTA,
      userId,
      month,
    ),
    db.prepare(`
      UPDATE ${CREDIT_BALANCES_TABLE}
      SET quota = ?
      WHERE scope = 'user' AND scope_id = ? AND month = ? AND quota < ? AND ${unclaimed}
    `).bind(BOOSTED_PERSONAL_QUOTA, userId, month, BOOSTED_PERSONAL_QUOTA, userId, month),
    db.prepare(`
      INSERT OR IGNORE INTO ${CREDIT_BOOST_CLAIMS_TABLE} (user_id, month, claimed_at)
      VALUES (?, ?, ?)
    `).bind(userId, month, now),
    db.prepare(`SELECT delta FROM ${CREDIT_LEDGER_TABLE} WHERE id = ?`).bind(ledgerId),
  ])

  const [claimResult, ledgerResult] = results.slice(-2)
  if (Number((claimResult?.meta as { changes?: number } | undefined)?.changes ?? 0) < 1) {
    return {
      eligible: true,
      claimed: false,
      reason: 'already-claimed',
      boost: {
        ...boost,
        claimedThisMonth: true,
      },
    }
  }

  const delta = normalizeCreditAmount(Number((ledgerResult?.results?.[0] as { delta?: unknown } | undefined)?.delta ?? 0))
  return {
    eligible: true,
    claimed: true,
    delta,
    boost: {
      ...boost,
      claimedThisMonth: true,
    },
  }
}

export async function getCheckinStatus(event: H3Event, userId: string): Promise<CreditCheckinStatus> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)
  const day = getDayKey()
  const row = await db.prepare(`
    SELECT claimed_at FROM ${CREDIT_CHECKINS_TABLE}
    WHERE user_id = ? AND day = ?
    LIMIT 1
  `).bind(userId, day).first()

  return {
    day,
    checkedInToday: Boolean(row?.claimed_at),
    reward: CHECKIN_REWARD,
  }
}

export async function listCheckinsByMonth(event: H3Event, userId: string, monthInput?: string) {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)

  const currentMonth = getMonthKey()
  const month = typeof monthInput === 'string' && /^\d{4}-\d{2}$/.test(monthInput)
    ? monthInput
    : currentMonth
  const [yearPart, monthPart] = month.split('-')
  const year = Number(yearPart)
  const monthIndex = Number(monthPart) - 1

  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return listCheckinsByMonth(event, userId, currentMonth)
  }

  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
  const startDay = `${month}-01`
  const endDay = `${month}-${`${daysInMonth}`.padStart(2, '0')}`

  const { results } = await db.prepare(`
    SELECT day
    FROM ${CREDIT_CHECKINS_TABLE}
    WHERE user_id = ?
      AND day >= ?
      AND day <= ?
    ORDER BY day ASC
  `).bind(userId, startDay, endDay).all<{ day: string }>()

  const days = (results ?? []).map(row => row.day).filter(Boolean)

  return {
    month,
    days,
    reward: CHECKIN_REWARD,
  }
}

/**
 * Today's check-in: one read, then one atomic batch. It was the claim, the plan and boost reads inside
 * `ensureBalance`, then two writes, with a compensating delete when a write threw — and a request that
 * died in between left the day claimed and the reward never paid. As in `claimCreditBoost`, the
 * reward is conditioned on the day being unclaimed and the claim row comes last.
 */
export async function claimDailyCheckin(event: H3Event, userId: string) {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)
  const now = new Date()
  const day = getDayKey(now)
  const month = getMonthKey(now)
  const claimedAt = now.toISOString()
  const delta = normalizeCreditAmount(CHECKIN_REWARD)
  const { floor } = await readUserAllowance(event, userId, month)

  const unclaimed = `NOT EXISTS (SELECT 1 FROM ${CREDIT_CHECKINS_TABLE} WHERE user_id = ? AND day = ?)`
  const results = await db.batch([
    ...prepareBalanceOpen(db, 'user', userId, month, floor),
    db.prepare(`
      UPDATE ${CREDIT_BALANCES_TABLE}
      SET quota = quota + ?
      WHERE scope = 'user' AND scope_id = ? AND month = ? AND ${unclaimed}
    `).bind(delta, userId, month, userId, day),
    db.prepare(`
      INSERT INTO ${CREDIT_LEDGER_TABLE} (id, scope, scope_id, delta, reason, created_at, metadata)
      SELECT ?, 'user', ?, ?, 'daily-checkin', ?, ?
      WHERE ${unclaimed}
    `).bind(crypto.randomUUID(), userId, delta, claimedAt, JSON.stringify({ userId, day }), userId, day),
    db.prepare(`
      INSERT OR IGNORE INTO ${CREDIT_CHECKINS_TABLE} (user_id, day, claimed_at)
      VALUES (?, ?, ?)
    `).bind(userId, day, claimedAt),
  ])

  if (Number((results.at(-1)?.meta as { changes?: number } | undefined)?.changes ?? 0) < 1) {
    return {
      claimed: false,
      day,
      reward: CHECKIN_REWARD,
    }
  }
  return {
    claimed: true,
    day,
    reward: delta,
  }
}

export interface CreditConsumptionResult {
  ledgerId: string
  teamId: string
  userId: string
  amount: number
  reason: string
  createdAt: string
  metadata: Record<string, any>
  idempotencyKey?: string
}

export interface CreditAdjustmentResult {
  ledgerId: string
  userId: string
  delta: number
  reason: string
  createdAt: string
}

/**
 * How far an administrator can lower a user's quota this month. The quota may
 * not go under the plan's allowance (`planFloor`), which every read raises it
 * back to, nor under the credits already used this month.
 */
export interface UserCreditAdjustLimits {
  /** The plan's monthly allowance: `resolveUserQuotaFloor`. */
  planFloor: number
  /** Credits used this month. */
  used: number
  /** This month's quota. */
  quota: number
  /** `MAX(0, quota - MAX(planFloor, used))`: the most one deduction can take now. */
  maxDeduct: number
}

/**
 * A deduction refused because it would take the quota under its floor. Nothing
 * was written: not the balance, not a ledger row. `limits` is read after the
 * refusal, so it is what the next deduction is checked against.
 */
export class CreditDeductLimitError extends Error {
  readonly errorCode = 'CREDITS_DEDUCT_LIMIT'

  constructor(readonly limits: UserCreditAdjustLimits) {
    super('Credit deduction exceeds the adjustable amount.')
    this.name = 'CreditDeductLimitError'
  }
}

function toUserCreditAdjustLimits(planFloor: number, quota: number, used: number): UserCreditAdjustLimits {
  return {
    planFloor,
    used,
    quota,
    maxDeduct: Math.max(0, quota - Math.max(planFloor, used)),
  }
}

/** This month's deduction limits for a user, with the month's balance opened (and raised to the floor) first. */
export async function getUserCreditAdjustLimits(event: H3Event, userId: string): Promise<UserCreditAdjustLimits> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)
  const planFloor = await ensureBalance(event, 'user', userId)
  const balance = await db.prepare(`
    SELECT quota, used FROM ${CREDIT_BALANCES_TABLE}
    WHERE scope = 'user' AND scope_id = ? AND month = ?
  `).bind(userId, getMonthKey()).first<{ quota?: number, used?: number }>()

  return toUserCreditAdjustLimits(
    planFloor,
    resolveCreditAmount(balance?.quota ?? 0),
    resolveCreditAmount(balance?.used ?? 0),
  )
}

/**
 * Raises or lowers a user's quota for this month and records the change in the
 * ledger.
 *
 * A deduction may not take the quota under `MAX(planFloor, used)`
 * (`UserCreditAdjustLimits`). The check is the `UPDATE`'s own condition, so two
 * deductions running at once cannot both pass it, and one past the floor is
 * refused whole with `CreditDeductLimitError` — never clamped, and nothing is
 * written for it. Without the condition a deduction under the plan allowance was
 * written, ledgered and audited, and the very next read (`ensureBalance`) raised
 * the quota straight back, leaving a ledger the balance does not add up to.
 */
export async function adjustUserCredits(
  event: H3Event,
  userId: string,
  delta: number,
  reason: string,
  metadata?: Record<string, any>,
): Promise<CreditAdjustmentResult> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)
  const planFloor = await ensureBalance(event, 'user', userId)

  const normalizedDelta = resolveCreditAmount(delta)
  if (!normalizedDelta)
    throw new Error('Invalid credit amount.')

  const month = getMonthKey()
  const update = normalizedDelta > 0
    ? db.prepare(`
        UPDATE ${CREDIT_BALANCES_TABLE}
        SET quota = quota + ?
        WHERE scope = 'user' AND scope_id = ? AND month = ?
      `).bind(normalizedDelta, userId, month)
    : db.prepare(`
        UPDATE ${CREDIT_BALANCES_TABLE}
        SET quota = quota + ?
        WHERE scope = 'user' AND scope_id = ? AND month = ?
          AND quota + ? >= MAX(?, used)
      `).bind(normalizedDelta, userId, month, normalizedDelta, planFloor)
  const updated = await update.run()
  if (((updated.meta as { changes?: number } | undefined)?.changes ?? 0) < 1) {
    if (normalizedDelta < 0)
      throw new CreditDeductLimitError(await getUserCreditAdjustLimits(event, userId))
    throw new Error('Credit balance update failed.')
  }

  const now = new Date().toISOString()
  const ledgerId = crypto.randomUUID()
  await db.prepare(`
    INSERT INTO ${CREDIT_LEDGER_TABLE} (id, scope, scope_id, delta, reason, created_at, metadata)
    VALUES (?, 'user', ?, ?, ?, ?, ?)
  `).bind(
    ledgerId,
    userId,
    normalizedDelta,
    reason,
    now,
    JSON.stringify({ ...(metadata ?? {}), userId }),
  ).run()

  return {
    ledgerId,
    userId,
    delta: normalizedDelta,
    reason,
    createdAt: now,
  }
}

interface LedgerIdempotencyRow {
  id: string
  delta: number
  created_at: string
  metadata?: string | null
  idempotency_hash?: string | null
}

function isUniqueConstraintError(error: unknown): boolean {
  return /UNIQUE constraint failed/i.test(error instanceof Error ? error.message : String(error))
}

/**
 * Debits `amount` from the user's active credit team and from the user, atomically.
 *
 * Two round trips: one batch reads the user's teams, both balances, the boost facts and any earlier
 * debit under the same idempotency key (the plan is read beside it); a second batch opens and raises
 * both month rows to their floors, writes the ledger row only if both balances can take the debit,
 * moves both `used` counters, and reads the balances back to say which one refused. It was about a
 * dozen sequential round trips before (two `ensureBalance`s, each re-deriving plan and boost, then
 * two balance reads and an idempotency read).
 *
 * An idempotency key that already has a debit returns it before any balance check: a retry of a debit
 * that spent the last credits used to fail as "exceeded" instead of returning the original. A
 * concurrent retry that loses the unique index returns the winner's row.
 */
export async function consumeCredits(
  event: H3Event,
  userId: string,
  amount: number,
  reason: string,
  metadata?: Record<string, any>,
  options: { idempotencyKey?: string } = {},
): Promise<CreditConsumptionResult> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)
  const numericAmount = Number(amount)
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error('Invalid credit amount.')
  }
  const normalizedAmount = Math.max(1, normalizeCreditAmount(numericAmount))
  const month = getMonthKey()
  const idempotencyKey = normalizeCreditIdempotencyKey(options.idempotencyKey)

  const [[teamsResult, existingResult, boostResult], subscription] = await Promise.all([db.batch([
    prepareUserTeamsQuery(db, userId),
    db.prepare(`
      SELECT id, delta, created_at, metadata, idempotency_hash
      FROM ${CREDIT_LEDGER_TABLE}
      WHERE scope = 'team'
        AND scope_id = ${ACTIVE_CREDIT_TEAM_SQL}
        AND reason = ?2
        AND idempotency_key = ?3
      LIMIT 1
    `).bind(userId, reason, idempotencyKey),
    prepareBoostFactsQuery(db, userId, month),
  ]), getUserSubscription(event, userId)])

  const teams = mapUserTeamRows((teamsResult?.results ?? []) as Array<D1TeamRow & { role: string, joined_at: string }>)
  const personalTeamId = `team_${userId}`
  if (!teams.some(team => team.id === personalTeamId))
    await ensurePersonalTeam(event, userId)
  const organizationTeam = teams.find(team => team.type === 'organization') || null
  const teamId = organizationTeam?.id ?? personalTeamId

  const ledgerMetadata = metadata ? { ...metadata, userId } : { userId }
  const idempotencyHash = idempotencyKey
    ? digestCreditConsumptionPayload({
        userId,
        teamId,
        amount: normalizedAmount,
        reason,
        metadata: ledgerMetadata,
      })
    : null

  const toExistingResult = (existing: LedgerIdempotencyRow): CreditConsumptionResult => {
    if (existing.idempotency_hash && existing.idempotency_hash !== idempotencyHash)
      throw new Error('Credit idempotency conflict.')
    const existingMetadata = parseLedgerMetadata(existing.metadata ?? null)
    return {
      ledgerId: existing.id,
      teamId,
      userId,
      amount: Math.abs(resolveCreditAmount(existing.delta)),
      reason,
      createdAt: existing.created_at,
      metadata: existingMetadata && Object.keys(existingMetadata).length ? existingMetadata : ledgerMetadata,
      idempotencyKey: idempotencyKey!,
    }
  }

  const existing = idempotencyKey ? (existingResult?.results?.[0] as LedgerIdempotencyRow | undefined) : undefined
  if (existing)
    return toExistingResult(existing)

  // The month floors `ensureBalance` would apply. An organization pool's floor depends on its owner's
  // plan and seat quota, so that rarer case keeps going through `ensureBalance` itself.
  const plan = subscription.plan as CreditPlan
  const basePersonalQuota = resolveCreditAmount(PERSONAL_QUOTA_BY_PLAN[plan] ?? DEFAULT_PERSONAL_QUOTA)
  const userFloor = personalQuotaFromBoost(basePersonalQuota, month, plan, deriveBoostContext((boostResult?.results?.[0] ?? null) as BoostFactsRow | null))
  if (organizationTeam)
    await ensureBalance(event, 'team', organizationTeam.id)

  const readBalance = (scope: 'team' | 'user', scopeId: string) => db.prepare(`
    SELECT quota, used FROM ${CREDIT_BALANCES_TABLE} WHERE scope = ? AND scope_id = ? AND month = ?
  `).bind(scope, scopeId, month)

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  let results: Awaited<ReturnType<D1Database['batch']>>
  try {
    results = await db.batch([
      ...(organizationTeam ? [] : prepareBalanceOpen(db, 'team', teamId, month, DEFAULT_TEAM_QUOTA)),
      ...prepareBalanceOpen(db, 'user', userId, month, userFloor),
      db.prepare(`
        INSERT INTO ${CREDIT_LEDGER_TABLE} (
          id, scope, scope_id, delta, reason, created_at, metadata, idempotency_key, idempotency_hash
        )
        SELECT ?, 'team', ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM ${CREDIT_BALANCES_TABLE}
          WHERE scope = 'team' AND scope_id = ? AND month = ? AND used + ? <= quota
        )
        AND EXISTS (
          SELECT 1 FROM ${CREDIT_BALANCES_TABLE}
          WHERE scope = 'user' AND scope_id = ? AND month = ? AND used + ? <= quota
        )
      `).bind(
        id,
        teamId,
        -normalizedAmount,
        reason,
        now,
        JSON.stringify(ledgerMetadata),
        idempotencyKey,
        idempotencyHash,
        teamId,
        month,
        normalizedAmount,
        userId,
        month,
        normalizedAmount,
      ),
      db.prepare(`
        UPDATE ${CREDIT_BALANCES_TABLE}
        SET used = used + ?
        WHERE scope = 'team'
          AND scope_id = ?
          AND month = ?
          AND EXISTS (SELECT 1 FROM ${CREDIT_LEDGER_TABLE} WHERE id = ?)
      `).bind(normalizedAmount, teamId, month, id),
      db.prepare(`
        UPDATE ${CREDIT_BALANCES_TABLE}
        SET used = used + ?
        WHERE scope = 'user'
          AND scope_id = ?
          AND month = ?
          AND EXISTS (SELECT 1 FROM ${CREDIT_LEDGER_TABLE} WHERE id = ?)
      `).bind(normalizedAmount, userId, month, id),
      readBalance('team', teamId),
      readBalance('user', userId),
    ])
  }
  catch (error) {
    // A concurrent request with the same key inserted first: answer with its row.
    if (idempotencyKey && isUniqueConstraintError(error)) {
      const winner = await db.prepare(`
        SELECT id, delta, created_at, metadata, idempotency_hash
        FROM ${CREDIT_LEDGER_TABLE}
        WHERE scope = 'team' AND scope_id = ? AND reason = ? AND idempotency_key = ?
        LIMIT 1
      `).bind(teamId, reason, idempotencyKey).first<LedgerIdempotencyRow>()
      if (winner)
        return toExistingResult(winner)
    }
    throw error
  }

  const [insertResult, teamUpdate, userUpdate, teamBalanceResult, userBalanceResult] = results.slice(-5)
  const insertedLedger = Number((insertResult?.meta as { changes?: number } | undefined)?.changes ?? 0)
  if (insertedLedger < 1) {
    const teamBalance = teamBalanceResult?.results?.[0] as { quota?: unknown, used?: unknown } | undefined
    const userBalance = userBalanceResult?.results?.[0] as { quota?: unknown, used?: unknown } | undefined
    if (sumCredits(resolveCreditAmount(teamBalance?.used ?? 0), normalizedAmount) > resolveCreditAmount(teamBalance?.quota ?? 0))
      throw new Error('Team credits exceeded.')
    if (sumCredits(resolveCreditAmount(userBalance?.used ?? 0), normalizedAmount) > resolveCreditAmount(userBalance?.quota ?? 0))
      throw new Error('User credits exceeded.')
    throw new Error('Credits exceeded.')
  }
  if (Number((teamUpdate?.meta as { changes?: number } | undefined)?.changes ?? 0) < 1
    || Number((userUpdate?.meta as { changes?: number } | undefined)?.changes ?? 0) < 1)
    throw new Error('Credit balance update failed.')

  return {
    ledgerId: id,
    teamId,
    userId,
    amount: normalizedAmount,
    reason,
    createdAt: now,
    metadata: ledgerMetadata,
    idempotencyKey: idempotencyKey ?? undefined,
  }
}

/** Resolves an old in-flight reservation without consulting the user's current team. */
export async function findCreditReservationLedgerId(
  event: H3Event,
  userId: string,
  idempotencyKeyInput: string,
): Promise<string | null> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)
  const idempotencyKey = normalizeCreditIdempotencyKey(idempotencyKeyInput)
  if (!idempotencyKey) return null
  const rows = await db
    .prepare(
      `SELECT id, metadata
       FROM ${CREDIT_LEDGER_TABLE}
       WHERE scope = 'team' AND reason = 'asr-reservation' AND idempotency_key = ?
       ORDER BY created_at ASC
       LIMIT 3`,
    )
    .bind(idempotencyKey)
    .all<{ id: string; metadata?: string | null }>()
  const matches = (rows.results ?? []).filter((row) => parseLedgerMetadata(row.metadata ?? null)?.userId === userId)
  return matches.length === 1 ? matches[0]!.id : null
}

/**
 * Releases a prior server-owned reservation. This deliberately mirrors the
 * team-and-user projection used by consumeCredits: a partial release would make
 * an ASR request appear affordable in one balance while remaining held in the
 * other. Callers must use one stable business idempotency key per release.
 */
export async function releaseConsumedCredits(
  event: H3Event,
  userId: string,
  amount: number,
  reason: string,
  metadata?: Record<string, unknown>,
  options: { idempotencyKey?: string; reservationLedgerId?: string } = {},
): Promise<CreditConsumptionResult> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)

  const numericAmount = Number(amount)
  if (!Number.isFinite(numericAmount) || numericAmount <= 0)
    throw new Error('Invalid credit release amount.')
  const normalizedAmount = Math.max(1, normalizeCreditAmount(numericAmount))
  const reservationLedgerId = options.reservationLedgerId?.trim() || null

  const idempotencyKey = normalizeCreditIdempotencyKey(options.idempotencyKey)

  let teamId: string
  let month: string
  // With a reservation, its row and any earlier release under the same key are read together: the
  // reservation names the team, so the key lookup can find it by subquery.
  let prefetchedExisting: LedgerIdempotencyRow | null | undefined
  if (reservationLedgerId) {
    const [reservationResult, existingResult] = await db.batch([
      db.prepare(`
        SELECT scope_id, delta, created_at, metadata
        FROM ${CREDIT_LEDGER_TABLE}
        WHERE id = ? AND scope = 'team'
        LIMIT 1
      `).bind(reservationLedgerId),
      db.prepare(`
        SELECT id, delta, created_at, metadata, idempotency_hash
        FROM ${CREDIT_LEDGER_TABLE}
        WHERE scope = 'team'
          AND scope_id = (SELECT scope_id FROM ${CREDIT_LEDGER_TABLE} WHERE id = ?1 AND scope = 'team')
          AND reason = ?2
          AND idempotency_key = ?3
        LIMIT 1
      `).bind(reservationLedgerId, reason, idempotencyKey),
    ])
    prefetchedExisting = (existingResult?.results?.[0] as LedgerIdempotencyRow | undefined) ?? null
    const reservation = reservationResult?.results?.[0] as {
      scope_id: string
      delta: number
      created_at: string
      metadata?: string | null
    } | undefined
    const reservationMetadata = parseLedgerMetadata(reservation?.metadata ?? null)
    const reservationDate = new Date(reservation?.created_at ?? '')
    const reservedAmount = Math.abs(resolveCreditAmount(reservation?.delta ?? 0))
    if (
      !reservation ||
      resolveCreditAmount(reservation.delta) >= 0 ||
      reservationMetadata?.userId !== userId ||
      !Number.isFinite(reservationDate.getTime()) ||
      reservedAmount < normalizedAmount
    ) {
      throw new Error('Credit reservation is unavailable for release.')
    }
    teamId = reservation.scope_id
    month = getMonthKey(reservationDate)
  } else {
    const activeCreditTeam = await resolveActiveCreditTeam(event, userId)
    await Promise.all([
      ensureBalance(event, 'team', activeCreditTeam.teamId),
      ensureBalance(event, 'user', userId),
    ])
    teamId = activeCreditTeam.teamId
    month = getMonthKey()
  }

  const ledgerMetadata = {
    ...(metadata ?? {}),
    userId,
    ...(reservationLedgerId ? { reservationLedgerId } : {}),
  }
  const idempotencyHash = idempotencyKey
    ? digestCreditConsumptionPayload({
        userId,
        teamId,
        amount: normalizedAmount,
        reason,
        metadata: ledgerMetadata,
      })
    : null
  const legacyIdempotencyHash =
    idempotencyKey && reservationLedgerId
      ? digestCreditConsumptionPayload({
          userId,
          teamId,
          amount: normalizedAmount,
          reason,
          metadata: { ...(metadata ?? {}), userId },
        })
      : null
  if (idempotencyKey) {
    const existing = prefetchedExisting !== undefined
      ? prefetchedExisting
      : await db.prepare(`
        SELECT id, delta, created_at, metadata, idempotency_hash
        FROM ${CREDIT_LEDGER_TABLE}
        WHERE scope = 'team'
          AND scope_id = ?
          AND reason = ?
          AND idempotency_key = ?
        LIMIT 1
      `).bind(teamId, reason, idempotencyKey).first<LedgerIdempotencyRow>()

    if (existing) {
      const existingMetadata = parseLedgerMetadata(existing.metadata ?? null)
      const existingAmount = Math.abs(resolveCreditAmount(existing.delta))
      const matchesCurrentHash = existing.idempotency_hash === idempotencyHash
      const matchesLegacyAsrHash = Boolean(
        reservationLedgerId &&
        legacyIdempotencyHash &&
        existing.idempotency_hash === legacyIdempotencyHash &&
        existingMetadata?.reservationLedgerId === undefined,
      )
      if (existingAmount !== normalizedAmount || (!matchesCurrentHash && !matchesLegacyAsrHash))
        throw new Error('Credit idempotency conflict.')

      return {
        ledgerId: existing.id,
        teamId,
        userId,
        amount: existingAmount,
        reason,
        createdAt: existing.created_at,
        metadata: existingMetadata && Object.keys(existingMetadata).length ? existingMetadata : ledgerMetadata,
        idempotencyKey,
      }
    }
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const batchResults = await db.batch([
    db.prepare(`
      INSERT INTO ${CREDIT_LEDGER_TABLE} (
        id, scope, scope_id, delta, reason, created_at, metadata, idempotency_key, idempotency_hash
      )
      SELECT ?, 'team', ?, ?, ?, ?, ?, ?, ?
      WHERE EXISTS (
        SELECT 1 FROM ${CREDIT_BALANCES_TABLE}
        WHERE scope = 'team' AND scope_id = ? AND month = ? AND used >= ?
      )
      AND EXISTS (
        SELECT 1 FROM ${CREDIT_BALANCES_TABLE}
        WHERE scope = 'user' AND scope_id = ? AND month = ? AND used >= ?
      )
    `).bind(
      id,
      teamId,
      normalizedAmount,
      reason,
      now,
      JSON.stringify(ledgerMetadata),
      idempotencyKey,
      idempotencyHash,
      teamId,
      month,
      normalizedAmount,
      userId,
      month,
      normalizedAmount,
    ),
    db.prepare(`
      UPDATE ${CREDIT_BALANCES_TABLE}
      SET used = used - ?
      WHERE scope = 'team'
        AND scope_id = ?
        AND month = ?
        AND used >= ?
        AND EXISTS (SELECT 1 FROM ${CREDIT_LEDGER_TABLE} WHERE id = ?)
    `).bind(normalizedAmount, teamId, month, normalizedAmount, id),
    db.prepare(`
      UPDATE ${CREDIT_BALANCES_TABLE}
      SET used = used - ?
      WHERE scope = 'user'
        AND scope_id = ?
        AND month = ?
        AND used >= ?
        AND EXISTS (SELECT 1 FROM ${CREDIT_LEDGER_TABLE} WHERE id = ?)
    `).bind(normalizedAmount, userId, month, normalizedAmount, id),
  ])

  const insertedLedger = Number((batchResults[0] as { meta?: { changes?: number } } | undefined)?.meta?.changes ?? 0)
  const updatedTeam = Number((batchResults[1] as { meta?: { changes?: number } } | undefined)?.meta?.changes ?? 0)
  const updatedUser = Number((batchResults[2] as { meta?: { changes?: number } } | undefined)?.meta?.changes ?? 0)
  if (insertedLedger < 1 || updatedTeam < 1 || updatedUser < 1)
    throw new Error('Credit release failed.')

  return {
    ledgerId: id,
    teamId,
    userId,
    amount: normalizedAmount,
    reason,
    createdAt: now,
    metadata: ledgerMetadata,
    idempotencyKey: idempotencyKey ?? undefined,
  }
}

export async function listCreditLedger(event: H3Event, userId: string) {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)
  const activeCreditTeam = await resolveActiveCreditTeam(event, userId)
  const result = await db.prepare(`
    SELECT * FROM ${CREDIT_LEDGER_TABLE}
    WHERE (scope = 'team' AND scope_id IN (?, ?)) OR (scope = 'user' AND scope_id = ?)
    ORDER BY created_at DESC
    LIMIT 100
  `).bind(activeCreditTeam.teamId, activeCreditTeam.personalTeamId, userId).all()
  return (result.results ?? []).map((row: any) => ({
    ...row,
    delta: resolveCreditAmount(row?.delta ?? 0)
  }))
}

function parseLedgerMetadata(value: string | null): Record<string, any> | null {
  if (!value)
    return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

export async function listCreditUsageByUsers(
  event: H3Event,
  userIds: string[],
  options?: { page?: number; limit?: number; search?: string; month?: string },
) {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)

  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)))
  const month = options?.month || getMonthKey()
  const page = Math.max(1, options?.page ?? 1)
  const limit = Math.min(200, Math.max(1, options?.limit ?? 20))
  const offset = (page - 1) * limit
  const search = options?.search?.trim().toLowerCase() || ''

  if (!uniqueUserIds.length) {
    return {
      month,
      total: 0,
      totalUsed: 0,
      totalQuota: 0,
      users: [],
      page,
      pageSize: limit,
    }
  }

  // Every member's month is opened and raised to their floor, as before, but side by side: this ran
  // member after member, four to five round trips each, before the page could be read. Personal teams
  // are created only for the members that lack one (one query finds them).
  const userIdsJson = JSON.stringify(uniqueUserIds)
  const missingTeams = await db.prepare(`
    SELECT ids.value AS user_id
    FROM json_each(?1) ids
    WHERE NOT EXISTS (
      SELECT 1 FROM ${TEAM_MEMBERS_TABLE} tm
      WHERE tm.team_id = 'team_' || ids.value AND tm.user_id = ids.value
    )
  `).bind(userIdsJson).all<{ user_id: string }>()
  await Promise.all([
    ...(missingTeams.results ?? []).map(row => ensurePersonalTeam(event, row.user_id)),
    ...uniqueUserIds.map(userId => ensureBalance(event, 'user', userId)),
  ])

  // The member list goes in as one JSON parameter: an IN list binds one parameter per member and
  // D1 refuses statements with more than 100.
  const conditions = [
    `cb.scope = 'user'`,
    `cb.month = ?`,
    `cb.scope_id IN (SELECT value FROM json_each(?))`,
  ]
  const params: Array<string | number> = [month, userIdsJson]

  if (search) {
    const term = `%${search}%`
    conditions.push('(LOWER(u.email) LIKE ? OR LOWER(u.name) LIKE ? OR LOWER(cb.scope_id) LIKE ?)')
    params.push(term, term, term)
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`

  const listParams = [...params, limit, offset]
  const [summaryResult, listResult] = await db.batch([
    db.prepare(`
      SELECT COUNT(1) as total, SUM(cb.used) as total_used, SUM(cb.quota) as total_quota
      FROM ${CREDIT_BALANCES_TABLE} cb
      LEFT JOIN ${USERS_TABLE} u ON u.id = cb.scope_id
      ${whereClause}
    `).bind(...params),
    db.prepare(`
    SELECT
      cb.scope_id as user_id,
      cb.quota,
      cb.used,
      cb.month,
      u.email,
      u.name,
      u.role,
      u.status
    FROM ${CREDIT_BALANCES_TABLE} cb
    LEFT JOIN ${USERS_TABLE} u ON u.id = cb.scope_id
    ${whereClause}
    ORDER BY cb.used DESC, cb.scope_id ASC
    LIMIT ? OFFSET ?
  `).bind(...listParams),
  ])
  const summaryRow = summaryResult?.results?.[0] as { total?: number, total_used?: number, total_quota?: number } | undefined
  const results = (listResult?.results ?? []) as Array<Record<string, any>>

  return {
    month,
    total: Number(summaryRow?.total ?? 0),
    totalUsed: resolveCreditAmount(summaryRow?.total_used ?? 0),
    totalQuota: resolveCreditAmount(summaryRow?.total_quota ?? 0),
    users: (results ?? []).map(row => ({
      userId: row.user_id,
      email: row.email ?? null,
      name: row.name ?? null,
      role: row.role ?? null,
      status: row.status ?? null,
      quota: resolveCreditAmount(row.quota ?? 0),
      used: resolveCreditAmount(row.used ?? 0),
      month: row.month ?? month,
    })),
    page,
    pageSize: limit,
  }
}

export async function listCreditLedgerByUsers(
  event: H3Event,
  userIds: string[],
  options?: { page?: number; limit?: number; search?: string },
) {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)

  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)))
  const page = Math.max(1, options?.page ?? 1)
  const limit = Math.min(200, Math.max(1, options?.limit ?? 20))
  const offset = (page - 1) * limit
  const search = options?.search?.trim().toLowerCase() || ''

  if (!uniqueUserIds.length) {
    return {
      entries: [],
      total: 0,
      page,
      pageSize: limit,
    }
  }

  // The members as one JSON parameter, read three ways: they were bound three times over, so 34
  // members passed D1's 100 parameters.
  const conditions = [
    `(
      (l.scope = 'user' AND l.scope_id IN (SELECT value FROM json_each(?1)))
      OR (l.scope = 'team' AND json_extract(l.metadata, '$.userId') IN (SELECT value FROM json_each(?1)))
      OR (l.scope = 'team' AND l.scope_id IN (SELECT 'team_' || value FROM json_each(?1)))
    )`,
  ]
  const params: Array<string | number> = [JSON.stringify(uniqueUserIds)]

  if (search) {
    const term = `%${search}%`
    conditions.push('(LOWER(u.email) LIKE ?2 OR LOWER(u.name) LIKE ?2 OR LOWER(COALESCE(json_extract(l.metadata, \'$.userId\'), u.id, l.scope_id)) LIKE ?2)')
    params.push(term)
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`
  const limitParam = `?${params.length + 1}`
  const offsetParam = `?${params.length + 2}`

  // The count and the page in one round trip; they were two.
  const [totalResult, pageResult] = await db.batch([db.prepare(`
    SELECT COUNT(1) as total
    FROM ${CREDIT_LEDGER_TABLE} l
    LEFT JOIN ${TEAMS_TABLE} t ON t.id = l.scope_id AND l.scope = 'team'
    LEFT JOIN ${USERS_TABLE} u ON u.id = COALESCE(json_extract(l.metadata, '$.userId'), CASE WHEN l.scope = 'user' THEN l.scope_id ELSE t.owner_user_id END)
    ${whereClause}
  `).bind(...params), db.prepare(`
    SELECT
      l.id,
      l.scope_id,
      l.delta,
      l.reason,
      l.created_at,
      l.metadata,
      t.id as team_id,
      t.type as team_type,
      u.id as user_id,
      u.email,
      u.name
    FROM ${CREDIT_LEDGER_TABLE} l
    LEFT JOIN ${TEAMS_TABLE} t ON t.id = l.scope_id AND l.scope = 'team'
    LEFT JOIN ${USERS_TABLE} u ON u.id = COALESCE(json_extract(l.metadata, '$.userId'), CASE WHEN l.scope = 'user' THEN l.scope_id ELSE t.owner_user_id END)
    ${whereClause}
    ORDER BY l.created_at DESC
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `).bind(...params, limit, offset)])
  const totalRow = (totalResult?.results?.[0] ?? null) as { total?: number } | null
  const results = (pageResult?.results ?? []) as Array<Record<string, any>>

  return {
    entries: (results ?? []).map((row) => {
      const metadata = parseLedgerMetadata(row.metadata ?? null)
      return {
        id: row.id,
        teamId: row.team_id ?? (row.scope_id?.startsWith?.('team_') ? row.scope_id : ''),
        teamType: row.team_type ?? null,
        userId: row.user_id ?? (typeof metadata?.userId === 'string' ? metadata.userId : null),
        userEmail: row.email ?? null,
        userName: row.name ?? null,
        delta: resolveCreditAmount(row.delta ?? 0),
        reason: row.reason ?? '',
        createdAt: row.created_at,
        metadata,
      }
    }),
    total: Number(totalRow?.total ?? 0),
    page,
    pageSize: limit,
  }
}

export interface CreditLedgerAuditEntry {
  id: string
  teamId: string
  teamType: string | null
  userId: string | null
  userEmail: string | null
  userName: string | null
  delta: number
  reason: string
  createdAt: string
  metadata: Record<string, any> | null
}

/**
 * Ledger rows one invoke can leave behind: the hold, the settled remainder, and the
 * release of whatever the hold over-covered.
 *
 * The row cap is derived from the trace count rather than fixed. A fixed cap carries no
 * headroom — one more row per invoke than it was sized for silently drops the oldest
 * rows of the page — and the netting below needs every row of a trace to report what the
 * invoke cost instead of reporting its hold.
 */
const CREDIT_LEDGER_ROWS_PER_TRACE = 4

export async function listCreditLedgerByTraceIds(
  event: H3Event,
  traceIds: string[],
): Promise<CreditLedgerAuditEntry[]> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)

  const uniqueTraceIds = Array.from(new Set(
    traceIds
      .map(traceId => traceId.trim())
      .filter(Boolean),
  )).slice(0, 200)

  if (!uniqueTraceIds.length)
    return []

  const { results } = await db.prepare(`
    SELECT
      l.id,
      l.scope_id,
      l.delta,
      l.reason,
      l.created_at,
      l.metadata,
      t.id as team_id,
      t.owner_user_id,
      t.type as team_type,
      u.email,
      u.name
    FROM ${CREDIT_LEDGER_TABLE} l
    LEFT JOIN ${TEAMS_TABLE} t ON t.id = l.scope_id
    LEFT JOIN ${USERS_TABLE} u ON u.id = t.owner_user_id
    WHERE l.scope = 'team'
      AND (l.reason = 'intelligence-invoke' OR l.reason LIKE 'intelligence-invoke-%')
      AND json_extract(l.metadata, '$.traceId') IN (SELECT value FROM json_each(?1))
    ORDER BY l.created_at DESC
    LIMIT ${uniqueTraceIds.length * CREDIT_LEDGER_ROWS_PER_TRACE}
  `).bind(JSON.stringify(uniqueTraceIds)).all<Record<string, any>>()

  const rows = (results ?? [])
    .map((row) => {
      const metadata = parseLedgerMetadata(row.metadata ?? null)
      const traceId = typeof metadata?.traceId === 'string' ? metadata.traceId : ''
      if (!uniqueTraceIds.includes(traceId))
        return null
      const resolvedUserId = typeof metadata?.userId === 'string'
        ? metadata.userId
        : (row.owner_user_id ?? null)
      return {
        id: row.id,
        traceId,
        teamId: row.team_id ?? row.scope_id,
        teamType: row.team_type ?? null,
        userId: resolvedUserId,
        userEmail: row.email ?? null,
        userName: row.name ?? null,
        delta: resolveCreditAmount(row.delta ?? 0),
        reason: row.reason ?? '',
        createdAt: row.created_at,
        metadata,
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))

  // One invoke now debits more than one row: a hold before dispatch, then the settled
  // remainder and the release of whatever the hold over-covered. Auditing reports what
  // the invoke actually cost, so the rows must be netted per trace — returning any
  // single row would report the hold as the charge, or nothing at all.
  const byTraceId = new Map<string, NonNullable<(typeof rows)[number]>>()
  for (const row of rows) {
    const current = byTraceId.get(row.traceId)
    if (!current) {
      byTraceId.set(row.traceId, { ...row })
      continue
    }
    const preferred = pickBillingTruthRow(current, row)
    const other = preferred === current ? row : current
    byTraceId.set(row.traceId, {
      ...preferred,
      delta: resolveCreditAmount(preferred.delta + other.delta)
    })
  }

  return [...byTraceId.values()].map(entry => ({
    id: entry.id,
    teamId: entry.teamId,
    teamType: entry.teamType,
    userId: entry.userId,
    userEmail: entry.userEmail,
    userName: entry.userName,
    delta: entry.delta,
    reason: entry.reason,
    createdAt: entry.createdAt,
    metadata: entry.metadata,
  }))
}

/** The row carrying the settled charge: the settle row when present, else the newest. */
function pickBillingTruthRow<T extends { reason: string; createdAt: string }>(a: T, b: T): T {
  const isSettle = (row: T) => row.reason === 'intelligence-invoke-settle'
  if (isSettle(a) !== isSettle(b))
    return isSettle(a) ? a : b
  return a.createdAt >= b.createdAt ? a : b
}

export async function listCreditTrendByUsers(
  event: H3Event,
  userIds: string[],
  options?: { days?: number },
) {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)

  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)))
  const days = Math.min(30, Math.max(7, options?.days ?? 14))

  const endDate = new Date()
  endDate.setUTCHours(0, 0, 0, 0)
  const dayKeys: string[] = []
  const dailyMap = new Map<string, number>()
  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(endDate)
    date.setUTCDate(endDate.getUTCDate() - index)
    const key = date.toISOString().slice(0, 10)
    dayKeys.push(key)
    dailyMap.set(key, 0)
  }

  if (!uniqueUserIds.length) {
    return {
      days: dayKeys,
      values: dayKeys.map(key => dailyMap.get(key) ?? 0),
      totalUsed: 0,
    }
  }

  const teamIds = uniqueUserIds.map(userId => `team_${userId}`)
  const startDate = new Date(endDate)
  startDate.setUTCDate(endDate.getUTCDate() - (days - 1))
  const startIso = startDate.toISOString()

  const { results } = await db.prepare(`
    SELECT created_at, delta
    FROM ${CREDIT_LEDGER_TABLE}
    WHERE scope = 'team'
      AND scope_id IN (SELECT value FROM json_each(?1))
      AND created_at >= ?2
  `).bind(JSON.stringify(teamIds), startIso).all<{ created_at: string; delta: number }>()

  let totalUsed = 0
  for (const row of results || []) {
    const createdAt = row.created_at || ''
    if (!createdAt)
      continue
    const dayKey = createdAt.slice(0, 10)
    if (!dailyMap.has(dayKey))
      continue
    const delta = resolveCreditAmount(row.delta ?? 0)
    const used = delta < 0 ? -delta : 0
    totalUsed = sumCredits(totalUsed, used)
    dailyMap.set(dayKey, sumCredits(dailyMap.get(dayKey) ?? 0, used))
  }

  return {
    days: dayKeys,
    values: dayKeys.map(key => dailyMap.get(key) ?? 0),
    totalUsed,
  }
}

export async function listCreditUsageAdmin(
  event: H3Event,
  options?: { page?: number; limit?: number; search?: string; month?: string },
) {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)

  const month = options?.month || getMonthKey()
  const page = Math.max(1, options?.page ?? 1)
  const limit = Math.min(200, Math.max(1, options?.limit ?? 20))
  const offset = (page - 1) * limit
  const search = options?.search?.trim().toLowerCase() || ''

  const conditions = [`cb.scope = 'user'`, `cb.month = ?`]
  const params: Array<string | number> = [month]

  if (search) {
    const term = `%${search}%`
    conditions.push('(LOWER(u.email) LIKE ? OR LOWER(u.name) LIKE ? OR LOWER(cb.scope_id) LIKE ?)')
    params.push(term, term, term)
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`

  const summaryRow = await db.prepare(`
    SELECT COUNT(1) as total, SUM(cb.used) as total_used, SUM(cb.quota) as total_quota
    FROM ${CREDIT_BALANCES_TABLE} cb
    LEFT JOIN ${USERS_TABLE} u ON u.id = cb.scope_id
    ${whereClause}
  `).bind(...params).first<{ total?: number; total_used?: number; total_quota?: number }>()

  const listParams = [...params, limit, offset]
  const { results } = await db.prepare(`
    SELECT
      cb.scope_id as user_id,
      cb.quota,
      cb.used,
      cb.month,
      u.email,
      u.name,
      u.role,
      u.status
    FROM ${CREDIT_BALANCES_TABLE} cb
    LEFT JOIN ${USERS_TABLE} u ON u.id = cb.scope_id
    ${whereClause}
    ORDER BY cb.used DESC, cb.scope_id ASC
    LIMIT ? OFFSET ?
  `).bind(...listParams).all<Record<string, any>>()

  return {
    month,
    total: Number(summaryRow?.total ?? 0),
    totalUsed: resolveCreditAmount(summaryRow?.total_used ?? 0),
    totalQuota: resolveCreditAmount(summaryRow?.total_quota ?? 0),
    users: (results ?? []).map(row => ({
      userId: row.user_id,
      email: row.email ?? null,
      name: row.name ?? null,
      role: row.role ?? null,
      status: row.status ?? null,
      quota: resolveCreditAmount(row.quota ?? 0),
      used: resolveCreditAmount(row.used ?? 0),
      month: row.month ?? month,
    })),
    page,
    pageSize: limit,
  }
}

export async function listCreditLedgerAdmin(
  event: H3Event,
  options?: { page?: number; limit?: number; search?: string },
) {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)

  const page = Math.max(1, options?.page ?? 1)
  const limit = Math.min(200, Math.max(1, options?.limit ?? 20))
  const offset = (page - 1) * limit
  const search = options?.search?.trim().toLowerCase() || ''

  const conditions = [`l.scope = 'team'`]
  const params: Array<string | number> = []

  if (search) {
    const term = `%${search}%`
    conditions.push('(LOWER(u.email) LIKE ? OR LOWER(u.name) LIKE ? OR LOWER(t.owner_user_id) LIKE ? OR LOWER(l.scope_id) LIKE ?)')
    params.push(term, term, term, term)
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const totalRow = await db.prepare(`
    SELECT COUNT(1) as total
    FROM ${CREDIT_LEDGER_TABLE} l
    LEFT JOIN ${TEAMS_TABLE} t ON t.id = l.scope_id
    LEFT JOIN ${USERS_TABLE} u ON u.id = t.owner_user_id
    ${whereClause}
  `).bind(...params).first<{ total?: number }>()

  const listParams = [...params, limit, offset]
  const { results } = await db.prepare(`
    SELECT
      l.id,
      l.scope_id,
      l.delta,
      l.reason,
      l.created_at,
      l.metadata,
      t.id as team_id,
      t.owner_user_id,
      t.type as team_type,
      u.email,
      u.name
    FROM ${CREDIT_LEDGER_TABLE} l
    LEFT JOIN ${TEAMS_TABLE} t ON t.id = l.scope_id
    LEFT JOIN ${USERS_TABLE} u ON u.id = t.owner_user_id
    ${whereClause}
    ORDER BY l.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...listParams).all<Record<string, any>>()

  const entries = (results ?? []).map(row => {
    const metadata = parseLedgerMetadata(row.metadata ?? null)
    const resolvedUserId = typeof metadata?.userId === 'string'
      ? metadata.userId
      : (row.owner_user_id ?? null)
    return {
      id: row.id,
      teamId: row.team_id ?? row.scope_id,
      teamType: row.team_type ?? null,
      userId: resolvedUserId,
      userEmail: row.email ?? null,
      userName: row.name ?? null,
      delta: resolveCreditAmount(row.delta ?? 0),
      reason: row.reason ?? '',
      createdAt: row.created_at,
      metadata,
    }
  })

  return {
    entries,
    total: Number(totalRow?.total ?? 0),
    page,
    pageSize: limit,
  }
}
