import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { useStorage } from 'nitropack/runtime/internal/storage'
import { readCloudflareBindings } from './cloudflare'

const PLUGIN_REVIEWS_TABLE = 'market_plugin_reviews'
const PLUGIN_REVIEWS_KEY = 'market:pluginReviews'

let reviewSchemaInitialized = false

export type PluginReviewStatus = 'pending' | 'approved' | 'rejected'

export interface PluginReviewAuthor {
  name: string
  avatarUrl?: string | null
}

export interface PluginReviewRecord {
  id: string
  pluginId: string
  userId: string
  author: PluginReviewAuthor
  rating: number
  title?: string | null
  content: string
  status: PluginReviewStatus
  createdAt: string
  updatedAt: string
}

interface StoredPluginReview {
  id: string
  pluginId: string
  userId: string
  authorName: string
  authorAvatarUrl?: string | null
  rating: number
  title?: string | null
  content: string
  status: PluginReviewStatus
  createdAt: string
  updatedAt: string
}

interface D1PluginReviewRow {
  id: string
  plugin_id: string
  user_id: string
  author_name: string
  author_avatar: string | null
  rating: number
  title: string | null
  content: string
  status: PluginReviewStatus
  created_at: string
  updated_at: string
}

export interface PluginReviewListResult {
  reviews: PluginReviewRecord[]
  total: number
  limit: number
  offset: number
}

export interface PluginReviewListOptions {
  viewerId?: string
  statuses?: PluginReviewStatus[]
  limit?: number
  offset?: number
}

export interface PluginReviewUpsertInput {
  pluginId: string
  userId: string
  authorName: string
  authorAvatarUrl?: string | null
  rating: number
  title?: string | null
  content: string
  status?: PluginReviewStatus
}

function getD1Database(event: H3Event): D1Database | null {
  const bindings = readCloudflareBindings(event)
  return bindings?.DB ?? null
}

function mapReviewRow(row: D1PluginReviewRow): PluginReviewRecord {
  return {
    id: row.id,
    pluginId: row.plugin_id,
    userId: row.user_id,
    author: {
      name: row.author_name,
      avatarUrl: row.author_avatar ?? null,
    },
    rating: Number(row.rating) || 0,
    title: row.title ?? null,
    content: row.content,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapStoredReview(item: StoredPluginReview): PluginReviewRecord {
  return {
    id: item.id,
    pluginId: item.pluginId,
    userId: item.userId,
    author: {
      name: item.authorName,
      avatarUrl: item.authorAvatarUrl ?? null,
    },
    rating: item.rating,
    title: item.title ?? null,
    content: item.content,
    status: item.status,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

async function ensurePluginReviewSchema(db: D1Database): Promise<void> {
  if (reviewSchemaInitialized)
    return

  await db.prepare(`
    CREATE TABLE IF NOT EXISTS ${PLUGIN_REVIEWS_TABLE} (
      id TEXT PRIMARY KEY,
      plugin_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_avatar TEXT,
      rating INTEGER NOT NULL,
      title TEXT,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (plugin_id, user_id)
    );
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_${PLUGIN_REVIEWS_TABLE}_plugin_id
    ON ${PLUGIN_REVIEWS_TABLE}(plugin_id);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_${PLUGIN_REVIEWS_TABLE}_status
    ON ${PLUGIN_REVIEWS_TABLE}(status);
  `).run()

  await db.prepare(`
    CREATE INDEX IF NOT EXISTS idx_${PLUGIN_REVIEWS_TABLE}_user_id
    ON ${PLUGIN_REVIEWS_TABLE}(user_id);
  `).run()

  reviewSchemaInitialized = true
}

async function readStoredReviews(): Promise<StoredPluginReview[]> {
  const storage = useStorage()
  const items = await storage.getItem<StoredPluginReview[]>(PLUGIN_REVIEWS_KEY)
  return items ?? []
}

async function writeStoredReviews(items: StoredPluginReview[]): Promise<void> {
  const storage = useStorage()
  await storage.setItem(PLUGIN_REVIEWS_KEY, items)
}

function resolveStatuses(options: PluginReviewListOptions): PluginReviewStatus[] {
  return options.statuses && options.statuses.length ? options.statuses : ['approved']
}

export async function listPluginReviews(
  event: H3Event,
  pluginId: string,
  options: PluginReviewListOptions = {},
): Promise<PluginReviewListResult> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50)
  const offset = Math.max(options.offset ?? 0, 0)
  const viewerId = options.viewerId
  const statuses = resolveStatuses(options)
  const db = getD1Database(event)

  if (db) {
    await ensurePluginReviewSchema(db)
    const statusPlaceholders = statuses.map((_, index) => `?${index + 2}`).join(', ')
    const whereClause = viewerId
      ? `plugin_id = ?1 AND (status IN (${statusPlaceholders}) OR user_id = ?${statuses.length + 2})`
      : `plugin_id = ?1 AND status IN (${statusPlaceholders})`
    const params: Array<string | number> = [pluginId, ...statuses]
    if (viewerId)
      params.push(viewerId)

    const countRow = await db.prepare(`
      SELECT COUNT(*) as count
      FROM ${PLUGIN_REVIEWS_TABLE}
      WHERE ${whereClause};
    `).bind(...params).first<{ count: number }>()
    const total = Number(countRow?.count) || 0

    const rows = await db.prepare(`
      SELECT
        id,
        plugin_id,
        user_id,
        author_name,
        author_avatar,
        rating,
        title,
        content,
        status,
        created_at,
        updated_at
      FROM ${PLUGIN_REVIEWS_TABLE}
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ?${params.length + 1} OFFSET ?${params.length + 2};
    `).bind(...params, limit, offset).all<D1PluginReviewRow>()

    return {
      reviews: (rows.results ?? []).map(mapReviewRow),
      total,
      limit,
      offset,
    }
  }

  const items = await readStoredReviews()
  const filtered = items.filter((item) => {
    if (item.pluginId !== pluginId)
      return false
    if (statuses.includes(item.status))
      return true
    return Boolean(viewerId && item.userId === viewerId)
  })

  filtered.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return {
    reviews: filtered.slice(offset, offset + limit).map(mapStoredReview),
    total: filtered.length,
    limit,
    offset,
  }
}

export async function listPendingPluginReviews(
  event: H3Event,
  options: Omit<PluginReviewListOptions, 'viewerId' | 'statuses'> = {},
): Promise<PluginReviewListResult> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 100)
  const offset = Math.max(options.offset ?? 0, 0)
  const db = getD1Database(event)

  if (db) {
    await ensurePluginReviewSchema(db)
    const countRow = await db.prepare(`
      SELECT COUNT(*) as count
      FROM ${PLUGIN_REVIEWS_TABLE}
      WHERE status = 'pending';
    `).first<{ count: number }>()
    const total = Number(countRow?.count) || 0

    const rows = await db.prepare(`
      SELECT
        id,
        plugin_id,
        user_id,
        author_name,
        author_avatar,
        rating,
        title,
        content,
        status,
        created_at,
        updated_at
      FROM ${PLUGIN_REVIEWS_TABLE}
      WHERE status = 'pending'
      ORDER BY created_at DESC
      LIMIT ?1 OFFSET ?2;
    `).bind(limit, offset).all<D1PluginReviewRow>()

    return {
      reviews: (rows.results ?? []).map(mapReviewRow),
      total,
      limit,
      offset,
    }
  }

  const items = await readStoredReviews()
  const pending = items.filter(item => item.status === 'pending')
  pending.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return {
    reviews: pending.slice(offset, offset + limit).map(mapStoredReview),
    total: pending.length,
    limit,
    offset,
  }
}

export async function upsertPluginReview(
  event: H3Event,
  input: PluginReviewUpsertInput,
): Promise<PluginReviewRecord> {
  const db = getD1Database(event)
  const now = new Date().toISOString()
  const status = input.status ?? 'pending'

  if (db) {
    await ensurePluginReviewSchema(db)
    const existing = await db.prepare(`
      SELECT id, created_at
      FROM ${PLUGIN_REVIEWS_TABLE}
      WHERE plugin_id = ?1 AND user_id = ?2;
    `).bind(input.pluginId, input.userId).first<{ id: string, created_at: string }>()

    const id = existing?.id ?? randomUUID()
    const createdAt = existing?.created_at ?? now

    if (existing) {
      await db.prepare(`
        UPDATE ${PLUGIN_REVIEWS_TABLE}
        SET rating = ?1,
            title = ?2,
            content = ?3,
            author_name = ?4,
            author_avatar = ?5,
            status = ?6,
            updated_at = ?7
        WHERE id = ?8;
      `).bind(
        input.rating,
        input.title ?? null,
        input.content,
        input.authorName,
        input.authorAvatarUrl ?? null,
        status,
        now,
        id,
      ).run()
    }
    else {
      await db.prepare(`
        INSERT INTO ${PLUGIN_REVIEWS_TABLE} (
          id,
          plugin_id,
          user_id,
          author_name,
          author_avatar,
          rating,
          title,
          content,
          status,
          created_at,
          updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11);
      `).bind(
        id,
        input.pluginId,
        input.userId,
        input.authorName,
        input.authorAvatarUrl ?? null,
        input.rating,
        input.title ?? null,
        input.content,
        status,
        createdAt,
        now,
      ).run()
    }

    const row = await db.prepare(`
      SELECT
        id,
        plugin_id,
        user_id,
        author_name,
        author_avatar,
        rating,
        title,
        content,
        status,
        created_at,
        updated_at
      FROM ${PLUGIN_REVIEWS_TABLE}
      WHERE id = ?1;
    `).bind(id).first<D1PluginReviewRow>()

    if (!row) {
      return {
        id,
        pluginId: input.pluginId,
        userId: input.userId,
        author: { name: input.authorName, avatarUrl: input.authorAvatarUrl ?? null },
        rating: input.rating,
        title: input.title ?? null,
        content: input.content,
        status,
        createdAt,
        updatedAt: now,
      }
    }

    return mapReviewRow(row)
  }

  const items = await readStoredReviews()
  const index = items.findIndex(item => item.pluginId === input.pluginId && item.userId === input.userId)
  if (index === -1) {
    const review: StoredPluginReview = {
      id: randomUUID(),
      pluginId: input.pluginId,
      userId: input.userId,
      authorName: input.authorName,
      authorAvatarUrl: input.authorAvatarUrl ?? null,
      rating: input.rating,
      title: input.title ?? null,
      content: input.content,
      status,
      createdAt: now,
      updatedAt: now,
    }
    items.push(review)
    await writeStoredReviews(items)
    return mapStoredReview(review)
  }

  const existing = items[index]
  if (!existing) {
    const review: StoredPluginReview = {
      id: randomUUID(),
      pluginId: input.pluginId,
      userId: input.userId,
      authorName: input.authorName,
      authorAvatarUrl: input.authorAvatarUrl ?? null,
      rating: input.rating,
      title: input.title ?? null,
      content: input.content,
      status,
      createdAt: now,
      updatedAt: now,
    }
    items.push(review)
    await writeStoredReviews(items)
    return mapStoredReview(review)
  }

  const updated: StoredPluginReview = {
    ...existing,
    authorName: input.authorName,
    authorAvatarUrl: input.authorAvatarUrl ?? null,
    rating: input.rating,
    title: input.title ?? null,
    content: input.content,
    status,
    updatedAt: now,
  }
  items[index] = updated
  await writeStoredReviews(items)

  return mapStoredReview(updated)
}

export async function setPluginReviewStatus(
  event: H3Event,
  reviewId: string,
  status: PluginReviewStatus,
): Promise<PluginReviewRecord | null> {
  const db = getD1Database(event)
  const now = new Date().toISOString()

  if (db) {
    await ensurePluginReviewSchema(db)
    await db.prepare(`
      UPDATE ${PLUGIN_REVIEWS_TABLE}
      SET status = ?1, updated_at = ?2
      WHERE id = ?3;
    `).bind(status, now, reviewId).run()

    const row = await db.prepare(`
      SELECT
        id,
        plugin_id,
        user_id,
        author_name,
        author_avatar,
        rating,
        title,
        content,
        status,
        created_at,
        updated_at
      FROM ${PLUGIN_REVIEWS_TABLE}
      WHERE id = ?1;
    `).bind(reviewId).first<D1PluginReviewRow>()

    return row ? mapReviewRow(row) : null
  }

  const items = await readStoredReviews()
  const index = items.findIndex(item => item.id === reviewId)
  if (index === -1)
    return null

  const existing = items[index]
  if (!existing)
    return null

  const updated: StoredPluginReview = {
    ...existing,
    status,
    updatedAt: now,
  }
  items[index] = updated
  await writeStoredReviews(items)

  return mapStoredReview(updated)
}
