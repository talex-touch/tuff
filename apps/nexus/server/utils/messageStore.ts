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

function buildMessageInsertStatements(
  db: D1Database,
  inputs: TelemetryMessageInput[],
): { statements: D1PreparedStatement[], rejected: number } {
  const statements: D1PreparedStatement[] = []
  let rejected = 0
  for (const input of inputs) {
    if (!input.source || !input.severity || !input.title || !input.message) {
      rejected += 1
      continue
    }
    if (input.createdAt && !Number.isFinite(new Date(input.createdAt).getTime())) {
      rejected += 1
      continue
    }
    const id = input.id || crypto.randomUUID()
    const createdAt = input.createdAt ? new Date(input.createdAt).toISOString() : new Date().toISOString()
    statements.push(db.prepare(`
      INSERT OR REPLACE INTO ${MESSAGE_TABLE} (
        id, source, severity, title, message, meta, status, platform, version, is_anonymous, created_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11);
    `).bind(
      id,
      input.source,
      input.severity,
      input.title,
      input.message,
      input.meta ? JSON.stringify(input.meta) : null,
      input.status || 'unread',
      input.platform || null,
      input.version || null,
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

    const { statements } = buildMessageInsertStatements(db, inputs)

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
