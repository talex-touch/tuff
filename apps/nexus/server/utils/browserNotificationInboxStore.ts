import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'
import { isPlainObject, normalizeString } from './telemetrySanitizer'

const INBOX_TABLE = 'browser_notification_inbox'
const MAX_MEMORY_ITEMS = 1000
const MAX_METADATA_BYTES = 32 * 1024

const initializedSchemas = new WeakSet<D1Database>()

export type BrowserNotificationStatus = 'unread' | 'read'

export interface BrowserNotificationInboxItem {
  id: string
  userId: string
  action: string
  title: string
  body: string
  resourceType: string | null
  resourceId: string | null
  status: BrowserNotificationStatus
  metadata: Record<string, unknown> | null
  occurredAt: string
  createdAt: string
  readAt: string | null
}

export interface StoreBrowserNotificationInput {
  userId: unknown
  action: unknown
  title: unknown
  body: unknown
  resourceType?: unknown
  resourceId?: unknown
  metadata?: unknown
  occurredAt?: unknown
}

export interface ListBrowserNotificationInboxOptions {
  userId: unknown
  status?: unknown
  limit?: unknown
}

export interface MarkBrowserNotificationsReadInput {
  userId: unknown
  ids?: unknown
  all?: unknown
}

interface BrowserNotificationRow {
  id: string
  user_id: string
  action: string
  title: string
  body: string
  resource_type: string | null
  resource_id: string | null
  status: string
  metadata_json: string | null
  occurred_at: string
  created_at: string
  read_at: string | null
}

const memoryItems: BrowserNotificationInboxItem[] = []

const SENSITIVE_METADATA_KEYS = new Set([
  'actorid',
  'auth',
  'authref',
  'credential',
  'credentialref',
  'email',
  'from',
  'p256dh',
  'password',
  'recipient',
  'recipients',
  'secret',
  'secretkey',
  'token',
  'to',
  'userid',
  'webhookurl',
  'webpushsubscription',
  'webpushsubscriptions',
  'pushsubscription',
  'pushsubscriptions',
])

function getD1Database(event?: H3Event | null): D1Database | null {
  return event ? readCloudflareBindings(event)?.DB ?? null : null
}

async function ensureInboxSchema(db: D1Database): Promise<void> {
  if (initializedSchemas.has(db))
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${INBOX_TABLE} (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      action TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      status TEXT NOT NULL DEFAULT 'unread',
      metadata_json TEXT,
      occurred_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      read_at TEXT
    );
  `).run()

  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_${INBOX_TABLE}_user_status_created ON ${INBOX_TABLE}(user_id, status, created_at);`).run()
  await db.prepare(`CREATE INDEX IF NOT EXISTS idx_${INBOX_TABLE}_resource ON ${INBOX_TABLE}(resource_type, resource_id);`).run()

  initializedSchemas.add(db)
}

function assertString(value: unknown, field: string, maxLength = 180): string {
  const normalized = normalizeString(value, maxLength)
  if (!normalized)
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  return normalized
}

function optionalString(value: unknown, field: string, maxLength = 180): string | null {
  if (value == null)
    return null
  if (typeof value !== 'string')
    throw createError({ statusCode: 400, statusMessage: `${field} is invalid.` })
  const normalized = normalizeString(value, maxLength)
  return normalized ?? null
}

function normalizeStatus(value: unknown): BrowserNotificationStatus | 'all' {
  if (value == null || value === '')
    return 'unread'
  if (value === 'unread' || value === 'read' || value === 'all')
    return value
  throw createError({ statusCode: 400, statusMessage: 'status is invalid.' })
}

function normalizeLimit(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0)
    return Math.min(Math.floor(value), 200)
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10)
    if (Number.isFinite(parsed) && parsed > 0)
      return Math.min(parsed, 200)
  }
  return 50
}

function normalizeIso(value: unknown): string {
  if (typeof value !== 'string')
    return new Date().toISOString()
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString()
}

function normalizeMetadataKey(key: string): string {
  return key.replace(/[-_\s]/g, '').toLowerCase()
}

function containsEmailLike(value: string): boolean {
  return /\S+@\S+\.\S+/.test(value)
}

function sanitizeMetadataValue(value: unknown): unknown {
  if (typeof value === 'string') {
    const normalized = normalizeString(value, 180)
    if (!normalized || containsEmailLike(normalized))
      return undefined
    return normalized
  }
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : undefined
  if (typeof value === 'boolean')
    return value
  if (Array.isArray(value)) {
    const items = value
      .map(item => sanitizeMetadataValue(item))
      .filter(item => item !== undefined)
      .slice(0, 20)
    return items.length ? items : undefined
  }
  if (isPlainObject(value)) {
    const nested = sanitizeMetadata(value)
    return nested ?? undefined
  }
  return undefined
}

function sanitizeMetadata(value: unknown): Record<string, unknown> | null {
  if (!isPlainObject(value))
    return null

  const entries: Array<[string, unknown]> = []
  for (const [key, raw] of Object.entries(value).slice(0, 30)) {
    const normalizedKey = normalizeString(key, 64)
    if (!normalizedKey || SENSITIVE_METADATA_KEYS.has(normalizeMetadataKey(normalizedKey)))
      continue
    const safeValue = sanitizeMetadataValue(raw)
    if (safeValue !== undefined)
      entries.push([normalizedKey, safeValue])
  }

  if (!entries.length)
    return null

  const metadata = Object.fromEntries(entries)
  const bytes = new TextEncoder().encode(JSON.stringify(metadata)).length
  if (bytes > MAX_METADATA_BYTES)
    return null
  return metadata
}

function parseMetadata(value: string | null): Record<string, unknown> | null {
  if (!value)
    return null
  try {
    const parsed = JSON.parse(value)
    return isPlainObject(parsed) ? parsed : null
  }
  catch {
    return null
  }
}

function mapRow(row: BrowserNotificationRow): BrowserNotificationInboxItem {
  return {
    id: row.id,
    userId: row.user_id,
    action: row.action,
    title: row.title,
    body: row.body,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    status: row.status === 'read' ? 'read' : 'unread',
    metadata: parseMetadata(row.metadata_json),
    occurredAt: row.occurred_at,
    createdAt: row.created_at,
    readAt: row.read_at,
  }
}

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value))
    return []
  return [...new Set(value
    .map(item => normalizeString(item, 180))
    .filter((item): item is string => Boolean(item)))]
    .slice(0, 100)
}

export async function storeBrowserNotification(
  event: H3Event | undefined,
  input: StoreBrowserNotificationInput,
): Promise<BrowserNotificationInboxItem> {
  const now = new Date().toISOString()
  const metadata = sanitizeMetadata(input.metadata)
  const item: BrowserNotificationInboxItem = {
    id: randomUUID(),
    userId: assertString(input.userId, 'userId', 180),
    action: assertString(input.action, 'action', 120),
    title: assertString(input.title, 'title', 180),
    body: assertString(input.body, 'body', 4000),
    resourceType: optionalString(input.resourceType, 'resourceType', 80),
    resourceId: optionalString(input.resourceId, 'resourceId', 180),
    status: 'unread',
    metadata,
    occurredAt: normalizeIso(input.occurredAt),
    createdAt: now,
    readAt: null,
  }

  const db = getD1Database(event)
  if (!db) {
    memoryItems.push(item)
    if (memoryItems.length > MAX_MEMORY_ITEMS)
      memoryItems.splice(0, memoryItems.length - MAX_MEMORY_ITEMS)
    return item
  }

  await ensureInboxSchema(db)
  await db.prepare(`
    INSERT INTO ${INBOX_TABLE} (
      id, user_id, action, title, body, resource_type, resource_id,
      status, metadata_json, occurred_at, created_at, read_at
    )
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12);
  `).bind(
    item.id,
    item.userId,
    item.action,
    item.title,
    item.body,
    item.resourceType,
    item.resourceId,
    item.status,
    metadata ? JSON.stringify(metadata) : null,
    item.occurredAt,
    item.createdAt,
    item.readAt,
  ).run()

  return item
}

export async function listBrowserNotificationInbox(
  event: H3Event | undefined,
  options: ListBrowserNotificationInboxOptions,
): Promise<BrowserNotificationInboxItem[]> {
  const userId = assertString(options.userId, 'userId', 180)
  const status = normalizeStatus(options.status)
  const limit = normalizeLimit(options.limit)
  const db = getD1Database(event)

  if (!db) {
    return memoryItems
      .filter(item => item.userId === userId)
      .filter(item => status === 'all' || item.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
  }

  await ensureInboxSchema(db)
  const conditions = ['user_id = ?']
  const values: Array<string | number> = [userId]
  if (status !== 'all') {
    conditions.push('status = ?')
    values.push(status)
  }
  const { results } = await db.prepare(`
    SELECT id, user_id, action, title, body, resource_type, resource_id,
      status, metadata_json, occurred_at, created_at, read_at
    FROM ${INBOX_TABLE}
    WHERE ${conditions.join(' AND ')}
    ORDER BY created_at DESC
    LIMIT ?;
  `).bind(...values, limit).all<BrowserNotificationRow>()

  return (results ?? []).map(mapRow)
}

export async function countUnreadBrowserNotifications(event: H3Event | undefined, userIdValue: unknown): Promise<number> {
  const userId = assertString(userIdValue, 'userId', 180)
  const db = getD1Database(event)

  if (!db)
    return memoryItems.filter(item => item.userId === userId && item.status === 'unread').length

  await ensureInboxSchema(db)
  const row = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM ${INBOX_TABLE}
    WHERE user_id = ?1 AND status = 'unread';
  `).bind(userId).first<{ count: number }>()

  return Number(row?.count) || 0
}

export async function markBrowserNotificationsRead(
  event: H3Event | undefined,
  input: MarkBrowserNotificationsReadInput,
): Promise<number> {
  const userId = assertString(input.userId, 'userId', 180)
  const ids = normalizeIds(input.ids)
  const markAll = input.all === true

  if (!markAll && ids.length === 0)
    throw createError({ statusCode: 400, statusMessage: 'ids or all=true is required.' })

  const now = new Date().toISOString()
  const db = getD1Database(event)
  if (!db) {
    let updated = 0
    const idSet = new Set(ids)
    for (const item of memoryItems) {
      if (item.userId !== userId || item.status === 'read')
        continue
      if (!markAll && !idSet.has(item.id))
        continue
      item.status = 'read'
      item.readAt = now
      updated += 1
    }
    return updated
  }

  await ensureInboxSchema(db)
  if (markAll) {
    const result = await db.prepare(`
      UPDATE ${INBOX_TABLE}
      SET status = 'read', read_at = ?2
      WHERE user_id = ?1 AND status = 'unread';
    `).bind(userId, now).run()
    return Number(result.meta?.changes) || 0
  }

  const placeholders = ids.map((_, index) => `?${index + 3}`).join(', ')
  const result = await db.prepare(`
    UPDATE ${INBOX_TABLE}
    SET status = 'read', read_at = ?2
    WHERE user_id = ?1 AND status = 'unread' AND id IN (${placeholders});
  `).bind(userId, now, ...ids).run()
  return Number(result.meta?.changes) || 0
}
