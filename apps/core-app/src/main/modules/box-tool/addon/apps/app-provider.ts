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
import { pinyin, match } from 'pinyin-pro'

import { shell } from 'electron'
import searchEngineCore from '../../search-engine/search-core'
import path from 'path'
import fs from 'fs'
import FileSystemWatcher from '../../../file-system-watcher'
import { createDbUtils } from '../../../../db/utils'
import { files as filesSchema, fileExtensions, keywordMappings } from '../../../../db/schema'
import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { touchEventBus, TalexEvents } from '../../../../core/eventbus/touch-event'
import { sleep } from '@talex-touch/utils'
import { pollingService } from '@talex-touch/utils/common/utils/polling'
import { config as configSchema } from '../../../../db/schema'
import { is } from '@electron-toolkit/utils'

interface ScannedAppInfo {
  name: string
  displayName?: string
  fileName: string
  path: string
  icon: string
  bundleId?: string
  uniqueId: string
  lastModified: Date
}

/**
 * Generates an acronym from a given string.
 * e.g., "Visual Studio Code" -> "vsc"
 */
function generateAcronym(name: string): string {
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

type Range = { start: number; end: number } // 右开 [start, end)

/**
 * Converts an array of matching indices to an array of start/end ranges for highlighting.
 * e.g., [0, 1, 4, 5, 6] -> [{ start: 0, end: 2 }, { start: 4, end: 7 }]
 */
function convertIndicesToRanges(indices: number[]): Range[] {
  if (!indices?.length) return []
  const arr = Array.from(new Set(indices)).sort((a, b) => a - b) // 去重 + 拷贝 + 排序

  const ranges: Range[] = []
  let start = arr[0]
  let prev = arr[0]

  for (let i = 1; i < arr.length; i++) {
    const x = arr[i]
    if (x === prev + 1) {
      prev = x // 连续，延长
    } else {
      ranges.push({ start, end: prev + 1 }) // 右开
      start = prev = x
    }
  }
  ranges.push({ start, end: prev + 1 })
  return ranges
}

class AppProvider implements ISearchProvider {
  readonly id = 'app-provider'
  readonly name = 'App Provider'
  readonly type = 'application' as const

  private dbUtils: ReturnType<typeof createDbUtils> | null = null
  private context: ProviderContext | null = null
  private isInitializing: Promise<void> | null = null
  private readonly isMac = process.platform === 'darwin'
  private processingPaths: Set<string> = new Set()
  private aliases: Record<string, string[]> = {}

  private WATCH_PATHS = this.isMac
    ? ['/Applications', path.join(process.env.HOME || '', 'Applications')]
    : [
        path.join(process.env.PROGRAMFILES || '', '.'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', '.'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs')
      ]

  async onLoad(context: ProviderContext): Promise<void> {
    this.context = context
    this.dbUtils = createDbUtils(context.databaseManager.getDb())
    if (!this.isInitializing) {
      this.isInitializing = this._initialize()
      await this.isInitializing
    }
    await this._forceSyncAllKeywords()

    this._subscribeToFSEvents()
    this._registerWatchPaths()
    this._scheduleMdlsUpdateScan()
  }

  async onDestroy(): Promise<void> {
    this._unsubscribeFromFSEvents()
  }

  public async setAliases(aliases: Record<string, string[]>): Promise<void> {
    this.aliases = aliases
    console.log('[AppProvider] Aliases updated. Resyncing all app keywords...')
    // When aliases change, we need to re-sync keywords for all apps
    if (!this.dbUtils) return
    const allApps = await this.dbUtils.getFilesByType('app')
    const appsWithExtensions = await this.fetchExtensionsForFiles(allApps)
    for (const app of appsWithExtensions) {
      const appInfo: ScannedAppInfo = {
        name: app.name,
        displayName: app.displayName || undefined,
        fileName: path.basename(app.path, '.app'),
        path: app.path,
        icon: app.extensions.icon || '',
        bundleId: app.extensions.bundleId || undefined,
        uniqueId: app.extensions.bundleId || app.path,
        lastModified: app.mtime
      }
      await this._syncKeywordsForApp(appInfo)
    }
    console.log('[AppProvider] Finished resyncing keywords for all apps.')
  }

  private async _syncKeywordsForApp(appInfo: ScannedAppInfo): Promise<void> {
    if (appInfo.path.toLowerCase().includes('wechatdevtools')) {
      console.log('[DEBUG] Syncing keywords for wechatdevtools:', JSON.stringify(appInfo, null, 2))
    }
    if (!this.dbUtils) {
      return
    }

    const db = this.dbUtils.getDb()
    const itemId = appInfo.bundleId || appInfo.path

    // 1. Generate a comprehensive set of keywords
    const generatedKeywords = new Set<string>()

    // Collect all possible names
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

      const acronym = generateAcronym(name)
      if (acronym) generatedKeywords.add(acronym)

      if (CHINESE_REGEX.test(name)) {
        const pinyinFull = pinyin(name, { toneType: 'none' }).replace(/\s/g, '')
        generatedKeywords.add(pinyinFull)

        const pinyinFirst = pinyin(name, { pattern: 'first', toneType: 'none' }).replace(/\s/g, '')
        generatedKeywords.add(pinyinFirst)
      }
    }

    const aliasList = this.aliases[itemId] || this.aliases[appInfo.path]
    if (aliasList) aliasList.forEach((alias) => generatedKeywords.add(alias.toLowerCase()))

    const finalKeywords = new Set<string>()
    for (const keyword of generatedKeywords) {
      if (keyword.length > 1 && !INVALID_KEYWORD_REGEX.test(keyword)) {
        finalKeywords.add(keyword)
      }
    }
    // 2. Fetch existing keywords from the database
    const existingKeywords = await db
      .select({ keyword: keywordMappings.keyword })
      .from(keywordMappings)
      .where(eq(keywordMappings.itemId, itemId))
    const existingKeywordsSet = new Set(existingKeywords.map((k) => k.keyword))

    // 3. Determine which keywords are new
    const keywordsToInsert = Array.from(finalKeywords).filter((k) => !existingKeywordsSet.has(k))

    if (keywordsToInsert.length === 0) {
      return
    }

    // 4. Insert only the new keywords
    const insertData = keywordsToInsert.map((keyword) => {
      // Re-generate acronym inside map to check against keyword, or check against all generated acronyms
      const isAcronym = names.some((name) => generateAcronym(name) === keyword)
      const isAlias = aliasList?.includes(keyword)
      return {
        keyword,
        itemId,
        priority: isAcronym || isAlias ? 1.5 : 1.0
      }
    })

    await db.insert(keywordMappings).values(insertData).onConflictDoNothing()
  }

  private async _initialize(): Promise<void> {
    if (!this.dbUtils) return

    // This now only gets apps from initial file scan, not mdfind
    const scannedApps = await this.getAppsByPlatform()
    const scannedAppsMap = new Map(scannedApps.map((app) => [app.uniqueId, app]))

    const dbApps = await this.dbUtils.getFilesByType('app')
    const dbAppsWithExtensions = await this.fetchExtensionsForFiles(dbApps)
    const dbAppsMap = new Map(
      dbAppsWithExtensions.map((app) => [app.extensions.bundleId || app.path, app])
    )

    const toAdd: ScannedAppInfo[] = []
    const toUpdate: { fileId: number; app: ScannedAppInfo }[] = []
    const toDeleteIds: number[] = []

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

    const db = this.dbUtils.getDb()

    if (toAdd.length > 0) {
      for (const app of toAdd) {
        const [upsertedFile] = await db
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

        if (upsertedFile) {
          const extensions: { fileId: number; key: string; value: string }[] = []
          if (app.bundleId)
            extensions.push({ fileId: upsertedFile.id, key: 'bundleId', value: app.bundleId })
          if (app.icon) extensions.push({ fileId: upsertedFile.id, key: 'icon', value: app.icon })
          if (extensions.length > 0) await this.dbUtils.addFileExtensions(extensions)
          // Keyword sync will be handled by _forceSyncAllKeywords
        }
      }
    }

    if (toUpdate.length > 0) {
      for (const { fileId, app } of toUpdate) {
        const dbApp = dbAppsMap.get(app.uniqueId)
        const updateData: { name: string; path: string; mtime: Date; displayName?: string } = {
          name: app.name,
          path: app.path,
          mtime: app.lastModified
        }
        // Only update displayName if the existing one is empty
        if (!dbApp?.displayName && app.displayName) {
          updateData.displayName = app.displayName
        }

        await db.update(filesSchema).set(updateData).where(eq(filesSchema.id, fileId))

        const extensions: { fileId: number; key: string; value: string }[] = []
        if (app.bundleId) extensions.push({ fileId, key: 'bundleId', value: app.bundleId })
        if (app.icon) extensions.push({ fileId, key: 'icon', value: app.icon })
        if (extensions.length > 0) await this.dbUtils.addFileExtensions(extensions)
        // Keyword sync will be handled by _forceSyncAllKeywords
      }
    }

    if (toDeleteIds.length > 0) {
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

      await db.transaction(async (tx) => {
        await tx.delete(filesSchema).where(inArray(filesSchema.id, toDeleteIds))
        await tx.delete(fileExtensions).where(inArray(fileExtensions.fileId, toDeleteIds))
        if (deletedItemIds.length > 0) {
          await tx.delete(keywordMappings).where(inArray(keywordMappings.itemId, deletedItemIds))
        }
      })
    }

    // mdls scan is now handled separately
  }

  private handleItemAddedOrChanged = async (event: any): Promise<void> => {
    if (!event || !event.filePath || this.processingPaths.has(event.filePath)) return

    let appPath = event.filePath
    if (this.isMac) {
      if (appPath.includes('.app/')) appPath = appPath.substring(0, appPath.indexOf('.app') + 4)
      if (!appPath.endsWith('.app')) return
    }

    this.processingPaths.add(appPath)
    try {
      if (!(await this._waitForItemStable(appPath))) return

      const appInfo = await this.getAppInfoByPath(appPath)
      if (!appInfo) {
        return
      }

      const db = this.dbUtils!.getDb()
      const existingFile = await this.dbUtils!.getFileByPath(appInfo.path)

      if (existingFile) {
        // UPDATE
        const updateData: { name: string; mtime: Date; displayName?: string } = {
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
      } else {
        // INSERT
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
        }
      }
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

    this.processingPaths.add(appPath)
    try {
      if (!this.dbUtils) return

      const fileToDelete = await this.dbUtils.getFileByPath(appPath)
      if (fileToDelete) {
        const itemId =
          (await this.dbUtils.getFileExtensions(fileToDelete.id)).find((e) => e.key === 'bundleId')
            ?.value || fileToDelete.path
        await this.dbUtils.getDb().transaction(async (tx) => {
          await tx.delete(filesSchema).where(eq(filesSchema.id, fileToDelete.id))
          await tx.delete(fileExtensions).where(eq(fileExtensions.fileId, fileToDelete.id))
          await tx.delete(keywordMappings).where(eq(keywordMappings.itemId, itemId))
        })
      }
    } finally {
      this.processingPaths.delete(appPath)
    }
  }

  private async getItemsByIds(
    itemIds: string[]
  ): Promise<(typeof filesSchema.$inferSelect & { extensions: Record<string, string | null> })[]> {
    if (!this.dbUtils || itemIds.length === 0) return []

    const db = this.dbUtils.getDb()

    // This query is complex. It needs to find apps where either the bundleId (in file_extensions)
    // or the path (in files) is in the list of itemIds.
    const subquery = db
      .select({
        fileId: fileExtensions.fileId
      })
      .from(fileExtensions)
      .where(and(eq(fileExtensions.key, 'bundleId'), inArray(fileExtensions.value, itemIds)))

    const files = await db
      .select()
      .from(filesSchema)
      .where(
        and(
          eq(filesSchema.type, 'app'),
          or(inArray(filesSchema.path, itemIds), inArray(filesSchema.id, subquery))
        )
      )

    return this.fetchExtensionsForFiles(files)
  }

  async onExecute(args: IExecuteArgs): Promise<IProviderActivate | null> {
    const { item, searchResult } = args
    const sessionId = searchResult?.sessionId

    if (sessionId) {
      searchEngineCore.recordExecute(sessionId, item).catch((err) => {
        console.error('[AppProvider] Failed to record execution.', err)
      })
    }

    const appPath = item.meta?.app?.path
    if (!appPath) return null

    try {
      await shell.openPath(appPath)
    } catch (err) {
      console.error(`Failed to open application at: ${appPath}`, err)
    }
    return null
  }

  async onSearch(query: TuffQuery): Promise<TuffSearchResult> {
    if (!this.dbUtils || !query.text) {
      return TuffFactory.createSearchResult(query).build()
    }

    const db = this.dbUtils.getDb()
    const lowerCaseQuery = query.text.toLowerCase()

    // 1. Search in keyword_mappings
    const matchedKeywords = await db
      .select({
        itemId: keywordMappings.itemId,
        keyword: keywordMappings.keyword
      })
      .from(keywordMappings)
      .where(sql`lower(keyword) LIKE ${'%' + lowerCaseQuery + '%'}`)

    if (matchedKeywords.length === 0) {
      return TuffFactory.createSearchResult(query).build()
    }

    // Group keywords by itemId
    const keywordsByItemId = matchedKeywords.reduce(
      (acc, { itemId, keyword }) => {
        if (!acc[itemId]) {
          acc[itemId] = []
        }
        acc[itemId].push(keyword)
        return acc
      },
      {} as Record<string, string[]>
    )

    const itemIds = Object.keys(keywordsByItemId)

    // 2. Fetch full app info for matched itemIds
    const apps = await this.getItemsByIds(itemIds)

    // 3. Score and sort the results
    const searchResults = apps
      .map((app) => {
        const uniqueId = app.extensions.bundleId || app.path
        const matchedKws = keywordsByItemId[uniqueId] || []
        const bestKeyword = matchedKws.sort((a, b) => a.length - b.length)[0] || ''

        const potentialTitles = [app.displayName, app.name].filter(Boolean) as string[]
        let bestMatch: {
          title: string
          result: number[] | null
          score: number
        } = {
          title: app.displayName || app.name,
          result: null,
          score: 0
        }

        for (const title of potentialTitles) {
          const matchResult = match(title, query.text)
          // The score is higher for better matches (closer to the beginning of the string)
          const score = matchResult ? 1 - matchResult[0] / title.length : 0
          if (score > bestMatch.score) {
            bestMatch = { title, result: matchResult, score }
          }
        }
        
        // If no direct match on titles, use keyword match as a baseline
        const finalScore = bestMatch.score > 0 ? bestMatch.score : 0.5
        const highlights = bestMatch.result ? convertIndicesToRanges(bestMatch.result) : []

        const tuffItem = this.mapAppToTuffItem(app, {
          title: bestMatch.title,
          highlights,
          matchedKeyword: bestKeyword
        })

        const updatedItem: TuffItem = {
          ...tuffItem,
          scoring: { ...tuffItem.scoring, final: finalScore }
        }
        return { item: updatedItem, score: finalScore }
      })
      .filter((result): result is { item: TuffItem; score: number } => result !== null)
      .sort((a, b) => b.score - a.score)
      .map((result) => result.item)

    return TuffFactory.createSearchResult(query).setItems(searchResults).build()
  }

  // Keep other methods like _subscribeToFSEvents, _registerWatchPaths, _waitForItemStable, fetchExtensionsForFiles, mapAppToTuffItem, getAppsByPlatform, getAppInfoByPath as they are.
  // The comprehensive scan logic will also be kept and updated to use the new keyword sync.

  private _subscribeToFSEvents(): void {
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
    touchEventBus.off(TalexEvents.DIRECTORY_ADDED, this.handleItemAddedOrChanged)
    touchEventBus.off(TalexEvents.DIRECTORY_UNLINKED, this.handleItemUnlinked)
    touchEventBus.off(TalexEvents.FILE_ADDED, this.handleItemAddedOrChanged)
    touchEventBus.off(TalexEvents.FILE_UNLINKED, this.handleItemUnlinked)
    touchEventBus.off(TalexEvents.FILE_CHANGED, this.handleItemAddedOrChanged)
  }

  private _registerWatchPaths(): void {
    for (const p of this.WATCH_PATHS) {
      const depth = this.isMac && (p === '/Applications' || p.endsWith('/Applications')) ? 1 : 4
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
          await sleep(1000)
          return true
        }
      } catch {
        return false
      }
    }
    return false
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
    app: typeof filesSchema.$inferSelect & { extensions: Record<string, string | null> },
    override?: {
      title?: string
      highlights?: { start: number; end: number }[]
      matchedKeyword?: string
    }
  ): TuffItem {
    const title = override?.title || app.displayName || app.name
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
          title: title,
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
          matchResult: override?.highlights,
          matchedKeyword: override?.matchedKeyword,
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
      // FIXME: These need to be updated to return the full ScannedAppInfo object
      case 'win32': {
        const { getApps } = await import('./win')
        const apps = await getApps()
        return apps.map((app) => ({
          ...app,
          displayName: undefined,
          fileName: path.basename(app.path)
        }))
      }
      case 'linux': {
        const { getApps } = await import('./linux')
        const apps = await getApps()
        return apps.map((app) => ({
          ...app,
          displayName: undefined,
          fileName: path.basename(app.path)
        }))
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
        // FIXME: These need to be updated to return the full ScannedAppInfo object
        case 'win32': {
          const { getAppInfo } = await import('./win')
          const appInfo = await getAppInfo(filePath)
          return appInfo
            ? { ...appInfo, displayName: undefined, fileName: path.basename(appInfo.path) }
            : null
        }
        case 'linux': {
          const { getAppInfo } = await import('./linux')
          const appInfo = await getAppInfo(filePath)
          return appInfo
            ? { ...appInfo, displayName: undefined, fileName: path.basename(appInfo.path) }
            : null
        }
        default:
          return null
      }
    } catch (error) {
      console.error(`[AppProvider] Failed to get app info for ${filePath}:`, error)
      return null
    }
  }

  private _scheduleMdlsUpdateScan(): void {
    // dev 模式下立即执行一次
    if (is.dev) {
      this._runMdlsUpdateScan().then(() => {
        console.log('[AppProvider] Initial mdls update scan completed in dev mode.')
      })
    }

    // 启动一个轮询服务，每 10 分钟检查一次是否需要执行
    pollingService.register(
      'app_provider_mdls_update_scan',
      async () => {
        const lastScanTimestamp = (await this._getLastScanTime()) || 0
        const now = Date.now()
        // 如果距离上次扫描超过 1 小时 (在 prod 模式下)
        if (!is.dev && now - lastScanTimestamp > 60 * 60 * 1000) {
          await this._runMdlsUpdateScan()
        } else if (is.dev && !lastScanTimestamp) {
          // dev 模式下如果还没有扫描过，也执行一次
          await this._runMdlsUpdateScan()
        }
      },
      { interval: 10, unit: 'minutes' },
    )
  }

  async _forceRebuild(): Promise<void> {
    if (!this.dbUtils || !this.context) return
    const db = this.dbUtils.getDb()
    console.log('[AppProvider] Forcing rebuild of application database...')
    await db.delete(filesSchema)
    await db.delete(keywordMappings)
    await db.delete(fileExtensions)
    console.log('[AppProvider] Database cleared. Rescanning...')
    this.isInitializing = null
    await this.onLoad(this.context)
    console.log('[AppProvider] Force rebuild completed.')
  }

  private async _forceSyncAllKeywords(): Promise<void> {
    if (!this.dbUtils) {
      return
    }
    const allDbApps = await this.dbUtils.getFilesByType('app')

    if (allDbApps.length === 0) {
      return
    }

    const appsWithExtensions = await this.fetchExtensionsForFiles(allDbApps)

    for (const app of appsWithExtensions) {
      const appInfo: ScannedAppInfo = {
        name: app.name,
        displayName: app.displayName || undefined,
        fileName: path.basename(app.path, '.app'),
        path: app.path,
        icon: app.extensions.icon || '',
        bundleId: app.extensions.bundleId || undefined,
        uniqueId: app.extensions.bundleId || app.path,
        lastModified: app.mtime
      }
      await this._syncKeywordsForApp(appInfo)
    }
  }

  private async _runMdlsUpdateScan(): Promise<void> {
    if (process.platform !== 'darwin' || !this.dbUtils) return

    const db = this.dbUtils.getDb()
    const allDbApps = await this.dbUtils.getFilesByType('app')
    if (allDbApps.length === 0) return

    console.log(`[AppProvider] Running mdls update scan for ${allDbApps.length} apps.`)

    const { exec } = await import('child_process')

    for (const app of allDbApps) {
      try {
        console.log(`[MDLS_DEBUG] Processing app: ${app.path}`)
        const command = `mdls -name kMDItemDisplayName -raw "${app.path}"`
        console.log(`[MDLS_DEBUG] Executing command: ${command}`)

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { stdout, stderr } = await new Promise<{ stdout: string; stderr: string }>(
          (resolve, reject) => {
            exec(command, (err, stdout, stderr) => {
              if (err) {
                console.error(`[MDLS_DEBUG] Command execution error for ${app.path}:`, err)
                return reject(err)
              }
              if (stderr) {
                console.warn(`[MDLS_DEBUG] Command execution stderr for ${app.path}:`, stderr)
              }
              resolve({ stdout, stderr })
            })
          },
        )

        console.log(`[MDLS_DEBUG] Raw stdout for ${app.path}: "${stdout}"`)
        let spotlightName = stdout.trim()
        console.log(`[MDLS_DEBUG] Trimmed spotlightName: "${spotlightName}"`)

        // Remove .app suffix if it exists
        if (spotlightName.endsWith('.app')) {
          spotlightName = spotlightName.slice(0, -4)
          console.log(`[MDLS_DEBUG] Removed .app suffix: "${spotlightName}"`)
        }

        const currentDisplayName = app.displayName
        console.log(`[MDLS_DEBUG] Current displayName in DB: "${currentDisplayName}"`)

        if (spotlightName && spotlightName !== '(null)' && spotlightName !== currentDisplayName) {
          console.log(
            `[MDLS_DEBUG] Condition MET. Updating displayName for ${app.name} from "${currentDisplayName}" to "${spotlightName}"`
          )
          const updateQuery = db
            .update(filesSchema)
            .set({ displayName: spotlightName })
            .where(eq(filesSchema.id, app.id))
          
          console.log(`[MDLS_DEBUG] DB Update SQL: ${updateQuery.toSQL().sql}`)
          await updateQuery

          // Re-sync keywords with the new displayName
          const [appWithExtensions] = await this.fetchExtensionsForFiles([app])
          if (appWithExtensions) {
            const appInfo: ScannedAppInfo = {
              name: appWithExtensions.name,
              displayName: spotlightName, // Use the new name
              fileName: path.basename(appWithExtensions.path, '.app'),
              path: appWithExtensions.path,
              icon: appWithExtensions.extensions.icon || '',
              bundleId: appWithExtensions.extensions.bundleId || undefined,
              uniqueId: appWithExtensions.extensions.bundleId || appWithExtensions.path,
              lastModified: appWithExtensions.mtime
            }
            // Delete old keywords and re-sync
            const itemId = appInfo.uniqueId
            const deleteQuery = db.delete(keywordMappings).where(eq(keywordMappings.itemId, itemId))
            console.log(`[MDLS_DEBUG] DB Delete Keywords SQL: ${deleteQuery.toSQL().sql}`)
            await deleteQuery
            await this._syncKeywordsForApp(appInfo)
            console.log(`[MDLS_DEBUG] Re-synced keywords for ${appInfo.name}`)
          }
        } else {
          console.log(`[MDLS_DEBUG] Condition NOT MET. No update for ${app.name}.`)
          console.log(
            `[MDLS_DEBUG] Reason: spotlightName="${spotlightName}", currentDisplayName="${currentDisplayName}"`
          )
        }
      } catch (e) {
        console.error(`[MDLS_DEBUG] CATCH BLOCK: Error processing app ${app.path}:`, e)
      }
    }
    await this._setLastScanTime(Date.now())
    console.log('[AppProvider] mdls update scan finished.')
  }

  private async _getLastScanTime(): Promise<number | null> {
    if (!this.dbUtils) return null
    const db = this.dbUtils.getDb()
    const result = await db
      .select()
      .from(configSchema)
      .where(eq(configSchema.key, 'app_provider_last_mdls_scan'))
      .limit(1)
    return result.length > 0 && result[0].value ? parseInt(result[0].value, 10) : null
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
}

export const appProvider = new AppProvider()
