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

interface ScannedFileInfo {
  path: string
  name: string
  mtime: Date
}

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
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    const files: ScannedFileInfo[] = []
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      if (entry.isDirectory()) {
        // Recursively scan subdirectories.
        files.push(...(await this.scanDirectory(fullPath)))
      } else if (entry.isFile()) {
        try {
          const stats = await fs.stat(fullPath)
          files.push({
            path: fullPath,
            name: entry.name,
            mtime: stats.mtime
          })
        } catch (error) {
          console.error(`[FileProvider] Could not stat file ${fullPath}:`, error)
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

    // If search term is empty, we could return recent files, but for MVP let's return nothing.
    if (!searchTerm) {
      return []
    }

    const searchResults = await db
      .select()
      .from(filesSchema)
      .where(like(filesSchema.name, `%${searchTerm}%`))
      .limit(50) // Limit results for performance

    return searchResults.map((file) => this.mapFileToTuffItem(file))
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
