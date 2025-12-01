import type { ITuffIcon } from '@talex-touch/utils'
import type { TuffItem } from '@talex-touch/utils/core-box'
import type { ITouchEvent } from '@talex-touch/utils/eventbus'
import type {
  IFeatureLifeCycle,
  IPlatform,
  IPluginChannelBridge,
  IPluginDev,
  IPluginFeature,
  ITargetFeatureLifeCycle,
  ITouchPlugin,
  PluginIssue,
} from '@talex-touch/utils/plugin'
import type { TouchWindow } from '../../core/touch-window'
import path from 'node:path'
import { ChannelType } from '@talex-touch/utils/channel'
import { TuffItemBuilder } from '@talex-touch/utils/core-box'
import {
  createBoxSDK,
  createClipboardManager,
  createDivisionBoxSDK,
  createFeatureSDK,
  PluginStatus,
} from '@talex-touch/utils/plugin'
import { PluginLogger, PluginLoggerManager } from '@talex-touch/utils/plugin/node'
import axios from 'axios'
import { app, BrowserWindow, clipboard, dialog, shell } from 'electron'
import fse from 'fs-extra'
import { genTouchChannel } from '../../core/channel-core'
import {
  PluginLogAppendEvent,
  PluginStorageUpdatedEvent,
  TalexEvents,
  touchEventBus,
} from '../../core/eventbus/touch-event'
import { TuffIconImpl } from '../../core/tuff-icon'
import { getJs, getStyles } from '../../utils/plugin-injection'
import { getCoreBoxWindow } from '../box-tool/core-box'
import { CoreBoxManager } from '../box-tool/core-box/manager'
import { getBoxItemManager } from '../box-tool/item-sdk'
import { loadPluginFeatureContext, loadPluginFeatureContextFromContent, PluginFeature } from './plugin-feature'
import { PluginViewLoader } from './view/plugin-view-loader'
import { widgetManager } from './widget/widget-manager'

const disallowedArrays = [
  '官方',
  'touch',
  'talex',
  '第一',
  '权利',
  '权威性',
  '官方认证',
  '触控',
  '联系',
  '互动',
  '互动式',
  '触控技术',
  '互动体验',
  '互动设计',
  '创意性',
  '创造性',
  '首发',
  '首部',
  '首款',
  '首张',
  '排行',
  '排名系统',
]

/**
 * Plugin implementation
 */
export class TouchPlugin implements ITouchPlugin {
  dev: IPluginDev
  name: string
  readme: string
  version: string
  desc: string
  icon: ITuffIcon
  logger: PluginLogger
  platforms: IPlatform
  features: PluginFeature[]
  issues: PluginIssue[]
  _uniqueChannelKey: string

  pluginPath: string

  public pluginLifecycle: IFeatureLifeCycle | null = null
  _featureEvent: Map<string, ITargetFeatureLifeCycle[]> = new Map<
    string,
    ITargetFeatureLifeCycle[]
  >()

  private featureControllers: Map<string, AbortController> = new Map()

  _status: PluginStatus = PluginStatus.DISABLED
  webViewInit: boolean = false

  _windows: Map<number, TouchWindow> = new Map()

  _searchItems: TuffItem[] = []
  _lastSearchQuery: string = ''
  _searchTimestamp: number = 0

  /** DivisionBox configuration from manifest */
  divisionBoxConfig?: import('@talex-touch/utils').ManifestDivisionBoxConfig

  /**
   * Serialize plugin to JSON object
   * @returns Plain object representation of the plugin
   */
  toJSONObject(): object {
    return {
      name: this.name,
      readme: this.readme,
      version: this.version,
      desc: this.desc,
      icon: {
        type: this.icon.type,
        value: this.icon.value,
        status: this.icon.status,
      },
      dev: this.dev,
      status: this.status,
      platforms: this.platforms,
      features: this.features.map((feature) => {
        // 防御性检查：确保 feature 有 toJSONObject 方法
        if (typeof feature.toJSONObject === 'function') {
          return feature.toJSONObject()
        }
        // 如果不是 PluginFeature 实例，尝试手动构造对象
        console.warn(
          `[Plugin ${this.name}] Feature ${feature.id} does not have toJSONObject method, using fallback`,
        )
        return {
          id: feature.id,
          name: feature.name,
          desc: feature.desc,
          icon: feature.icon,
          push: feature.push,
          platform: feature.platform,
          commands: feature.commands,
          interaction: feature.interaction,
          priority: feature.priority || 0,
        }
      }),
      issues: this.issues,
    }
  }

  get status(): PluginStatus {
    return this._status
  }

  set status(v: PluginStatus) {
    this._status = v

    const channel = genTouchChannel()!
    channel
    && channel.send(ChannelType.MAIN, 'plugin-status-updated', {
      plugin: this.name,
      status: this._status,
    })
  }

  addFeature(feature: IPluginFeature): boolean {
    if (this.features.find(f => f.name === feature.name))
      return false

    const { id, name, desc, commands } = feature

    const regex = /^[\w-]+$/
    if (!regex.test(id)) {
      console.error(`[Plugin] Feature add error, id ${id} not valid.`)
      return false
    }

    if (
      disallowedArrays.filter(
        (item: string) => name.includes(item) || desc.includes(item),
      ).length
    ) {
      console.error(`[Plugin] Feature add error, name or desc contains disallowed words.`)
      return false
    }

    if (commands.length < 1)
      return false

    // 如果已经是 PluginFeature 实例，直接使用；否则创建新实例
    const pluginFeature
      = feature instanceof PluginFeature
        ? feature
        : new PluginFeature(this.pluginPath, feature, this.dev)

    return this.features.push(pluginFeature) >= 0
  }

  delFeature(featureId: string): boolean {
    if (!this.features.find(f => f.name === featureId))
      return false

    return (
      this.features.splice(
        this.features.findIndex(f => f.name === featureId),
        1,
      ) !== undefined
    )
  }

  getFeature(featureId: string): IPluginFeature | null {
    return this.features.find(f => f.id === featureId) || null
  }

  getFeatures(): IPluginFeature[] {
    return this.features
  }

  async triggerFeature(feature: IPluginFeature, query: any): Promise<boolean | void> {
    if (this.featureControllers.has(feature.id)) {
      this.featureControllers.get(feature.id)?.abort()
    }

    const controller = new AbortController()
    this.featureControllers.set(feature.id, controller)

    if (feature.interaction?.type === 'webcontent') {
      const interactionPath = feature.interaction.path
      if (!interactionPath) {
        this.logger.error(
          `Security Alert: Aborted loading view with invalid path: ${interactionPath}`,
        )
        return
      }

      this.logger.info(`Trigger feature with WebContent interaction: ${feature.id}`)

      if (!this.pluginLifecycle) {
        this.logger.warn(
          `Plugin lifecycle not initialized before triggering feature. This may indicate an issue.`,
        )
      }
      await PluginViewLoader.loadPluginView(this, feature)
      return true
    }

    if (feature.interaction?.type === 'widget') {
      const needsRegistration = Boolean(feature.interaction.path)
      if (needsRegistration) {
        const registration = await widgetManager.registerWidget(this, feature)
        if (!registration) {
          this.logger.warn(`Widget interaction failed to load for feature: ${feature.id}`)
          return false
        }
        this.logger.info(
          `Widget interaction ready for feature: ${feature.id} (id=${registration.widgetId}, file=${registration.filePath})`,
        )
      }
    }

    const result = this.pluginLifecycle?.onFeatureTriggered(feature.id, query, feature, controller.signal)
    this._featureEvent.get(feature.id)?.forEach(fn => fn.onLaunch?.(feature))
    return result
  }

  triggerInputChanged(feature: IPluginFeature, query: any): void {
    // Pass query (can be string for backward compatibility or TuffQuery object)
    this.pluginLifecycle?.onFeatureTriggered(feature.id, query, feature)

    // For backward compatibility, extract text if query is object
    const queryText = typeof query === 'string' ? query : query?.text
    this._featureEvent.get(feature.id)?.forEach(fn => fn.onInputChanged?.(queryText))
  }

  public clearCoreBoxItems(): void {
    console.debug(
      `[Plugin ${this.name}] clearItems() called - clearing ${this._searchItems.length} items`,
    )

    this._searchItems = []
    this._searchTimestamp = Date.now()

    const coreBoxWindow = getCoreBoxWindow()
    console.debug(`[Plugin ${this.name}] CoreBox window available for clearing:`, !!coreBoxWindow)

    if (coreBoxWindow && !coreBoxWindow.window.isDestroyed()) {
      const channel = genTouchChannel()

      const payload = {
        pluginName: this.name,
        timestamp: this._searchTimestamp,
      }

      console.debug(`[Plugin ${this.name}] Sending core-box:clear-items with payload:`, payload)

      channel
        .sendTo(coreBoxWindow.window, ChannelType.MAIN, 'core-box:clear-items', payload)
        .catch((error) => {
          console.error(`[Plugin ${this.name}] Failed to clear search results from CoreBox:`, error)
        })

      console.debug(`[Plugin ${this.name}] Successfully sent clear command to CoreBox`)
    }
    else {
      console.warn(
        `[Plugin ${this.name}] CoreBox window not available for clearing search results - window exists: ${!!coreBoxWindow}, destroyed: ${coreBoxWindow?.window.isDestroyed()}`,
      )
    }
  }

  /**
   * 为 item 自动注入插件源信息
   * @param item - 原始 item
   * @returns 注入源信息后的 item
   */
  private enrichItemWithSource(item: TuffItem): TuffItem {
    return {
      ...item,
      source: {
        type: 'plugin' as const,
        id: this.name,
        name: this.name,
        version: this.version,
      },
    }
  }

  constructor(
    name: string,
    icon: ITuffIcon,
    version: string,
    desc: string,
    readme: string,
    dev: IPluginDev,
    pluginPath: string,
    platforms: IPlatform = {},
    options?: { skipDataInit?: boolean },
  ) {
    this.name = name
    this.icon = icon
    this.version = version
    this.desc = desc
    this.readme = readme
    this.dev = dev

    this.pluginPath = pluginPath
    this.platforms = platforms
    this.features = []
    this.issues = []
    this._uniqueChannelKey = ''

    this.logger = new PluginLogger(
      name,
      new PluginLoggerManager(this.pluginPath, this, (log) => {
        touchEventBus.emit(TalexEvents.PLUGIN_LOG_APPEND, new PluginLogAppendEvent(log))
      }),
    )

    if (!options?.skipDataInit) {
      this.ensureDataDirectories()
    }
  }

  private getDataPath(): string {
    const userDataPath = $app.rootPath
    return path.join(userDataPath, 'modules', 'plugins', this.name, 'data')
  }

  getConfigPath(): string {
    return path.join(this.getDataPath(), 'config')
  }

  getPluginDir(): string {
    return this.getConfigPath()
  }

  private getLogsPath(): string {
    return path.join(this.getDataPath(), 'logs')
  }

  private getVerifyPath(): string {
    return path.join(this.getDataPath(), 'verify')
  }

  private getTempPath(): string {
    return path.join(this.getDataPath(), 'temp')
  }

  private ensureDataDirectories(): void {
    const directories = [
      this.getDataPath(),
      this.getConfigPath(),
      this.getLogsPath(),
      this.getVerifyPath(),
      this.getTempPath(),
    ]

    directories.forEach((dir) => {
      fse.ensureDirSync(dir)
    })
  }

  async enable(): Promise<boolean> {
    if (this.status === PluginStatus.LOAD_FAILED) {
      this.logger.warn('Attempted to enable a plugin that failed to load.')
      return false
    }
    if (
      this.status !== PluginStatus.DISABLED
      && this.status !== PluginStatus.LOADED
      && this.status !== PluginStatus.CRASHED
    ) {
      this.logger.warn(`Attempted to enable plugin with invalid status: ${this.status}`)
      return false
    }

    this.status = PluginStatus.LOADING

    this.issues.length = 0

    try {
      if (this.dev.enable && this.dev.source && this.dev.address) {
        // Dev mode: load from remote
        const remoteIndexUrl = new URL('index.js', this.dev.address).toString()
        this.logger.info(`[Dev] Fetching remote script from ${remoteIndexUrl}`)
        const response = await axios.get(remoteIndexUrl, { timeout: 5000, proxy: false })
        const scriptContent = response.data
        this.pluginLifecycle = loadPluginFeatureContextFromContent(
          this,
          scriptContent,
          this.getFeatureUtil(),
        ) as IFeatureLifeCycle
        this.logger.info(`[Dev] Remote script executed successfully.`)
      }
      else {
        // Prod mode: load from local file
        const featureIndex = path.resolve(this.pluginPath, 'index.js')
        if (fse.existsSync(featureIndex)) {
          this.pluginLifecycle = loadPluginFeatureContext(
            this,
            featureIndex,
            this.getFeatureUtil(),
          ) as IFeatureLifeCycle
        }
        else {
          this.logger.info(
            `No index.js found for plugin '${this.name}', running without lifecycle.`,
          )
        }
      }
    }
    catch (e: any) {
      this.issues.push({
        type: 'error',
        message: `Failed to execute index.js: ${e.message}`,
        source: 'index.js',
        code: 'LIFECYCLE_SCRIPT_FAILED',
        meta: { error: e.stack },
        timestamp: Date.now(),
      })
      this.status = PluginStatus.CRASHED
      return false
    }

    this.status = PluginStatus.ENABLED
    this._uniqueChannelKey = genTouchChannel().requestKey(this.name)

    this.pluginLifecycle?.onInit?.()
    genTouchChannel().send(ChannelType.PLUGIN, 'plugin:lifecycle:enabled', {
      ...this.toJSONObject(),
      plugin: this.name,
    })

    console.log(
      `[Plugin] Plugin ${this.name} with ${this.features.length} features is enabled.`,
    )
    console.log(`[Plugin] Plugin ${this.name} is enabled.`)

    return true
  }

  async disable(): Promise<boolean> {
    this.pluginLifecycle = null

    await widgetManager.releasePlugin(this.name)

    const stoppableStates = [
      PluginStatus.ENABLED,
      PluginStatus.ACTIVE,
      PluginStatus.CRASHED,
      PluginStatus.LOAD_FAILED,
    ]
    if (!stoppableStates.includes(this.status)) {
      return Promise.resolve(false)
    }

    this.status = PluginStatus.DISABLING
    this.logger.debug('Disabling plugin')

    genTouchChannel().send(ChannelType.PLUGIN, 'plugin:lifecycle:disabled', {
      ...this.toJSONObject(),
      plugin: this.name,
    })

    this._windows.forEach((win, id) => {
      try {
        if (!win.window.isDestroyed()) {
          if (!app.isPackaged) {
            console.log(`[Plugin] Gracefully closing window ${id} for plugin ${this.name}`)
            win.window.hide()
            setTimeout(() => {
              if (!win.window.isDestroyed()) {
                win.close()
              }
            }, 50)
          }
          else {
            win.close()
          }
        }
        this._windows.delete(id)
      }
      catch (error: any) {
        console.warn(`[Plugin] Error closing window ${id} for plugin ${this.name}:`, error)
        this._windows.delete(id)
      }
    })

    // Ensure that if this plugin had an active UI view, it is unattached.
    this.logger.debug('disable() called. Checking if UI mode needs to be exited.')
    CoreBoxManager.getInstance().exitUIMode()
    this.logger.debug('exitUIMode() called during disable().')

    genTouchChannel().revokeKey(this._uniqueChannelKey)

    this.status = PluginStatus.DISABLED
    this.logger.debug('Plugin disable lifecycle completed.')

    return Promise.resolve(true)
  }

  getFeatureEventUtil(): any {
    return {
      onFeatureLifeCycle: (id: string, callback: ITargetFeatureLifeCycle) => {
        const listeners = this._featureEvent.get(id) || []
        listeners.push(callback)
        this._featureEvent.set(id, listeners)
      },
      offFeatureLifeCycle: (id: string, callback: ITargetFeatureLifeCycle) => {
        const listeners = this._featureEvent.get(id) || []
        listeners.splice(listeners.indexOf(callback), 1)
        this._featureEvent.set(id, listeners)
      },
    }
  }

  getFeatureUtil(): any {
    const pluginName = this.name
    const appChannel = genTouchChannel()

    const http = axios
    const storage = {
      getFile: (fileName: string) => {
        return this.getPluginFile(fileName)
      },
      setFile: (fileName: string, content: object) => {
        return this.savePluginFile(fileName, content)
      },
      deleteFile: (fileName: string) => {
        return this.deletePluginFile(fileName)
      },
      listFiles: () => {
        return this.listPluginFiles()
      },
      onDidChange: (fileName: string, callback: (newConfig: any) => void) => {
        const handler = (event: ITouchEvent<TalexEvents>) => {
          const storageEvent = event as PluginStorageUpdatedEvent
          if (
            storageEvent.pluginName === pluginName
            && (storageEvent.fileName === fileName || storageEvent.fileName === undefined)
          ) {
            const config = this.getPluginFile(fileName)
            callback(config)
          }
        }

        touchEventBus.on(TalexEvents.PLUGIN_STORAGE_UPDATED, handler)

        return () => {
          touchEventBus.off(TalexEvents.PLUGIN_STORAGE_UPDATED, handler)
        }
      },
    }
    const clipboardUtil = createClipboardManager(clipboard)

    const channelBridge: IPluginChannelBridge = {
      sendToMain: (eventName, payload) => appChannel.sendMain(eventName, payload),
      sendToRenderer: (eventName, payload) => appChannel.sendPlugin(pluginName, eventName, payload),
      onMain: (eventName, handler) => appChannel.regChannel(ChannelType.MAIN, eventName, handler),
      onRenderer: (eventName, handler) =>
        appChannel.regChannel(ChannelType.PLUGIN, eventName, (event) => {
          if (event.plugin && event.plugin !== pluginName) {
            return
          }

          handler(event)
        }),
      raw: appChannel,
    }

    const boxItemManager = getBoxItemManager({ enableLogging: !app.isPackaged })

    // BoxItem SDK 工具对象
    const boxItems = {
      /**
       * 推送单个 item（创建或更新）
       * @param item - 要推送的 item
       */
      push: (item: TuffItem) => {
        const enriched = this.enrichItemWithSource(item)
        boxItemManager.upsert(enriched)
      },

      /**
       * 批量推送 items
       * @param items - 要推送的 items 数组
       */
      pushItems: (items: TuffItem[]) => {
        const enriched = items.map(item => this.enrichItemWithSource(item))
        boxItemManager.batchUpsert(enriched)
      },

      /**
       * 更新指定 item 的部分字段
       * @param id - item id
       * @param updates - 要更新的字段
       */
      update: (id: string, updates: Partial<TuffItem>) => {
        boxItemManager.update(id, updates)
      },

      /**
       * 删除指定 item
       * @param id - item id
       */
      remove: (id: string) => {
        boxItemManager.delete(id)
      },

      /**
       * 清空该插件的所有 items
       */
      clear: () => {
        boxItemManager.clear(this.name)
      },

      /**
       * 获取该插件的所有 items
       * @returns items 数组
       */
      getItems: (): TuffItem[] => {
        return boxItemManager.getBySource(this.name)
      },
    }

    // 向后兼容：保留旧的 searchManager
    const searchManager = {
      /**
       * @deprecated 使用 boxItems.pushItems() 替代
       * Pushes search items directly to the CoreBox window
       * @param items - Array of search items to display
       */
      pushItems: async (items: TuffItem[]) => {
        console.debug(`[Plugin ${this.name}] pushItems() called with ${items.length} items`)
        console.debug(
          `[Plugin ${this.name}] Items to push:`,
          items.map(item => item.id),
        )

        // 使用 TuffIconImpl 解析 items 中的 icon 相对路径为绝对路径
        const processedItems = await Promise.all(
          items.map(async (item) => {
            const processedItem = { ...item }

            // 处理 item.icon
            if (processedItem.icon && processedItem.icon.type === 'file') {
              const icon = new TuffIconImpl(
                this.pluginPath,
                processedItem.icon.type,
                processedItem.icon.value,
              )
              await icon.init()
              processedItem.icon = {
                type: icon.type,
                value: icon.value,
                status: icon.status,
              }
            }

            // 处理 render.basic.icon
            if (
              processedItem.render?.basic?.icon
              && typeof processedItem.render.basic.icon === 'object'
              && processedItem.render.basic.icon.type === 'file'
            ) {
              const basicIcon = processedItem.render.basic.icon
              const icon = new TuffIconImpl(
                this.pluginPath,
                basicIcon.type,
                basicIcon.value,
              )
              await icon.init()
              processedItem.render.basic.icon = {
                type: icon.type,
                value: icon.value,
                status: icon.status,
              }
            }

            return processedItem
          }),
        )

        this._searchItems = [...processedItems]
        this._searchTimestamp = Date.now()

        const coreBoxWindow = getCoreBoxWindow()
        console.debug(`[Plugin ${this.name}] CoreBox window available:`, !!coreBoxWindow)

        if (coreBoxWindow && !coreBoxWindow.window.isDestroyed()) {
          const channel = appChannel

          const payload = {
            pluginName: this.name,
            items: this._searchItems,
            timestamp: this._searchTimestamp,
            query: this._lastSearchQuery,
            total: processedItems.length,
          }

          console.debug(`[Plugin ${this.name}] Sending core-box:push-items with payload:`, payload)

          channel
            .sendTo(coreBoxWindow.window, ChannelType.MAIN, 'core-box:push-items', payload)
            .catch((error) => {
              console.error(
                `[Plugin ${this.name}] Failed to push search results to CoreBox:`,
                error,
              )
            })

          console.debug(
            `[Plugin ${this.name}] Successfully sent ${processedItems.length} search results to CoreBox`,
          )
        }
        else {
          console.warn(
            `[Plugin ${this.name}] CoreBox window not available for pushing search results - window exists: ${!!coreBoxWindow}, destroyed: ${coreBoxWindow?.window.isDestroyed()}`,
          )
        }
      },

      /**
       * @deprecated 使用 boxItems.clear() 替代
       * Clears search items from the CoreBox window
       */
      clearItems: () => {
        boxItems.clear()
      },

      /**
       * @deprecated 使用 boxItems.getItems() 替代
       */
      getItems: (): TuffItem[] => {
        return boxItems.getItems()
      },

      updateQuery: (query: string) => {
        this._lastSearchQuery = query
      },

      getQuery: (): string => {
        return this._lastSearchQuery
      },

      getTimestamp: (): number => {
        return this._searchTimestamp
      },
    }

    const featuresManager = {
      /**
       * Dynamically adds a feature to the plugin
       * @param feature - The feature definition to add
       * @returns True if the feature was successfully added, false otherwise
       */
      addFeature: (feature: IPluginFeature): boolean => {
        return this.addFeature(feature)
      },

      /**
       * Removes a feature from the plugin
       * @param featureId - The ID of the feature to remove
       * @returns True if the feature was successfully removed, false otherwise
       */
      removeFeature: (featureId: string): boolean => {
        return this.delFeature(featureId)
      },

      /**
       * Gets all features of the plugin
       * @returns Array of all plugin features
       */
      getFeatures: (): IPluginFeature[] => {
        return this.getFeatures()
      },

      /**
       * Gets a specific feature by its ID
       * @param featureId - The ID of the feature to retrieve
       * @returns The feature if found, null otherwise
       */
      getFeature: (featureId: string): IPluginFeature | null => {
        return this.getFeature(featureId)
      },

      /**
       * Sets the priority of a feature
       * @param featureId - The ID of the feature to update
       * @param priority - The new priority value (higher numbers = higher priority)
       * @returns True if the feature was found and updated, false otherwise
       */
      setPriority: (featureId: string, priority: number): boolean => {
        const feature = this.features.find(f => f.id === featureId)
        if (feature) {
          feature.priority = priority
          return true
        }
        return false
      },

      /**
       * Gets the priority of a feature
       * @param featureId - The ID of the feature to query
       * @returns The priority value if found, null otherwise
       */
      getPriority: (featureId: string): number | null => {
        const feature = this.features.find(f => f.id === featureId)
        return feature ? feature.priority : null
      },

      /**
       * Sorts features by priority (highest first)
       * @returns Array of features sorted by priority
       */
      getFeaturesByPriority: (): IPluginFeature[] => {
        return [...this.features].sort((a, b) => b.priority - a.priority)
      },
    }

    const pluginInfo = {
      /**
       * Gets comprehensive information about the current plugin
       * @returns Object containing all plugin information including name, version, description, status, features, and issues
       */
      getInfo: () => {
        return {
          name: this.name,
          version: this.version,
          desc: this.desc,
          readme: this.readme,
          dev: this.dev,
          status: this.status,
          platforms: this.platforms,
          pluginPath: this.pluginPath,
          features: this.features.map(f => f.toJSONObject()),
          issues: this.issues,
        }
      },

      /**
       * Gets the file system path of the plugin
       * @returns The absolute path to the plugin directory
       */
      getPath: () => {
        return this.pluginPath
      },

      /**
       * Gets the data directory path for the plugin
       * @returns The absolute path to the plugin's data directory
       */
      getDataPath: () => {
        return this.getDataPath()
      },

      /**
       * Gets the config directory path for the plugin
       * @returns The absolute path to the plugin's config directory
       */
      getConfigPath: () => {
        return this.getConfigPath()
      },

      /**
       * Gets the logs directory path for the plugin
       * @returns The absolute path to the plugin's logs directory
       */
      getLogsPath: () => {
        return this.getLogsPath()
      },

      /**
       * Gets the verify directory path for the plugin
       * @returns The absolute path to the plugin's verify directory
       */
      getVerifyPath: () => {
        return this.getVerifyPath()
      },

      /**
       * Gets the temp directory path for the plugin
       * @returns The absolute path to the plugin's temp directory
       */
      getTempPath: () => {
        return this.getTempPath()
      },

      /**
       * Gets the current status of the plugin
       * @returns The current plugin status (enabled, disabled, loading, etc.)
       */
      getStatus: () => {
        return this.status
      },

      /**
       * Gets the development configuration information
       * @returns Development settings including dev mode status and source address
       */
      getDevInfo: () => {
        return this.dev
      },

      /**
       * Gets the platform support information for the plugin
       * @returns Object containing platform compatibility information
       */
      getPlatforms: () => {
        return this.platforms
      },
    }

    const pluginsAPI = {
      /**
       * Get list of all plugins (read-only access)
       * @param filters Optional filters for plugin list
       * @returns Promise resolving to array of plugin objects
       */
      list: async (filters?: any) => {
        try {
          const response = await appChannel.send(ChannelType.MAIN, 'plugin:api:list', { filters })
          return response || []
        }
        catch (error) {
          console.error(`[Plugin ${pluginName}] Failed to list plugins:`, error)
          return []
        }
      },

      /**
       * Get specific plugin information (read-only access)
       * @param name Plugin name
       * @returns Promise resolving to plugin object or null
       */
      get: async (name: string) => {
        try {
          const response = await appChannel.send(ChannelType.MAIN, 'plugin:api:get', { name })
          return response
        }
        catch (error) {
          console.error(`[Plugin ${pluginName}] Failed to get plugin ${name}:`, error)
          return null
        }
      },

      /**
       * Get plugin status (read-only access)
       * @param name Plugin name
       * @returns Promise resolving to plugin status number
       */
      getStatus: async (name: string) => {
        try {
          const response = await appChannel.send(ChannelType.MAIN, 'plugin:api:get-status', {
            name,
          })
          return response
        }
        catch (error) {
          console.error(`[Plugin ${pluginName}] Failed to get plugin status for ${name}:`, error)
          throw error
        }
      },
    }

    return {
      dialog,
      logger: this.logger,
      $event: this.getFeatureEventUtil(),
      openUrl: (url: string) => shell.openExternal(url),
      http,
      storage,
      clipboard: clipboardUtil,
      channel: channelBridge,
      divisionBox: createDivisionBoxSDK(channelBridge),
      box: createBoxSDK(channelBridge),
      feature: createFeatureSDK(boxItems, channelBridge),
      // 新的 BoxItemSDK API
      boxItems,
      // 废弃的 API - 直接抛出错误
      clearItems: () => {
        throw new Error('[Plugin API] clearItems() is deprecated. Use plugin.feature.clearItems() instead.')
      },
      pushItems: () => {
        throw new Error('[Plugin API] pushItems() is deprecated. Use plugin.feature.pushItems() instead.')
      },
      getItems: () => {
        throw new Error('[Plugin API] getItems() is deprecated. Use plugin.feature.getItems() instead.')
      },
      search: searchManager,
      features: featuresManager,
      plugin: pluginInfo,
      plugins: pluginsAPI,
      $box: {
        hide() {
          throw new Error('[Plugin API] $box.hide() is deprecated. Use plugin.box.hide() instead.')
        },
        show() {
          throw new Error('[Plugin API] $box.show() is deprecated. Use plugin.box.show() instead.')
        },
      },
      TuffItemBuilder,
      URLSearchParams,
    }
  }

  __preload__(): string | undefined {
    const preload = path.join(this.pluginPath, 'preload.js')

    return fse.existsSync(preload) ? preload : undefined
  }

  __index__(): string | undefined {
    const dev = this.dev && this.dev.enable

    if (dev)
      console.log(`[Plugin] Plugin is now dev-mode: ${this.name}`)

    return dev ? this.dev && this.dev.address : path.resolve(this.pluginPath, 'index.html')
  }

  __getInjections__(): any {
    const indexPath = this.__index__()
    const preload = this.__preload__()

    const app = $app

    const _path = {
      relative: path.relative(app.rootPath, this.pluginPath),
      root: app.rootPath,
      plugin: this.pluginPath,
    }

    const mainWin = app.window.window

    return {
      _: {
        indexPath,
        preload,
        isWebviewInit: this.webViewInit,
      },
      attrs: {
        enableRemoteModule: 'false',
        nodeintegration: 'true',
        webpreferences: 'contextIsolation=false',
        // httpreferrer: `https://plugin.touch.talex.com/${this.name}`,
        websecurity: 'false',
        useragent: `${mainWin.webContents.userAgent} TalexTouch/${$pkg.version} (Plugins,like ${this.name})`,
        // partition: `persist:touch/${this.name}`,
      },
      styles: `${getStyles()}`,
      js: `${getJs([this.name, JSON.stringify(_path)])}`,
    }
  }

  /**
   * Get the feature life cycle object for the plugin
   * @returns The feature life cycle object for the plugin
   */
  getFeatureLifeCycle(): IFeatureLifeCycle | null {
    return this.pluginLifecycle
  }

  // ==================== 存储相关方法 ====================

  /**
   * 获取插件文件
   * @param fileName 文件名
   * @returns 文件内容
   */
  getPluginFile(fileName: string): object {
    const configPath = this.getConfigPath()
    const p = path.resolve(configPath, fileName)

    // 确保目录存在
    fse.ensureDirSync(configPath)

    const file = fse.existsSync(p) ? JSON.parse(fse.readFileSync(p, 'utf-8')) : {}
    return file
  }

  /**
   * 保存插件文件
   * @param fileName 文件名
   * @param content 文件内容
   * @returns 保存结果
   */
  savePluginFile(fileName: string, content: object): { success: boolean, error?: string } {
    const configPath = this.getConfigPath()
    const configData = JSON.stringify(content)

    const PLUGIN_CONFIG_MAX_SIZE = 10 * 1024 * 1024 // 10MB
    if (Buffer.byteLength(configData, 'utf-8') > PLUGIN_CONFIG_MAX_SIZE) {
      return {
        success: false,
        error: `File size exceeds the ${PLUGIN_CONFIG_MAX_SIZE} limit for plugin ${this.name}`,
      }
    }

    const p = path.join(configPath, fileName)
    fse.ensureDirSync(configPath)
    fse.writeFileSync(p, configData)

    // 发送存储更新事件
    this.broadcastStorageUpdate(fileName)

    return { success: true }
  }

  /**
   * 删除插件文件
   * @param fileName 文件名
   * @returns 删除结果
   */
  deletePluginFile(fileName: string): { success: boolean, error?: string } {
    const configPath = this.getConfigPath()
    const p = path.join(configPath, fileName)

    if (fse.existsSync(p)) {
      fse.removeSync(p)
      // 发送存储更新事件
      this.broadcastStorageUpdate(fileName)
      return { success: true }
    }

    return { success: false, error: 'File not found' }
  }

  /**
   * 列出插件所有文件
   * @returns 文件列表
   */
  listPluginFiles(): string[] {
    const configPath = this.getConfigPath()
    if (!fse.existsSync(configPath))
      return []

    return fse.readdirSync(configPath).filter(file => file.endsWith('.json'))
  }

  /**
   * 获取存储统计信息
   * @returns 存储统计数据
   */
  getStorageStats(): {
    totalSize: number
    fileCount: number
    dirCount: number
    maxSize: number
    usagePercent: number
  } {
    const configPath = this.getConfigPath()
    const maxSize = 10 * 1024 * 1024 // 10MB

    if (!fse.existsSync(configPath)) {
      return {
        totalSize: 0,
        fileCount: 0,
        dirCount: 0,
        maxSize,
        usagePercent: 0,
      }
    }

    let totalSize = 0
    let fileCount = 0
    let dirCount = 0

    const calculateSize = (dirPath: string): void => {
      const items = fse.readdirSync(dirPath)
      for (const item of items) {
        const itemPath = path.join(dirPath, item)
        const stats = fse.statSync(itemPath)

        if (stats.isDirectory()) {
          dirCount++
          calculateSize(itemPath)
        }
        else {
          fileCount++
          totalSize += stats.size
        }
      }
    }

    calculateSize(configPath)

    return {
      totalSize,
      fileCount,
      dirCount,
      maxSize,
      usagePercent: Math.min(100, (totalSize / maxSize) * 100),
    }
  }

  /**
   * 获取存储目录树结构
   * @returns 树形结构数组
   */
  getStorageTree(): Array<{
    name: string
    path: string
    type: 'file' | 'directory'
    size: number
    modified: number
    children?: any[]
  }> {
    const configPath = this.getConfigPath()

    if (!fse.existsSync(configPath)) {
      return []
    }

    const buildTree = (
      dirPath: string,
      relativePath: string = '',
    ): Array<{
      name: string
      path: string
      type: 'file' | 'directory'
      size: number
      modified: number
      children?: any[]
    }> => {
      const items = fse.readdirSync(dirPath)
      const result: any[] = []

      for (const item of items) {
        const itemPath = path.join(dirPath, item)
        const itemRelativePath = relativePath ? path.join(relativePath, item) : item
        const stats = fse.statSync(itemPath)

        if (stats.isDirectory()) {
          const children = buildTree(itemPath, itemRelativePath)
          const dirSize = children.reduce((sum, child) => sum + child.size, 0)

          result.push({
            name: item,
            path: itemRelativePath,
            type: 'directory' as const,
            size: dirSize,
            modified: stats.mtimeMs,
            children,
          })
        }
        else {
          result.push({
            name: item,
            path: itemRelativePath,
            type: 'file' as const,
            size: stats.size,
            modified: stats.mtimeMs,
          })
        }
      }

      return result
    }

    return buildTree(configPath)
  }

  /**
   * 获取文件详细信息
   * @param fileName 文件名或相对路径
   * @returns 文件详情
   */
  getFileDetails(fileName: string): {
    name: string
    path: string
    size: number
    created: number
    modified: number
    type: string
    content?: any
    truncated?: boolean
  } | null {
    const configPath = this.getConfigPath()
    const filePath = path.join(configPath, fileName)

    if (!fse.existsSync(filePath)) {
      return null
    }

    const stats = fse.statSync(filePath)

    if (stats.isDirectory()) {
      return null
    }

    const ext = path.extname(fileName).toLowerCase()
    const fileType = this.getFileType(ext)

    const result: {
      name: string
      path: string
      size: number
      created: number
      modified: number
      type: string
      content?: any
      truncated?: boolean
    } = {
      name: path.basename(fileName),
      path: fileName,
      size: stats.size,
      created: stats.birthtimeMs,
      modified: stats.mtimeMs,
      type: fileType,
    }

    // 读取文件内容（根据类型和大小限制）
    const maxPreviewSize = this.getMaxPreviewSize(fileType)
    if (stats.size <= maxPreviewSize) {
      try {
        if (fileType === 'json' || fileType === 'text') {
          result.content = fse.readFileSync(filePath, 'utf-8')
          if (fileType === 'json') {
            try {
              result.content = JSON.parse(result.content)
            }
            catch {
              // 如果解析失败，保持文本格式
            }
          }
        }
        else if (fileType === 'image') {
          // 对于图片，返回 base64
          const buffer = fse.readFileSync(filePath)
          result.content = `data:image/${ext.slice(1)};base64,${buffer.toString('base64')}`
        }
      }
      catch (error) {
        console.error(`Failed to read file content: ${fileName}`, error)
      }
    }
    else {
      result.truncated = true
    }

    return result
  }

  /**
   * 清空存储
   * @returns 操作结果
   */
  clearStorage(): { success: boolean, error?: string } {
    const configPath = this.getConfigPath()

    if (!fse.existsSync(configPath)) {
      return { success: true }
    }

    try {
      fse.emptyDirSync(configPath)
      this.broadcastStorageUpdate()
      return { success: true }
    }
    catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * 获取文件类型
   */
  private getFileType(ext: string): string {
    const typeMap: Record<string, string> = {
      '.json': 'json',
      '.log': 'log',
      '.txt': 'text',
      '.md': 'text',
      '.png': 'image',
      '.jpg': 'image',
      '.jpeg': 'image',
      '.gif': 'image',
      '.webp': 'image',
      '.svg': 'image',
    }

    return typeMap[ext] || 'other'
  }

  /**
   * 获取不同文件类型的预览大小限制
   */
  private getMaxPreviewSize(fileType: string): number {
    const sizeMap: Record<string, number> = {
      json: 100 * 1024, // 100KB
      text: 50 * 1024, // 50KB
      log: 50 * 1024, // 50KB
      image: 5 * 1024 * 1024, // 5MB
      other: 0, // 不预览
    }

    return sizeMap[fileType] || 0
  }

  /**
   * 获取插件配置（向后兼容）
   * @returns 配置内容
   */
  getPluginConfig(): object {
    return this.getPluginFile('config.json')
  }

  /**
   * 保存插件配置（向后兼容）
   * @param content 配置内容
   * @returns 保存结果
   */
  savePluginConfig(content: object): { success: boolean, error?: string } {
    return this.savePluginFile('config.json', content)
  }

  /**
   * 广播存储更新事件
   */
  private broadcastStorageUpdate(fileName?: string): void {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      $app.channel?.sendTo(win, ChannelType.MAIN, 'plugin:storage:update', {
        name: this.name,
        fileName,
      })
    }

    touchEventBus.emit(
      TalexEvents.PLUGIN_STORAGE_UPDATED,
      new PluginStorageUpdatedEvent(this.name, fileName),
    )
  }
}
