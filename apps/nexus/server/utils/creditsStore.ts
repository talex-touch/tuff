import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import crypto from 'uncrypto'
import { readCloudflareBindings } from './cloudflare'

const TEAMS_TABLE = 'teams'
const TEAM_MEMBERS_TABLE = 'team_members'
const CREDIT_PLANS_TABLE = 'credit_plans'
const CREDIT_BALANCES_TABLE = 'credit_balances'
const CREDIT_LEDGER_TABLE = 'credit_ledger'

let creditsSchemaInitialized = false

const DEFAULT_TEAM_QUOTA = 10000
const DEFAULT_PERSONAL_QUOTA = 5000
const DEFAULT_PLAN_ID = 'default'

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
      monthly_quota INTEGER NOT NULL,
      personal_quota INTEGER NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${CREDIT_BALANCES_TABLE} (
      scope TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      month TEXT NOT NULL,
      quota INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (scope, scope_id, month)
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${CREDIT_LEDGER_TABLE} (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      scope_id TEXT NOT NULL,
      delta INTEGER NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      metadata TEXT
    );
  `).run()

  await db.prepare(`
    INSERT OR IGNORE INTO ${CREDIT_PLANS_TABLE} (plan_id, monthly_quota, personal_quota)
    VALUES (?, ?, ?)
  `).bind(DEFAULT_PLAN_ID, DEFAULT_TEAM_QUOTA, DEFAULT_PERSONAL_QUOTA).run()

  creditsSchemaInitialized = true
}

function getMonthKey(date = new Date()): string {
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  return `${year}-${month}`
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
  const plan = await db.prepare(`SELECT * FROM ${CREDIT_PLANS_TABLE} WHERE plan_id = ?`).bind(DEFAULT_PLAN_ID).first()
  const teamQuota = Number((plan as any)?.monthly_quota ?? DEFAULT_TEAM_QUOTA)
  const personalQuota = Number((plan as any)?.personal_quota ?? DEFAULT_PERSONAL_QUOTA)
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
  const teamBalance = await db.prepare(`
    SELECT * FROM ${CREDIT_BALANCES_TABLE} WHERE scope = 'team' AND scope_id = ? AND month = ?
  `).bind(teamId, month).first()
  const userBalance = await db.prepare(`
    SELECT * FROM ${CREDIT_BALANCES_TABLE} WHERE scope = 'user' AND scope_id = ? AND month = ?
  `).bind(userId, month).first()
  return {
    month,
    team: teamBalance,
    user: userBalance
  }
}

export async function consumeCredits(event: H3Event, userId: string, amount: number, reason: string, metadata?: Record<string, any>) {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)
  const teamId = await ensurePersonalTeam(event, userId)
  await ensureBalance(event, 'team', teamId)
  await ensureBalance(event, 'user', userId)
  const month = getMonthKey()
  const teamBalance = await db.prepare(`
    SELECT quota, used FROM ${CREDIT_BALANCES_TABLE} WHERE scope = 'team' AND scope_id = ? AND month = ?
  `).bind(teamId, month).first()
  const userBalance = await db.prepare(`
    SELECT quota, used FROM ${CREDIT_BALANCES_TABLE} WHERE scope = 'user' AND scope_id = ? AND month = ?
  `).bind(userId, month).first()
  const teamQuota = Number((teamBalance as any)?.quota ?? 0)
  const teamUsed = Number((teamBalance as any)?.used ?? 0)
  const userQuota = Number((userBalance as any)?.quota ?? 0)
  const userUsed = Number((userBalance as any)?.used ?? 0)

  if (teamUsed + amount > teamQuota)
    throw new Error('Team credits exceeded.')
  if (userUsed + amount > userQuota)
    throw new Error('User credits exceeded.')

  await db.prepare(`
    UPDATE ${CREDIT_BALANCES_TABLE}
    SET used = used + ?
    WHERE scope = 'team' AND scope_id = ? AND month = ?
  `).bind(amount, teamId, month).run()

  await db.prepare(`
    UPDATE ${CREDIT_BALANCES_TABLE}
    SET used = used + ?
    WHERE scope = 'user' AND scope_id = ? AND month = ?
  `).bind(amount, userId, month).run()

  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  await db.prepare(`
    INSERT INTO ${CREDIT_LEDGER_TABLE} (id, scope, scope_id, delta, reason, created_at, metadata)
    VALUES (?, 'team', ?, ?, ?, ?, ?)
  `).bind(id, teamId, -amount, reason, now, metadata ? JSON.stringify(metadata) : null).run()
}

export async function listCreditLedger(event: H3Event, userId: string) {
  const db = requireDatabase(event)
  await ensureCreditsSchema(db)
  const teamId = await ensurePersonalTeam(event, userId)
  const result = await db.prepare(`
    SELECT * FROM ${CREDIT_LEDGER_TABLE}
    WHERE scope_id = ?
    ORDER BY created_at DESC
    LIMIT 100
  `).bind(teamId).all()
  return result.results
}
