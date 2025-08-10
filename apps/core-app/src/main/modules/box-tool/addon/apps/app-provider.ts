import { ISearchProvider, ProviderContext, TuffItem, TuffQuery } from '../../search-engine/types'
import PinyinMatch from 'pinyin-match'
import { exec } from 'child_process'
import { createDbUtils } from '../../../../db/utils'
import { files as filesSchema, fileExtensions } from '../../../../db/schema'
import { eq, inArray } from 'drizzle-orm'

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
  readonly type = 'system' as const // System-level provider

  private dbUtils: ReturnType<typeof createDbUtils> | null = null
  private isInitializing: Promise<void> | null = null

  async onLoad(context: ProviderContext): Promise<void> {
    this.dbUtils = createDbUtils(context.databaseManager.getDb())
    if (!this.isInitializing) {
      this.isInitializing = this._initialize()
    }
    await this.isInitializing
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
      const insertedFiles = await db.insert(filesSchema).values(newFileRecords).returning()

      const extensionsToAdd: { fileId: number; key: string; value: string }[] = []
      for (let i = 0; i < toAdd.length; i++) {
        const app = toAdd[i]
        const fileId = insertedFiles[i].id
        if (app.bundleId) {
          extensionsToAdd.push({ fileId, key: 'bundleId', value: app.bundleId })
        }
        if (app.icon) {
          extensionsToAdd.push({ fileId, key: 'icon', value: app.icon })
        }
      }
      if (extensionsToAdd.length > 0) {
        await this.dbUtils.addFileExtensions(extensionsToAdd)
      }
    }

    // Handle updates
    if (toUpdate.length > 0) {
      console.log(`[AppProvider] Updating ${toUpdate.length} apps.`)
      for (const { fileId, app } of toUpdate) {
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

  onExecute(item: TuffItem): Promise<void> {
    return new Promise((resolve, reject) => {
      const appPath = item.meta?.app?.path
      if (!appPath) {
        const err = new Error('Application path not found in TuffItem')
        console.error(err)
        return reject(err)
      }
      const action = `open -a "${appPath}"`
      exec(action, (err) => {
        if (err) {
          console.error(`Failed to execute action: ${action}`, err)
          return reject(err)
        }
        resolve()
      })
    })
  }

  async onSearch(query: TuffQuery): Promise<TuffItem[]> {
    if (!this.dbUtils) {
      return []
    }
    // For instant response, we don't await. The background sync will catch up.
    // await this.isInitializing

    const db = this.dbUtils.getDb()

    if (!query.text) {
      const recentApps = await db
        .select()
        .from(filesSchema)
        .where(eq(filesSchema.type, 'app'))
        .limit(20)
      const appsWithExtensions = await this.fetchExtensionsForFiles(recentApps)
      return appsWithExtensions.map((app) => this.mapAppToTuffItem(app))
    }

    // Fallback to pinyin search on all apps
    const allApps = await db.select().from(filesSchema).where(eq(filesSchema.type, 'app'))
    const appsWithExtensions = await this.fetchExtensionsForFiles(allApps)

    const searchResults = appsWithExtensions
      .map((app) => {
        const title = app.name
        if (!title) return null

        const keyWords = [app.name, app.path.split('/').pop()?.split('.')[0] || '']
        const searchKeyWords = [...new Set(keyWords)].filter(Boolean)

        for (const keyWord of searchKeyWords) {
          const matchResult = PinyinMatch.match(keyWord, query.text)
          if (matchResult && matchResult.length > 0) {
            const score = 1 - matchResult[0] / title.length
            const tuffItem = this.mapAppToTuffItem(app)
            const updatedItem: TuffItem = {
              ...tuffItem,
              scoring: { ...tuffItem.scoring, match: score, final: score },
              meta: {
                ...tuffItem.meta,
                extension: {
                  ...tuffItem.meta?.extension,
                  matchResult: [matchResult[0], matchResult[1]],
                  from: this.id
                }
              }
            }
            return { item: updatedItem, score }
          }
        }
        return null
      })
      .filter((result): result is { item: TuffItem; score: number } => result !== null)
      .sort((a, b) => b.score - a.score)
      .map((result) => result.item)

    return searchResults
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
        const getApps = (await import('./darwin')).default
        return getApps()
      }
      case 'win32': {
        const getApps = (await import('./win')).default
        return getApps()
      }
      case 'linux': {
        const getApps = (await import('./linux')).default
        return getApps()
      }
      default:
        return []
    }
  }
}

export const appProvider = new AppProvider()
