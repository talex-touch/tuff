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

export type PluginReviewCommentQualityBucketKey = 'empty' | 'short' | 'medium' | 'long'

export interface PluginReviewCommentQualityBucket {
  key: PluginReviewCommentQualityBucketKey
  total: number
  approved: number
  pending: number
  rejected: number
  averageRating: number
  lowRatingCount: number
  lowRatingRate: number
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
  qualityBuckets: PluginReviewCommentQualityBucket[]
  byStatus: PluginReviewCommentStatusBucket[]
  trend: PluginReviewCommentTrendPoint[]
}

export type PluginReviewModerationTimingBucketKey = 'under1h' | 'oneTo24h' | 'oneTo7d' | 'over7d'

export interface PluginReviewModerationTimingBucket {
  key: PluginReviewModerationTimingBucketKey
  total: number
  approved: number
  pending: number
  rejected: number
  averageHours: number
  maxHours: number
}

export interface PluginReviewModerationTimingSummary {
  total: number
  approved: number
  pending: number
  rejected: number
  averageHours: number
  maxHours: number
  buckets: PluginReviewModerationTimingBucket[]
}

export interface PluginReviewModerationTimingAnalytics {
  pending: PluginReviewModerationTimingSummary
  processed: PluginReviewModerationTimingSummary
}

export type PluginReviewActionQueuePriority = 'high' | 'medium' | 'low'

export type PluginReviewActionQueueSuggestedAction =
  | 'moderate-pending-reviews'
  | 'review-rejected-feedback'
  | 'investigate-low-ratings'
  | 'improve-review-prompts'

export interface PluginReviewActionQueueItem {
  key: string
  priority: PluginReviewActionQueuePriority
  suggestedAction: PluginReviewActionQueueSuggestedAction
  reason: string
  total: number
  approved: number
  pending: number
  rejected: number
  ratingCount: number
  averageRating: number
  lowRatingCount: number
  lowRatingRate: number
  titleCoverageRate: number
  contentCoverageRate: number
  averageContentLength: number
  latestDate: string | null
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
  moderationTiming: PluginReviewModerationTimingAnalytics
  actionQueue: PluginReviewActionQueueItem[]
  latestAt: string | null
}

const REVIEW_STATUSES: PluginReviewStatus[] = ['approved', 'pending', 'rejected']
const COMMENT_QUALITY_BUCKETS: PluginReviewCommentQualityBucketKey[] = ['empty', 'short', 'medium', 'long']
const MODERATION_TIMING_BUCKETS: PluginReviewModerationTimingBucketKey[] = ['under1h', 'oneTo24h', 'oneTo7d', 'over7d']
const HOUR_MS = 60 * 60 * 1000

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

interface ReviewModerationTimingAggregation {
  total: number
  approved: number
  pending: number
  rejected: number
  hoursTotal: number
  maxHours: number
}

function createEmptyModerationTimingAggregation(): ReviewModerationTimingAggregation {
  return {
    total: 0,
    approved: 0,
    pending: 0,
    rejected: 0,
    hoursTotal: 0,
    maxHours: 0,
  }
}

function parseReviewDate(value?: string | null): number | null {
  if (!value)
    return null
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : null
}

function diffReviewHours(start?: string | null, end?: string | null): number | null {
  const startTime = parseReviewDate(start)
  const endTime = parseReviewDate(end)
  if (startTime === null || endTime === null || endTime < startTime)
    return null
  return (endTime - startTime) / HOUR_MS
}

function classifyModerationTiming(hours: number): PluginReviewModerationTimingBucketKey {
  if (hours < 1)
    return 'under1h'
  if (hours < 24)
    return 'oneTo24h'
  if (hours < 168)
    return 'oneTo7d'
  return 'over7d'
}

function pushModerationTimingAggregation(
  aggregation: ReviewModerationTimingAggregation,
  review: { status: PluginReviewStatus },
  hours: number,
): void {
  aggregation.total += 1
  aggregation[review.status] += 1
  aggregation.hoursTotal += hours
  aggregation.maxHours = Math.max(aggregation.maxHours, hours)
}

function mapModerationTimingAggregation(
  key: PluginReviewModerationTimingBucketKey,
  aggregation: ReviewModerationTimingAggregation,
): PluginReviewModerationTimingBucket {
  return {
    key,
    total: aggregation.total,
    approved: aggregation.approved,
    pending: aggregation.pending,
    rejected: aggregation.rejected,
    averageHours: roundAverage(aggregation.total ? aggregation.hoursTotal / aggregation.total : 0),
    maxHours: roundAverage(aggregation.maxHours),
  }
}

function mapModerationTimingSummary(
  total: ReviewModerationTimingAggregation,
  buckets: Map<PluginReviewModerationTimingBucketKey, ReviewModerationTimingAggregation>,
): PluginReviewModerationTimingSummary {
  return {
    total: total.total,
    approved: total.approved,
    pending: total.pending,
    rejected: total.rejected,
    averageHours: roundAverage(total.total ? total.hoursTotal / total.total : 0),
    maxHours: roundAverage(total.maxHours),
    buckets: MODERATION_TIMING_BUCKETS.map(key =>
      mapModerationTimingAggregation(key, buckets.get(key) ?? createEmptyModerationTimingAggregation()),
    ),
  }
}

function createReviewModerationTimingAnalytics(
  reviews: Array<{ status: PluginReviewStatus, createdAt?: string | null, updatedAt?: string | null }>,
  now = new Date(),
): PluginReviewModerationTimingAnalytics {
  const pendingTotal = createEmptyModerationTimingAggregation()
  const processedTotal = createEmptyModerationTimingAggregation()
  const pendingBuckets = new Map<PluginReviewModerationTimingBucketKey, ReviewModerationTimingAggregation>()
  const processedBuckets = new Map<PluginReviewModerationTimingBucketKey, ReviewModerationTimingAggregation>()
  const nowIso = now.toISOString()

  for (const review of reviews) {
    const endAt = review.status === 'pending' ? nowIso : review.updatedAt
    const hours = diffReviewHours(review.createdAt, endAt)
    if (hours === null)
      continue

    const bucketKey = classifyModerationTiming(hours)
    if (review.status === 'pending') {
      const bucket = pendingBuckets.get(bucketKey) ?? createEmptyModerationTimingAggregation()
      pushModerationTimingAggregation(pendingTotal, review, hours)
      pushModerationTimingAggregation(bucket, review, hours)
      pendingBuckets.set(bucketKey, bucket)
      continue
    }

    const bucket = processedBuckets.get(bucketKey) ?? createEmptyModerationTimingAggregation()
    pushModerationTimingAggregation(processedTotal, review, hours)
    pushModerationTimingAggregation(bucket, review, hours)
    processedBuckets.set(bucketKey, bucket)
  }

  return {
    pending: mapModerationTimingSummary(pendingTotal, pendingBuckets),
    processed: mapModerationTimingSummary(processedTotal, processedBuckets),
  }
}

interface ReviewCommentAggregation {
  total: number
  withTitle: number
  withContent: number
  contentLength: number
}

interface ReviewCommentQualityAggregation extends ReviewCommentAggregation {
  approved: number
  pending: number
  rejected: number
  ratingCount: number
  ratingTotal: number
  lowRatingCount: number
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

function createEmptyCommentQualityAggregation(): ReviewCommentQualityAggregation {
  return {
    ...createEmptyCommentAggregation(),
    approved: 0,
    pending: 0,
    rejected: 0,
    ratingCount: 0,
    ratingTotal: 0,
    lowRatingCount: 0,
  }
}

function classifyReviewCommentLength(content?: string | null): PluginReviewCommentQualityBucketKey {
  const length = typeof content === 'string' ? content.trim().length : 0
  if (length <= 0)
    return 'empty'
  if (length < 40)
    return 'short'
  if (length < 160)
    return 'medium'
  return 'long'
}

function pushReviewCommentQualityAggregation(
  aggregation: ReviewCommentQualityAggregation,
  review: { status: PluginReviewStatus, rating?: unknown, title?: string | null, content?: string | null },
): void {
  pushReviewCommentAggregation(aggregation, review)
  aggregation[review.status] += 1

  const rating = normalizeRating(review.rating)
  if (!rating)
    return

  aggregation.ratingCount += 1
  aggregation.ratingTotal += rating
  if (rating <= 2)
    aggregation.lowRatingCount += 1
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

function mapReviewCommentQualityBucket(
  key: PluginReviewCommentQualityBucketKey,
  aggregation: ReviewCommentQualityAggregation,
): PluginReviewCommentQualityBucket {
  return {
    key,
    total: aggregation.total,
    approved: aggregation.approved,
    pending: aggregation.pending,
    rejected: aggregation.rejected,
    averageRating: normalizeAverageRating(
      aggregation.ratingCount,
      aggregation.ratingCount ? aggregation.ratingTotal / aggregation.ratingCount : 0,
    ),
    lowRatingCount: aggregation.lowRatingCount,
    lowRatingRate: roundPercent(aggregation.lowRatingCount, aggregation.ratingCount),
    titleCoverageRate: roundPercent(aggregation.withTitle, aggregation.total),
    contentCoverageRate: roundPercent(aggregation.withContent, aggregation.total),
    averageContentLength: roundAverage(aggregation.total ? aggregation.contentLength / aggregation.total : 0),
  }
}

function createReviewCommentAnalytics(
  reviews: Array<{
    status: PluginReviewStatus
    rating?: unknown
    title?: string | null
    content?: string | null
    createdAt?: string | null
    updatedAt?: string | null
  }>,
): PluginReviewCommentAnalytics {
  const total = createEmptyCommentAggregation()
  const byStatus = new Map<PluginReviewStatus, ReviewCommentAggregation>()
  const trend = new Map<string, ReviewCommentAggregation>()
  const qualityBuckets = new Map<PluginReviewCommentQualityBucketKey, ReviewCommentQualityAggregation>()

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

    const qualityKey = classifyReviewCommentLength(review.content)
    const qualityAggregation = qualityBuckets.get(qualityKey) ?? createEmptyCommentQualityAggregation()
    pushReviewCommentQualityAggregation(qualityAggregation, review)
    qualityBuckets.set(qualityKey, qualityAggregation)
  }

  const summary = mapReviewCommentAggregation(total)

  return {
    withTitle: total.withTitle,
    withContent: total.withContent,
    titleCoverageRate: summary.titleCoverageRate,
    contentCoverageRate: summary.contentCoverageRate,
    averageContentLength: summary.averageContentLength,
    qualityBuckets: COMMENT_QUALITY_BUCKETS.map(key =>
      mapReviewCommentQualityBucket(key, qualityBuckets.get(key) ?? createEmptyCommentQualityAggregation()),
    ),
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

function rankPluginReviewActionQueuePriority(priority: PluginReviewActionQueuePriority): number {
  switch (priority) {
    case 'high':
      return 3
    case 'medium':
      return 2
    default:
      return 1
  }
}

function createPluginReviewActionQueue(input: {
  total: number
  approved: number
  pending: number
  rejected: number
  averageRating: number
  ratingCount: number
  ratingDistribution: PluginReviewRatingBucket[]
  ratingTrend: PluginReviewRatingTrendPoint[]
  comments: PluginReviewCommentAnalytics
  latestAt: string | null
}): PluginReviewActionQueueItem[] {
  if (input.total <= 0)
    return []

  const latestRatingTrend = input.ratingTrend.at(-1)
  const lowRatingCount = input.ratingDistribution
    .filter(bucket => bucket.rating <= 2)
    .reduce((sum, bucket) => sum + bucket.count, 0)
  const lowRatingRate = roundPercent(lowRatingCount, input.ratingCount)
  const latestLowRatingCount = latestRatingTrend?.lowRatingCount ?? 0
  const latestLowRatingRate = latestRatingTrend?.lowRatingRate ?? 0
  const latestDate = (input.latestAt || latestRatingTrend?.date || '').slice(0, 10) || null
  const baseMetrics = {
    total: input.total,
    approved: input.approved,
    pending: input.pending,
    rejected: input.rejected,
    ratingCount: input.ratingCount,
    averageRating: input.averageRating,
    lowRatingCount,
    lowRatingRate,
    titleCoverageRate: input.comments.titleCoverageRate,
    contentCoverageRate: input.comments.contentCoverageRate,
    averageContentLength: input.comments.averageContentLength,
    latestDate,
  }
  const queue: PluginReviewActionQueueItem[] = []

  if (input.pending > 0) {
    queue.push({
      key: 'pending-review-backlog',
      priority: 'high',
      suggestedAction: 'moderate-pending-reviews',
      reason: 'pending-review-backlog',
      ...baseMetrics,
    })
  }

  if (lowRatingCount > 0 || latestLowRatingCount > 0) {
    queue.push({
      key: 'low-rating-signal',
      priority: latestLowRatingRate >= 30 || lowRatingRate >= 30 ? 'high' : 'medium',
      suggestedAction: 'investigate-low-ratings',
      reason: latestLowRatingCount > 0 ? 'latest-low-rating-spike' : 'low-rating-pattern',
      ...baseMetrics,
    })
  }

  if (input.comments.contentCoverageRate < 80 || input.comments.titleCoverageRate < 80) {
    queue.push({
      key: 'review-prompt-coverage',
      priority: input.comments.contentCoverageRate < 60 ? 'high' : 'medium',
      suggestedAction: 'improve-review-prompts',
      reason: 'low-comment-coverage',
      ...baseMetrics,
    })
  }

  if (input.rejected > 0) {
    queue.push({
      key: 'rejected-review-pattern',
      priority: 'medium',
      suggestedAction: 'review-rejected-feedback',
      reason: 'rejected-review-pattern',
      ...baseMetrics,
    })
  }

  return queue.sort((a, b) => {
    const priorityDelta = rankPluginReviewActionQueuePriority(b.priority) - rankPluginReviewActionQueuePriority(a.priority)
    return priorityDelta || a.key.localeCompare(b.key)
  })
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

    const commentRows = await db.prepare(`
      SELECT
        status,
        rating,
        title,
        content,
        created_at as createdAt,
        updated_at as updatedAt
      FROM ${PLUGIN_REVIEWS_TABLE}
      WHERE plugin_id = ?1;
    `).bind(pluginId).all<{
      status: PluginReviewStatus
      rating: number
      title: string | null
      content: string | null
      createdAt: string | null
      updatedAt: string | null
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
    const commentReviewRows = (commentRows.results ?? []).map(row => ({
      status: REVIEW_STATUSES.includes(row.status) ? row.status : 'pending',
      rating: row.rating,
      title: row.title,
      content: row.content,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }))
    const comments = createReviewCommentAnalytics(commentReviewRows)
    const moderationTiming = createReviewModerationTimingAnalytics(commentReviewRows)

    const total = Number(statusRow?.total ?? 0) || 0
    const approved = Number(statusRow?.approved ?? 0) || 0
    const pending = Number(statusRow?.pending ?? 0) || 0
    const rejected = Number(statusRow?.rejected ?? 0) || 0
    const averageRating = normalizeAverageRating(ratingCount, ratingRow?.average)

    return {
      total,
      approved,
      pending,
      rejected,
      averageRating,
      ratingCount,
      ratingDistribution,
      ratingTrend,
      statusTrend,
      comments,
      moderationTiming,
      actionQueue: createPluginReviewActionQueue({
        total,
        approved,
        pending,
        rejected,
        averageRating,
        ratingCount,
        ratingDistribution,
        ratingTrend,
        comments,
        latestAt: statusRow?.latestAt ?? null,
      }),
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

  const total = reviews.length
  const approved = reviews.filter(item => item.status === 'approved').length
  const pending = reviews.filter(item => item.status === 'pending').length
  const rejected = reviews.filter(item => item.status === 'rejected').length
  const averageRating = normalizeAverageRating(ratingCount, average)
  const ratingDistribution = createRatingDistribution(approvedReviews)
  const ratingTrend = createReviewRatingTrend(reviews)
  const statusTrend = createReviewStatusTrend(reviews)
  const comments = createReviewCommentAnalytics(reviews)
  const moderationTiming = createReviewModerationTimingAnalytics(reviews)

  return {
    total,
    approved,
    pending,
    rejected,
    averageRating,
    ratingCount,
    ratingDistribution,
    ratingTrend,
    statusTrend,
    comments,
    moderationTiming,
    actionQueue: createPluginReviewActionQueue({
      total,
      approved,
      pending,
      rejected,
      averageRating,
      ratingCount,
      ratingDistribution,
      ratingTrend,
      comments,
      latestAt,
    }),
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
