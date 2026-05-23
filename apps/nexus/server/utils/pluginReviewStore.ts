import type { D1Database } from '@cloudflare/workers-types'
import type { H3Event } from 'h3'
import { randomUUID } from 'node:crypto'
import { useStorage } from 'nitropack/runtime/internal/storage'
import { readCloudflareBindings } from './cloudflare'

const PLUGIN_REVIEWS_TABLE = 'store_plugin_reviews'
const LEGACY_PLUGIN_REVIEWS_TABLE = 'market_plugin_reviews'
const PLUGIN_REVIEWS_KEY = 'store:pluginReviews'
const LEGACY_PLUGIN_REVIEWS_KEY = ['market', 'pluginReviews'].join(':')

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

export interface PluginReviewRatingBucket {
  rating: number
  count: number
}

export interface PluginReviewStatusTrendPoint {
  date: string
  total: number
  approved: number
  pending: number
  rejected: number
}

export interface PluginReviewRatingTrendPoint {
  date: string
  ratingCount: number
  averageRating: number
  lowRatingCount: number
  lowRatingRate: number
}

export interface PluginReviewCommentStatusBucket {
  status: PluginReviewStatus
  total: number
  withTitle: number
  withContent: number
  titleCoverageRate: number
  contentCoverageRate: number
  averageContentLength: number
}

export interface PluginReviewCommentTrendPoint {
  date: string
  total: number
  withTitle: number
  withContent: number
  titleCoverageRate: number
  contentCoverageRate: number
  averageContentLength: number
}

export interface PluginReviewCommentAnalytics {
  withTitle: number
  withContent: number
  titleCoverageRate: number
  contentCoverageRate: number
  averageContentLength: number
  byStatus: PluginReviewCommentStatusBucket[]
  trend: PluginReviewCommentTrendPoint[]
}

export interface PluginReviewAnalytics {
  total: number
  approved: number
  pending: number
  rejected: number
  averageRating: number
  ratingCount: number
  ratingDistribution: PluginReviewRatingBucket[]
  ratingTrend: PluginReviewRatingTrendPoint[]
  statusTrend: PluginReviewStatusTrendPoint[]
  comments: PluginReviewCommentAnalytics
  latestAt: string | null
}

const REVIEW_STATUSES: PluginReviewStatus[] = ['approved', 'pending', 'rejected']

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

  await migrateLegacyPluginReviewsTable(db)
  reviewSchemaInitialized = true
}

async function readStoredReviews(): Promise<StoredPluginReview[]> {
  const storage = useStorage()
  const items = await storage.getItem<StoredPluginReview[] | null>(PLUGIN_REVIEWS_KEY)
  if (Array.isArray(items))
    return items

  const legacyItems = await storage.getItem<StoredPluginReview[] | null>(LEGACY_PLUGIN_REVIEWS_KEY)
  if (Array.isArray(legacyItems) && legacyItems.length > 0) {
    await storage.setItem(PLUGIN_REVIEWS_KEY, legacyItems)
    console.info(`[pluginReviewStore] migrated ${legacyItems.length} review items from ${LEGACY_PLUGIN_REVIEWS_KEY} to ${PLUGIN_REVIEWS_KEY}`)
    return legacyItems
  }

  return legacyItems ?? []
}

async function writeStoredReviews(items: StoredPluginReview[]): Promise<void> {
  const storage = useStorage()
  await storage.setItem(PLUGIN_REVIEWS_KEY, items)
}

function resolveStatuses(options: PluginReviewListOptions): PluginReviewStatus[] {
  return options.statuses && options.statuses.length ? options.statuses : ['approved']
}

function normalizeRating(value: unknown): number | null {
  const rating = Math.round(Number(value))
  return Number.isFinite(rating) && rating >= 1 && rating <= 5 ? rating : null
}

function createRatingDistribution(reviews: Array<{ rating: unknown }>): PluginReviewRatingBucket[] {
  const counts = new Map<number, number>()
  for (const review of reviews) {
    const rating = normalizeRating(review.rating)
    if (!rating)
      continue
    counts.set(rating, (counts.get(rating) ?? 0) + 1)
  }

  return [5, 4, 3, 2, 1].map(rating => ({
    rating,
    count: counts.get(rating) ?? 0,
  }))
}

function normalizeAverageRating(total: number, average: unknown): number {
  if (total <= 0)
    return 0
  const value = Number(average ?? 0) || 0
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : 0
}

function roundPercent(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 10000) / 100 : 0
}

function roundAverage(value: unknown): number {
  const normalized = Number(value ?? 0) || 0
  return Number.isFinite(normalized) ? Math.round(normalized * 100) / 100 : 0
}

function hasReviewText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function createReviewStatusTrend(
  reviews: Array<{ status: PluginReviewStatus, createdAt?: string | null, updatedAt?: string | null }>,
): PluginReviewStatusTrendPoint[] {
  const trend = new Map<string, PluginReviewStatusTrendPoint>()

  for (const review of reviews) {
    const date = (review.updatedAt || review.createdAt || '').slice(0, 10)
    if (!date)
      continue

    const point = trend.get(date) ?? {
      date,
      total: 0,
      approved: 0,
      pending: 0,
      rejected: 0,
    }
    point.total += 1
    point[review.status] += 1
    trend.set(date, point)
  }

  return Array.from(trend.values()).sort((a, b) => a.date.localeCompare(b.date))
}

function createReviewRatingTrend(
  reviews: Array<{ rating: unknown, status: PluginReviewStatus, createdAt?: string | null, updatedAt?: string | null }>,
): PluginReviewRatingTrendPoint[] {
  const trend = new Map<string, { date: string, ratingCount: number, ratingTotal: number, lowRatingCount: number }>()

  for (const review of reviews) {
    if (review.status !== 'approved')
      continue
    const rating = normalizeRating(review.rating)
    if (!rating)
      continue
    const date = (review.updatedAt || review.createdAt || '').slice(0, 10)
    if (!date)
      continue
    const point = trend.get(date) ?? {
      date,
      ratingCount: 0,
      ratingTotal: 0,
      lowRatingCount: 0,
    }
    point.ratingCount += 1
    point.ratingTotal += rating
    if (rating <= 2)
      point.lowRatingCount += 1
    trend.set(date, point)
  }

  return Array.from(trend.values())
    .map(point => ({
      date: point.date,
      ratingCount: point.ratingCount,
      averageRating: normalizeAverageRating(point.ratingCount, point.ratingTotal / point.ratingCount),
      lowRatingCount: point.lowRatingCount,
      lowRatingRate: roundPercent(point.lowRatingCount, point.ratingCount),
    }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

interface ReviewCommentAggregation {
  total: number
  withTitle: number
  withContent: number
  contentLength: number
}

function createEmptyCommentAggregation(): ReviewCommentAggregation {
  return {
    total: 0,
    withTitle: 0,
    withContent: 0,
    contentLength: 0,
  }
}

function pushReviewCommentAggregation(
  aggregation: ReviewCommentAggregation,
  review: { title?: string | null, content?: string | null },
): void {
  const content = typeof review.content === 'string' ? review.content.trim() : ''
  aggregation.total += 1
  aggregation.withTitle += hasReviewText(review.title) ? 1 : 0
  aggregation.withContent += content.length > 0 ? 1 : 0
  aggregation.contentLength += content.length
}

function mapReviewCommentAggregation(
  aggregation: ReviewCommentAggregation,
): Omit<PluginReviewCommentStatusBucket, 'status'> {
  return {
    total: aggregation.total,
    withTitle: aggregation.withTitle,
    withContent: aggregation.withContent,
    titleCoverageRate: roundPercent(aggregation.withTitle, aggregation.total),
    contentCoverageRate: roundPercent(aggregation.withContent, aggregation.total),
    averageContentLength: roundAverage(aggregation.total ? aggregation.contentLength / aggregation.total : 0),
  }
}

function createReviewCommentAnalytics(
  reviews: Array<{
    status: PluginReviewStatus
    title?: string | null
    content?: string | null
    createdAt?: string | null
    updatedAt?: string | null
  }>,
): PluginReviewCommentAnalytics {
  const total = createEmptyCommentAggregation()
  const byStatus = new Map<PluginReviewStatus, ReviewCommentAggregation>()
  const trend = new Map<string, ReviewCommentAggregation>()

  for (const review of reviews) {
    pushReviewCommentAggregation(total, review)

    const statusAggregation = byStatus.get(review.status) ?? createEmptyCommentAggregation()
    pushReviewCommentAggregation(statusAggregation, review)
    byStatus.set(review.status, statusAggregation)

    const date = (review.updatedAt || review.createdAt || '').slice(0, 10)
    if (date) {
      const trendAggregation = trend.get(date) ?? createEmptyCommentAggregation()
      pushReviewCommentAggregation(trendAggregation, review)
      trend.set(date, trendAggregation)
    }
  }

  const summary = mapReviewCommentAggregation(total)

  return {
    withTitle: total.withTitle,
    withContent: total.withContent,
    titleCoverageRate: summary.titleCoverageRate,
    contentCoverageRate: summary.contentCoverageRate,
    averageContentLength: summary.averageContentLength,
    byStatus: REVIEW_STATUSES.map(status => ({
      status,
      ...mapReviewCommentAggregation(byStatus.get(status) ?? createEmptyCommentAggregation()),
    })),
    trend: Array.from(trend.entries())
      .map(([date, aggregation]) => ({
        date,
        ...mapReviewCommentAggregation(aggregation),
      }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  }
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

async function migrateLegacyPluginReviewsTable(db: D1Database): Promise<void> {
  const hasLegacyTable = await tableExists(db, LEGACY_PLUGIN_REVIEWS_TABLE)
  if (!hasLegacyTable)
    return

  const currentCount = await countRows(db, PLUGIN_REVIEWS_TABLE)
  if (currentCount > 0)
    return

  const legacyCount = await countRows(db, LEGACY_PLUGIN_REVIEWS_TABLE)
  if (legacyCount <= 0)
    return

  await db.prepare(`
    INSERT OR IGNORE INTO ${PLUGIN_REVIEWS_TABLE} (
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
    )
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
    FROM ${LEGACY_PLUGIN_REVIEWS_TABLE};
  `).run()

  console.info(`[pluginReviewStore] migrated ${legacyCount} review rows from ${LEGACY_PLUGIN_REVIEWS_TABLE} to ${PLUGIN_REVIEWS_TABLE}`)
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

export async function getPluginReviewAnalytics(
  event: H3Event,
  pluginId: string,
): Promise<PluginReviewAnalytics> {
  const db = getD1Database(event)

  if (db) {
    await ensurePluginReviewSchema(db)
    const statusRow = await db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
        MAX(updated_at) as latestAt
      FROM ${PLUGIN_REVIEWS_TABLE}
      WHERE plugin_id = ?1;
    `).bind(pluginId).first<{
      total: number
      approved: number | null
      pending: number | null
      rejected: number | null
      latestAt: string | null
    }>()

    const ratingRow = await db.prepare(`
      SELECT
        COUNT(*) as count,
        AVG(rating) as average
      FROM ${PLUGIN_REVIEWS_TABLE}
      WHERE plugin_id = ?1
        AND status = 'approved'
        AND rating BETWEEN 1 AND 5;
    `).bind(pluginId).first<{ count: number, average: number | null }>()

    const distributionRows = await db.prepare(`
      SELECT
        rating,
        COUNT(*) as count
      FROM ${PLUGIN_REVIEWS_TABLE}
      WHERE plugin_id = ?1
        AND status = 'approved'
        AND rating BETWEEN 1 AND 5
      GROUP BY rating;
    `).bind(pluginId).all<{ rating: number, count: number }>()

    const statusTrendRows = await db.prepare(`
      SELECT
        substr(COALESCE(NULLIF(updated_at, ''), created_at), 1, 10) as date,
        COUNT(*) as total,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected
      FROM ${PLUGIN_REVIEWS_TABLE}
      WHERE plugin_id = ?1
      GROUP BY substr(COALESCE(NULLIF(updated_at, ''), created_at), 1, 10)
      ORDER BY date ASC;
    `).bind(pluginId).all<{
      date: string | null
      total: number
      approved: number | null
      pending: number | null
      rejected: number | null
    }>()

    const ratingTrendRows = await db.prepare(`
      SELECT
        substr(COALESCE(NULLIF(updated_at, ''), created_at), 1, 10) as date,
        COUNT(*) as ratingCount,
        AVG(rating) as averageRating,
        SUM(CASE WHEN rating <= 2 THEN 1 ELSE 0 END) as lowRatingCount
      FROM ${PLUGIN_REVIEWS_TABLE}
      WHERE plugin_id = ?1
        AND status = 'approved'
        AND rating BETWEEN 1 AND 5
      GROUP BY substr(COALESCE(NULLIF(updated_at, ''), created_at), 1, 10)
      ORDER BY date ASC;
    `).bind(pluginId).all<{
      date: string | null
      ratingCount: number
      averageRating: number | null
      lowRatingCount: number | null
    }>()

    const commentRow = await db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN TRIM(COALESCE(title, '')) <> '' THEN 1 ELSE 0 END) as withTitle,
        SUM(CASE WHEN TRIM(COALESCE(content, '')) <> '' THEN 1 ELSE 0 END) as withContent,
        AVG(LENGTH(TRIM(COALESCE(content, '')))) as averageContentLength
      FROM ${PLUGIN_REVIEWS_TABLE}
      WHERE plugin_id = ?1;
    `).bind(pluginId).first<{
      total: number
      withTitle: number | null
      withContent: number | null
      averageContentLength: number | null
    }>()

    const commentStatusRows = await db.prepare(`
      SELECT
        status,
        COUNT(*) as total,
        SUM(CASE WHEN TRIM(COALESCE(title, '')) <> '' THEN 1 ELSE 0 END) as withTitle,
        SUM(CASE WHEN TRIM(COALESCE(content, '')) <> '' THEN 1 ELSE 0 END) as withContent,
        AVG(LENGTH(TRIM(COALESCE(content, '')))) as averageContentLength
      FROM ${PLUGIN_REVIEWS_TABLE}
      WHERE plugin_id = ?1
      GROUP BY status;
    `).bind(pluginId).all<{
      status: PluginReviewStatus
      total: number
      withTitle: number | null
      withContent: number | null
      averageContentLength: number | null
    }>()

    const commentTrendRows = await db.prepare(`
      SELECT
        substr(COALESCE(NULLIF(updated_at, ''), created_at), 1, 10) as date,
        COUNT(*) as total,
        SUM(CASE WHEN TRIM(COALESCE(title, '')) <> '' THEN 1 ELSE 0 END) as withTitle,
        SUM(CASE WHEN TRIM(COALESCE(content, '')) <> '' THEN 1 ELSE 0 END) as withContent,
        AVG(LENGTH(TRIM(COALESCE(content, '')))) as averageContentLength
      FROM ${PLUGIN_REVIEWS_TABLE}
      WHERE plugin_id = ?1
      GROUP BY substr(COALESCE(NULLIF(updated_at, ''), created_at), 1, 10)
      ORDER BY date ASC;
    `).bind(pluginId).all<{
      date: string | null
      total: number
      withTitle: number | null
      withContent: number | null
      averageContentLength: number | null
    }>()

    const distributionCounts = new Map(
      (distributionRows.results ?? []).map(row => [Number(row.rating), Number(row.count) || 0]),
    )
    const ratingDistribution = [5, 4, 3, 2, 1].map(rating => ({
      rating,
      count: distributionCounts.get(rating) ?? 0,
    }))
    const statusTrend = (statusTrendRows.results ?? [])
      .filter(row => Boolean(row.date))
      .map(row => ({
        date: row.date ?? '',
        total: Number(row.total ?? 0) || 0,
        approved: Number(row.approved ?? 0) || 0,
        pending: Number(row.pending ?? 0) || 0,
        rejected: Number(row.rejected ?? 0) || 0,
      }))
    const ratingTrend = (ratingTrendRows.results ?? [])
      .filter(row => Boolean(row.date))
      .map((row) => {
        const ratingCount = Number(row.ratingCount ?? 0) || 0
        const lowRatingCount = Number(row.lowRatingCount ?? 0) || 0
        return {
          date: row.date ?? '',
          ratingCount,
          averageRating: normalizeAverageRating(ratingCount, row.averageRating),
          lowRatingCount,
          lowRatingRate: roundPercent(lowRatingCount, ratingCount),
        }
      })
    const ratingCount = Number(ratingRow?.count ?? 0) || 0
    const commentTotal = Number(commentRow?.total ?? 0) || 0
    const commentWithTitle = Number(commentRow?.withTitle ?? 0) || 0
    const commentWithContent = Number(commentRow?.withContent ?? 0) || 0
    const commentStatusCounts = new Map(
      (commentStatusRows.results ?? []).map(row => [row.status, {
        total: Number(row.total ?? 0) || 0,
        withTitle: Number(row.withTitle ?? 0) || 0,
        withContent: Number(row.withContent ?? 0) || 0,
        averageContentLength: roundAverage(row.averageContentLength),
      }]),
    )
    const comments: PluginReviewCommentAnalytics = {
      withTitle: commentWithTitle,
      withContent: commentWithContent,
      titleCoverageRate: roundPercent(commentWithTitle, commentTotal),
      contentCoverageRate: roundPercent(commentWithContent, commentTotal),
      averageContentLength: roundAverage(commentRow?.averageContentLength),
      byStatus: REVIEW_STATUSES.map((status) => {
        const item = commentStatusCounts.get(status) ?? {
          total: 0,
          withTitle: 0,
          withContent: 0,
          averageContentLength: 0,
        }
        return {
          status,
          total: item.total,
          withTitle: item.withTitle,
          withContent: item.withContent,
          titleCoverageRate: roundPercent(item.withTitle, item.total),
          contentCoverageRate: roundPercent(item.withContent, item.total),
          averageContentLength: item.averageContentLength,
        }
      }),
      trend: (commentTrendRows.results ?? [])
        .filter(row => Boolean(row.date))
        .map((row) => {
          const total = Number(row.total ?? 0) || 0
          const withTitle = Number(row.withTitle ?? 0) || 0
          const withContent = Number(row.withContent ?? 0) || 0
          return {
            date: row.date ?? '',
            total,
            withTitle,
            withContent,
            titleCoverageRate: roundPercent(withTitle, total),
            contentCoverageRate: roundPercent(withContent, total),
            averageContentLength: roundAverage(row.averageContentLength),
          }
        }),
    }

    return {
      total: Number(statusRow?.total ?? 0) || 0,
      approved: Number(statusRow?.approved ?? 0) || 0,
      pending: Number(statusRow?.pending ?? 0) || 0,
      rejected: Number(statusRow?.rejected ?? 0) || 0,
      averageRating: normalizeAverageRating(ratingCount, ratingRow?.average),
      ratingCount,
      ratingDistribution,
      ratingTrend,
      statusTrend,
      comments,
      latestAt: statusRow?.latestAt ?? null,
    }
  }

  const items = await readStoredReviews()
  const reviews = items.filter(item => item.pluginId === pluginId)
  const approvedReviews = reviews.filter(item => item.status === 'approved' && normalizeRating(item.rating))
  const ratingCount = approvedReviews.length
  const average = ratingCount
    ? approvedReviews.reduce((sum, item) => sum + (normalizeRating(item.rating) ?? 0), 0) / ratingCount
    : 0
  const latestAt = reviews.reduce<string | null>((latest, item) => {
    const value = item.updatedAt || item.createdAt
    if (!value)
      return latest
    return !latest || value.localeCompare(latest) > 0 ? value : latest
  }, null)

  return {
    total: reviews.length,
    approved: reviews.filter(item => item.status === 'approved').length,
    pending: reviews.filter(item => item.status === 'pending').length,
    rejected: reviews.filter(item => item.status === 'rejected').length,
    averageRating: normalizeAverageRating(ratingCount, average),
    ratingCount,
    ratingDistribution: createRatingDistribution(approvedReviews),
    ratingTrend: createReviewRatingTrend(reviews),
    statusTrend: createReviewStatusTrend(reviews),
    comments: createReviewCommentAnalytics(reviews),
    latestAt,
  }
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
