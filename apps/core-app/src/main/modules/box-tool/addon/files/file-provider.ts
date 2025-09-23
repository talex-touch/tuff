import { ProviderContext } from '../../search-engine/types'
import {
  IExecuteArgs,
  IProviderActivate,
  ISearchProvider,
  TuffFactory,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils'
import { app, shell } from 'electron'
import path from 'path'
import { createDbUtils } from '../../../../db/utils'
import { files as filesSchema, fileExtensions, keywordMappings, scanProgress } from '../../../../db/schema'
import { and, eq, inArray, sql } from 'drizzle-orm'
// import PinyinMatch from 'pinyin-match'
import extractFileIcon from 'extract-file-icon'
import { KEYWORD_MAP } from './constants'
import { ScannedFileInfo } from './types'
import { mapFileToTuffItem, scanDirectory } from './utils'
import {
  SearchIndexService,
  SearchIndexKeyword,
  SearchIndexItem
} from '../../search-engine/search-index-service'

class FileProvider implements ISearchProvider<ProviderContext> {
  readonly id = 'file-provider'
  readonly name = 'File Provider'
  readonly type = 'file' as const

  private dbUtils: ReturnType<typeof createDbUtils> | null = null
  private isInitializing: Promise<void> | null = null
  private readonly WATCH_PATHS: string[]
  private databaseFilePath: string | null = null
  private searchIndex: SearchIndexService | null = null

  constructor() {
    const pathNames: ('documents' | 'downloads' | 'desktop' | 'music' | 'pictures' | 'videos')[] = [
      'documents',
      'downloads',
      'desktop',
      'music',
      'pictures',
      'videos'
    ]
    const paths = pathNames.map((name) => {
      try {
        return app.getPath(name)
      } catch (error) {
        console.warn(`[FileProvider] Could not get path for '${name}', skipping.`, error)
        return null
      }
    })
    this.WATCH_PATHS = [...new Set(paths.filter((p): p is string => !!p))]
    console.log('[FileProvider] Watching paths:', this.WATCH_PATHS)
  }

  async onLoad(context: ProviderContext): Promise<void> {
    this.dbUtils = createDbUtils(context.databaseManager.getDb())
    this.searchIndex = context.searchIndex
    // Store the database file path to exclude it from scanning
    // Assuming the database file is named 'database.db' and located in the user data directory.
    this.databaseFilePath = path.join(app.getPath('userData'), 'database.db')
    if (!this.isInitializing) {
      this.isInitializing = this._initialize()
    }
    await this.isInitializing
  }

  private async _initialize(): Promise<void> {
    console.log('[FileProvider] Starting index process...')
    if (!this.dbUtils) return

    const db = this.dbUtils.getDb()
    const excludePathsSet = this.databaseFilePath ? new Set([this.databaseFilePath]) : undefined

    // --- 1. Index Cleanup (FR-IX-4) ---
    console.log('[FileProvider] Cleaning up indexes from removed watch paths...')
    const allDbFilePaths = await db
      .select({ path: filesSchema.path, id: filesSchema.id })
      .from(filesSchema)
      .where(eq(filesSchema.type, 'file'))
    const filesToDelete = allDbFilePaths.filter(
      (file) => !this.WATCH_PATHS.some((watchPath) => file.path.startsWith(watchPath))
    )

    if (filesToDelete.length > 0) {
      const idsToDelete = filesToDelete.map((f) => f.id)
      console.log(
        `[FileProvider] Deleting ${idsToDelete.length} files from removed paths. Sample:`,
        filesToDelete.slice(0, 5).map((f) => f.path)
      )
      await db.delete(filesSchema).where(inArray(filesSchema.id, idsToDelete))
      const pathsToDelete = filesToDelete.map((f) => f.path)
      await db.delete(scanProgress).where(inArray(scanProgress.path, pathsToDelete))
      await this.searchIndex?.removeItems(pathsToDelete)
    }

    // --- 2. Determine Scan Strategy (FR-IX-3: Resumable Indexing) ---
    const completedScans = await db.select().from(scanProgress)
    const completedScanPaths = new Set(completedScans.map((s) => s.path))

    const newPathsToScan = this.WATCH_PATHS.filter((p) => !completedScanPaths.has(p))
    const reconciliationPaths = this.WATCH_PATHS.filter((p) => completedScanPaths.has(p))

    console.log(
      `[FileProvider] Scan Strategy: ${newPathsToScan.length} new paths for full scan, ${reconciliationPaths.length} existing paths for reconciliation.`
    )

    // --- 3. Full Scan for New Paths ---
    if (newPathsToScan.length > 0) {
      console.log('[FileProvider] Starting full scan for new paths:', newPathsToScan)
      for (const newPath of newPathsToScan) {
        console.log(`[FileProvider] Scanning new path: ${newPath}`)
        const diskFiles = await scanDirectory(newPath, excludePathsSet)
        const newFileRecords = diskFiles.map((file) => ({
          ...file,
          extension: path.extname(file.name).toLowerCase(),
          lastIndexedAt: new Date(),
          ctime: new Date()
        }))

        if (newFileRecords.length > 0) {
          console.log(`[FileProvider] Found ${newFileRecords.length} files in ${newPath}.`)
          const chunkSize = 500
          for (let i = 0; i < newFileRecords.length; i += chunkSize) {
            const chunk = newFileRecords.slice(i, i + chunkSize)
            console.log(
              `[FileProvider] Full scan for ${newPath}: Inserting chunk ${i / chunkSize + 1}/${Math.ceil(newFileRecords.length / chunkSize)}...`
            )
            const inserted = await db.insert(filesSchema).values(chunk).returning()
            await this.processFileExtensions(inserted)
            await this.indexFilesForSearch(inserted)
          }
        }
        await db.insert(scanProgress).values({ path: newPath, lastScanned: new Date() })
        console.log(`[FileProvider] Completed full scan for ${newPath}.`)
      }
    }

    // --- 4. Reconciliation Scan for Existing Paths (FR-IX-2) ---
    if (reconciliationPaths.length > 0) {
      console.log('[FileProvider] Starting reconciliation scan for paths:', reconciliationPaths)
      const dbFiles = await db.select().from(filesSchema).where(eq(filesSchema.type, 'file'))
      const dbFileMap = new Map(dbFiles.map((file) => [file.path, file]))

      console.log(`[FileProvider] Found ${dbFileMap.size} files in DB for reconciliation.`)

      const diskFiles: ScannedFileInfo[] = []
      for (const dir of reconciliationPaths) {
        diskFiles.push(...(await scanDirectory(dir, excludePathsSet)))
      }
      const diskFileMap = new Map(diskFiles.map((file) => [file.path, file]))
      console.log(`[FileProvider] Found ${diskFileMap.size} files on disk for reconciliation.`)

      const filesToAdd: ScannedFileInfo[] = []
      const filesToUpdate: (typeof filesSchema.$inferSelect)[] = []

      for (const [path, diskFile] of diskFileMap.entries()) {
        const dbFile = dbFileMap.get(path)
        if (!dbFile) {
          filesToAdd.push(diskFile)
        } else if (diskFile.mtime > dbFile.mtime) {
          filesToUpdate.push({ ...dbFile, mtime: diskFile.mtime, name: diskFile.name })
        }
        dbFileMap.delete(path)
      }

      const deletedFiles = Array.from(dbFileMap.values()).filter((file) =>
        reconciliationPaths.some((p) => file.path.startsWith(p))
      )
      const deletedFileIds = deletedFiles.map((file) => file.id)

      if (deletedFileIds.length > 0) {
        console.log(
          `[FileProvider] Deleting ${deletedFileIds.length} missing files. Sample:`,
          Array.from(dbFileMap.values())
            .slice(0, 5)
            .map((f) => f.path)
        )
        await db.delete(filesSchema).where(inArray(filesSchema.id, deletedFileIds))
        if (deletedFiles.length > 0) {
          await this.searchIndex?.removeItems(deletedFiles.map((file) => file.path))
        }
      }

      if (filesToUpdate.length > 0) {
        console.log(`[FileProvider] Updating ${filesToUpdate.length} modified files.`)
        await this._processFileUpdates(filesToUpdate)
      }

      if (filesToAdd.length > 0) {
        console.log(`[FileProvider] Adding ${filesToAdd.length} new files during reconciliation.`)
        const newFileRecords = filesToAdd.map((file) => ({
          ...file,
          extension: path.extname(file.name).toLowerCase(),
          lastIndexedAt: new Date(),
          ctime: new Date()
        }))

        const chunkSize = 500
        for (let i = 0; i < newFileRecords.length; i += chunkSize) {
          const chunk = newFileRecords.slice(i, i + chunkSize)
          const inserted = await db.insert(filesSchema).values(chunk).returning()
          await this.processFileExtensions(inserted)
          await this.indexFilesForSearch(inserted)
        }
      }
    }

    console.log('[FileProvider] Index process complete.')
  }

  private async _processFileUpdates(
    filesToUpdate: (typeof filesSchema.$inferSelect)[],
    chunkSize = 50
  ) {
    if (!this.dbUtils) return
    const db = this.dbUtils.getDb()

    for (let i = 0; i < filesToUpdate.length; i += chunkSize) {
      const chunk = filesToUpdate.slice(i, i + chunkSize)
      console.debug(
        `[FileProvider] Updating chunk ${i / chunkSize + 1}/${Math.ceil(filesToUpdate.length / chunkSize)}...`
      )

      const updatePromises = chunk.map((file) =>
        db
          .update(filesSchema)
          .set({
            mtime: file.mtime,
            name: file.name,
            lastIndexedAt: new Date()
          })
          .where(eq(filesSchema.id, file.id))
      )
      await Promise.all(updatePromises)
      await this.processFileExtensions(chunk)
      await this.indexFilesForSearch(chunk)
      await new Promise((resolve) => setTimeout(resolve, 17))
    }
  }

  private async indexFilesForSearch(files: (typeof filesSchema.$inferSelect)[]): Promise<void> {
    if (!this.searchIndex) return
    if (files.length === 0) return

    const items: SearchIndexItem[] = files.map((file) => this.buildSearchIndexItem(file))
    await this.searchIndex.indexItems(items)
  }

  private buildSearchIndexItem(file: typeof filesSchema.$inferSelect): SearchIndexItem {
    const extension = (file.extension || path.extname(file.name) || '').toLowerCase()
    const extensionKeywords = KEYWORD_MAP[extension] || []
    const keywords: SearchIndexKeyword[] = extensionKeywords.map((keyword) => ({
      value: keyword,
      priority: 1.05
    }))

    return {
      itemId: file.path,
      providerId: this.id,
      type: this.type,
      name: file.name,
      displayName: file.displayName ?? undefined,
      path: file.path,
      extension,
      keywords,
      tags: extension ? [extension.replace(/^\./, '')] : undefined
    }
  }

  private buildFtsQuery(terms: string[]): string {
    const tokens: string[] = []
    for (const term of terms) {
      const cleaned = term.replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, ' ').trim()
      if (!cleaned) continue
      tokens.push(...cleaned.split(/\s+/))
    }

    if (tokens.length === 0) {
      return ''
    }

    const limitedTokens = tokens.slice(0, 5)
    return limitedTokens.map((token) => `${token}*`).join(' AND ')
  }

  private async processFileExtensions(files: (typeof filesSchema.$inferSelect)[]): Promise<void> {
    if (!this.dbUtils) return
    if (files.length === 0) return

    const extensionsToAdd: { fileId: number; key: string; value: string }[] = []
    for (const file of files) {
      try {
        const icon = extractFileIcon(file.path)
        extensionsToAdd.push({
          fileId: file.id,
          key: 'icon',
          value: `data:image/png;base64,${icon.toString('base64')}`
        })
      } catch {
        /* ignore */
      }

      const fileExtension = file.extension || path.extname(file.name).toLowerCase()
      const keywords = KEYWORD_MAP[fileExtension]
      if (keywords) {
        extensionsToAdd.push({
          fileId: file.id,
          key: 'keywords',
          value: JSON.stringify(keywords)
        })
      }
    }

    if (extensionsToAdd.length > 0) {
      await this.dbUtils.addFileExtensions(extensionsToAdd)
    }
  }

  async onSearch(query: TuffQuery, _signal: AbortSignal): Promise<TuffSearchResult> {
    if (!this.dbUtils || !this.searchIndex) {
      return TuffFactory.createSearchResult(query).build()
    }

    const rawText = query.text.trim()
    if (!rawText) {
      return TuffFactory.createSearchResult(query).build()
    }

    const db = this.dbUtils.getDb()
    const normalizedQuery = rawText.toLowerCase()
    const terms = normalizedQuery.split(/[\s/]+/).filter(Boolean)

    let preciseMatchPaths: Set<string> | null = null
    if (terms.length > 0) {
      const termMatches: Set<string>[] = []
      for (const term of terms) {
        const matches = await db
          .select({ itemId: keywordMappings.itemId })
          .from(keywordMappings)
          .where(sql`lower(keyword) LIKE ${'%' + term + '%'}`)
        termMatches.push(new Set(matches.map((entry) => entry.itemId)))
      }

      if (termMatches.length > 0) {
        preciseMatchPaths = termMatches.reduce((accumulator, current) => {
          if (!accumulator) return current
          return new Set([...accumulator].filter((id) => current.has(id)))
        })
      }
    }

    const ftsQuery = this.buildFtsQuery(terms.length > 0 ? terms : [normalizedQuery])
    const ftsMatches = ftsQuery ? await this.searchIndex.search(this.id, ftsQuery, 150) : []

    const candidateIds = new Set<string>()
    if (preciseMatchPaths && preciseMatchPaths.size > 0) {
      for (const id of preciseMatchPaths) {
        candidateIds.add(id)
      }
    }
    for (const match of ftsMatches) {
      candidateIds.add(match.itemId)
    }

    if (candidateIds.size === 0) {
      return TuffFactory.createSearchResult(query).build()
    }

    const candidatePaths = Array.from(candidateIds)

    const rows = await db
      .select({
        file: filesSchema,
        extensionKey: fileExtensions.key,
        extensionValue: fileExtensions.value
      })
      .from(filesSchema)
      .leftJoin(fileExtensions, eq(filesSchema.id, fileExtensions.fileId))
      .where(and(eq(filesSchema.type, 'file'), inArray(filesSchema.path, candidatePaths)))

    const filesMap = new Map<
      string,
      { file: typeof filesSchema.$inferSelect; extensions: Record<string, string> }
    >()

    for (const row of rows) {
      if (!filesMap.has(row.file.path)) {
        filesMap.set(row.file.path, { file: row.file, extensions: {} })
      }
      if (row.extensionKey && row.extensionValue) {
        filesMap.get(row.file.path)!.extensions[row.extensionKey] = row.extensionValue
      }
    }

    const staleIds = candidatePaths.filter((path) => !filesMap.has(path))
    if (staleIds.length > 0) {
      await this.searchIndex.removeItems(staleIds)
    }

    if (filesMap.size === 0) {
      return TuffFactory.createSearchResult(query).build()
    }

    const validPaths = Array.from(filesMap.keys())
    const usageSummaries = await this.dbUtils.getUsageSummaryByItemIds(validPaths)
    const usageMap = new Map(usageSummaries.map((summary) => [summary.itemId, summary]))

    const ftsScoreMap = new Map<string, number>()
    for (const match of ftsMatches) {
      const normalizedScore = match.score > 0 ? 1 / (match.score + 1) : 1
      const previous = ftsScoreMap.get(match.itemId) ?? 0
      if (normalizedScore > previous) {
        ftsScoreMap.set(match.itemId, normalizedScore)
      }
    }

    const now = Date.now()
    const weights = {
      keyword: 0.45,
      fts: 0.35,
      lastUsed: 0.1,
      frequency: 0.05,
      lastModified: 0.05
    }

    const scoredItems = Array.from(filesMap.values())
      .map(({ file, extensions }) => {
        const usage = usageMap.get(file.path)
        const lastUsed = usage ? new Date(usage.lastUsed).getTime() : 0
        const daysSinceLastUsed = lastUsed > 0 ? (now - lastUsed) / (1000 * 3600 * 24) : Infinity
        const lastUsedScore = lastUsed > 0 ? Math.exp(-0.1 * daysSinceLastUsed) : 0

        const lastModified = new Date(file.mtime).getTime()
        const daysSinceLastModified = (now - lastModified) / (1000 * 3600 * 24)
        const lastModifiedScore = Math.exp(-0.05 * daysSinceLastModified)

        const frequencyScore = usage ? Math.log10(usage.clickCount + 1) / 2 : 0
        const keywordScore = preciseMatchPaths?.has(file.path) ? 1 : 0
        const ftsScore = ftsScoreMap.get(file.path) ?? 0

        const finalScore =
          weights.keyword * keywordScore +
          weights.fts * ftsScore +
          weights.lastUsed * lastUsedScore +
          weights.frequency * frequencyScore +
          weights.lastModified * lastModifiedScore

        const tuffItem = mapFileToTuffItem(file, extensions, this.id, this.name)
        tuffItem.scoring = {
          final: finalScore,
          keyword: keywordScore,
          semantic: ftsScore,
          recency: lastUsedScore,
          frequency: frequencyScore
        }

        if (!tuffItem.meta) {
          tuffItem.meta = {}
        }
        tuffItem.meta.search = {
          keywordMatch: keywordScore > 0,
          ftsScore
        }

        return tuffItem
      })
      .sort((a, b) => (b.scoring?.final || 0) - (a.scoring?.final || 0))
      .slice(0, 50)

    return TuffFactory.createSearchResult(query).setItems(scoredItems).build()
  }

  async onExecute(args: IExecuteArgs): Promise<IProviderActivate | null> {
    const filePath = args.item.meta?.file?.path
    if (!filePath) {
      const err = new Error('File path not found in TuffItem')
      console.error(err)
      return null
    }

    try {
      await shell.openPath(filePath)
      return null
    } catch (err) {
      console.error(`[FileProvider] Failed to open file at: ${filePath}`, err)
      return null
    }
  }
}

export const fileProvider = new FileProvider()
