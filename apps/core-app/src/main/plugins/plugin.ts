import {
  IFeatureLifeCycle,
  IPlatform,
  IPluginDev,
  IPluginIcon,
  IPluginWebview,
  ITargetFeatureLifeCycle,
  ITouchPlugin,
  PluginIssue,
  PluginLogger,
  PluginStatus,
  IPluginFeature
} from '@talex-touch/utils/plugin'
import { TuffItem } from '@talex-touch/utils/core-box'
import { TouchWindow, genTouchApp } from '../core/touch-core'
import { PluginLoggerManager } from '@talex-touch/utils/plugin/log/logger-manager'
import { PluginLogAppendEvent, TalexEvents, touchEventBus } from '../core/eventbus/touch-event'
import { genTouchChannel } from '../core/channel-core'
import { ChannelType } from '@talex-touch/utils/channel'
import { getJs, getStyles } from '../utils/plugin-injection'
import path from 'path'
import pkg from '../../../package.json'
import { getCoreBoxWindow } from '../modules/box-tool/core-box'
import { createClipboardManager, createStorageManager } from '@talex-touch/utils/plugin'
import { app, clipboard, dialog, shell } from 'electron'
import axios from 'axios'
import { CoreBoxManager } from '../modules/box-tool/core-box/manager'
import fse from 'fs-extra'
import { PluginFeature } from './plugin-feature'
import { PluginIcon } from './plugin-icon'

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
  webViewInit: boolean = false
  webview: IPluginWebview = {}
  platforms: IPlatform
  features: PluginFeature[]
  issues: PluginIssue[]

  pluginPath: string

  public pluginLifecycle: IFeatureLifeCycle | null = null
  _featureEvent: Map<string, ITargetFeatureLifeCycle[]> = new Map<
    string,
    ITargetFeatureLifeCycle[]
  >()
  private featureControllers: Map<string, AbortController> = new Map()

  _status: PluginStatus = PluginStatus.DISABLED

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
      webViewInit: this.webViewInit,
      webview: this.webview,
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

  triggerFeature(feature: IPluginFeature, query: any): void {
    if (this.featureControllers.has(feature.id)) {
      this.featureControllers.get(feature.id)?.abort()
    }

    const controller = new AbortController()
    this.featureControllers.set(feature.id, controller)

    if (feature.interaction?.type === 'webcontent') {
      const interactionPath = feature.interaction.path
      if (!interactionPath) {
        this.logger.error(`Security Alert: Aborted loading view with invalid path: ${interactionPath}`)
        return
      }

      let viewUrl: string

      this.logger.info(`Trigger feature with WebContent interaction: ${feature.id}`)

      if (this.dev.enable && this.dev.source) {
        const baseUrl = new URL(this.dev.address)
        baseUrl.hash = interactionPath
        viewUrl = baseUrl.toString()
      } else {
        if (interactionPath.includes('..')) {
          this.logger.error(
            `Security Alert: Aborted loading view with invalid path: ${interactionPath}`
          )
          this.issues.push({
            type: 'error',
            code: 'INVALID_VIEW_PATH',
            message: `Interaction path cannot contain '..'.`,
            source: `feature:${feature.id}`,
            timestamp: Date.now()
          })
          return
        }
        const viewPath = path.join(this.pluginPath, 'index.html')
        viewUrl = 'file://' + viewPath + interactionPath
      }
      CoreBoxManager.getInstance().enterUIMode(viewUrl, this)
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

    this.logger = new PluginLogger(
      name,
      new PluginLoggerManager(this.pluginPath, this, (log) => {
        touchEventBus.emit(TalexEvents.PLUGIN_LOG_APPEND, new PluginLogAppendEvent(log))
      })
    )
  }

  async enable(): Promise<boolean> {
    if (this.status === PluginStatus.LOAD_FAILED) {
      this.logger.warn('Attempted to enable a plugin that failed to load.')
      return Promise.resolve(false)
    }
    if (
      this.status !== PluginStatus.DISABLED &&
      this.status !== PluginStatus.LOADED &&
      this.status !== PluginStatus.CRASHED &&
      this.status !== PluginStatus.LOADING
    )
      return Promise.resolve(false)

    this.status = PluginStatus.LOADING

    this.webview = this.__getInjections__()

    const app = genTouchApp()

    await genTouchChannel(app).send(ChannelType.MAIN, 'plugin-webview', {
      plugin: this.name,
      data: this.webview
    })

    this.status = PluginStatus.ENABLED

    await genTouchChannel().send(ChannelType.PLUGIN, '@lifecycle:en', {
      ...this.toJSONObject(),
      plugin: this.name
    })

    return Promise.resolve(true)
  }

  __getInjections__(): any {
    const indexPath = this.__index__()
    const preload = this.__preload__()

    const app = genTouchApp()

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
        useragent: `${mainWin.webContents.userAgent} TalexTouch/${pkg.version} (Plugins,like ${this.name})`
        // partition: `persist:touch/${this.name}`,
      },
      styles: `${getStyles()}`,
      js: `${getJs([this.name, JSON.stringify(_path)])}`
    }
  }

  async disable(): Promise<boolean> {
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
    console.log('[Plugin] Disabling plugin ' + this.name)

    genTouchChannel().send(ChannelType.PLUGIN, '@lifecycle:di', {
      ...this.toJSONObject(),
      plugin: this.name
    })

    this.webViewInit = false

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
      } catch (error) {
        console.warn(`[Plugin] Error closing window ${id} for plugin ${this.name}:`, error)
        this._windows.delete(id)
      }
    })

    this.status = PluginStatus.DISABLED
    console.log('[Plugin] Plugin ' + this.name + ' is disabled.')

    return Promise.resolve(true)
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
    const pluginPath = this.pluginPath

    const http = axios
    const storage = createStorageManager(pluginPath, fse)
    const clipboardUtil = createClipboardManager(clipboard)

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
          const channel = genTouchChannel()

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
        console.debug(
          `[Plugin ${this.name}] clearItems() called - clearing ${this._searchItems.length} items`
        )

        this._searchItems = []
        this._searchTimestamp = Date.now()

        const coreBoxWindow = getCoreBoxWindow()
        console.debug(
          `[Plugin ${this.name}] CoreBox window available for clearing:`,
          !!coreBoxWindow
        )

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
              console.error(
                `[Plugin ${this.name}] Failed to clear search results from CoreBox:`,
                error
              )
            })

          console.debug(`[Plugin ${this.name}] Successfully sent clear command to CoreBox`)
        } else {
          console.warn(
            `[Plugin ${this.name}] CoreBox window not available for clearing search results - window exists: ${!!coreBoxWindow}, destroyed: ${coreBoxWindow?.window.isDestroyed()}`
          )
        }
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

    return {
      dialog,
      logger: this.logger,
      $event: this.getFeatureEventUtil(),
      openUrl: (url: string) => shell.openExternal(url),
      http,
      storage,
      clipboard: clipboardUtil,
      clearItems: searchManager.clearItems,
      pushItems: searchManager.pushItems,
      getItems: searchManager.getItems,
      search: searchManager,
      $box: {
        hide() {
          CoreBoxManager.getInstance().trigger(false)
        },
        show() {
          CoreBoxManager.getInstance().trigger(true)
        }
      }
    }
  }
}
