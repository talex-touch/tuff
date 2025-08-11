import {
  IExecuteArgs,
  ISearchProvider,
  ProviderContext,
  TuffItem,
  TuffQuery
} from '../../search-engine/types'
import { app, shell } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import { createDbUtils } from '../../../../db/utils'
import { files as filesSchema } from '../../../../db/schema'
import { eq, like } from 'drizzle-orm'
import PinyinMatch from 'pinyin-match'

interface ScannedFileInfo {
  path: string
  name: string
  mtime: Date
}

class FileProvider implements ISearchProvider {
  readonly id = 'file-provider'
  readonly name = 'File Provider'
  readonly type = 'file' as const

  // --- V2 Filtering ---
  private readonly BLACKLISTED_DIRS = new Set([
    'node_modules',
    '.git',
    '.svn',
    '.hg',
    '.npm',
    '.yarn',
    '.m2',
    'dist',
    'build',
    'target',
    'out',
    'bin',
    'cache',
    '.cache',
    '.vscode',
    '.idea'
  ])
  private readonly BLACKLISTED_FILES_PREFIX = new Set(['.'])
  private readonly BLACKLISTED_FILES_SUFFIX = new Set(['~'])
  private readonly BLACKLISTED_EXTENSIONS = new Set(['.tmp', '.temp', '.log'])

  private readonly WHITELISTED_EXTENSIONS = new Set([
    // Docs
    '.txt',
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    '.rtf',
    '.md',
    // Media
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.bmp',
    '.mp4',
    '.avi',
    '.mkv',
    '.mov',
    '.wmv',
    '.flv',
    '.mp3',
    '.wav',
    '.flac',
    // Archives
    '.zip',
    '.rar',
    '.7z',
    '.tar',
    '.gz',
    '.bz2',
    // Data
    '.csv',
    '.json',
    '.xml',
    '.yaml',
    '.yml',
    // Ebooks
    '.epub',
    '.mobi',
    // Installers
    '.exe',
    '.msi',
    '.dmg',
    '.deb',
    '.rpm'
  ])

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
    // Use a Set to remove duplicate paths and filter out nulls
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
    console.log('[FileProvider] Initializing file data...')
    if (!this.dbUtils) return

    const db = this.dbUtils.getDb()

    // 1. Clear all existing file records for this provider to avoid duplicates.
    // This is a simple approach for the MVP.
    console.log('[FileProvider] Clearing old file records...')
    await db.delete(filesSchema).where(eq(filesSchema.type, 'file'))

    // 2. Scan all watch paths and collect files.
    const allFiles: ScannedFileInfo[] = []
    for (const dir of this.WATCH_PATHS) {
      try {
        const filesInDir = await this.scanDirectory(dir)
        allFiles.push(...filesInDir)
        console.log(`[FileProvider] Scanned ${filesInDir.length} files from ${dir}.`)
      } catch (error) {
        console.error(`[FileProvider] Error scanning directory ${dir}:`, error)
      }
    }

    // 3. Batch insert all found files into the database.
    if (allFiles.length > 0) {
      console.log(`[FileProvider] Adding ${allFiles.length} new files to the database.`)
      const newFileRecords = allFiles.map((file) => ({
        ...file,
        type: 'file' as const,
        ctime: new Date()
      }))

      // Drizzle doesn't support batch insert with returning on all drivers,
      // so we'll just insert without returning IDs for the MVP.
      // We also need to chunk the inserts to avoid "Maximum call stack size exceeded" errors.
      const chunkSize = 1000 // Insert 1000 records at a time
      for (let i = 0; i < newFileRecords.length; i += chunkSize) {
        const chunk = newFileRecords.slice(i, i + chunkSize)
        try {
          await db.insert(filesSchema).values(chunk)
          console.log(`[FileProvider] Inserted chunk ${i / chunkSize + 1}...`)
        } catch (error) {
          console.error(`[FileProvider] Error inserting chunk ${i / chunkSize + 1}:`, error)
        }
      }
    }

    console.log(`[FileProvider] Initialization complete. Total files indexed: ${allFiles.length}`)
  }

  private async scanDirectory(dirPath: string): Promise<ScannedFileInfo[]> {
    const dirName = path.basename(dirPath)
    if (this.BLACKLISTED_DIRS.has(dirName) || dirName.startsWith('.')) {
      return []
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const files: ScannedFileInfo[] = []
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)

      if (entry.isDirectory()) {
        files.push(...(await this.scanDirectory(fullPath)))
      } else if (entry.isFile()) {
        const fileName = entry.name
        const fileExtension = path.extname(fileName).toLowerCase()

        // Blacklist checks
        if (
          fileName.startsWith('.') ||
          fileName.endsWith('~') ||
          this.BLACKLISTED_EXTENSIONS.has(fileExtension)
        ) {
          continue
        }

        // Whitelist check
        if (this.WHITELISTED_EXTENSIONS.has(fileExtension)) {
          try {
            const stats = await fs.stat(fullPath)
            files.push({
              path: fullPath,
              name: fileName,
              mtime: stats.mtime
            })
          } catch (error) {
            console.error(`[FileProvider] Could not stat file ${fullPath}:`, error)
          }
        }
      }
    }
    return files
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async onSearch(query: TuffQuery, _signal: AbortSignal): Promise<TuffItem[]> {
    if (!this.dbUtils) return []

    const db = this.dbUtils.getDb()
    const searchTerm = query.text.trim()

    if (!searchTerm) {
      return []
    }

    const searchResults = await db
      .select()
      .from(filesSchema)
      .where(like(filesSchema.name, `%${searchTerm}%`))
      .limit(100)

    const itemIds = searchResults.map((file) => file.path)
    const usageSummaries = await this.dbUtils.getUsageSummaryByItemIds(itemIds)
    const usageMap = new Map(usageSummaries.map((s) => [s.itemId, s]))

    const weights = {
      pinyinMatch: 0.5,
      lastUsed: 0.25,
      frequency: 0.15,
      lastModified: 0.1
    }

    const now = new Date().getTime()

    const scoredResults = searchResults
      .map((file) => {
        const summary = usageMap.get(file.path)

        // --- Pinyin Match Score ---
        const matchResult = PinyinMatch.match(file.name, searchTerm)
        const pinyinMatchScore = matchResult ? 1 - matchResult[0] / file.name.length : 0

        // --- Time-based Scores (Recency & Mtime) ---
        const lastUsed = summary ? new Date(summary.lastUsed).getTime() : 0
        const lastModified = new Date(file.mtime).getTime()

        const daysSinceLastUsed = (now - lastUsed) / (1000 * 3600 * 24)
        const daysSinceLastModified = (now - lastModified) / (1000 * 3600 * 24)

        const lastUsedScore = lastUsed > 0 ? Math.exp(-0.1 * daysSinceLastUsed) : 0
        const lastModifiedScore = Math.exp(-0.05 * daysSinceLastModified)

        // --- Frequency Score ---
        const frequencyScore = summary ? Math.log10(summary.clickCount + 1) : 0

        // --- Final Score ---
        const finalScore =
          weights.pinyinMatch * pinyinMatchScore +
          weights.lastUsed * lastUsedScore +
          weights.frequency * frequencyScore +
          weights.lastModified * lastModifiedScore

        const tuffItem = this.mapFileToTuffItem(file)
        tuffItem.scoring = {
          final: finalScore,
          match: pinyinMatchScore,
          recency: lastUsedScore,
          frequency: frequencyScore
        }

        return tuffItem
      })
      .sort((a, b) => (b.scoring?.final || 0) - (a.scoring?.final || 0))

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

  private mapFileToTuffItem(file: typeof filesSchema.$inferSelect): TuffItem {
    return {
      id: file.path,
      source: {
        type: this.type,
        id: this.id,
        name: this.name
      },
      kind: 'file',
      render: {
        mode: 'default',
        basic: {
          title: file.name,
          subtitle: file.path
          // Icon can be added later based on file type
        }
      },
      actions: [
        {
          id: 'open-file',
          type: 'open',
          label: 'Open',
          primary: true,
          payload: {
            path: file.path
          }
        }
      ],
      meta: {
        file: {
          path: file.path
        }
      }
    }
  }
}

export const fileProvider = new FileProvider()
