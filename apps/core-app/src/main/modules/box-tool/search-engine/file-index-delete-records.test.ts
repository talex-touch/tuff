import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { mkdtemp, readFile, rm, unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, normalize } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../../db/schema'
import { dbWriteScheduler } from '../../../db/db-write-scheduler'
import type { SearchIndexWriteTx } from './search-index-document-store'
import { getReconciliationFileRecordsPage } from '../addon/files/services/file-provider-reconciliation-run-service'
import { FileProviderMaintenanceService } from '../addon/files/services/file-provider-maintenance-service'
import type { FileProviderReconciliationDbRecord } from '../addon/files/services/file-provider-reconciliation-run-service'
import type { FileIndexedSourceRuntimeMutationDelegate } from '../addon/files/file-provider-index-contracts'
import {
  removeFileRecordsInTransaction,
  removeMissingFileSearchRecordsInTransaction,
  listPendingFileDeletionCommitsInHome,
  acknowledgeFileDeletionCommitsInHome,
  type ExpectedMissingFileSearchRecord,
  type ExpectedFileRecord
} from './file-index-persistence-repository'
import { SearchIndexService } from './search-index-service'
import {
  beginForegroundSearchActivity,
  endForegroundSearchActivity,
  markSearchActivity
} from './search-activity'
import { removeFileRecordsInPrimaryHome } from './search-index-writer'

let client: Client
let directory: string
let db: LibSQLDatabase<typeof schema>
let service: SearchIndexService
let observed: ExpectedFileRecord
let missingCandidate: ExpectedMissingFileSearchRecord

beforeEach(async () => {
  markSearchActivity(0)
  directory = await mkdtemp(join(tmpdir(), 'tuff-file-delete-fence-'))
  client = createClient({ url: `file:${join(directory, 'index.sqlite')}` })
  await client.execute('PRAGMA foreign_keys = ON')
  await client.executeMultiple(`
    CREATE TABLE files (
      id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      display_name TEXT, extension TEXT, size INTEGER, mtime INTEGER NOT NULL,
      ctime INTEGER NOT NULL, last_indexed_at INTEGER NOT NULL, is_dir INTEGER NOT NULL,
      type TEXT NOT NULL, content TEXT, embedding_status TEXT NOT NULL
    );
    CREATE TABLE file_extensions (
      file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
      key TEXT NOT NULL, value TEXT, PRIMARY KEY(file_id, key)
    );
    CREATE TABLE file_index_progress (
      file_id INTEGER PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
      status TEXT NOT NULL, progress INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    CREATE TABLE embeddings (
      id INTEGER PRIMARY KEY, source_id TEXT NOT NULL, source_type TEXT NOT NULL,
      embedding BLOB NOT NULL, model TEXT NOT NULL, content_hash TEXT, created_at INTEGER NOT NULL
    );
    CREATE TABLE scan_progress (
      source_id TEXT NOT NULL, path TEXT NOT NULL, last_scanned INTEGER NOT NULL,
      PRIMARY KEY(source_id, path)
    );
    CREATE TABLE keyword_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT, keyword TEXT NOT NULL,
      item_id TEXT NOT NULL, provider_id TEXT NOT NULL, priority REAL NOT NULL
    );
  `)
  const path = join(directory, 'On-Disk.txt')
  await writeFile(path, 'disk content must survive index cleanup')
  observed = { id: 1, path, mtime: 11, ctime: 7, size: 3, lastIndexedAt: 13, itemId: 'file:1' }
  await client.execute({
    sql: `INSERT INTO files (id,path,name,size,mtime,ctime,last_indexed_at,is_dir,type,embedding_status)
      VALUES (1,?,'on-disk.txt',3,11,7,13,0,'file','completed')`,
    args: [path]
  })
  await client.executeMultiple(`
    INSERT INTO file_extensions(file_id,key,value) VALUES (1,'icon','persisted-icon');
    INSERT INTO file_index_progress(file_id,status,progress,updated_at) VALUES (1,'completed',100,13);
    INSERT INTO embeddings(id,source_id,source_type,embedding,model,created_at)
      VALUES (1,'1','file',X'0102','test-vector',13), (2,'1','note',X'0304','test-vector',13);
  `)
  await client.execute({
    sql: 'INSERT INTO scan_progress(source_id,path,last_scanned) VALUES (?,?,13),(?,?,13)',
    args: ['file-provider', path, 'other-provider', path]
  })
  db = drizzle(client, { schema })
  service = new SearchIndexService(db, { directMode: true, initializationMode: 'writer' })
  await service.warmup()
  await service.indexItems([
    {
      itemId: observed.itemId,
      providerId: 'file-provider',
      type: 'file',
      name: 'indexedtitle',
      path
    },
    {
      itemId: observed.itemId,
      providerId: 'other-provider',
      type: 'file',
      name: 'othertitle',
      path
    }
  ])
  const meta = (
    await client.execute(`SELECT fts_rowid, document_hash, updated_at FROM search_index_meta
    WHERE provider_id = 'file-provider' AND item_id = 'file:1'`)
  ).rows[0]
  missingCandidate = {
    itemId: observed.itemId,
    path: observed.path,
    ftsRowid: Number(meta.fts_rowid),
    documentHash: String(meta.document_hash),
    updatedAt: Number(meta.updated_at)
  }
})

afterEach(async () => {
  endForegroundSearchActivity('file-delete-test:foreground')
  vi.useRealTimers()
  markSearchActivity(0)
  client?.close()
  await rm(directory, { recursive: true, force: true })
})

describe('same-transaction file deletion with observed-version fencing', () => {
  it('deletes only indexed derivatives of the matching file and provider, leaving disk bytes intact', async () => {
    const result = await db.transaction((tx) =>
      removeFileRecordsInTransaction(tx, service, 'file-provider', [observed])
    )
    expect(result.deletedRecords).toEqual([observed])
    expect(result.removedIndexedItems).toBe(1)
    expect((await client.execute('SELECT id FROM files')).rows).toEqual([])
    expect((await client.execute('SELECT file_id FROM file_extensions')).rows).toEqual([])
    expect((await client.execute('SELECT file_id FROM file_index_progress')).rows).toEqual([])
    expect(
      (await client.execute('SELECT source_id,source_type FROM embeddings ORDER BY id')).rows
    ).toEqual([{ source_id: '1', source_type: 'note' }])
    expect((await client.execute('SELECT source_id,path FROM scan_progress')).rows).toEqual([
      { source_id: 'other-provider', path: observed.path }
    ])
    expect(await service.search('file-provider', 'indexedtitle')).toEqual([])
    expect(await service.search('other-provider', 'othertitle')).toEqual([
      expect.objectContaining({ itemId: observed.itemId })
    ])
    expect(await readFile(observed.path, 'utf8')).toBe('disk content must survive index cleanup')
  })

  it.each([
    { field: 'mtime', sql: 'UPDATE files SET mtime = 12' },
    { field: 'ctime', sql: 'UPDATE files SET ctime = 8' },
    { field: 'size', sql: 'UPDATE files SET size = 4' },
    { field: 'null size', sql: 'UPDATE files SET size = NULL' },
    { field: 'last indexed time', sql: 'UPDATE files SET last_indexed_at = 14' },
    { field: 'catalog ownership type', sql: "UPDATE files SET type = 'app'" },
    { field: 'path', sql: "UPDATE files SET path = '/a-different-indexed-path.txt'" }
  ])(
    'preserves the new version when $field changed after the candidate was read',
    async ({ sql }) => {
      await client.execute(sql)
      const before = (await client.execute('SELECT * FROM files')).rows
      const result = await db.transaction((tx) =>
        removeFileRecordsInTransaction(tx, service, 'file-provider', [observed])
      )
      expect(result.deletedRecords).toEqual([])
      expect(result.removedIndexedItems).toBe(0)
      expect(result.commitId).toBeNull()
      expect((await listPendingFileDeletionCommitsInHome(db, 'file-provider', 2)).commits).toEqual(
        []
      )
      expect((await client.execute('SELECT * FROM files')).rows).toEqual(before)
      expect((await client.execute('SELECT file_id,value FROM file_extensions')).rows).toEqual([
        { file_id: 1, value: 'persisted-icon' }
      ])
      expect(await service.search('file-provider', 'indexedtitle')).toEqual([
        expect.objectContaining({ itemId: observed.itemId })
      ])
    }
  )

  it('does not delete a recreated path owned by a different file ID', async () => {
    const result = await db.transaction((tx) =>
      removeFileRecordsInTransaction(tx, service, 'file-provider', [{ ...observed, id: 404 }])
    )
    expect(result.deletedRecords).toEqual([])
    expect((await client.execute('SELECT id,path FROM files')).rows).toEqual([
      { id: 1, path: observed.path }
    ])
    expect(await service.search('file-provider', 'indexedtitle')).toEqual([
      expect.objectContaining({ itemId: observed.itemId })
    ])
  })

  it('accepts a genuinely unchanged null-size fingerprint instead of treating null as zero', async () => {
    await client.execute('UPDATE files SET size = NULL')
    const expected = { ...observed, size: null }
    const result = await db.transaction((tx) =>
      removeFileRecordsInTransaction(tx, service, 'file-provider', [expected])
    )
    expect(result.deletedRecords).toEqual([expected])
    expect((await client.execute('SELECT id FROM files')).rows).toEqual([])
    expect(await service.search('file-provider', 'indexedtitle')).toEqual([])
  })

  it('rolls back FTS, keywords and metadata when a later derivative delete fails', async () => {
    const beforeMeta = (
      await client.execute('SELECT * FROM search_index_meta ORDER BY provider_id,item_id')
    ).rows
    const beforeProgress = (
      await client.execute('SELECT * FROM search_index_maintenance_progress ORDER BY task')
    ).rows
    await client.execute(`CREATE TRIGGER reject_embedding_delete BEFORE DELETE ON embeddings
      WHEN OLD.source_type = 'file' BEGIN
        SELECT RAISE(ABORT, 'injected derivative deletion failure');
      END`)
    await expect(
      db.transaction((tx) =>
        removeFileRecordsInTransaction(tx, service, 'file-provider', [observed])
      )
    ).rejects.toThrow()
    expect((await client.execute('SELECT id,path FROM files')).rows).toEqual([
      { id: 1, path: observed.path }
    ])
    expect((await client.execute('SELECT file_id,value FROM file_extensions')).rows).toEqual([
      { file_id: 1, value: 'persisted-icon' }
    ])
    expect((await client.execute('SELECT file_id,status FROM file_index_progress')).rows).toEqual([
      { file_id: 1, status: 'completed' }
    ])
    expect((await client.execute('SELECT source_type FROM embeddings ORDER BY id')).rows).toEqual([
      { source_type: 'file' },
      { source_type: 'note' }
    ])
    expect(
      (await client.execute('SELECT * FROM search_index_meta ORDER BY provider_id,item_id')).rows
    ).toEqual(beforeMeta)
    expect(
      (await client.execute('SELECT * FROM search_index_maintenance_progress ORDER BY task')).rows
    ).toEqual(beforeProgress)
    expect((await listPendingFileDeletionCommitsInHome(db, 'file-provider', 2)).commits).toEqual([])
    expect(await service.search('file-provider', 'indexedtitle')).toEqual([
      expect.objectContaining({ itemId: observed.itemId })
    ])
    expect(
      (await service.lookupByKeywords('file-provider', ['indexedtitle'])).get('indexedtitle')
    ).toEqual([{ itemId: observed.itemId, priority: 1.25 }])
    await client.execute('DROP TRIGGER reject_embedding_delete')
    expect(
      (
        await db.transaction((tx) =>
          removeFileRecordsInTransaction(tx, service, 'file-provider', [observed])
        )
      ).deletedRecords
    ).toEqual([observed])
    expect(await service.search('file-provider', 'indexedtitle')).toEqual([])
  })
})

describe('primary-home admission and missing-search cleanup', () => {
  it('defers a maintenance deletion when foreground starts after the initial idle check', async () => {
    const operation = removeFileRecordsInPrimaryHome(db, service, 'file-provider', [observed], {
      maintenance: true
    })
    // warmup is an awaited public operation: the initial idle check has run, but the
    // scheduler callback cannot run until this synchronous caller yields.
    beginForegroundSearchActivity('file-delete-test:foreground')
    expect(await operation).toMatchObject({
      deletedRecords: [],
      removedIndexedItems: 0,
      deferred: true
    })
    expect((await client.execute('SELECT id FROM files')).rows).toEqual([{ id: 1 }])
    expect(await service.search('file-provider', 'indexedtitle')).toEqual([
      expect.objectContaining({ itemId: observed.itemId })
    ])
  })

  it('keeps a user-requested deletion timely while foreground activity is ongoing', async () => {
    beginForegroundSearchActivity('file-delete-test:foreground')
    const result = await removeFileRecordsInPrimaryHome(db, service, 'file-provider', [observed], {
      maintenance: false
    })
    expect(result).toMatchObject({
      deletedRecords: [observed],
      removedIndexedItems: 1,
      deferred: false
    })
    expect((await client.execute('SELECT id FROM files')).rows).toEqual([])
    expect(await service.search('file-provider', 'indexedtitle')).toEqual([])
  })

  it('rejects cancellation between the initial check and primary write execution without deleting rows', async () => {
    const controller = new AbortController()
    const reason = new Error('cancelled before transaction')
    const operation = removeFileRecordsInPrimaryHome(db, service, 'file-provider', [observed], {
      maintenance: true,
      signal: controller.signal
    })
    const rejected = expect(operation).rejects.toBe(reason)
    controller.abort(reason)
    await rejected
    expect((await client.execute('SELECT id FROM files')).rows).toEqual([{ id: 1 }])
    expect(await service.search('file-provider', 'indexedtitle')).toEqual([
      expect.objectContaining({ itemId: observed.itemId })
    ])
  })

  it('does not treat a stale orphan candidate as authority when a file now owns its path', async () => {
    const result = await db.transaction((tx) =>
      removeMissingFileSearchRecordsInTransaction(tx, service, 'file-provider', [missingCandidate])
    )
    expect(result.deletedRecords).toEqual([])
    expect(await service.search('file-provider', 'indexedtitle')).toEqual([
      expect.objectContaining({ itemId: observed.itemId })
    ])
  })

  it('removes a truly orphaned current document but not another provider with the same ID', async () => {
    await client.execute('DELETE FROM files WHERE id = 1')
    const result = await db.transaction((tx) =>
      removeMissingFileSearchRecordsInTransaction(tx, service, 'file-provider', [missingCandidate])
    )
    expect(result.deletedRecords).toEqual([missingCandidate])
    expect(result.removedIndexedItems).toBe(1)
    expect(await service.search('file-provider', 'indexedtitle')).toEqual([])
    expect(await service.search('other-provider', 'othertitle')).toEqual([
      expect.objectContaining({ itemId: observed.itemId })
    ])
  })

  it('retains a replacement FTS document when an older orphan candidate arrives late', async () => {
    await client.execute('DELETE FROM files WHERE id = 1')
    await service.indexItems([
      {
        itemId: observed.itemId,
        providerId: 'file-provider',
        type: 'file',
        name: 'recreatedtitle',
        path: observed.path
      }
    ])
    const result = await db.transaction((tx) =>
      removeMissingFileSearchRecordsInTransaction(tx, service, 'file-provider', [missingCandidate])
    )
    expect(result.deletedRecords).toEqual([])
    expect(await service.search('file-provider', 'recreatedtitle')).toEqual([
      expect.objectContaining({ itemId: observed.itemId })
    ])
  })
})

describe('cancellation around the primary write boundary', () => {
  it('releases a cancelled waiting caller before the occupied write lane drains, without a later delete', async () => {
    const occupied = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const blocker = dbWriteScheduler.schedule(
      'file-delete-test.occupied-primary',
      async () => {
        occupied.resolve()
        await release.promise
      },
      { lane: 'primary', priority: 'background' }
    )
    await occupied.promise
    const controller = new AbortController()
    const reason = new Error('cancelled while waiting for writer')
    const operation = removeFileRecordsInPrimaryHome(db, service, 'file-provider', [observed], {
      maintenance: true,
      signal: controller.signal
    })
    const rejected = expect(operation).rejects.toBe(reason)
    try {
      controller.abort(reason)
      await rejected
      expect((await client.execute('SELECT id FROM files')).rows).toEqual([{ id: 1 }])
    } finally {
      release.resolve()
      await blocker
      await dbWriteScheduler.drain()
    }
    expect((await client.execute('SELECT id FROM files')).rows).toEqual([{ id: 1 }])
    expect(await service.search('file-provider', 'indexedtitle')).toEqual([
      expect.objectContaining({ itemId: observed.itemId })
    ])
  })

  it('returns the real committed result when cancellation arrives after a short transaction started', async () => {
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    // The FTS database boundary is paused, but all reads and writes still use the real
    // service and the same real transaction. No module registry or singleton is patched.
    class PausedSearchIndexService extends SearchIndexService {
      override async removeProviderItemsInTransaction(
        tx: SearchIndexWriteTx,
        providerId: string,
        itemIds: readonly string[]
      ): Promise<number> {
        entered.resolve()
        await release.promise
        return await super.removeProviderItemsInTransaction(tx, providerId, itemIds)
      }
    }
    const pausedService = new PausedSearchIndexService(db, {
      directMode: true,
      initializationMode: 'writer'
    })
    const controller = new AbortController()
    const operation = removeFileRecordsInPrimaryHome(
      db,
      pausedService,
      'file-provider',
      [observed],
      {
        maintenance: false,
        signal: controller.signal
      }
    )
    try {
      await entered.promise
      controller.abort(new Error('cancelled after transaction began'))
      release.resolve()
      expect(await operation).toMatchObject({
        deletedRecords: [observed],
        removedIndexedItems: 1,
        deferred: false
      })
      expect((await client.execute('SELECT id FROM files')).rows).toEqual([])
      expect(await service.search('file-provider', 'indexedtitle')).toEqual([])
    } finally {
      release.resolve()
      await operation
    }
  })
})

describe('persistent reconciliation record paging', () => {
  it('escapes wildcard roots, excludes sibling roots and other file types, and resumes without TEMP scan state', async () => {
    const root = '/roots/100%_!'
    const paths = [
      `${root}/first.txt`,
      '/roots/100XXz!/wildcard-neighbor.txt',
      `${root}suffix/neighbor.txt`,
      root,
      `${root}/not-a-file.app`,
      `${root}/last.txt`
    ]
    for (let index = 0; index < paths.length; index += 1) {
      await client.execute({
        sql: `INSERT INTO files(id,path,name,size,mtime,ctime,last_indexed_at,is_dir,type,embedding_status)
          VALUES (?,?,'fixture',3,11,7,13,0,?,'completed')`,
        args: [index + 10, paths[index], index === 4 ? 'app' : 'file']
      })
    }
    const dbUtils = { getFileIndexReadDb: () => db }
    const first = await getReconciliationFileRecordsPage(dbUtils as never, root, 0, 2)
    expect(first).toEqual([
      { id: 10, path: `${root}/first.txt`, mtime: 11, ctime: 7, size: 3, lastIndexedAt: 13 },
      { id: 13, path: root, mtime: 11, ctime: 7, size: 3, lastIndexedAt: 13 }
    ])
    const resumed = await getReconciliationFileRecordsPage(dbUtils as never, root, first[1].id, 2)
    expect(resumed).toEqual([
      { id: 15, path: `${root}/last.txt`, mtime: 11, ctime: 7, size: 3, lastIndexedAt: 13 }
    ])
  })
})

describe('durable deletion commit receipts', () => {
  it.each(['file records', 'missing search records'] as const)(
    'retains an unpublished %s commit across reopening so deleted rows are not required for recovery',
    async (kind) => {
      if (kind === 'missing search records') await client.execute('DELETE FROM files WHERE id = 1')
      const result =
        kind === 'file records'
          ? await db.transaction((tx) =>
              removeFileRecordsInTransaction(tx, service, 'file-provider', [observed])
            )
          : await db.transaction((tx) =>
              removeMissingFileSearchRecordsInTransaction(tx, service, 'file-provider', [
                missingCandidate
              ])
            )
      expect(await service.search('file-provider', 'indexedtitle')).toEqual([])
      client.close()
      client = createClient({ url: `file:${join(directory, 'index.sqlite')}` })
      db = drizzle(client, { schema })
      const pending = await listPendingFileDeletionCommitsInHome(db, 'file-provider', 2)
      expect(pending.commits).toEqual([
        {
          commitId: result.commitId,
          sourceId: 'file-provider',
          deletedRecords: kind === 'file records' ? [observed] : [missingCandidate],
          removedIndexedItems: 1
        }
      ])
      // No publication or acknowledgement occurred before the reopen. Physical deletion is
      // already committed, so recovery must use this payload rather than rescan deleted rows.
      expect(
        (await client.execute("SELECT item_id FROM search_index WHERE provider = 'file-provider'"))
          .rows
      ).toEqual([])
      expect(
        (await client.execute("SELECT item_id FROM search_index WHERE provider = 'other-provider'"))
          .rows
      ).toEqual([{ item_id: observed.itemId }])
    }
  )

  it('rolls back physical deletion and FTS when durable receipt persistence fails', async () => {
    await client.execute(`CREATE TRIGGER reject_commit_receipt BEFORE INSERT ON search_index_pending_commits BEGIN
      SELECT RAISE(ABORT, 'receipt persistence failed');
    END`)
    await expect(
      db.transaction((tx) =>
        removeFileRecordsInTransaction(tx, service, 'file-provider', [observed])
      )
    ).rejects.toThrow()
    expect((await client.execute('SELECT id,path FROM files')).rows).toEqual([
      { id: 1, path: observed.path }
    ])
    expect(await service.search('file-provider', 'indexedtitle')).toEqual([
      expect.objectContaining({ itemId: observed.itemId })
    ])
    expect(
      (await service.lookupByKeywords('file-provider', ['indexedtitle'])).get('indexedtitle')
    ).toEqual([{ itemId: observed.itemId, priority: 1.25 }])
    expect((await listPendingFileDeletionCommitsInHome(db, 'file-provider', 2)).commits).toEqual([])
  })

  it('acknowledges only the matching source and commit without physically deleting a recreated file', async () => {
    await db.transaction((tx) =>
      removeFileRecordsInTransaction(tx, service, 'file-provider', [observed])
    )
    const pending = await listPendingFileDeletionCommitsInHome(db, 'file-provider', 2)
    const receipt = pending.commits[0]
    await db.insert(schema.searchIndexPendingCommits).values({
      commitId: 'foreign-receipt',
      sourceId: 'other-provider',
      deletedRecords: JSON.stringify([observed]),
      removedIndexedItems: 1
    })
    await client.execute({
      sql: `INSERT INTO files(id,path,name,size,mtime,ctime,last_indexed_at,is_dir,type,embedding_status)
        VALUES (1,?,'recreated.txt',4,22,8,23,0,'file','completed')`,
      args: [observed.path]
    })
    await service.indexItems([
      {
        itemId: observed.itemId,
        providerId: 'file-provider',
        type: 'file',
        name: 'recreatedtitle',
        path: observed.path
      }
    ])
    expect(
      await acknowledgeFileDeletionCommitsInHome(db, 'other-provider', [receipt.commitId])
    ).toEqual({ acknowledged: 0, deferred: false })
    expect((await listPendingFileDeletionCommitsInHome(db, 'file-provider', 2)).commits).toEqual([
      receipt
    ])
    expect(
      await acknowledgeFileDeletionCommitsInHome(db, 'file-provider', [receipt.commitId])
    ).toEqual({ acknowledged: 1, deferred: false })
    expect(
      await acknowledgeFileDeletionCommitsInHome(db, 'file-provider', [receipt.commitId])
    ).toEqual({ acknowledged: 0, deferred: false })
    expect((await listPendingFileDeletionCommitsInHome(db, 'file-provider', 2)).commits).toEqual([])
    expect((await listPendingFileDeletionCommitsInHome(db, 'other-provider', 2)).commits).toEqual([
      {
        commitId: 'foreign-receipt',
        sourceId: 'other-provider',
        deletedRecords: [observed],
        removedIndexedItems: 1
      }
    ])
    expect((await client.execute('SELECT id,mtime FROM files')).rows).toEqual([
      { id: 1, mtime: 22 }
    ])
    expect(await service.search('file-provider', 'recreatedtitle')).toEqual([
      expect.objectContaining({ itemId: observed.itemId })
    ])
    expect(await service.search('other-provider', 'othertitle')).toEqual([
      expect.objectContaining({ itemId: observed.itemId })
    ])
  })

  it('lists a bounded oldest-first page independently for each source', async () => {
    for (const commitId of ['z-first', 'a-second', 'b-third']) {
      await db.insert(schema.searchIndexPendingCommits).values({
        commitId,
        sourceId: 'file-provider',
        deletedRecords: JSON.stringify([observed]),
        removedIndexedItems: 1
      })
    }
    expect(
      (await listPendingFileDeletionCommitsInHome(db, 'file-provider', 2)).commits.map(
        (receipt) => receipt.commitId
      )
    ).toEqual(['z-first', 'a-second'])
    await acknowledgeFileDeletionCommitsInHome(db, 'file-provider', ['z-first'])
    expect(
      (await listPendingFileDeletionCommitsInHome(db, 'file-provider', 2)).commits.map(
        (receipt) => receipt.commitId
      )
    ).toEqual(['a-second', 'b-third'])
  })
})

describe('queued configuration authorization', () => {
  it('defers a previously admitted deletion if its configuration is no longer current before the writer executes', async () => {
    let current = true
    const operation = removeFileRecordsInPrimaryHome(db, service, 'file-provider', [observed], {
      maintenance: true,
      isStillCurrent: () => current
    })
    current = false
    expect(await operation).toMatchObject({
      deletedRecords: [],
      removedIndexedItems: 0,
      commitId: null,
      deferred: true
    })
    expect((await client.execute('SELECT id,path FROM files')).rows).toEqual([
      { id: 1, path: observed.path }
    ])
    expect(await service.search('file-provider', 'indexedtitle')).toEqual([
      expect.objectContaining({ itemId: observed.itemId })
    ])
    expect((await listPendingFileDeletionCommitsInHome(db, 'file-provider', 2)).commits).toEqual([])
  })
})

describe('same-provider numeric legacy identity fencing', () => {
  it.each([
    {
      name: 'a different-home numeric alias',
      pathMatches: false,
      located: true,
      removed: 1,
      kept: true
    },
    {
      name: 'a matching-path numeric alias',
      pathMatches: true,
      located: true,
      removed: 2,
      kept: false
    },
    {
      name: 'an unlocated numeric alias',
      pathMatches: true,
      located: false,
      removed: 1,
      kept: true
    }
  ])(
    'deletes the canonical document while safely handling $name',
    async ({ pathMatches, located, removed, kept }) => {
      await service.indexItems([
        {
          itemId: '1',
          providerId: 'file-provider',
          type: 'file',
          name: 'legacyaliastitle',
          path: pathMatches ? observed.path : '/different/home/Foreign.txt'
        }
      ])
      if (!located)
        await client.execute(
          "UPDATE search_index_meta SET fts_rowid = NULL WHERE provider_id = 'file-provider' AND item_id = '1'"
        )
      const expected = { ...observed, legacyItemIds: ['1'] }
      const result = await db.transaction((tx) =>
        removeFileRecordsInTransaction(tx, service, 'file-provider', [expected])
      )
      const published = { ...expected, legacyItemIds: kept ? [] : ['1'] }
      expect(result.deletedRecords).toEqual([published])
      expect(expected.legacyItemIds).toEqual(['1'])
      expect(result.removedIndexedItems).toBe(removed)
      expect((await client.execute('SELECT id FROM files')).rows).toEqual([])
      expect(await service.search('file-provider', 'indexedtitle')).toEqual([])
      expect(
        (await service.search('file-provider', 'legacyaliastitle')).map((row) => row.itemId)
      ).toEqual(kept ? ['1'] : [])
      expect(
        (await service.lookupByKeywords('file-provider', ['legacyaliastitle'])).get(
          'legacyaliastitle'
        ) ?? []
      ).toEqual(kept ? [{ itemId: '1', priority: 1.25 }] : [])
      expect(
        (
          await client.execute(
            "SELECT item_id FROM search_index_meta WHERE provider_id = 'file-provider' AND item_id = '1'"
          )
        ).rows
      ).toEqual(kept ? [{ item_id: '1' }] : [])
      expect((await listPendingFileDeletionCommitsInHome(db, 'file-provider', 2)).commits).toEqual([
        {
          commitId: result.commitId,
          sourceId: 'file-provider',
          deletedRecords: [published],
          removedIndexedItems: removed
        }
      ])
      expect(await service.search('other-provider', 'othertitle')).toEqual([
        expect.objectContaining({ itemId: observed.itemId })
      ])
    }
  )
})

describe('missing file-source document versus application ownership', () => {
  it('removes orphaned file-source FTS without deleting an app catalog row or another provider at the same path', async () => {
    await client.execute("UPDATE files SET type = 'app'")
    await service.indexItems([
      {
        itemId: observed.itemId,
        providerId: 'other-provider',
        type: 'app',
        name: 'othertitle',
        path: observed.path
      }
    ])
    const result = await db.transaction((tx) =>
      removeMissingFileSearchRecordsInTransaction(tx, service, 'file-provider', [missingCandidate])
    )
    expect(result.deletedRecords).toEqual([missingCandidate])
    expect(result.removedIndexedItems).toBe(1)
    expect((await client.execute('SELECT id,path,type,mtime FROM files')).rows).toEqual([
      { id: 1, path: observed.path, type: 'app', mtime: 11 }
    ])
    expect((await client.execute('SELECT file_id,value FROM file_extensions')).rows).toEqual([
      { file_id: 1, value: 'persisted-icon' }
    ])
    expect(await service.search('file-provider', 'indexedtitle')).toEqual([])
    expect(await service.search('other-provider', 'othertitle')).toEqual([
      expect.objectContaining({ itemId: observed.itemId })
    ])
    expect((await listPendingFileDeletionCommitsInHome(db, 'file-provider', 2)).commits).toEqual([
      {
        commitId: result.commitId,
        sourceId: 'file-provider',
        deletedRecords: [missingCandidate],
        removedIndexedItems: 1
      }
    ])
  })
})

describe('maintenance consumer actual commit publication', () => {
  async function maintenanceFor(
    publish: FileIndexedSourceRuntimeMutationDelegate['publishFileDeletionCommit']
  ) {
    const unsupported = (): never => {
      throw new Error('unexpected maintenance dependency operation')
    }
    const delegate: FileIndexedSourceRuntimeMutationDelegate = {
      withMutationLease: async (operation) => await operation('fixture-owned-source-lease'),
      publishFileDeletionCommit: publish,
      applyBatch: unsupported,
      applyBatchWithPersistence: unsupported,
      cleanupSource: unsupported,
      countSource: unsupported,
      publishContentCleared: unsupported,
      drainSource: unsupported,
      scanSource: unsupported
    }
    const maintenance = new FileProviderMaintenanceService({
      sourceId: 'file-provider',
      getDbUtils: () => ({ getFileIndexReadDb: () => db }) as never,
      getSearchIndex: () => service,
      getFilePersistencePort: unsupported,
      getRuntimeMutationDelegate: () => delegate,
      isSplitEnabled: () => false,
      isShuttingDown: () => false,
      isInitializing: () => false,
      isWithinWatchRoots: (filePath) => filePath.startsWith(`${directory}/`),
      normalizePath: normalize,
      mapRecord: unsupported,
      onBaseCommitReady: () => undefined,
      emitCleanupProgress: () => undefined,
      logInfo: () => undefined,
      logDebug: () => undefined,
      logWarn: () => undefined
    })
    maintenance.updateConfiguration([directory], [])
    await maintenance.cancelRun()
    return maintenance
  }

  function observedDates(): FileProviderReconciliationDbRecord {
    return {
      id: observed.id,
      path: observed.path,
      size: observed.size,
      mtime: new Date(observed.mtime * 1000),
      ctime: new Date(observed.ctime * 1000),
      lastIndexedAt: new Date(observed.lastIndexedAt * 1000)
    }
  }

  it('publishes watch removal only after the same-home transaction is visible, without requiring returned delta replay', async () => {
    vi.useFakeTimers({ toFake: ['performance'] })
    await service.removeProviderItems('file-provider', [observed.itemId])
    await service.indexItems([
      {
        itemId: observed.path,
        providerId: 'file-provider',
        type: 'file',
        name: 'watchtitle',
        path: observed.path
      }
    ])
    await unlink(observed.path)
    const observer = createClient({ url: `file:${join(directory, 'index.sqlite')}` })
    const snapshots: Array<{
      fileIds: unknown[]
      indexIds: unknown[]
      affected: number
      paths: string[]
    }> = []
    const maintenance = await maintenanceFor(async (commit) => {
      snapshots.push({
        fileIds: (await observer.execute('SELECT id FROM files')).rows.map((row) => row.id),
        indexIds: (
          await observer.execute(
            "SELECT item_id FROM search_index WHERE provider = 'file-provider'"
          )
        ).rows.map((row) => row.item_id),
        affected: commit.removedIndexedItems,
        paths: commit.deletedRecords.map((record) => record.path)
      })
    })
    try {
      const result = await maintenance.deleteFileRecords([observedDates()], 'watch', {
        maintenance: false
      })
      expect(result).toMatchObject({
        deletedIds: [1],
        deletedPaths: [observed.path],
        deferred: false
      })
      expect(snapshots).toEqual([
        { fileIds: [], indexIds: [], affected: 1, paths: [observed.path] }
      ])
      expect((await listPendingFileDeletionCommitsInHome(db, 'file-provider', 2)).commits).toEqual(
        []
      )
      expect(await service.search('other-provider', 'othertitle')).toEqual([
        expect.objectContaining({ itemId: observed.itemId })
      ])
    } finally {
      await maintenance.stop()
      observer.close()
      vi.useRealTimers()
    }
  })

  it('retains a publication failure receipt across reopening and only-publishes replay without deleting a new file version', async () => {
    vi.useFakeTimers({ toFake: ['performance'] })
    await service.removeProviderItems('file-provider', [observed.itemId])
    await service.indexItems([
      {
        itemId: observed.path,
        providerId: 'file-provider',
        type: 'file',
        name: 'watchtitle',
        path: observed.path
      }
    ])
    await unlink(observed.path)
    const failure = new Error('publication channel unavailable')
    const first = await maintenanceFor(async () => {
      throw failure
    })
    let replay: FileProviderMaintenanceService | undefined
    try {
      await expect(
        first.deleteFileRecords([observedDates()], 'watch', { maintenance: false })
      ).rejects.toBe(failure)
      expect((await client.execute('SELECT id FROM files')).rows).toEqual([])
      expect((await listPendingFileDeletionCommitsInHome(db, 'file-provider', 2)).commits).toEqual([
        expect.objectContaining({ sourceId: 'file-provider', removedIndexedItems: 1 })
      ])
      await first.stop()
      client.close()
      client = createClient({ url: `file:${join(directory, 'index.sqlite')}` })
      db = drizzle(client, { schema })
      service = new SearchIndexService(db, { directMode: true, initializationMode: 'writer' })
      await client.execute({
        sql: `INSERT INTO files(id,path,name,size,mtime,ctime,last_indexed_at,is_dir,type,embedding_status)
          VALUES (1,?,'new-version.txt',4,22,8,23,0,'file','completed')`,
        args: [observed.path]
      })
      await service.indexItems([
        {
          itemId: observed.path,
          providerId: 'file-provider',
          type: 'file',
          name: 'recreatedwatchtitle',
          path: observed.path
        }
      ])
      const publishedPaths: string[][] = []
      replay = await maintenanceFor(async (commit) => {
        publishedPaths.push(commit.deletedRecords.map((record) => record.path))
        expect((await client.execute('SELECT id,mtime FROM files')).rows).toEqual([
          { id: 1, mtime: 22 }
        ])
        expect(await service.search('file-provider', 'recreatedwatchtitle')).toEqual([
          expect.objectContaining({ itemId: observed.path })
        ])
      })
      expect(await replay.replayPendingFileDeletionCommits({ maintenance: false })).toBe(true)
      expect(publishedPaths).toEqual([[observed.path]])
      expect((await listPendingFileDeletionCommitsInHome(db, 'file-provider', 2)).commits).toEqual(
        []
      )
      expect((await client.execute('SELECT id,mtime FROM files')).rows).toEqual([
        { id: 1, mtime: 22 }
      ])
    } finally {
      await first.stop()
      await replay?.stop()
      vi.useRealTimers()
    }
  })
})
