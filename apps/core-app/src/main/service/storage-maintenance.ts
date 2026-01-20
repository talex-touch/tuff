import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import type { StorageCleanupResult } from './types/storage-maintenance'
import fs from 'node:fs/promises'
import path from 'node:path'
import { eq, lt, sql } from 'drizzle-orm'
import { app } from 'electron'
import {
  analyticsReportQueue,
  analyticsSnapshots,
  appUpdateRecords,
  config,
  downloadChunks,
  downloadHistory,
  downloadTasks,
  embeddings,
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
  telemetryUploadStats,
  usageLogs,
  usageSummary,
  usageTrendDaily
} from '../db/schema'
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
  const db = await getDb()
  if (!db) return { success: false }

  const removedCount: number[] = []

  const removeAll = async (table: any) => {
    const rows = await db.select({ count: sql<number>`count(*)` }).from(table)
    removedCount.push(rows[0]?.count ?? 0)
    await db.delete(table)
  }

  await removeAll(fileIndexProgress)
  await removeAll(fileExtensions)
  await removeAll(files)
  await removeAll(scanProgress)

  if (options?.includeEmbeddings) {
    await db.delete(embeddings).where(eq(embeddings.sourceType, 'file'))
  }

  if (options?.clearSearchIndex) {
    try {
      await db.run(sql`DELETE FROM search_index`)
    } catch {
      // ignore
    }
    try {
      await db.run(sql`DELETE FROM file_fts`)
    } catch {
      // ignore
    }
    await db.delete(keywordMappings)
    await db.delete(queryCompletions)
  }

  if (options?.rebuild) {
    try {
      const { fileProvider } = await import('../modules/box-tool/addon/files/file-provider')
      await fileProvider.rebuildIndex({ force: true })
    } catch {
      // ignore
    }
  }

  const removedTotal = removedCount.reduce((sum, value) => sum + value, 0)
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
  const db = await getDb()
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
  if (!db) return { success: false }
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
  await db.delete(recommendationCache)

  return { success: true }
}

export async function cleanupOcr(options?: CleanupOcrOptions): Promise<StorageCleanupResult> {
  const db = await getDb()
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
