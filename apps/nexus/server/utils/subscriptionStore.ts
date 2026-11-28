import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { randomInt, randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import { defineD1Schema, ensureD1Schema } from './d1Schema'
import { PLAN_CATALOG } from './planCatalog'

const ACTIVATION_CODES_TABLE = 'activation_codes'
const ACTIVATION_LOGS_TABLE = 'activation_logs'

/** Lowest tier first; `PLAN_CATALOG` holds what each includes. */
export type SubscriptionPlan = 'FREE' | 'PLUS' | 'PRO' | 'TEAM' | 'ENTERPRISE'

const PLAN_TIER_RANK: Record<SubscriptionPlan, number> = {
  FREE: 0,
  PLUS: 1,
  PRO: 2,
  TEAM: 3,
  ENTERPRISE: 4,
}

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

const SUBSCRIPTION_SCHEMA = defineD1Schema('subscriptions', {
  statements: [
    `CREATE TABLE IF NOT EXISTS ${ACTIVATION_CODES_TABLE} (
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
      )`,
    `CREATE INDEX IF NOT EXISTS idx_activation_code ON ${ACTIVATION_CODES_TABLE}(code)`,
    `CREATE TABLE IF NOT EXISTS ${ACTIVATION_LOGS_TABLE} (
        id TEXT PRIMARY KEY,
        code_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        activated_at TEXT NOT NULL,
        plan TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )`,
    `CREATE INDEX IF NOT EXISTS idx_activation_user ON ${ACTIVATION_LOGS_TABLE}(user_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_activation_logs_code_user ON ${ACTIVATION_LOGS_TABLE}(code_id, user_id)`,
  ],
})

async function ensureSubscriptionSchema(db: D1Database) {
  await ensureD1Schema(db, SUBSCRIPTION_SCHEMA)
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

/**
 * Crockford-style alphabet: no I, O, 0 or 1, so a code read aloud or off a screen cannot be
 * mistyped between visually similar characters.
 */
const ACTIVATION_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/**
 * These grant paid plans, so they have to be unguessable.
 *
 * This used Math.random, which is V8's xorshift128+ — not a CSPRNG and not meant to be one.
 * Its internal state is recoverable from a handful of consecutive outputs, so an attacker
 * holding two codes minted in the same isolate could reconstruct every other code that
 * isolate produced and redeem them against /api/subscription/activate (#918).
 *
 * randomInt is rejection-sampled and unbiased. The alphabet is 32 characters, a power of
 * two, so a mask over randomBytes would also have been unbiased — randomInt is used because
 * it stays correct if the alphabet ever changes length.
 */
function randomCodeSegment(length: number): string {
  let out = ''
  for (let i = 0; i < length; i++)
    out += ACTIVATION_CODE_ALPHABET.charAt(randomInt(ACTIVATION_CODE_ALPHABET.length))
  return out
}

export function generateActivationCode(plan: SubscriptionPlan): string {
  return `TUFF-${plan}-${randomCodeSegment(8)}-${randomCodeSegment(4)}`
}

export interface CreateActivationCodeInput {
  plan: SubscriptionPlan
  durationDays: number
  maxUses?: number
  expiresInDays?: number
  createdBy?: string
}

export async function createActivationCode(event: H3Event, input: CreateActivationCodeInput): Promise<ActivationCode> {
  const [code] = await createActivationCodes(event, input, 1)
  return code!
}

/**
 * `count` codes with the same terms, written in one batch: one round trip, and all or none of them.
 * The admin generator used to insert up to a hundred one after another, and a failure part way left
 * the codes before it in place with no audit entry for them.
 */
export async function createActivationCodes(
  event: H3Event,
  input: CreateActivationCodeInput,
  count: number,
): Promise<ActivationCode[]> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureSubscriptionSchema(db)

  const now = new Date()
  const expiresAt = input.expiresInDays
    ? new Date(now.getTime() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString()
    : null

  const codes: ActivationCode[] = Array.from({ length: count }, () => ({
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
  }))

  await db.batch(codes.map(code => db.prepare(`
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
  )))

  return codes
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

  const [existingUse, currentSubscription] = await Promise.all([
    db.prepare(`
      SELECT id FROM ${ACTIVATION_LOGS_TABLE}
      WHERE code_id = ?1 AND user_id = ?2
      LIMIT 1;
    `).bind(activationCode.id, userId).first<{ id: string }>(),
    getUserSubscription(event, userId),
  ])

  if (existingUse) {
    throw createError({ statusCode: 409, statusMessage: 'You have already redeemed this activation code' })
  }

  if (
    currentSubscription.isActive
    && (PLAN_TIER_RANK[currentSubscription.plan] ?? 0) > (PLAN_TIER_RANK[activationCode.plan] ?? 0)
  ) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Cannot activate a lower-tier code while a higher-tier subscription is active',
    })
  }

  // Calculate subscription expiry: stack onto remaining duration for same-tier active subscriptions.
  const now = new Date()
  const currentExpiresMs = currentSubscription.isActive
    && currentSubscription.plan === activationCode.plan
    && currentSubscription.expiresAt
    ? Date.parse(currentSubscription.expiresAt)
    : Number.NaN
  const baseMs = Number.isFinite(currentExpiresMs) && currentExpiresMs > now.getTime()
    ? currentExpiresMs
    : now.getTime()
  const expiresAt = new Date(baseMs + activationCode.durationDays * 24 * 60 * 60 * 1000).toISOString()

  // Atomically log per-user redemption and increment code uses in a single D1 batch transaction.
  // `idx_activation_logs_code_user` prevents the same user from exhausting a multi-use code,
  // while the compare-and-swap on `uses` prevents concurrent over-redemption.
  const newUses = activationCode.uses + 1
  const newStatus = newUses >= activationCode.maxUses ? 'exhausted' : 'active'
  const logId = randomUUID()
  const activatedAt = now.toISOString()

  let batchResults: Awaited<ReturnType<D1Database['batch']>>
  try {
    batchResults = await db.batch([
      db.prepare(`
        INSERT INTO ${ACTIVATION_LOGS_TABLE} (id, code_id, user_id, activated_at, plan, expires_at)
        SELECT ?1, ?2, ?3, ?4, ?5, ?6
        WHERE EXISTS (
          SELECT 1 FROM ${ACTIVATION_CODES_TABLE}
          WHERE id = ?2 AND status = 'active' AND uses = ?7 AND uses < max_uses
        );
      `).bind(logId, activationCode.id, userId, activatedAt, activationCode.plan, expiresAt, activationCode.uses),
      db.prepare(`
        UPDATE ${ACTIVATION_CODES_TABLE}
        SET uses = ?1, status = ?2
        WHERE id = ?3 AND status = 'active' AND uses = ?4
          AND EXISTS (SELECT 1 FROM ${ACTIVATION_LOGS_TABLE} WHERE id = ?5);
      `).bind(newUses, newStatus, activationCode.id, activationCode.uses, logId),
    ])
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    if (/UNIQUE constraint failed/i.test(message)) {
      throw createError({ statusCode: 409, statusMessage: 'You have already redeemed this activation code' })
    }
    throw error
  }

  const inserted = Number((batchResults[0] as any)?.meta?.changes ?? 0)
  const claimed = Number((batchResults[1] as any)?.meta?.changes ?? 0)
  if (inserted < 1 || claimed < 1) {
    throw createError({ statusCode: 409, statusMessage: 'Code was already used' })
  }

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

interface LatestActivationRow {
  plan: string
  activated_at: string
  expires_at: string
}

/**
 * The statement that reads a user's effective plan activation; `mapLatestActivation` reads its row.
 * Prefers active (unexpired) activations ranked by highest plan tier, then longest expiry, so a
 * shorter or lower-tier activation can never downgrade an active higher-tier subscription.
 */
export function prepareLatestActivationQuery(db: D1Database, userId: string, nowIso = new Date().toISOString()): D1PreparedStatement {
  return db.prepare(`
    SELECT plan, activated_at, expires_at
    FROM ${ACTIVATION_LOGS_TABLE}
    WHERE user_id = ?1
    ORDER BY
      CASE WHEN expires_at IS NULL OR expires_at > ?2 THEN 1 ELSE 0 END DESC,
      CASE plan
        WHEN 'ENTERPRISE' THEN 4
        WHEN 'TEAM' THEN 3
        WHEN 'PRO' THEN 2
        WHEN 'PLUS' THEN 1
        ELSE 0
      END DESC,
      expires_at DESC,
      activated_at DESC
    LIMIT 1;
  `).bind(userId, nowIso)
}

export function mapLatestActivation(row: LatestActivationRow | null | undefined): UserSubscription {
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

export async function ensureSubscriptionTables(db: D1Database): Promise<void> {
  await ensureSubscriptionSchema(db)
}

export async function getUserSubscription(event: H3Event, userId: string): Promise<UserSubscription> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 500, statusMessage: 'Database not available' })
  }

  await ensureSubscriptionSchema(db)

  const row = await prepareLatestActivationQuery(db, userId).first<LatestActivationRow>()
  return mapLatestActivation(row)
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
  const entitlements = PLAN_CATALOG[plan] || PLAN_CATALOG.FREE
  return {
    aiRequestsLimit: entitlements.aiRequests,
    aiTokensLimit: entitlements.aiTokens,
    customModels: entitlements.customModels,
    prioritySupport: entitlements.prioritySupport,
    apiAccess: entitlements.apiAccess,
  }
}
