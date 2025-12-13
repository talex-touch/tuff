import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'

const INVITES_TABLE = 'team_invites'

let teamSchemaInitialized = false

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
  if (teamSchemaInitialized) return

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

  teamSchemaInitialized = true
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

export async function createInvite(
  event: H3Event,
  userId: string,
  input: CreateInviteInput
): Promise<TeamInvite> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureTeamSchema(db)

  const now = new Date()
  const expiresAt = input.expiresInDays
    ? new Date(now.getTime() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null

  const invite: TeamInvite = {
    id: randomUUID(),
    code: generateInviteCode(),
    organizationId: input.organizationId,
    createdBy: userId,
    email: input.email || null,
    role: input.role || 'member',
    maxUses: input.maxUses || 1,
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
  organizationId: string
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
  code: string
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
  id: string
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

export async function useInvite(
  event: H3Event,
  code: string
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

  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
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
  userId: string
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
  id: string
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
