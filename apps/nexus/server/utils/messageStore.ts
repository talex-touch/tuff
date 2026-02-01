import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { readCloudflareBindings, shouldUseCloudflareBindings } from './cloudflare'

const MESSAGE_TABLE = 'telemetry_messages'

let messageSchemaInitialized = false

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

async function ensureMessageSchema(db: D1Database) {
  if (messageSchemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${MESSAGE_TABLE} (
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
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON ${MESSAGE_TABLE}(created_at);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_messages_status ON ${MESSAGE_TABLE}(status);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_messages_source ON ${MESSAGE_TABLE}(source);
  `).run()

  messageSchemaInitialized = true
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

  let processed = 0
  try {
    await ensureMessageSchema(db)

    for (const input of inputs) {
      if (!input.source || !input.severity || !input.title || !input.message) {
        continue
      }
      const id = input.id || crypto.randomUUID()
      const createdAt = input.createdAt ? new Date(input.createdAt).toISOString() : new Date().toISOString()
      await db.prepare(`
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
      ).run()
      processed += 1
    }
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
