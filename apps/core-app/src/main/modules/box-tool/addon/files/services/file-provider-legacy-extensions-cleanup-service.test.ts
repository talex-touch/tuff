import { createClient, type Client, type InValue } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../../../../db/schema'
import { createDbUtils } from '../../../../../db/utils'
import { FILE_ICON_MAX_BYTES } from '../../../../../service/file-icon-artifact'
import { searchIndexWriter } from '../../../search-engine/search-index-writer'
import { FileProviderBootPassService } from './file-provider-boot-pass-service'
import { FileProviderExtensionService } from './file-provider-extension-service'
import { FileProviderIconMigrationService } from './file-provider-icon-migration-service'
import {
  FILE_LEGACY_EXTENSIONS_CLEANUP_VERSION,
  FileProviderLegacyExtensionsCleanupService
} from './file-provider-legacy-extensions-cleanup-service'

const PNG_2X2 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAG0lEQVR4nGNgYPj/n5H5/38Gdsb//zlY/v8HAEBuCBGhphy2AAAAAElFTkSuQmCC',
  'base64'
)
const PNG_DATA_URL_PREFIX = 'data:image/png;base64,'

const clients: Client[] = []
const tempDirs: string[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  for (const client of clients.splice(0)) client.close()
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

async function openSqliteFixture(name: string) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tuff-legacy-ext-cleanup-'))
  tempDirs.push(dir)
  const client = createClient({ url: `file:${path.join(dir, `${name}.sqlite`)}` })
  clients.push(client)
  await client.executeMultiple(`
    CREATE TABLE config (key TEXT PRIMARY KEY, value TEXT);
    CREATE TABLE files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      display_name TEXT,
      extension TEXT,
      size INTEGER,
      mtime INTEGER NOT NULL DEFAULT 0,
      ctime INTEGER NOT NULL DEFAULT 0,
      last_indexed_at INTEGER NOT NULL DEFAULT 0,
      is_dir INTEGER NOT NULL DEFAULT 0,
      type TEXT NOT NULL DEFAULT 'file',
      content TEXT,
      embedding_status TEXT NOT NULL DEFAULT 'none'
    );
    CREATE TABLE file_extensions (
      file_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (file_id, key)
    );
  `)
  return { dir, client, db: drizzle(client, { schema }) }
}

describe('A15 unread file_extensions retirement and bounded cleanup', () => {
  it('never queries or writes file_extensions.keywords in FileProviderExtensionService', async () => {
    const getFileExtensionsByFileIds = vi.fn()
    const addFileExtensions = vi.fn()
    const waitForCacheWriteCapacity = vi.fn()
    const service = new FileProviderExtensionService({
      getDbUtils: () =>
        ({
          getFileExtensionsByFileIds,
          addFileExtensions
        }) as never,
      isSearchSplitEnabledNow: () => true,
      waitForCacheWriteCapacity
    })

    await service.processFileExtensions([
      {
        id: 1,
        path: '/Users/demo/Documents/notes.md',
        name: 'notes.md',
        displayName: null,
        extension: '.md',
        size: 16,
        mtime: new Date(1_000),
        ctime: new Date(1_000),
        lastIndexedAt: new Date(1_000),
        isDir: false,
        type: 'file',
        content: null,
        embeddingStatus: 'none'
      }
    ])

    expect(getFileExtensionsByFileIds).not.toHaveBeenCalled()
    expect(addFileExtensions).not.toHaveBeenCalled()
    expect(waitForCacheWriteCapacity).not.toHaveBeenCalled()
  })

  it.each(['split', 'primary'] as const)(
    'converts valid PNG icons first, then cleans keywords, orphan extensions, and leftover data: rows on %s without touching apps or content_chunks',
    async (topology) => {
      const primary = await openSqliteFixture(`primary-${topology}`)
      const search = topology === 'split' ? await openSqliteFixture('search') : primary
      const cacheDir = path.join(primary.dir, 'file-icons')

      const validPngDataUrl = `${PNG_DATA_URL_PREFIX}${PNG_2X2.toString('base64')}`
      const oversizedPngDataUrl = `${PNG_DATA_URL_PREFIX}${'A'.repeat(
        4 * Math.ceil(FILE_ICON_MAX_BYTES / 3) + 16
      )}`
      const brokenPngDataUrl = `${PNG_DATA_URL_PREFIX}@@@broken@@@`
      const jpegDataUrl = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/'
      const thumbnailDataUrl =
        'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA='

      await search.client.executeMultiple(`
        INSERT INTO files (id, path, name, extension, type) VALUES
          (1, '/Applications/Demo.app', 'Demo.app', '.app', 'app'),
          (2, '/Users/demo/doc.md', 'doc.md', '.md', 'file'),
          (3, '/Users/demo/photo.jpg', 'photo.jpg', '.jpg', 'file'),
          (4, '/Users/demo/huge-icon.pdf', 'huge-icon.pdf', '.pdf', 'file'),
          (5, '/Users/demo/broken-icon.txt', 'broken-icon.txt', '.txt', 'file');
      `)

      const seedRows: Array<[number, string, string]> = [
        // App row: keep everything, including data: icon
        [1, 'icon', validPngDataUrl],
        [1, 'bundleId', 'com.example.demo'],
        // File 2: valid PNG data URL (should migrate to file path), unread keywords (drop), valid chunks (keep)
        [2, 'icon', validPngDataUrl],
        [2, 'keywords', '["markdown","document"]'],
        [2, 'content_chunks', '[{"text":"kept chunk"}]'],
        // File 3: non-PNG data: icon (drop), legacy data: thumbnail (drop), path thumbnailStatus (keep)
        [3, 'icon', jpegDataUrl],
        [3, 'thumbnail', thumbnailDataUrl],
        [3, 'thumbnailStatus', '{"status":"generated","v":2,"at":1}'],
        [3, 'keywords', '["image"]'],
        // File 4: oversized PNG data URL (skipped by converter -> dropped by cleanup) + path thumbnail (keep)
        [4, 'icon', oversizedPngDataUrl],
        [4, 'thumbnail', '/cache/file-thumbnails/kept.png'],
        // File 5: malformed PNG data URL (failed converter -> dropped by cleanup)
        [5, 'icon', brokenPngDataUrl],
        // File 999: orphan file_extensions rows with no files row at all (drop all)
        [999, 'icon', validPngDataUrl],
        [999, 'keywords', '["orphan"]'],
        [999, 'content_chunks', '[{"text":"orphan chunk"}]']
      ]
      for (const [fileId, key, value] of seedRows) {
        await search.client.execute({
          sql: 'INSERT INTO file_extensions (file_id, key, value) VALUES (?, ?, ?)',
          args: [fileId, key, value]
        })
      }

      const execWriteCalls: Array<{ sql: string; args: unknown[] }[]> = []
      const execWriteSpy = vi
        .spyOn(searchIndexWriter, 'execWrite')
        .mockImplementation(async (statements) => {
          execWriteCalls.push(statements)
          const batchResult = await search.client.batch(
            statements.map((stmt) => ({ sql: stmt.sql, args: stmt.args as InValue[] })),
            'write'
          )
          return batchResult.map((entry) => ({
            rowsAffected: Number(entry.rowsAffected ?? 0),
            lastInsertRowid: null,
            rows: []
          }))
        })

      const dbUtils = createDbUtils(
        primary.db,
        primary.db,
        topology === 'split'
          ? {
              enabled: true,
              searchDb: search.db,
              writer: searchIndexWriter
            }
          : undefined
      )

      const iconMigration = new FileProviderIconMigrationService({
        getDbUtils: () => dbUtils,
        getCacheDirectory: () => cacheDir,
        withDbWrite: async (_label, op) => await op(),
        isStopping: () => false,
        waitForIdle: async () => undefined,
        yieldToEventLoop: async () => undefined,
        logInfo: () => undefined,
        logWarn: () => undefined
      })

      const bootPass = new FileProviderBootPassService({
        sourceId: 'file-provider',
        getDbUtils: () => dbUtils,
        isShuttingDown: () => false,
        isSearchSplitEnabled: () => topology === 'split',
        isRuntimeReady: () => true,
        getRuntimeMutationDelegate: () => ({}) as never,
        getMaintenance: () => ({ signal: new AbortController().signal }) as never,
        runLegacyIconMigration: () => iconMigration.run(),
        getWatchPaths: () => [],
        countIndexedRows: async () => 0,
        mapRecord: (row) => ({
          sourceId: 'file-provider',
          recordId: row.path,
          stableKey: row.path,
          kind: 'file',
          title: row.name
        }),
        emitRecordBatch: async () => undefined,
        logInfo: () => undefined,
        logDebug: () => undefined,
        logWarn: () => undefined
      })

      const internal = bootPass as unknown as {
        legacyExtensionsCleanupService: FileProviderLegacyExtensionsCleanupService
      }
      const firstRun = await internal.legacyExtensionsCleanupService.run()
      expect(firstRun).toEqual({
        status: 'completed',
        windows: 1,
        removed: 9,
        failed: 0
      })

      const remaining = (
        await search.client.execute(
          'SELECT file_id, key, value FROM file_extensions ORDER BY file_id ASC, key ASC'
        )
      ).rows.map((row) => ({
        fileId: Number(row.file_id),
        key: String(row.key),
        value: String(row.value)
      }))

      // File 2's valid PNG data URL was converted to a real cache file before cleanup ran.
      const migratedFile2Icon = remaining.find((row) => row.fileId === 2 && row.key === 'icon')
      expect(migratedFile2Icon).toBeDefined()
      expect(path.isAbsolute(migratedFile2Icon!.value)).toBe(true)
      expect(await readFile(migratedFile2Icon!.value)).toEqual(PNG_2X2)

      expect(remaining).toEqual([
        { fileId: 1, key: 'bundleId', value: 'com.example.demo' },
        { fileId: 1, key: 'icon', value: validPngDataUrl },
        { fileId: 2, key: 'content_chunks', value: '[{"text":"kept chunk"}]' },
        { fileId: 2, key: 'icon', value: migratedFile2Icon!.value },
        { fileId: 3, key: 'thumbnailStatus', value: '{"status":"generated","v":2,"at":1}' },
        { fileId: 4, key: 'thumbnail', value: '/cache/file-thumbnails/kept.png' }
      ])

      if (topology === 'split') {
        expect(execWriteSpy).toHaveBeenCalled()
        expect(
          execWriteCalls.flat().some((stmt) => stmt.sql.includes('DELETE FROM file_extensions'))
        ).toBe(true)
      } else {
        expect(execWriteSpy).not.toHaveBeenCalled()
      }

      // Applied version is persisted in primary config; a subsequent boot skips immediately.
      const versionRows = await primary.client.execute(
        "SELECT value FROM config WHERE key = 'file_provider_legacy_extensions_cleanup_version'"
      )
      expect(versionRows.rows.map((row) => Number(row.value))).toEqual([
        FILE_LEGACY_EXTENSIONS_CLEANUP_VERSION
      ])
      await expect(internal.legacyExtensionsCleanupService.run()).resolves.toEqual({
        status: 'skipped',
        reason: 'already-applied',
        windows: 0,
        removed: 0,
        failed: 0
      })
    }
  )

  it('preserves convertible PNG data URLs and leaves version unrecorded when icon migration stops early', async () => {
    let appliedVersion: number | null = null
    const deleted: Array<{ fileId: number; key: string }> = []
    let migrationCompleted = false

    const service = new FileProviderLegacyExtensionsCleanupService({
      getAppliedVersion: async () => appliedVersion,
      setAppliedVersion: async (version) => {
        appliedVersion = version
      },
      isReady: () => true,
      ensureLegacyIconsMigrated: async () => migrationCompleted,
      loadWindow: async (afterFileId, _limit, dropAllFileDataIcons) => {
        if (afterFileId > 0) return { maxFileId: null, deletes: [] }
        return {
          maxFileId: 10,
          deletes: dropAllFileDataIcons
            ? [
                { fileId: 1, key: 'keywords' },
                { fileId: 2, key: 'icon' }
              ]
            : [{ fileId: 1, key: 'keywords' }]
        }
      },
      deleteBatch: async (targets) => {
        deleted.push(...targets)
      },
      waitForWriteCapacity: async () => undefined,
      yieldBetweenWindows: async () => undefined,
      logInfo: () => undefined,
      logWarn: () => undefined
    })

    const partial = await service.run()
    expect(partial).toEqual({ status: 'completed', windows: 1, removed: 1, failed: 0 })
    expect(deleted).toEqual([{ fileId: 1, key: 'keywords' }])
    expect(appliedVersion).toBeNull()

    deleted.length = 0
    migrationCompleted = true
    const converged = await service.run()
    expect(converged).toEqual({ status: 'completed', windows: 1, removed: 2, failed: 0 })
    expect(appliedVersion).toBe(FILE_LEGACY_EXTENSIONS_CLEANUP_VERSION)
  })
})
