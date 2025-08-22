import {
  IExecuteArgs,
  IProviderActivate,
  ISearchProvider,
  ProviderContext,
  TuffItem,
  TuffQuery,
  TuffSearchResult
} from '../../search-engine/types'
import { TuffFactory } from '@talex-touch/utils/core-box'
import PinyinMatch from 'pinyin-match'
import { exec } from 'child_process'
import { shell } from 'electron'
import searchEngineCore from '../../search-engine/search-core'
import path from 'path'
import fs from 'fs'
import FileSystemWatcher from '../../../file-system-watcher'
import { createDbUtils } from '../../../../db/utils'
import { files as filesSchema, fileExtensions } from '../../../../db/schema'
import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import { touchEventBus, TalexEvents } from '../../../../core/eventbus/touch-event'
import { sleep } from '@talex-touch/utils'
import { createRetrier } from '@talex-touch/utils/common/utils/time'

interface ScannedAppInfo {
  name: string
  path: string
  icon: string
  bundleId?: string
  uniqueId: string
  lastModified: Date
}

class AppProvider implements ISearchProvider {
  readonly id = 'app-provider'
  readonly name = 'App Provider'
  readonly type = 'application' as const // System-level provider

  private dbUtils: ReturnType<typeof createDbUtils> | null = null
  private isInitializing: Promise<void> | null = null
  private readonly isMac = process.platform === 'darwin'
  private processingPaths: Set<string> = new Set()

  private WATCH_PATHS = this.isMac
    ? ['/Applications', path.join(process.env.HOME || '', 'Applications')]
    : [
        // For Windows, common installation directories.
        path.join(process.env.PROGRAMFILES || '', '.'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', '.'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs')
      ]

  async onLoad(context: ProviderContext): Promise<void> {
    this.dbUtils = createDbUtils(context.databaseManager.getDb())
    if (!this.isInitializing) {
      this.isInitializing = this._initialize()
    }
    this._subscribeToFSEvents()
    this._registerWatchPaths()
    await this.isInitializing
  }

  async onDestroy(): Promise<void> {
    this._unsubscribeFromFSEvents()
  }

  private async _initialize(): Promise<void> {
    console.log('[AppProvider] Initializing app data...')
    if (!this.dbUtils) return

    // 1. Scan file system for all apps
    const scannedApps = await this.getAppsByPlatform()
    const scannedAppsMap = new Map(scannedApps.map((app) => [app.uniqueId, app]))

    // 2. Get all existing app records from DB
    const dbApps = await this.dbUtils.getFilesByType('app')
    const dbAppsWithExtensions = await this.fetchExtensionsForFiles(dbApps)
    const dbAppsMap = new Map(
      dbAppsWithExtensions.map((app) => {
        const uniqueId = app.extensions.bundleId || app.path
        return [uniqueId, app]
      })
    )

    const toAdd: ScannedAppInfo[] = []
    const toUpdate: { fileId: number; app: ScannedAppInfo }[] = []
    const toDeleteIds: number[] = []

    // 3. Compare and find differences
    for (const [uniqueId, scannedApp] of scannedAppsMap.entries()) {
      const dbApp = dbAppsMap.get(uniqueId)
      if (!dbApp) {
        toAdd.push(scannedApp)
      } else {
        // Compare last modified time
        if (scannedApp.lastModified.getTime() > new Date(dbApp.mtime).getTime()) {
          toUpdate.push({ fileId: dbApp.id, app: scannedApp })
        }
        // Remove from dbAppsMap to track which ones are left (for deletion)
        dbAppsMap.delete(uniqueId)
      }
    }

    // Any remaining apps in dbAppsMap were not found in scan, so they are deleted
    for (const deletedApp of dbAppsMap.values()) {
      toDeleteIds.push(deletedApp.id)
    }

    // 4. Batch process DB operations
    const db = this.dbUtils.getDb()

    // Handle additions
    if (toAdd.length > 0) {
      console.log(`[AppProvider] Adding ${toAdd.length} new apps.`)
      const newFileRecords = toAdd.map((app) => ({
        path: app.path,
        name: app.name,
        type: 'app' as const,
        mtime: app.lastModified,
        ctime: new Date()
      }))
      // Use onConflictDoUpdate to perform an "upsert" operation.
      // If a file with the same path already exists, it will be updated.
      // Otherwise, a new record will be inserted.
      const upsertedFiles = await db
        .insert(filesSchema)
        .values(newFileRecords)
        .onConflictDoUpdate({
          target: filesSchema.path,
          set: {
            name: sql`excluded.name`,
            mtime: sql`excluded.mtime`
          }
        })
        .returning()

      const extensionsToUpsert: { fileId: number; key: string; value: string }[] = []
      for (let i = 0; i < toAdd.length; i++) {
        const app = toAdd[i]
        // Find the corresponding file ID from the upserted results
        const upsertedFile = upsertedFiles.find((f) => f.path === app.path)
        if (upsertedFile) {
          if (app.bundleId) {
            extensionsToUpsert.push({
              fileId: upsertedFile.id,
              key: 'bundleId',
              value: app.bundleId
            })
          }
          if (app.icon) {
            extensionsToUpsert.push({ fileId: upsertedFile.id, key: 'icon', value: app.icon })
          }
        }
      }
      if (extensionsToUpsert.length > 0) {
        // Assuming addFileExtensions handles updates on conflict correctly
        await this.dbUtils.addFileExtensions(extensionsToUpsert)
      }
    }

    // Handle updates
    if (toUpdate.length > 0) {
      console.log(`[AppProvider] Updating ${toUpdate.length} apps.`)
      for (const { fileId, app } of toUpdate) {
        // Check if there's already a record with the same path (but different ID)
        const conflictingRecord = await db
          .select()
          .from(filesSchema)
          .where(and(eq(filesSchema.path, app.path), ne(filesSchema.id, fileId)))
          .limit(1)
        
        if (conflictingRecord.length > 0) {
          // If there's a conflict, delete the conflicting record first
          console.log(`[AppProvider] Resolving conflict for path ${app.path} by deleting conflicting record ID ${conflictingRecord[0].id}`)
          await db.delete(filesSchema).where(eq(filesSchema.id, conflictingRecord[0].id))
          await db.delete(fileExtensions).where(eq(fileExtensions.fileId, conflictingRecord[0].id))
        }

        await db
          .update(filesSchema)
          .set({
            name: app.name,
            path: app.path,
            mtime: app.lastModified
          })
          .where(eq(filesSchema.id, fileId))

        const extensions: { fileId: number; key: string; value: string }[] = []
        if (app.bundleId) {
          extensions.push({ fileId, key: 'bundleId', value: app.bundleId })
        }
        if (app.icon) {
          extensions.push({ fileId, key: 'icon', value: app.icon })
        }
        if (extensions.length > 0) {
          await this.dbUtils.addFileExtensions(extensions)
        }
      }
    }

    // Handle deletions
    if (toDeleteIds.length > 0) {
      console.log(`[AppProvider] Deleting ${toDeleteIds.length} apps.`)
      await db.delete(filesSchema).where(inArray(filesSchema.id, toDeleteIds))
      await db.delete(fileExtensions).where(inArray(fileExtensions.fileId, toDeleteIds))
    }

    console.log(
      `[AppProvider] Initialization complete. Added: ${toAdd.length}, Updated: ${toUpdate.length}, Deleted: ${toDeleteIds.length}`
    )
  }

  private _subscribeToFSEvents(): void {
    if (this.isMac) {
      touchEventBus.on(TalexEvents.DIRECTORY_ADDED, this.handleItemAddedOrChanged)
      touchEventBus.on(TalexEvents.DIRECTORY_UNLINKED, this.handleItemUnlinked)
    } else {
      // For Windows/Linux, we might still care about file events
      touchEventBus.on(TalexEvents.FILE_ADDED, this.handleItemAddedOrChanged)
      touchEventBus.on(TalexEvents.FILE_UNLINKED, this.handleItemUnlinked)
    }

    // Changed event can be for both files and directories (e.g., app update)
    touchEventBus.on(TalexEvents.FILE_CHANGED, this.handleItemAddedOrChanged)

    console.log('[AppProvider] Subscribed to file system events.')
  }

  private _unsubscribeFromFSEvents(): void {
    // Unsubscribe from all possible events to be safe
    touchEventBus.off(TalexEvents.DIRECTORY_ADDED, this.handleItemAddedOrChanged)
    touchEventBus.off(TalexEvents.DIRECTORY_UNLINKED, this.handleItemUnlinked)
    touchEventBus.off(TalexEvents.FILE_ADDED, this.handleItemAddedOrChanged)
    touchEventBus.off(TalexEvents.FILE_UNLINKED, this.handleItemUnlinked)
    touchEventBus.off(TalexEvents.FILE_CHANGED, this.handleItemAddedOrChanged)

    console.log('[AppProvider] Unsubscribed from file system events.')
  }

  private _registerWatchPaths(): void {
    console.log('[AppProvider] Registering watch paths with FileSystemWatcher...')
    for (const p of this.WATCH_PATHS) {
      const depth = this.isMac && (p === '/Applications' || p.endsWith('/Applications')) ? 1 : 4
      // Intentionally not awaited to not block startup
      FileSystemWatcher.addPath(p, depth)
    }
  }

  private async _waitForItemStable(itemPath: string, delay = 500, retries = 5): Promise<boolean> {
    for (let i = 0; i < retries; i++) {
      try {
        const size1 = (await fs.promises.stat(itemPath)).size
        await new Promise((resolve) => setTimeout(resolve, delay))
        const size2 = (await fs.promises.stat(itemPath)).size

        if (size1 === size2) {
          console.log(`[AppProvider] Item ${itemPath} is stable.`)
          await sleep(1000)
          return true
        }
        console.log(`[AppProvider] Item ${itemPath} is still changing size. Retrying...`)
      } catch (error) {
        console.warn(`[AppProvider] Error checking item stability for ${itemPath}:`, error)
        // If file is deleted during check, stop trying
        return false
      }
    }
    console.warn(`[AppProvider] Item ${itemPath} did not stabilize after ${retries} retries.`)
    return false
  }

  private handleItemAddedOrChanged = async (event: any): Promise<void> => {
    if (!event || !event.filePath) {
      return
    }
    let appPath = event.filePath
    if (this.isMac) {
      if (appPath.includes('.app/')) {
        appPath = appPath.substring(0, appPath.indexOf('.app') + 4)
      }
      if (!appPath.endsWith('.app')) {
        return
      }
    }

    if (this.processingPaths.has(appPath)) {
      return
    }
    this.processingPaths.add(appPath)

    try {
      const isStable = await this._waitForItemStable(appPath)
      if (!isStable) {
        return
      }

      const retrier = createRetrier({
        maxRetries: 5,
        onRetry(attempt, error) {
          console.log(`[AppProvider] Retrying getAppInfoByPath for ${appPath} (attempt ${attempt}):`, error)
        }
      })
      const appInfo = await retrier(async () => this.getAppInfoByPath(appPath))() as ScannedAppInfo | null
      if (!appInfo) {
        console.warn(`[AppProvider] Could not get app info for stable path: ${appPath}`)
        return
      }

      const db = this.dbUtils!.getDb()
      // Use "upsert" logic for handling both new and existing apps atomically.
      const [upsertedFile] = await db
        .insert(filesSchema)
        .values({
          path: appInfo.path,
          name: appInfo.name,
          type: 'app' as const,
          mtime: appInfo.lastModified,
          ctime: new Date()
        })
        .onConflictDoUpdate({
          target: filesSchema.path,
          set: {
            name: appInfo.name,
            mtime: appInfo.lastModified
          }
        })
        .returning()

      if (upsertedFile) {
        await this.dbUtils!.addFileExtensions([
          { fileId: upsertedFile.id, key: 'bundleId', value: appInfo.bundleId || '' },
          { fileId: upsertedFile.id, key: 'icon', value: appInfo.icon }
        ])
        console.log(`[AppProvider] Upserted app: ${appInfo.name}`)
      }
    } finally {
      this.processingPaths.delete(appPath)
    }
  }

  private handleItemUnlinked = async (event: any): Promise<void> => {
    if (!event || !event.filePath) {
      return
    }
    let appPath = event.filePath
    if (this.isMac) {
      if (appPath.includes('.app/')) {
        appPath = appPath.substring(0, appPath.indexOf('.app') + 4)
      }
      if (!appPath.endsWith('.app')) {
        return // Ignore
      }
    }

    if (this.processingPaths.has(appPath)) {
      return
    }
    this.processingPaths.add(appPath)

    try {
      console.log(`[AppProvider] Processing file unlinked: ${appPath}`)
      if (!this.dbUtils) return

      const fileToDelete = await this.dbUtils.getFileByPath(appPath)
      if (fileToDelete) {
        await this.dbUtils.getDb().delete(filesSchema).where(eq(filesSchema.id, fileToDelete.id))
        await this.dbUtils
          .getDb()
          .delete(fileExtensions)
          .where(eq(fileExtensions.fileId, fileToDelete.id))
        console.log(`[AppProvider] Deleted app from DB: ${appPath}`)
      }
    } finally {
      this.processingPaths.delete(appPath)
    }
  }

  async onExecute(args: IExecuteArgs): Promise<IProviderActivate | null> {
    const { item, searchResult } = args
    const sessionId = searchResult?.sessionId

    if (sessionId) {
      // Fire-and-forget usage recording
      searchEngineCore.recordExecute(sessionId, item).catch((err) => {
        console.error('[AppProvider] Failed to record execution.', err)
      })
    } else {
      console.warn('[AppProvider] Session ID not found, cannot record execution.')
    }

    const appPath = item.meta?.app?.path
    if (!appPath) {
      const err = new Error('Application path not found in TuffItem')
      console.error(err)
      return null
    }

    // Use Electron's shell.openPath for a more robust cross-platform way to open apps
    try {
      await shell.openPath(appPath)
    } catch (err) {
      console.error(`Failed to open application at: ${appPath}`, err)
      // Fallback to exec for macOS if shell fails
      if (this.isMac) {
        return new Promise((resolve) => {
          const action = `open -a "${appPath}"`
          exec(action, (execErr) => {
            if (execErr) {
              console.error(`Fallback exec failed to execute action: ${action}`, execErr)
              return resolve(null)
            }
            resolve(null)
          })
        })
      }
    }
    return null
  }

  async onSearch(query: TuffQuery): Promise<TuffSearchResult> {
    if (!this.dbUtils) {
      return TuffFactory.createSearchResult(query).build()
    }

    const db = this.dbUtils.getDb()

    if (!query.text) {
      const recentApps = await db
        .select()
        .from(filesSchema)
        .where(eq(filesSchema.type, 'app'))
        .limit(20) // Consider making this configurable
      const appsWithExtensions = await this.fetchExtensionsForFiles(recentApps)
      const items = appsWithExtensions.map((app) => this.mapAppToTuffItem(app))
      return TuffFactory.createSearchResult(query).setItems(items).build()
    }

    // 1. Get all apps and their usage data
    const allApps = await db.select().from(filesSchema).where(eq(filesSchema.type, 'app'))
    const appsWithExtensions = await this.fetchExtensionsForFiles(allApps)
    const appItemIds = appsWithExtensions.map((app) => app.path)

    const usageSummaries = await this.dbUtils.getUsageSummaryByItemIds(appItemIds)
    const usageMap = new Map(usageSummaries.map((s) => [s.itemId, s]))

    // 2. Pre-calculate max values for normalization
    const maxClickCount = Math.max(1, ...Array.from(usageMap.values()).map((s) => s.clickCount))

    // 3. Define scoring weights
    const weights = {
      match: 0.5,
      frequency: 0.3,
      recency: 0.2
    }

    // 4. Map, score, and sort
    const searchResults = appsWithExtensions
      .map((app) => {
        const title = app.name
        if (!title) return null

        // --- Match Score ---
        const keyWords = [app.name, app.path.split('/').pop()?.split('.')[0] || '']
        const searchKeyWords = [...new Set(keyWords)].filter(Boolean)
        let matchResult: [number, number] | false = false

        for (const keyWord of searchKeyWords) {
          const res = PinyinMatch.match(keyWord, query.text)
          if (res && res.length > 0) {
            matchResult = res
            break
          }
        }

        if (!matchResult) {
          return null
        }

        const matchScore = 1 - matchResult[0] / title.length

        // --- Usage Scores ---
        const summary = usageMap.get(app.path)
        let frequencyScore = 0
        let recencyScore = 0

        if (summary) {
          // Frequency Score (normalized)
          frequencyScore = Math.log(summary.clickCount + 1) / Math.log(maxClickCount + 1)

          // Recency Score (exponential decay)
          const daysSinceLastExecution =
            (new Date().getTime() - new Date(summary.lastUsed).getTime()) / (1000 * 3600 * 24)
          const decayConstant = 0.1
          recencyScore = Math.exp(-decayConstant * daysSinceLastExecution)
        }

        // --- Final Score ---
        const finalScore =
          weights.match * matchScore +
          weights.frequency * frequencyScore +
          weights.recency * recencyScore

        const tuffItem = this.mapAppToTuffItem(app)
        const updatedItem: TuffItem = {
          ...tuffItem,
          scoring: {
            match: matchScore,
            frequency: frequencyScore,
            recency: recencyScore,
            final: finalScore
          },
          meta: {
            ...tuffItem.meta,
            extension: {
              ...tuffItem.meta?.extension,
              matchResult: [matchResult[0], matchResult[1]]
            }
          }
        }
        return { item: updatedItem, score: finalScore }
      })
      .filter((result): result is { item: TuffItem; score: number } => result !== null)
      .sort((a, b) => b.score - a.score)
      .map((result) => result.item)

    return TuffFactory.createSearchResult(query).setItems(searchResults).build()
  }

  private async fetchExtensionsForFiles(
    files: (typeof filesSchema.$inferSelect)[]
  ): Promise<(typeof filesSchema.$inferSelect & { extensions: Record<string, string | null> })[]> {
    if (!this.dbUtils) return files.map((f) => ({ ...f, extensions: {} }))

    const fileIds = files.map((f) => f.id)
    if (fileIds.length === 0) return []

    const db = this.dbUtils.getDb()
    const extensions = await db
      .select()
      .from(fileExtensions)
      .where(inArray(fileExtensions.fileId, fileIds))

    const extensionsByFileId = extensions.reduce(
      (acc, ext) => {
        if (!acc[ext.fileId]) {
          acc[ext.fileId] = {}
        }
        if (ext.value) {
          acc[ext.fileId][ext.key] = ext.value
        }
        return acc
      },
      {} as Record<number, Record<string, string | null>>
    )

    return files.map((file) => ({
      ...file,
      extensions: extensionsByFileId[file.id] || {}
    }))
  }

  private mapAppToTuffItem(
    app: typeof filesSchema.$inferSelect & { extensions: Record<string, string | null> }
  ): TuffItem {
    return {
      id: app.path,
      source: {
        type: this.type,
        id: this.id,
        name: this.name
      },
      kind: 'app',
      render: {
        mode: 'default',
        basic: {
          title: app.name,
          subtitle: app.path,
          icon: {
            type: 'base64',
            value: app.extensions.icon || ''
          }
        }
      },
      actions: [
        {
          id: 'open-app',
          type: 'open',
          label: 'Open',
          primary: true,
          payload: {
            path: app.path
          }
        }
      ],
      meta: {
        app: {
          path: app.path,
          bundle_id: app.extensions.bundleId || ''
        },
        extension: {
          keyWords: [...new Set([app.name, app.path.split('/').pop()?.split('.')[0] || ''])].filter(
            Boolean
          )
        }
      }
    }
  }

  private async getAppsByPlatform(): Promise<ScannedAppInfo[]> {
    switch (process.platform) {
      case 'darwin': {
        const { getApps } = await import('./darwin')
        return getApps()
      }
      case 'win32': {
        const { getApps } = await import('./win')
        return getApps()
      }
      case 'linux': {
        const { getApps } = await import('./linux')
        return getApps()
      }
      default:
        return []
    }
  }

  private async getAppInfoByPath(filePath: string): Promise<ScannedAppInfo | null> {
    try {
      switch (process.platform) {
        case 'darwin': {
          const { getAppInfo } = await import('./darwin')
          return await getAppInfo(filePath)
        }
        case 'win32': {
          const { getAppInfo } = await import('./win')
          return await getAppInfo(filePath)
        }
        case 'linux': {
          const { getAppInfo } = await import('./linux')
          return await getAppInfo(filePath)
        }
        default:
          return null
      }
    } catch (error) {
      console.error(`[AppProvider] Failed to get app info for ${filePath}:`, error)
      return null
    }
  }
}

export const appProvider = new AppProvider()
