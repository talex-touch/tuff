import type { D1Database, D1PreparedStatement } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { createError } from 'h3'
import { readCloudflareBindings, shouldUseCloudflareBindings } from './cloudflare'
import { defineD1Schema, ensureD1Schema } from './d1Schema'
import {
  buildTelemetryBatchReceiptStatement,
  digestTelemetryBatchPayload,
  getTelemetryBatchReceipt,
} from './telemetryStore'

const MESSAGE_TABLE = 'telemetry_messages'
const TELEMETRY_MESSAGES_SCOPE = 'telemetry.messages'

function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /UNIQUE constraint failed|PRIMARY KEY constraint failed|SQLITE_CONSTRAINT/i.test(message)
}

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

const MESSAGE_SCHEMA = defineD1Schema('telemetry-messages', {
  statements: [
    `CREATE TABLE IF NOT EXISTS ${MESSAGE_TABLE} (
        id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        meta TEXT,
        status TEXT NOT NULL DEFAULT 'unread',
        platform TEXT,
        version TEXT,
        is_anonymous INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      )`,
    `CREATE INDEX IF NOT EXISTS idx_messages_created_at ON ${MESSAGE_TABLE}(created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_status ON ${MESSAGE_TABLE}(status)`,
    `CREATE INDEX IF NOT EXISTS idx_messages_source ON ${MESSAGE_TABLE}(source)`,
  ],
})

async function ensureMessageSchema(db: D1Database) {
  await ensureD1Schema(db, MESSAGE_SCHEMA)
}

export interface TelemetryMessageInput {
  id?: string
  source: string
  severity: string
  title: string
  message: string
  meta?: Record<string, unknown>
  status?: string
  platform?: string
  version?: string
  isAnonymous?: boolean
  createdAt?: number
}

export interface TelemetryMessageRecord {
  id: string
  source: string
  severity: string
  title: string
  message: string
  meta?: Record<string, unknown>
  status: string
  platform?: string
  version?: string
  isAnonymous: boolean
  createdAt: string
}

export interface TelemetryMessageBatchAck extends Record<string, unknown> {
  success: true
  accepted: number
  rejected: number
  duplicate: boolean
  dropped: number
  processed: number
}

const MAX_SOURCE_LENGTH = 64
const MAX_SEVERITY_LENGTH = 32
const MAX_TITLE_LENGTH = 256
const MAX_MESSAGE_LENGTH = 4096
const MAX_PLATFORM_LENGTH = 64
const MAX_VERSION_LENGTH = 64
const MAX_META_JSON_BYTES = 8192

function buildMessageInsertStatements(
  db: D1Database,
  inputs: TelemetryMessageInput[],
  options: { trustedSystem?: boolean } = {},
): { statements: D1PreparedStatement[], rejected: number } {
  const trustedSystem = options.trustedSystem === true
  const statements: D1PreparedStatement[] = []
  let rejected = 0
  for (const input of inputs) {
    const source = typeof input?.source === 'string' ? input.source.trim() : ''
    const severity = typeof input?.severity === 'string' ? input.severity.trim() : ''
    const title = typeof input?.title === 'string' ? input.title.trim() : ''
    const message = typeof input?.message === 'string' ? input.message.trim() : ''

    if (!source || !severity || !title || !message) {
      rejected += 1
      continue
    }
    if (!trustedSystem && source.toLowerCase() === 'system') {
      rejected += 1
      continue
    }
    if (
      source.length > MAX_SOURCE_LENGTH
      || severity.length > MAX_SEVERITY_LENGTH
      || title.length > MAX_TITLE_LENGTH
      || message.length > MAX_MESSAGE_LENGTH
    ) {
      rejected += 1
      continue
    }

    const platform = typeof input.platform === 'string' ? input.platform.trim() : ''
    const version = typeof input.version === 'string' ? input.version.trim() : ''
    if (platform.length > MAX_PLATFORM_LENGTH || version.length > MAX_VERSION_LENGTH) {
      rejected += 1
      continue
    }

    let serializedMeta: string | null = null
    if (input.meta !== undefined && input.meta !== null) {
      if (typeof input.meta !== 'object' || Array.isArray(input.meta)) {
        rejected += 1
        continue
      }
      try {
        serializedMeta = JSON.stringify(input.meta)
      }
      catch {
        rejected += 1
        continue
      }
      if (!trustedSystem && serializedMeta.length > MAX_META_JSON_BYTES) {
        rejected += 1
        continue
      }
    }

    if (input.createdAt && !Number.isFinite(new Date(input.createdAt).getTime())) {
      rejected += 1
      continue
    }

    // Untrusted public ingestion always gets a server-generated UUID, `'unread'` status, and plain INSERT
    // so anonymous callers can never overwrite or silence system alerts (`ip-ban:...`).
    const id = trustedSystem && typeof input.id === 'string' && input.id.trim()
      ? input.id.trim()
      : crypto.randomUUID()
    const status = trustedSystem && typeof input.status === 'string' && input.status.trim()
      ? input.status.trim()
      : 'unread'
    const createdAt = input.createdAt ? new Date(input.createdAt).toISOString() : new Date().toISOString()
    const insertVerb = trustedSystem ? 'INSERT OR REPLACE INTO' : 'INSERT INTO'

    statements.push(db.prepare(`
      ${insertVerb} ${MESSAGE_TABLE} (
        id, source, severity, title, message, meta, status, platform, version, is_anonymous, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11);
    `).bind(
      id,
      source,
      severity,
      title,
      message,
      serializedMeta,
      status,
      platform || null,
      version || null,
      input.isAnonymous === false ? 0 : 1,
      createdAt,
    ))
  }
  return { statements, rejected }
}

/**
 * Atomic, fail-closed, receipt-checked telemetry message persistence for `/api/telemetry/messages`.
 * Never swallows D1 unavailability or write failures as HTTP 200 success.
 */
export async function recordTelemetryMessagesAtomic(
  event: H3Event,
  inputs: TelemetryMessageInput[],
  options: {
    idempotencyKey?: string | null
    callerUserId?: string | null
    dropped?: number
    preRejected?: number
  } = {},
): Promise<TelemetryMessageBatchAck> {
  const db = getD1Database(event)
  if (!db) {
    throw createError({ statusCode: 503, statusMessage: 'Telemetry database not available' })
  }

  const dropped = Math.max(0, options.dropped ?? 0)
  const preRejected = Math.max(0, options.preRejected ?? 0)
  const idempotencyKey = options.idempotencyKey ?? null
  const payloadHash = idempotencyKey
    ? digestTelemetryBatchPayload({
        callerUserId: options.callerUserId ?? null,
        dropped,
        preRejected,
        messages: inputs,
      })
    : null

  if (idempotencyKey && payloadHash) {
    const existing = await getTelemetryBatchReceipt<TelemetryMessageBatchAck>(
      event,
      TELEMETRY_MESSAGES_SCOPE,
      idempotencyKey,
    )
    if (existing) {
      if (existing.payloadHash !== payloadHash) {
        throw createError({
          statusCode: 409,
          statusMessage: 'Idempotency key reused with different telemetry payload',
        })
      }
      return {
        ...existing.response,
        duplicate: true,
      }
    }
  }

  await ensureMessageSchema(db)

  const { statements, rejected: invalidRejected } = buildMessageInsertStatements(db, inputs)
  const accepted = statements.length
  const rejected = preRejected + invalidRejected
  const response: TelemetryMessageBatchAck = {
    success: true,
    accepted,
    rejected,
    duplicate: false,
    dropped,
    processed: accepted,
  }

  const batchStatements = idempotencyKey && payloadHash
    ? [
        ...statements,
        buildTelemetryBatchReceiptStatement(db, {
          scope: TELEMETRY_MESSAGES_SCOPE,
          idempotencyKey,
          payloadHash,
          response,
        }),
      ]
    : statements

  if (batchStatements.length > 0) {
    try {
      await db.batch(batchStatements)
    }
    catch (error) {
      if (idempotencyKey && payloadHash && isUniqueConstraintError(error)) {
        const winner = await getTelemetryBatchReceipt<TelemetryMessageBatchAck>(
          event,
          TELEMETRY_MESSAGES_SCOPE,
          idempotencyKey,
        )
        if (winner) {
          if (winner.payloadHash !== payloadHash) {
            throw createError({
              statusCode: 409,
              statusMessage: 'Idempotency key reused with different telemetry payload',
            })
          }
          return {
            ...winner.response,
            duplicate: true,
          }
        }
      }
      throw error
    }
  }

  return response
}

export async function recordTelemetryMessages(
  event: H3Event,
  inputs: TelemetryMessageInput[],
  options: { trustedSystem?: boolean } = {},
): Promise<number> {
  const db = getD1Database(event)
  if (!db) {
    if (shouldUseCloudflareBindings())
      console.warn('Telemetry messages: Database not available')
    return 0
  }

  // One batch for the lot (the endpoint takes up to a hundred), where each message used to be its own
  // round trip. A batch is one transaction, so a failure keeps none of them rather than the ones
  // before it.
  let processed = 0
  try {
    await ensureMessageSchema(db)

    const { statements } = buildMessageInsertStatements(db, inputs, options)

    if (statements.length > 0)
      await db.batch(statements)
    processed = statements.length
  }
  catch (error) {
    console.warn('Telemetry messages: D1 error', error)
  }

  return processed
}

export async function listTelemetryMessages(
  event: H3Event,
  options: {
    status?: string
    source?: string
    severity?: string
    since?: number
    limit?: number
  } = {},
): Promise<TelemetryMessageRecord[]> {
  const db = getD1Database(event)
  if (!db) {
    if (shouldUseCloudflareBindings())
      console.warn('Telemetry messages: Database not available')
    return []
  }

  try {
    await ensureMessageSchema(db)

    const clauses: string[] = []
    const params: Array<string | number> = []

    if (options.status && options.status !== 'all') {
      clauses.push('status = ?')
      params.push(options.status)
    }
    if (options.source) {
      clauses.push('source = ?')
      params.push(options.source)
    }
    if (options.severity) {
      clauses.push('severity = ?')
      params.push(options.severity)
    }
    if (options.since) {
      clauses.push('created_at >= ?')
      params.push(new Date(options.since).toISOString())
    }

    const whereClause = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
    const limit = Math.min(options.limit ?? 50, 100)

    const query = `
      SELECT id, source, severity, title, message, meta, status, platform, version, is_anonymous, created_at
      FROM ${MESSAGE_TABLE}
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ?;
    `

    const result = await db.prepare(query).bind(...params, limit).all()
    const rows = (result.results ?? []) as Array<Record<string, any>>

    return rows.map(row => ({
      id: row.id,
      source: row.source,
      severity: row.severity,
      title: row.title,
      message: row.message,
      meta: row.meta ? safeParseMeta(row.meta) : undefined,
      status: row.status,
      platform: row.platform || undefined,
      version: row.version || undefined,
      isAnonymous: row.is_anonymous === 1,
      createdAt: row.created_at,
    }))
  }
  catch (error) {
    console.warn('Telemetry messages: D1 error', error)
    return []
  }
}

function safeParseMeta(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>
    }
  }
  catch {
    // ignore parse errors
  }
  return {}
}
