import { ProviderContext } from '../../search-engine/types'
import {
  IExecuteArgs,
  IProviderActivate,
  ISearchProvider,
  TuffFactory,
  TuffQuery,
  TuffSearchResult
} from '@talex-touch/utils/core-box'
import { shell } from 'electron'
import path from 'path'
import fs from 'fs/promises'
import FileSystemWatcher from '../../file-system-watcher'
import { touchEventBus, TalexEvents } from '../../../../core/eventbus/touch-event'
import { sleep } from '@talex-touch/utils'
import { pollingService } from '@talex-touch/utils/common/utils/polling'
import { runAdaptiveTaskQueue } from '@talex-touch/utils/common/utils'
import { is } from '@electron-toolkit/utils'
import chalk from 'chalk'
import { performance } from 'perf_hooks'

import { createDbUtils } from '../../../../db/utils'
import {
  files as filesSchema,
  fileExtensions,
  keywordMappings,
  config as configSchema
} from '../../../../db/schema'
import { and, eq, inArray, or, sql } from 'drizzle-orm'

import { appScanner } from './app-scanner'
import { processSearchResults } from './search-processing-service'
import { formatLog, LogStyle } from './app-utils'
import searchEngineCore from '../../search-engine/search-core'
import {
  SearchIndexService,
  SearchIndexKeyword,
  SearchIndexItem
} from '../../search-engine/search-index-service'
import { createRetrier } from '@talex-touch/utils'

const isSqliteBusyError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false
  const { code, rawCode, message } = error as {
    code?: string
    rawCode?: number
    message?: string
  }
  if (code === 'SQLITE_BUSY' || rawCode === 5) return true
  return typeof message === 'string' && message.includes('SQLITE_BUSY')
}

const sqliteBusyRetrier = createRetrier({
  maxRetries: 3,
  timeoutMs: 2000,
  shouldRetry: (error) => isSqliteBusyError(error),
  onRetry: (attempt) =>
    console.warn(
      formatLog(
        'AppProvider',
        `SQLITE_BUSY encountered while updating app display name, retrying attempt ${attempt + 1}`,
        LogStyle.warning
      )
    )
})

const runWithSqliteBusyRetry = <T>(operation: () => Promise<T>): Promise<T> => {
  const wrapped = sqliteBusyRetrier(operation)
  return wrapped()
}

const MISSING_ICON_CONFIG_KEY = 'app_provider_missing_icon_apps'

class AppProvider implements ISearchProvider<ProviderContext> {
  readonly id = 'app-provider'
  readonly name = 'App Provider'
  readonly type = 'application' as const

  private dbUtils: ReturnType<typeof createDbUtils> | null = null
  private context: ProviderContext | null = null
  private isInitializing: Promise<void> | null = null
  private readonly isMac = process.platform === 'darwin'
  private processingPaths: Set<string> = new Set()
  private aliases: Record<string, string[]> = {}
  private searchIndex: SearchIndexService | null = null

  constructor() {
    console.log(formatLog('AppProvider', 'Initializing AppProvider service', LogStyle.info))
  }

  async onLoad(context: ProviderContext): Promise<void> {
    const loadStart = performance.now()
    console.log(formatLog('AppProvider', 'Loading AppProvider service...', LogStyle.process))
    this.context = context
    this.dbUtils = createDbUtils(context.databaseManager.getDb())
    this.searchIndex = context.searchIndex

    if (!this.isInitializing) {
      const initStart = performance.now()
      this.isInitializing = this._initialize()
      await this.isInitializing
      console.log(
        formatLog(
          'AppProvider',
          `Initial data load completed in ${chalk.cyan(
            ((performance.now() - initStart) / 1000).toFixed(2)
          )}s`,
          LogStyle.success
        )
      )
    }

    await this._forceSyncAllKeywords()
    this._subscribeToFSEvents()
    this._registerWatchPaths()
    this._scheduleMdlsUpdateScan()

    console.log(
      formatLog('AppProvider', 'AppProvider service loaded successfully', LogStyle.success)
    )
    console.log(
      formatLog(
        'AppProvider',
        `onLoad finished in ${chalk.cyan(((performance.now() - loadStart) / 1000).toFixed(2))}s`,
        LogStyle.success
      )
    )
  }

  async onDestroy(): Promise<void> {
    console.log(formatLog('AppProvider', 'Unloading AppProvider service', LogStyle.process))
    this._unsubscribeFromFSEvents()
    console.log(formatLog('AppProvider', 'AppProvider service unloaded', LogStyle.success))
  }

  public async setAliases(aliases: Record<string, string[]>): Promise<void> {
    console.log(formatLog('AppProvider', 'Updating app aliases', LogStyle.process))
    this.aliases = aliases

    console.log(
      formatLog('AppProvider', 'App aliases updated, resyncing all app keywords', LogStyle.info)
    )

    if (!this.dbUtils) return

    const allApps = await this.dbUtils.getFilesByType('app')
    const appsWithExtensions = await this.fetchExtensionsForFiles(allApps)

    console.log(
      formatLog(
        'AppProvider',
        `Resyncing keywords for ${chalk.cyan(appsWithExtensions.length)} apps...`,
        LogStyle.process
      )
    )

    await runAdaptiveTaskQueue(
      appsWithExtensions,
      async (app, index) => {
        const appInfo = this._mapDbAppToScannedInfo(app)
        await this._syncKeywordsForApp(appInfo)

        if ((index + 1) % 50 === 0 || index === appsWithExtensions.length - 1) {
          console.log(
            formatLog(
              'AppProvider',
              `Processed ${chalk.cyan(index + 1)}/${chalk.cyan(appsWithExtensions.length)} app keyword syncs`,
              LogStyle.info
            )
          )
        }
      },
      {
        estimatedTaskTimeMs: 5,
        yieldIntervalMs: 30,
        maxBatchSize: 25,
        label: 'AppProvider::aliasKeywordSync'
      }
    )

    console.log(formatLog('AppProvider', 'All app keywords synced successfully', LogStyle.success))
  }
  private _mapDbAppToScannedInfo(app: any): any {
    return {
      name: app.name,
      displayName: app.displayName || undefined,
      fileName: path.basename(app.path, '.app'),
      path: app.path,
      icon: app.extensions.icon || '',
      bundleId: app.extensions.bundleId || undefined,
      uniqueId: app.extensions.bundleId || app.path,
      lastModified: app.mtime
    }
  }

  /**
   * 为应用同步关键词
   */
  private async _syncKeywordsForApp(appInfo: any): Promise<void> {
    if (!this.searchIndex) return

    const keywordsSet = await this._generateKeywordsForApp(appInfo)
    const itemId = appInfo.bundleId || appInfo.path

    const keywordEntries: SearchIndexKeyword[] = Array.from(keywordsSet).map((keyword) => ({
      value: keyword,
      priority:
        this._isAcronymForApp(keyword, appInfo) || this._isAliasForApp(keyword, appInfo) ? 1.5 : 1.1
    }))

    const aliasList = this._getAliasesForApp(appInfo)
    const aliasEntries: SearchIndexKeyword[] = aliasList.map((alias) => ({
      value: alias,
      priority: 1.5
    }))

    const indexItem: SearchIndexItem = {
      itemId,
      providerId: this.id,
      type: this.type,
      name: appInfo.name,
      displayName: appInfo.displayName || undefined,
      path: appInfo.path,
      extension: path.extname(appInfo.path).toLowerCase(),
      aliases: aliasEntries,
      keywords: keywordEntries,
      tags: appInfo.bundleId ? [appInfo.bundleId] : undefined
    }

    await this.searchIndex.indexItems([indexItem])
  }

  private _isAcronymForApp(keyword: string, appInfo: any): boolean {
    const names = [appInfo.name, appInfo.displayName, appInfo.fileName].filter(Boolean) as string[]
    return names.some((name) => {
      if (!name || !name.includes(' ')) return false
      const acronym = name
        .split(' ')
        .filter((word) => word)
        .map((word) => word.charAt(0))
        .join('')
        .toLowerCase()
      return acronym === keyword
    })
  }

  private _isAliasForApp(keyword: string, appInfo: any): boolean {
    const uniqueId = appInfo.bundleId || appInfo.path
    const aliasList = this.aliases[uniqueId] || this.aliases[appInfo.path] || []
    return aliasList.includes(keyword)
  }

  private _getAliasesForApp(appInfo: any): string[] {
    const uniqueId = appInfo.bundleId || appInfo.path
    const aliasesById = this.aliases[uniqueId] || []
    const aliasesByPath = this.aliases[appInfo.path] || []
    return Array.from(new Set([...aliasesById, ...aliasesByPath])).map((alias) =>
      alias.toLowerCase()
    )
  }

  private async _generateKeywordsForApp(appInfo: any): Promise<Set<string>> {
    const generatedKeywords = new Set<string>()
    const names = [appInfo.name, appInfo.displayName, appInfo.fileName].filter(Boolean) as string[]
    const CHINESE_REGEX = /[\u4e00-\u9fa5]/
    const INVALID_KEYWORD_REGEX = /[^a-zA-Z0-9\u4e00-\u9fa5]/

    for (const name of names) {
      const lowerCaseName = name.toLowerCase()
      generatedKeywords.add(lowerCaseName)
      generatedKeywords.add(lowerCaseName.replace(/\s/g, ''))

      lowerCaseName.split(/[\s-]/).forEach((word) => {
        if (word) generatedKeywords.add(word)
      })

      const acronym = this._generateAcronym(name)
      if (acronym) generatedKeywords.add(acronym)

      if (CHINESE_REGEX.test(name)) {
        try {
          const { pinyin } = await import('pinyin-pro')
          const pinyinFull = pinyin(name, { toneType: 'none' }).replace(/\s/g, '')
          generatedKeywords.add(pinyinFull)
          const pinyinFirst = pinyin(name, { pattern: 'first', toneType: 'none' }).replace(
            /\s/g,
            ''
          )
          generatedKeywords.add(pinyinFirst)
        } catch {
          console.warn(
            formatLog('AppProvider', `Failed to get pinyin for: ${name}`, LogStyle.warning)
          )
        }
      }
    }

    const uniqueId = appInfo.bundleId || appInfo.path
    const aliasList = this.aliases[uniqueId] || this.aliases[appInfo.path]
    if (aliasList) {
      aliasList.forEach((alias) => generatedKeywords.add(alias.toLowerCase()))
    }

    const finalKeywords = new Set<string>()
    for (const keyword of generatedKeywords) {
      if (keyword.length > 1 && !INVALID_KEYWORD_REGEX.test(keyword)) {
        finalKeywords.add(keyword)
      }
    }

    return finalKeywords
  }

  private _generateAcronym(name: string): string {
    if (!name || !name.includes(' ')) {
      return ''
    }
    return name
      .split(' ')
      .filter((word) => word)
      .map((word) => word.charAt(0))
      .join('')
      .toLowerCase()
  }

  private async _initialize(): Promise<void> {
    const initStart = performance.now()
    console.log(formatLog('AppProvider', 'Initializing app data...', LogStyle.process))

    const scanStart = performance.now()
    const scannedApps = await appScanner.getApps()
    console.log(
      formatLog(
        'AppProvider',
        `Scanned ${chalk.cyan(scannedApps.length)} apps in ${chalk.cyan(
          ((performance.now() - scanStart) / 1000).toFixed(2)
        )}s`,
        LogStyle.info
      )
    )
    const scannedAppsMap = new Map(scannedApps.map((app) => [app.uniqueId, app]))

    // Log apps with missing icons only the first time we see them
    const knownMissingIconApps = await this._getKnownMissingIconApps()
    let missingIconConfigUpdated = false
    for (const app of scannedApps) {
      if (app.icon) continue

      const uniqueId = app.uniqueId || app.path
      if (!uniqueId || knownMissingIconApps.has(uniqueId)) continue

      console.warn(
        formatLog(
          'AppProvider',
          `Icon not found for app: ${chalk.yellow(app.name)}`,
          LogStyle.warning
        )
      )
      knownMissingIconApps.add(uniqueId)
      missingIconConfigUpdated = true
    }

    if (missingIconConfigUpdated) {
      await this._saveKnownMissingIconApps(knownMissingIconApps)
    }

    const dbLoadStart = performance.now()
    const dbApps = await this.dbUtils!.getFilesByType('app')
    const dbAppsWithExtensions = await this.fetchExtensionsForFiles(dbApps)
    console.log(
      formatLog(
        'AppProvider',
        `Loaded ${chalk.cyan(dbApps.length)} DB app records in ${chalk.cyan(
          ((performance.now() - dbLoadStart) / 1000).toFixed(2)
        )}s`,
        LogStyle.info
      )
    )
    const dbAppsMap = new Map(
      dbAppsWithExtensions.map((app) => [app.extensions.bundleId || app.path, app])
    )

    const toAdd: any[] = []
    const toUpdate: { fileId: any; app: any }[] = []
    const toDeleteIds: any[] = []

    console.log(
      formatLog(
        'AppProvider',
        `Comparing ${chalk.cyan(scannedApps.length)} scanned apps with ${chalk.cyan(dbApps.length)} apps in DB`,
        LogStyle.info
      )
    )

    for (const [uniqueId, scannedApp] of scannedAppsMap.entries()) {
      const dbApp = dbAppsMap.get(uniqueId)
      if (!dbApp) {
        toAdd.push(scannedApp)
      } else {
        if (scannedApp.lastModified.getTime() > new Date(dbApp.mtime).getTime()) {
          toUpdate.push({ fileId: dbApp.id, app: scannedApp })
        }
        dbAppsMap.delete(uniqueId)
      }
    }

    for (const deletedApp of dbAppsMap.values()) {
      toDeleteIds.push(deletedApp.id)
    }

    console.log(
      formatLog(
        'AppProvider',
        `Found ${chalk.green(toAdd.length)} to add, ${chalk.yellow(toUpdate.length)} to update, ${chalk.red(toDeleteIds.length)} to delete`,
        LogStyle.info
      )
    )

    const db = this.dbUtils!.getDb()

    if (toAdd.length > 0) {
      console.log(
        formatLog('AppProvider', `Adding ${chalk.cyan(toAdd.length)} new apps...`, LogStyle.process)
      )
      const addStartTime = performance.now()

      await runAdaptiveTaskQueue(
        toAdd,
        async (app, index) => {
          const [insertedFile] = await db
            .insert(filesSchema)
            .values({
              path: app.path,
              name: app.name,
              displayName: app.displayName,
              type: 'app' as const,
              mtime: app.lastModified,
              ctime: new Date()
            })
            .onConflictDoUpdate({
              target: filesSchema.path,
              set: {
                name: sql`excluded.name`,
                displayName: sql`excluded.display_name`,
                mtime: sql`excluded.mtime`
              }
            })
            .returning()

          if (insertedFile) {
            const extensions: { fileId: number; key: string; value: any }[] = []
            if (app.bundleId)
              extensions.push({ fileId: insertedFile.id, key: 'bundleId', value: app.bundleId })
            if (app.icon) extensions.push({ fileId: insertedFile.id, key: 'icon', value: app.icon })

            if (extensions.length > 0) await this.dbUtils!.addFileExtensions(extensions)

            await this._syncKeywordsForApp(app)
          }

          if ((index + 1) % 10 === 0 || index === toAdd.length - 1) {
            console.log(
              formatLog(
                'AppProvider',
                `Processed ${chalk.cyan(index + 1)}/${chalk.cyan(toAdd.length)} app additions`,
                LogStyle.info
              )
            )
          }
        },
        {
          estimatedTaskTimeMs: 12,
          label: 'AppProvider::addApps'
        }
      )

      console.log(
        formatLog(
          'AppProvider',
          `New apps added in ${chalk.cyan(((performance.now() - addStartTime) / 1000).toFixed(1))}s`,
          LogStyle.success
        )
      )
    }

    if (toUpdate.length > 0) {
      console.log(
        formatLog(
          'AppProvider',
          `Updating ${chalk.cyan(toUpdate.length)} apps...`,
          LogStyle.process
        )
      )
      const updateStartTime = performance.now()

      await runAdaptiveTaskQueue(
        toUpdate,
        async ({ fileId, app }, index) => {
          await db
            .update(filesSchema)
            .set({
              name: app.name,
              path: app.path,
              mtime: app.lastModified,
              ...(!dbAppsMap.get(app.uniqueId)?.displayName && app.displayName
                ? { displayName: app.displayName }
                : {})
            })
            .where(eq(filesSchema.id, fileId))

          const extensions: { fileId: any; key: string; value: any }[] = []
          if (app.bundleId) extensions.push({ fileId, key: 'bundleId', value: app.bundleId })
          if (app.icon) extensions.push({ fileId, key: 'icon', value: app.icon })

          if (extensions.length > 0) await this.dbUtils!.addFileExtensions(extensions)

          await this._syncKeywordsForApp(app)

          if ((index + 1) % 10 === 0 || index === toUpdate.length - 1) {
            console.log(
              formatLog(
                'AppProvider',
                `Processed ${chalk.cyan(index + 1)}/${chalk.cyan(toUpdate.length)} app updates`,
                LogStyle.info
              )
            )
          }
        },
        {
          estimatedTaskTimeMs: 10,
          label: 'AppProvider::updateApps'
        }
      )

      console.log(
        formatLog(
          'AppProvider',
          `Apps updated in ${chalk.cyan(((performance.now() - updateStartTime) / 1000).toFixed(1))}s`,
          LogStyle.success
        )
      )
    }

    if (toDeleteIds.length > 0) {
      console.log(
        formatLog(
          'AppProvider',
          `Deleting ${chalk.cyan(toDeleteIds.length)} apps...`,
          LogStyle.process
        )
      )

      const deletedItemIds = (
        await db
          .select({ bundleId: fileExtensions.value, path: filesSchema.path })
          .from(filesSchema)
          .leftJoin(
            fileExtensions,
            and(eq(filesSchema.id, fileExtensions.fileId), eq(fileExtensions.key, 'bundleId'))
          )
          .where(inArray(filesSchema.id, toDeleteIds))
      ).map((row) => row.bundleId || row.path)

      const deleteStart = performance.now()
      await db.transaction(async (tx) => {
        await tx.delete(filesSchema).where(inArray(filesSchema.id, toDeleteIds))
        await tx.delete(fileExtensions).where(inArray(fileExtensions.fileId, toDeleteIds))
      })

      if (deletedItemIds.length > 0) {
        await this.searchIndex?.removeItems(deletedItemIds)
      }

      console.log(
        formatLog(
          'AppProvider',
          `Apps deleted successfully in ${chalk.cyan(
            ((performance.now() - deleteStart) / 1000).toFixed(1)
          )}s`,
          LogStyle.success
        )
      )
    }

    console.log(
      formatLog(
        'AppProvider',
        `App data initialization complete in ${chalk.cyan(
          ((performance.now() - initStart) / 1000).toFixed(2)
        )}s`,
        LogStyle.success
      )
    )
  }

  private handleItemAddedOrChanged = async (event: any): Promise<void> => {
    if (!event || !event.filePath || this.processingPaths.has(event.filePath)) return

    let appPath = event.filePath
    if (this.isMac) {
      if (appPath.includes('.app/')) appPath = appPath.substring(0, appPath.indexOf('.app') + 4)
      if (!appPath.endsWith('.app')) return
    }

    console.log(
      formatLog('AppProvider', `App change detected: ${chalk.cyan(appPath)}`, LogStyle.info)
    )
    this.processingPaths.add(appPath)

    try {
      if (!(await this._waitForItemStable(appPath))) {
        console.log(
          formatLog(
            'AppProvider',
            `Item is unstable, skipping: ${chalk.yellow(appPath)}`,
            LogStyle.warning
          )
        )
        return
      }

      console.log(
        formatLog('AppProvider', `Fetching app info: ${chalk.cyan(appPath)}`, LogStyle.process)
      )
      const appInfo = await appScanner.getAppInfoByPath(appPath)
      if (!appInfo) {
        console.warn(
          formatLog(
            'AppProvider',
            `Could not get app info for: ${chalk.yellow(appPath)}`,
            LogStyle.warning
          )
        )
        return
      }
      const existingFile = await this.dbUtils!.getFileByPath(appInfo.path)
      const db = this.dbUtils!.getDb()

      if (existingFile) {
        console.log(
          formatLog(
            'AppProvider',
            `Updating existing app: ${chalk.cyan(appInfo.name)}`,
            LogStyle.process
          )
        )

        const updateData: any = {
          name: appInfo.name,
          mtime: appInfo.lastModified
        }

        if (!existingFile.displayName && appInfo.displayName) {
          updateData.displayName = appInfo.displayName
        }

        await db.update(filesSchema).set(updateData).where(eq(filesSchema.id, existingFile.id))

        await this.dbUtils!.addFileExtensions([
          { fileId: existingFile.id, key: 'bundleId', value: appInfo.bundleId || '' },
          { fileId: existingFile.id, key: 'icon', value: appInfo.icon }
        ])

        await this._syncKeywordsForApp(appInfo)
        console.log(
          formatLog(
            'AppProvider',
            `App ${chalk.cyan(appInfo.name)} updated successfully`,
            LogStyle.success
          )
        )
      } else {
        console.log(
          formatLog('AppProvider', `Adding new app: ${chalk.cyan(appInfo.name)}`, LogStyle.process)
        )

        const [insertedFile] = await db
          .insert(filesSchema)
          .values({
            path: appInfo.path,
            name: appInfo.name,
            displayName: appInfo.displayName,
            type: 'app' as const,
            mtime: appInfo.lastModified,
            ctime: new Date()
          })
          .returning()

        if (insertedFile) {
          await this.dbUtils!.addFileExtensions([
            { fileId: insertedFile.id, key: 'bundleId', value: appInfo.bundleId || '' },
            { fileId: insertedFile.id, key: 'icon', value: appInfo.icon }
          ])

          await this._syncKeywordsForApp(appInfo)
          console.log(
            formatLog(
              'AppProvider',
              `New app ${chalk.cyan(appInfo.name)} added successfully`,
              LogStyle.success
            )
          )
        }
      }
    } catch (error) {
      console.error(
        formatLog(
          'AppProvider',
          `Error processing app change: ${chalk.red((error as Error).message)}`,
          LogStyle.error
        )
      )
    } finally {
      this.processingPaths.delete(appPath)
    }
  }

  private handleItemUnlinked = async (event: any): Promise<void> => {
    if (!event || !event.filePath || this.processingPaths.has(event.filePath)) return

    let appPath = event.filePath
    if (this.isMac) {
      if (appPath.includes('.app/')) appPath = appPath.substring(0, appPath.indexOf('.app') + 4)
      if (!appPath.endsWith('.app')) return
    }

    console.log(
      formatLog('AppProvider', `App deletion detected: ${chalk.cyan(appPath)}`, LogStyle.process)
    )
    this.processingPaths.add(appPath)

    try {
      const fileToDelete = await this.dbUtils!.getFileByPath(appPath)
      if (fileToDelete) {
        const extensions = await this.dbUtils!.getFileExtensions(fileToDelete.id)
        const itemId = extensions.find((e) => e.key === 'bundleId')?.value || fileToDelete.path

        await this.dbUtils!.getDb().transaction(async (tx) => {
          await tx.delete(filesSchema).where(eq(filesSchema.id, fileToDelete.id))
          await tx.delete(fileExtensions).where(eq(fileExtensions.fileId, fileToDelete.id))
        })

        await this.searchIndex?.removeItems([itemId])

        console.log(
          formatLog(
            'AppProvider',
            `App deleted from database: ${chalk.cyan(appPath)}`,
            LogStyle.success
          )
        )
      } else {
        console.log(
          formatLog(
            'AppProvider',
            `App to delete not found in database: ${chalk.yellow(appPath)}`,
            LogStyle.warning
          )
        )
      }
    } catch (error) {
      console.error(
        formatLog(
          'AppProvider',
          `Error deleting app: ${chalk.red((error as Error).message)}`,
          LogStyle.error
        )
      )
    } finally {
      this.processingPaths.delete(appPath)
    }
  }

  private async fetchExtensionsForFiles(files: any[]): Promise<any[]> {
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

  async onExecute(args: IExecuteArgs): Promise<IProviderActivate | null> {
    const { item, searchResult } = args

    const sessionId = searchResult?.sessionId
    if (sessionId) {
      console.log(
        formatLog('AppProvider', `Recording app execution: ${chalk.cyan(item.id)}`, LogStyle.info)
      )
      searchEngineCore.recordExecute(sessionId, item).catch((err) => {
        console.error(
          formatLog(
            'AppProvider',
            `Failed to record execution: ${chalk.red(err.message)}`,
            LogStyle.error
          )
        )
      })
    }

    const appPath = item.meta?.app?.path
    if (!appPath) {
      console.error(
        formatLog('AppProvider', `Execution failed: App path not found`, LogStyle.error)
      )
      return null
    }

    console.log(formatLog('AppProvider', `Opening app: ${chalk.cyan(appPath)}`, LogStyle.process))
    try {
      await shell.openPath(appPath)
      console.log(
        formatLog(
          'AppProvider',
          `App opened successfully: ${chalk.green(appPath)}`,
          LogStyle.success
        )
      )
    } catch (err) {
      console.error(
        formatLog(
          'AppProvider',
          `Failed to open app: ${chalk.red((err as Error).message)}`,
          LogStyle.error
        )
      )
    }

    return null
  }

  async onSearch(query: TuffQuery): Promise<TuffSearchResult> {
    const searchStart = performance.now()
    console.log(
      formatLog('AppProvider', `Performing search: ${chalk.cyan(query.text)}`, LogStyle.process)
    )

    if (!this.dbUtils || !this.searchIndex) {
      console.log(
        formatLog(
          'AppProvider',
          'Search dependencies not ready, returning empty result',
          LogStyle.warning
        )
      )
      return TuffFactory.createSearchResult(query).build()
    }

    const rawText = query.text.trim()
    if (!rawText) {
      return TuffFactory.createSearchResult(query).build()
    }

    const db = this.dbUtils.getDb()
    const normalizedQuery = rawText.toLowerCase()
    const baseTerms = normalizedQuery.split(/[\s/]+/).filter(Boolean)
    const terms = baseTerms.length > 0 ? baseTerms : [normalizedQuery]

    let preciseMatchedItemIds: Set<string> | null = null
    if (terms.length > 0) {
      const preciseStart = performance.now()
      console.log(
        formatLog(
          'AppProvider',
          `Executing precise query: ${chalk.cyan(terms.join(', '))}`,
          LogStyle.info
        )
      )

      const preciseResults = await Promise.all(
        terms.map((term) =>
          db
            .select({ itemId: keywordMappings.itemId })
            .from(keywordMappings)
            .where(and(eq(keywordMappings.keyword, term), eq(keywordMappings.providerId, this.id)))
            .limit(200)
        )
      )

      const termMatches = preciseResults.map((rows) => new Set(rows.map((entry) => entry.itemId)))
      if (termMatches.length > 0) {
        preciseMatchedItemIds = termMatches.reduce<Set<string> | null>((accumulator, current) => {
          if (!accumulator) return current
          return new Set([...accumulator].filter((id) => current.has(id)))
        }, null)
      }
      console.debug(
        formatLog(
          'AppProvider',
          `Precise term lookup finished in ${chalk.cyan(
            (performance.now() - preciseStart).toFixed(0)
          )}ms with ${chalk.cyan(preciseMatchedItemIds?.size ?? 0)} result(s)`,
          LogStyle.info
        )
      )
    }

    const shouldCheckPhrase = baseTerms.length > 1 || baseTerms.length === 0
    if (shouldCheckPhrase) {
      const phraseStart = performance.now()
      const phraseMatches = await db
        .select({ itemId: keywordMappings.itemId })
        .from(keywordMappings)
        .where(
          and(eq(keywordMappings.keyword, normalizedQuery), eq(keywordMappings.providerId, this.id))
        )
        .limit(200)

      if (phraseMatches.length > 0) {
        const phraseSet = new Set(phraseMatches.map((entry) => entry.itemId))
        preciseMatchedItemIds = preciseMatchedItemIds
          ? new Set([...preciseMatchedItemIds, ...phraseSet])
          : phraseSet
      }
      console.debug(
        formatLog(
          'AppProvider',
          `Phrase lookup finished in ${chalk.cyan((performance.now() - phraseStart).toFixed(0))}ms with ${chalk.cyan(
            preciseMatchedItemIds?.size ?? 0
          )} accumulated result(s)`,
          LogStyle.info
        )
      )
    }

    const ftsQuery = this.buildFtsQuery(terms)
    const ftsStart = performance.now()
    const ftsMatches = ftsQuery ? await this.searchIndex.search(this.id, ftsQuery, 150) : []
    if (ftsQuery) {
      console.debug(
        formatLog(
          'AppProvider',
          `FTS search (${ftsQuery}) returned ${chalk.cyan(ftsMatches.length)} matches in ${chalk.cyan(
            (performance.now() - ftsStart).toFixed(0)
          )}ms`,
          LogStyle.info
        )
      )
    }

    const preciseCandidates = preciseMatchedItemIds ? Array.from(preciseMatchedItemIds) : []
    const maxCandidateCount = 120
    const candidateIds = new Set<string>(preciseCandidates)

    for (const match of ftsMatches) {
      if (candidateIds.size >= maxCandidateCount) break
      candidateIds.add(match.itemId)
    }

    if (candidateIds.size === 0) {
      console.log(
        formatLog(
          'AppProvider',
          'No candidates found for query, returning empty result',
          LogStyle.info
        )
      )
      return TuffFactory.createSearchResult(query).build()
    }

    const candidateList = Array.from(candidateIds)
    const fetchStart = performance.now()
    const subquery = db
      .select({ fileId: fileExtensions.fileId })
      .from(fileExtensions)
      .where(and(eq(fileExtensions.key, 'bundleId'), inArray(fileExtensions.value, candidateList)))

    const files = await db
      .select()
      .from(filesSchema)
      .where(
        and(
          eq(filesSchema.type, 'app'),
          or(inArray(filesSchema.path, candidateList), inArray(filesSchema.id, subquery))
        )
      )

    console.debug(
      formatLog(
        'AppProvider',
        `Loaded ${chalk.cyan(files.length)} candidate app rows in ${chalk.cyan(
          (performance.now() - fetchStart).toFixed(0)
        )}ms`,
        LogStyle.info
      )
    )

    if (files.length === 0) {
      console.log(
        formatLog(
          'AppProvider',
          'Candidate mapping returned no rows, search result empty',
          LogStyle.warning
        )
      )
      return TuffFactory.createSearchResult(query).build()
    }

    const appsWithExtensions = await this.fetchExtensionsForFiles(files)
    const isFuzzySearch = !preciseMatchedItemIds || preciseMatchedItemIds.size === 0

    const processedResults = await processSearchResults(
      appsWithExtensions,
      query,
      isFuzzySearch,
      this.aliases
    )

    const sortedItems = processedResults.map((item) => {
      const { score, ...rest } = item
      return rest
    })

    console.log(
      formatLog(
        'AppProvider',
        `Search complete, returning ${chalk.green(sortedItems.length)} results (precise=${chalk.cyan(
          preciseMatchedItemIds?.size ?? 0
        )}, fts=${chalk.cyan(ftsMatches.length)})`,
        LogStyle.success
      )
    )
    console.log(
      formatLog(
        'AppProvider',
        `onSearch\u300c${chalk.cyan(rawText)}\u300d finished in ${chalk.cyan(
          ((performance.now() - searchStart) / 1000).toFixed(2)
        )}s`,
        LogStyle.success
      )
    )

    return TuffFactory.createSearchResult(query).setItems(sortedItems).build()
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

  private _subscribeToFSEvents(): void {
    console.log(formatLog('AppProvider', 'Subscribing to file system events', LogStyle.info))

    if (this.isMac) {
      touchEventBus.on(TalexEvents.DIRECTORY_ADDED, this.handleItemAddedOrChanged)
      touchEventBus.on(TalexEvents.DIRECTORY_UNLINKED, this.handleItemUnlinked)
    } else {
      touchEventBus.on(TalexEvents.FILE_ADDED, this.handleItemAddedOrChanged)
      touchEventBus.on(TalexEvents.FILE_UNLINKED, this.handleItemUnlinked)
    }

    touchEventBus.on(TalexEvents.FILE_CHANGED, this.handleItemAddedOrChanged)
  }

  private _unsubscribeFromFSEvents(): void {
    console.log(formatLog('AppProvider', 'Unsubscribing from file system events', LogStyle.info))

    touchEventBus.off(TalexEvents.DIRECTORY_ADDED, this.handleItemAddedOrChanged)
    touchEventBus.off(TalexEvents.DIRECTORY_UNLINKED, this.handleItemUnlinked)
    touchEventBus.off(TalexEvents.FILE_ADDED, this.handleItemAddedOrChanged)
    touchEventBus.off(TalexEvents.FILE_UNLINKED, this.handleItemUnlinked)
    touchEventBus.off(TalexEvents.FILE_CHANGED, this.handleItemAddedOrChanged)
  }

  private _registerWatchPaths(): void {
    const watchPaths = appScanner.getWatchPaths()
    console.log(
      formatLog(
        'AppProvider',
        `Registering watch paths: ${chalk.cyan(watchPaths.join(', '))}`,
        LogStyle.info
      )
    )

    for (const p of watchPaths) {
      const depth = this.isMac && (p === '/Applications' || p.endsWith('/Applications')) ? 1 : 4
      FileSystemWatcher.addPath(p, depth)
    }
  }

  private async _waitForItemStable(itemPath: string, delay = 500, retries = 5): Promise<boolean> {
    console.log(
      formatLog(
        'AppProvider',
        `Waiting for item to stabilize: ${chalk.cyan(itemPath)}`,
        LogStyle.info
      )
    )

    for (let i = 0; i < retries; i++) {
      try {
        const size1 = (await fs.stat(itemPath)).size
        await new Promise((resolve) => setTimeout(resolve, delay))
        const size2 = (await fs.stat(itemPath)).size

        if (size1 === size2) {
          console.log(
            formatLog('AppProvider', `Item stabilized: ${chalk.green(itemPath)}`, LogStyle.success)
          )
          await sleep(1000)
          return true
        } else {
          console.log(
            formatLog(
              'AppProvider',
              `Item still changing: ${chalk.yellow(itemPath)}, retry ${i + 1}/${retries}`,
              LogStyle.info
            )
          )
        }
      } catch (error) {
        console.error(
          formatLog(
            'AppProvider',
            `Failed to check item stability: ${chalk.red((error as Error).message)}`,
            LogStyle.error
          )
        )
        return false
      }
    }

    console.warn(
      formatLog(
        'AppProvider',
        `Item did not stabilize: ${chalk.yellow(itemPath)}`,
        LogStyle.warning
      )
    )
    return false
  }

  private async _forceSyncAllKeywords(): Promise<void> {
    console.log(formatLog('AppProvider', 'Force syncing all app keywords...', LogStyle.process))

    if (!this.dbUtils) {
      console.error(
        formatLog('AppProvider', 'Database not initialized, cannot sync keywords', LogStyle.error)
      )
      return
    }

    const allDbApps = await this.dbUtils.getFilesByType('app')
    if (allDbApps.length === 0) {
      console.log(formatLog('AppProvider', 'No apps in DB, skipping sync', LogStyle.info))
      return
    }

    const appsWithExtensions = await this.fetchExtensionsForFiles(allDbApps)
    console.log(
      formatLog(
        'AppProvider',
        `Syncing keywords for ${chalk.cyan(appsWithExtensions.length)} apps`,
        LogStyle.process
      )
    )

    await runAdaptiveTaskQueue(
      appsWithExtensions,
      async (app, index) => {
        const appInfo = this._mapDbAppToScannedInfo(app)
        await this._syncKeywordsForApp(appInfo)

        if ((index + 1) % 50 === 0 || index === appsWithExtensions.length - 1) {
          console.log(
            formatLog(
              'AppProvider',
              `Processed ${chalk.cyan(index + 1)}/${chalk.cyan(appsWithExtensions.length)} app keyword syncs`,
              LogStyle.info
            )
          )
        }
      },
      {
        estimatedTaskTimeMs: 5,
        yieldIntervalMs: 30,
        maxBatchSize: 25,
        label: 'AppProvider::forceKeywordSync'
      }
    )

    console.log(formatLog('AppProvider', 'All app keywords synced successfully', LogStyle.success))
  }

  private _scheduleMdlsUpdateScan(): void {
    if (process.platform !== 'darwin') {
      console.log(
        formatLog('AppProvider', 'Not on macOS, skipping mdls scan scheduling', LogStyle.info)
      )
      return
    }

    if (is.dev) {
      console.log(formatLog('AppProvider', 'Running initial mdls scan in dev mode', LogStyle.info))
      this._runMdlsUpdateScan().then(() => {
        console.log(formatLog('AppProvider', 'Dev mode mdls scan complete', LogStyle.success))
      })
    }

    console.log(
      formatLog(
        'AppProvider',
        'Registering mdls update polling service (10 min interval)',
        LogStyle.info
      )
    )
    pollingService.register(
      'app_provider_mdls_update_scan',
      async () => {
        const lastScanTimestamp = (await this._getLastScanTime()) || 0
        const now = Date.now()

        if (!is.dev && now - lastScanTimestamp > 60 * 60 * 1000) {
          console.log(
            formatLog(
              'AppProvider',
              'Over 1 hour since last scan, starting mdls scan',
              LogStyle.info
            )
          )
          await this._runMdlsUpdateScan()
        } else if (is.dev && !lastScanTimestamp) {
          console.log(formatLog('AppProvider', 'First scan in dev mode', LogStyle.info))
          await this._runMdlsUpdateScan()
        } else {
          console.log(
            formatLog(
              'AppProvider',
              `${chalk.cyan(((now - lastScanTimestamp) / (60 * 1000)).toFixed(1))} minutes since last scan, skipping`,
              LogStyle.info
            )
          )
        }
      },
      { interval: 10, unit: 'minutes' }
    )
  }

  async _forceRebuild(): Promise<void> {
    console.log(formatLog('AppProvider', 'Forcing app database rebuild...', LogStyle.process))

    if (!this.context || !this.dbUtils) {
      console.error(
        formatLog('AppProvider', 'Context or DB not initialized, cannot rebuild', LogStyle.error)
      )
      return
    }

    const db = this.dbUtils.getDb()

    await db.delete(filesSchema)
    await db.delete(fileExtensions)
    await this.searchIndex?.removeByProvider(this.id)

    console.log(formatLog('AppProvider', 'Database cleared, re-initializing...', LogStyle.info))

    this.isInitializing = null
    await this.onLoad(this.context)

    console.log(formatLog('AppProvider', 'App database rebuild complete', LogStyle.success))
  }

  private async _getLastScanTime(): Promise<number | null> {
    if (!this.dbUtils) return null

    const db = this.dbUtils.getDb()
    const result = await db
      .select()
      .from(configSchema)
      .where(eq(configSchema.key, 'app_provider_last_mdls_scan'))
      .limit(1)

    if (result.length > 0 && result[0].value) {
      return parseInt(result[0].value, 10)
    }

    return null
  }

  private async _setLastScanTime(timestamp: number): Promise<void> {
    if (!this.dbUtils) return

    const db = this.dbUtils.getDb()
    await db
      .insert(configSchema)
      .values({ key: 'app_provider_last_mdls_scan', value: timestamp.toString() })
      .onConflictDoUpdate({
        target: configSchema.key,
        set: { value: timestamp.toString() }
      })
  }

  private async _getKnownMissingIconApps(): Promise<Set<string>> {
    if (!this.dbUtils) return new Set()

    const db = this.dbUtils.getDb()

    try {
      const result = await db
        .select({ value: configSchema.value })
        .from(configSchema)
        .where(eq(configSchema.key, MISSING_ICON_CONFIG_KEY))
        .limit(1)

      const rawValue = result[0]?.value
      if (!rawValue) return new Set()

      const parsed = JSON.parse(rawValue)
      if (!Array.isArray(parsed)) return new Set()

      const ids = parsed.filter(
        (item): item is string => typeof item === 'string' && item.length > 0
      )
      return new Set(ids)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(
        formatLog(
          'AppProvider',
          `Failed to load missing icon config, continuing without cache: ${message}`,
          LogStyle.warning
        )
      )
      return new Set()
    }
  }

  private async _saveKnownMissingIconApps(appIds: Set<string>): Promise<void> {
    if (!this.dbUtils) return

    const db = this.dbUtils.getDb()
    const serializedIds = JSON.stringify(Array.from(appIds))

    try {
      await db
        .insert(configSchema)
        .values({ key: MISSING_ICON_CONFIG_KEY, value: serializedIds })
        .onConflictDoUpdate({
          target: configSchema.key,
          set: { value: serializedIds }
        })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(
        formatLog(
          'AppProvider',
          `Failed to persist missing icon config: ${message}`,
          LogStyle.warning
        )
      )
    }
  }

  private async _runMdlsUpdateScan(): Promise<void> {
    if (process.platform !== 'darwin') {
      console.log(formatLog('AppProvider', 'Not on macOS, skipping mdls scan', LogStyle.info))
      return
    }

    if (!this.dbUtils) {
      console.error(
        formatLog('AppProvider', 'Database not initialized, cannot run mdls scan', LogStyle.error)
      )
      return
    }

    console.log(formatLog('AppProvider', 'Starting mdls update scan...', LogStyle.process))

    const allDbApps = await this.dbUtils.getFilesByType('app')
    if (allDbApps.length === 0) {
      console.log(formatLog('AppProvider', 'No apps in DB, skipping mdls scan', LogStyle.info))
      return
    }

    const { updatedApps, updatedCount } = await appScanner.runMdlsUpdateScan(allDbApps)

    if (updatedCount > 0 && updatedApps.length > 0) {
      const db = this.dbUtils.getDb()

      for (const app of updatedApps) {
        await runWithSqliteBusyRetry(() =>
          db
            .update(filesSchema)
            .set({ displayName: app.displayName })
            .where(eq(filesSchema.id, app.id))
        )

        const [appWithExtensions] = await this.fetchExtensionsForFiles([app])
        if (appWithExtensions) {
          const appInfo = this._mapDbAppToScannedInfo({
            ...appWithExtensions,
            displayName: app.displayName
          })

          const itemId = appInfo.uniqueId
          await this.searchIndex?.removeItems([itemId])
          await this._syncKeywordsForApp(appInfo)
        }
      }
    }

    await this._setLastScanTime(Date.now())
  }
}

// 导出单例
export const appProvider = new AppProvider()
