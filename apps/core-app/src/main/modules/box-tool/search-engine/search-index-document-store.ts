import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { createHash, randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import type * as schema from '../../../db/schema'
import type { IndexMaintenanceNotification } from './index-maintenance-context'

export type SearchIndexWriteTx = Pick<
  LibSQLDatabase<typeof schema>,
  'run' | 'all' | 'delete' | 'insert' | 'select'
>

export interface SearchIndexDocumentFields {
  providerId: string
  itemId: string
  type: string
  title: string
  titleCompact: string
  keywords: string
  tags: string
  path: string
  content: string
}

export interface SearchIndexDocument extends SearchIndexDocumentFields {
  keywordHash: string
  documentHash: string
}

interface DocumentMeta {
  itemId: string
  keywordHash: string
  ftsRowId: number | null
  documentHash: string | null
}

interface IndexedRow {
  rowid: number
  provider: string
  item_id: string
  type?: string
  title?: string
  title_compact?: string
  keywords?: string
  tags?: string
  path?: string
  content?: string
}

export interface SearchIndexDocumentState {
  meta?: DocumentMeta
  rows: IndexedRow[]
}

const DOCUMENT_FIELDS: ReadonlyArray<keyof SearchIndexDocumentFields> = [
  'providerId',
  'itemId',
  'type',
  'title',
  'titleCompact',
  'keywords',
  'tags',
  'path',
  'content'
]

export function buildSearchIndexDocumentHash(document: SearchIndexDocumentFields): string {
  const hash = createHash('sha256')
  for (const field of DOCUMENT_FIELDS) {
    const value = document[field]
    hash.update(`${value.length}:`).update(value)
  }
  return hash.digest('hex')
}

/** The sole writer's document locator, not a second database connection. */
export class SearchIndexDocumentStore {
  private locatorsComplete: boolean | null = null

  constructor(private readonly db: LibSQLDatabase<typeof schema>) {}

  async prepareSchema(): Promise<void> {
    await this.db.run(sql`CREATE TABLE IF NOT EXISTS search_index_meta (
      provider_id TEXT NOT NULL, item_id TEXT NOT NULL, keyword_hash TEXT NOT NULL,
      fts_rowid INTEGER, document_hash TEXT,
      updated_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
      PRIMARY KEY(provider_id, item_id)
    )`)
    const columns = await this.db.all<{ name: string }>(sql`PRAGMA table_info(search_index_meta)`)
    if (!columns.some((column) => column.name === 'fts_rowid')) {
      await this.db.run(sql`ALTER TABLE search_index_meta ADD COLUMN fts_rowid INTEGER`)
    }
    if (!columns.some((column) => column.name === 'document_hash')) {
      await this.db.run(sql`ALTER TABLE search_index_meta ADD COLUMN document_hash TEXT`)
    }
    await this.db.run(
      sql`CREATE INDEX IF NOT EXISTS idx_search_index_meta_updated_at ON search_index_meta(updated_at)`
    )
    await this.db.run(sql`CREATE TABLE IF NOT EXISTS search_index_maintenance_progress (
      task TEXT PRIMARY KEY NOT NULL, cursor INTEGER NOT NULL DEFAULT 0
    )`)
    await this.db.run(sql`CREATE TABLE IF NOT EXISTS search_index_pending_commits (
      commit_id TEXT PRIMARY KEY NOT NULL, source_id TEXT NOT NULL,
      deleted_records TEXT NOT NULL, removed_indexed_items INTEGER NOT NULL
    )`)
    await this.db.run(
      sql`CREATE INDEX IF NOT EXISTS idx_search_index_pending_commits_source ON search_index_pending_commits(source_id)`
    )
    await this.db.run(sql`CREATE TABLE IF NOT EXISTS search_index_file_maintenance (
      task_id TEXT PRIMARY KEY NOT NULL, source_id TEXT NOT NULL, reason TEXT NOT NULL,
      file_path TEXT NOT NULL, expected_record TEXT, cursor INTEGER NOT NULL DEFAULT 0
    )`)
    await this.db.run(
      sql`CREATE INDEX IF NOT EXISTS idx_search_index_file_maintenance_source ON search_index_file_maintenance(source_id)`
    )
    await this.db.run(
      sql`CREATE INDEX IF NOT EXISTS idx_search_index_file_maintenance_reason ON search_index_file_maintenance(source_id,reason)`
    )
  }

  async reset(): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.run(sql`DELETE FROM search_index_meta`)
      await tx.run(sql`DELETE FROM search_index_maintenance_progress
        WHERE task='document-locators' OR task='document-meta-validation'
          OR (task >= 'orphan-keywords:' AND task < 'orphan-keywords:\uffff')`)
    })
    this.locatorsComplete = false
  }

  async loadDocuments(
    tx: SearchIndexWriteTx,
    documents: readonly SearchIndexDocument[],
    coverage: ReadonlyMap<string, boolean>
  ): Promise<Map<string, Map<string, SearchIndexDocumentState>>> {
    const groups = new Map<string, Set<string>>()
    for (const document of documents) {
      let ids = groups.get(document.providerId)
      if (!ids) {
        ids = new Set()
        groups.set(document.providerId, ids)
      }
      ids.add(document.itemId)
    }
    const states = new Map<string, Map<string, SearchIndexDocumentState>>()
    for (const [providerId, ids] of groups) {
      states.set(
        providerId,
        await this.loadProvider(tx, providerId, [...ids], coverage.get(providerId) === true, true)
      )
    }
    return states
  }

  private async loadProvider(
    tx: SearchIndexWriteTx,
    providerId: string,
    itemIds: readonly string[],
    coverageComplete: boolean,
    includeDocument: boolean
  ): Promise<Map<string, SearchIndexDocumentState>> {
    const states = new Map<string, SearchIndexDocumentState>()
    for (const itemId of itemIds) states.set(itemId, { rows: [] })
    if (states.size === 0) return states
    const ids = sql.join(
      [...states.keys()].map((id) => sql`${id}`),
      sql`, `
    )
    const metas = await tx.all<DocumentMeta>(sql`
      SELECT item_id AS itemId, keyword_hash AS keywordHash,
             fts_rowid AS ftsRowId, document_hash AS documentHash
      FROM search_index_meta WHERE provider_id = ${providerId} AND item_id IN (${ids})
    `)
    if (this.locatorsComplete === null) {
      const progress = await tx.all<{ cursor: number }>(sql`
        SELECT cursor FROM search_index_maintenance_progress WHERE task = 'document-locators'
      `)
      this.locatorsComplete = Number(progress[0]?.cursor) === -1
    }
    const located: number[] = []
    for (const meta of metas) {
      states.get(meta.itemId)!.meta = meta
      if (meta.ftsRowId !== null && (meta.documentHash !== null || this.locatorsComplete)) {
        located.push(Number(meta.ftsRowId))
      }
    }
    const projection = includeDocument
      ? sql`rowid, provider, item_id, type, title, title_compact, keywords, tags, path, content`
      : sql`rowid, provider, item_id`
    if (located.length > 0) {
      const rows = await tx.all<IndexedRow>(sql`
        SELECT ${projection} FROM search_index
        WHERE rowid IN (${sql.join(
          located.map((id) => sql`${id}`),
          sql`, `
        )})
      `)
      for (const row of rows) {
        const state = states.get(row.item_id)
        if (row.provider === providerId && state?.meta?.ftsRowId === Number(row.rowid)) {
          state.rows.push(row)
        }
      }
    }
    const unresolved: string[] = []
    for (const [itemId, state] of states) {
      if (state.rows.length > 0 || (!state.meta && coverageComplete)) continue
      unresolved.push(itemId)
    }
    // Legacy keys share ONE scan per bounded provider batch, never one scan per item.
    if (unresolved.length > 0) {
      const rows = await tx.all<IndexedRow>(sql`
        SELECT ${projection} FROM search_index
        WHERE provider = ${providerId}
          AND item_id IN (${sql.join(
            unresolved.map((id) => sql`${id}`),
            sql`, `
          )})
      `)
      for (const row of rows) states.get(row.item_id)!.rows.push(row)
    }
    return states
  }

  async apply(
    tx: SearchIndexWriteTx,
    document: SearchIndexDocument,
    state: SearchIndexDocumentState
  ): Promise<void> {
    const current = state.rows[0]
    const unchanged =
      state.rows.length === 1 &&
      current.type === document.type &&
      current.title === document.title &&
      current.title_compact === document.titleCompact &&
      current.keywords === document.keywords &&
      current.tags === document.tags &&
      current.path === document.path &&
      current.content === document.content
    let rowid = current?.rowid
    if (!unchanged) {
      if (state.rows.length > 0) {
        await tx.run(sql`DELETE FROM search_index WHERE rowid IN (
          ${sql.join(
            state.rows.map((row) => sql`${row.rowid}`),
            sql`, `
          )}
        ) AND provider = ${document.providerId} AND item_id = ${document.itemId}`)
      }
      const inserted = await tx.run(sql`INSERT INTO search_index (
        item_id, provider, type, title, title_compact, keywords, tags, path, content
      ) VALUES (${document.itemId}, ${document.providerId}, ${document.type}, ${document.title},
        ${document.titleCompact}, ${document.keywords}, ${document.tags}, ${document.path}, ${document.content})`)
      rowid = Number(inserted.lastInsertRowid)
      if (!Number.isSafeInteger(rowid) || rowid <= 0)
        throw new Error('SEARCH_INDEX_FTS_ROWID_UNAVAILABLE')
    }
    await tx.run(sql`INSERT INTO search_index_meta (
      provider_id, item_id, keyword_hash, fts_rowid, document_hash, updated_at
    ) VALUES (${document.providerId}, ${document.itemId}, ${document.keywordHash}, ${rowid}, ${document.documentHash}, strftime('%s','now'))
      ON CONFLICT(provider_id,item_id) DO UPDATE SET keyword_hash=excluded.keyword_hash,
        fts_rowid=excluded.fts_rowid, document_hash=excluded.document_hash, updated_at=excluded.updated_at`)
    state.meta = {
      itemId: document.itemId,
      keywordHash: document.keywordHash,
      ftsRowId: rowid!,
      documentHash: document.documentHash
    }
    state.rows = [
      {
        rowid: rowid!,
        provider: document.providerId,
        item_id: document.itemId,
        type: document.type,
        title: document.title,
        title_compact: document.titleCompact,
        keywords: document.keywords,
        tags: document.tags,
        path: document.path,
        content: document.content
      }
    ]
  }

  async remove(
    tx: SearchIndexWriteTx,
    providerId: string,
    itemIds: readonly string[],
    coverageComplete: boolean
  ): Promise<number> {
    const states = await this.loadProvider(tx, providerId, itemIds, coverageComplete, false)
    const rowids = [...states.values()].flatMap((state) => state.rows.map((row) => row.rowid))
    let removed = 0
    if (rowids.length > 0) {
      const result = await tx.run(sql`DELETE FROM search_index WHERE provider = ${providerId}
        AND rowid IN (${sql.join(
          rowids.map((id) => sql`${id}`),
          sql`, `
        )})`)
      removed = Number(result.rowsAffected)
    }
    if (itemIds.length > 0) {
      const ids = sql.join(
        itemIds.map((id) => sql`${id}`),
        sql`, `
      )
      await tx.run(
        sql`DELETE FROM keyword_mappings WHERE provider_id = ${providerId} AND item_id IN (${ids})`
      )
      await tx.run(
        sql`DELETE FROM search_index_meta WHERE provider_id = ${providerId} AND item_id IN (${ids})`
      )
    }
    return removed
  }

  async backfill(limit = 64): Promise<{ processed: number; done: boolean }> {
    const boundedLimit = Math.max(1, Math.min(64, Math.floor(limit)))
    let locatorsCompleted = false
    const result = await this.db.transaction(async (tx) => {
      const changed = new Map<string, number>()
      const progress = await tx.all<{ cursor: number }>(sql`
        SELECT cursor FROM search_index_maintenance_progress WHERE task='document-locators'
      `)
      const cursor = Number(progress[0]?.cursor ?? 0)
      if (cursor === -1) {
        locatorsCompleted = true
        const validation = await tx.all<{ cursor: number }>(sql`
          SELECT cursor FROM search_index_maintenance_progress WHERE task='document-meta-validation'
        `)
        const after = Number(validation[0]?.cursor ?? 0)
        if (after === -1) return { processed: 0, done: true }
        const metas = await tx.all<DocumentMeta & { rowid: number; providerId: string }>(sql`
          SELECT rowid,provider_id AS providerId,item_id AS itemId,keyword_hash AS keywordHash,
                 fts_rowid AS ftsRowId,document_hash AS documentHash
          FROM search_index_meta WHERE rowid > ${after} ORDER BY rowid
          LIMIT ${Math.min(8, boundedLimit)}
        `)
        for (const meta of metas) {
          const indexed =
            meta.ftsRowId === null
              ? undefined
              : (
                  await tx.all<IndexedRow>(sql`
            SELECT rowid,provider,item_id,type,title,title_compact,keywords,tags,path,content
            FROM search_index WHERE rowid=${meta.ftsRowId}
          `)
                )[0]
          if (!indexed || indexed.provider !== meta.providerId || indexed.item_id !== meta.itemId) {
            await tx.run(sql`DELETE FROM search_index_meta WHERE rowid=${meta.rowid}`)
            changed.set(meta.providerId, (changed.get(meta.providerId) ?? 0) + 1)
            continue
          }
          const hash = buildSearchIndexDocumentHash({
            providerId: indexed.provider,
            itemId: indexed.item_id,
            type: indexed.type ?? '',
            title: indexed.title ?? '',
            titleCompact: indexed.title_compact ?? '',
            keywords: indexed.keywords ?? '',
            tags: indexed.tags ?? '',
            path: indexed.path ?? '',
            content: indexed.content ?? ''
          })
          if (meta.documentHash !== hash) {
            await tx.run(
              sql`UPDATE search_index_meta SET document_hash=${hash} WHERE rowid=${meta.rowid}`
            )
          }
        }
        const next = metas.length > 0 ? Number(metas[metas.length - 1].rowid) : after
        const more = await tx.all<{ rowid: number }>(
          sql`SELECT rowid FROM search_index_meta WHERE rowid > ${next} LIMIT 1`
        )
        const done = more.length === 0
        await this.queueMaintenanceNotifications(tx, changed)
        await tx.run(sql`INSERT INTO search_index_maintenance_progress(task,cursor)
          VALUES('document-meta-validation',${done ? -1 : next}) ON CONFLICT(task) DO UPDATE SET cursor=excluded.cursor`)
        return { processed: metas.length, done }
      }
      const rows = await tx.all<IndexedRow>(sql`
        SELECT rowid, provider, item_id FROM search_index WHERE rowid > ${cursor}
        ORDER BY rowid LIMIT ${boundedLimit}
      `)
      for (const row of rows) {
        const existing = await tx.all<DocumentMeta>(sql`
          SELECT item_id AS itemId, keyword_hash AS keywordHash,
                 fts_rowid AS ftsRowId, document_hash AS documentHash
          FROM search_index_meta WHERE provider_id=${row.provider} AND item_id=${row.item_id}
        `)
        const meta = existing[0]
        let mapped: IndexedRow | undefined
        if (meta?.ftsRowId !== null && meta?.ftsRowId !== undefined) {
          mapped = (
            await tx.all<IndexedRow>(sql`
            SELECT rowid,provider,item_id FROM search_index WHERE rowid=${meta.ftsRowId}
          `)
          )[0]
        }
        const mappingValid = mapped?.provider === row.provider && mapped?.item_id === row.item_id
        if (mappingValid && Number(mapped!.rowid) !== Number(row.rowid)) {
          // New-code documents are authoritative. Legacy duplicates keep the newest rowid.
          if (meta!.documentHash !== null || Number(mapped!.rowid) > Number(row.rowid)) {
            await tx.run(sql`DELETE FROM search_index WHERE rowid=${row.rowid}`)
            changed.set(row.provider, (changed.get(row.provider) ?? 0) + 1)
            continue
          }
          await tx.run(sql`DELETE FROM search_index WHERE rowid=${mapped!.rowid}`)
          changed.set(row.provider, (changed.get(row.provider) ?? 0) + 1)
        }
        if (mappingValid && meta?.documentHash !== null) continue
        await tx.run(sql`INSERT INTO search_index_meta(provider_id,item_id,keyword_hash,fts_rowid,document_hash,updated_at)
          VALUES(${row.provider},${row.item_id},${meta?.keywordHash ?? ''},${row.rowid},NULL,strftime('%s','now'))
          ON CONFLICT(provider_id,item_id) DO UPDATE SET fts_rowid=excluded.fts_rowid,document_hash=NULL`)
      }
      const next = rows.length > 0 ? Number(rows[rows.length - 1].rowid) : cursor
      const more = await tx.all<{ rowid: number }>(
        sql`SELECT rowid FROM search_index WHERE rowid > ${next} LIMIT 1`
      )
      const done = more.length === 0
      await this.queueMaintenanceNotifications(tx, changed)
      await tx.run(sql`INSERT INTO search_index_maintenance_progress(task,cursor)
        VALUES('document-locators',${done ? -1 : next}) ON CONFLICT(task) DO UPDATE SET cursor=excluded.cursor`)
      locatorsCompleted = done
      return { processed: rows.length, done: false }
    })
    this.locatorsComplete = locatorsCompleted
    return result
  }

  async cleanupOrphanKeywords(
    sourceId: string,
    limit = 64
  ): Promise<{ removed: number; processed: number; done: boolean }> {
    const boundedLimit = Math.max(1, Math.min(64, Math.floor(limit)))
    return await this.db.transaction(async (tx) => {
      const task = `orphan-keywords:${JSON.stringify(sourceId)}`
      const progress = await tx.all<{ cursor: number }>(
        sql`SELECT cursor FROM search_index_maintenance_progress WHERE task=${task}`
      )
      const cursor = Number(progress[0]?.cursor ?? 0)
      const rows = await tx.all<{ rowid: number; itemId: string }>(sql`
        SELECT rowid AS rowid,item_id AS itemId FROM keyword_mappings
        WHERE provider_id=${sourceId} AND rowid > ${cursor} ORDER BY rowid LIMIT ${boundedLimit}
      `)
      const states = await this.loadProvider(
        tx,
        sourceId,
        rows.map((row) => row.itemId),
        false,
        false
      )
      const orphaned = rows
        .filter((row) => states.get(row.itemId)!.rows.length === 0)
        .map((row) => row.rowid)
      let removed = 0
      if (orphaned.length > 0) {
        const result = await tx.run(sql`DELETE FROM keyword_mappings WHERE provider_id=${sourceId}
          AND rowid IN (${sql.join(
            orphaned.map((id) => sql`${id}`),
            sql`, `
          )})`)
        removed = Number(result.rowsAffected)
      }
      if (removed > 0) await this.queueMaintenanceNotifications(tx, new Map([[sourceId, removed]]))
      const next = rows.length === boundedLimit ? Number(rows[rows.length - 1].rowid) : 0
      await tx.run(sql`INSERT INTO search_index_maintenance_progress(task,cursor) VALUES(${task},${next})
        ON CONFLICT(task) DO UPDATE SET cursor=excluded.cursor`)
      return { removed, processed: rows.length, done: next === 0 }
    })
  }

  private async queueMaintenanceNotifications(
    tx: SearchIndexWriteTx,
    changed: ReadonlyMap<string, number>
  ): Promise<void> {
    for (const [sourceId, count] of changed) {
      const task = `index-maintenance-commit/${encodeURIComponent(sourceId)}/${randomUUID()}`
      await tx.run(
        sql`INSERT INTO search_index_maintenance_progress(task,cursor) VALUES(${task},${count})`
      )
    }
  }

  async pendingMaintenanceNotifications(limit = 16): Promise<IndexMaintenanceNotification[]> {
    const prefix = 'index-maintenance-commit/'
    const rows = await this.db.all<{ task: string; cursor: number }>(sql`
      SELECT task,cursor FROM search_index_maintenance_progress
      WHERE task >= ${prefix} AND task < ${`${prefix}\uffff`}
      ORDER BY task LIMIT ${Math.max(1, Math.min(16, Math.floor(limit)))}
    `)
    return rows.map((row) => ({
      commitKey: row.task,
      sourceId: decodeURIComponent(row.task.slice(prefix.length, row.task.lastIndexOf('/'))),
      affectedItems: Number(row.cursor)
    }))
  }

  async acknowledgeMaintenanceNotification(
    notification: IndexMaintenanceNotification
  ): Promise<void> {
    const prefix = `index-maintenance-commit/${encodeURIComponent(notification.sourceId)}/`
    if (!notification.commitKey.startsWith(prefix))
      throw new Error('INDEX_MAINTENANCE_COMMIT_SOURCE_MISMATCH')
    await this.db.run(sql`DELETE FROM search_index_maintenance_progress
      WHERE task=${notification.commitKey} AND cursor=${notification.affectedItems}`)
  }
}
