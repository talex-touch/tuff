import {
  IExecuteArgs,
  IProviderActivate,
  ISearchProvider,
  ProviderContext,
  
  TuffQuery,
  TuffSearchResult
} from '../../search-engine/types'
import { TuffFactory } from '@talex-touch/utils/core-box'
import { pinyin } from 'pinyin-pro' // 只保留 pinyin

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

import { processSearchResults } from './search-processing-service' // 引入精加工服务
import { levenshteinDistance } from '@talex-touch/utils/search/levenshtein-utils';

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
    console.debug('[AppProvider] Aliases updated. Resyncing all app keywords...')
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
    console.debug('[AppProvider] Finished resyncing keywords for all apps.')
  }

  private async _syncKeywordsForApp(appInfo: ScannedAppInfo): Promise<void> {
    if (appInfo.path.toLowerCase().includes('wechatdevtools')) {
      console.debug('[AppProvider] Syncing keywords for wechatdevtools:', JSON.stringify(appInfo, null, 2))
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
    const queryTerms = lowerCaseQuery.split(/[\s/]+/).filter(Boolean); // 按空白或 / 拆分关键词

    let preciseMatchedItemIds: Set<string> | null = null;

    // --- 精确查询路径 ---
    if (queryTerms.length > 0) {
      const allTermMatchedItemIds: Set<string>[] = [];

      for (const term of queryTerms) {
        const matchedKeywords = await db
          .select({ itemId: keywordMappings.itemId })
          .from(keywordMappings)
          .where(sql`lower(keyword) LIKE ${'%' + term + '%'}`);
        
        allTermMatchedItemIds.push(new Set(matchedKeywords.map(k => k.itemId)));
      }

      // 对所有 term 的匹配结果取交集 (AND 语义)
      if (allTermMatchedItemIds.length > 0) {
        preciseMatchedItemIds = allTermMatchedItemIds.reduce((intersection, currentSet) => {
          return new Set([...intersection].filter(id => currentSet.has(id)));
        });
      }
    }

    let finalApps: (typeof filesSchema.$inferSelect & { extensions: Record<string, string | null> })[] = [];
    let isFuzzySearch = false;

    if (preciseMatchedItemIds && preciseMatchedItemIds.size > 0) {
      // 精确匹配有结果
      finalApps = await this.getItemsByIds(Array.from(preciseMatchedItemIds));
    } else {
      // --- 模糊查询路径 (兜底) ---
      isFuzzySearch = true;
      console.debug(`[AppProvider] No precise matches for '${query.text}', falling back to fuzzy search.`);
      
      // 假设模糊查询只对整个查询文本进行，而不是拆分的 term
      // 1. 获取所有 app 类型的记录
      const allApps = await db.select().from(filesSchema).where(eq(filesSchema.type, 'app'));

      // 2. 在内存中进行 Levenshtein 距离计算和过滤
      const fuzzyMatchedFiles = allApps.filter(app => {
        const distance = levenshteinDistance(app.name.toLowerCase(), lowerCaseQuery);
        return distance <= 2;
      });
      
      finalApps = await this.fetchExtensionsForFiles(fuzzyMatchedFiles);
    }

    // TODO: 实现 "精加工" 服务 (步骤 3) 来计算 source 和 indices
    // TODO: 实现 "排序与返回" (步骤 4)
    const processedResults = await processSearchResults(finalApps, query, isFuzzySearch, this.aliases);

    // --- 4. 排序与返回 ---
    // 排序逻辑已在 processSearchResults 内部通过 score 完成，这里只需按 score 降序
    const sortedItems = processedResults
      .sort((a, b) => b.score - a.score)
      .map(item => {
        // 移除内部 score 字段，只保留 TuffItem 结构
        const { score, ...rest } = item;
        return rest;
      });

    return TuffFactory.createSearchResult(query).setItems(sortedItems).build()
  }

  // Keep other methods like _subscribeToFSEvents, _registerWatchPaths, _waitForItemStable, fetchExtensionsForFiles, mapAppTo getAppsByPlatform, getAppInfoByPath as they are.
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
        console.debug('[AppProvider] Initial mdls update scan completed in dev mode.')
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
    console.debug('[AppProvider] Forcing rebuild of application database...')
    await db.delete(filesSchema)
    await db.delete(keywordMappings)
    await db.delete(fileExtensions)
    console.debug('[AppProvider] Database cleared. Rescanning...')
    this.isInitializing = null
    await this.onLoad(this.context)
    console.debug('[AppProvider] Force rebuild completed.')
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

    console.debug(`[AppProvider] Running mdls update scan for ${allDbApps.length} apps.`)

    const { exec } = await import('child_process')

    for (const app of allDbApps) {
      try {
        const command = `mdls -name kMDItemDisplayName -raw "${app.path}"`
        const { stdout } = await new Promise<{ stdout: string; stderr: string }>(
          (resolve, reject) => {
            exec(command, (err, stdout, stderr) => {
              if (err) {
                console.error(`[AppProvider] MDLS command error for ${app.path}:`, err)
                return reject(err)
              }
              if (stderr) {
                console.warn(`[AppProvider] MDLS command stderr for ${app.path}:`, stderr)
              }
              resolve({ stdout, stderr })
            })
          },
        )

        let spotlightName = stdout.trim()

        if (spotlightName.endsWith('.app')) {
          spotlightName = spotlightName.slice(0, -4)
        }

        const currentDisplayName = app.displayName

        if (spotlightName && spotlightName !== '(null)' && spotlightName !== currentDisplayName) {
          console.debug(
            `[AppProvider] Updating displayName for ${app.name}: "${currentDisplayName || 'null'}" -> "${spotlightName}"`
          )
          await db.update(filesSchema).set({ displayName: spotlightName }).where(eq(filesSchema.id, app.id))

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
            await db.delete(keywordMappings).where(eq(keywordMappings.itemId, itemId))
            await this._syncKeywordsForApp(appInfo)
            console.debug(`[AppProvider] Re-synced keywords for ${appInfo.name}`)
          }
        }
      } catch (e) {
        console.error(`[AppProvider] Error processing app ${app.path} during MDLS scan:`, e)
      }
    }
    await this._setLastScanTime(Date.now())
    console.debug('[AppProvider] mdls update scan finished.')
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