import {
  IFeatureLifeCycle,
  IPluginChannelBridge,
  IPlatform,
  IPluginDev,
  IPluginIcon,
  ITargetFeatureLifeCycle,
  ITouchPlugin,
  PluginIssue,
  PluginStatus,
  IPluginFeature
} from '@talex-touch/utils/plugin'
import { TuffItem, TuffItemBuilder } from '@talex-touch/utils/core-box'
import { PluginLogger, PluginLoggerManager } from '@talex-touch/utils/plugin/node'
import { ChannelType } from '@talex-touch/utils/channel'
import path from 'path'
import { createClipboardManager } from '@talex-touch/utils/plugin'
import { app, clipboard, dialog, shell, BrowserWindow } from 'electron'
import axios from 'axios'
import fse from 'fs-extra'
import { PluginFeature } from './plugin-feature'
import { PluginIcon } from './plugin-icon'
import { PluginViewLoader } from './view/plugin-view-loader'
import { loadPluginFeatureContext, loadPluginFeatureContextFromContent } from './plugin-feature'
import { TouchWindow } from '../../core/touch-window'
import { genTouchChannel } from '../../core/channel-core'
import {
  PluginLogAppendEvent,
  PluginStorageUpdatedEvent,
  TalexEvents,
  touchEventBus
} from '../../core/eventbus/touch-event'
import { CoreBoxManager } from '../box-tool/core-box/manager'
import { getCoreBoxWindow } from '../box-tool/core-box'
import { getJs, getStyles } from '../../utils/plugin-injection'

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
  '排名系统'
]

export class TouchPlugin implements ITouchPlugin {
  dev: IPluginDev
  name: string
  readme: string
  version: string
  desc: string
  icon: IPluginIcon
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

  // Search Result
  _searchItems: TuffItem[] = []
  _lastSearchQuery: string = ''
  _searchTimestamp: number = 0

  toJSONObject(): object {
    return {
      name: this.name,
      readme: this.readme,
      version: this.version,
      desc: this.desc,
      icon: this.icon,
      dev: this.dev,
      status: this.status,
      platforms: this.platforms,
      features: this.features.map((feature) => feature.toJSONObject()),
      issues: this.issues
    }
  }

  get status(): PluginStatus {
    return this._status
  }

  set status(v: PluginStatus) {
    this._status = v

    const channel = genTouchChannel()!
    channel &&
      channel.send(ChannelType.MAIN, 'plugin-status-updated', {
        plugin: this.name,
        status: this._status
      })
  }

  addFeature(feature: IPluginFeature): boolean {
    if (this.features.find((f) => f.name === feature.name)) return false

    const { id, name, desc, commands } = feature

    const regex = /^[a-zA-Z0-9_-]+$/
    if (!regex.test(id)) {
      console.error(`[Plugin] Feature add error, id ${id} not valid.`)
      return false
    }

    if (
      disallowedArrays.filter(
        (item: string) => name.indexOf(item) !== -1 || desc.indexOf(item) !== -1
      ).length
    ) {
      console.error(`[Plugin] Feature add error, name or desc contains disallowed words.`)
      return false
    }

    if (commands.length < 1) return false

    return this.features.push(new PluginFeature(this.pluginPath, feature, this.dev)) >= 0
  }

  delFeature(featureId: string): boolean {
    if (!this.features.find((f) => f.name === featureId)) return false

    return (
      this.features.splice(
        this.features.findIndex((f) => f.name === featureId),
        1
      ) !== undefined
    )
  }

  getFeature(featureId: string): IPluginFeature | null {
    return this.features.find((f) => f.id === featureId) || null
  }

  getFeatures(): IPluginFeature[] {
    return this.features
  }

  async triggerFeature(feature: IPluginFeature, query: any): Promise<void> {
    // Mark as async
    if (this.featureControllers.has(feature.id)) {
      this.featureControllers.get(feature.id)?.abort()
    }

    const controller = new AbortController()
    this.featureControllers.set(feature.id, controller)

    if (feature.interaction?.type === 'webcontent') {
      const interactionPath = feature.interaction.path
      if (!interactionPath) {
        this.logger.error(
          `Security Alert: Aborted loading view with invalid path: ${interactionPath}`
        )
        return
      }

      this.logger.info(`Trigger feature with WebContent interaction: ${feature.id}`)

      // Delegate view loading to the unified PluginViewLoader
      if (!this.pluginLifecycle) {
        this.logger.warn(
          `Plugin lifecycle not initialized before triggering feature. This may indicate an issue.`
        )
      }
      await PluginViewLoader.loadPluginView(this, feature)
      return
    }

    if (feature.interaction?.type === 'widget') {
      // TODO: Implement widget logic
      this.logger.warn(`Widget interaction type is not implemented yet for feature: ${feature.id}`)
      return
    }

    this.pluginLifecycle?.onFeatureTriggered(feature.id, query, feature, controller.signal)

    this._featureEvent.get(feature.id)?.forEach((fn) => fn.onLaunch?.(feature))
  }

  triggerInputChanged(feature: IPluginFeature, query: any): void {
    this.pluginLifecycle?.onFeatureTriggered(feature.id, query, feature)

    this._featureEvent.get(feature.id)?.forEach((fn) => fn.onInputChanged?.(query))
  }

  public clearCoreBoxItems(): void {
    console.debug(
      `[Plugin ${this.name}] clearItems() called - clearing ${this._searchItems.length} items`
    )

    this._searchItems = []
    this._searchTimestamp = Date.now()

    const coreBoxWindow = getCoreBoxWindow()
    console.debug(`[Plugin ${this.name}] CoreBox window available for clearing:`, !!coreBoxWindow)

    if (coreBoxWindow && !coreBoxWindow.window.isDestroyed()) {
      const channel = genTouchChannel()

      const payload = {
        pluginName: this.name,
        timestamp: this._searchTimestamp
      }

      console.debug(`[Plugin ${this.name}] Sending core-box:clear-items with payload:`, payload)

      channel
        .sendTo(coreBoxWindow.window, ChannelType.MAIN, 'core-box:clear-items', payload)
        .catch((error) => {
          console.error(`[Plugin ${this.name}] Failed to clear search results from CoreBox:`, error)
        })

      console.debug(`[Plugin ${this.name}] Successfully sent clear command to CoreBox`)
    } else {
      console.warn(
        `[Plugin ${this.name}] CoreBox window not available for clearing search results - window exists: ${!!coreBoxWindow}, destroyed: ${coreBoxWindow?.window.isDestroyed()}`
      )
    }
  }

  constructor(
    name: string,
    icon: PluginIcon,
    version: string,
    desc: string,
    readme: string,
    dev: IPluginDev,
    pluginPath: string,
    platforms: IPlatform = {}
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
      })
    )

    this.ensureDataDirectories()
  }

  private getDataPath(): string {
    const userDataPath = $app.rootPath
    return path.join(userDataPath, 'modules', 'plugins', this.name, 'data')
  }

  private getConfigPath(): string {
    return path.join(this.getDataPath(), 'config')
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
      this.getTempPath()
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
      this.status !== PluginStatus.DISABLED &&
      this.status !== PluginStatus.LOADED &&
      this.status !== PluginStatus.CRASHED
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
          this.getFeatureUtil()
        ) as IFeatureLifeCycle
        this.logger.info(`[Dev] Remote script executed successfully.`)
      } else {
        // Prod mode: load from local file
        const featureIndex = path.resolve(this.pluginPath, 'index.js')
        if (fse.existsSync(featureIndex)) {
          this.pluginLifecycle = loadPluginFeatureContext(
            this,
            featureIndex,
            this.getFeatureUtil()
          ) as IFeatureLifeCycle
        } else {
          this.logger.info(
            `No index.js found for plugin '${this.name}', running without lifecycle.`
          )
        }
      }
    } catch (e: any) {
      this.issues.push({
        type: 'error',
        message: `Failed to execute index.js: ${e.message}`,
        source: 'index.js',
        code: 'LIFECYCLE_SCRIPT_FAILED',
        meta: { error: e.stack },
        timestamp: Date.now()
      })
      this.status = PluginStatus.CRASHED
      return false
    }

    this.status = PluginStatus.ENABLED
    this._uniqueChannelKey = genTouchChannel().requestKey(this.name)

    this.pluginLifecycle?.onInit?.()
    genTouchChannel().send(ChannelType.PLUGIN, '@lifecycle:en', {
      ...this.toJSONObject(),
      plugin: this.name
    })

    console.log(
      '[Plugin] Plugin ' + this.name + ' with ' + this.features.length + ' features is enabled.'
    )
    console.log('[Plugin] Plugin ' + this.name + ' is enabled.')

    return true
  }

  async disable(): Promise<boolean> {
    this.pluginLifecycle = null

    const stoppableStates = [
      PluginStatus.ENABLED,
      PluginStatus.ACTIVE,
      PluginStatus.CRASHED,
      PluginStatus.LOAD_FAILED
    ]
    if (!stoppableStates.includes(this.status)) {
      return Promise.resolve(false)
    }

    this.status = PluginStatus.DISABLING
    this.logger.debug('Disabling plugin')

    genTouchChannel().send(ChannelType.PLUGIN, '@lifecycle:di', {
      ...this.toJSONObject(),
      plugin: this.name
    })

    this._windows.forEach((win, id) => {
      try {
        if (!win.window.isDestroyed()) {
          // In development mode, close the window more gently
          if (!app.isPackaged) {
            console.log(`[Plugin] Gracefully closing window ${id} for plugin ${this.name}`)
            win.window.hide()
            setTimeout(() => {
              if (!win.window.isDestroyed()) {
                win.close()
              }
            }, 50)
          } else {
            win.close()
          }
        }
        this._windows.delete(id)
      } catch (error: any) {
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
      }
    }
  }

  getFeatureUtil(): any {
    const pluginName = this.name
    const appChannel = genTouchChannel()

    const http = axios
    const storage = {
      getItem: (key: string) => {
        const config = this.getPluginConfig()
        return config[key] ?? null
      },
      setItem: (key: string, value: object) => {
        const config = this.getPluginConfig()
        config[key] = value
        return this.savePluginConfig(config)
      },
      removeItem: (key: string) => {
        const config = this.getPluginConfig()
        delete config[key]
        return this.savePluginConfig(config)
      },
      clear: () => {
        return this.savePluginConfig({})
      },
      getAllItems: () => {
        return this.getPluginConfig()
      },
      onDidChange: (fileName: string, callback: (newConfig: any) => void) => {
        const channel = genTouchChannel()

        const unsubscribe = channel.regChannel(
          ChannelType.MAIN,
          'plugin:storage:update',
          ({ data }) => {
            if (data.name === pluginName && data.fileName === fileName) {
              const config = this.getPluginFile(fileName)
              callback(config)
            }
          }
        )

        return unsubscribe
      },

      getFile: (fileName: string) => {
        return this.getPluginFile(fileName)
      },
      saveFile: (fileName: string, content: object) => {
        return this.savePluginFile(fileName, content)
      },
      deleteFile: (fileName: string) => {
        return this.deletePluginFile(fileName)
      },
      listFiles: () => {
        return this.listPluginFiles()
      }
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
      raw: appChannel
    }

    const searchManager = {
      /**
       * Pushes search items directly to the CoreBox window
       * @param items - Array of search items to display
       */
      pushItems: (items: TuffItem[]) => {
        console.debug(`[Plugin ${this.name}] pushItems() called with ${items.length} items`)
        console.debug(
          `[Plugin ${this.name}] Items to push:`,
          items.map((item) => item.id)
        )

        this._searchItems = [...items]
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
            total: items.length
          }

          console.debug(`[Plugin ${this.name}] Sending core-box:push-items with payload:`, payload)

          channel
            .sendTo(coreBoxWindow.window, ChannelType.MAIN, 'core-box:push-items', payload)
            .catch((error) => {
              console.error(
                `[Plugin ${this.name}] Failed to push search results to CoreBox:`,
                error
              )
            })

          console.debug(
            `[Plugin ${this.name}] Successfully sent ${items.length} search results to CoreBox`
          )
        } else {
          console.warn(
            `[Plugin ${this.name}] CoreBox window not available for pushing search results - window exists: ${!!coreBoxWindow}, destroyed: ${coreBoxWindow?.window.isDestroyed()}`
          )
        }
      },

      /**
       * Clears search items from the CoreBox window
       */
      clearItems: () => {
        this.clearCoreBoxItems()
      },

      getItems: (): TuffItem[] => {
        return [...this._searchItems]
      },

      updateQuery: (query: string) => {
        this._lastSearchQuery = query
      },

      getQuery: (): string => {
        return this._lastSearchQuery
      },

      getTimestamp: (): number => {
        return this._searchTimestamp
      }
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
        const feature = this.features.find((f) => f.id === featureId)
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
        const feature = this.features.find((f) => f.id === featureId)
        return feature ? feature.priority : null
      },

      /**
       * Sorts features by priority (highest first)
       * @returns Array of features sorted by priority
       */
      getFeaturesByPriority: (): IPluginFeature[] => {
        return [...this.features].sort((a, b) => b.priority - a.priority)
      }
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
          features: this.features.map((f) => f.toJSONObject()),
          issues: this.issues
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
      }
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
      clearItems: searchManager.clearItems,
      pushItems: searchManager.pushItems,
      getItems: searchManager.getItems,
      search: searchManager,
      features: featuresManager,
      plugin: pluginInfo,
      $box: {
        hide() {
          CoreBoxManager.getInstance().trigger(false)
        },
        show() {
          CoreBoxManager.getInstance().trigger(true)
        }
      },
      TuffItemBuilder,
      URLSearchParams
    }
  }

  __preload__(): string | undefined {
    const preload = path.join(this.pluginPath, 'preload.js')

    return fse.existsSync(preload) ? preload : undefined
  }

  __index__(): string | undefined {
    const dev = this.dev && this.dev.enable

    if (dev) console.log('[Plugin] Plugin is now dev-mode: ' + this.name)

    return dev ? this.dev && this.dev.address : path.resolve(this.pluginPath, 'index.html')
  }

  __getInjections__(): any {
    const indexPath = this.__index__()
    const preload = this.__preload__()

    const app = $app

    const _path = {
      relative: path.relative(app.rootPath, this.pluginPath),
      root: app.rootPath,
      plugin: this.pluginPath
    }

    const mainWin = app.window.window

    return {
      _: {
        indexPath,
        preload,
        isWebviewInit: this.webViewInit
      },
      attrs: {
        enableRemoteModule: 'false',
        nodeintegration: 'true',
        webpreferences: 'contextIsolation=false',
        // httpreferrer: `https://plugin.touch.talex.com/${this.name}`,
        websecurity: 'false',
        useragent: `${mainWin.webContents.userAgent} TalexTouch/${$pkg.version} (Plugins,like ${this.name})`
        // partition: `persist:touch/${this.name}`,
      },
      styles: `${getStyles()}`,
      js: `${getJs([this.name, JSON.stringify(_path)])}`
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
  savePluginFile(fileName: string, content: object): { success: boolean; error?: string } {
    const configPath = this.getConfigPath()
    const configData = JSON.stringify(content)

    const PLUGIN_CONFIG_MAX_SIZE = 10 * 1024 * 1024 // 10MB
    if (Buffer.byteLength(configData, 'utf-8') > PLUGIN_CONFIG_MAX_SIZE) {
      return {
        success: false,
        error: `File size exceeds the ${PLUGIN_CONFIG_MAX_SIZE} limit for plugin ${this.name}`
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
  deletePluginFile(fileName: string): { success: boolean; error?: string } {
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
    if (!fse.existsSync(configPath)) return []

    return fse.readdirSync(configPath).filter((file) => file.endsWith('.json'))
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
  savePluginConfig(content: object): { success: boolean; error?: string } {
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
        fileName: fileName
      })
    }

    touchEventBus.emit(TalexEvents.PLUGIN_STORAGE_UPDATED, new PluginStorageUpdatedEvent(this.name))
  }
}
