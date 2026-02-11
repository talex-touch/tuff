import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'

const ACTIVATION_CODES_TABLE = 'activation_codes'
const ACTIVATION_LOGS_TABLE = 'activation_logs'

let subscriptionSchemaInitialized = false

export type SubscriptionPlan = 'FREE' | 'PRO' | 'PLUS' | 'TEAM' | 'ENTERPRISE'

interface D1ActivationCodeRow {
  id: string
  code: string
  plan: string
  duration_days: number
  max_uses: number
  uses: number
  created_at: string
  expires_at: string | null
  created_by: string | null
  status: string
}

export interface ActivationCode {
  id: string
  code: string
  plan: SubscriptionPlan
  durationDays: number
  maxUses: number
  uses: number
  createdAt: string
  expiresAt: string | null
  createdBy: string | null
  status: 'active' | 'exhausted' | 'expired' | 'revoked'
}

export interface UserSubscription {
  plan: SubscriptionPlan
  expiresAt: string | null
  activatedAt: string | null
  isActive: boolean
}

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

async function ensureSubscriptionSchema(db: D1Database) {
  if (subscriptionSchemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${ACTIVATION_CODES_TABLE} (
      id TEXT PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      plan TEXT NOT NULL,
      duration_days INTEGER NOT NULL,
      max_uses INTEGER DEFAULT 1,
      uses INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      created_by TEXT,
      status TEXT DEFAULT 'active'
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_activation_code ON ${ACTIVATION_CODES_TABLE}(code);
  `).run()

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${ACTIVATION_LOGS_TABLE} (
      id TEXT PRIMARY KEY,
      code_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      activated_at TEXT NOT NULL,
      plan TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_activation_user ON ${ACTIVATION_LOGS_TABLE}(user_id);
  `).run()

  subscriptionSchemaInitialized = true
}

function normalizeActivationCode(code: string): string {
  return code.trim().toUpperCase()
}

function mapCodeRow(row: D1ActivationCodeRow): ActivationCode {
  return {
    id: row.id,
    code: row.code,
    plan: row.plan as SubscriptionPlan,
    durationDays: row.duration_days,
    maxUses: row.max_uses,
    uses: row.uses,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    createdBy: row.created_by,
    status: row.status as ActivationCode['status'],
  }
}

function generateActivationCode(plan: SubscriptionPlan): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let random = ''
  for (let i = 0; i < 8; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  let check = ''
  for (let i = 0; i < 4; i++) {
    check += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `TUFF-${plan}-${random}-${check}`
}

export async function createActivationCode(
  event: H3Event,
  input: {
    plan: SubscriptionPlan
    durationDays: number
    maxUses?: number
    expiresInDays?: number
    createdBy?: string
  },
): Promise<ActivationCode> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureSubscriptionSchema(db)

  const now = new Date()
  const expiresAt = input.expiresInDays
    ? new Date(now.getTime() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null

  const code: ActivationCode = {
    id: randomUUID(),
    code: generateActivationCode(input.plan),
    plan: input.plan,
    durationDays: input.durationDays,
    maxUses: input.maxUses || 1,
    uses: 0,
    createdAt: now.toISOString(),
    expiresAt,
    createdBy: input.createdBy || null,
    status: 'active',
  }

  await db.prepare(`
    INSERT INTO ${ACTIVATION_CODES_TABLE} (
      id, code, plan, duration_days, max_uses, uses,
      created_at, expires_at, created_by, status
    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10);
  `).bind(
    code.id,
    code.code,
    code.plan,
    code.durationDays,
    code.maxUses,
    code.uses,
    code.createdAt,
    code.expiresAt,
    code.createdBy,
    code.status,
  ).run()

  return code
}

export async function getActivationCodeByCode(
  event: H3Event,
  code: string,
): Promise<ActivationCode | null> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureSubscriptionSchema(db)

  const normalizedCode = normalizeActivationCode(code)

  const row = await db.prepare(`
    SELECT * FROM ${ACTIVATION_CODES_TABLE} WHERE code = ?1;
  `).bind(normalizedCode).first<D1ActivationCodeRow>()

  return row ? mapCodeRow(row) : null
}

export async function activateCode(
  event: H3Event,
  code: string,
  userId: string,
): Promise<{ plan: SubscriptionPlan, expiresAt: string }> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureSubscriptionSchema(db)

  const activationCode = await getActivationCodeByCode(event, code)
  if (!activationCode) {
    throw createError({ statusCode: 404, statusMessage: 'Invalid activation code' })
  }

  if (activationCode.status !== 'active') {
    throw createError({ statusCode: 400, statusMessage: `Code is ${activationCode.status}` })
  }

  if (activationCode.expiresAt && new Date(activationCode.expiresAt) < new Date()) {
    await db.prepare(`
      UPDATE ${ACTIVATION_CODES_TABLE} SET status = 'expired' WHERE id = ?1;
    `).bind(activationCode.id).run()
    throw createError({ statusCode: 400, statusMessage: 'Code has expired' })
  }

  if (activationCode.uses >= activationCode.maxUses) {
    throw createError({ statusCode: 400, statusMessage: 'Code has reached max uses' })
  }

  // Calculate subscription expiry
  const now = new Date()
  const expiresAt = new Date(now.getTime() + activationCode.durationDays * 24 * 60 * 60 * 1000).toISOString()

  // Log activation
  await db.prepare(`
    INSERT INTO ${ACTIVATION_LOGS_TABLE} (id, code_id, user_id, activated_at, plan, expires_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6);
  `).bind(
    randomUUID(),
    activationCode.id,
    userId,
    now.toISOString(),
    activationCode.plan,
    expiresAt,
  ).run()

  // Update code usage
  const newUses = activationCode.uses + 1
  const newStatus = newUses >= activationCode.maxUses ? 'exhausted' : 'active'

  await db.prepare(`
    UPDATE ${ACTIVATION_CODES_TABLE}
    SET uses = ?1, status = ?2
    WHERE id = ?3;
  `).bind(newUses, newStatus, activationCode.id).run()

  return {
    plan: activationCode.plan,
    expiresAt,
  }
}

export async function getUserActivationHistory(
  event: H3Event,
  userId: string,
): Promise<Array<{ plan: SubscriptionPlan, activatedAt: string, expiresAt: string }>> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureSubscriptionSchema(db)

  const { results } = await db.prepare(`
    SELECT plan, activated_at, expires_at
    FROM ${ACTIVATION_LOGS_TABLE}
    WHERE user_id = ?1
    ORDER BY activated_at DESC;
  `).bind(userId).all<{ plan: string, activated_at: string, expires_at: string }>()

  return (results ?? []).map(row => ({
    plan: row.plan as SubscriptionPlan,
    activatedAt: row.activated_at,
    expiresAt: row.expires_at,
  }))
}

export async function getUserSubscription(event: H3Event, userId: string): Promise<UserSubscription> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureSubscriptionSchema(db)

  const row = await db.prepare(`
    SELECT plan, activated_at, expires_at
    FROM ${ACTIVATION_LOGS_TABLE}
    WHERE user_id = ?1
    ORDER BY activated_at DESC
    LIMIT 1;
  `).bind(userId).first<{ plan: string, activated_at: string, expires_at: string }>()

  if (!row) {
    return {
      plan: 'FREE',
      expiresAt: null,
      activatedAt: null,
      isActive: true,
    }
  }

  const expiresAt = row.expires_at ? new Date(row.expires_at) : null
  const isActive = !expiresAt || expiresAt > new Date()

  return {
    plan: (isActive ? row.plan : 'FREE') as SubscriptionPlan,
    expiresAt: row.expires_at || null,
    activatedAt: row.activated_at || null,
    isActive,
  }
}

export function getSubscriptionFromMetadata(metadata: any): UserSubscription {
  const sub = metadata?.subscription
  if (!sub) {
    return {
      plan: 'FREE',
      expiresAt: null,
      activatedAt: null,
      isActive: true,
    }
  }

  const expiresAt = sub.expiresAt ? new Date(sub.expiresAt) : null
  const isActive = !expiresAt || expiresAt > new Date()

  return {
    plan: (isActive ? sub.plan : 'FREE') as SubscriptionPlan,
    expiresAt: sub.expiresAt || null,
    activatedAt: sub.activatedAt || null,
    isActive,
  }
}

export function getPlanFeatures(plan: SubscriptionPlan): {
  aiRequestsLimit: number
  aiTokensLimit: number
  customModels: boolean
  prioritySupport: boolean
  apiAccess: boolean
} {
  const features = {
    FREE: { aiRequestsLimit: 50, aiTokensLimit: 10000, customModels: false, prioritySupport: false, apiAccess: false },
    PRO: { aiRequestsLimit: 500, aiTokensLimit: 100000, customModels: true, prioritySupport: false, apiAccess: true },
    PLUS: { aiRequestsLimit: 2000, aiTokensLimit: 500000, customModels: true, prioritySupport: true, apiAccess: true },
    TEAM: { aiRequestsLimit: 5000, aiTokensLimit: 1000000, customModels: true, prioritySupport: true, apiAccess: true },
    ENTERPRISE: { aiRequestsLimit: -1, aiTokensLimit: -1, customModels: true, prioritySupport: true, apiAccess: true },
  }
  return features[plan] || features.FREE
}
