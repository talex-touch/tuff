import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import * as schema from '../../../db/schema'
import { withSqliteRetry } from '../../../db/sqlite-retry'
import { AdaptiveBatchScheduler } from './adaptive-batch-scheduler'
import { searchLogger } from './search-logger'

const CHINESE_CHAR_REGEX = /[\u4E00-\u9FA5]/
const INVALID_KEYWORD_REGEX = /[^a-z0-9\u4E00-\u9FA5]+/i
const WORD_SPLIT_REGEX = /[\s\-_]+/g
const PATH_SPLIT_REGEX = /[\\/]+/
const NGRAM_PREFIX = 'ng:'
const NGRAM_MIN_WORD_LENGTH = 3
const NGRAM_SOURCE_MIN_PRIORITY = 1.1
const NGRAM_MAX_SOURCE_KEYWORDS = 96
const NGRAM_MAX_ENTRIES_PER_ITEM = 256
const PRIORITY_EPSILON = 0.0001
const ZERO_RESULT_DIAGNOSTIC_THROTTLE_MS = 30_000

/**
 * Generate character n-grams for a word.
 * Used for fuzzy recall: query n-grams are matched against indexed n-grams
 * to find candidate items, which are then filtered by edit distance.
 */
function generateNgrams(word: string, n = 2): string[] {
  if (word.length < n) return []
  const ngrams: string[] = []
  for (let i = 0; i <= word.length - n; i++) {
    ngrams.push(NGRAM_PREFIX + word.substring(i, i + n))
  }
  return ngrams
}

export interface SearchIndexKeyword {
  value: string
  priority?: number
}

export interface SearchIndexItem {
  itemId: string
  providerId: string
  type: string
  name: string
  displayName?: string | null
  description?: string | null
  path?: string | null
  extension?: string | null
  aliases?: SearchIndexKeyword[]
  keywords?: SearchIndexKeyword[]
  tags?: string[]
  content?: string | null
}

interface PreparedIndexDocument {
  itemId: string
  providerId: string
  type: string
  title: string
  titleCompact: string
  keywords: string
  tags: string
  path: string
  content: string
  keywordEntries: SearchIndexKeyword[]
  keywordHash: string
}

type SearchIndexWriteTx = Pick<
  LibSQLDatabase<typeof schema>,
  'run' | 'delete' | 'insert' | 'select'
>

type SearchIndexLogAction = 'index' | 'remove' | 'removeByProvider'

interface SearchIndexLogBucket {
  count: number
  items: number
  totalDurationMs: number
  maxDurationMs: number
  windowStartedAt: number
  flushTimer: ReturnType<typeof setTimeout> | null
}

export interface SearchIndexServiceOptions {
  /**
   * When true, bypass DbWriteScheduler and pacing delays.
   * Use this in worker threads where the service owns its own DB connection
   * and there is no event loop contention.
   */
  directMode?: boolean
}

export class SearchIndexService {
  private initialized = false
  private pinyinModule: typeof import('pinyin-pro') | null = null
  private pinyinPromise: Promise<typeof import('pinyin-pro')> | null = null
  private readonly directMode: boolean
  private readonly zeroResultDiagnosticAt = new Map<string, number>()
  private readonly logWindowMs = 12_000
  private readonly slowLogThresholdMs = 1_500
  private readonly indexLogBucket = this.createLogBucket()
  private readonly removeLogBucket = this.createLogBucket()
  private readonly removeByProviderLogBucket = this.createLogBucket()

  /** AIMD adaptive batch scheduler for indexItems — persists across calls. */
  private readonly indexBatchScheduler = new AdaptiveBatchScheduler({
    initialSize: 3,
    maxSize: 20,
    targetMs: 300,
    minSize: 2,
    ssthresh: 12
  })

  /** True if the FTS5 table was dropped and recreated during initialization (schema migration). */
  public didMigrate = false

  constructor(
    private readonly db: LibSQLDatabase<typeof schema>,
    options?: SearchIndexServiceOptions
  ) {
    this.directMode = options?.directMode ?? false
  }

  async warmup(): Promise<void> {
    await this.scheduleWrite('search-index.warmup', () => this.ensureInitialized())
  }

  /**
   * Schedule a write operation: in directMode, execute immediately;
   * otherwise go through DbWriteScheduler + SQLite retry.
   */
  private async scheduleWrite<T>(label: string, operation: () => Promise<T>): Promise<T> {
    if (this.directMode) {
      return withSqliteRetry(operation, { label })
    }
    return dbWriteScheduler.schedule(label, () => withSqliteRetry(operation, { label }))
  }

  private createLogBucket(): SearchIndexLogBucket {
    return {
      count: 0,
      items: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
      windowStartedAt: Date.now(),
      flushTimer: null
    }
  }

  private getLogBucket(action: SearchIndexLogAction): SearchIndexLogBucket {
    switch (action) {
      case 'index':
        return this.indexLogBucket
      case 'remove':
        return this.removeLogBucket
      case 'removeByProvider':
        return this.removeByProviderLogBucket
    }
  }

  private getLogLabel(action: SearchIndexLogAction): string {
    switch (action) {
      case 'index':
        return 'Indexed'
      case 'remove':
        return 'Removed'
      case 'removeByProvider':
        return 'removeByProvider'
    }
  }

  private flushLogBucket(action: SearchIndexLogAction): void {
    const bucket = this.getLogBucket(action)
    if (bucket.count === 0) {
      return
    }
    if (bucket.flushTimer) {
      clearTimeout(bucket.flushTimer)
      bucket.flushTimer = null
    }
    const windowMs = Math.max(1, Date.now() - bucket.windowStartedAt)
    const avgMs = bucket.totalDurationMs / Math.max(1, bucket.count)
    const avgItems = bucket.items / Math.max(1, bucket.count)
    console.debug(
      `[SearchIndexService] ${this.getLogLabel(action)} summary calls=${bucket.count} items=${
        bucket.items
      } avgItems=${avgItems.toFixed(1)} avgMs=${avgMs.toFixed(0)} maxMs=${bucket.maxDurationMs.toFixed(
        0
      )} windowMs=${windowMs}`
    )
    bucket.count = 0
    bucket.items = 0
    bucket.totalDurationMs = 0
    bucket.maxDurationMs = 0
    bucket.windowStartedAt = Date.now()
  }

  private scheduleLogFlush(action: SearchIndexLogAction): void {
    const bucket = this.getLogBucket(action)
    if (bucket.flushTimer) {
      return
    }
    const elapsed = Date.now() - bucket.windowStartedAt
    const delay = Math.max(0, this.logWindowMs - elapsed)
    bucket.flushTimer = setTimeout(() => {
      bucket.flushTimer = null
      this.flushLogBucket(action)
    }, delay)
    if (typeof bucket.flushTimer.unref === 'function') {
      bucket.flushTimer.unref()
    }
  }

  private recordOperationLog(
    action: SearchIndexLogAction,
    items: number,
    durationMs: number,
    extra?: string
  ): void {
    const bucket = this.getLogBucket(action)
    const now = Date.now()
    if (bucket.count === 0) {
      bucket.windowStartedAt = now
    }
    bucket.count += 1
    bucket.items += items
    bucket.totalDurationMs += durationMs
    bucket.maxDurationMs = Math.max(bucket.maxDurationMs, durationMs)

    if (durationMs >= this.slowLogThresholdMs) {
      const suffix = extra ? ` ${extra}` : ''
      console.debug(
        `[SearchIndexService] ${this.getLogLabel(action)} slow batch items=${items} duration=${durationMs.toFixed(
          0
        )}ms${suffix}`
      )
    }

    if (now - bucket.windowStartedAt >= this.logWindowMs) {
      this.flushLogBucket(action)
      return
    }
    this.scheduleLogFlush(action)
  }

  async indexItems(items: SearchIndexItem[]): Promise<void> {
    if (items.length === 0) return
    const start = performance.now()

    await this.scheduleWrite('search-index.ensure', () => this.ensureInitialized())

    // Prepare documents in small groups, yielding between each to avoid
    // long main-thread stalls from pinyin / n-gram computation.
    const preparedDocs: PreparedIndexDocument[] = []
    for (let i = 0; i < items.length; i++) {
      preparedDocs.push(await this.prepareDocument(items[i]))
      // Yield every 3 documents: prepareDocument is CPU-intensive (pinyin,
      // n-grams) — in directMode (worker), skip yielding for throughput.
      if (!this.directMode && (i + 1) % 3 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
    }

    // Adaptive batching: use AIMD scheduler to find the optimal batch size
    // that keeps each transaction close to the target duration (~500ms).
    let i = 0
    while (i < preparedDocs.length) {
      const batchSize = this.indexBatchScheduler.currentSize
      const batch = preparedDocs.slice(i, i + batchSize)
      i += batch.length

      if (!this.directMode) {
        await dbWriteScheduler.waitForCapacity(6)
      }
      const batchStart = performance.now()
      await this.scheduleWrite('search-index.indexBatch', () =>
        this.db.transaction(async (tx) => {
          for (const doc of batch) {
            await this.applyDocument(tx, doc)
          }
        })
      )
      const elapsed = performance.now() - batchStart
      this.indexBatchScheduler.recordDuration(elapsed)

      // Pacing delay: sleep proportional to batch duration to prevent
      // cascading event loop stalls from rapid FTS5 transactions.
      if (!this.directMode) {
        const pacingMs = Math.max(80, Math.round(elapsed * 0.75))
        await new Promise<void>((resolve) => setTimeout(resolve, pacingMs))
      } else {
        // In directMode (worker thread): yield briefly between batches to
        // release the SQLite write lock.  This allows main-thread services
        // (UsageSummaryService, etc.) to acquire the lock between worker
        // transactions, preventing SQLITE_BUSY (code 5) errors.
        const yieldMs = Math.max(20, Math.round(elapsed * 0.1))
        await new Promise<void>((resolve) => setTimeout(resolve, yieldMs))
      }
    }

    this.recordOperationLog('index', items.length, performance.now() - start)
  }

  async removeItems(itemIds: string[]): Promise<void> {
    if (itemIds.length === 0) return
    const start = performance.now()

    // Batch removals — same smaller batch size as indexItems to keep
    // FTS5 DELETE transactions short and event-loop-friendly.
    const BATCH_SIZE = 10
    for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
      const batch = itemIds.slice(i, i + BATCH_SIZE)
      await this.scheduleWrite('search-index.removeBatch', async () => {
        await this.ensureInitialized()
        await this.db.transaction(async (tx) => {
          for (const itemId of batch) {
            await tx.run(sql`DELETE FROM search_index WHERE item_id = ${itemId}`)
            await tx.delete(schema.keywordMappings).where(eq(schema.keywordMappings.itemId, itemId))
            await tx.delete(schema.searchIndexMeta).where(eq(schema.searchIndexMeta.itemId, itemId))
          }
        })
      })
    }
    this.recordOperationLog('remove', itemIds.length, performance.now() - start)
  }

  /**
   * Returns the number of rows in the FTS5 index for a given provider.
   * Useful for detecting an empty index after a failed migration.
   */
  async countByProvider(providerId: string): Promise<number> {
    await this.ensureInitialized()
    const rows = await this.db.all<{ cnt: number }>(
      sql`SELECT count(*) as cnt FROM search_index WHERE provider = ${providerId}`
    )
    return rows[0]?.cnt ?? 0
  }

  async removeByProvider(providerId: string): Promise<void> {
    await this.ensureInitialized()
    const rows = await this.db.all<{ item_id: string }>(
      sql`SELECT item_id FROM search_index WHERE provider = ${providerId}`
    )
    const itemIds = rows.map((row) => row.item_id)
    if (itemIds.length === 0) return
    const start = performance.now()
    await this.removeItems(itemIds)
    this.recordOperationLog(
      'removeByProvider',
      itemIds.length,
      performance.now() - start,
      `provider=${providerId}`
    )
  }

  async search(
    providerId: string,
    ftsQuery: string,
    limit = 50
  ): Promise<Array<{ itemId: string; score: number }>> {
    searchLogger.logSearchPhase('FTS Search', `Provider: ${providerId}, Query: "${ftsQuery}"`)
    searchLogger.indexSearchStart(providerId, ftsQuery, limit)
    const start = performance.now()
    await this.ensureInitialized()
    const trimmed = ftsQuery.trim()
    if (!trimmed) {
      searchLogger.indexSearchEmpty()
      return []
    }

    // Build optimized FTS5 query based on query length
    const ftsMatchExpr = this.buildFtsMatchExpr(trimmed)

    searchLogger.indexSearchExecuting()
    const rows = await this.db.all<{ item_id: string; score: number }>(
      sql`SELECT item_id, bm25(search_index) as score FROM search_index WHERE provider = ${providerId} AND search_index MATCH ${ftsMatchExpr} ORDER BY score LIMIT ${limit}`
    )

    const results = rows.map((row) => ({ itemId: row.item_id, score: row.score }))
    searchLogger.indexSearchComplete(results.length, performance.now() - start)

    if (results.length === 0 && this.shouldEmitZeroResultDiagnostic(providerId)) {
      // Diagnostic: check if FTS5 table has any data at all for this provider
      const totalRows = await this.db.all<{ cnt: number }>(
        sql`SELECT count(*) as cnt FROM search_index WHERE provider = ${providerId}`
      )
      console.warn(
        `[SearchIndexService] search("${ftsMatchExpr}") returned 0 results. FTS5 total rows for provider "${providerId}": ${totalRows[0]?.cnt ?? 0}`
      )
    }

    console.debug(
      `[SearchIndexService] search(provider=${providerId}, limit=${limit}) returned ${results.length} matches in ${(
        performance.now() - start
      ).toFixed(0)}ms`
    )
    return results
  }

  private shouldEmitZeroResultDiagnostic(providerId: string): boolean {
    const now = Date.now()
    const lastAt = this.zeroResultDiagnosticAt.get(providerId) ?? 0
    if (now - lastAt < ZERO_RESULT_DIAGNOSTIC_THROTTLE_MS) {
      return false
    }
    this.zeroResultDiagnosticAt.set(providerId, now)
    return true
  }

  /**
   * Batch lookup keywords in keywordMappings table.
   * Returns a map of keyword -> matching itemIds with priorities.
   * Uses WHERE IN (...) for efficiency instead of multiple single queries.
   */
  async lookupByKeywords(
    providerId: string,
    keywords: string[],
    limit = 200
  ): Promise<Map<string, Array<{ itemId: string; priority: number }>>> {
    if (keywords.length === 0) return new Map()
    await this.ensureInitialized()

    const rows = await this.db
      .select({
        keyword: schema.keywordMappings.keyword,
        itemId: schema.keywordMappings.itemId,
        priority: schema.keywordMappings.priority
      })
      .from(schema.keywordMappings)
      .where(
        and(
          inArray(schema.keywordMappings.keyword, keywords),
          eq(schema.keywordMappings.providerId, providerId)
        )
      )
      .limit(limit)

    const result = new Map<string, Array<{ itemId: string; priority: number }>>()
    for (const row of rows) {
      const existing = result.get(row.keyword)
      if (existing) {
        existing.push({ itemId: row.itemId, priority: row.priority })
      } else {
        result.set(row.keyword, [{ itemId: row.itemId, priority: row.priority }])
      }
    }
    return result
  }

  /**
   * Prefix lookup: find items whose keywords start with the given prefix.
   * Useful for single-character or short queries (e.g. "f" matches "feishu", "fs").
   * Uses SQL LIKE for prefix matching on the keyword column.
   */
  async lookupByKeywordPrefix(
    providerId: string,
    prefix: string,
    limit = 200
  ): Promise<Array<{ itemId: string; keyword: string; priority: number }>> {
    if (!prefix) return []
    await this.ensureInitialized()

    const likePattern = `${prefix}%`
    const rows = await this.db.all<{ item_id: string; keyword: string; priority: number }>(
      sql`SELECT km.item_id, km.keyword, km.priority
          FROM keyword_mappings km
          WHERE km.keyword LIKE ${likePattern}
            AND km.provider_id = ${providerId}
            AND km.keyword NOT LIKE 'ng:%'
          LIMIT ${limit}`
    )

    return rows.map((row) => ({
      itemId: row.item_id,
      keyword: row.keyword,
      priority: row.priority
    }))
  }

  /**
   * Subsequence matching: find items whose keywords contain the query
   * as a character subsequence (e.g. "nte" matches "netease").
   * Loads keywords from DB and filters in memory for flexibility.
   */
  async lookupBySubsequence(
    providerId: string,
    query: string,
    limit = 100,
    scanLimit = 2000
  ): Promise<Array<{ itemId: string; keyword: string; priority: number }>> {
    if (!query || query.length < 2) return []
    await this.ensureInitialized()

    const lowerQuery = query.toLowerCase()
    const effectiveScanLimit = Math.max(
      limit,
      Number.isFinite(scanLimit) ? Math.max(0, Math.floor(scanLimit)) : 2000
    )

    // Load non-ngram keywords for this provider
    const rows = await this.db.all<{ item_id: string; keyword: string; priority: number }>(
      sql`SELECT item_id, keyword, priority
          FROM keyword_mappings
          WHERE provider_id = ${providerId}
            AND keyword NOT LIKE 'ng:%'
            AND length(keyword) >= ${lowerQuery.length}
          LIMIT ${effectiveScanLimit}`
    )

    const matches: Array<{ itemId: string; keyword: string; priority: number; score: number }> = []
    for (const row of rows) {
      const score = subsequenceScore(lowerQuery, row.keyword)
      if (score > 0) {
        matches.push({
          itemId: row.item_id,
          keyword: row.keyword,
          priority: row.priority,
          score
        })
      }
    }

    // Sort by score descending, take top results
    matches.sort((a, b) => b.score - a.score)
    return matches.slice(0, limit).map(({ itemId, keyword, priority }) => ({
      itemId,
      keyword,
      priority
    }))
  }

  /**
   * N-gram fuzzy recall: find candidate items by matching query n-grams
   * against indexed n-grams in keywordMappings.
   * Returns itemIds ranked by n-gram overlap count.
   */
  async lookupByNgrams(
    providerId: string,
    query: string,
    limit = 50
  ): Promise<Array<{ itemId: string; overlapCount: number }>> {
    const queryNgrams = generateNgrams(query.toLowerCase(), 2)
    if (queryNgrams.length === 0) return []

    await this.ensureInitialized()

    const rows = await this.db
      .select({
        itemId: schema.keywordMappings.itemId,
        count: sql<number>`count(DISTINCT ${schema.keywordMappings.keyword})`
      })
      .from(schema.keywordMappings)
      .where(
        and(
          inArray(schema.keywordMappings.keyword, queryNgrams),
          eq(schema.keywordMappings.providerId, providerId)
        )
      )
      .groupBy(schema.keywordMappings.itemId)
      .orderBy(sql`count(DISTINCT ${schema.keywordMappings.keyword}) DESC`)
      .limit(limit)

    // Filter: require at least 40% n-gram overlap for relevance
    const minOverlap = Math.max(1, Math.floor(queryNgrams.length * 0.4))
    return rows
      .filter((row) => row.count >= minOverlap)
      .map((row) => ({ itemId: row.itemId, overlapCount: row.count }))
  }

  /**
   * Preload pinyin-pro module eagerly to avoid cold-start latency on first search.
   */
  async preheatPinyin(): Promise<void> {
    try {
      await this.loadPinyinModule()
    } catch {
      // Swallow - non-critical
    }
  }

  /**
   * Build an optimized FTS5 MATCH expression based on query characteristics.
   * All tokens get prefix matching (*) for better recall.
   * - Single short query (≤2 chars): simple prefix search
   * - Multi-word queries (>3 words): NEAR grouping for proximity relevance
   * - Default (1-3 words): prefix search with implicit AND via FTS5
   */
  private buildFtsMatchExpr(query: string): string {
    const words = query.split(WORD_SPLIT_REGEX).filter((w) => w.length > 0)
    if (words.length === 0) return query

    if (words.length === 1) {
      // Single word: prefix matching
      return `${words[0]}*`
    }

    if (words.length > 3) {
      // Long multi-word query: use NEAR for proximity relevance with prefix
      const escaped = words.map((w) => `"${w}"`).join(' ')
      return `NEAR(${escaped}, 10)`
    }

    // 2-3 words: prefix each token for better recall
    return words.map((w) => `${w}*`).join(' ')
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return
    const initStart = performance.now()
    await this.createSearchIndexTable()
    await this.createFileFtsTable()
    await this.createSearchIndexMetaTable()
    await this.createKeywordMappingIndexes()

    this.initialized = true
    console.log(
      `[SearchIndexService] Initialization completed in ${(performance.now() - initStart).toFixed(
        0
      )}ms`
    )
  }

  private async createSearchIndexTable(): Promise<void> {
    // Check if the existing table has the content column (critical for content search).
    const tableInfo = await this.db.all<{ name: string }>(
      sql`SELECT name FROM pragma_table_xinfo('search_index')`
    )
    const hasContent = tableInfo.some((col) => col.name === 'content')

    if (tableInfo.length > 0 && !hasContent) {
      // Table exists but lacks content column - must recreate for content search
      await this.db.run(sql`DROP TABLE IF EXISTS search_index`)
      this.didMigrate = true
    }

    await this.db.run(sql`CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
      item_id UNINDEXED,
      provider UNINDEXED,
      type UNINDEXED,
      title,
      title_compact,
      keywords,
      tags,
      path,
      content,
      tokenize = 'unicode61 remove_diacritics 2'
    )`)
  }

  private async createFileFtsTable(): Promise<void> {
    await this.db.run(sql`CREATE VIRTUAL TABLE IF NOT EXISTS file_fts USING fts5(
      name,
      content='files',
      content_rowid='id',
      tokenize = 'porter unicode61'
    )`)
  }

  private async createSearchIndexMetaTable(): Promise<void> {
    await this.db.run(sql`CREATE TABLE IF NOT EXISTS search_index_meta (
      provider_id text NOT NULL,
      item_id text NOT NULL,
      keyword_hash text NOT NULL,
      updated_at integer DEFAULT (strftime('%s', 'now')) NOT NULL,
      PRIMARY KEY(provider_id, item_id)
    )`)
    await this.db.run(
      sql`CREATE INDEX IF NOT EXISTS idx_search_index_meta_updated_at ON search_index_meta (updated_at)`
    )
  }

  private async createKeywordMappingIndexes(): Promise<void> {
    await this.db.run(
      sql`CREATE INDEX IF NOT EXISTS idx_keyword_mappings_provider_keyword ON keyword_mappings(provider_id, keyword)`
    )
    await this.db.run(
      sql`CREATE INDEX IF NOT EXISTS idx_keyword_mappings_provider_item ON keyword_mappings(provider_id, item_id)`
    )
    await this.db.run(
      sql`CREATE INDEX IF NOT EXISTS idx_keyword_mappings_provider_item_keyword ON keyword_mappings(provider_id, item_id, keyword)`
    )
  }

  private async applyDocument(tx: SearchIndexWriteTx, doc: PreparedIndexDocument): Promise<void> {
    const shouldUpdateKeywords = await this.shouldUpdateKeywordMappings(tx, doc)

    await tx.run(sql`DELETE FROM search_index WHERE item_id = ${doc.itemId}`)

    await tx.run(sql`
      INSERT INTO search_index (
        item_id,
        provider,
        type,
        title,
        title_compact,
        keywords,
        tags,
        path,
        content
      ) VALUES (
        ${doc.itemId},
        ${doc.providerId},
        ${doc.type},
        ${doc.title},
        ${doc.titleCompact},
        ${doc.keywords},
        ${doc.tags},
        ${doc.path},
        ${doc.content}
      )
    `)

    if (shouldUpdateKeywords) {
      await this.applyKeywordMappingsDelta(tx, doc)
    }

    await this.upsertSearchIndexMeta(tx, doc)
  }

  private async shouldUpdateKeywordMappings(
    tx: SearchIndexWriteTx,
    doc: PreparedIndexDocument
  ): Promise<boolean> {
    const existingMeta = await tx
      .select({ keywordHash: schema.searchIndexMeta.keywordHash })
      .from(schema.searchIndexMeta)
      .where(
        and(
          eq(schema.searchIndexMeta.providerId, doc.providerId),
          eq(schema.searchIndexMeta.itemId, doc.itemId)
        )
      )
      .limit(1)

    return existingMeta[0]?.keywordHash !== doc.keywordHash
  }

  private async applyKeywordMappingsDelta(
    tx: SearchIndexWriteTx,
    doc: PreparedIndexDocument
  ): Promise<void> {
    const existingRows = await tx
      .select({
        keyword: schema.keywordMappings.keyword,
        priority: schema.keywordMappings.priority
      })
      .from(schema.keywordMappings)
      .where(
        and(
          eq(schema.keywordMappings.providerId, doc.providerId),
          eq(schema.keywordMappings.itemId, doc.itemId)
        )
      )

    const existingMap = new Map<string, number>()
    for (const row of existingRows) {
      const prev = existingMap.get(row.keyword)
      if (prev === undefined || row.priority > prev) {
        existingMap.set(row.keyword, row.priority)
      }
    }

    const nextMap = this.toKeywordPriorityMap(doc.keywordEntries)
    const deleteKeywords: string[] = []
    const rewriteEntries: SearchIndexKeyword[] = []

    for (const [keyword] of existingMap) {
      if (!nextMap.has(keyword)) {
        deleteKeywords.push(keyword)
      }
    }

    for (const [keyword, priority] of nextMap) {
      const existingPriority = existingMap.get(keyword)
      if (existingPriority === undefined || !this.isPriorityEqual(existingPriority, priority)) {
        rewriteEntries.push({ value: keyword, priority })
      }
    }

    if (deleteKeywords.length > 0) {
      await tx
        .delete(schema.keywordMappings)
        .where(
          and(
            eq(schema.keywordMappings.providerId, doc.providerId),
            eq(schema.keywordMappings.itemId, doc.itemId),
            inArray(schema.keywordMappings.keyword, deleteKeywords)
          )
        )
    }

    if (rewriteEntries.length > 0) {
      const rewriteKeywords = rewriteEntries.map((entry) => entry.value)
      await tx
        .delete(schema.keywordMappings)
        .where(
          and(
            eq(schema.keywordMappings.providerId, doc.providerId),
            eq(schema.keywordMappings.itemId, doc.itemId),
            inArray(schema.keywordMappings.keyword, rewriteKeywords)
          )
        )

      await tx.insert(schema.keywordMappings).values(
        rewriteEntries.map(({ value, priority }) => ({
          keyword: value,
          itemId: doc.itemId,
          providerId: doc.providerId,
          priority: priority ?? 1
        }))
      )
    }
  }

  private async upsertSearchIndexMeta(
    tx: SearchIndexWriteTx,
    doc: PreparedIndexDocument
  ): Promise<void> {
    await tx
      .insert(schema.searchIndexMeta)
      .values({
        providerId: doc.providerId,
        itemId: doc.itemId,
        keywordHash: doc.keywordHash,
        updatedAt: new Date()
      })
      .onConflictDoUpdate({
        target: [schema.searchIndexMeta.providerId, schema.searchIndexMeta.itemId],
        set: {
          keywordHash: doc.keywordHash,
          updatedAt: new Date()
        }
      })
  }

  private toKeywordPriorityMap(entries: SearchIndexKeyword[]): Map<string, number> {
    const map = new Map<string, number>()
    for (const entry of entries) {
      const value = entry.value.trim().toLowerCase()
      if (!value) continue
      const priority = entry.priority ?? 1
      const existing = map.get(value)
      if (existing === undefined || priority > existing) {
        map.set(value, priority)
      }
    }
    return map
  }

  private isPriorityEqual(left: number, right: number): boolean {
    return Math.abs(left - right) <= PRIORITY_EPSILON
  }

  private buildKeywordHash(entries: SearchIndexKeyword[]): string {
    const normalized = Array.from(this.toKeywordPriorityMap(entries).entries()).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0
    )
    const raw = normalized
      .map(([keyword, priority]) => `${keyword}:${priority.toFixed(4)}`)
      .join('\n')
    return createHash('sha1').update(raw).digest('hex')
  }

  private async prepareDocument(item: SearchIndexItem): Promise<PreparedIndexDocument> {
    const keywordMap = new Map<string, number>()

    const titleSource = item.displayName || item.name
    const normalizedTitle = titleSource.toLowerCase().trim()

    this.appendKeyword(keywordMap, normalizedTitle, 1.25)

    for (const token of this.splitWords(normalizedTitle)) {
      this.appendKeyword(keywordMap, token, 1.0)
    }

    const nameCompact = normalizedTitle.replace(/\s+/g, '')
    if (nameCompact.length > 1) {
      this.appendKeyword(keywordMap, nameCompact, 1.0)
    }

    const acronym = this.generateAcronym(titleSource)
    if (acronym) {
      this.appendKeyword(keywordMap, acronym, 1.35)
    }

    // 为所有文件名生成拼音索引（不仅限于中文）
    if (CHINESE_CHAR_REGEX.test(titleSource)) {
      // 中文：生成完整拼音和首字母
      const { full, first } = await this.generatePinyin(titleSource)
      if (full) this.appendKeyword(keywordMap, full, 1.15)
      if (first) this.appendKeyword(keywordMap, first, 1.2)
    } else {
      // 英文：生成首字母缩写作为拼音（如果还没有生成过）
      // 这样可以支持通过拼音首字母搜索英文文件名
      // 例如 "My Document" 可以通过 "md" 搜索到
      if (!acronym || acronym.length > 1) {
        // 如果acronym已经存在且长度>1，说明是多词缩写，已经添加过了
        // 否则，为单词文件名生成首字母
        const firstLetter = normalizedTitle.charAt(0)
        if (firstLetter && /[a-z0-9]/.test(firstLetter)) {
          this.appendKeyword(keywordMap, firstLetter, 1.1)
        }
      }
    }

    const secondaryName = item.name.toLowerCase().trim()
    if (secondaryName && secondaryName !== normalizedTitle) {
      this.appendKeyword(keywordMap, secondaryName, 1.1)
      for (const token of this.splitWords(secondaryName)) {
        this.appendKeyword(keywordMap, token, 0.95)
      }
    }

    if (item.description) {
      const descLower = item.description.toLowerCase().trim()
      if (descLower) {
        for (const token of this.splitWords(descLower)) {
          this.appendKeyword(keywordMap, token, 0.9)
        }
      }
    }

    if (item.path) {
      const pathLower = item.path.toLowerCase()
      const pathTokens = this.splitPath(pathLower)
      for (const token of pathTokens) {
        this.appendKeyword(keywordMap, token, 1.0)
      }
      // Also index the full path as a single keyword for path-fragment searches
      this.appendKeyword(keywordMap, pathLower, 0.7)
    }

    if (item.extension) {
      const ext = item.extension.trim().toLowerCase()
      if (ext) {
        this.appendKeyword(keywordMap, ext, 1.05)
        // Also add the extension without the leading dot (e.g. "txt" for ".txt")
        // so that plain searches like "txt" can match via keyword_mappings
        const extNoDot = ext.replace(/^\./, '')
        if (extNoDot && extNoDot !== ext) {
          this.appendKeyword(keywordMap, extNoDot, 1.0)
        }
      }
    }

    if (item.aliases) {
      for (const alias of item.aliases) {
        const { value, priority } = alias
        const normalized = value.trim().toLowerCase()
        if (!normalized) continue
        this.appendKeyword(keywordMap, normalized, priority ?? 1.4)
      }
    }

    if (item.keywords) {
      for (const keyword of item.keywords) {
        const { value, priority } = keyword
        const normalized = value.trim().toLowerCase()
        if (!normalized) continue
        this.appendKeyword(keywordMap, normalized, priority ?? 1.1)
      }
    }

    const keywordEntries = Array.from(keywordMap.entries())
      .map(([value, priority]) => ({ value, priority }))
      .filter(({ value }) => this.isKeywordValid(value))

    // Generate n-gram entries with hard limits to avoid write amplification.
    // We prefer higher-priority keywords (title/alias-like terms) as n-gram sources.
    const ngramSources = keywordEntries
      .filter(
        ({ value, priority }) =>
          priority >= NGRAM_SOURCE_MIN_PRIORITY &&
          value.length >= NGRAM_MIN_WORD_LENGTH &&
          !value.startsWith(NGRAM_PREFIX)
      )
      .sort((left, right) => {
        if (right.priority !== left.priority) return right.priority - left.priority
        return left.value < right.value ? -1 : left.value > right.value ? 1 : 0
      })
      .slice(0, NGRAM_MAX_SOURCE_KEYWORDS)

    const ngramSet = new Set<string>()
    for (const { value } of ngramSources) {
      for (const ngram of generateNgrams(value, 2)) {
        ngramSet.add(ngram)
        if (ngramSet.size >= NGRAM_MAX_ENTRIES_PER_ITEM) {
          break
        }
      }
      if (ngramSet.size >= NGRAM_MAX_ENTRIES_PER_ITEM) {
        break
      }
    }
    const ngramEntries: SearchIndexKeyword[] = Array.from(ngramSet).map((ng) => ({
      value: ng,
      priority: 0.5
    }))

    // Combine regular keywords with n-gram entries for storage in keywordMappings
    const allKeywordEntries = [...keywordEntries, ...ngramEntries]

    const tags = (item.tags || []).map((tag) => tag.toLowerCase()).join(' ')
    const keywordField = keywordEntries.map((entry) => entry.value).join(' ')
    const keywordHash = this.buildKeywordHash(allKeywordEntries)

    return {
      itemId: item.itemId,
      providerId: item.providerId,
      type: item.type,
      title: titleSource,
      titleCompact: nameCompact,
      keywords: keywordField,
      tags,
      path: item.path?.toLowerCase() ?? '',
      content: item.content?.toLowerCase() ?? '',
      keywordEntries: allKeywordEntries,
      keywordHash
    }
  }

  private appendKeyword(store: Map<string, number>, keyword: string, priority: number): void {
    const normalized = keyword.trim().toLowerCase()
    if (!normalized) return
    const existing = store.get(normalized) ?? 0
    if (priority > existing) {
      store.set(normalized, priority)
    }
  }

  private splitWords(text: string): string[] {
    return text
      .split(WORD_SPLIT_REGEX)
      .map((token) => token.trim())
      .filter((token) => token.length > 1)
  }

  private splitPath(path?: string): string[] {
    if (!path) return []
    return path
      .split(PATH_SPLIT_REGEX)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 1)
  }

  private generateAcronym(text: string): string {
    const words = text
      .split(WORD_SPLIT_REGEX)
      .map((word) => word.trim())
      .filter((word) => word.length > 0)

    if (words.length <= 1) return ''

    return words.map((word) => word.charAt(0).toLowerCase()).join('')
  }

  private isKeywordValid(keyword: string): boolean {
    if (keyword.length === 0) return false
    if (keyword.length === 1) {
      return /[a-z0-9\u4E00-\u9FA5]/.test(keyword)
    }
    return !INVALID_KEYWORD_REGEX.test(keyword)
  }

  private async generatePinyin(text: string): Promise<{ full: string; first: string }> {
    const module = await this.loadPinyinModule()
    const full = module.pinyin(text, { toneType: 'none' }).replace(/\s/g, '').toLowerCase()
    const first = module
      .pinyin(text, { pattern: 'first', toneType: 'none' })
      .replace(/\s/g, '')
      .toLowerCase()

    return { full, first }
  }

  /**
   * Eagerly preload the pinyin-pro module to avoid cold-start latency
   * on the first search. Call this during initialization.
   */
  preloadPinyin(): void {
    if (this.pinyinModule || this.pinyinPromise) return
    const start = performance.now()
    this.pinyinPromise = import('pinyin-pro')
    this.pinyinPromise
      .then((mod) => {
        this.pinyinModule = mod
        console.log(
          `[SearchIndexService] pinyin-pro preloaded in ${(performance.now() - start).toFixed(0)}ms`
        )
      })
      .catch(() => {
        /* swallow; caller handles */
      })
  }

  private async loadPinyinModule(): Promise<typeof import('pinyin-pro')> {
    if (this.pinyinModule) return this.pinyinModule
    if (!this.pinyinPromise) {
      const start = performance.now()
      this.pinyinPromise = import('pinyin-pro')
      this.pinyinPromise
        .then(() => {
          console.log(
            `[SearchIndexService] pinyin-pro module loaded in ${(performance.now() - start).toFixed(
              0
            )}ms`
          )
        })
        .catch(() => {
          /* swallow log; caller handles */
        })
    }
    this.pinyinModule = await this.pinyinPromise
    return this.pinyinModule
  }
}

/**
 * Score how well `query` matches `target` as a character subsequence.
 * Returns 0 if not a subsequence, otherwise a score in (0, 1].
 * Prefers: consecutive matches, matches at word boundaries, shorter targets.
 * E.g. "nte" in "netease" → matches n(0) t(2) e(3), score > 0
 */
function subsequenceScore(query: string, target: string): number {
  const qLen = query.length
  const tLen = target.length
  if (qLen === 0 || tLen === 0 || qLen > tLen) return 0

  let qi = 0
  let consecutive = 0
  let maxConsecutive = 0

  for (let ti = 0; ti < tLen && qi < qLen; ti++) {
    if (target[ti] === query[qi]) {
      qi++
      consecutive++
      if (consecutive > maxConsecutive) maxConsecutive = consecutive
    } else {
      consecutive = 0
    }
  }

  if (qi < qLen) return 0 // not a subsequence

  // Score: ratio of matched chars + bonus for consecutive runs + penalty for target length
  const coverage = qLen / tLen
  const consecutiveBonus = maxConsecutive / qLen
  return coverage * 0.5 + consecutiveBonus * 0.5
}
