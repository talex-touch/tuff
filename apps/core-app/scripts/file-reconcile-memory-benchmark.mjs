#!/usr/bin/env node
/**
 * Measures whether paged file reconciliation + SQLite persistence memory stays bounded
 * as directory and database cardinality grow (#318 / R3).
 *
 * `file-scan-memory-benchmark.mjs` covers filesystem traversal only. This companion script
 * drives the real reconciliation + persistence pipeline against a real temporary libSQL file:
 *   - streaming `scanDirectoryBatches` (from @talex-touch/utils)
 *   - `FileProviderReconciliationRunService`, `FileProviderReconciliationInsertService`,
 *     and `FileProviderReconciliationUpdateService`
 *   - `resolveIndexedWriteReconciliationDiff`
 *   - `SqliteFileIndexPersistenceRepository` (`upsertFiles`, `updateFileMetadata`)
 *   - keyset-paginated `getReconciliationFileRecordsPage` + bounded missing-row deletion
 *
 * Usage — must run under tsx, not plain node:
 *
 *   pnpm -C apps/core-app reconcile:memory:benchmark
 *   NODE_OPTIONS="--expose-gc" pnpm -C apps/core-app reconcile:memory:benchmark -- --counts 25000,100000
 *   NODE_OPTIONS="--expose-gc --max-old-space-size=64" pnpm -C apps/core-app reconcile:memory:benchmark -- --counts 25000
 *   NODE_OPTIONS="--expose-gc --max-old-space-size=128" pnpm -C apps/core-app reconcile:memory:benchmark -- --counts 100000
 *   NODE_OPTIONS="--expose-gc" pnpm -C apps/core-app reconcile:memory:benchmark -- --counts 25000 --cancel-at 5000
 */

import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readlinkSync,
  rmSync,
  utimesSync,
  writeFileSync
} from 'node:fs'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createClient } from '@libsql/client'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'

const FILES_TABLE_DDL = `
  CREATE TABLE files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    path TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    display_name TEXT,
    extension TEXT,
    size INTEGER,
    mtime INTEGER NOT NULL,
    ctime INTEGER NOT NULL,
    last_indexed_at INTEGER NOT NULL DEFAULT 0,
    is_dir INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL DEFAULT 'file',
    content TEXT,
    embedding_status TEXT NOT NULL DEFAULT 'none'
  )
`

const FILES_TYPE_INDEX_DDL = `CREATE INDEX idx_files_type ON files (type)`

const FILE_INDEX_PROGRESS_DDL = `
  CREATE TABLE file_index_progress (
    file_id INTEGER NOT NULL PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending',
    progress INTEGER NOT NULL DEFAULT 0,
    processed_bytes INTEGER,
    total_bytes INTEGER,
    last_error TEXT,
    started_at INTEGER,
    updated_at INTEGER NOT NULL DEFAULT 0
  )
`

const RECONCILIATION_PAGE_CAP = 64

export function parseBenchmarkArgs(argv) {
  const get = (flag, fallback) => {
    const index = argv.indexOf(flag)
    return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback
  }
  return {
    counts: get('--counts', '25000,100000')
      .split(',')
      .map(Number)
      .filter((value) => Number.isFinite(value) && value > 0),
    batchSize: Math.max(1, Number(get('--batch', '500')) || 500),
    pageSize: Math.max(
      1,
      Math.min(RECONCILIATION_PAGE_CAP, Number(get('--page-size', '64')) || 64)
    ),
    addRatio: Math.max(0, Math.min(0.5, Number(get('--add-ratio', '0.05')) || 0.05)),
    updateRatio: Math.max(0, Math.min(0.5, Number(get('--update-ratio', '0.05')) || 0.05)),
    deleteRatio: Math.max(0, Math.min(0.5, Number(get('--delete-ratio', '0.05')) || 0.05)),
    cancelAt: Math.max(0, Number(get('--cancel-at', '0')) || 0),
    keep: argv.includes('--keep'),
    json: argv.includes('--json')
  }
}

const mib = (bytes) => Math.round((bytes / 1024 / 1024) * 10) / 10

function sampleMemory() {
  const usage = process.memoryUsage()
  return { rss: usage.rss, heapUsed: usage.heapUsed }
}

export function countOpenDbHandles(dbFileName) {
  try {
    if (process.platform === 'linux') {
      const fdDirectory = `/proc/${process.pid}/fd`
      let count = 0
      for (const fd of readdirSync(fdDirectory)) {
        try {
          if (readlinkSync(path.join(fdDirectory, fd)).endsWith(dbFileName)) count += 1
        } catch {
          // Closed between listing and readlink.
        }
      }
      return count
    }
    if (process.platform === 'darwin') {
      const output = execFileSync('lsof', ['-p', String(process.pid), '-Fnft'], {
        encoding: 'utf8'
      })
      const handles = new Set()
      let currentFd = null
      for (const line of output.split('\n')) {
        const field = line.charAt(0)
        if (field === 'f') currentFd = line.slice(1)
        else if (field === 'p' || field === 'F') currentFd = null
        else if (field === 'n' && currentFd !== null) {
          handles.add(`${currentFd}:${line.slice(1)}`)
        }
      }
      let count = 0
      for (const entry of handles) {
        if (entry.endsWith(dbFileName)) count += 1
      }
      return count
    }
  } catch {
    return null
  }
  return null
}

/**
 * Builds a nested synthetic tree of `fileCount` files on disk and seeds SQLite with:
 * - unchanged rows (exact disk mtime)
 * - stale rows (older mtime in DB than on disk -> updated during reconciliation)
 * - missing-on-disk rows (in DB only -> deleted page-by-page during finishMissingScan)
 * - unseeded disk files (on disk only -> inserted during reconciliation)
 */
async function buildTreeAndSeedDb({ root, client, fileCount, addRatio, updateRatio, deleteRatio }) {
  const perDir = 200
  const dirCount = Math.ceil(fileCount / perDir)
  const addCount = Math.max(1, Math.floor(fileCount * addRatio))
  const updateCount = Math.max(1, Math.floor(fileCount * updateRatio))
  const deleteCount = Math.max(1, Math.floor(fileCount * deleteRatio))

  const baseSec = 1_760_000_000
  const staleSec = baseSec - 600
  const updatedSec = baseSec + 600
  const baseDate = new Date(baseSec * 1000)
  const updatedDate = new Date(updatedSec * 1000)

  const sampleAdded = []
  const sampleUpdated = []
  const sampleDeleted = []

  const seedBatchSize = 500
  let pendingSeeds = []

  const flushSeeds = async () => {
    if (pendingSeeds.length === 0) return
    const placeholders = pendingSeeds.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ')
    const args = []
    for (const row of pendingSeeds) {
      args.push(
        row.path,
        row.name,
        '.txt',
        row.size,
        row.mtimeSec,
        row.ctimeSec,
        row.mtimeSec,
        0,
        'file'
      )
    }
    await client.execute({
      sql: `INSERT INTO files (path, name, extension, size, mtime, ctime, last_indexed_at, is_dir, type) VALUES ${placeholders}`,
      args
    })
    pendingSeeds = []
  }

  let written = 0
  for (let d = 0; d < dirCount; d += 1) {
    const dir = path.join(root, `d${Math.floor(d / 50)}`, `s${d}`)
    mkdirSync(dir, { recursive: true })
    for (let f = 0; f < perDir && written < fileCount; f += 1) {
      const name = `f${written}.txt`
      const filePath = path.join(dir, name)
      const isAdded = written < addCount
      const isUpdated = !isAdded && written < addCount + updateCount
      const payload = isUpdated ? 'updated-content' : ''
      writeFileSync(filePath, payload)
      const targetDate = isUpdated ? updatedDate : baseDate
      utimesSync(filePath, targetDate, targetDate)

      if (isAdded) {
        if (sampleAdded.length < 5) sampleAdded.push(filePath)
      } else {
        if (isUpdated && sampleUpdated.length < 5) sampleUpdated.push(filePath)
        pendingSeeds.push({
          path: filePath,
          name,
          size: isUpdated ? 0 : payload.length,
          mtimeSec: isUpdated ? staleSec : baseSec,
          ctimeSec: staleSec
        })
        if (pendingSeeds.length >= seedBatchSize) {
          await flushSeeds()
        }
      }
      written += 1
    }
  }

  for (let i = 0; i < deleteCount; i += 1) {
    const missingPath = path.join(root, 'd0', 's0', `missing-${i}.txt`)
    if (sampleDeleted.length < 5) sampleDeleted.push(missingPath)
    pendingSeeds.push({
      path: missingPath,
      name: `missing-${i}.txt`,
      size: 16,
      mtimeSec: staleSec,
      ctimeSec: staleSec
    })
    if (pendingSeeds.length >= seedBatchSize) {
      await flushSeeds()
    }
  }
  await flushSeeds()

  return {
    diskFiles: written,
    expectedAdded: addCount,
    expectedUpdated: updateCount,
    expectedDeleted: deleteCount,
    expectedSkipped: written - addCount - updateCount,
    updatedSec,
    sampleAdded,
    sampleUpdated,
    sampleDeleted
  }
}

export async function runReconciliationMemoryBenchmark(options) {
  const {
    fileCount,
    batchSize = 500,
    pageSize = 64,
    addRatio = 0.05,
    updateRatio = 0.05,
    deleteRatio = 0.05,
    cancelAt = 0,
    keep = false
  } = options

  const scriptDir = path.dirname(fileURLToPath(import.meta.url))
  const coreAppRoot = path.resolve(scriptDir, '..')
  const repoRoot = path.resolve(coreAppRoot, '..', '..')

  const [
    { scanDirectoryBatches },
    { resolveIndexedWriteReconciliationDiff },
    schema,
    { SqliteFileIndexPersistenceRepository },
    { FileProviderReconciliationRunService, getReconciliationFileRecordsPage },
    { FileProviderReconciliationInsertService },
    { FileProviderReconciliationUpdateService }
  ] = await Promise.all([
    import(
      pathToFileURL(path.join(repoRoot, 'packages', 'utils', 'common', 'file-scan-utils.ts')).href
    ),
    import(
      pathToFileURL(path.join(repoRoot, 'packages', 'utils', 'search', 'indexing-write-plan.ts'))
        .href
    ),
    import(pathToFileURL(path.join(coreAppRoot, 'src', 'main', 'db', 'schema.ts')).href),
    import(
      pathToFileURL(
        path.join(
          coreAppRoot,
          'src',
          'main',
          'modules',
          'box-tool',
          'search-engine',
          'file-index-persistence-repository.ts'
        )
      ).href
    ),
    import(
      pathToFileURL(
        path.join(
          coreAppRoot,
          'src',
          'main',
          'modules',
          'box-tool',
          'addon',
          'files',
          'services',
          'file-provider-reconciliation-run-service.ts'
        )
      ).href
    ),
    import(
      pathToFileURL(
        path.join(
          coreAppRoot,
          'src',
          'main',
          'modules',
          'box-tool',
          'addon',
          'files',
          'services',
          'file-provider-reconciliation-insert-service.ts'
        )
      ).href
    ),
    import(
      pathToFileURL(
        path.join(
          coreAppRoot,
          'src',
          'main',
          'modules',
          'box-tool',
          'addon',
          'files',
          'services',
          'file-provider-reconciliation-update-service.ts'
        )
      ).href
    )
  ])

  const workspace = mkdtempSync(path.join(tmpdir(), `reconcile-bench-${fileCount}-`))
  const root = path.join(workspace, 'tree')
  const dbFileName = `reconcile-${fileCount}-${Date.now()}.sqlite`
  const dbPath = path.join(workspace, dbFileName)
  mkdirSync(root, { recursive: true })

  const client = createClient({ url: `file:${dbPath}`, timeout: 5_000 })
  try {
    await client.execute('PRAGMA journal_mode = WAL')
    await client.execute('PRAGMA synchronous = NORMAL')
    await client.execute(FILES_TABLE_DDL)
    await client.execute(FILES_TYPE_INDEX_DDL)
    await client.execute(FILE_INDEX_PROGRESS_DDL)

    const db = drizzle(client, { schema })
    const repository = new SqliteFileIndexPersistenceRepository(db)
    const dbUtils = { getFileIndexReadDb: () => db }

    const seed = await buildTreeAndSeedDb({
      root,
      client,
      fileCount,
      addRatio,
      updateRatio,
      deleteRatio
    })

    // Warm up connection pool before baseline measurements.
    await client.execute('SELECT 1')
    globalThis.gc?.()
    const before = sampleMemory()
    const openHandlesBefore = countOpenDbHandles(dbFileName)

    let peakRss = before.rss
    let peakHeap = before.heapUsed
    let maxScanBatch = 0
    let scanBatches = 0
    let missingPagesScanned = 0
    let maxMissingPageRows = 0
    let scannedSoFar = 0
    let cancelled = false

    const recordMemory = () => {
      const now = sampleMemory()
      if (now.rss > peakRss) peakRss = now.rss
      if (now.heapUsed > peakHeap) peakHeap = now.heapUsed
    }

    const controller = new AbortController()
    const insertService = new FileProviderReconciliationInsertService({
      persistAndPublish: async (records) => {
        const rows = await repository.upsertFiles(records)
        recordMemory()
        return { insertedCount: rows.length }
      },
      emitProgress: () => undefined
    })

    const updateService = new FileProviderReconciliationUpdateService({
      persistAndPublish: async (records) => {
        const summary = await repository.updateFileMetadata(
          records.map((record) => ({
            id: record.id,
            name: record.name,
            extension: record.extension,
            size: record.size,
            mtime: record.mtime,
            ctime: record.ctime,
            lastIndexedAt: new Date(),
            isDir: false,
            type: 'file'
          }))
        )
        recordMemory()
        return { updatedCount: summary.updated }
      }
    })

    const runService = new FileProviderReconciliationRunService({
      enterPerfContext: () => () => undefined,
      waitForIdle: async () => undefined,
      assertActive: (ctx) => ctx.signal.throwIfAborted(),
      getDbFilesByPaths: async (paths, ctx) => {
        ctx.signal.throwIfAborted()
        if (paths.length === 0) return []
        return await db
          .select({
            id: schema.files.id,
            path: schema.files.path,
            mtime: schema.files.mtime,
            ctime: schema.files.ctime,
            size: schema.files.size,
            lastIndexedAt: schema.files.lastIndexedAt
          })
          .from(schema.files)
          .where(and(eq(schema.files.type, 'file'), inArray(schema.files.path, paths)))
      },
      scanDirectory: async function* (rootPath, _excludePathsSet, ctx, onStats) {
        // Bounded 2-batch producer/consumer queue matching file-indexed-source.ts (#318).
        const queued = []
        let finished = false
        let streamError = null
        let entryCount = 0
        const producerWaiters = new Set()
        const consumerWaiters = new Set()
        const wake = (waiters) => {
          for (const resolve of waiters) resolve()
          waiters.clear()
        }

        const producer = scanDirectoryBatches(
          rootPath,
          async (batch) => {
            while (queued.length >= 2) {
              ctx.signal.throwIfAborted()
              await new Promise((resolve) => producerWaiters.add(resolve))
            }
            queued.push(batch)
            entryCount += batch.length
            wake(consumerWaiters)
          },
          {
            enablePhotosLibraryFilter: false,
            enableSystemPathFilter: false,
            enableDevPathFilter: false,
            enableCachePathFilter: false,
            strictMode: false
          },
          undefined,
          { batchSize, signal: ctx.signal }
        )
          .then(() => {
            finished = true
            wake(consumerWaiters)
          })
          .catch((error) => {
            streamError = error
            finished = true
            wake(consumerWaiters)
          })

        try {
          while (!finished || queued.length > 0) {
            if (queued.length === 0) {
              await new Promise((resolve) => consumerWaiters.add(resolve))
              continue
            }
            const nextBatch = queued.shift()
            wake(producerWaiters)
            scanBatches += 1
            maxScanBatch = Math.max(maxScanBatch, nextBatch.length)
            scannedSoFar += nextBatch.length
            recordMemory()
            yield nextBatch
            if (cancelAt > 0 && scannedSoFar >= cancelAt) {
              controller.abort(new Error('BENCHMARK_CANCELLED'))
            }
          }
          if (streamError) throw streamError
          onStats({ entryCount, errorCount: 0 })
        } finally {
          wake(producerWaiters)
          await producer.catch(() => undefined)
        }
      },
      hasRootRows: async (rootPath, ctx) => {
        ctx.signal.throwIfAborted()
        return (await getReconciliationFileRecordsPage(dbUtils, rootPath, 0, 1)).length > 0
      },
      getDeferralReason: () => null,
      reconcile: async (diskFiles, dbFiles, paths) =>
        resolveIndexedWriteReconciliationDiff(diskFiles, dbFiles, paths),
      finishMissingScan: async (rootPath, ctx) => {
        let deletedCount = 0
        let cursor = 0
        while (true) {
          ctx.signal.throwIfAborted()
          const page = await getReconciliationFileRecordsPage(dbUtils, rootPath, cursor, pageSize)
          if (page.length === 0) {
            return { deletedCount, done: true }
          }
          missingPagesScanned += 1
          maxMissingPageRows = Math.max(maxMissingPageRows, page.length)

          const missingIds = []
          for (const row of page) {
            try {
              const stat = await fs.lstat(row.path)
              if (!stat.isFile() || stat.isSymbolicLink()) missingIds.push(row.id)
            } catch (error) {
              if (error?.code === 'ENOENT') missingIds.push(row.id)
            }
          }
          if (missingIds.length > 0) {
            await db.transaction(
              async (tx) => {
                await tx
                  .delete(schema.files)
                  .where(and(eq(schema.files.type, 'file'), inArray(schema.files.id, missingIds)))
              },
              { behavior: 'immediate' }
            )
            deletedCount += missingIds.length
          }
          cursor = page[page.length - 1].id
          recordMemory()
          await new Promise((resolve) => setImmediate(resolve))
        }
      },
      updateRecords: (records, ctx) => updateService.execute(records, ctx),
      insertRecords: (records, ctx) => insertService.execute(records, ctx),
      emitProgress: () => undefined,
      yieldAfterDbRead: () => new Promise((resolve) => setImmediate(resolve)),
      yieldAfterPathScan: () => new Promise((resolve) => setImmediate(resolve)),
      now: () => performance.now(),
      roundBudgetMs: 60_000,
      formatDuration: (ms) => `${Math.round(ms)}ms`,
      logDebug: () => undefined,
      logWarn: () => undefined
    })

    const startedAt = Date.now()
    let runResult = { added: 0, changed: 0, deleted: 0, skipped: 0, completedPaths: [] }
    try {
      runResult = await runService.execute([root], { signal: controller.signal })
    } catch (error) {
      if (controller.signal.aborted) {
        cancelled = true
      } else {
        throw error
      }
    }
    const durationMs = Date.now() - startedAt

    globalThis.gc?.()
    const after = sampleMemory()
    const openHandlesAfter = countOpenDbHandles(dbFileName)

    const countRows = await db
      .select({ total: sql`COUNT(*)` })
      .from(schema.files)
      .where(eq(schema.files.type, 'file'))
    const dbRowCount = Number(countRows[0]?.total ?? 0)

    let parityOk = true
    const parityIssues = []
    if (!cancelled) {
      if (dbRowCount !== seed.diskFiles) {
        parityOk = false
        parityIssues.push(`rowCount=${dbRowCount} expected=${seed.diskFiles}`)
      }
      if (runResult.added !== seed.expectedAdded) {
        parityOk = false
        parityIssues.push(`added=${runResult.added} expected=${seed.expectedAdded}`)
      }
      if (runResult.changed !== seed.expectedUpdated) {
        parityOk = false
        parityIssues.push(`changed=${runResult.changed} expected=${seed.expectedUpdated}`)
      }
      if (runResult.deleted !== seed.expectedDeleted) {
        parityOk = false
        parityIssues.push(`deleted=${runResult.deleted} expected=${seed.expectedDeleted}`)
      }
      if (seed.sampleAdded.length > 0) {
        const addedFound = await db
          .select({ path: schema.files.path })
          .from(schema.files)
          .where(inArray(schema.files.path, seed.sampleAdded))
        if (addedFound.length !== seed.sampleAdded.length) {
          parityOk = false
          parityIssues.push(`sampleAdded=${addedFound.length}/${seed.sampleAdded.length}`)
        }
      }
      if (seed.sampleUpdated.length > 0) {
        const updatedRows = await db
          .select({ path: schema.files.path, mtime: schema.files.mtime })
          .from(schema.files)
          .where(inArray(schema.files.path, seed.sampleUpdated))
        const allUpdated =
          updatedRows.length === seed.sampleUpdated.length &&
          updatedRows.every((row) => Math.floor(row.mtime.getTime() / 1000) === seed.updatedSec)
        if (!allUpdated) {
          parityOk = false
          parityIssues.push('sampleUpdated mtime mismatch')
        }
      }
      if (seed.sampleDeleted.length > 0) {
        const remainingDeleted = await db
          .select({ path: schema.files.path })
          .from(schema.files)
          .where(inArray(schema.files.path, seed.sampleDeleted))
        if (remainingDeleted.length > 0) {
          parityOk = false
          parityIssues.push(`sampleDeleted still present: ${remainingDeleted.length}`)
        }
      }
    } else if (runResult.deleted !== 0) {
      parityOk = false
      parityIssues.push(`cancelled run deleted ${runResult.deleted} rows`)
    }

    return {
      fileCount: seed.diskFiles,
      batchSize,
      pageSize: Math.min(RECONCILIATION_PAGE_CAP, pageSize),
      scanBatches,
      maxScanBatch,
      missingPagesScanned,
      maxMissingPageRows,
      added: runResult.added,
      changed: runResult.changed,
      deleted: runResult.deleted,
      skipped: runResult.skipped,
      dbRowCount,
      parityOk,
      parityIssues,
      cancelled,
      durationMs,
      peakRssMiB: mib(peakRss),
      deltaRssMiB: mib(peakRss - before.rss),
      peakHeapMiB: mib(peakHeap),
      retainedHeapMiB: mib(after.heapUsed - before.heapUsed),
      openHandlesBefore,
      openHandlesAfter
    }
  } finally {
    client.close()
    if (!keep) {
      rmSync(workspace, { recursive: true, force: true })
    }
  }
}

async function main() {
  const args = parseBenchmarkArgs(process.argv.slice(2))
  const results = []
  for (const fileCount of args.counts) {
    const result = await runReconciliationMemoryBenchmark({
      fileCount,
      batchSize: args.batchSize,
      pageSize: args.pageSize,
      addRatio: args.addRatio,
      updateRatio: args.updateRatio,
      deleteRatio: args.deleteRatio,
      cancelAt: args.cancelAt,
      keep: args.keep
    })
    results.push(result)
    if (!args.json) {
      console.log(
        `files=${String(result.fileCount).padStart(7)} batch=${String(result.batchSize).padStart(4)} ` +
          `page=${String(result.pageSize).padStart(2)} pages=${String(result.missingPagesScanned).padStart(5)} ` +
          `(+${result.added}/~${result.changed}/-${result.deleted}/=${result.skipped}) ` +
          `peakRSS=${String(result.peakRssMiB).padStart(7)}MiB ` +
          `peakHeap=${String(result.peakHeapMiB).padStart(6)}MiB ` +
          `retained=${String(result.retainedHeapMiB).padStart(6)}MiB ` +
          `fds=${result.openHandlesBefore ?? '?'}->${result.openHandlesAfter ?? '?'} ` +
          `parity=${result.parityOk ? 'OK' : `FAIL(${result.parityIssues.join(';')})`} ` +
          `${result.durationMs}ms${result.cancelled ? ' CANCELLED' : ''}`
      )
    }
    if (!result.parityOk) {
      process.exitCode = 1
    }
  }
  if (args.json) {
    console.log(JSON.stringify(results, null, 2))
  }
}

const isEntrypoint =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (isEntrypoint) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
