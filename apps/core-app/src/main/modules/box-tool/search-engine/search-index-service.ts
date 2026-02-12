import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { performance } from 'node:perf_hooks'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import * as schema from '../../../db/schema'
import { withSqliteRetry } from '../../../db/sqlite-retry'
import { searchLogger } from './search-logger'

const CHINESE_CHAR_REGEX = /[\u4E00-\u9FA5]/
const INVALID_KEYWORD_REGEX = /[^a-z0-9\u4E00-\u9FA5]+/i
const WORD_SPLIT_REGEX = /[\s\-_]+/g
const PATH_SPLIT_REGEX = /[\\/]+/
const NGRAM_PREFIX = 'ng:'
const NGRAM_MIN_WORD_LENGTH = 3

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
}

export class SearchIndexService {
  private initialized = false
  private pinyinModule: typeof import('pinyin-pro') | null = null
  private pinyinPromise: Promise<typeof import('pinyin-pro')> | null = null

  /** True if the FTS5 table was dropped and recreated during initialization (schema migration). */
  public didMigrate = false

  constructor(private readonly db: LibSQLDatabase<typeof schema>) {}

  async indexItems(items: SearchIndexItem[]): Promise<void> {
    if (items.length === 0) return
    const start = performance.now()

    await dbWriteScheduler.schedule('search-index.ensure', () =>
      withSqliteRetry(() => this.ensureInitialized(), { label: 'search-index.ensure' })
    )

    // Prepare documents one at a time, yielding between each to avoid
    // long main-thread stalls from pinyin / n-gram computation.
    const preparedDocs: PreparedIndexDocument[] = []
    for (const item of items) {
      preparedDocs.push(await this.prepareDocument(item))
      // Yield to event loop between documents so UI stays responsive
      await new Promise<void>((resolve) => setImmediate(resolve))
    }

    // Write each document in its own transaction so the dbWriteScheduler
    // can yield to the event loop between documents. A single transaction
    // for all docs blocks the event loop for the entire duration (FTS5
    // INSERT + keyword_mappings are synchronous SQLite operations).
    for (const doc of preparedDocs) {
      await dbWriteScheduler.schedule('search-index.indexItem', () =>
        withSqliteRetry(
          () =>
            this.db.transaction(async (tx) => {
              await this.applyDocument(tx, doc)
            }),
          { label: 'search-index.indexItem' }
        )
      )
    }

    console.debug(
      `[SearchIndexService] Indexed ${items.length} items in ${(performance.now() - start).toFixed(
        0
      )}ms`
    )
  }

  async removeItems(itemIds: string[]): Promise<void> {
    if (itemIds.length === 0) return
    const start = performance.now()

    // Remove each item in its own scheduled task so the dbWriteScheduler
    // can yield between items, avoiding long event-loop blocks.
    for (const itemId of itemIds) {
      await dbWriteScheduler.schedule('search-index.removeItem', () =>
        withSqliteRetry(
          async () => {
            await this.ensureInitialized()
            await this.db.transaction(async (tx) => {
              await tx.run(sql`DELETE FROM search_index WHERE item_id = ${itemId}`)
              await tx
                .delete(schema.keywordMappings)
                .where(eq(schema.keywordMappings.itemId, itemId))
            })
          },
          { label: 'search-index.removeItem' }
        )
      )
    }
    console.debug(
      `[SearchIndexService] Removed ${itemIds.length} items in ${(
        performance.now() - start
      ).toFixed(0)}ms`
    )
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
    console.debug(
      `[SearchIndexService] removeByProvider(${providerId}) removed ${itemIds.length} items in ${(
        performance.now() - start
      ).toFixed(0)}ms`
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

    if (results.length === 0) {
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
    limit = 100
  ): Promise<Array<{ itemId: string; keyword: string; priority: number }>> {
    if (!query || query.length < 2) return []
    await this.ensureInitialized()

    const lowerQuery = query.toLowerCase()

    // Load non-ngram keywords for this provider
    const rows = await this.db.all<{ item_id: string; keyword: string; priority: number }>(
      sql`SELECT item_id, keyword, priority
          FROM keyword_mappings
          WHERE provider_id = ${providerId}
            AND keyword NOT LIKE 'ng:%'
            AND length(keyword) >= ${lowerQuery.length}`
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

  private async applyDocument(
    tx: Pick<LibSQLDatabase<typeof schema>, 'run' | 'delete' | 'insert'>,
    doc: PreparedIndexDocument
  ): Promise<void> {
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

    await tx.delete(schema.keywordMappings).where(eq(schema.keywordMappings.itemId, doc.itemId))

    if (doc.keywordEntries.length > 0) {
      await tx.insert(schema.keywordMappings).values(
        doc.keywordEntries.map(({ value, priority }) => ({
          keyword: value,
          itemId: doc.itemId,
          providerId: doc.providerId,
          priority: priority ?? 1
        }))
      )
    }
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

    // Generate n-gram entries for fuzzy recall (only for non-trivial keywords)
    const ngramEntries: SearchIndexKeyword[] = []
    for (const { value } of keywordEntries) {
      if (value.length >= NGRAM_MIN_WORD_LENGTH && !value.startsWith(NGRAM_PREFIX)) {
        for (const ngram of generateNgrams(value, 2)) {
          ngramEntries.push({ value: ngram, priority: 0.5 })
        }
      }
    }

    // Combine regular keywords with n-gram entries for storage in keywordMappings
    const allKeywordEntries = [...keywordEntries, ...ngramEntries]

    const tags = (item.tags || []).map((tag) => tag.toLowerCase()).join(' ')
    const keywordField = keywordEntries.map((entry) => entry.value).join(' ')

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
      keywordEntries: allKeywordEntries
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
