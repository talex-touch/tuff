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
import { is } from '@electron-toolkit/utils'
import chalk from 'chalk'

import { createDbUtils } from '../../../../db/utils'
import { files as filesSchema, fileExtensions, keywordMappings, config as configSchema } from '../../../../db/schema'
import { and, eq, inArray, or, sql } from 'drizzle-orm'

import { appScanner } from './app-scanner'
import { processSearchResults } from './search-processing-service'
import { formatLog, LogStyle } from './app-utils'
import searchEngineCore from '../../search-engine/search-core'
import { levenshteinDistance } from '@talex-touch/utils/search/levenshtein-utils'

/**
 * 应用提供者
 * 负责应用搜索和执行功能
 */
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

  constructor() {
    console.log(formatLog('AppProvider', '初始化应用提供者服务', LogStyle.info))
  }

  /**
   * 加载应用提供者
   */
  async onLoad(context: ProviderContext): Promise<void> {
    console.log(formatLog('AppProvider', '开始加载应用提供者服务', LogStyle.process))
    this.context = context
    this.dbUtils = createDbUtils(context.databaseManager.getDb())

    if (!this.isInitializing) {
      this.isInitializing = this._initialize()
      await this.isInitializing
    }

    // 同步所有应用关键词
    await this._forceSyncAllKeywords()

    // 订阅文件系统事件
    this._subscribeToFSEvents()

    // 注册监视路径
    this._registerWatchPaths()

    // 安排mdls更新扫描
    this._scheduleMdlsUpdateScan()

    console.log(formatLog('AppProvider', '应用提供者服务加载完成', LogStyle.success))
  }

  /**
   * 卸载时清理资源
   */
  async onDestroy(): Promise<void> {
    console.log(formatLog('AppProvider', '卸载应用提供者服务', LogStyle.process))
    this._unsubscribeFromFSEvents()
    console.log(formatLog('AppProvider', '应用提供者服务已卸载', LogStyle.success))
  }

  /**
   * 设置应用别名
   */
  public async setAliases(aliases: Record<string, string[]>): Promise<void> {
    console.log(formatLog('AppProvider', '更新应用别名', LogStyle.process))
    this.aliases = aliases

    console.log(formatLog('AppProvider', '应用别名已更新，重新同步所有应用关键词', LogStyle.info))

    // 重新同步所有应用关键词
    if (!this.dbUtils) return

    const allApps = await this.dbUtils.getFilesByType('app')
    const appsWithExtensions = await this.fetchExtensionsForFiles(allApps)

    console.log(
      formatLog(
        'AppProvider',
        `开始为 ${chalk.cyan(appsWithExtensions.length)} 个应用重新同步关键词`,
        LogStyle.process
      )
    )

    let processedCount = 0
    for (const app of appsWithExtensions) {
      const appInfo = this._mapDbAppToScannedInfo(app)
      await this._syncKeywordsForApp(appInfo)
      processedCount++

      // Track progress without console output
    }

    console.log(formatLog('AppProvider', '所有应用关键词同步完成', LogStyle.success))
  }

  /**
   * 将数据库应用记录映射到扫描的应用信息
   */
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
    if (!this.dbUtils) return

    // 1. 生成关键词集合
    const keywordsSet = await this._generateKeywordsForApp(appInfo)

    // 2. 获取现有关键词
    const db = this.dbUtils.getDb()
    const itemId = appInfo.bundleId || appInfo.path

    const existingKeywords = await db
      .select({ keyword: keywordMappings.keyword })
      .from(keywordMappings)
      .where(eq(keywordMappings.itemId, itemId))

    const existingKeywordsSet = new Set(existingKeywords.map((k) => k.keyword))

    // 3. 确定需要添加的新关键词
    const keywordsToInsert = Array.from(keywordsSet).filter((k) => !existingKeywordsSet.has(k))

    if (keywordsToInsert.length === 0) {
      return
    }

    // 4. 插入新关键词
    const insertData = keywordsToInsert.map((keyword) => {
      // 判断是否是首字母缩写或别名
      const isAcronym = this._isAcronymForApp(keyword, appInfo)
      const isAlias = this._isAliasForApp(keyword, appInfo)

      return {
        keyword,
        itemId,
        priority: isAcronym || isAlias ? 1.5 : 1.0
      }
    })

    await db.insert(keywordMappings).values(insertData).onConflictDoNothing()
  }

  /**
   * 检查关键词是否为应用的首字母缩写
   */
  private _isAcronymForApp(keyword: string, appInfo: any): boolean {
    const names = [appInfo.name, appInfo.displayName, appInfo.fileName].filter(Boolean) as string[]
    return names.some((name) => {
      // 提取首字母缩写
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

  /**
   * 检查关键词是否为应用的别名
   */
  private _isAliasForApp(keyword: string, appInfo: any): boolean {
    const uniqueId = appInfo.bundleId || appInfo.path
    const aliasList = this.aliases[uniqueId] || this.aliases[appInfo.path] || []
    return aliasList.includes(keyword)
  }

  /**
   * 为应用生成搜索关键词
   */
  private async _generateKeywordsForApp(appInfo: any): Promise<Set<string>> {
    // 1. 生成关键词的综合集合
    const generatedKeywords = new Set<string>()

    // 收集所有可能的名称
    const names = [appInfo.name, appInfo.displayName, appInfo.fileName].filter(Boolean) as string[]

    // 正则表达式
    const CHINESE_REGEX = /[\u4e00-\u9fa5]/
    const INVALID_KEYWORD_REGEX = /[^a-zA-Z0-9\u4e00-\u9fa5]/

    // 从名称生成各种形式的关键词
    for (const name of names) {
      const lowerCaseName = name.toLowerCase()

      // 添加完整名称和无空格版本
      generatedKeywords.add(lowerCaseName)
      generatedKeywords.add(lowerCaseName.replace(/\s/g, ''))

      // 添加单词拆分
      lowerCaseName.split(/[\s-]/).forEach((word) => {
        if (word) generatedKeywords.add(word)
      })

      // 添加首字母缩写
      const acronym = this._generateAcronym(name)
      if (acronym) generatedKeywords.add(acronym)

      // 处理中文，添加拼音
      if (CHINESE_REGEX.test(name)) {
        try {
          const { pinyin } = await import('pinyin-pro')
          // 全拼
          const pinyinFull = pinyin(name, { toneType: 'none' }).replace(/\s/g, '')
          generatedKeywords.add(pinyinFull)

          // 首字母
          const pinyinFirst = pinyin(name, { pattern: 'first', toneType: 'none' }).replace(/\s/g, '')
          generatedKeywords.add(pinyinFirst)
        } catch (error) {
          console.warn(formatLog('AppProvider', `获取拼音失败: ${name}`, LogStyle.warning))
        }
      }
    }

    // 添加别名
    const uniqueId = appInfo.bundleId || appInfo.path
    const aliasList = this.aliases[uniqueId] || this.aliases[appInfo.path]
    if (aliasList) {
      aliasList.forEach((alias) => generatedKeywords.add(alias.toLowerCase()))
    }

    // 过滤无效关键词
    const finalKeywords = new Set<string>()
    for (const keyword of generatedKeywords) {
      if (keyword.length > 1 && !INVALID_KEYWORD_REGEX.test(keyword)) {
        finalKeywords.add(keyword)
      }
    }

    return finalKeywords
  }

  /**
   * 生成首字母缩写
   */
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

  /**
   * 初始化应用提供者
   */
  private async _initialize(): Promise<void> {
    console.log(formatLog('AppProvider', '开始初始化应用数据', LogStyle.process))

    // 使用应用扫描服务扫描应用
    const scannedApps = await appScanner.getApps()
    const scannedAppsMap = new Map(scannedApps.map((app) => [app.uniqueId, app]))

    // 获取数据库中的应用
    const dbApps = await this.dbUtils!.getFilesByType('app')
    const dbAppsWithExtensions = await this.fetchExtensionsForFiles(dbApps)
    const dbAppsMap = new Map(
      dbAppsWithExtensions.map((app) => [app.extensions.bundleId || app.path, app])
    )

    // 确定需要添加、更新和删除的应用
    const toAdd = []
    const toUpdate = []
    const toDeleteIds = []

    console.log(
      formatLog(
        'AppProvider',
        `对比扫描到的 ${chalk.cyan(scannedApps.length)} 个应用与数据库中的 ${chalk.cyan(dbApps.length)} 个应用`,
        LogStyle.info
      )
    )

    // 对比扫描到的和数据库中的应用
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

    // 数据库中存在但扫描不到的应用需要删除
    for (const deletedApp of dbAppsMap.values()) {
      toDeleteIds.push(deletedApp.id)
    }

    console.log(
      formatLog(
        'AppProvider',
        `需要 ${chalk.green('添加')} ${chalk.cyan(toAdd.length)} 个应用, ${chalk.yellow('更新')} ${chalk.cyan(toUpdate.length)} 个应用, ${chalk.red('删除')} ${chalk.cyan(toDeleteIds.length)} 个应用`,
        LogStyle.info
      )
    )

    const db = this.dbUtils!.getDb()

    // 添加新应用
    if (toAdd.length > 0) {
      console.log(formatLog('AppProvider', `开始添加 ${chalk.cyan(toAdd.length)} 个新应用`, LogStyle.process))
      const addStartTime = Date.now()

      for (const app of toAdd) {
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
          const extensions = []
          if (app.bundleId)
            extensions.push({ fileId: insertedFile.id, key: 'bundleId', value: app.bundleId })
          if (app.icon)
            extensions.push({ fileId: insertedFile.id, key: 'icon', value: app.icon })

          if (extensions.length > 0)
            await this.dbUtils!.addFileExtensions(extensions)

          // 同步关键词
          await this._syncKeywordsForApp(app)
        }
      }

      console.log(formatLog('AppProvider', `新应用添加完成，耗时 ${chalk.cyan(((Date.now() - addStartTime) / 1000).toFixed(1))} 秒`, LogStyle.success))
    }

    // 更新现有应用
    if (toUpdate.length > 0) {
      console.log(formatLog('AppProvider', `开始更新 ${chalk.cyan(toUpdate.length)} 个应用`, LogStyle.process))
      const updateStartTime = Date.now()

      for (const { fileId, app } of toUpdate) {
        await db
          .update(filesSchema)
          .set({
            name: app.name,
            path: app.path,
            mtime: app.lastModified,
            // 仅在当前为空时更新displayName
            ...(!dbAppsMap.get(app.uniqueId)?.displayName && app.displayName ? { displayName: app.displayName } : {})
          })
          .where(eq(filesSchema.id, fileId))

        const extensions = []
        if (app.bundleId)
          extensions.push({ fileId: fileId, key: 'bundleId', value: app.bundleId })
        if (app.icon)
          extensions.push({ fileId: fileId, key: 'icon', value: app.icon })

        if (extensions.length > 0)
          await this.dbUtils!.addFileExtensions(extensions)

        // 同步关键词
        await this._syncKeywordsForApp(app)
      }

      console.log(formatLog('AppProvider', `应用更新完成，耗时 ${chalk.cyan(((Date.now() - updateStartTime) / 1000).toFixed(1))} 秒`, LogStyle.success))
    }

    // 删除不存在的应用
    if (toDeleteIds.length > 0) {
      console.log(formatLog('AppProvider', `开始删除 ${chalk.cyan(toDeleteIds.length)} 个不存在的应用`, LogStyle.process))

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

      console.log(formatLog('AppProvider', `应用删除完成`, LogStyle.success))
    }

    console.log(formatLog('AppProvider', '应用数据初始化完成', LogStyle.success))
  }

  /**
   * 处理文件系统中添加或修改的项目
   */
  private handleItemAddedOrChanged = async (event: any): Promise<void> => {
    if (!event || !event.filePath || this.processingPaths.has(event.filePath)) return

    let appPath = event.filePath
    if (this.isMac) {
      if (appPath.includes('.app/')) appPath = appPath.substring(0, appPath.indexOf('.app') + 4)
      if (!appPath.endsWith('.app')) return
    }

    console.log(formatLog('AppProvider', `检测到应用变化: ${chalk.cyan(appPath)}`, LogStyle.info))
    this.processingPaths.add(appPath)

    try {
      if (!(await this._waitForItemStable(appPath))) {
        console.log(formatLog('AppProvider', `应用不稳定，跳过处理: ${chalk.yellow(appPath)}`, LogStyle.warning))
        return
      }

      console.log(formatLog('AppProvider', `获取应用信息: ${chalk.cyan(appPath)}`, LogStyle.process))
      const appInfo = await appScanner.getAppInfoByPath(appPath)
      if (!appInfo) {
        console.warn(formatLog('AppProvider', `无法获取应用信息: ${chalk.yellow(appPath)}`, LogStyle.warning))
        return
      }

      // 检查应用是否已存在
      const existingFile = await this.dbUtils!.getFileByPath(appInfo.path)
      const db = this.dbUtils!.getDb()

      if (existingFile) {
        // 更新现有应用
        console.log(formatLog('AppProvider', `更新现有应用: ${chalk.cyan(appInfo.name)}`, LogStyle.process))

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

        // 同步关键词
        await this._syncKeywordsForApp(appInfo)
        console.log(formatLog('AppProvider', `应用 ${chalk.cyan(appInfo.name)} 更新完成`, LogStyle.success))
      } else {
        // 添加新应用
        console.log(formatLog('AppProvider', `添加新应用: ${chalk.cyan(appInfo.name)}`, LogStyle.process))

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

          // 同步关键词
          await this._syncKeywordsForApp(appInfo)
          console.log(formatLog('AppProvider', `新应用 ${chalk.cyan(appInfo.name)} 添加完成`, LogStyle.success))
        }
      }
    } catch (error) {
      console.error(
        formatLog(
          'AppProvider',
          `处理应用变化时发生错误: ${chalk.red((error as Error).message)}`,
          LogStyle.error
        )
      )
    } finally {
      this.processingPaths.delete(appPath)
    }
  }

  /**
   * 处理文件系统中删除的项目
   */
  private handleItemUnlinked = async (event: any): Promise<void> => {
    if (!event || !event.filePath || this.processingPaths.has(event.filePath)) return

    let appPath = event.filePath
    if (this.isMac) {
      if (appPath.includes('.app/')) appPath = appPath.substring(0, appPath.indexOf('.app') + 4)
      if (!appPath.endsWith('.app')) return
    }

    console.log(formatLog('AppProvider', `检测到应用被删除: ${chalk.cyan(appPath)}`, LogStyle.process))
    this.processingPaths.add(appPath)

    try {
      const fileToDelete = await this.dbUtils!.getFileByPath(appPath)
      if (fileToDelete) {
        const extensions = await this.dbUtils!.getFileExtensions(fileToDelete.id)
        const itemId = extensions.find((e) => e.key === 'bundleId')?.value || fileToDelete.path

        await this.dbUtils!.getDb().transaction(async (tx) => {
          await tx.delete(filesSchema).where(eq(filesSchema.id, fileToDelete.id))
          await tx.delete(fileExtensions).where(eq(fileExtensions.fileId, fileToDelete.id))
          await tx.delete(keywordMappings).where(eq(keywordMappings.itemId, itemId))
        })

        console.log(formatLog('AppProvider', `应用已从数据库中删除: ${chalk.cyan(appPath)}`, LogStyle.success))
      } else {
        console.log(formatLog('AppProvider', `未在数据库中找到要删除的应用: ${chalk.yellow(appPath)}`, LogStyle.warning))
      }
    } catch (error) {
      console.error(
        formatLog(
          'AppProvider',
          `删除应用时发生错误: ${chalk.red((error as Error).message)}`,
          LogStyle.error
        )
      )
    } finally {
      this.processingPaths.delete(appPath)
    }
  }

  /**
   * 获取扩展信息
   */
  private async fetchExtensionsForFiles(
    files: any[]
  ): Promise<any[]> {
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

  /**
   * 应用执行
   */
  async onExecute(args: IExecuteArgs): Promise<IProviderActivate | null> {
    const { item, searchResult } = args

    // 记录执行
    const sessionId = searchResult?.sessionId
    if (sessionId) {
      console.log(formatLog('AppProvider', `记录应用执行: ${chalk.cyan(item.id)}`, LogStyle.info))
      searchEngineCore.recordExecute(sessionId, item).catch((err) => {
        console.error(formatLog('AppProvider', `记录执行失败: ${chalk.red(err.message)}`, LogStyle.error))
      })
    }

    // 打开应用
    const appPath = item.meta?.app?.path
    if (!appPath) {
      console.error(formatLog('AppProvider', `执行失败: 未找到应用路径`, LogStyle.error))
      return null
    }

    console.log(formatLog('AppProvider', `打开应用: ${chalk.cyan(appPath)}`, LogStyle.process))
    try {
      await shell.openPath(appPath)
      console.log(formatLog('AppProvider', `应用打开成功: ${chalk.green(appPath)}`, LogStyle.success))
    } catch (err) {
      console.error(formatLog('AppProvider', `打开应用失败: ${chalk.red((err as Error).message)}`, LogStyle.error))
    }

    return null
  }

  /**
   * 应用搜索
   */
  async onSearch(query: TuffQuery): Promise<TuffSearchResult> {
    console.log(formatLog('AppProvider', `执行搜索: ${chalk.cyan(query.text)}`, LogStyle.process))

    if (!this.dbUtils || !query.text) {
      console.log(formatLog('AppProvider', '搜索词为空或数据库未初始化，返回空结果', LogStyle.info))
      return TuffFactory.createSearchResult(query).build()
    }

    const db = this.dbUtils.getDb()
    const lowerCaseQuery = query.text.toLowerCase()
    const queryTerms = lowerCaseQuery.split(/[\s/]+/).filter(Boolean) // 按空白或 / 拆分关键词

    let preciseMatchedItemIds: Set<string> | null = null
    let isFuzzySearch = false

    // --- 精确查询路径 ---
    if (queryTerms.length > 0) {
      console.log(formatLog('AppProvider', `执行精确查询: ${chalk.cyan(queryTerms.join(', '))}`, LogStyle.info))
      const allTermMatchedItemIds: Set<string>[] = []

      for (const term of queryTerms) {
        const matchedKeywords = await db
          .select({ itemId: keywordMappings.itemId })
          .from(keywordMappings)
          .where(sql`lower(keyword) LIKE ${'%' + term + '%'}`)

        allTermMatchedItemIds.push(new Set(matchedKeywords.map((k) => k.itemId)))
      }

      // 对所有 term 的匹配结果取交集 (AND 语义)
      if (allTermMatchedItemIds.length > 0) {
        preciseMatchedItemIds = allTermMatchedItemIds.reduce((intersection, currentSet) => {
          return new Set([...intersection].filter((id) => currentSet.has(id)))
        })
      }
    }

    let finalApps = []

    if (preciseMatchedItemIds && preciseMatchedItemIds.size > 0) {
      // 精确匹配有结果
      console.log(formatLog('AppProvider', `精确匹配找到 ${chalk.green(preciseMatchedItemIds.size)} 个结果`, LogStyle.success))

      // 查询匹配项
      const itemIds = Array.from(preciseMatchedItemIds)
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

      finalApps = await this.fetchExtensionsForFiles(files)
    } else {
      // --- 模糊查询路径 (兜底) ---
      isFuzzySearch = true
      console.log(
        formatLog('AppProvider', `无精确匹配结果，转为模糊搜索: ${chalk.cyan(query.text)}`, LogStyle.info)
      )

      // 获取所有应用进行模糊匹配
      const allApps = await this.dbUtils.getFilesByType('app')

      console.log(formatLog('AppProvider', `在 ${chalk.cyan(allApps.length)} 个应用中执行模糊匹配`, LogStyle.process))

      // 使用 Levenshtein 距离计算和过滤
      const fuzzyMatchedFiles = allApps.filter((app) => {
        const distance = levenshteinDistance(app.name.toLowerCase(), lowerCaseQuery)
        return distance <= 2
      })

      console.log(formatLog('AppProvider', `模糊匹配找到 ${chalk.green(fuzzyMatchedFiles.length)} 个结果`, LogStyle.success))
      finalApps = await this.fetchExtensionsForFiles(fuzzyMatchedFiles)
    }

    // 处理搜索结果，计算评分和高亮
    const processedResults = await processSearchResults(
      finalApps,
      query,
      isFuzzySearch,
      this.aliases
    )

    // 创建最终的搜索结果
    const sortedItems = processedResults.map(item => {
      const { score, ...rest } = item
      return rest
    })

    console.log(formatLog('AppProvider', `搜索完成，返回 ${chalk.green(sortedItems.length)} 个结果`, LogStyle.success))
    return TuffFactory.createSearchResult(query).setItems(sortedItems).build()
  }

  /**
   * 订阅文件系统事件
   */
  private _subscribeToFSEvents(): void {
    console.log(formatLog('AppProvider', '订阅文件系统事件', LogStyle.info))

    if (this.isMac) {
      touchEventBus.on(TalexEvents.DIRECTORY_ADDED, this.handleItemAddedOrChanged)
      touchEventBus.on(TalexEvents.DIRECTORY_UNLINKED, this.handleItemUnlinked)
    } else {
      touchEventBus.on(TalexEvents.FILE_ADDED, this.handleItemAddedOrChanged)
      touchEventBus.on(TalexEvents.FILE_UNLINKED, this.handleItemUnlinked)
    }

    touchEventBus.on(TalexEvents.FILE_CHANGED, this.handleItemAddedOrChanged)
  }

  /**
   * 取消订阅文件系统事件
   */
  private _unsubscribeFromFSEvents(): void {
    console.log(formatLog('AppProvider', '取消订阅文件系统事件', LogStyle.info))

    touchEventBus.off(TalexEvents.DIRECTORY_ADDED, this.handleItemAddedOrChanged)
    touchEventBus.off(TalexEvents.DIRECTORY_UNLINKED, this.handleItemUnlinked)
    touchEventBus.off(TalexEvents.FILE_ADDED, this.handleItemAddedOrChanged)
    touchEventBus.off(TalexEvents.FILE_UNLINKED, this.handleItemUnlinked)
    touchEventBus.off(TalexEvents.FILE_CHANGED, this.handleItemAddedOrChanged)
  }

  /**
   * 注册监视路径
   */
  private _registerWatchPaths(): void {
    const watchPaths = appScanner.getWatchPaths()
    console.log(formatLog('AppProvider', `注册监视路径: ${chalk.cyan(watchPaths.join(', '))}`, LogStyle.info))

    for (const p of watchPaths) {
      const depth = this.isMac && (p === '/Applications' || p.endsWith('/Applications')) ? 1 : 4
      FileSystemWatcher.addPath(p, depth)
    }
  }

  /**
   * 等待项目稳定
   */
  private async _waitForItemStable(itemPath: string, delay = 500, retries = 5): Promise<boolean> {
    console.log(formatLog('AppProvider', `等待项目稳定: ${chalk.cyan(itemPath)}`, LogStyle.info))

    for (let i = 0; i < retries; i++) {
      try {
        const size1 = (await fs.stat(itemPath)).size
        await new Promise((resolve) => setTimeout(resolve, delay))
        const size2 = (await fs.stat(itemPath)).size

        if (size1 === size2) {
          console.log(formatLog('AppProvider', `项目已稳定: ${chalk.green(itemPath)}`, LogStyle.success))
          await sleep(1000)
          return true
        } else {
          console.log(formatLog('AppProvider', `项目仍在变化: ${chalk.yellow(itemPath)}，重试 ${i+1}/${retries}`, LogStyle.info))
        }
      } catch (error) {
        console.error(formatLog('AppProvider', `检查项目稳定性失败: ${chalk.red((error as Error).message)}`, LogStyle.error))
        return false
      }
    }

    console.warn(formatLog('AppProvider', `项目未达到稳定状态: ${chalk.yellow(itemPath)}`, LogStyle.warning))
    return false
  }

  /**
   * 同步所有应用的关键词
   */
  private async _forceSyncAllKeywords(): Promise<void> {
    console.log(formatLog('AppProvider', '开始同步所有应用的关键词', LogStyle.process))

    if (!this.dbUtils) {
      console.error(formatLog('AppProvider', '数据库未初始化，无法同步关键词', LogStyle.error))
      return
    }

    const allDbApps = await this.dbUtils.getFilesByType('app')
    if (allDbApps.length === 0) {
      console.log(formatLog('AppProvider', '数据库中没有应用，跳过同步', LogStyle.info))
      return
    }

    const appsWithExtensions = await this.fetchExtensionsForFiles(allDbApps)
    console.log(formatLog('AppProvider', `为 ${chalk.cyan(appsWithExtensions.length)} 个应用同步关键词`, LogStyle.process))

    for (const app of appsWithExtensions) {
      const appInfo = this._mapDbAppToScannedInfo(app)
      await this._syncKeywordsForApp(appInfo)
    }

    console.log(formatLog('AppProvider', '所有应用关键词同步完成', LogStyle.success))
  }

  /**
   * 安排 mdls 更新扫描
   */
  private _scheduleMdlsUpdateScan(): void {
    if (process.platform !== 'darwin') {
      console.log(formatLog('AppProvider', '非 macOS 平台，跳过 mdls 扫描', LogStyle.info))
      return
    }

    // 开发模式下立即执行一次
    if (is.dev) {
      console.log(formatLog('AppProvider', '开发模式下立即执行一次 mdls 扫描', LogStyle.info))
      this._runMdlsUpdateScan().then(() => {
        console.log(formatLog('AppProvider', '开发模式 mdls 扫描完成', LogStyle.success))
      })
    }

    // 启动轮询服务
    console.log(formatLog('AppProvider', '注册 mdls 更新扫描轮询服务 (10分钟间隔)', LogStyle.info))
    pollingService.register(
      'app_provider_mdls_update_scan',
      async () => {
        const lastScanTimestamp = await this._getLastScanTime() || 0
        const now = Date.now()

        // 生产模式下 1 小时执行一次，开发模式下如果没扫描过则执行一次
        if (!is.dev && now - lastScanTimestamp > 60 * 60 * 1000) {
          console.log(formatLog('AppProvider', '距离上次扫描超过1小时，开始 mdls 扫描', LogStyle.info))
          await this._runMdlsUpdateScan()
        } else if (is.dev && !lastScanTimestamp) {
          console.log(formatLog('AppProvider', '开发模式下首次扫描', LogStyle.info))
          await this._runMdlsUpdateScan()
        } else {
          console.log(
            formatLog(
              'AppProvider',
              `距离上次扫描 ${chalk.cyan(((now - lastScanTimestamp) / (60 * 1000)).toFixed(1))} 分钟，暂不执行`,
              LogStyle.info
            )
          )
        }
      },
      { interval: 10, unit: 'minutes' }
    )
  }

  /**
   * 强制重建应用数据库
   */
  async _forceRebuild(): Promise<void> {
    console.log(formatLog('AppProvider', '强制重建应用数据库', LogStyle.process))

    if (!this.context || !this.dbUtils) {
      console.error(formatLog('AppProvider', '上下文或数据库未初始化，无法重建', LogStyle.error))
      return
    }

    const db = this.dbUtils.getDb()

    // 清空数据库表
    await db.delete(filesSchema)
    await db.delete(keywordMappings)
    await db.delete(fileExtensions)

    console.log(formatLog('AppProvider', '数据库已清空，开始重新扫描', LogStyle.info))

    // 重新初始化
    this.isInitializing = null
    await this.onLoad(this.context)

    console.log(formatLog('AppProvider', '应用数据库重建完成', LogStyle.success))
  }

  /**
   * 获取上次扫描时间
   */
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

  /**
   * 设置上次扫描时间
   */
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

  /**
   * 执行 mdls 更新扫描
   */
  private async _runMdlsUpdateScan(): Promise<void> {
    if (process.platform !== 'darwin') {
      console.log(formatLog('AppProvider', '非 macOS 平台，跳过 mdls 扫描', LogStyle.info))
      return
    }

    if (!this.dbUtils) {
      console.error(formatLog('AppProvider', '数据库未初始化，无法执行 mdls 扫描', LogStyle.error))
      return
    }

    console.log(formatLog('AppProvider', '开始 mdls 更新扫描', LogStyle.process))

    const allDbApps = await this.dbUtils.getFilesByType('app')
    if (allDbApps.length === 0) {
      console.log(formatLog('AppProvider', '数据库中没有应用，跳过 mdls 扫描', LogStyle.info))
      return
    }

    // 使用 appScanner 执行 mdls 扫描
    const { updatedApps, updatedCount } = await appScanner.runMdlsUpdateScan(allDbApps)

    // 如果有更新，则更新数据库和关键词
    if (updatedCount > 0 && updatedApps.length > 0) {
      const db = this.dbUtils.getDb()

      for (const app of updatedApps) {
        // 更新显示名
        await db
          .update(filesSchema)
          .set({ displayName: app.displayName })
          .where(eq(filesSchema.id, app.id))

        // 重新同步关键词
        const [appWithExtensions] = await this.fetchExtensionsForFiles([app])
        if (appWithExtensions) {
          const appInfo = this._mapDbAppToScannedInfo({
            ...appWithExtensions,
            displayName: app.displayName
          })

          // 删除旧关键词
          const itemId = appInfo.uniqueId
          await db.delete(keywordMappings).where(eq(keywordMappings.itemId, itemId))

          // 重新同步关键词
          await this._syncKeywordsForApp(appInfo)
        }
      }
    }

    // 更新扫描时间
    await this._setLastScanTime(Date.now())
  }
}

// 导出单例
export const appProvider = new AppProvider()