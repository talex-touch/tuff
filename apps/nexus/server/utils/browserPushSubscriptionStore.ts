import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createHash } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import { recordPlatformGovernanceEvent } from './platformGovernanceStore'
import { isPlainObject, normalizeString } from './telemetrySanitizer'

const SUBSCRIPTIONS_TABLE = 'browser_push_subscriptions'
const MAX_MEMORY_ITEMS = 1000

const initializedSchemas = new WeakSet<D1Database>()

export interface BrowserPushSubscriptionPayload {
  endpoint: string
  expirationTime: number | null
  keys: {
    p256dh: string
    auth: string
  }
}

export interface BrowserPushSubscriptionSummary {
  id: string
  userId: string
  endpointOrigin: string
  endpointHost: string
  expirationTime: number | null
  hasKeys: boolean
  createdAt: string
  updatedAt: string
}

export interface BrowserPushSubscriptionDeliveryRecord extends BrowserPushSubscriptionSummary {
  payload: BrowserPushSubscriptionPayload
}

export interface UpsertBrowserPushSubscriptionInput {
  userId: unknown
  subscription: unknown
  userAgent?: unknown
}

export interface ListBrowserPushSubscriptionsOptions {
  userId: unknown
  limit?: unknown
}

interface BrowserPushSubscriptionRecord extends BrowserPushSubscriptionDeliveryRecord {
  endpointHash: string
  userAgent: string | null
}

interface BrowserPushSubscriptionRow {
  id: string
  user_id: string
  endpoint_hash: string
  endpoint: string
  p256dh: string
  auth: string
  expiration_time: number | null
  endpoint_origin: string
  endpoint_host: string
  user_agent: string | null
  created_at: string
  updated_at: string
}

const memoryItems = new Map<string, BrowserPushSubscriptionRecord>()

function getD1Database(event?: H3Event | null): D1Database | null {
  return event ? readCloudflareBindings(event)?.DB ?? null : null
}

async function ensureBrowserPushSubscriptionSchema(db: D1Database): Promise<void> {
  if (initializedSchemas.has(db))
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${SUBSCRIPTIONS_TABLE} (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      endpoint_hash TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      expiration_time INTEGER,
      endpoint_origin TEXT NOT NULL,
      endpoint_host TEXT NOT NULL,
      user_agent TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()

  await db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${SUBSCRIPTIONS_TABLE}_user_endpoint ON ${SUBSCRIPTIONS_TABLE}(user_id, endpoint_hash);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_${SUBSCRIPTIONS_TABLE}_user_updated ON ${SUBSCRIPTIONS_TABLE}(user_id, updated_at);`).run()

  initializedSchemas.add(db)
}

function assertString(value: unknown, field: string, maxLength = 180): string {
  const normalized = normalizeString(value, maxLength)
  if (!normalized)
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  return normalized
}

function optionalString(value: unknown, maxLength = 512): string | null {
  return normalizeString(value, maxLength) ?? null
}

function normalizeLimit(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0)
    return Math.min(Math.floor(value), 50)
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0)
      return Math.min(parsed, 50)
  }
  return 20
}

function normalizeExpirationTime(value: unknown): number | null {
  if (value == null)
    return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw createError({ statusCode: 400, statusMessage: 'subscription.expirationTime is invalid.' })
  return Math.round(value)
}

function parseSubscription(value: unknown): BrowserPushSubscriptionPayload {
  if (!isPlainObject(value))
    throw createError({ statusCode: 400, statusMessage: 'subscription must be a JSON object.' })

  const endpoint = assertString(value.endpoint, 'subscription.endpoint', 2048)
  let parsedEndpoint: URL
  try {
    parsedEndpoint = new URL(endpoint)
  }
  catch {
    throw createError({ statusCode: 400, statusMessage: 'subscription.endpoint is invalid.' })
  }
  if (parsedEndpoint.protocol !== 'https:')
    throw createError({ statusCode: 400, statusMessage: 'subscription.endpoint must use https.' })

  const keys = value.keys
  if (!isPlainObject(keys))
    throw createError({ statusCode: 400, statusMessage: 'subscription.keys is invalid.' })

  return {
    endpoint,
    expirationTime: normalizeExpirationTime(value.expirationTime),
    keys: {
      p256dh: assertString(keys.p256dh, 'subscription.keys.p256dh', 512),
      auth: assertString(keys.auth, 'subscription.keys.auth', 512),
    },
  }
}

function hashEndpoint(userId: string, endpoint: string): string {
  return createHash('sha256').update(`${userId}:${endpoint}`).digest('hex')
}

function createSummary(record: BrowserPushSubscriptionRecord): BrowserPushSubscriptionSummary {
  return {
    id: record.id,
    userId: record.userId,
    endpointOrigin: record.endpointOrigin,
    endpointHost: record.endpointHost,
    expirationTime: record.expirationTime,
    hasKeys: record.hasKeys,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

function mapRow(row: BrowserPushSubscriptionRow): BrowserPushSubscriptionDeliveryRecord {
  return {
    id: row.id,
    userId: row.user_id,
    endpointOrigin: row.endpoint_origin,
    endpointHost: row.endpoint_host,
    expirationTime: row.expiration_time,
    hasKeys: Boolean(row.p256dh && row.auth),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    payload: {
      endpoint: row.endpoint,
      expirationTime: row.expiration_time,
      keys: {
        p256dh: row.p256dh,
        auth: row.auth,
      },
    },
  }
}

export function normalizeBrowserPushSubscription(value: unknown): BrowserPushSubscriptionPayload {
  return parseSubscription(value)
}

export async function upsertBrowserPushSubscription(
  event: H3Event | undefined,
  input: UpsertBrowserPushSubscriptionInput,
): Promise<BrowserPushSubscriptionSummary> {
  const userId = assertString(input.userId, 'userId', 180)
  const payload = parseSubscription(input.subscription)
  const parsedEndpoint = new URL(payload.endpoint)
  const endpointHash = hashEndpoint(userId, payload.endpoint)
  const id = endpointHash.slice(0, 32)
  const now = new Date().toISOString()
  const userAgent = optionalString(input.userAgent, 512)

  const record: BrowserPushSubscriptionRecord = {
    id,
    userId,
    endpointHash,
    endpointOrigin: parsedEndpoint.origin,
    endpointHost: parsedEndpoint.hostname,
    expirationTime: payload.expirationTime,
    hasKeys: true,
    payload,
    userAgent,
    createdAt: now,
    updatedAt: now,
  }

  const db = getD1Database(event)
  if (!db) {
    const existing = memoryItems.get(id)
    record.createdAt = existing?.createdAt ?? record.createdAt
    memoryItems.set(id, record)
    if (memoryItems.size > MAX_MEMORY_ITEMS) {
      const oldest = [...memoryItems.values()].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt)).slice(0, memoryItems.size - MAX_MEMORY_ITEMS)
      oldest.forEach(item => memoryItems.delete(item.id))
    }
    const summary = createSummary(record)
    await recordBrowserPushSubscriptionAudit(event, 'browser_push.subscription.upserted', summary)
    return summary
  }

  await ensureBrowserPushSubscriptionSchema(db)
  const existingRow = await db.prepare(`
    SELECT created_at
    FROM ${SUBSCRIPTIONS_TABLE}
    WHERE user_id = ?1 AND endpoint_hash = ?2
    LIMIT 1;
  `).bind(userId, endpointHash).first<{ created_at: string }>()
  record.createdAt = existingRow?.created_at ?? record.createdAt

  await db.prepare(`
    INSERT INTO ${SUBSCRIPTIONS_TABLE} (
      id, user_id, endpoint_hash, endpoint, p256dh, auth, expiration_time,
      endpoint_origin, endpoint_host, user_agent, created_at, updated_at
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
    ON CONFLICT(user_id, endpoint_hash) DO UPDATE SET
      endpoint = excluded.endpoint,
      p256dh = excluded.p256dh,
      auth = excluded.auth,
      expiration_time = excluded.expiration_time,
      endpoint_origin = excluded.endpoint_origin,
      endpoint_host = excluded.endpoint_host,
      user_agent = excluded.user_agent,
      updated_at = excluded.updated_at;
  `).bind(
    id,
    userId,
    endpointHash,
    payload.endpoint,
    payload.keys.p256dh,
    payload.keys.auth,
    payload.expirationTime,
    record.endpointOrigin,
    record.endpointHost,
    userAgent,
    record.createdAt,
    now,
  ).run()

  const summary = createSummary(record)
  await recordBrowserPushSubscriptionAudit(event, 'browser_push.subscription.upserted', summary)
  return summary
}

export async function listBrowserPushSubscriptions(
  event: H3Event | undefined,
  options: ListBrowserPushSubscriptionsOptions,
): Promise<BrowserPushSubscriptionSummary[]> {
  const records = await listBrowserPushSubscriptionsForDelivery(event, options)
  return records.map(createSummary)
}

export async function listBrowserPushSubscriptionsForDelivery(
  event: H3Event | undefined,
  options: ListBrowserPushSubscriptionsOptions,
): Promise<BrowserPushSubscriptionDeliveryRecord[]> {
  const userId = assertString(options.userId, 'userId', 180)
  const limit = normalizeLimit(options.limit)
  const db = getD1Database(event)

  if (!db) {
    return [...memoryItems.values()]
      .filter(item => item.userId === userId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, limit)
  }

  await ensureBrowserPushSubscriptionSchema(db)
  const { results } = await db.prepare(`
    SELECT id, user_id, endpoint_hash, endpoint, p256dh, auth, expiration_time,
      endpoint_origin, endpoint_host, user_agent, created_at, updated_at
    FROM ${SUBSCRIPTIONS_TABLE}
    WHERE user_id = ?1
    ORDER BY updated_at DESC
    LIMIT ?2;
  `).bind(userId, limit).all<BrowserPushSubscriptionRow>()

  return (results ?? []).map(mapRow)
}

export async function deleteBrowserPushSubscription(
  event: H3Event | undefined,
  input: { userId: unknown, id: unknown },
): Promise<boolean> {
  const userId = assertString(input.userId, 'userId', 180)
  const id = assertString(input.id, 'id', 64)
  const db = getD1Database(event)

  if (!db) {
    const existing = memoryItems.get(id)
    if (!existing || existing.userId !== userId)
      return false
    memoryItems.delete(id)
    await recordBrowserPushSubscriptionDeleted(event, userId, id)
    return true
  }

  await ensureBrowserPushSubscriptionSchema(db)
  const result = await db.prepare(`
    DELETE FROM ${SUBSCRIPTIONS_TABLE}
    WHERE user_id = ?1 AND id = ?2;
  `).bind(userId, id).run()

  const deleted = (result.meta?.changes ?? 0) > 0
  if (deleted)
    await recordBrowserPushSubscriptionDeleted(event, userId, id)

  return deleted
}

async function recordBrowserPushSubscriptionDeleted(
  event: H3Event | undefined,
  userId: string,
  id: string,
): Promise<void> {
  await recordPlatformGovernanceEvent(event, {
    scope: 'notification',
    action: 'browser_push.subscription.deleted',
    actorId: userId,
    resourceType: 'browser_push_subscription',
    resourceId: id,
    channel: 'browser_push',
    unit: 'subscription',
    quantity: 1,
    metadata: {
      id,
    },
  }).catch(() => {})
}

async function recordBrowserPushSubscriptionAudit(
  event: H3Event | undefined,
  action: string,
  summary: BrowserPushSubscriptionSummary,
): Promise<void> {
  await recordPlatformGovernanceEvent(event, {
    scope: 'notification',
    action,
    actorId: summary.userId,
    resourceType: 'browser_push_subscription',
    resourceId: summary.id,
    channel: 'browser_push',
    unit: 'subscription',
    quantity: 1,
    metadata: {
      id: summary.id,
      endpointHost: summary.endpointHost,
      hasKeys: summary.hasKeys,
      expirationTime: summary.expirationTime,
    },
  }).catch(() => {})
}
