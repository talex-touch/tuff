import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { createHash } from 'node:crypto'
import { performance } from 'node:perf_hooks'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import * as schema from '../../../db/schema'
import { withSqliteRetry } from '../../../db/sqlite-retry'
import { createLogger } from '../../../utils/logger'
import { AdaptiveBatchScheduler } from './adaptive-batch-scheduler'

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
const SUBSEQUENCE_SCAN_LIMIT_DEFAULT = 2000
const SUBSEQUENCE_SCAN_LIMIT_MAX = 2000
const SUBSEQUENCE_LIKE_ESCAPE_CHAR = '\\'
const SQLITE_LIKE_WILDCARD_REGEX = /[%_\\]/g
const searchIndexLog = createLogger('SearchIndex')

export interface SearchIndexRuntimeLogger {
  logSearchPhase: (phase: string, detail?: string) => void
  indexSearchStart: (providerId: string, query: string, limit: number) => void
  indexSearchEmpty: () => void
  indexSearchExecuting: () => void
  indexSearchComplete: (resultCount: number, durationMs: number) => void
}

export const noopSearchIndexRuntimeLogger: SearchIndexRuntimeLogger = {
  logSearchPhase: () => {},
  indexSearchStart: () => {},
  indexSearchEmpty: () => {},
  indexSearchExecuting: () => {},
  indexSearchComplete: () => {}
}

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

export interface SearchIndexProviderReplacementSummary {
  removedItems: number
  indexedItems: number
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

interface StagedIndexDocumentRow {
  sequence: number
  document: string
}

interface ProviderReplacementOutcomeRow {
  removedItems: number
  indexedItems: number
}

type SearchIndexWriteTx = Pick<
  LibSQLDatabase<typeof schema>,
  'run' | 'all' | 'delete' | 'insert' | 'select'
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

interface SearchIndexColumnInfo {
  name: string
}

export type SearchIndexInitializationMode = 'writer' | 'reader'

export interface SearchIndexReadinessGate {
  waitUntilReady(): Promise<void>
}

export interface SearchIndexServiceOptions {
  /** Bypass the main-thread write scheduler on the dedicated writer thread. */
  directMode?: boolean
  logger?: SearchIndexRuntimeLogger
  initializationMode?: SearchIndexInitializationMode
  readiness?: SearchIndexReadinessGate
}

export class SearchIndexService {
  private initialized = false
  private initializationPromise: Promise<void> | null = null
  private pinyinModule: typeof import('pinyin-pro') | null = null
  private pinyinPromise: Promise<typeof import('pinyin-pro')> | null = null
  private readonly directMode: boolean
  private readonly runtimeLogger: SearchIndexRuntimeLogger
  private readonly initializationMode: SearchIndexInitializationMode
  private readonly readiness?: SearchIndexReadinessGate
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
    this.runtimeLogger = options?.logger ?? noopSearchIndexRuntimeLogger
    this.initializationMode = options?.initializationMode ?? 'writer'
    this.readiness = options?.readiness
  }

  async warmup(): Promise<void> {
    if (this.initializationMode === 'reader') {
      await this.ensureInitialized()
      return
    }
    await this.scheduleWrite('search-index.warmup', () => this.ensureInitialized())
  }

  async waitUntilReadable(): Promise<void> {
    await this.ensureInitialized()
    await this.db.all(sql`SELECT item_id FROM search_index LIMIT 1`)
  }

  async repair(): Promise<void> {
    if (this.initializationMode !== 'writer') {
      throw new Error('SEARCH_INDEX_REPAIR_REQUIRES_WRITER')
    }
    await this.scheduleWrite('search-index.repair', async () => {
      await this.repairSearchIndexFtsTables()
      this.didMigrate = true
      this.initialized = false
      this.initializationPromise = null
      await this.ensureInitialized()
    })
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
    searchIndexLog.debug(`${this.getLogLabel(action)} summary`, {
      meta: {
        action: this.getLogLabel(action),
        calls: bucket.count,
        items: bucket.items,
        avgItems: Number(avgItems.toFixed(1)),
        avgMs: Math.round(avgMs),
        maxMs: Math.round(bucket.maxDurationMs),
        windowMs
      }
    })
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
      searchIndexLog.debug(`${this.getLogLabel(action)} slow batch`, {
        meta: {
          action: this.getLogLabel(action),
          items,
          durationMs: Math.round(durationMs),
          extra
        }
      })
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

    const preparedDocs = await this.prepareDocuments(items)

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

  async applyProviderItems(
    providerId: string,
    items: SearchIndexItem[],
    legacyItemIds: readonly string[] = []
  ): Promise<SearchIndexProviderReplacementSummary> {
    if (items.some((item) => item.providerId !== providerId)) {
      throw new Error(`SEARCH_INDEX_PROVIDER_MISMATCH:${providerId}`)
    }
    const currentItemIds = new Set(items.map((item) => item.itemId))
    const retiredItemIds = [...new Set(legacyItemIds)].filter(
      (itemId) => itemId.length > 0 && !currentItemIds.has(itemId)
    )
    const start = performance.now()
    await this.scheduleWrite('search-index.ensure', () => this.ensureInitialized())
    const preparedDocs = await this.prepareDocuments(items)
    const removedItems = await this.scheduleWrite('search-index.applyProviderItems', () =>
      this.db.transaction(async (tx) => {
        let removed = 0
        for (const itemId of retiredItemIds) {
          const result = await tx.run(
            sql`DELETE FROM search_index WHERE provider = ${providerId} AND item_id = ${itemId}`
          )
          removed += Number(result.rowsAffected ?? 0)
          await tx
            .delete(schema.keywordMappings)
            .where(
              and(
                eq(schema.keywordMappings.providerId, providerId),
                eq(schema.keywordMappings.itemId, itemId)
              )
            )
          await tx
            .delete(schema.searchIndexMeta)
            .where(
              and(
                eq(schema.searchIndexMeta.providerId, providerId),
                eq(schema.searchIndexMeta.itemId, itemId)
              )
            )
        }
        for (const doc of preparedDocs) await this.applyDocument(tx, doc)
        return removed
      })
    )
    this.recordOperationLog(
      'index',
      preparedDocs.length,
      performance.now() - start,
      `provider=${providerId} retired=${String(removedItems)}`
    )
    return { removedItems, indexedItems: preparedDocs.length }
  }

  async beginProviderReplacement(providerId: string, replacementId: string): Promise<void> {
    if (replacementId.length === 0) {
      throw new Error(`SEARCH_INDEX_REPLACEMENT_ID_REQUIRED:${providerId}`)
    }
    await this.scheduleWrite('search-index.beginProviderReplacement', async () => {
      await this.ensureInitialized()
      await this.db.run(sql`
        DELETE FROM search_index_replacement_outcome
        WHERE provider_id = ${providerId} AND replacement_id <> ${replacementId}
      `)
      const outcome = await this.db.all<ProviderReplacementOutcomeRow>(sql`
        SELECT removed_items AS removedItems, indexed_items AS indexedItems
        FROM search_index_replacement_outcome
        WHERE replacement_id = ${replacementId} AND provider_id = ${providerId}
        LIMIT 1
      `)
      if (outcome.length > 0) return
      await this.db.run(
        sql`DELETE FROM search_index_replacement_stage WHERE provider_id = ${providerId}`
      )
    })
  }

  async stageProviderReplacementItems(
    providerId: string,
    replacementId: string,
    items: SearchIndexItem[]
  ): Promise<number> {
    if (items.length === 0) return 0
    if (items.some((item) => item.providerId !== providerId)) {
      throw new Error(`SEARCH_INDEX_PROVIDER_MISMATCH:${providerId}`)
    }
    const preparedDocs = await this.prepareDocuments(items)
    return await this.scheduleWrite('search-index.stageProviderReplacement', () =>
      this.db.transaction(async (tx) => {
        const outcome = await tx.all<ProviderReplacementOutcomeRow>(sql`
          SELECT removed_items AS removedItems, indexed_items AS indexedItems
          FROM search_index_replacement_outcome
          WHERE replacement_id = ${replacementId} AND provider_id = ${providerId}
          LIMIT 1
        `)
        if (outcome.length > 0) return 0
        for (const doc of preparedDocs) {
          await tx.run(sql`
            INSERT INTO search_index_replacement_stage (replacement_id, provider_id, document)
            VALUES (${replacementId}, ${providerId}, ${JSON.stringify(doc)})
          `)
        }
        return preparedDocs.length
      })
    )
  }

  async commitProviderReplacement(
    providerId: string,
    replacementId: string
  ): Promise<SearchIndexProviderReplacementSummary> {
    const start = performance.now()
    const summary = await this.scheduleWrite('search-index.commitProviderReplacement', () =>
      this.db.transaction(async (tx) => {
        const existing = await tx.all<ProviderReplacementOutcomeRow>(sql`
          SELECT removed_items AS removedItems, indexed_items AS indexedItems
          FROM search_index_replacement_outcome
          WHERE replacement_id = ${replacementId} AND provider_id = ${providerId}
          LIMIT 1
        `)
        if (existing.length > 0) return existing[0]

        const current = await tx.all<{ removedItems: number }>(sql`
          SELECT COUNT(*) AS removedItems
          FROM search_index
          WHERE provider = ${providerId}
        `)
        const removedItems = Number(current[0]?.removedItems ?? 0)
        await tx.run(sql`DELETE FROM search_index WHERE provider = ${providerId}`)
        await tx
          .delete(schema.keywordMappings)
          .where(eq(schema.keywordMappings.providerId, providerId))
        await tx
          .delete(schema.searchIndexMeta)
          .where(eq(schema.searchIndexMeta.providerId, providerId))
        let lastSequence = 0
        let indexedItems = 0
        while (true) {
          const rows = await tx.all<StagedIndexDocumentRow>(sql`
            SELECT sequence, document
            FROM search_index_replacement_stage
            WHERE replacement_id = ${replacementId}
              AND provider_id = ${providerId}
              AND sequence > ${lastSequence}
            ORDER BY sequence
            LIMIT 50
          `)
          if (rows.length === 0) break
          for (const row of rows) {
            const doc = JSON.parse(row.document) as PreparedIndexDocument
            if (doc.providerId !== providerId) {
              throw new Error(`SEARCH_INDEX_STAGED_PROVIDER_MISMATCH:${providerId}`)
            }
            await this.applyDocument(tx, doc)
            indexedItems += 1
            lastSequence = row.sequence
          }
        }
        await tx.run(sql`
          DELETE FROM search_index_replacement_stage
          WHERE replacement_id = ${replacementId} AND provider_id = ${providerId}
        `)
        await tx.run(sql`
          INSERT INTO search_index_replacement_outcome (
            replacement_id, provider_id, removed_items, indexed_items
          ) VALUES (${replacementId}, ${providerId}, ${removedItems}, ${indexedItems})
        `)
        return { removedItems, indexedItems }
      })
    )
    this.recordOperationLog(
      'index',
      summary.indexedItems,
      performance.now() - start,
      `staged-replace provider=${providerId} removed=${String(summary.removedItems)}`
    )
    return summary
  }

  async getProviderReplacementOutcome(
    providerId: string,
    replacementId: string
  ): Promise<SearchIndexProviderReplacementSummary | null> {
    return await this.scheduleWrite('search-index.getProviderReplacementOutcome', async () => {
      await this.ensureInitialized()
      const outcomes = await this.db.all<ProviderReplacementOutcomeRow>(sql`
        SELECT removed_items AS removedItems, indexed_items AS indexedItems
        FROM search_index_replacement_outcome
        WHERE replacement_id = ${replacementId} AND provider_id = ${providerId}
        LIMIT 1
      `)
      return outcomes[0] ?? null
    })
  }

  async abortProviderReplacement(providerId: string, replacementId: string): Promise<void> {
    await this.scheduleWrite('search-index.abortProviderReplacement', async () => {
      await this.db.run(sql`
        DELETE FROM search_index_replacement_stage
        WHERE replacement_id = ${replacementId} AND provider_id = ${providerId}
      `)
    })
  }

  async removeProviderItems(providerId: string, itemIds: string[]): Promise<number> {
    if (itemIds.length === 0) return 0
    const start = performance.now()
    let removedItems = 0

    const BATCH_SIZE = 10
    for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
      const batch = itemIds.slice(i, i + BATCH_SIZE)
      const removedInBatch = await this.scheduleWrite(
        'search-index.removeProviderBatch',
        async () => {
          await this.ensureInitialized()
          return await this.db.transaction(async (tx) => {
            let batchRemovedItems = 0
            for (const itemId of batch) {
              const result = await tx.run(
                sql`DELETE FROM search_index WHERE provider = ${providerId} AND item_id = ${itemId}`
              )
              const rowsAffected = Number(result.rowsAffected ?? 0)
              if (rowsAffected <= 0) continue
              await tx
                .delete(schema.keywordMappings)
                .where(
                  and(
                    eq(schema.keywordMappings.providerId, providerId),
                    eq(schema.keywordMappings.itemId, itemId)
                  )
                )
              await tx
                .delete(schema.searchIndexMeta)
                .where(
                  and(
                    eq(schema.searchIndexMeta.providerId, providerId),
                    eq(schema.searchIndexMeta.itemId, itemId)
                  )
                )
              batchRemovedItems += rowsAffected
            }
            return batchRemovedItems
          })
        }
      )
      removedItems += removedInBatch
    }
    this.recordOperationLog(
      'remove',
      removedItems,
      performance.now() - start,
      `provider=${providerId}`
    )
    return removedItems
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

  async removeByProvider(providerId: string): Promise<number> {
    const start = performance.now()
    const removedItems = await this.scheduleWrite('search-index.removeByProvider', async () => {
      await this.ensureInitialized()
      return await this.db.transaction(async (tx) => {
        const result = await tx.run(sql`DELETE FROM search_index WHERE provider = ${providerId}`)
        await tx
          .delete(schema.keywordMappings)
          .where(eq(schema.keywordMappings.providerId, providerId))
        await tx
          .delete(schema.searchIndexMeta)
          .where(eq(schema.searchIndexMeta.providerId, providerId))
        return Number(result.rowsAffected ?? 0)
      })
    })
    this.recordOperationLog(
      'removeByProvider',
      removedItems,
      performance.now() - start,
      `provider=${providerId}`
    )
    return removedItems
  }

  async search(
    providerId: string,
    ftsQuery: string,
    limit = 50
  ): Promise<Array<{ itemId: string; score: number }>> {
    const searchLogger = this.runtimeLogger
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
      searchIndexLog.warn('FTS search returned zero results', {
        meta: {
          providerId,
          queryLength: ftsMatchExpr.length,
          totalRows: totalRows[0]?.cnt ?? 0
        }
      })
    }

    searchIndexLog.debug('Search completed', {
      meta: {
        providerId,
        limit,
        resultCount: results.length,
        durationMs: Math.round(performance.now() - start)
      }
    })
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
   * SQLite first applies the same subsequence shape as a bounded LIKE
   * prefilter, keeping the hot search path from scoring arbitrary provider
   * keyword rows in JS.
   */
  async lookupBySubsequence(
    providerId: string,
    query: string,
    limit = 100,
    scanLimit = SUBSEQUENCE_SCAN_LIMIT_DEFAULT
  ): Promise<Array<{ itemId: string; keyword: string; priority: number }>> {
    const lowerQuery = query.trim().toLowerCase()
    const resultLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 100
    if (resultLimit === 0) return []
    if (lowerQuery.length < 2) return []
    await this.ensureInitialized()

    const requestedScanLimit = Number.isFinite(scanLimit)
      ? Math.max(0, Math.floor(scanLimit))
      : SUBSEQUENCE_SCAN_LIMIT_DEFAULT
    const effectiveScanLimit = Math.min(
      SUBSEQUENCE_SCAN_LIMIT_MAX,
      Math.max(resultLimit, requestedScanLimit)
    )
    const likePattern = buildSubsequenceLikePattern(lowerQuery)

    const rows = await this.db.all<{ item_id: string; keyword: string; priority: number }>(
      sql`SELECT item_id, keyword, priority
          FROM keyword_mappings
          WHERE provider_id = ${providerId}
            AND keyword NOT LIKE 'ng:%'
            AND length(keyword) >= ${lowerQuery.length}
            AND keyword LIKE ${likePattern} ESCAPE ${SUBSEQUENCE_LIKE_ESCAPE_CHAR}
          ORDER BY length(keyword) ASC, priority DESC, keyword ASC
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

    matches.sort(
      (a, b) =>
        b.score - a.score ||
        b.priority - a.priority ||
        a.keyword.length - b.keyword.length ||
        a.keyword.localeCompare(b.keyword)
    )
    return matches.slice(0, resultLimit).map(({ itemId, keyword, priority }) => ({
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
    if (this.initializationPromise) return await this.initializationPromise

    const initialization = this.initialize()
    this.initializationPromise = initialization
    try {
      await initialization
    } catch (error) {
      if (this.initializationPromise === initialization) {
        this.initializationPromise = null
      }
      throw error
    }
  }

  private async initialize(): Promise<void> {
    const initStart = performance.now()
    if (this.initializationMode === 'reader') {
      if (!this.readiness) throw new Error('SEARCH_INDEX_READER_READINESS_REQUIRED')
      await this.readiness.waitUntilReady()
      await this.verifySearchIndexSchema()
    } else {
      await this.prepareSearchIndexSchema()
    }

    this.initialized = true
    searchIndexLog.info('Initialization completed', {
      meta: {
        durationMs: Math.round(performance.now() - initStart),
        mode: this.initializationMode
      }
    })
  }

  private async prepareSearchIndexSchema(): Promise<void> {
    await this.createSearchIndexTable()
    await this.createFileFtsTable()
    await this.createSearchIndexMetaTable()
    await this.createKeywordMappingIndexes()
    await this.createProviderReplacementTables()
  }

  private async createProviderReplacementTables(): Promise<void> {
    await this.db.run(sql`
      CREATE TABLE IF NOT EXISTS search_index_replacement_stage (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        replacement_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        document TEXT NOT NULL
      )
    `)
    await this.db.run(sql`
      CREATE INDEX IF NOT EXISTS idx_search_index_replacement_stage_lookup
      ON search_index_replacement_stage(replacement_id, provider_id, sequence)
    `)
    await this.db.run(sql`
      CREATE TABLE IF NOT EXISTS search_index_replacement_outcome (
        replacement_id TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        removed_items INTEGER NOT NULL,
        indexed_items INTEGER NOT NULL,
        PRIMARY KEY(replacement_id, provider_id)
      )
    `)
  }

  private async verifySearchIndexSchema(): Promise<void> {
    const columns = await this.readSearchIndexColumns()
    const columnNames = new Set(columns.map((column) => column.name))
    const missingColumns = ['item_id', 'provider', 'content'].filter(
      (column) => !columnNames.has(column)
    )
    if (missingColumns.length > 0) {
      throw new Error(`SEARCH_INDEX_SCHEMA_NOT_READY:${missingColumns.join(',')}`)
    }
  }

  private async createSearchIndexTable(): Promise<void> {
    const tableInfo = await this.readSearchIndexColumns()
    const hasContent = tableInfo.some((col) => col.name === 'content')

    if (tableInfo.length > 0 && !hasContent) {
      throw new Error('SEARCH_INDEX_SCHEMA_INCOMPATIBLE:missing-content')
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

  private async readSearchIndexColumns(): Promise<SearchIndexColumnInfo[]> {
    return await this.db.all<SearchIndexColumnInfo>(
      sql`SELECT name FROM pragma_table_xinfo('search_index')`
    )
  }

  private async dropSearchIndexFtsTables(): Promise<void> {
    await this.db.run(sql`DROP TABLE IF EXISTS search_index`)
  }

  private async repairSearchIndexFtsTables(): Promise<void> {
    try {
      await this.dropSearchIndexFtsTables()
      return
    } catch (error) {
      searchIndexLog.warn(
        'Failed to drop search_index virtual table; clearing FTS5 shadow tables',
        {
          error,
          meta: this.toSqliteErrorMeta(error)
        }
      )
    }

    const shadowTables = [
      'search_index_data',
      'search_index_idx',
      'search_index_content',
      'search_index_docsize',
      'search_index_config'
    ]
    for (const table of shadowTables) {
      await this.db.run(sql.raw(`DROP TABLE IF EXISTS ${table}`))
    }
    await this.dropSearchIndexFtsTables()
  }

  private toSqliteErrorMeta(error: unknown): Record<string, string | number | boolean | null> {
    const meta: Record<string, string | number | boolean | null> = {}
    if (!error || typeof error !== 'object') {
      meta.error = String(error)
      return meta
    }
    const record = error as {
      code?: unknown
      rawCode?: unknown
      message?: unknown
      cause?: unknown
    }
    if (typeof record.code === 'string') meta.code = record.code
    if (typeof record.rawCode === 'number') meta.rawCode = record.rawCode
    if (typeof record.message === 'string') meta.message = record.message
    if (record.cause instanceof Error) {
      meta.cause = record.cause.message
    } else if (record.cause !== undefined) {
      meta.cause = String(record.cause)
    }
    return meta
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

    await tx.run(
      sql`DELETE FROM search_index WHERE provider = ${doc.providerId} AND item_id = ${doc.itemId}`
    )

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

  private async prepareDocuments(items: SearchIndexItem[]): Promise<PreparedIndexDocument[]> {
    const preparedDocs: PreparedIndexDocument[] = []
    for (let index = 0; index < items.length; index += 1) {
      preparedDocs.push(await this.prepareDocument(items[index]))
      if (!this.directMode && (index + 1) % 3 === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0))
      }
    }
    return preparedDocs
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
        searchIndexLog.debug('pinyin-pro preloaded', {
          meta: { durationMs: Math.round(performance.now() - start) }
        })
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
          searchIndexLog.debug('pinyin-pro module loaded', {
            meta: { durationMs: Math.round(performance.now() - start) }
          })
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

function buildSubsequenceLikePattern(query: string): string {
  let pattern = '%'
  for (const char of query) {
    pattern += char.replace(
      SQLITE_LIKE_WILDCARD_REGEX,
      (value) => `${SUBSEQUENCE_LIKE_ESCAPE_CHAR}${value}`
    )
    pattern += '%'
  }
  return pattern
}
