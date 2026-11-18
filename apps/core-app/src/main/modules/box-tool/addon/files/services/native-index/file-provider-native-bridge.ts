import fs from 'node:fs/promises'
import path from 'node:path'
import type { TuffQuery, TuffSearchResult } from '@talex-touch/utils'
import type { FileIndexStats } from '@talex-touch/utils/transport/events/types'
import { normalizeFsPath } from '@talex-touch/utils/common/file-scan-utils'
import { inArray } from 'drizzle-orm'
import { files as filesSchema } from '../../../../../../db/schema'
import type { DbUtils } from '../../../../../../db/utils'
import { chunkArray } from '../../constants'
import type { EmbeddingService } from '../../embedding-service'
import type { IndexWorkerFileResult } from '../../workers/file-index-worker-client'
import {
  createIndexedFileAssetLookup,
  registerFileAssetBridge,
  type IndexedFileRow
} from '../../file-asset-bridge'
import {
  logFileProviderDebug,
  logFileProviderInfo,
  logFileProviderWarn
} from '../../file-provider-log'
import { registerFileRecommendationBridge } from '../../file-recommendation-bridge'
import { mapFileToTuffItem } from '../../utils'
import { FileRecommendationBridgeImpl } from '../file-provider-recommendation-bridge-impl'
import { resolveExtensionsForTypeFilters } from '../file-provider-search-service'
import {
  FileProviderNativeIndexService,
  type FileProviderNativeIndexServiceDeps
} from './file-provider-native-index-service'

export interface FileProviderNativeBridgeOptions {
  providerId: string
  providerName: string
  getWatchPaths: () => string[]
  getStorageDir: () => string | null
  getDbUtils?: () => DbUtils | null
  getEmbeddingService?: () => EmbeddingService | null | undefined
  ensureThumbnail?: (file: IndexedFileRow, extensions: Record<string, string>) => Promise<void>
  isContentIndexingEnabled: () => boolean
  isShuttingDown: () => boolean
  isPathAdmitted: (filePath: string) => boolean
  normalizePath: (rawPath: string) => string
  extractFilters: FileProviderNativeIndexServiceDeps['extractFilters']
  logInfo?: FileProviderNativeIndexServiceDeps['logInfo']
  logDebug?: FileProviderNativeIndexServiceDeps['logDebug']
  logWarn?: FileProviderNativeIndexServiceDeps['logWarn']
}

/**
 * Thin lifecycle/search/preview/registry bridge keeping `file-provider.ts` lean and decoupled
 * from native file-index, asset-bridge, and recommendation-bridge wiring details.
 */
export class FileProviderNativeBridge {
  private readonly service: FileProviderNativeIndexService
  private disposeAssetBridge: (() => void) | null = null
  private disposeRecommendationBridge: (() => void) | null = null

  constructor(private readonly options: FileProviderNativeBridgeOptions) {
    const logInfo = options.logInfo ?? logFileProviderInfo
    const logDebug = options.logDebug ?? logFileProviderDebug
    const logWarn = options.logWarn ?? logFileProviderWarn
    this.service = new FileProviderNativeIndexService({
      providerId: options.providerId,
      providerName: options.providerName,
      getWatchPaths: options.getWatchPaths,
      getStorageDir: options.getStorageDir,
      isContentIndexingEnabled: options.isContentIndexingEnabled,
      isPathAdmitted: options.isPathAdmitted,
      normalizePath: options.normalizePath,
      buildItem: (file, extensions) =>
        mapFileToTuffItem(file, extensions, options.providerId, options.providerName),
      extractFilters: options.extractFilters,
      resolveExtensionsForTypeFilters,
      logInfo,
      logDebug,
      logWarn
    })

    if (options.getDbUtils && options.ensureThumbnail) {
      const lookupIndexedFiles = createIndexedFileAssetLookup({
        getDbUtils: options.getDbUtils,
        logWarn: (message, error, meta) => logWarn(message, error, meta)
      })
      this.disposeAssetBridge = registerFileAssetBridge({
        lookupIndexedFiles,
        ensureThumbnail: options.ensureThumbnail
      })
    }

    if (options.getDbUtils) {
      this.disposeRecommendationBridge = registerFileRecommendationBridge(
        new FileRecommendationBridgeImpl({
          getNativeIndexService: () => this.service,
          getEmbeddingService: () => options.getEmbeddingService?.() ?? null,
          getDbUtils: options.getDbUtils,
          isPathAdmitted: options.isPathAdmitted,
          normalizePath: options.normalizePath,
          logWarn
        })
      )
    }
  }

  public isActive(): boolean {
    return !this.options.isContentIndexingEnabled() && this.service.isReady()
  }

  public startIfSupported(): void {
    if (
      !this.options.isShuttingDown() &&
      !this.options.isContentIndexingEnabled() &&
      this.service.isSupported()
    ) {
      void this.service.start()
    }
  }

  public rebuildIfSupported(): void {
    if (
      !this.options.isShuttingDown() &&
      !this.options.isContentIndexingEnabled() &&
      this.service.isSupported()
    ) {
      void this.service.rebuild()
    }
  }

  public async syncContentIndexingSetting(contentIndexingEnabled: boolean): Promise<void> {
    if (contentIndexingEnabled) {
      await this.service.stop()
    } else if (!this.options.isShuttingDown() && this.service.isSupported()) {
      void this.service.start()
    }
  }

  public async updateContentIndexing<T extends { contentIndexingEnabled: boolean }>(
    contentIndexingEnabled: boolean,
    applyPolicy: (enabled: boolean) => Promise<T>
  ): Promise<T> {
    const updated = await applyPolicy(contentIndexingEnabled)
    await this.syncContentIndexingSetting(updated.contentIndexingEnabled)
    return updated
  }

  public stop(): Promise<void> {
    this.disposeAssetBridge?.()
    this.disposeAssetBridge = null
    this.disposeRecommendationBridge?.()
    this.disposeRecommendationBridge = null
    return this.service.stop()
  }

  public async resolvePreviewResourcePath(rawPath: string): Promise<string | null> {
    if (!this.isActive() || typeof rawPath !== 'string') {
      return null
    }
    const candidate = normalizeFsPath(rawPath.trim())
    if (!candidate || !path.isAbsolute(candidate)) return null
    try {
      const linkStat = await fs.lstat(candidate)
      if (linkStat.isSymbolicLink() || !linkStat.isFile()) return null
      const realPath = normalizeFsPath(await fs.realpath(candidate))
      if (realPath !== candidate) return null
      return (await this.service.checkIndexedFile(candidate)) ? realPath : null
    } catch {
      return null
    }
  }

  public async resolvePreviewWithFallback(
    rawPath: string,
    resolveFromDb: (rawPath: string) => Promise<string | null>
  ): Promise<string | null> {
    const dbResolved = await resolveFromDb(rawPath)
    return dbResolved ?? (await this.resolvePreviewResourcePath(rawPath))
  }

  public enrichIndexStats(stats: FileIndexStats): FileIndexStats {
    if (stats.totalFiles === 0 && this.isActive()) {
      const nativeStats = this.service.getStats()
      if (nativeStats && nativeStats.fileCount > 0) {
        return {
          ...stats,
          totalFiles: nativeStats.fileCount,
          completedFiles: nativeStats.fileCount
        }
      }
    }
    return stats
  }

  public async computeEnrichedIndexStats(
    computeBase: () => Promise<FileIndexStats>
  ): Promise<FileIndexStats> {
    return this.enrichIndexStats(await computeBase())
  }

  public async searchIfActive(
    query: TuffQuery,
    signal: AbortSignal
  ): Promise<TuffSearchResult | null> {
    if (!this.isActive()) return null
    return await this.service.search(query, signal)
  }

  public async searchOrFallback(
    query: TuffQuery,
    signal: AbortSignal,
    fallback: (query: TuffQuery, signal: AbortSignal) => Promise<TuffSearchResult>
  ): Promise<TuffSearchResult> {
    return (await this.searchIfActive(query, signal)) ?? (await fallback(query, signal))
  }

  /** Exposed for `FileRecommendationBridgeImpl` — read-only access to the underlying service. */
  public getIndexService(): FileProviderNativeIndexService {
    return this.service
  }
}

export async function validateDeferredWorkerEntries(params: {
  dbUtils: DbUtils | null
  shuttingDown: boolean
  entries: IndexWorkerFileResult[]
  leaseId: string
  isLeaseCancelled: (leaseId: string) => boolean
  isPathEligible: (filePath: string) => boolean
  toTimestamp: (value: Date | number | null | undefined) => number | null
}): Promise<boolean> {
  const { dbUtils, shuttingDown, entries, leaseId, isLeaseCancelled, isPathEligible, toTimestamp } =
    params
  if (!dbUtils || shuttingDown) return false
  const current = new Map<number, typeof filesSchema.$inferSelect>()
  for (const batch of chunkArray(entries, 100)) {
    const rows = await dbUtils
      .getFileIndexReadDb()
      .select()
      .from(filesSchema)
      .where(
        inArray(
          filesSchema.id,
          batch.map((entry) => entry.fileId)
        )
      )
    for (const row of rows) current.set(row.id, row)
  }
  return entries.every((entry) => {
    const row = current.get(entry.fileId)
    return (
      row &&
      leaseId &&
      !isLeaseCancelled(leaseId) &&
      isPathEligible(row.path) &&
      (entry.fileVersion == null ||
        (toTimestamp(row.mtime) === entry.fileVersion && row.size === entry.fileSize))
    )
  })
}
