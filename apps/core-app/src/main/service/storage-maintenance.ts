import type { SQL } from 'drizzle-orm'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { StorageCleanupResult } from './types/storage-maintenance'
import fs from 'node:fs/promises'
import path from 'node:path'
import { and, eq, inArray, lt, ne, notInArray, sql } from 'drizzle-orm'
import { app } from 'electron'
import { scheduleDbWrite } from '../db/db-write'
import {
  analyticsReportQueue,
  analyticsSnapshots,
  appUpdateRecords,
  config,
  downloadChunks,
  downloadHistory,
  downloadTasks,
  embeddings,
  executeEvents,
  fileExtensions,
  fileIndexProgress,
  files,
  intelligenceAuditLogs,
  intelligenceQuotas,
  intelligenceUsageStats,
  itemTimeStats,
  itemUsageStats,
  keywordMappings,
  ocrJobs,
  ocrResults,
  pluginAnalytics,
  pluginData,
  queryCompletions,
  recommendationCache,
  scanProgress,
  searchIndexMeta,
  searchKeywordPostings,
  searchIndexMaintenanceProgress,
  searchIndexPendingCommits,
  searchIndexFileMaintenance,
  telemetryUploadStats,
  usageLogs,
  usageSummary,
  usageTrendDaily
} from '../db/schema'
import { FILE_CAPACITY_TASKS } from '../modules/box-tool/addon/files/services/file-provider-capacity-service'
import { searchIndexWriter } from '../modules/box-tool/search-engine/search-index-writer'
import { clipboardModule } from '../modules/clipboard'
import { databaseModule } from '../modules/database'
import { tempFileService } from './temp-file.service'

export interface CleanupClipboardOptions {
  beforeDays?: number
  type?: 'all' | 'text' | 'image' | 'files'
}

export interface CleanupFileIndexOptions {
  includeEmbeddings?: boolean
  clearSearchIndex?: boolean
  rebuild?: boolean
}

export interface CleanupLogsOptions {
  beforeDays?: number
}

export interface CleanupTempOptions {
  namespace?: string
}

export interface CleanupAnalyticsOptions {
  beforeDays?: number
}

export interface CleanupUsageOptions {
  beforeDays?: number
}

export interface CleanupOcrOptions {
  beforeDays?: number
}

export interface CleanupDownloadsOptions {
  beforeDays?: number
}

export interface CleanupIntelligenceOptions {
  beforeDays?: number
}

async function getDb(): Promise<LibSQLDatabase<typeof import('../db/schema')> | null> {
  return databaseModule.getDb()
}

async function getAuxDb(): Promise<LibSQLDatabase<typeof import('../db/schema')> | null> {
  return databaseModule.getAuxDb()
}

/**
 * The connection the file index actually lives on.
 *
 * With `TUFF_DB_SEARCH_SPLIT_ENABLED` on -- the default -- file rows are written to
 * `search-index.db` by the worker, and `database.db` keeps only the app catalog. Cleaning up
 * through `getDb()` therefore counted and deleted from the wrong file: the live index survived and
 * the number reported back to the UI came from a near-empty table.
 *
 * `getSearchDb()` returns the primary connection when the split is off or the search file is not
 * open, so this needs no flag branch of its own.
 */
async function getFileIndexDb(): Promise<LibSQLDatabase<typeof import('../db/schema')> | null> {
  return databaseModule.getSearchDb() ?? null
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

type DeleteTable = Parameters<LibSQLDatabase<typeof import('../db/schema')>['delete']>[0]

function toCutoffDate(beforeDays?: number): Date | null {
  if (!beforeDays || !Number.isFinite(beforeDays) || beforeDays <= 0) return null
  return new Date(Date.now() - beforeDays * 24 * 60 * 60 * 1000)
}

export async function cleanupClipboard(
  options?: CleanupClipboardOptions
): Promise<StorageCleanupResult> {
  const result = await clipboardModule.cleanupHistory(options)
  return { success: true, removedCount: result.removedCount }
}

export async function cleanupFileIndex(
  options?: CleanupFileIndexOptions
): Promise<StorageCleanupResult> {
  const db = await getFileIndexDb()
  if (!db) return { success: false }

  const useSearchWriter = databaseModule.isSearchSplitEnabled?.() === true

  const execQuery = async (query: {
    toSQL: () => { sql: string; params: unknown[] }
  }): Promise<void> => {
    if (useSearchWriter) {
      const compiled = query.toSQL()
      await searchIndexWriter.execWrite([{ sql: compiled.sql, args: compiled.params }], 'single')
      return
    }
    await (query as unknown as Promise<unknown>)
  }

  const execRawSql = async (rawStatement: string): Promise<void> => {
    if (useSearchWriter) {
      await searchIndexWriter.execWrite([{ sql: rawStatement, args: [] }], 'single')
      return
    }
    await db.run(sql.raw(rawStatement))
  }

  const removedCount: number[] = []

  const runCleanupDeletes = async (): Promise<void> => {
    const removeAll = async (table: DeleteTable) => {
      const rows = await db.select({ count: sql<number>`count(*)` }).from(table)
      removedCount.push(rows[0]?.count ?? 0)
      await execQuery(db.delete(table))
    }

    /**
     * `files` is shared: `type: 'app'` rows are the app catalog, which `app-provider` keeps on the
     * primary connection on purpose because it includes user-authored managed entries added through
     * `addAppByPath`. Those entries exist nowhere else -- there is no separate store -- and
     * `rebuildIndex()` only rescans the watch paths, so an app added from outside them cannot come
     * back. An unscoped `delete(files)` here deleted them, and had done so since this function was
     * written, independently of the split.
     */
    const fileRows = ne(files.type, 'app')
    const removeScoped = async (table: DeleteTable, where: SQL): Promise<void> => {
      const rows = await db
        .select({ count: sql<number>`count(*)` })
        .from(table)
        .where(where)
      removedCount.push(rows[0]?.count ?? 0)
      await execQuery(db.delete(table).where(where))
    }

    // The capacity horizon kept old files out of a full index; an emptied one takes them again.
    // Cleared first: a failure below leaves the files without a horizon, never an emptied index
    // that still refuses them.
    await execQuery(
      db
        .delete(searchIndexMaintenanceProgress)
        .where(
          inArray(searchIndexMaintenanceProgress.task, [
            FILE_CAPACITY_TASKS.horizon,
            FILE_CAPACITY_TASKS.sweep
          ])
        )
    )
    await removeAll(fileIndexProgress)
    // Preserve only `type = 'app'` extensions so both non-app file extensions and already-orphaned
    // `file_extensions` rows (whose `file_id` is absent from `files`) are removed.
    await removeScoped(
      fileExtensions,
      notInArray(
        fileExtensions.fileId,
        db.select({ id: files.id }).from(files).where(eq(files.type, 'app'))
      )
    )
    await removeScoped(files, fileRows)
    await removeAll(scanProgress)
    await execQuery(
      db
        .delete(searchIndexPendingCommits)
        .where(eq(searchIndexPendingCommits.sourceId, 'file-provider'))
    )
    await execQuery(
      db
        .delete(searchIndexFileMaintenance)
        .where(eq(searchIndexFileMaintenance.sourceId, 'file-provider'))
    )

    // Deleting non-app `files` rows orphans every `source_type = 'file'` vector (`source_id` is
    // `String(files.id)` and file ids are not preserved across re-scans). Always remove file
    // vectors unless explicitly told to keep live ones (and even then purge orphans).
    if (options?.includeEmbeddings !== false) {
      await execQuery(db.delete(embeddings).where(eq(embeddings.sourceType, 'file')))
    } else {
      await execQuery(
        db
          .delete(embeddings)
          .where(
            and(
              eq(embeddings.sourceType, 'file'),
              sql`NOT EXISTS (SELECT 1 FROM ${files} f WHERE f.id = CAST(${embeddings.sourceId} AS INTEGER) AND CAST(f.id AS TEXT) = ${embeddings.sourceId} AND +f.type = 'file')`
            )
          )
      )
    }

    // Adjacent gap, deliberately not widened here (#1770): `search_index` and `keyword_mappings`
    // below carry the app catalog's searchable projection as well as the file index, so
    // `clearSearchIndex` clears both. That is defensible while `rebuild` re-projects the catalog,
    // and it is opt-in, but it is the same shape of over-broad delete as the one fixed above.
    if (options?.clearSearchIndex) {
      try {
        await execRawSql('DELETE FROM search_index')
      } catch {
        // ignore
      }
      try {
        await execRawSql('DELETE FROM file_fts')
      } catch {
        // ignore
      }
      await execQuery(db.delete(keywordMappings))
      await execQuery(db.delete(searchKeywordPostings))
      // Meta rows describe documents in `search_index`; kept past its wipe they would claim
      // documents that are gone (the app health count reads them) and hold keyword hashes for
      // mappings deleted just above.
      await execQuery(db.delete(searchIndexMeta))
      await execQuery(db.delete(searchIndexMaintenanceProgress))
      await execQuery(db.delete(searchIndexPendingCommits))
      await execQuery(db.delete(searchIndexFileMaintenance))
      await execQuery(db.delete(queryCompletions))
    }
  }

  if (useSearchWriter) {
    await runCleanupDeletes()
  } else {
    await scheduleDbWrite('storage.cleanup.file-index', runCleanupDeletes, {
      priority: 'interactive',
      dropPolicy: 'none'
    })
  }

  const removedTotal = removedCount.reduce((sum, value) => sum + value, 0)
  if (!options?.rebuild) {
    return { success: true, removedCount: removedTotal }
  }

  const rebuildErrors: string[] = []

  try {
    const { appProvider } = await import('../modules/box-tool/addon/apps/app-provider')
    const result = await appProvider.rebuildIndex()
    if (!result.success) {
      rebuildErrors.push(result.error || 'App index rebuild failed')
    }
  } catch (error) {
    rebuildErrors.push(`App index rebuild failed: ${toErrorMessage(error)}`)
  }

  try {
    const { fileProvider } = await import('../modules/box-tool/addon/files/file-provider')
    const result = await fileProvider.rebuildIndex({ force: true })
    if (!result.success) {
      rebuildErrors.push(result.errorCode || result.reason || 'File index rebuild failed')
    }
  } catch (error) {
    rebuildErrors.push(`File index rebuild failed: ${toErrorMessage(error)}`)
  }

  if (rebuildErrors.length > 0) {
    return {
      success: false,
      removedCount: removedTotal,
      error: rebuildErrors.join('; ')
    }
  }

  return { success: true, removedCount: removedTotal }
}

export async function cleanupLogs(options?: CleanupLogsOptions): Promise<StorageCleanupResult> {
  const logsDir = app.getPath('logs')
  const cutoff = toCutoffDate(options?.beforeDays)
  let removedCount = 0
  let removedBytes = 0

  let entries: Array<import('node:fs').Dirent>
  try {
    entries = await fs.readdir(logsDir, { withFileTypes: true })
  } catch {
    return { success: true, removedCount: 0, removedBytes: 0 }
  }

  for (const entry of entries) {
    if (!entry.isFile()) continue
    const filePath = path.join(logsDir, entry.name)
    try {
      const stat = await fs.stat(filePath)
      if (cutoff && stat.mtime > cutoff) {
        continue
      }
      await fs.unlink(filePath)
      removedCount += 1
      removedBytes += stat.size
    } catch {
      // ignore
    }
  }

  return { success: true, removedCount, removedBytes }
}

export async function cleanupTemp(options?: CleanupTempOptions): Promise<StorageCleanupResult> {
  const namespace = options?.namespace
  if (namespace) {
    await tempFileService.cleanup()
    return { success: true, removedCount: 0, removedBytes: 0 }
  }

  const baseDir = tempFileService.getBaseDir()
  let removedCount = 0
  let removedBytes = 0

  let entries: Array<import('node:fs').Dirent>
  try {
    entries = await fs.readdir(baseDir, { withFileTypes: true })
  } catch {
    return { success: true, removedCount: 0, removedBytes: 0 }
  }

  for (const entry of entries) {
    const fullPath = path.join(baseDir, entry.name)
    try {
      const stat = await fs.stat(fullPath)
      if (entry.isDirectory()) {
        await fs.rm(fullPath, { recursive: true, force: true })
        removedCount += 1
        removedBytes += stat.size
      } else if (entry.isFile()) {
        await fs.unlink(fullPath)
        removedCount += 1
        removedBytes += stat.size
      }
    } catch {
      // ignore
    }
  }

  return { success: true, removedCount, removedBytes }
}

export async function cleanupAnalytics(
  options?: CleanupAnalyticsOptions
): Promise<StorageCleanupResult> {
  const db = await getAuxDb()
  if (!db) return { success: false }
  const cutoff = toCutoffDate(options?.beforeDays)

  if (cutoff) {
    await db.delete(analyticsSnapshots).where(lt(analyticsSnapshots.timestamp, cutoff.getTime()))
  } else {
    await db.delete(analyticsSnapshots)
  }

  await db.delete(analyticsReportQueue)
  await db.delete(pluginAnalytics)
  await db.delete(telemetryUploadStats)

  return { success: true }
}

export async function cleanupUsage(options?: CleanupUsageOptions): Promise<StorageCleanupResult> {
  const db = await getDb()
  const auxDb = await getAuxDb()
  if (!db || !auxDb) return { success: false }
  const cutoff = toCutoffDate(options?.beforeDays)
  if (cutoff) {
    await db.delete(usageLogs).where(lt(usageLogs.timestamp, cutoff))
  } else {
    await db.delete(usageLogs)
  }

  await db.delete(usageSummary)
  await db.delete(itemUsageStats)
  await db.delete(usageTrendDaily)
  await db.delete(itemTimeStats)
  await db.delete(executeEvents)
  await auxDb.delete(recommendationCache)

  return { success: true }
}

export async function cleanupOcr(options?: CleanupOcrOptions): Promise<StorageCleanupResult> {
  const db = await getAuxDb()
  if (!db) return { success: false }
  const cutoff = toCutoffDate(options?.beforeDays)
  if (cutoff) {
    await db.delete(ocrResults).where(lt(ocrResults.createdAt, cutoff))
    await db.delete(ocrJobs).where(lt(ocrJobs.queuedAt, cutoff))
  } else {
    await db.delete(ocrResults)
    await db.delete(ocrJobs)
  }
  return { success: true }
}

export async function cleanupDownloads(
  options?: CleanupDownloadsOptions
): Promise<StorageCleanupResult> {
  const db = await getDb()
  if (!db) return { success: false }
  const cutoff = toCutoffDate(options?.beforeDays)
  if (cutoff) {
    await db.delete(downloadHistory).where(lt(downloadHistory.createdAt, cutoff.getTime()))
    await db.delete(downloadChunks).where(lt(downloadChunks.createdAt, cutoff.getTime()))
    await db.delete(downloadTasks).where(lt(downloadTasks.createdAt, cutoff.getTime()))
  } else {
    await db.delete(downloadHistory)
    await db.delete(downloadChunks)
    await db.delete(downloadTasks)
  }
  return { success: true }
}

export async function cleanupIntelligence(
  options?: CleanupIntelligenceOptions
): Promise<StorageCleanupResult> {
  const db = await getDb()
  if (!db) return { success: false }
  const cutoff = toCutoffDate(options?.beforeDays)
  if (cutoff) {
    await db
      .delete(intelligenceAuditLogs)
      .where(lt(intelligenceAuditLogs.timestamp, cutoff.getTime()))
    await db.delete(intelligenceUsageStats).where(lt(intelligenceUsageStats.updatedAt, cutoff))
  } else {
    await db.delete(intelligenceAuditLogs)
    await db.delete(intelligenceUsageStats)
  }
  await db.delete(intelligenceQuotas)
  return { success: true }
}

export async function cleanupConfig(): Promise<StorageCleanupResult> {
  const db = await getDb()
  if (!db) return { success: false }
  await db.delete(config)
  await db.delete(pluginData)
  return { success: true }
}

export async function cleanupUpdates(): Promise<StorageCleanupResult> {
  const db = await getDb()
  if (!db) return { success: false }
  await db.delete(appUpdateRecords)
  return { success: true }
}
