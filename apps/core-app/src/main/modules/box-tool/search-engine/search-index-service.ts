import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { performance } from 'node:perf_hooks'
import { eq, sql } from 'drizzle-orm'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import * as schema from '../../../db/schema'
import { withSqliteRetry } from '../../../db/sqlite-retry'
import { searchLogger } from './search-logger'

const CHINESE_CHAR_REGEX = /[\u4E00-\u9FA5]/
const INVALID_KEYWORD_REGEX = /[^a-z0-9\u4E00-\u9FA5]+/i
const WORD_SPLIT_REGEX = /[\s\-_]+/g
const PATH_SPLIT_REGEX = /[\\/]+/

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

  constructor(private readonly db: LibSQLDatabase<typeof schema>) {}

  async indexItems(items: SearchIndexItem[]): Promise<void> {
    if (items.length === 0) return
    const start = performance.now()

    await dbWriteScheduler.schedule('search-index.ensure', () =>
      withSqliteRetry(() => this.ensureInitialized(), { label: 'search-index.ensure' })
    )

    const preparedDocs = await Promise.all(items.map((item) => this.prepareDocument(item)))

    await dbWriteScheduler.schedule('search-index.indexItems', () =>
      withSqliteRetry(
        () =>
          this.db.transaction(async (tx) => {
            for (const doc of preparedDocs) {
              await this.applyDocument(tx, doc)
            }
          }),
        { label: 'search-index.indexItems' }
      )
    )
    console.debug(
      `[SearchIndexService] Indexed ${items.length} items in ${(performance.now() - start).toFixed(
        0
      )}ms`
    )
  }

  async removeItems(itemIds: string[]): Promise<void> {
    if (itemIds.length === 0) return
    const start = performance.now()

    await dbWriteScheduler.schedule('search-index.removeItems', () =>
      withSqliteRetry(
        async () => {
          await this.ensureInitialized()
          await this.db.transaction(async (tx) => {
            for (const itemId of itemIds) {
              await tx.run(sql`DELETE FROM search_index WHERE item_id = ${itemId}`)
              await tx
                .delete(schema.keywordMappings)
                .where(eq(schema.keywordMappings.itemId, itemId))
            }
          })
        },
        { label: 'search-index.removeItems' }
      )
    )
    console.debug(
      `[SearchIndexService] Removed ${itemIds.length} items in ${(
        performance.now() - start
      ).toFixed(0)}ms`
    )
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

    searchLogger.indexSearchExecuting()
    const rows = await this.db.all<{ item_id: string; score: number }>(
      sql`SELECT item_id, bm25(search_index) as score FROM search_index WHERE provider = ${providerId} AND search_index MATCH ${trimmed} ORDER BY score LIMIT ${limit}`
    )

    const results = rows.map((row) => ({ itemId: row.item_id, score: row.score }))
    searchLogger.indexSearchComplete(results.length, performance.now() - start)
    console.debug(
      `[SearchIndexService] search(provider=${providerId}, limit=${limit}) returned ${results.length} matches in ${(
        performance.now() - start
      ).toFixed(0)}ms`
    )
    return results
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

    if (item.path) {
      const pathTokens = this.splitPath(item.path.toLowerCase())
      for (const token of pathTokens) {
        this.appendKeyword(keywordMap, token, 0.85)
      }
    }

    if (item.extension) {
      const ext = item.extension.trim().toLowerCase()
      if (ext) {
        this.appendKeyword(keywordMap, ext, 1.05)
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
      // Warn if too many keywords (performance concern)
      if (item.keywords.length > 10) {
        console.warn(
          `[SearchIndexService] Item "${item.itemId}" has ${item.keywords.length} keywords. ` +
            `Consider reducing to <= 10 for better performance.`
        )
      }
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
      keywordEntries
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
