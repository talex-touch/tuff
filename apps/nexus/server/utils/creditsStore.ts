import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import crypto from 'uncrypto'
import { readCloudflareBindings } from './cloudflare'
import { getUserSubscription } from './subscriptionStore'
import { getTeamQuota } from './teamStore'

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

let creditsSchemaInitialized = false

const DEFAULT_TEAM_QUOTA = 10000
const DEFAULT_PERSONAL_QUOTA = 5
const BOOSTED_PERSONAL_QUOTA = 100
const CHECKIN_REWARD = 1
const TEAM_BASE_SEATS = 5
const TEAM_POOL_PER_SEAT = 2000
const DEFAULT_PLAN_ID = 'default'
const CREDIT_DECIMALS = 2
const CREDIT_SCALE = 10 ** CREDIT_DECIMALS

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
  return Math.round(value * CREDIT_SCALE) / CREDIT_SCALE
}

function resolveCreditAmount(value: unknown): number {
  return normalizeCreditAmount(Number(value ?? 0))
}

function sumCredits(...values: number[]): number {
  const total = values.reduce((acc, current) => acc + current, 0)
  return normalizeCreditAmount(total)
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

function requireDatabase(event: H3Event): D1Database {
  const db = getD1Database(event)
  if (!db)
    throw new Error('Cloudflare D1 database is not available.')
  return db
}

async function ensureCreditsSchema(db: D1Database) {
  if (creditsSchemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${TEAMS_TABLE} (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${TEAM_MEMBERS_TABLE} (
      team_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (team_id, user_id)
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${CREDIT_PLANS_TABLE} (
      plan_id TEXT PRIMARY KEY,
      monthly_quota REAL NOT NULL,
      personal_quota REAL NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${CREDIT_BALANCES_TABLE} (
      scope TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      month TEXT NOT NULL,
      quota REAL NOT NULL,
      used REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (scope, scope_id, month)
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${CREDIT_LEDGER_TABLE} (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      delta REAL NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      metadata TEXT
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${CREDIT_BOOST_CLAIMS_TABLE} (
      user_id TEXT NOT NULL,
      month TEXT NOT NULL,
      claimed_at TEXT NOT NULL,
      PRIMARY KEY (user_id, month)
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${CREDIT_CHECKINS_TABLE} (
      user_id TEXT NOT NULL,
      day TEXT NOT NULL,
      claimed_at TEXT NOT NULL,
      PRIMARY KEY (user_id, day)
    );
  `).run()

  await db.prepare(`
    INSERT OR IGNORE INTO ${CREDIT_PLANS_TABLE} (plan_id, monthly_quota, personal_quota)
    VALUES (?, ?, ?)
  `).bind(DEFAULT_PLAN_ID, DEFAULT_TEAM_QUOTA, DEFAULT_PERSONAL_QUOTA).run()

  await db.prepare(`
    UPDATE ${CREDIT_PLANS_TABLE}
    SET monthly_quota = ?, personal_quota = ?
    WHERE plan_id = ?
  `).bind(DEFAULT_TEAM_QUOTA, DEFAULT_PERSONAL_QUOTA, DEFAULT_PLAN_ID).run()

  creditsSchemaInitialized = true
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
  PLUS: 500,
  PRO: 1200,
  TEAM: 5000,
  ENTERPRISE: 5000,
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

async function resolveBoostContext(event: H3Event, userId: string): Promise<BoostContext> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)

  const userRow = await db.prepare(`
    SELECT id, email_state, email_verified FROM ${USERS_TABLE}
    WHERE id = ?
    LIMIT 1
  `).bind(userId).first<D1UserRow & { email_verified?: string | null }>()

  const emailVerified = userRow?.email_state === 'verified'
  const oauthRow = await db.prepare(`
    SELECT COUNT(1) as total FROM ${ACCOUNTS_TABLE}
    WHERE user_id = ?
  `).bind(userId).first<{ total?: number }>()
  const passkeyRow = await db.prepare(`
    SELECT COUNT(1) as total FROM ${PASSKEYS_TABLE}
    WHERE user_id = ?
  `).bind(userId).first<{ total?: number }>()

  const oauthLinked = Number(oauthRow?.total ?? 0) > 0
  const passkeyBound = Number(passkeyRow?.total ?? 0) > 0
  const eligible = emailVerified && oauthLinked && passkeyBound

  let activatedMonth: string | null = null
  if (eligible) {
    const emailVerifiedAt = userRow?.email_verified ? Date.parse(userRow.email_verified) : NaN
    const oauthAtRow = await db.prepare(`
      SELECT MAX(created_at) as created_at FROM ${ACCOUNTS_TABLE}
      WHERE user_id = ?
    `).bind(userId).first<{ created_at?: string | null }>()
    const passkeyAtRow = await db.prepare(`
      SELECT MAX(created_at) as created_at FROM ${PASSKEYS_TABLE}
      WHERE user_id = ?
    `).bind(userId).first<{ created_at?: string | null }>()

    const oauthAt = oauthAtRow?.created_at ? Date.parse(oauthAtRow.created_at) : NaN
    const passkeyAt = passkeyAtRow?.created_at ? Date.parse(passkeyAtRow.created_at) : NaN
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

async function getBoostClaimed(event: H3Event, userId: string, month: string): Promise<boolean> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)
  const row = await db.prepare(`
    SELECT claimed_at FROM ${CREDIT_BOOST_CLAIMS_TABLE}
    WHERE user_id = ? AND month = ?
    LIMIT 1
  `).bind(userId, month).first()
  return Boolean(row?.claimed_at)
}

async function resolvePersonalQuota(
  event: H3Event,
  userId: string,
  baseQuota: number,
  month: string,
  plan: CreditPlan,
): Promise<number> {
  if (plan !== 'FREE')
    return baseQuota

  const context = await resolveBoostContext(event, userId)
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
  const context = await resolveBoostContext(event, userId)
  const claimedThisMonth = await getBoostClaimed(event, userId, month)
  const eligible = context.eligible

  return {
    eligible,
    requirements: context.requirements,
    claimedThisMonth,
    baseQuota: DEFAULT_PERSONAL_QUOTA,
    boostedQuota: BOOSTED_PERSONAL_QUOTA,
  }
}

export async function ensurePersonalTeam(event: H3Event, userId: string): Promise<string> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)
  const teamId = `team_${userId}`
  const now = new Date().toISOString()

  await db.prepare(`
    INSERT OR IGNORE INTO ${TEAMS_TABLE} (id, name, type, owner_user_id, created_at)
    VALUES (?, ?, 'personal', ?, ?)
  `).bind(teamId, 'Personal', userId, now).run()

  await db.prepare(`
    INSERT OR IGNORE INTO ${TEAM_MEMBERS_TABLE} (team_id, user_id, role, joined_at)
    VALUES (?, ?, 'owner', ?)
  `).bind(teamId, userId, now).run()

  return teamId
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

export async function listUserTeams(event: H3Event, userId: string): Promise<UserTeamRecord[]> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)

  const result = await db.prepare(`
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
  `).bind(userId).all<D1TeamRow & { role: string, joined_at: string }>()

  return (result.results ?? []).map((row) => {
    const team = mapTeamRow(row)
    return {
      ...team,
      role: (row.role || 'member') as TeamMemberRole,
      joinedAt: row.joined_at,
    }
  })
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

async function ensureBalance(event: H3Event, scope: 'team' | 'user', scopeId: string): Promise<void> {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)
  const month = getMonthKey()
  const plan = await resolvePlanForScope(event, scope, scopeId)
  const teamQuota = scope === 'team'
    ? await resolveTeamQuotaByPlan(event, scopeId, plan)
    : DEFAULT_TEAM_QUOTA
  const basePersonalQuota = resolveCreditAmount(PERSONAL_QUOTA_BY_PLAN[plan] ?? DEFAULT_PERSONAL_QUOTA)
  const personalQuota = scope === 'user'
    ? await resolvePersonalQuota(event, scopeId, basePersonalQuota, month, plan)
    : basePersonalQuota
  const quota = scope === 'team' ? teamQuota : personalQuota
  await db.prepare(`
    INSERT OR IGNORE INTO ${CREDIT_BALANCES_TABLE} (scope, scope_id, month, quota, used)
    VALUES (?, ?, ?, ?, 0)
  `).bind(scope, scopeId, month, quota).run()
}

export async function getCreditSummary(event: H3Event, userId: string) {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)
  const teamId = await ensurePersonalTeam(event, userId)
  await ensureBalance(event, 'team', teamId)
  await ensureBalance(event, 'user', userId)
  const month = getMonthKey()
  const plan = await resolvePlanForScope(event, 'user', userId)
  const teamBalance = await db.prepare(`
    SELECT * FROM ${CREDIT_BALANCES_TABLE} WHERE scope = 'team' AND scope_id = ? AND month = ?
  `).bind(teamId, month).first()
  const userBalance = await db.prepare(`
    SELECT * FROM ${CREDIT_BALANCES_TABLE} WHERE scope = 'user' AND scope_id = ? AND month = ?
  `).bind(userId, month).first()
  const boost = plan === 'FREE' ? await getCreditBoostStatus(event, userId, month, plan) : null
  const userQuota = resolveCreditAmount((userBalance as any)?.quota ?? 0)
  const canClaimNow = boost ? (boost.eligible && !boost.claimedThisMonth && userQuota < BOOSTED_PERSONAL_QUOTA) : false
  return {
    month,
    team: normalizeCreditBalanceRow(teamBalance),
    user: normalizeCreditBalanceRow(userBalance),
    boost: boost
      ? {
          ...boost,
          canClaimNow,
        }
      : null,
  }
}

export async function claimCreditBoost(event: H3Event, userId: string) {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)
  const month = getMonthKey()
  const plan = await resolvePlanForScope(event, 'user', userId)
  if (plan !== 'FREE') {
    return {
      eligible: false,
      claimed: false,
      reason: 'not-free',
      boost: null,
    }
  }
  const boost = await getCreditBoostStatus(event, userId, month, plan)
  if (!boost.eligible) {
    return {
      eligible: false,
      claimed: false,
      reason: 'not-eligible',
      boost,
    }
  }

  const now = new Date().toISOString()
  const insertResult = await db.prepare(`
    INSERT OR IGNORE INTO ${CREDIT_BOOST_CLAIMS_TABLE} (user_id, month, claimed_at)
    VALUES (?, ?, ?)
  `).bind(userId, month, now).run()

  const insertChanges = Number((insertResult as any)?.meta?.changes ?? 0)
  if (insertChanges < 1) {
    return {
      eligible: true,
      claimed: false,
      reason: 'already-claimed',
      boost,
    }
  }

  try {
    await ensureBalance(event, 'user', userId)
    const balanceRow = await db.prepare(`
      SELECT quota FROM ${CREDIT_BALANCES_TABLE}
      WHERE scope = 'user' AND scope_id = ? AND month = ?
    `).bind(userId, month).first()

    const currentQuota = resolveCreditAmount((balanceRow as any)?.quota ?? 0)
    const delta = normalizeCreditAmount(BOOSTED_PERSONAL_QUOTA - currentQuota)

    if (delta > 0) {
      await db.prepare(`
        UPDATE ${CREDIT_BALANCES_TABLE}
        SET quota = ?
        WHERE scope = 'user' AND scope_id = ? AND month = ?
      `).bind(BOOSTED_PERSONAL_QUOTA, userId, month).run()

      const ledgerId = crypto.randomUUID()
      await db.prepare(`
        INSERT INTO ${CREDIT_LEDGER_TABLE} (id, scope, scope_id, delta, reason, created_at, metadata)
        VALUES (?, 'user', ?, ?, ?, ?, ?)
      `).bind(
        ledgerId,
        userId,
        delta,
        'verification-boost',
        now,
        JSON.stringify({ userId, month }),
      ).run()
    }

    return {
      eligible: true,
      claimed: true,
      delta: Math.max(0, delta),
      boost: {
        ...boost,
        claimedThisMonth: true,
      },
    }
  }
  catch (error) {
    await db.prepare(`
      DELETE FROM ${CREDIT_BOOST_CLAIMS_TABLE}
      WHERE user_id = ? AND month = ?
    `).bind(userId, month).run()
    throw error
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

export async function claimDailyCheckin(event: H3Event, userId: string) {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)
  const day = getDayKey()
  const now = new Date().toISOString()

  const insertResult = await db.prepare(`
    INSERT OR IGNORE INTO ${CREDIT_CHECKINS_TABLE} (user_id, day, claimed_at)
    VALUES (?, ?, ?)
  `).bind(userId, day, now).run()

  const insertChanges = Number((insertResult as any)?.meta?.changes ?? 0)
  if (insertChanges < 1) {
    return {
      claimed: false,
      day,
      reward: CHECKIN_REWARD,
    }
  }

  try {
    await ensureBalance(event, 'user', userId)
    const month = getMonthKey()
    const delta = normalizeCreditAmount(CHECKIN_REWARD)

    await db.prepare(`
      UPDATE ${CREDIT_BALANCES_TABLE}
      SET quota = quota + ?
      WHERE scope = 'user' AND scope_id = ? AND month = ?
    `).bind(delta, userId, month).run()

    const ledgerId = crypto.randomUUID()
    await db.prepare(`
      INSERT INTO ${CREDIT_LEDGER_TABLE} (id, scope, scope_id, delta, reason, created_at, metadata)
      VALUES (?, 'user', ?, ?, ?, ?, ?)
    `).bind(
      ledgerId,
      userId,
      delta,
      'daily-checkin',
      now,
      JSON.stringify({ userId, day }),
    ).run()

    return {
      claimed: true,
      day,
      reward: delta,
    }
  }
  catch (error) {
    await db.prepare(`
      DELETE FROM ${CREDIT_CHECKINS_TABLE}
      WHERE user_id = ? AND day = ?
    `).bind(userId, day).run()
    throw error
  }
}

export async function consumeCredits(event: H3Event, userId: string, amount: number, reason: string, metadata?: Record<string, any>) {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)
  const teamId = await ensurePersonalTeam(event, userId)
  await ensureBalance(event, 'team', teamId)
  await ensureBalance(event, 'user', userId)
  const normalizedAmount = normalizeCreditAmount(amount)
  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error('Invalid credit amount.')
  }
  const month = getMonthKey()
  const teamBalance = await db.prepare(`
    SELECT quota, used FROM ${CREDIT_BALANCES_TABLE} WHERE scope = 'team' AND scope_id = ? AND month = ?
  `).bind(teamId, month).first()
  const userBalance = await db.prepare(`
    SELECT quota, used FROM ${CREDIT_BALANCES_TABLE} WHERE scope = 'user' AND scope_id = ? AND month = ?
  `).bind(userId, month).first()
  const teamQuota = resolveCreditAmount((teamBalance as any)?.quota ?? 0)
  const teamUsed = resolveCreditAmount((teamBalance as any)?.used ?? 0)
  const userQuota = resolveCreditAmount((userBalance as any)?.quota ?? 0)
  const userUsed = resolveCreditAmount((userBalance as any)?.used ?? 0)
  const nextTeamUsed = sumCredits(teamUsed, normalizedAmount)
  const nextUserUsed = sumCredits(userUsed, normalizedAmount)

  if (nextTeamUsed > teamQuota)
    throw new Error('Team credits exceeded.')
  if (nextUserUsed > userQuota)
    throw new Error('User credits exceeded.')

  await db.prepare(`
    UPDATE ${CREDIT_BALANCES_TABLE}
    SET used = used + ?
    WHERE scope = 'team' AND scope_id = ? AND month = ?
  `).bind(normalizedAmount, teamId, month).run()

  await db.prepare(`
    UPDATE ${CREDIT_BALANCES_TABLE}
    SET used = used + ?
    WHERE scope = 'user' AND scope_id = ? AND month = ?
  `).bind(normalizedAmount, userId, month).run()

  const ledgerMetadata = metadata ? { ...metadata, userId } : { userId }
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.prepare(`
    INSERT INTO ${CREDIT_LEDGER_TABLE} (id, scope, scope_id, delta, reason, created_at, metadata)
    VALUES (?, 'team', ?, ?, ?, ?, ?)
  `).bind(id, teamId, -normalizedAmount, reason, now, JSON.stringify(ledgerMetadata)).run()
}

export async function listCreditLedger(event: H3Event, userId: string) {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)
  const teamId = await ensurePersonalTeam(event, userId)
  const result = await db.prepare(`
    SELECT * FROM ${CREDIT_LEDGER_TABLE}
    WHERE (scope = 'team' AND scope_id = ?) OR (scope = 'user' AND scope_id = ?)
    ORDER BY created_at DESC
    LIMIT 100
  `).bind(teamId, userId).all()
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

  for (const userId of uniqueUserIds) {
    await ensurePersonalTeam(event, userId)
    await ensureBalance(event, 'user', userId)
  }

  const idPlaceholders = uniqueUserIds.map(() => '?').join(', ')
  const conditions = [
    `cb.scope = 'user'`,
    `cb.month = ?`,
    `cb.scope_id IN (${idPlaceholders})`,
  ]
  const params: Array<string | number> = [month, ...uniqueUserIds]

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

  const teamIds = uniqueUserIds.map(userId => `team_${userId}`)
  const idPlaceholders = teamIds.map(() => '?').join(', ')
  const conditions = [
    `l.scope = 'team'`,
    `l.scope_id IN (${idPlaceholders})`,
  ]
  const params: Array<string | number> = [...teamIds]

  if (search) {
    const term = `%${search}%`
    conditions.push('(LOWER(u.email) LIKE ? OR LOWER(u.name) LIKE ? OR LOWER(u.id) LIKE ?)')
    params.push(term, term, term)
  }

  const whereClause = `WHERE ${conditions.join(' AND ')}`

  const totalRow = await db.prepare(`
    SELECT COUNT(1) as total
    FROM ${CREDIT_LEDGER_TABLE} l
    LEFT JOIN ${USERS_TABLE} u ON u.id = SUBSTR(l.scope_id, 6)
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
      u.id as user_id,
      u.email,
      u.name
    FROM ${CREDIT_LEDGER_TABLE} l
    LEFT JOIN ${USERS_TABLE} u ON u.id = SUBSTR(l.scope_id, 6)
    ${whereClause}
    ORDER BY l.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...listParams).all<Record<string, any>>()

  return {
    entries: (results ?? []).map(row => ({
      id: row.id,
      teamId: row.scope_id,
      userId: row.user_id ?? null,
      userEmail: row.email ?? null,
      userName: row.name ?? null,
      delta: resolveCreditAmount(row.delta ?? 0),
      reason: row.reason ?? '',
      createdAt: row.created_at,
      metadata: parseLedgerMetadata(row.metadata ?? null),
    })),
    total: Number(totalRow?.total ?? 0),
    page,
    pageSize: limit,
  }
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
  const placeholders = teamIds.map(() => '?').join(', ')
  const startDate = new Date(endDate)
  startDate.setUTCDate(endDate.getUTCDate() - (days - 1))
  const startIso = startDate.toISOString()

  const { results } = await db.prepare(`
    SELECT created_at, delta
    FROM ${CREDIT_LEDGER_TABLE}
    WHERE scope = 'team'
      AND scope_id IN (${placeholders})
      AND created_at >= ?
  `).bind(...teamIds, startIso).all<{ created_at: string; delta: number }>()

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
