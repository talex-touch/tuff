import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { useStorage } from 'nitropack/runtime/internal/storage'
import { readCloudflareBindings } from './cloudflare'

const PLUGIN_RATINGS_TABLE = 'store_plugin_ratings'
const LEGACY_PLUGIN_RATINGS_TABLE = 'market_plugin_ratings'
const PLUGIN_RATINGS_KEY = 'store:pluginRatings'
const LEGACY_PLUGIN_RATINGS_KEY = ['market', 'pluginRatings'].join(':')

let ratingSchemaInitialized = false

interface StoredPluginRating {
  pluginId: string
  userId: string
  rating: number
  createdAt: string
  updatedAt: string
}

export interface PluginRatingSummary {
  average: number
  count: number
}

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

async function ensurePluginRatingSchema(db: D1Database): Promise<void> {
  if (ratingSchemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${PLUGIN_RATINGS_TABLE} (
      plugin_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      rating INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (plugin_id, user_id)
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_${PLUGIN_RATINGS_TABLE}_plugin_id
    ON ${PLUGIN_RATINGS_TABLE}(plugin_id);
  `).run()

  await migrateLegacyPluginRatingsTable(db)
  ratingSchemaInitialized = true
}

async function tableExists(db: D1Database, tableName: string): Promise<boolean> {
  const row = await db.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?1;
  `).bind(tableName).first<{ name: string }>()
  return Boolean(row?.name)
}

async function countRows(db: D1Database, tableName: string): Promise<number> {
  const row = await db.prepare(`SELECT COUNT(*) as count FROM ${tableName};`).first<{ count: number }>()
  return Number(row?.count ?? 0)
}

async function migrateLegacyPluginRatingsTable(db: D1Database): Promise<void> {
  const hasLegacyTable = await tableExists(db, LEGACY_PLUGIN_RATINGS_TABLE)
  if (!hasLegacyTable)
    return

  const currentCount = await countRows(db, PLUGIN_RATINGS_TABLE)
  if (currentCount > 0)
    return

  const legacyCount = await countRows(db, LEGACY_PLUGIN_RATINGS_TABLE)
  if (legacyCount <= 0)
    return

  await db.prepare(`
    INSERT OR IGNORE INTO ${PLUGIN_RATINGS_TABLE} (
      plugin_id,
      user_id,
      rating,
      created_at,
      updated_at
    )
    SELECT
      plugin_id,
      user_id,
      rating,
      created_at,
      updated_at
    FROM ${LEGACY_PLUGIN_RATINGS_TABLE};
  `).run()

  console.info(`[pluginRatingStore] migrated ${legacyCount} rating rows from ${LEGACY_PLUGIN_RATINGS_TABLE} to ${PLUGIN_RATINGS_TABLE}`)
}

async function readStoredRatings(): Promise<StoredPluginRating[]> {
  const storage = useStorage()
  const items = await storage.getItem<StoredPluginRating[] | null>(PLUGIN_RATINGS_KEY)
  if (Array.isArray(items))
    return items

  const legacyItems = await storage.getItem<StoredPluginRating[] | null>(LEGACY_PLUGIN_RATINGS_KEY)
  if (Array.isArray(legacyItems) && legacyItems.length > 0) {
    await storage.setItem(PLUGIN_RATINGS_KEY, legacyItems)
    console.info(`[pluginRatingStore] migrated ${legacyItems.length} rating items from ${LEGACY_PLUGIN_RATINGS_KEY} to ${PLUGIN_RATINGS_KEY}`)
    return legacyItems
  }

  return legacyItems ?? []
}

async function writeStoredRatings(items: StoredPluginRating[]): Promise<void> {
  const storage = useStorage()
  await storage.setItem(PLUGIN_RATINGS_KEY, items)
}

function normalizeRatingSummary(averageRaw: unknown, countRaw: unknown): PluginRatingSummary {
  const count = Math.max(0, Number(countRaw ?? 0) || 0)
  const average = count > 0 ? Number(averageRaw ?? 0) || 0 : 0
  return {
    average: Number.isFinite(average) ? Math.round(average * 10) / 10 : 0,
    count,
  }
}

export async function getPluginRatingSummary(
  event: H3Event,
  pluginId: string,
): Promise<PluginRatingSummary> {
  const db = getD1Database(event)

  if (db) {
    await ensurePluginRatingSchema(db)
    const row = await db.prepare(`
      SELECT
        COUNT(*) as count,
        AVG(rating) as average
      FROM ${PLUGIN_RATINGS_TABLE}
      WHERE plugin_id = ?1;
    `).bind(pluginId).first<{ count: number, average: number }>()

    return normalizeRatingSummary(row?.average, row?.count)
  }

  const items = await readStoredRatings()
  const pluginRatings = items.filter(item => item.pluginId === pluginId)
  const count = pluginRatings.length
  const average = count
    ? pluginRatings.reduce((sum, item) => sum + (Number(item.rating) || 0), 0) / count
    : 0

  return normalizeRatingSummary(average, count)
}

export async function upsertPluginRating(
  event: H3Event,
  input: { pluginId: string, userId: string, rating: number },
): Promise<void> {
  const db = getD1Database(event)
  const now = new Date().toISOString()
  const rating = Math.round(input.rating)

  if (db) {
    await ensurePluginRatingSchema(db)
    await db.prepare(`
      INSERT INTO ${PLUGIN_RATINGS_TABLE} (
        plugin_id,
        user_id,
        rating,
        created_at,
        updated_at
      ) VALUES (?1, ?2, ?3, ?4, ?5)
      ON CONFLICT(plugin_id, user_id) DO UPDATE SET
        rating = excluded.rating,
        updated_at = excluded.updated_at;
    `).bind(
      input.pluginId,
      input.userId,
      rating,
      now,
      now,
    ).run()
    return
  }

  const items = await readStoredRatings()
  const index = items.findIndex(item => item.pluginId === input.pluginId && item.userId === input.userId)
  if (index === -1) {
    items.push({
      pluginId: input.pluginId,
      userId: input.userId,
      rating,
      createdAt: now,
      updatedAt: now,
    })
  }
  else {
    const existing = items[index]
    if (!existing) {
      items.push({
        pluginId: input.pluginId,
        userId: input.userId,
        rating,
        createdAt: now,
        updatedAt: now,
      })
      await writeStoredRatings(items)
      return
    }
    items[index] = {
      ...existing,
      rating,
      updatedAt: now,
    }
  }
  await writeStoredRatings(items)
}
