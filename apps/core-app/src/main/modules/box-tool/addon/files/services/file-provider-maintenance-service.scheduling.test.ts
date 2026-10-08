import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, normalize } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../../../../db/schema'
import { markSearchActivity } from '../../../search-engine/search-activity'
import type { FileIndexedSourceRuntimeMutationDelegate } from '../file-provider-index-contracts'
import { listPendingFileDeletionCommitsInHome } from '../../../search-engine/file-index-persistence-repository'
import { SearchIndexService } from '../../../search-engine/search-index-service'
import { FileProviderMaintenanceService } from './file-provider-maintenance-service'

let client: Client | undefined
let directory: string | undefined
let maintenance: FileProviderMaintenanceService | undefined
let releasePublication: (() => void) | undefined

afterEach(async () => {
  releasePublication?.()
  await maintenance?.stop()
  client?.close()
  if (directory) await rm(directory, { recursive: true, force: true })
  markSearchActivity(0)
  vi.useRealTimers()
})

async function openProfile(prefix: string) {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const connection = createClient({ url: `file:${join(root, 'index.sqlite')}` })
  directory = root
  client = connection
  await connection.executeMultiple(`
    CREATE TABLE files (
      id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
      size INTEGER, mtime INTEGER NOT NULL, ctime INTEGER NOT NULL,
      last_indexed_at INTEGER NOT NULL, is_dir INTEGER NOT NULL, type TEXT NOT NULL
    );
    CREATE TABLE file_extensions (file_id INTEGER NOT NULL, key TEXT NOT NULL, value TEXT);
    CREATE TABLE file_index_progress (file_id INTEGER PRIMARY KEY, status TEXT NOT NULL);
    CREATE TABLE embeddings (id INTEGER PRIMARY KEY, source_id TEXT NOT NULL, source_type TEXT NOT NULL);
    CREATE TABLE scan_progress (source_id TEXT NOT NULL, path TEXT NOT NULL, last_scanned INTEGER NOT NULL,
      PRIMARY KEY(source_id,path));
    CREATE TABLE keyword_mappings (id INTEGER PRIMARY KEY AUTOINCREMENT,keyword TEXT NOT NULL,
      item_id TEXT NOT NULL,provider_id TEXT NOT NULL,priority REAL NOT NULL);
    CREATE TABLE search_index_maintenance_progress (task TEXT PRIMARY KEY NOT NULL,cursor INTEGER NOT NULL);
    CREATE TABLE search_index_pending_commits (commit_id TEXT PRIMARY KEY NOT NULL,source_id TEXT NOT NULL,
      deleted_records TEXT NOT NULL,removed_indexed_items INTEGER NOT NULL);
    CREATE TABLE search_index_file_maintenance (task_id TEXT PRIMARY KEY NOT NULL,source_id TEXT NOT NULL,
      reason TEXT NOT NULL,file_path TEXT NOT NULL,expected_record TEXT,cursor INTEGER NOT NULL);
  `)
  const db = drizzle(connection, { schema })
  const search = new SearchIndexService(db, { directMode: true, initializationMode: 'writer' })
  await search.warmup()
  return { db, search, client: connection, root }
}

describe('file maintenance cleanup scheduling convergence', () => {
  it('continues remaining configuration cleanup through an empty work round and naturally stops after convergence', async () => {
    // The cooperative setImmediate and libSQL I/O remain real. Only the repeat timer and
    // publication cost clock are controlled; no wall-clock sleep or test timeout extension.
    vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    markSearchActivity(0)
    const { db, search, client } = await openProfile('tuff-maintenance-rounds-')
    const total = 137
    await client.execute(`INSERT INTO files(id,path,name,size,mtime,ctime,last_indexed_at,is_dir,type)
      VALUES ${Array.from(
        { length: total },
        (_, index) =>
          `(${index + 1},'/withdrawn/${index + 1}.txt','fixture.txt',3,11,7,13,0,'file')`
      ).join(',')}`)
    const unsupported = (): never => {
      throw new Error('unexpected scheduling fixture operation')
    }
    const publicationEntered = Promise.withResolvers<void>()
    const publicationReleased = Promise.withResolvers<void>()
    releasePublication = () => publicationReleased.resolve()
    let firstPublication = true
    const publishedIds = new Set<number>()
    const delegate: FileIndexedSourceRuntimeMutationDelegate = {
      withMutationLease: async (operation) => await operation('fixture-short-source-lease'),
      publishFileDeletionCommit: async (commit) => {
        for (const record of commit.deletedRecords) {
          if (!('id' in record)) throw new Error('expected actual configuration file deletion')
          publishedIds.add(record.id)
        }
        if (firstPublication) {
          firstPublication = false
          publicationEntered.resolve()
          await publicationReleased.promise
        }
      },
      applyBatch: unsupported,
      applyBatchWithPersistence: unsupported,
      cleanupSource: unsupported,
      countSource: unsupported,
      publishContentCleared: unsupported,
      drainSource: unsupported,
      scanSource: unsupported
    }
    const warnings: unknown[] = []
    maintenance = new FileProviderMaintenanceService({
      sourceId: 'file-provider',
      getDbUtils: () => ({ getFileIndexReadDb: () => db }) as never,
      getSearchIndex: () => search,
      getFilePersistencePort: unsupported,
      getRuntimeMutationDelegate: () => delegate,
      isSplitEnabled: () => false,
      isShuttingDown: () => false,
      isInitializing: () => false,
      isWithinWatchRoots: (path) => path.startsWith('/current/'),
      normalizePath: normalize,
      mapRecord: unsupported,
      onBaseCommitReady: () => undefined,
      emitCleanupProgress: () => undefined,
      logInfo: () => undefined,
      logDebug: () => undefined,
      logWarn: (_message, error) => {
        warnings.push(error)
      }
    })
    // There is no public round-completion wait. Await this known in-process promise only for
    // synchronization; all assertions below observe real data/publications/timer resources.
    const lifecycle = maintenance as unknown as { maintenanceRun: Promise<void> | null }
    async function advanceRound(): Promise<void> {
      await vi.advanceTimersByTimeAsync(1000)
      await lifecycle.maintenanceRun
      await Promise.resolve()
    }
    const timerBaseline = vi.getTimerCount()
    maintenance.updateConfiguration(['/current'], [])
    let firstRound: Promise<void> | undefined
    try {
      firstRound = advanceRound()
      await publicationEntered.promise
      // The first actual publication consumes its round budget; this forces remaining work
      // without pinning the configurable pages-per-round or an exact first deleted count.
      await vi.advanceTimersByTimeAsync(2000)
      publicationReleased.resolve()
      await firstRound
      const remaining = Number(
        (await client.execute('SELECT COUNT(*) AS count FROM files')).rows[0].count
      )
      expect(remaining).toBeGreaterThan(0)
      expect(remaining).toBeLessThan(total)
      expect(
        (await client.execute('SELECT task_id FROM search_index_file_maintenance')).rows
      ).toEqual([])
      await advanceRound() // The intervening work round has no durable work-table entries.
      expect(
        Number((await client.execute('SELECT COUNT(*) AS count FROM files')).rows[0].count)
      ).toBe(remaining)
      for (let round = 0; round < 8 && vi.getTimerCount() > timerBaseline; round += 1) {
        await advanceRound()
      }
      expect((await client.execute('SELECT id FROM files')).rows).toEqual([])
      expect([...publishedIds].sort((left, right) => left - right)).toEqual(
        Array.from({ length: total }, (_, index) => index + 1)
      )
      expect((await listPendingFileDeletionCommitsInHome(db, 'file-provider', 2)).commits).toEqual(
        []
      )
      expect(warnings).toEqual([])
      expect(vi.getTimerCount()).toBe(timerBaseline)
    } finally {
      publicationReleased.resolve()
      await firstRound?.catch(() => undefined)
      await maintenance.stop()
    }
  })
})

describe('durable orphan discovery identity convergence', () => {
  it('retires unlocated and backfilled tasks for one identity together, finishes peer work and preserves replacement/provider ownership', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'performance', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'))
    markSearchActivity(0)
    const { db, search, client, root } = await openProfile('tuff-orphan-composite-')
    const shared = join(root, 'shared-orphan.txt')
    const peer = join(root, 'peer-orphan.txt')
    const replaced = join(root, 'replacement.txt')
    for (const [itemId, title] of [
      [shared, 'legacysharedtitle'],
      [peer, 'legacypeertitle'],
      [replaced, 'protectedoldtitle']
    ]) {
      await client.execute({
        sql: `INSERT INTO search_index(item_id,provider,type,title,title_compact,keywords,tags,path,content)
          VALUES (?,'file-provider','file',?,?,?,'',?,'')`,
        args: [itemId, title, title, title, itemId.toLowerCase()]
      })
      await client.execute({
        sql: 'INSERT INTO keyword_mappings(keyword,item_id,provider_id,priority) VALUES (?,?,?,3)',
        args: [title, itemId, 'file-provider']
      })
    }
    // Fixture writes use the actual atomic source API: indexItems deliberately paces each
    // direct-mode batch with setTimeout, which must not be awaited on this paused fake clock.
    await search.applyProviderItems(
      'other-provider',
      [
        {
          itemId: shared,
          providerId: 'other-provider',
          type: 'file',
          name: 'foreignsharedtitle',
          path: shared
        }
      ],
      []
    )
    const unsupported = (): never => {
      throw new Error('unexpected orphan consumer operation')
    }
    const published: Array<{ itemIds: string[]; affected: number }> = []
    const delegate: FileIndexedSourceRuntimeMutationDelegate = {
      withMutationLease: async (operation) => await operation('fixture-orphan-source-lease'),
      publishFileDeletionCommit: async (commit) => {
        published.push({
          itemIds: commit.deletedRecords.map((record) => record.itemId).sort(),
          affected: commit.removedIndexedItems
        })
        expect(await search.search('file-provider', 'legacysharedtitle')).toEqual([])
        expect(await search.search('file-provider', 'legacypeertitle')).toEqual([])
      },
      applyBatch: unsupported,
      applyBatchWithPersistence: unsupported,
      cleanupSource: unsupported,
      countSource: unsupported,
      publishContentCleared: unsupported,
      drainSource: unsupported,
      scanSource: unsupported
    }
    const warnings: unknown[] = []
    const consumer = new FileProviderMaintenanceService({
      sourceId: 'file-provider',
      getDbUtils: () => ({ getFileIndexReadDb: () => db }) as never,
      getSearchIndex: () => search,
      getFilePersistencePort: unsupported,
      getRuntimeMutationDelegate: () => delegate,
      isSplitEnabled: () => false,
      isShuttingDown: () => false,
      isInitializing: () => false,
      isWithinWatchRoots: (filePath) => filePath.startsWith(`${root}/`),
      normalizePath: normalize,
      mapRecord: unsupported,
      onBaseCommitReady: () => undefined,
      emitCleanupProgress: () => undefined,
      logInfo: () => undefined,
      logDebug: () => undefined,
      logWarn: (_message, error) => {
        warnings.push(error)
      }
    })
    maintenance = consumer
    const timerBaseline = vi.getTimerCount()
    consumer.updateConfiguration([root], [])
    try {
      // The first public discovery sees real legacy FTS but no metadata locator/hash yet.
      await consumer.enqueueOrphanSearchCandidates([shared, peer])
      let backfilled = false
      for (let page = 0; page < 8 && !backfilled; page += 1) {
        backfilled = (await search.backfillDocumentLocators(64)).done
      }
      expect(backfilled).toBe(true)
      // A later real discovery of the same item now captures its trustworthy backfilled version.
      await consumer.enqueueOrphanSearchCandidates([shared, replaced])
      const discoveries = (
        await client.execute({
          sql: `SELECT expected_record FROM search_index_file_maintenance
          WHERE source_id = 'file-provider' AND file_path = ? ORDER BY rowid`,
          args: [shared]
        })
      ).rows.map((row) => JSON.parse(String(row.expected_record)))
      expect(discoveries[0]).toEqual({ itemId: shared, filesystemPath: shared })
      const current = (
        await client.execute({
          sql: `SELECT fts_rowid,document_hash,updated_at FROM search_index_meta
          WHERE provider_id = 'file-provider' AND item_id = ?`,
          args: [shared]
        })
      ).rows[0]
      expect(discoveries[1]).toEqual({
        itemId: shared,
        path: shared.toLowerCase(),
        ftsRowid: current.fts_rowid,
        documentHash: current.document_hash,
        updatedAt: current.updated_at,
        filesystemPath: shared
      })
      expect(discoveries).toHaveLength(2)
      // An observed mapped candidate that has genuinely changed must be retired, not delete
      // its current replacement. It is on the same bounded page as the two shared-ID tasks.
      await search.applyProviderItems(
        'file-provider',
        [
          {
            itemId: replaced,
            providerId: 'file-provider',
            type: 'file',
            name: 'protectednewtitle',
            path: replaced
          }
        ],
        []
      )
      await db.insert(schema.searchIndexFileMaintenance).values({
        taskId: 'foreign-work',
        sourceId: 'other-provider',
        reason: 'orphan-search',
        filePath: shared,
        expectedRecord: JSON.stringify({ itemId: shared, filesystemPath: shared }),
        cursor: 0
      })
      // There is no public round-completion wait; synchronize this known owned run only,
      // while validating the public database/publication outcome rather than phase flags.
      const lifecycle = consumer as unknown as { maintenanceRun: Promise<void> | null }
      for (let round = 0; round < 12 && vi.getTimerCount() > timerBaseline; round += 1) {
        await vi.advanceTimersByTimeAsync(1000)
        await lifecycle.maintenanceRun
        await Promise.resolve()
      }
      expect(
        (
          await client.execute(
            "SELECT task_id FROM search_index_file_maintenance WHERE source_id = 'file-provider'"
          )
        ).rows
      ).toEqual([])
      expect(published).toEqual([{ itemIds: [shared, peer].sort(), affected: 2 }])
      expect(await search.search('file-provider', 'legacysharedtitle')).toEqual([])
      expect(await search.search('file-provider', 'legacypeertitle')).toEqual([])
      expect(
        (await search.search('file-provider', 'protectednewtitle')).map((row) => row.itemId)
      ).toEqual([replaced])
      expect(
        (await search.lookupByKeywords('file-provider', ['protectednewtitle'])).get(
          'protectednewtitle'
        )
      ).toEqual([{ itemId: replaced, priority: 1.25 }])
      expect(
        (await search.search('other-provider', 'foreignsharedtitle')).map((row) => row.itemId)
      ).toEqual([shared])
      expect(
        (await client.execute('SELECT task_id,source_id FROM search_index_file_maintenance')).rows
      ).toEqual([{ task_id: 'foreign-work', source_id: 'other-provider' }])
      expect((await listPendingFileDeletionCommitsInHome(db, 'file-provider', 2)).commits).toEqual(
        []
      )
      expect(warnings).toEqual([])
      expect(vi.getTimerCount()).toBe(timerBaseline)
    } finally {
      await consumer.stop()
    }
  })
})
