import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { useStorage } from '#imports'
import { createError } from 'h3'
import { readCloudflareBindings } from './cloudflare'

const UPDATES_KEY = 'dashboard:updates'
const UPDATES_TABLE = 'dashboard_updates'

let schemaInitialized = false
let hasLoggedDashboardDb = false
let hasLoggedDashboardFallback = false

interface D1UpdateRow {
  id: string
  title: string
  timestamp: string
  summary: string
  tags: string | null
  link: string
  created_at: string
  updated_at: string
}

function getD1Database(event?: H3Event | null): D1Database | null {
  if (!event)
    return null

  const bindings = readCloudflareBindings(event)
  const db = bindings?.DB ?? null

  if (db) {
    if (!hasLoggedDashboardDb) {
      console.info('[dashboardStore] 已连接到 D1 绑定，所有仪表盘数据将写入数据库。')
      hasLoggedDashboardDb = true
    }
  }
  else if (!hasLoggedDashboardFallback) {
    console.warn('[dashboardStore] 未检测到 D1 绑定，仪表盘逻辑将退回内存存储。')
    hasLoggedDashboardFallback = true
  }

  return db
}

async function ensureDashboardSchema(db: D1Database) {
  if (schemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${UPDATES_TABLE} (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      summary TEXT NOT NULL,
      tags TEXT NOT NULL,
      link TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `).run()

  schemaInitialized = true
}

function parseJsonArray(value: string | null): string[] {
  if (!value)
    return []

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(item => String(item)) : []
  }
  catch {
    return []
  }
}

function parseJsonObject<T>(value: string | null): T | null {
  if (!value)
    return null

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? (parsed as T) : null
  }
  catch {
    return null
  }
}

function mapUpdateRow(row: D1UpdateRow): DashboardUpdate {
  return {
    id: row.id,
    title: row.title,
    timestamp: row.timestamp,
    summary: row.summary,
    tags: parseJsonArray(row.tags),
    link: row.link,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface DashboardUpdate {
  id: string
  title: string
  timestamp: string
  summary: string
  tags: string[]
  link: string
  createdAt: string
  updatedAt: string
}

export type UpdateInput = Omit<
  DashboardUpdate,
  'id' | 'createdAt' | 'updatedAt'
>

function validIsoDate(value: string) {
  const date = new Date(value)
  return !Number.isNaN(date.getTime())
}

async function readCollection<T>(key: string): Promise<T[]> {
  const storage = useStorage()
  const items = await storage.getItem<T[]>(key)
  return items ?? []
}

async function writeCollection<T>(key: string, items: T[]) {
  const storage = useStorage()
  await storage.setItem(key, items)
}

function sanitizeBadges(badges: string[]): string[] {
  return badges
    .map(badge => badge.trim())
    .filter(badge => badge.length > 0)
}

function normalizeDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    throw createError({ statusCode: 400, statusMessage: 'Invalid date provided.' })
  return date.toISOString()
}

function normalizeUpdateInput(input: Partial<UpdateInput>, forUpdate = false): UpdateInput {
  const { title, timestamp, summary, tags, link } = input

  if (!forUpdate || title !== undefined) {
    if (!title || typeof title !== 'string')
      throw createError({ statusCode: 400, statusMessage: 'Update title is required.' })
  }

  if (!forUpdate || timestamp !== undefined) {
    if (!timestamp || typeof timestamp !== 'string' || !validIsoDate(timestamp))
      throw createError({ statusCode: 400, statusMessage: 'Update timestamp must be an ISO date string.' })
  }

  if (!forUpdate || summary !== undefined) {
    if (!summary || typeof summary !== 'string')
      throw createError({ statusCode: 400, statusMessage: 'Update summary is required.' })
  }

  if (!forUpdate || link !== undefined) {
    if (!link || typeof link !== 'string')
      throw createError({ statusCode: 400, statusMessage: 'Update link is required.' })
  }

  const normalizedTags = sanitizeBadges(Array.isArray(tags) ? tags : [])

  return {
    title: title ?? '',
    timestamp: timestamp ? normalizeDate(timestamp) : new Date().toISOString(),
    summary: summary ?? '',
    tags: normalizedTags,
    link: link ?? '',
  }
}

export async function listUpdates(event?: H3Event): Promise<DashboardUpdate[]> {
  const db = getD1Database(event)

  if (db) {
    await ensureDashboardSchema(db)

    const { results } = await db.prepare(`
      SELECT
        id,
        title,
        timestamp,
        summary,
        tags,
        link,
        created_at,
        updated_at
      FROM ${UPDATES_TABLE}
      ORDER BY datetime(timestamp) DESC;
    `).all<D1UpdateRow>()

    return (results ?? []).map(mapUpdateRow)
  }

  const updates = await readCollection<DashboardUpdate>(UPDATES_KEY)
  const normalized = updates.map(update => ({
    ...update,
    tags: Array.isArray(update.tags) ? update.tags : [],
  }))

  return normalized.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

export async function getUpdateById(event: H3Event | undefined, id: string) {
  const db = getD1Database(event)

  if (db) {
    await ensureDashboardSchema(db)

    const row = await db.prepare(`
      SELECT
        id,
        title,
        timestamp,
        summary,
        tags,
        link,
        created_at,
        updated_at
      FROM ${UPDATES_TABLE}
      WHERE id = ?1;
    `).bind(id).first<D1UpdateRow>()

    return row ? mapUpdateRow(row) : null
  }

  const updates = await readCollection<DashboardUpdate>(UPDATES_KEY)
  return updates.find(update => update.id === id) || null
}

export async function createUpdate(event: H3Event, rawInput: Partial<UpdateInput>) {
  const input = normalizeUpdateInput(rawInput)
  const now = new Date().toISOString()

  const update: DashboardUpdate = {
    id: randomUUID(),
    ...input,
    createdAt: now,
    updatedAt: now,
  }

  const db = getD1Database(event)

  if (db) {
    await ensureDashboardSchema(db)

    await db.prepare(`
      INSERT INTO ${UPDATES_TABLE} (
        id,
        title,
        timestamp,
        summary,
        tags,
        link,
        created_at,
        updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8);
    `).bind(
      update.id,
      update.title,
      update.timestamp,
      update.summary,
      JSON.stringify(update.tags),
      update.link,
      update.createdAt,
      update.updatedAt,
    ).run()

    return update
  }

  const updates = await listUpdates()
  updates.unshift(update)
  await writeCollection(UPDATES_KEY, updates)
  return update
}

export async function updateUpdate(event: H3Event, id: string, rawInput: Partial<UpdateInput>) {
  const db = getD1Database(event)

  if (db) {
    await ensureDashboardSchema(db)

    const existing = await getUpdateById(event, id)

    if (!existing)
      throw createError({ statusCode: 404, statusMessage: 'Update not found.' })

    const mergedInput: UpdateInput = normalizeUpdateInput(
      {
        ...existing,
        ...rawInput,
      },
      true,
    )

    const updated: DashboardUpdate = {
      ...existing,
      ...mergedInput,
      updatedAt: new Date().toISOString(),
    }

    await db.prepare(`
      UPDATE ${UPDATES_TABLE}
      SET
        title = ?1,
        timestamp = ?2,
        summary = ?3,
        tags = ?4,
        link = ?5,
        updated_at = ?6
      WHERE id = ?7;
    `).bind(
      updated.title,
      updated.timestamp,
      updated.summary,
      JSON.stringify(updated.tags),
      updated.link,
      updated.updatedAt,
      updated.id,
    ).run()

    return updated
  }

  const updates = await listUpdates()
  const index = updates.findIndex(update => update.id === id)

  if (index === -1)
    throw createError({ statusCode: 404, statusMessage: 'Update not found.' })

  const mergedInput: UpdateInput = {
    ...updates[index],
    ...normalizeUpdateInput(
      {
        ...updates[index],
        ...rawInput,
      },
      true,
    ),
  }

  const updated: DashboardUpdate = {
    ...updates[index],
    ...mergedInput,
    updatedAt: new Date().toISOString(),
  }

  updates[index] = updated
  await writeCollection(UPDATES_KEY, updates)
  return updated
}

export async function deleteUpdate(event: H3Event, id: string) {
  const db = getD1Database(event)

  if (db) {
    await ensureDashboardSchema(db)

    const result = await db.prepare(`
      DELETE FROM ${UPDATES_TABLE}
      WHERE id = ?1;
    `).bind(id).run()

    const changes = (result.meta as { changes?: number } | undefined)?.changes ?? 0

    if (changes === 0)
      throw createError({ statusCode: 404, statusMessage: 'Update not found.' })

    return
  }

  const updates = await listUpdates()
  const nextUpdates = updates.filter(update => update.id !== id)

  if (nextUpdates.length === updates.length)
    throw createError({ statusCode: 404, statusMessage: 'Update not found.' })

  await writeCollection(UPDATES_KEY, nextUpdates)
}
