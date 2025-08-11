import {
  IExecuteArgs,
  ISearchProvider,
  ProviderContext,
  TuffItem,
  TuffQuery
} from '../../search-engine/types'
import { app, shell } from 'electron'
import path from 'path'
import { createDbUtils } from '../../../../db/utils'
import { files as filesSchema, fileExtensions, scanProgress } from '../../../../db/schema'
import { eq, inArray } from 'drizzle-orm'
import PinyinMatch from 'pinyin-match'
import extractFileIcon from 'extract-file-icon'
import { KEYWORD_MAP } from './constants'
import { ScannedFileInfo } from './types'
import { mapFileToTuffItem, scanDirectory } from './utils'

class FileProvider implements ISearchProvider {
  readonly id = 'file-provider'
  readonly name = 'File Provider'
  readonly type = 'file' as const

  private dbUtils: ReturnType<typeof createDbUtils> | null = null
  private isInitializing: Promise<void> | null = null
  private readonly WATCH_PATHS: string[]

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
    if (!this.isInitializing) {
      this.isInitializing = this._initialize()
    }
    await this.isInitializing
  }

  private async _initialize(): Promise<void> {
    console.log('[FileProvider] Starting index process...')
    if (!this.dbUtils) return

    const db = this.dbUtils.getDb()

    // --- 1. Index Cleanup (FR-IX-4) ---
    console.log('[FileProvider] Cleaning up indexes from removed watch paths...')
    const allDbFilePaths = await db
      .select({ path: filesSchema.path, id: filesSchema.id })
      .from(filesSchema)
      .where(eq(filesSchema.type, 'file'))
    const filesToDelete = allDbFilePaths
      .filter((file) => !this.WATCH_PATHS.some((watchPath) => file.path.startsWith(watchPath)))

    if (filesToDelete.length > 0) {
      const idsToDelete = filesToDelete.map(f => f.id)
      console.log(`[FileProvider] Deleting ${idsToDelete.length} files from removed paths. Sample:`, filesToDelete.slice(0, 5).map(f => f.path))
      await db.delete(filesSchema).where(inArray(filesSchema.id, idsToDelete))
      const pathsToDelete = filesToDelete.map((f) => f.path)
      await db.delete(scanProgress).where(inArray(scanProgress.path, pathsToDelete))
    }

    // --- 2. Determine Scan Strategy (FR-IX-3: Resumable Indexing) ---
    const completedScans = await db.select().from(scanProgress)
    const completedScanPaths = new Set(completedScans.map((s) => s.path))

    const newPathsToScan = this.WATCH_PATHS.filter((p) => !completedScanPaths.has(p))
    const reconciliationPaths = this.WATCH_PATHS.filter((p) => completedScanPaths.has(p))

    console.log(`[FileProvider] Scan Strategy: ${newPathsToScan.length} new paths for full scan, ${reconciliationPaths.length} existing paths for reconciliation.`)

    // --- 3. Full Scan for New Paths ---
    if (newPathsToScan.length > 0) {
      console.log('[FileProvider] Starting full scan for new paths:', newPathsToScan)
      for (const newPath of newPathsToScan) {
        console.log(`[FileProvider] Scanning new path: ${newPath}`)
        const diskFiles = await scanDirectory(newPath)
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
            console.log(`[FileProvider] Full scan for ${newPath}: Inserting chunk ${i / chunkSize + 1}/${Math.ceil(newFileRecords.length / chunkSize)}...`)
            const inserted = await db.insert(filesSchema).values(chunk).returning()
            await this.processFileExtensions(inserted)
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
        diskFiles.push(...(await scanDirectory(dir)))
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

      const deletedFileIds = Array.from(dbFileMap.values())
        .filter((file) => reconciliationPaths.some((p) => file.path.startsWith(p)))
        .map((file) => file.id)

      if (deletedFileIds.length > 0) {
        console.log(`[FileProvider] Deleting ${deletedFileIds.length} missing files. Sample:`, Array.from(dbFileMap.values()).slice(0, 5).map(f => f.path))
        await db.delete(filesSchema).where(inArray(filesSchema.id, deletedFileIds))
      }

      if (filesToUpdate.length > 0) {
        console.log(`[FileProvider] Updating ${filesToUpdate.length} modified files. Sample:`, filesToUpdate.slice(0, 5).map(f => f.path))
        for (const file of filesToUpdate) {
          await db
            .update(filesSchema)
            .set({
              mtime: file.mtime,
              name: file.name,
              lastIndexedAt: new Date()
            })
            .where(eq(filesSchema.id, file.id))
          await this.processFileExtensions([file])
        }
      }

      if (filesToAdd.length > 0) {
        console.log(`[FileProvider] Adding ${filesToAdd.length} new files during reconciliation. Sample:`, filesToAdd.slice(0, 5).map(f => f.path))
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
        }
      }
    }

    console.log('[FileProvider] Index process complete.')
  }

  private async processFileExtensions(files: (typeof filesSchema.$inferSelect)[]): Promise<void> {
    if (!this.dbUtils) return
    if (files.length === 0) return
    console.log(`[FileProvider] Processing extensions for ${files.length} files...`)

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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async onSearch(query: TuffQuery, _signal: AbortSignal): Promise<TuffItem[]> {
    if (!this.dbUtils) return []

    const db = this.dbUtils.getDb()
    const searchTerm = query.text.trim().toLowerCase()

    if (!searchTerm) {
      return []
    }

    const allFilesWithExtensions = await db
      .select({
        file: filesSchema,
        extensions: {
          key: fileExtensions.key,
          value: fileExtensions.value
        }
      })
      .from(filesSchema)
      .leftJoin(fileExtensions, eq(filesSchema.id, fileExtensions.fileId))
      .where(eq(filesSchema.type, 'file'))

    const filesMap = new Map<
      number,
      { file: typeof filesSchema.$inferSelect; extensions: Record<string, string> }
    >()
    for (const row of allFilesWithExtensions) {
      if (!filesMap.has(row.file.id)) {
        filesMap.set(row.file.id, { file: row.file, extensions: {} })
      }
      if (row.extensions?.key && row.extensions?.value) {
        filesMap.get(row.file.id)!.extensions[row.extensions.key] = row.extensions.value
      }
    }
    const searchPool = Array.from(filesMap.values())

    const filteredResults = searchPool.filter(({ file, extensions }) => {
      const fileName = file.name.toLowerCase()
      if (PinyinMatch.match(fileName, searchTerm)) {
        return true
      }
      const keywords = extensions.keywords ? (JSON.parse(extensions.keywords) as string[]) : []
      return keywords.some((keyword) => keyword.toLowerCase().includes(searchTerm))
    })

    if (filteredResults.length === 0) {
      return []
    }

    const itemIds = filteredResults.map(({ file }) => file.path)
    const usageSummaries = await this.dbUtils.getUsageSummaryByItemIds(itemIds)
    const usageMap = new Map(usageSummaries.map((s) => [s.itemId, s]))

    const weights = {
      pinyinMatch: 0.5,
      lastUsed: 0.25,
      frequency: 0.15,
      lastModified: 0.1
    }
    const now = new Date().getTime()

    const scoredResults = filteredResults
      .map(({ file, extensions }) => {
        const summary = usageMap.get(file.path)
        const matchResult = PinyinMatch.match(file.name, searchTerm)
        const pinyinMatchScore = matchResult ? 1 - matchResult[0] / file.name.length : 0
        const lastUsed = summary ? new Date(summary.lastUsed).getTime() : 0
        const lastModified = new Date(file.mtime).getTime()
        const daysSinceLastUsed = (now - lastUsed) / (1000 * 3600 * 24)
        const daysSinceLastModified = (now - lastModified) / (1000 * 3600 * 24)
        const lastUsedScore = lastUsed > 0 ? Math.exp(-0.1 * daysSinceLastUsed) : 0
        const lastModifiedScore = Math.exp(-0.05 * daysSinceLastModified)
        const frequencyScore = summary ? Math.log10(summary.clickCount + 1) : 0
        const keywords = extensions.keywords ? (JSON.parse(extensions.keywords) as string[]) : []
        const keywordScore = keywords.some((k) => k.toLowerCase().includes(searchTerm)) ? 1 : 0
        const finalScore =
          weights.pinyinMatch * pinyinMatchScore +
          weights.lastUsed * lastUsedScore +
          weights.frequency * frequencyScore +
          weights.lastModified * lastModifiedScore +
          keywordScore

        const tuffItem = mapFileToTuffItem(file, extensions, this.id, this.name)
        tuffItem.scoring = {
          final: finalScore,
          match: pinyinMatchScore,
          recency: lastUsedScore,
          frequency: frequencyScore
        }

        return tuffItem
      })
      .sort((a, b) => (b.scoring?.final || 0) - (a.scoring?.final || 0))
      .slice(0, 50)

    return scoredResults
  }

  async onExecute(args: IExecuteArgs): Promise<void> {
    const filePath = args.item.meta?.file?.path
    if (!filePath) {
      const err = new Error('File path not found in TuffItem')
      console.error(err)
      throw err
    }

    try {
      await shell.openPath(filePath)
    } catch (err) {
      console.error(`[FileProvider] Failed to open file at: ${filePath}`, err)
      throw err
    }
  }
}

export const fileProvider = new FileProvider()