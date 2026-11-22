import { createClient, type Client, type InValue } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../db/schema'
import { SearchIndexService } from '../modules/box-tool/search-engine/search-index-service'
import { searchIndexWriter } from '../modules/box-tool/search-engine/search-index-writer'

let primaryDb: LibSQLDatabase<typeof schema>
let fileHomeDb: LibSQLDatabase<typeof schema>
let splitEnabled = false
let directory: string | undefined
const clients: Client[] = []

vi.mock('../modules/database', () => ({
  databaseModule: {
    getDb: () => primaryDb,
    getSearchDb: () => fileHomeDb,
    getAuxDb: () => primaryDb,
    isSearchSplitEnabled: () => splitEnabled
  }
}))
vi.mock('../modules/clipboard', () => ({ clipboardModule: { cleanupHistory: vi.fn() } }))
vi.mock('./temp-file.service', () => ({
  tempFileService: { cleanup: vi.fn(), getBaseDir: () => '/tmp' }
}))
vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))

import { cleanupFileIndex } from './storage-maintenance'

afterEach(async () => {
  vi.restoreAllMocks()
  splitEnabled = false
  for (const client of clients.splice(0)) client.close()
  if (directory) await rm(directory, { recursive: true, force: true })
  directory = undefined
})

async function openHome(name: string) {
  const client = createClient({ url: `file:${join(directory!, name)}` })
  clients.push(client)
  await client.executeMultiple(`
    CREATE TABLE files (
      id INTEGER PRIMARY KEY,path TEXT NOT NULL UNIQUE,name TEXT NOT NULL,display_name TEXT,
      extension TEXT,size INTEGER,mtime INTEGER NOT NULL,ctime INTEGER NOT NULL,
      last_indexed_at INTEGER NOT NULL,is_dir INTEGER NOT NULL,type TEXT NOT NULL,
      content TEXT,embedding_status TEXT NOT NULL
    );
    CREATE TABLE file_extensions (file_id INTEGER NOT NULL,key TEXT NOT NULL,value TEXT,
      PRIMARY KEY(file_id,key));
    CREATE TABLE file_index_progress (file_id INTEGER PRIMARY KEY,status TEXT NOT NULL);
    CREATE TABLE scan_progress (source_id TEXT NOT NULL,path TEXT NOT NULL,last_scanned INTEGER NOT NULL,
      PRIMARY KEY(source_id,path));
    CREATE TABLE embeddings (id INTEGER PRIMARY KEY,source_id TEXT NOT NULL,source_type TEXT NOT NULL,
      embedding BLOB NOT NULL,model TEXT NOT NULL,created_at INTEGER NOT NULL);
    CREATE TABLE keyword_mappings (id INTEGER PRIMARY KEY AUTOINCREMENT,keyword TEXT NOT NULL,
      item_id TEXT NOT NULL,provider_id TEXT NOT NULL,priority REAL NOT NULL);
    CREATE TABLE query_completions (id INTEGER PRIMARY KEY,query TEXT NOT NULL);
    INSERT INTO files(id,path,name,size,mtime,ctime,last_indexed_at,is_dir,type,embedding_status)
      VALUES (1,'/managed/outside/App.app','Managed app',3,11,7,13,0,'app','none'),
             (2,'/indexed/file.txt','Indexed file',3,11,7,13,0,'file','none');
    INSERT INTO file_extensions(file_id,key,value)
      VALUES (1,'managed-entry','only-catalog-copy'),(2,'icon','file-icon');
    INSERT INTO file_index_progress(file_id,status) VALUES (2,'completed');
    INSERT INTO scan_progress(source_id,path,last_scanned) VALUES ('file-provider','/retired-root',13);
    INSERT INTO embeddings(id,source_id,source_type,embedding,model,created_at)
      VALUES (1,'2','file',X'00000000','fixture',13),(2,'note-owner','note',X'00000000','fixture',13);
    INSERT INTO query_completions(id,query) VALUES (1,'filequery');
  `)
  const db = drizzle(client, { schema })
  const search = new SearchIndexService(db, { directMode: true, initializationMode: 'writer' })
  await search.warmup()
  await search.indexItems([
    { itemId: 'app:managed', providerId: 'app-provider', type: 'app', name: 'managedapptitle' },
    { itemId: 'file:owned', providerId: 'file-provider', type: 'file', name: 'fileindextitle' }
  ])
  const deletedRecords = JSON.stringify([
    {
      id: 2,
      path: '/indexed/file.txt',
      mtime: 11,
      ctime: 7,
      size: 3,
      lastIndexedAt: 13,
      itemId: 'file:owned'
    }
  ])
  await db.insert(schema.searchIndexPendingCommits).values([
    { commitId: 'file-commit', sourceId: 'file-provider', deletedRecords, removedIndexedItems: 1 },
    { commitId: 'other-commit', sourceId: 'other-provider', deletedRecords, removedIndexedItems: 1 }
  ])
  await db.insert(schema.searchIndexFileMaintenance).values([
    {
      taskId: 'file-work',
      sourceId: 'file-provider',
      reason: 'missing-root',
      filePath: '/retired-root',
      expectedRecord: null,
      cursor: 4
    },
    {
      taskId: 'other-work',
      sourceId: 'other-provider',
      reason: 'missing-root',
      filePath: '/other-root',
      expectedRecord: null,
      cursor: 7
    }
  ])
  return { client, db, search }
}

async function catalogSnapshot(client: Client) {
  return {
    files: (await client.execute('SELECT id,path,type FROM files ORDER BY id')).rows,
    extensions: (
      await client.execute('SELECT file_id,key,value FROM file_extensions ORDER BY file_id,key')
    ).rows,
    metadata: (
      await client.execute(
        'SELECT provider_id,item_id,keyword_hash,fts_rowid,document_hash FROM search_index_meta ORDER BY provider_id,item_id'
      )
    ).rows,
    pending: (
      await client.execute(
        'SELECT commit_id,source_id FROM search_index_pending_commits ORDER BY commit_id'
      )
    ).rows,
    work: (
      await client.execute(
        'SELECT task_id,source_id,cursor FROM search_index_file_maintenance ORDER BY task_id'
      )
    ).rows
  }
}

describe('cleanupFileIndex actual storage ownership', () => {
  it.each(['split', 'primary-fallback'] as const)(
    'clears file projections and derivatives but preserves app catalog on %s',
    async (topology) => {
      directory = await mkdtemp(join(tmpdir(), 'tuff-storage-maintenance-'))
      const primary = await openHome('primary.sqlite')
      const live = topology === 'split' ? await openHome('search-index.sqlite') : primary
      primaryDb = primary.db
      fileHomeDb = live.db
      const primaryBefore = await catalogSnapshot(primary.client)
      expect(
        (await live.search.search('file-provider', 'fileindextitle')).map((row) => row.itemId)
      ).toEqual(['file:owned'])
      const result = await cleanupFileIndex({
        includeEmbeddings: true,
        clearSearchIndex: true,
        rebuild: false
      })
      expect(result).toEqual({ success: true, removedCount: 4 })
      expect((await live.client.execute('SELECT id,path,type FROM files')).rows).toEqual([
        { id: 1, path: '/managed/outside/App.app', type: 'app' }
      ])
      expect(
        (await live.client.execute('SELECT file_id,key,value FROM file_extensions')).rows
      ).toEqual([{ file_id: 1, key: 'managed-entry', value: 'only-catalog-copy' }])
      expect((await live.client.execute('SELECT file_id FROM file_index_progress')).rows).toEqual(
        []
      )
      expect((await live.client.execute('SELECT path FROM scan_progress')).rows).toEqual([])
      expect(
        (await live.client.execute('SELECT source_id,source_type FROM embeddings')).rows
      ).toEqual([{ source_id: 'note-owner', source_type: 'note' }])
      expect(await live.search.search('file-provider', 'fileindextitle')).toEqual([])
      expect(await live.search.lookupByKeywords('file-provider', ['fileindextitle'])).toEqual(
        new Map()
      )
      // Without their meta rows the postings no longer reach a lookup, but they still take space.
      expect(
        (await live.client.execute('SELECT doc_id FROM search_keyword_postings')).rows
      ).toEqual([])
      expect(
        (
          await live.client.execute(
            "SELECT item_id FROM search_index_meta WHERE provider_id = 'file-provider'"
          )
        ).rows
      ).toEqual([])
      expect(
        (await live.client.execute('SELECT commit_id FROM search_index_pending_commits')).rows
      ).toEqual([])
      expect(
        (await live.client.execute('SELECT task_id FROM search_index_file_maintenance')).rows
      ).toEqual([])
      expect((await live.client.execute('SELECT id FROM query_completions')).rows).toEqual([])
      if (topology === 'split') {
        expect(await catalogSnapshot(primary.client)).toEqual(primaryBefore)
        expect(
          (await primary.search.search('app-provider', 'managedapptitle')).map((row) => row.itemId)
        ).toEqual(['app:managed'])
      }
    }
  )

  it.each(['split', 'primary-fallback'] as const)(
    'keeps explicitly retained projections and other-source queues on %s',
    async (topology) => {
      directory = await mkdtemp(join(tmpdir(), 'tuff-storage-maintenance-'))
      const primary = await openHome('primary.sqlite')
      const live = topology === 'split' ? await openHome('search-index.sqlite') : primary
      primaryDb = primary.db
      fileHomeDb = live.db
      await live.client.execute(`INSERT INTO search_index_maintenance_progress (task, cursor)
        VALUES ('file-capacity:horizon', 1700000000), ('file-capacity:sweep', 0), ('unrelated', 5)`)
      const result = await cleanupFileIndex({
        includeEmbeddings: true,
        clearSearchIndex: false,
        rebuild: false
      })
      expect(result).toEqual({ success: true, removedCount: 4 })
      expect((await live.client.execute('SELECT id,path,type FROM files')).rows).toEqual([
        { id: 1, path: '/managed/outside/App.app', type: 'app' }
      ])
      expect(
        (await live.search.search('file-provider', 'fileindextitle')).map((row) => row.itemId)
      ).toEqual(['file:owned'])
      expect(
        (await live.search.lookupByKeywords('file-provider', ['fileindextitle'])).get(
          'fileindextitle'
        )
      ).toEqual([{ itemId: 'file:owned', priority: 1.25 }])
      expect(
        (await live.client.execute('SELECT commit_id,source_id FROM search_index_pending_commits'))
          .rows
      ).toEqual([{ commit_id: 'other-commit', source_id: 'other-provider' }])
      expect(
        (
          await live.client.execute(
            'SELECT task_id,source_id,cursor FROM search_index_file_maintenance'
          )
        ).rows
      ).toEqual([{ task_id: 'other-work', source_id: 'other-provider', cursor: 7 }])
      // The emptied index takes old files again.
      expect(
        (
          await live.client.execute(
            "SELECT task, cursor FROM search_index_maintenance_progress WHERE task IN ('file-capacity:horizon', 'file-capacity:sweep', 'unrelated')"
          )
        ).rows
      ).toEqual([{ task: 'unrelated', cursor: 5 }])
    }
  )

  it.each(['split', 'primary-fallback'] as const)(
    'removes file embeddings and orphan file_extensions by default when UI omits includeEmbeddings on %s',
    async (topology) => {
      directory = await mkdtemp(join(tmpdir(), 'tuff-storage-maintenance-'))
      const primary = await openHome('primary.sqlite')
      const live = topology === 'split' ? await openHome('search-index.sqlite') : primary
      primaryDb = primary.db
      fileHomeDb = live.db
      splitEnabled = topology === 'split'

      // Seed an already-orphaned file_extensions row and an already-orphaned file embedding.
      await live.client.executeMultiple(`
        INSERT INTO file_extensions(file_id, key, value) VALUES (999, 'keywords', '["orphan"]');
        INSERT INTO embeddings(id, source_id, source_type, embedding, model, created_at)
          VALUES (3, '999', 'file', X'00000000', 'fixture', 13);
      `)

      const writerQueries: string[] = []
      if (topology === 'split') {
        vi.spyOn(searchIndexWriter, 'getStatus').mockReturnValue({
          readiness: 'ready',
          admissionPaused: false,
          activeAdmissions: 0,
          pending: 0,
          waitingAdmissions: 0,
          capacityWaiters: 0
        })
        vi.spyOn(searchIndexWriter, 'execWrite').mockImplementation(async (statements) => {
          writerQueries.push(...statements.map((stmt) => stmt.sql))
          const batchResult = await live.client.batch(
            statements.map((stmt) => ({ sql: stmt.sql, args: stmt.args as InValue[] })),
            'write'
          )
          return batchResult.map((entry) => ({
            rowsAffected: Number(entry.rowsAffected ?? 0),
            lastInsertRowid: null,
            rows: []
          }))
        })
      }

      // Exact payload sent by Storagable.vue (`{ clearSearchIndex: true }`, no `includeEmbeddings`).
      const result = await cleanupFileIndex({ clearSearchIndex: true })
      expect(result).toEqual({ success: true, removedCount: 5 })

      expect(
        (await live.client.execute('SELECT source_id, source_type FROM embeddings')).rows
      ).toEqual([{ source_id: 'note-owner', source_type: 'note' }])
      expect(
        (await live.client.execute('SELECT file_id, key, value FROM file_extensions')).rows
      ).toEqual([{ file_id: 1, key: 'managed-entry', value: 'only-catalog-copy' }])

      if (topology === 'split') {
        expect(writerQueries.some((query) => /delete\s+from\s+"?embeddings"?/i.test(query))).toBe(
          true
        )
        // Primary DB embeddings and catalog remain untouched.
        expect(
          (
            await primary.client.execute(
              'SELECT source_id, source_type FROM embeddings ORDER BY id'
            )
          ).rows
        ).toEqual([
          { source_id: '2', source_type: 'file' },
          { source_id: 'note-owner', source_type: 'note' }
        ])
      }
    }
  )

  it('still purges orphaned file embeddings when includeEmbeddings is explicitly false', async () => {
    directory = await mkdtemp(join(tmpdir(), 'tuff-storage-maintenance-'))
    const primary = await openHome('primary.sqlite')
    primaryDb = primary.db
    fileHomeDb = primary.db

    await cleanupFileIndex({ includeEmbeddings: false, clearSearchIndex: false, rebuild: false })

    // Deleting non-app `files` rows orphaned source_id = '2', while 'note' stays intact.
    expect(
      (await primary.client.execute('SELECT source_id, source_type FROM embeddings')).rows
    ).toEqual([{ source_id: 'note-owner', source_type: 'note' }])
  })
})
