import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { createHash, randomBytes, timingSafeEqual, randomUUID  } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { readCloudflareBindings } from './cloudflare'

const OAUTH_CLIENTS_TABLE = 'oauth_clients'

let oauthClientSchemaInitialized = false

export type OauthOwnerScope = 'nexus' | 'team'
export type OauthClientStatus = 'active' | 'revoked'
export type OauthCreatedByRole = 'nexus_admin' | 'team_admin'

interface D1OauthClientRow {
  id: string
  client_id: string
  client_secret_hash: string
  client_secret_hint: string
  name: string
  description: string | null
  redirect_uris: string
  owner_scope: string
  owner_user_id: string
  owner_team_id: string | null
  created_by_role: string
  status: string
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
  updated_at: string
}

export interface OauthClientRecord {
  id: string
  clientId: string
  clientSecretHint: string
  name: string
  description: string | null
  redirectUris: string[]
  ownerScope: OauthOwnerScope
  ownerUserId: string
  ownerTeamId: string | null
  createdByRole: OauthCreatedByRole
  status: OauthClientStatus
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface OauthClientWithSecret extends OauthClientRecord {
  clientSecret: string
}

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

function requireDatabase(event: H3Event): D1Database {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }
  return db
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex')
}

function makeClientHint(secret: string): string {
  const prefix = secret.slice(0, 12)
  return `${prefix}...`
}

function generateClientId(): string {
  return `nxo_${randomBytes(12).toString('hex')}`
}

function generateClientSecret(): string {
  return `nxs_${randomBytes(24).toString('hex')}`
}

function parseRedirectUris(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.map(item => String(item || '').trim()).filter(Boolean)
  }
  catch {
    return []
  }
}

function mapOauthClientRow(row: D1OauthClientRow): OauthClientRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    clientSecretHint: row.client_secret_hint,
    name: row.name,
    description: row.description ?? null,
    redirectUris: parseRedirectUris(row.redirect_uris),
    ownerScope: row.owner_scope === 'team' ? 'team' : 'nexus',
    ownerUserId: row.owner_user_id,
    ownerTeamId: row.owner_team_id ?? null,
    createdByRole: row.created_by_role === 'team_admin' ? 'team_admin' : 'nexus_admin',
    status: row.status === 'revoked' ? 'revoked' : 'active',
    lastUsedAt: row.last_used_at ?? null,
    revokedAt: row.revoked_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function ensureOauthClientSchema(db: D1Database) {
  if (oauthClientSchemaInitialized) {
    return
  }

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${OAUTH_CLIENTS_TABLE} (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL UNIQUE,
      client_secret_hash TEXT NOT NULL,
      client_secret_hint TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      redirect_uris TEXT NOT NULL,
      owner_scope TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      owner_team_id TEXT,
      created_by_role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      last_used_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_oauth_clients_owner_scope
    ON ${OAUTH_CLIENTS_TABLE}(owner_scope, owner_user_id, owner_team_id, created_at DESC);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_oauth_clients_client_id
    ON ${OAUTH_CLIENTS_TABLE}(client_id, status);
  `).run()

  oauthClientSchemaInitialized = true
}

function normalizeRedirectUris(input: string[]): string[] {
  const normalized: string[] = []
  for (const item of input) {
    const value = String(item || '').trim()
    if (!value) {
      continue
    }
    let parsed: URL
    try {
      parsed = new URL(value)
    }
    catch {
      throw createError({
        statusCode: 400,
        statusMessage: 'redirectUris must be absolute URL list.',
      })
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw createError({
        statusCode: 400,
        statusMessage: 'redirectUris protocol must be http or https.',
      })
    }
    const normalizedValue = parsed.toString()
    if (!normalized.includes(normalizedValue)) {
      normalized.push(normalizedValue)
    }
  }
  return normalized
}

export interface CreateOauthClientInput {
  ownerScope: OauthOwnerScope
  ownerUserId: string
  ownerTeamId?: string | null
  createdByRole: OauthCreatedByRole
  name: string
  description?: string | null
  redirectUris: string[]
}

export async function createOauthClient(
  event: H3Event,
  input: CreateOauthClientInput,
): Promise<OauthClientWithSecret> {
  const db = requireDatabase(event)
  await ensureOauthClientSchema(db)

  const name = String(input.name || '').trim()
  if (!name || name.length > 80) {
    throw createError({
      statusCode: 400,
      statusMessage: 'name is required and must be <= 80 chars.',
    })
  }

  const description = String(input.description || '').trim()
  const redirectUris = normalizeRedirectUris(input.redirectUris)
  if (redirectUris.length <= 0 || redirectUris.length > 10) {
    throw createError({
      statusCode: 400,
      statusMessage: 'redirectUris must contain 1-10 valid urls.',
    })
  }

  if (input.ownerScope === 'team' && !String(input.ownerTeamId || '').trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: 'ownerTeamId is required for team scope.',
    })
  }

  const id = randomUUID()
  const clientId = generateClientId()
  const clientSecret = generateClientSecret()
  const clientSecretHash = hashSecret(clientSecret)
  const clientSecretHint = makeClientHint(clientSecret)
  const now = new Date().toISOString()

  await db.prepare(`
    INSERT INTO ${OAUTH_CLIENTS_TABLE} (
      id, client_id, client_secret_hash, client_secret_hint,
      name, description, redirect_uris,
      owner_scope, owner_user_id, owner_team_id, created_by_role,
      status, last_used_at, revoked_at, created_at, updated_at
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'active', NULL, NULL, ?12, ?13);
  `).bind(
    id,
    clientId,
    clientSecretHash,
    clientSecretHint,
    name,
    description || null,
    JSON.stringify(redirectUris),
    input.ownerScope,
    input.ownerUserId,
    input.ownerScope === 'team' ? String(input.ownerTeamId || '').trim() : null,
    input.createdByRole,
    now,
    now,
  ).run()

  return {
    id,
    clientId,
    clientSecretHint,
    clientSecret,
    name,
    description: description || null,
    redirectUris,
    ownerScope: input.ownerScope,
    ownerUserId: input.ownerUserId,
    ownerTeamId: input.ownerScope === 'team' ? String(input.ownerTeamId || '').trim() : null,
    createdByRole: input.createdByRole,
    status: 'active',
    lastUsedAt: null,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

export interface ListOauthClientsInput {
  ownerScope: OauthOwnerScope
  ownerUserId?: string
  ownerTeamId?: string
}

export async function listOauthClients(
  event: H3Event,
  input: ListOauthClientsInput,
): Promise<OauthClientRecord[]> {
  const db = requireDatabase(event)
  await ensureOauthClientSchema(db)

  let statement
  if (input.ownerScope === 'team') {
    const ownerTeamId = String(input.ownerTeamId || '').trim()
    if (!ownerTeamId) {
      return []
    }
    statement = db.prepare(`
      SELECT * FROM ${OAUTH_CLIENTS_TABLE}
      WHERE owner_scope = 'team' AND owner_team_id = ?1
      ORDER BY created_at DESC;
    `).bind(ownerTeamId)
  }
  else {
    const ownerUserId = String(input.ownerUserId || '').trim()
    if (!ownerUserId) {
      return []
    }
    statement = db.prepare(`
      SELECT * FROM ${OAUTH_CLIENTS_TABLE}
      WHERE owner_scope = 'nexus' AND owner_user_id = ?1
      ORDER BY created_at DESC;
    `).bind(ownerUserId)
  }

  const { results } = await statement.all<D1OauthClientRow>()
  return (results ?? []).map(mapOauthClientRow)
}

export interface RevokeOauthClientInput {
  id: string
  ownerScope: OauthOwnerScope
  ownerUserId?: string
  ownerTeamId?: string
}

interface OauthClientOwnerInput {
  ownerScope: OauthOwnerScope
  ownerUserId?: string
  ownerTeamId?: string
}

function resolveOwnerBinding(input: OauthClientOwnerInput): {
  clause: string
  value: string
} | null {
  if (input.ownerScope === 'team') {
    const ownerTeamId = String(input.ownerTeamId || '').trim()
    if (!ownerTeamId) {
      return null
    }
    return {
      clause: "owner_scope = 'team' AND owner_team_id = ?2",
      value: ownerTeamId,
    }
  }

  const ownerUserId = String(input.ownerUserId || '').trim()
  if (!ownerUserId) {
    return null
  }
  return {
    clause: "owner_scope = 'nexus' AND owner_user_id = ?2",
    value: ownerUserId,
  }
}

async function getOauthClientByIdForOwner(
  event: H3Event,
  input: OauthClientOwnerInput & { id: string },
): Promise<OauthClientRecord | null> {
  const db = requireDatabase(event)
  await ensureOauthClientSchema(db)
  const id = String(input.id || '').trim()
  if (!id) {
    return null
  }

  const ownerBinding = resolveOwnerBinding(input)
  if (!ownerBinding) {
    return null
  }

  const row = await db.prepare(`
    SELECT * FROM ${OAUTH_CLIENTS_TABLE}
    WHERE id = ?1
      AND ${ownerBinding.clause}
    LIMIT 1
  `).bind(id, ownerBinding.value).first<D1OauthClientRow>()

  if (!row) {
    return null
  }
  return mapOauthClientRow(row)
}

export async function revokeOauthClient(
  event: H3Event,
  input: RevokeOauthClientInput,
): Promise<boolean> {
  const db = requireDatabase(event)
  await ensureOauthClientSchema(db)

  const id = String(input.id || '').trim()
  if (!id) {
    return false
  }

  const now = new Date().toISOString()
  const ownerBinding = resolveOwnerBinding(input)
  if (!ownerBinding) {
    return false
  }

  const result = await db.prepare(`
    UPDATE ${OAUTH_CLIENTS_TABLE}
    SET status = 'revoked', revoked_at = ?1, updated_at = ?2
    WHERE id = ?3
      AND ${ownerBinding.clause.replace('?2', '?4')}
      AND status = 'active'
  `).bind(now, now, id, ownerBinding.value).run()

  return Number(result.meta?.changes ?? 0) > 0
}

export interface UpdateOauthClientInput extends OauthClientOwnerInput {
  id: string
  name: string
  description?: string | null
  redirectUris: string[]
}

export async function updateOauthClient(
  event: H3Event,
  input: UpdateOauthClientInput,
): Promise<OauthClientRecord | null> {
  const db = requireDatabase(event)
  await ensureOauthClientSchema(db)

  const id = String(input.id || '').trim()
  if (!id) {
    return null
  }

  const name = String(input.name || '').trim()
  if (!name || name.length > 80) {
    throw createError({
      statusCode: 400,
      statusMessage: 'name is required and must be <= 80 chars.',
    })
  }

  const description = String(input.description || '').trim()
  const redirectUris = normalizeRedirectUris(input.redirectUris)
  if (redirectUris.length <= 0 || redirectUris.length > 10) {
    throw createError({
      statusCode: 400,
      statusMessage: 'redirectUris must contain 1-10 valid urls.',
    })
  }

  const ownerBinding = resolveOwnerBinding(input)
  if (!ownerBinding) {
    return null
  }

  const now = new Date().toISOString()
  const result = await db.prepare(`
    UPDATE ${OAUTH_CLIENTS_TABLE}
    SET name = ?1,
        description = ?2,
        redirect_uris = ?3,
        updated_at = ?4
    WHERE id = ?5
      AND ${ownerBinding.clause.replace('?2', '?6')}
      AND status = 'active'
  `).bind(
    name,
    description || null,
    JSON.stringify(redirectUris),
    now,
    id,
    ownerBinding.value,
  ).run()

  if (Number(result.meta?.changes ?? 0) <= 0) {
    return null
  }

  return await getOauthClientByIdForOwner(event, {
    id,
    ownerScope: input.ownerScope,
    ownerUserId: input.ownerUserId,
    ownerTeamId: input.ownerTeamId,
  })
}

export interface RotateOauthClientSecretInput extends OauthClientOwnerInput {
  id: string
}

export async function rotateOauthClientSecret(
  event: H3Event,
  input: RotateOauthClientSecretInput,
): Promise<OauthClientWithSecret | null> {
  const db = requireDatabase(event)
  await ensureOauthClientSchema(db)

  const id = String(input.id || '').trim()
  if (!id) {
    return null
  }

  const ownerBinding = resolveOwnerBinding(input)
  if (!ownerBinding) {
    return null
  }

  const clientSecret = generateClientSecret()
  const clientSecretHash = hashSecret(clientSecret)
  const clientSecretHint = makeClientHint(clientSecret)
  const now = new Date().toISOString()

  const result = await db.prepare(`
    UPDATE ${OAUTH_CLIENTS_TABLE}
    SET client_secret_hash = ?1,
        client_secret_hint = ?2,
        updated_at = ?3
    WHERE id = ?4
      AND ${ownerBinding.clause.replace('?2', '?5')}
      AND status = 'active'
  `).bind(
    clientSecretHash,
    clientSecretHint,
    now,
    id,
    ownerBinding.value,
  ).run()

  if (Number(result.meta?.changes ?? 0) <= 0) {
    return null
  }

  const record = await getOauthClientByIdForOwner(event, {
    id,
    ownerScope: input.ownerScope,
    ownerUserId: input.ownerUserId,
    ownerTeamId: input.ownerTeamId,
  })
  if (!record) {
    return null
  }

  return {
    ...record,
    clientSecret,
  }
}

export async function getActiveOauthClientByClientId(
  event: H3Event,
  clientId: string,
): Promise<OauthClientRecord | null> {
  const db = requireDatabase(event)
  await ensureOauthClientSchema(db)

  const normalized = String(clientId || '').trim()
  if (!normalized) {
    return null
  }

  const row = await db.prepare(`
    SELECT * FROM ${OAUTH_CLIENTS_TABLE}
    WHERE client_id = ?1 AND status = 'active'
    LIMIT 1
  `).bind(normalized).first<D1OauthClientRow>()

  if (!row) {
    return null
  }

  return mapOauthClientRow(row)
}

async function touchOauthClientLastUsed(event: H3Event, clientId: string): Promise<void> {
  const db = requireDatabase(event)
  await ensureOauthClientSchema(db)

  const now = new Date().toISOString()
  await db.prepare(`
    UPDATE ${OAUTH_CLIENTS_TABLE}
    SET last_used_at = ?1, updated_at = ?2
    WHERE client_id = ?3
  `).bind(now, now, clientId).run()
}

function timingSafeEqualHex(leftHex: string, rightHex: string): boolean {
  const left = Buffer.from(leftHex, 'hex')
  const right = Buffer.from(rightHex, 'hex')
  if (left.length !== right.length) {
    return false
  }
  return timingSafeEqual(left, right)
}

export async function verifyOauthClientSecret(
  event: H3Event,
  payload: {
    clientId: string
    clientSecret: string
  },
): Promise<OauthClientRecord | null> {
  const db = requireDatabase(event)
  await ensureOauthClientSchema(db)

  const normalizedClientId = String(payload.clientId || '').trim()
  const normalizedSecret = String(payload.clientSecret || '').trim()
  if (!normalizedClientId || !normalizedSecret) {
    return null
  }

  const row = await db.prepare(`
    SELECT * FROM ${OAUTH_CLIENTS_TABLE}
    WHERE client_id = ?1 AND status = 'active'
    LIMIT 1
  `).bind(normalizedClientId).first<D1OauthClientRow>()

  if (!row) {
    return null
  }

  const expectedHash = row.client_secret_hash
  const providedHash = hashSecret(normalizedSecret)
  if (!timingSafeEqualHex(expectedHash, providedHash)) {
    return null
  }

  await touchOauthClientLastUsed(event, normalizedClientId)
  return mapOauthClientRow(row)
}
