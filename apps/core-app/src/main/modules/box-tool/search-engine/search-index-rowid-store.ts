import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { sql } from 'drizzle-orm'
import type * as schema from '../../../db/schema'

type Database = LibSQLDatabase<typeof schema>
export type SearchIndexWriteTx = Pick<Database, 'run' | 'all' | 'delete' | 'insert' | 'select'>

export interface FtsDocument {
  itemId: string
  providerId: string
  type: string
  title: string
  titleCompact: string
  keywords: string
  tags: string
  path: string
  content: string
}

type StoredDocumentRow = {
  [K in keyof FtsDocument]: FtsDocument[K] | null
} & {
  hasMapping: number
  keywordHash: string | null
}

/**
 * FTS5 cannot index its provider/item_id columns. Keep a derived lookup on the same writer
 * connection instead of scanning the entire content table for each update or deletion.
 */
export class SearchIndexRowidStore {
  private readonly readyProviders = new Set<string>()

  constructor(private readonly db: Database) {}

  reset(): void {
    this.readyProviders.clear()
  }

  async initialize(ftsCreated: boolean): Promise<void> {
    await this.db.run(sql`
      CREATE TABLE IF NOT EXISTS search_index_rowids (
        fts_rowid INTEGER PRIMARY KEY,
        provider_id TEXT NOT NULL,
        item_id TEXT NOT NULL
      )
    `)
    await this.db.run(sql`
      CREATE INDEX IF NOT EXISTS idx_search_index_rowids_provider_item
      ON search_index_rowids(provider_id, item_id)
    `)
    if (ftsCreated) await this.db.run(sql`DELETE FROM search_index_rowids`)
  }

  async ensureProvider(providerId: string): Promise<void> {
    if (this.readyProviders.has(providerId)) return
    // One streaming pass per provider/writer lifetime, including legacy duplicates and rows
    // without meta. Rebuilding also handles a downgrade to a writer unaware of this lookup.
    await this.db.transaction(async (tx) => {
      await this.clearProvider(tx, providerId)
      await tx.run(sql`
        INSERT OR REPLACE INTO search_index_rowids(fts_rowid, provider_id, item_id)
        SELECT rowid, provider, item_id FROM search_index WHERE provider = ${providerId}
      `)
    })
    this.readyProviders.add(providerId)
  }

  async readDocument(
    tx: SearchIndexWriteTx,
    doc: FtsDocument
  ): Promise<{ state: 'missing' | 'unchanged' | 'changed'; keywordHash: string | undefined }> {
    const rows = await tx.all<StoredDocumentRow>(sql`
      SELECT indexed.item_id AS itemId, indexed.provider AS providerId, indexed.type, indexed.title,
        indexed.title_compact AS titleCompact, indexed.keywords, indexed.tags, indexed.path,
        indexed.content, mapped.fts_rowid IS NOT NULL AS hasMapping, meta.keyword_hash AS keywordHash
      FROM (SELECT 1) AS probe
      LEFT JOIN search_index_meta AS meta
        ON meta.provider_id = ${doc.providerId} AND meta.item_id = ${doc.itemId}
      LEFT JOIN search_index_rowids AS mapped
        ON mapped.provider_id = ${doc.providerId} AND mapped.item_id = ${doc.itemId}
      LEFT JOIN search_index AS indexed ON indexed.rowid = mapped.fts_rowid
        AND indexed.provider = mapped.provider_id AND indexed.item_id = mapped.item_id
      LIMIT 2
    `)
    const row = rows[0]
    const keywordHash = row?.keywordHash ?? undefined
    if (!row?.hasMapping) return { state: 'missing', keywordHash }
    const unchanged =
      rows.length === 1 &&
      row.providerId === doc.providerId &&
      row.itemId === doc.itemId &&
      row.type === doc.type &&
      row.title === doc.title &&
      row.titleCompact === doc.titleCompact &&
      row.keywords === doc.keywords &&
      row.tags === doc.tags &&
      row.path === doc.path &&
      row.content === doc.content
    return { state: unchanged ? 'unchanged' : 'changed', keywordHash }
  }

  async removeItem(tx: SearchIndexWriteTx, providerId: string, itemId: string): Promise<number> {
    const result = await tx.run(sql`
      DELETE FROM search_index WHERE rowid IN (
        SELECT fts_rowid FROM search_index_rowids
        WHERE provider_id = ${providerId} AND item_id = ${itemId}
      ) AND provider = ${providerId} AND item_id = ${itemId}
    `)
    await tx.run(sql`
      DELETE FROM search_index_rowids WHERE provider_id = ${providerId} AND item_id = ${itemId}
    `)
    return Number(result.rowsAffected ?? 0)
  }

  async recordInsert(
    tx: SearchIndexWriteTx,
    doc: FtsDocument,
    rowid: bigint | undefined
  ): Promise<void> {
    if (rowid === undefined) throw new Error('SEARCH_INDEX_MISSING_INSERT_ROWID')
    // Use the statement result, not connection state that later inserts can overwrite.
    await tx.run(sql`
      INSERT OR REPLACE INTO search_index_rowids(fts_rowid, provider_id, item_id)
      VALUES (${rowid}, ${doc.providerId}, ${doc.itemId})
    `)
  }

  async clearProvider(tx: SearchIndexWriteTx, providerId: string): Promise<void> {
    await tx.run(sql`DELETE FROM search_index_rowids WHERE provider_id = ${providerId}`)
  }
}
