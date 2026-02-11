import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import type { SubscriptionPlan } from './subscriptionStore'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'

const INVITES_TABLE = 'team_invites'
const TEAM_QUOTA_TABLE = 'team_quotas'
const TEAM_MEMBER_USAGE_TABLE = 'team_member_usage'

let teamSchemaInitialized = false

// Plan-based configuration
export const PLAN_CONFIG = {
  FREE: { seats: 1, aiRequests: 50, aiTokens: 10000 },
  PLUS: { seats: 1, aiRequests: 2000, aiTokens: 500000 },
  PRO: { seats: 1, aiRequests: 500, aiTokens: 100000 },
  ENTERPRISE: { seats: 10, aiRequests: 50000, aiTokens: 10000000 },
  TEAM: { seats: 5, aiRequests: 5000, aiTokens: 1000000 },
} as const

export interface TeamQuota {
  organizationId: string
  plan: SubscriptionPlan
  aiRequestsUsed: number
  aiRequestsLimit: number
  aiTokensUsed: number
  aiTokensLimit: number
  seatsUsed: number
  seatsLimit: number
  weekStartDate: string
  updatedAt: string
}

interface D1InviteRow {
  id: string
  code: string
  organization_id: string
  created_by: string
  email: string | null
  role: string
  max_uses: number
  uses: number
  expires_at: string | null
  created_at: string
  status: string
}

export interface TeamInvite {
  id: string
  code: string
  organizationId: string
  createdBy: string
  email: string | null
  role: 'admin' | 'member'
  maxUses: number
  uses: number
  expiresAt: string | null
  createdAt: string
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
}

export interface CreateInviteInput {
  organizationId: string
  email?: string
  role?: 'admin' | 'member'
  maxUses?: number
  expiresInDays?: number
}

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

async function ensureTeamSchema(db: D1Database) {
  if (teamSchemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${INVITES_TABLE} (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      organization_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      email TEXT,
      role TEXT NOT NULL DEFAULT 'member',
      max_uses INTEGER NOT NULL DEFAULT 1,
      uses INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_invites_org ON ${INVITES_TABLE}(organization_id);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_invites_code ON ${INVITES_TABLE}(code);
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${TEAM_QUOTA_TABLE} (
      organization_id TEXT PRIMARY KEY,
      plan TEXT NOT NULL DEFAULT 'FREE',
      ai_requests_used INTEGER NOT NULL DEFAULT 0,
      ai_requests_limit INTEGER NOT NULL DEFAULT 100,
      ai_tokens_used INTEGER NOT NULL DEFAULT 0,
      ai_tokens_limit INTEGER NOT NULL DEFAULT 50000,
      seats_used INTEGER NOT NULL DEFAULT 1,
      seats_limit INTEGER NOT NULL DEFAULT 3,
      week_start_date TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${TEAM_MEMBER_USAGE_TABLE} (
      organization_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      ai_requests_used INTEGER NOT NULL DEFAULT 0,
      ai_tokens_used INTEGER NOT NULL DEFAULT 0,
      week_start_date TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (organization_id, user_id)
    );
  `).run()

  teamSchemaInitialized = true
}

function getWeekStartDate(): string {
  const now = new Date()
  const day = now.getUTCDay()
  const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(now.setUTCDate(diff))
  monday.setUTCHours(0, 0, 0, 0)
  return monday.toISOString().slice(0, 10)
}

function mapInviteRow(row: D1InviteRow): TeamInvite {
  return {
    id: row.id,
    code: row.code,
    organizationId: row.organization_id,
    createdBy: row.created_by,
    email: row.email,
    role: row.role as 'admin' | 'member',
    maxUses: row.max_uses,
    uses: row.uses,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    status: row.status as TeamInvite['status'],
  }
}

function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

function normalizeEmail(value?: string | null): string {
  return (value || '').trim().toLowerCase()
}

function getPlanConfig(plan?: SubscriptionPlan) {
  return PLAN_CONFIG[plan || 'FREE'] || PLAN_CONFIG.FREE
}

function isInviteExpired(invite: TeamInvite): boolean {
  return Boolean(invite.expiresAt && new Date(invite.expiresAt).getTime() <= Date.now())
}

export async function createInvite(
  event: H3Event,
  userId: string,
  input: CreateInviteInput,
): Promise<TeamInvite> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureTeamSchema(db)

  const now = new Date()
  const normalizedEmail = normalizeEmail(input.email)
  const maxUses = normalizedEmail ? 1 : Math.max(1, Number(input.maxUses || 1))
  const expiresAt = input.expiresInDays
    ? new Date(now.getTime() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null

  const invite: TeamInvite = {
    id: randomUUID(),
    code: generateInviteCode(),
    organizationId: input.organizationId,
    createdBy: userId,
    email: normalizedEmail || null,
    role: input.role || 'member',
    maxUses,
    uses: 0,
    expiresAt,
    createdAt: now.toISOString(),
    status: 'pending',
  }

  await db.prepare(`
    INSERT INTO ${INVITES_TABLE} (
      id, code, organization_id, created_by, email, role,
      max_uses, uses, expires_at, created_at, status
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11);
  `).bind(
    invite.id,
    invite.code,
    invite.organizationId,
    invite.createdBy,
    invite.email,
    invite.role,
    invite.maxUses,
    invite.uses,
    invite.expiresAt,
    invite.createdAt,
    invite.status,
  ).run()

  return invite
}

export async function listInvites(
  event: H3Event,
  organizationId: string,
): Promise<TeamInvite[]> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureTeamSchema(db)

  const { results } = await db.prepare(`
    SELECT * FROM ${INVITES_TABLE}
    WHERE organization_id = ?1
    ORDER BY created_at DESC;
  `).bind(organizationId).all<D1InviteRow>()

  return (results ?? []).map(mapInviteRow)
}

export async function getInviteByCode(
  event: H3Event,
  code: string,
): Promise<TeamInvite | null> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureTeamSchema(db)

  const row = await db.prepare(`
    SELECT * FROM ${INVITES_TABLE} WHERE code = ?1;
  `).bind(code.toUpperCase()).first<D1InviteRow>()

  return row ? mapInviteRow(row) : null
}

export async function getInviteById(
  event: H3Event,
  id: string,
): Promise<TeamInvite | null> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureTeamSchema(db)

  const row = await db.prepare(`
    SELECT * FROM ${INVITES_TABLE} WHERE id = ?1;
  `).bind(id).first<D1InviteRow>()

  return row ? mapInviteRow(row) : null
}

export async function hasInviteForEmail(
  event: H3Event,
  email: string,
): Promise<boolean> {
  const db = getD1Database(event)
  if (!db) {
    return false
  }

  const normalizedEmail = normalizeEmail(email)
  if (!normalizedEmail) {
    return false
  }

  await ensureTeamSchema(db)

  const row = await db.prepare(`
    SELECT id FROM ${INVITES_TABLE}
    WHERE lower(email) = ?1
      AND status IN ('pending', 'accepted')
    LIMIT 1;
  `).bind(normalizedEmail).first<{ id: string }>()

  return Boolean(row?.id)
}

export async function useInvite(
  event: H3Event,
  code: string,
): Promise<TeamInvite> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureTeamSchema(db)

  const invite = await getInviteByCode(event, code)
  if (!invite) {
    throw createError({ statusCode: 404, statusMessage: 'Invite not found' })
  }

  if (invite.status !== 'pending') {
    throw createError({ statusCode: 400, statusMessage: `Invite is ${invite.status}` })
  }

  if (isInviteExpired(invite)) {
    await db.prepare(`
      UPDATE ${INVITES_TABLE} SET status = 'expired' WHERE id = ?1;
    `).bind(invite.id).run()
    throw createError({ statusCode: 400, statusMessage: 'Invite has expired' })
  }

  if (invite.uses >= invite.maxUses) {
    throw createError({ statusCode: 400, statusMessage: 'Invite has reached max uses' })
  }

  const newUses = invite.uses + 1
  const newStatus = newUses >= invite.maxUses ? 'accepted' : 'pending'

  await db.prepare(`
    UPDATE ${INVITES_TABLE}
    SET uses = ?1, status = ?2
    WHERE id = ?3;
  `).bind(newUses, newStatus, invite.id).run()

  return {
    ...invite,
    uses: newUses,
    status: newStatus as TeamInvite['status'],
  }
}

export async function revokeInvite(
  event: H3Event,
  id: string,
  userId: string,
): Promise<void> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureTeamSchema(db)

  const invite = await getInviteById(event, id)
  if (!invite) {
    throw createError({ statusCode: 404, statusMessage: 'Invite not found' })
  }

  if (invite.status !== 'pending') {
    throw createError({ statusCode: 400, statusMessage: 'Can only revoke pending invites' })
  }

  await db.prepare(`
    UPDATE ${INVITES_TABLE} SET status = 'revoked' WHERE id = ?1;
  `).bind(id).run()
}

export async function deleteInvite(
  event: H3Event,
  id: string,
): Promise<void> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureTeamSchema(db)

  const result = await db.prepare(`
    DELETE FROM ${INVITES_TABLE} WHERE id = ?1;
  `).bind(id).run()

  const changes = (result.meta as { changes?: number } | undefined)?.changes ?? 0
  if (changes === 0) {
    throw createError({ statusCode: 404, statusMessage: 'Invite not found' })
  }
}

// Team Quota Functions

interface D1QuotaRow {
  organization_id: string
  plan: string
  ai_requests_used: number
  ai_requests_limit: number
  ai_tokens_used: number
  ai_tokens_limit: number
  seats_used: number
  seats_limit: number
  week_start_date: string
  updated_at: string
}

export interface TeamMemberUsage {
  organizationId: string
  userId: string
  aiRequestsUsed: number
  aiTokensUsed: number
  weekStartDate: string
  updatedAt: string
}

interface D1MemberUsageRow {
  organization_id: string
  user_id: string
  ai_requests_used: number
  ai_tokens_used: number
  week_start_date: string
  updated_at: string
}

function mapMemberUsageRow(row: D1MemberUsageRow): TeamMemberUsage {
  return {
    organizationId: row.organization_id,
    userId: row.user_id,
    aiRequestsUsed: row.ai_requests_used,
    aiTokensUsed: row.ai_tokens_used,
    weekStartDate: row.week_start_date,
    updatedAt: row.updated_at,
  }
}

function mapQuotaRow(row: D1QuotaRow): TeamQuota {
  return {
    organizationId: row.organization_id,
    plan: row.plan as SubscriptionPlan,
    aiRequestsUsed: row.ai_requests_used,
    aiRequestsLimit: row.ai_requests_limit,
    aiTokensUsed: row.ai_tokens_used,
    aiTokensLimit: row.ai_tokens_limit,
    seatsUsed: row.seats_used,
    seatsLimit: row.seats_limit,
    weekStartDate: row.week_start_date,
    updatedAt: row.updated_at,
  }
}

export async function getTeamQuota(
  event: H3Event,
  organizationId: string,
  ownerPlan?: SubscriptionPlan,
): Promise<TeamQuota> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureTeamSchema(db)

  const currentWeek = getWeekStartDate()
  const row = await db.prepare(`
    SELECT * FROM ${TEAM_QUOTA_TABLE} WHERE organization_id = ?1;
  `).bind(organizationId).first<D1QuotaRow>()

  if (row) {
    const plan = (ownerPlan || row.plan) as SubscriptionPlan
    const config = getPlanConfig(plan)
    const weekChanged = row.week_start_date !== currentWeek
    const limitsChanged = row.plan !== plan
      || row.ai_requests_limit !== config.aiRequests
      || row.ai_tokens_limit !== config.aiTokens
      || row.seats_limit !== config.seats

    if (weekChanged || limitsChanged) {
      const nextRequestsUsed = weekChanged ? 0 : row.ai_requests_used
      const nextTokensUsed = weekChanged ? 0 : row.ai_tokens_used
      const nextWeekStartDate = weekChanged ? currentWeek : row.week_start_date
      const updatedAt = new Date().toISOString()

      await db.prepare(`
        UPDATE ${TEAM_QUOTA_TABLE}
        SET ai_requests_used = ?1, ai_tokens_used = ?2,
            week_start_date = ?3, updated_at = ?4,
            plan = ?5, ai_requests_limit = ?6, ai_tokens_limit = ?7, seats_limit = ?8
        WHERE organization_id = ?9;
      `).bind(
        nextRequestsUsed,
        nextTokensUsed,
        nextWeekStartDate,
        updatedAt,
        plan,
        config.aiRequests,
        config.aiTokens,
        config.seats,
        organizationId,
      ).run()

      return {
        organizationId,
        plan,
        aiRequestsUsed: nextRequestsUsed,
        aiRequestsLimit: config.aiRequests,
        aiTokensUsed: nextTokensUsed,
        aiTokensLimit: config.aiTokens,
        seatsUsed: row.seats_used,
        seatsLimit: config.seats,
        weekStartDate: nextWeekStartDate,
        updatedAt,
      }
    }

    return mapQuotaRow(row)
  }

  // Create new quota record
  const plan = ownerPlan || 'FREE'
  const config = getPlanConfig(plan)
  const now = new Date().toISOString()

  await db.prepare(`
    INSERT INTO ${TEAM_QUOTA_TABLE} (
      organization_id, plan, ai_requests_used, ai_requests_limit,
      ai_tokens_used, ai_tokens_limit, seats_used, seats_limit,
      week_start_date, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10);
  `).bind(
    organizationId,
    plan,
    0,
    config.aiRequests,
    0,
    config.aiTokens,
    1,
    config.seats,
    currentWeek,
    now,
  ).run()

  return {
    organizationId,
    plan,
    aiRequestsUsed: 0,
    aiRequestsLimit: config.aiRequests,
    aiTokensUsed: 0,
    aiTokensLimit: config.aiTokens,
    seatsUsed: 1,
    seatsLimit: config.seats,
    weekStartDate: currentWeek,
    updatedAt: now,
  }
}

export async function updateTeamQuotaUsage(
  event: H3Event,
  organizationId: string,
  usage: { aiRequests?: number, aiTokens?: number },
): Promise<TeamQuota> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureTeamSchema(db)

  // Get current quota (this also handles weekly reset)
  const current = await getTeamQuota(event, organizationId)

  const newRequestsUsed = current.aiRequestsUsed + (usage.aiRequests || 0)
  const newTokensUsed = current.aiTokensUsed + (usage.aiTokens || 0)

  await db.prepare(`
    UPDATE ${TEAM_QUOTA_TABLE}
    SET ai_requests_used = ?1, ai_tokens_used = ?2, updated_at = ?3
    WHERE organization_id = ?4;
  `).bind(
    newRequestsUsed,
    newTokensUsed,
    new Date().toISOString(),
    organizationId,
  ).run()

  return {
    ...current,
    aiRequestsUsed: newRequestsUsed,
    aiTokensUsed: newTokensUsed,
    updatedAt: new Date().toISOString(),
  }
}

export async function updateTeamSeats(
  event: H3Event,
  organizationId: string,
  seatsUsed: number,
): Promise<void> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureTeamSchema(db)

  await db.prepare(`
    UPDATE ${TEAM_QUOTA_TABLE}
    SET seats_used = ?1, updated_at = ?2
    WHERE organization_id = ?3;
  `).bind(seatsUsed, new Date().toISOString(), organizationId).run()
}

export async function deleteTeamQuota(
  event: H3Event,
  organizationId: string,
): Promise<void> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureTeamSchema(db)

  // Delete quota record
  await db.prepare(`
    DELETE FROM ${TEAM_QUOTA_TABLE} WHERE organization_id = ?1;
  `).bind(organizationId).run()

  // Delete all invites for this organization
  await db.prepare(`
    DELETE FROM ${INVITES_TABLE} WHERE organization_id = ?1;
  `).bind(organizationId).run()

  // Delete per-member usage rows
  await db.prepare(`
    DELETE FROM ${TEAM_MEMBER_USAGE_TABLE} WHERE organization_id = ?1;
  `).bind(organizationId).run()
}

export async function getOrInitTeamMemberUsage(
  event: H3Event,
  organizationId: string,
  userId: string,
): Promise<TeamMemberUsage> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureTeamSchema(db)

  const currentWeek = getWeekStartDate()
  const row = await db.prepare(`
    SELECT * FROM ${TEAM_MEMBER_USAGE_TABLE}
    WHERE organization_id = ?1 AND user_id = ?2;
  `).bind(organizationId, userId).first<D1MemberUsageRow>()

  const now = new Date().toISOString()

  if (row) {
    if (row.week_start_date !== currentWeek) {
      await db.prepare(`
        UPDATE ${TEAM_MEMBER_USAGE_TABLE}
        SET ai_requests_used = 0, ai_tokens_used = 0, week_start_date = ?1, updated_at = ?2
        WHERE organization_id = ?3 AND user_id = ?4;
      `).bind(currentWeek, now, organizationId, userId).run()

      return {
        organizationId,
        userId,
        aiRequestsUsed: 0,
        aiTokensUsed: 0,
        weekStartDate: currentWeek,
        updatedAt: now,
      }
    }
    return mapMemberUsageRow(row)
  }

  await db.prepare(`
    INSERT INTO ${TEAM_MEMBER_USAGE_TABLE} (
      organization_id, user_id, ai_requests_used, ai_tokens_used, week_start_date, updated_at
    ) VALUES (?1, ?2, 0, 0, ?3, ?4);
  `).bind(organizationId, userId, currentWeek, now).run()

  return {
    organizationId,
    userId,
    aiRequestsUsed: 0,
    aiTokensUsed: 0,
    weekStartDate: currentWeek,
    updatedAt: now,
  }
}

export async function listTeamMemberUsage(
  event: H3Event,
  organizationId: string,
  userId?: string,
): Promise<TeamMemberUsage[]> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureTeamSchema(db)
  const currentWeek = getWeekStartDate()
  const now = new Date().toISOString()

  await db.prepare(`
    UPDATE ${TEAM_MEMBER_USAGE_TABLE}
    SET ai_requests_used = 0, ai_tokens_used = 0, week_start_date = ?1, updated_at = ?2
    WHERE organization_id = ?3 AND week_start_date != ?1;
  `).bind(currentWeek, now, organizationId).run()

  if (userId) {
    const row = await db.prepare(`
      SELECT * FROM ${TEAM_MEMBER_USAGE_TABLE}
      WHERE organization_id = ?1 AND user_id = ?2;
    `).bind(organizationId, userId).first<D1MemberUsageRow>()
    return row ? [mapMemberUsageRow(row)] : []
  }

  const result = await db.prepare(`
    SELECT * FROM ${TEAM_MEMBER_USAGE_TABLE}
    WHERE organization_id = ?1
    ORDER BY updated_at DESC;
  `).bind(organizationId).all<D1MemberUsageRow>()

  return (result.results ?? []).map(mapMemberUsageRow)
}

export async function addTeamMemberUsage(
  event: H3Event,
  organizationId: string,
  userId: string,
  usage: { aiRequests?: number, aiTokens?: number },
): Promise<TeamMemberUsage> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureTeamSchema(db)
  const current = await getOrInitTeamMemberUsage(event, organizationId, userId)

  const now = new Date().toISOString()
  const nextRequests = current.aiRequestsUsed + (usage.aiRequests || 0)
  const nextTokens = current.aiTokensUsed + (usage.aiTokens || 0)

  await db.prepare(`
    UPDATE ${TEAM_MEMBER_USAGE_TABLE}
    SET ai_requests_used = ?1, ai_tokens_used = ?2, updated_at = ?3
    WHERE organization_id = ?4 AND user_id = ?5;
  `).bind(nextRequests, nextTokens, now, organizationId, userId).run()

  return {
    ...current,
    aiRequestsUsed: nextRequests,
    aiTokensUsed: nextTokens,
    updatedAt: now,
  }
}
