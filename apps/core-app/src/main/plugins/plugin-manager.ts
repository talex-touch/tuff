import { IPluginManager, ITouchPlugin, PluginStatus } from '@talex-touch/utils/plugin'
import axios from 'axios'
import fse from 'fs-extra'
import path from 'path'
import chokidar, { FSWatcher } from 'chokidar'
import { TalexEvents, touchEventBus } from '../core/eventbus/touch-event'
import { genTouchChannel } from '../core/channel-core'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { TouchPlugin } from './plugin'
import { PluginIcon } from './plugin-icon'
import { createPluginLoader } from './loaders'
import { TalexTouch } from '../types'
import { TouchWindow } from '../core/touch-core'
import { pollingService } from '@talex-touch/utils/common/utils/polling'
import { shell } from 'electron'
import { databaseManager } from '../modules/database'
import { createDbUtils } from '../db/utils'

class DevPluginWatcher {
  private readonly manager: PluginManager
  private readonly watchedPlugins: Map<string, { address: string }> = new Map()
  private readonly POLLING_INTERVAL_SECONDS = 2
  private readonly POLLING_TASK_ID = 'dev-plugin-watcher'

  constructor(manager: PluginManager) {
    this.manager = manager
  }

  public start(): void {
    if (pollingService.isRegistered(this.POLLING_TASK_ID)) {
      pollingService.unregister(this.POLLING_TASK_ID)
    }
    pollingService.register(this.POLLING_TASK_ID, this.poll.bind(this), {
      interval: this.POLLING_INTERVAL_SECONDS,
      unit: 'seconds',
      runImmediately: true
    })
    pollingService.start()
    console.log('[DevWatcher] Started polling for dev plugin updates.')
  }

  public stop(): void {
    if (pollingService.isRegistered(this.POLLING_TASK_ID)) {
      pollingService.unregister(this.POLLING_TASK_ID)
      console.log('[DevWatcher] Stopped polling for dev plugin updates.')
    }
  }

  public addPlugin(plugin: ITouchPlugin): void {
    if (plugin.dev?.enable && plugin.dev.address) {
      this.watchedPlugins.set(plugin.name, { address: plugin.dev.address })
      console.log(`[DevWatcher] Watching plugin: ${plugin.name} at ${plugin.dev.address}`)
    }
  }

  public removePlugin(pluginName: string): void {
    if (this.watchedPlugins.has(pluginName)) {
      this.watchedPlugins.delete(pluginName)
      console.log(`[DevWatcher] Stopped watching plugin: ${pluginName}`)
    }
  }

  private async poll(): Promise<void> {
    if (this.watchedPlugins.size === 0) {
      return
    }

    const pollPromises = Array.from(this.watchedPlugins.entries()).map(([name, { address }]) =>
      this.checkPluginForUpdates(name, address)
    )

    await Promise.allSettled(pollPromises)
  }

  private async checkPluginForUpdates(name: string, address: string): Promise<void> {
    const url = new URL('/_tuff_devkit/update', address).toString()
    try {
      const response = await axios.get<{ changed: boolean }>(url, {
        timeout: 1500,
        proxy: false
      })

      if (response.data.changed) {
        const plugin = this.manager.plugins.get(name)
        if (!plugin) {
          return
        }

        const isEnabled =
          plugin.status === PluginStatus.ENABLED || plugin.status === PluginStatus.ACTIVE

        if (isEnabled) {
          console.log(`[DevWatcher] Detected change for enabled plugin ${name}. Reloading...`)
          // Do not await, let it run in the background
          this.manager.reloadPlugin(name)
        } else {
          console.log(`[DevWatcher] Detected change for disabled plugin ${name}. Ignoring reload.`)
        }
      }
    } catch (error: any) {
      // Don't log ECONNRESET errors which are common during dev server restarts
      if (error.code !== 'ECONNRESET' && error.code !== 'ECONNABORTED') {
        console.warn(
          `[DevWatcher] Failed to check for updates for plugin ${name} at ${url}: ${error.message}`
        )
      }
    }
  }
}

class PluginManager implements IPluginManager {
  plugins: Map<string, ITouchPlugin> = new Map()
  active: string = ''
  reloadingPlugins: Set<string> = new Set()
  enabledPlugins: Set<string> = new Set()
  dbUtils = createDbUtils(databaseManager.getDb())
  private initialLoadPromises: Promise<boolean>[] = []

  pluginPath: string
  watcher: FSWatcher | null
  devWatcher: DevPluginWatcher

  constructor(pluginPath: string) {
    this.pluginPath = pluginPath
    this.watcher = null
    this.devWatcher = new DevPluginWatcher(this)

    this.__init__()
  }

  getPluginList(): Array<object> {
    console.log('[PluginManager] getPluginList called.')
    const list = new Array<object>()

    for (const plugin of this.plugins.values()) {
      console.log(
        `[PluginManager]   - Processing plugin: ${plugin.name}, status: ${
          PluginStatus[(plugin as TouchPlugin).status]
        }`
      )
      list.push((plugin as TouchPlugin).toJSONObject())
    }

    console.log(`[PluginManager] Returning plugin list with ${list.length} items.`)
    return list
  }

  setActivePlugin(pluginName: string): boolean {
    if (this.active) {
      const plugin = this.plugins.get(this.active)

      genTouchChannel().send(ChannelType.PLUGIN, '@lifecycle:in', {
        plugin: this.active
      })

      if (plugin) plugin.status = PluginStatus.ENABLED
    }

    if (pluginName) {
      const plugin = this.plugins.get(pluginName)
      if (!plugin || plugin.status !== PluginStatus.ENABLED) return false

      plugin.status = PluginStatus.ACTIVE
      this.active = pluginName

      genTouchChannel().send(ChannelType.PLUGIN, '@lifecycle:ac', {
        plugin: pluginName
      })
    }

    return true
  }

  hasPlugin(name: string): boolean {
    return !!this.getPluginByName(name)
  }

  getPluginByName(name: string): ITouchPlugin | undefined {
    for (const plugin of this.plugins.values()) {
      if (plugin.name === name) {
        return plugin
      }
    }
    return undefined
  }

  async reloadPlugin(pluginName: string): Promise<void> {
    if (this.reloadingPlugins.has(pluginName)) {
      console.log(`[PluginManager] Plugin ${pluginName} is already reloading. Skip.`)
      return
    }

    const plugin = this.plugins.get(pluginName)
    if (!plugin) {
      console.error(`[PluginManager] Cannot reload plugin ${pluginName}: not found.`)
      return
    }

    this.reloadingPlugins.add(pluginName)

    try {
      console.log(`[PluginManager] Reloading plugin: ${pluginName}`)

      const _enabled =
        plugin.status === PluginStatus.ENABLED || plugin.status === PluginStatus.ACTIVE

      await plugin.disable()
      await this.unloadPlugin(pluginName)
      await this.loadPlugin(pluginName)

      const newPlugin = this.plugins.get(pluginName) as TouchPlugin
      if (newPlugin) {
        genTouchChannel().send(ChannelType.MAIN, 'plugin:reload', {
          source: 'dev',
          plugin: newPlugin.toJSONObject()
        })
        if (_enabled) {
          await newPlugin.enable()
        }
        console.log(`[PluginManager] Plugin ${pluginName} reloaded successfully.`)
      } else {
        console.error(
          `[PluginManager] Plugin ${pluginName} failed to reload, as it could not be loaded again.`
        )
      }
    } catch (error) {
      console.error(`[PluginManager] Error while reloading plugin ${pluginName}:`, error)
    } finally {
      this.reloadingPlugins.delete(pluginName)
    }
  }

  __initDevWatcher(): void {
    this.devWatcher.start()
  }

  async persistEnabledPlugins(): Promise<void> {
    try {
      await this.dbUtils.setPluginData(
        'internal:plugin-manager',
        'enabled_plugins',
        Array.from(this.enabledPlugins)
      )
      console.log('[PluginManager] Persisted enabled plugins state.')
    } catch (error) {
      console.error('[PluginManager] Failed to persist enabled plugins state:', error)
    }
  }

  private async loadPersistedState(): Promise<void> {
    console.log('[PluginManager] Attempting to load persisted plugin states...')
    try {
      const data = await this.dbUtils.getPluginData('internal:plugin-manager', 'enabled_plugins')
      if (data && data.value) {
        const enabled = JSON.parse(data.value) as string[]
        this.enabledPlugins = new Set(enabled)
        console.log(
          `[PluginManager] Loaded ${
            enabled.length
          } enabled plugins from database: [${enabled.join(', ')}]`
        )

        for (const pluginName of this.enabledPlugins) {
          const plugin = this.plugins.get(pluginName)
          console.log(
            `[PluginManager] Checking auto-enable for '${pluginName}': found=${!!plugin}, status=${
              plugin ? PluginStatus[plugin.status] : 'N/A'
            }`
          )
          if (plugin && plugin.status === PluginStatus.DISABLED) {
            try {
              console.log(`[PluginManager] ==> Auto-enabling plugin: ${pluginName}`)
              await plugin.enable()
              console.log(`[PluginManager] ==> Finished auto-enabling for '${pluginName}'.`)
            } catch (e) {
              console.error(`[PluginManager] Failed to auto-enable plugin ${pluginName}:`, e)
            }
          }
        }
      } else {
        console.log('[PluginManager] No persisted plugin state found in database.')
      }
    } catch (error) {
      console.error('[PluginManager] Failed to load persisted plugin state:', error)
    }
  }

  __init__(): void {
    if (!fse.existsSync(this.pluginPath)) return

    this.__initDevWatcher()

    touchEventBus.on(TalexEvents.BEFORE_APP_QUIT, () => {
      this.watcher?.close()
      this.devWatcher.stop()
      console.log('[PluginManager] Watchers closed.')
    })

    this.watcher = chokidar.watch(this.pluginPath, {
      ignored: /(^|[/\\])\../,
      persistent: true,
      depth: 1,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 500
      }
    })

    this.watcher.on('change', async (_path) => {
      const baseName = path.basename(_path)
      if (baseName.indexOf('.') === 0) return

      const pluginName = path.basename(path.dirname(_path))

      if (!this.hasPlugin(pluginName)) {
        console.warn(
          '[PluginManager] IGNORE | The plugin ' +
            pluginName +
            " isn't loaded despite changes made to its file."
        )

        this.loadPlugin(pluginName)
        return
      }
      let plugin = this.plugins.get(pluginName) as TouchPlugin

      if (plugin.dev.enable && plugin.dev.source) {
        console.log(
          `[PluginManager] IGNORE | Plugin ${pluginName} is in dev source mode, ignoring local file changes.`
        )
        return
      }

      console.log(`[Plugin] ${pluginName}'s ${baseName} has been changed, reload it.`)

      if (
        baseName === 'manifest.json' ||
        baseName === 'preload.js' ||
        baseName === 'index.html' ||
        baseName === 'index.js'
      ) {
        const _enabled =
          plugin.status === PluginStatus.ENABLED || plugin.status === PluginStatus.ACTIVE

        await plugin.disable()
        await this.unloadPlugin(pluginName)

        await this.loadPlugin(pluginName)

        plugin = this.plugins.get(pluginName) as TouchPlugin

        genTouchChannel().send(ChannelType.MAIN, 'plugin:reload', {
          source: 'disk',
          plugin: (plugin as TouchPlugin).toJSONObject()
        })

        console.log('plugin reload event sent', _enabled)

        _enabled && (await plugin.enable())
      } else if (baseName === 'README.md') {
        plugin.readme = fse.readFileSync(_path, 'utf-8')

        genTouchChannel().send(ChannelType.MAIN, 'plugin:reload-readme', {
          source: 'disk',
          plugin: pluginName,
          readme: plugin.readme
        })
      } else {
        console.warn(
          '[PluginManager] Plugin ' +
            pluginName +
            "'s " +
            baseName +
            " has been changed, but it's not a valid file."
        )
      }
    })

    this.watcher.on('addDir', (_path) => {
      if (!fse.existsSync(_path + '/manifest.json')) return
      const pluginName = path.basename(_path)

      if (
        pluginName.indexOf('.') !== -1 ||
        pluginName.indexOf('\\') !== -1 ||
        pluginName.indexOf('/') !== -1
      ) {
        console.log(
          `[PluginManager] IGNORE | Plugin ${pluginName} has been added, but it's not a valid name.`
        )
        return
      }

      console.log(`[Plugin] Plugin ${pluginName} has been added`)

      if (this.hasPlugin(pluginName)) {
        console.log(`[PluginManager] Reload plugin ${pluginName}`)
        genTouchChannel().send(ChannelType.MAIN, 'plugin:reload', {
          source: 'disk',
          plugin: pluginName
        })
        return
      }

      this.initialLoadPromises.push(this.loadPlugin(pluginName))
    })

    this.watcher.on('unlinkDir', (_path) => {
      const pluginName = path.basename(_path)
      console.log(`[Plugin] Plugin ${pluginName} has been removed`)

      if (!this.hasPlugin(pluginName)) return

      this.unloadPlugin(pluginName)
    })

    this.watcher.on('ready', async () => {
      console.log(
        '[PluginManager] Initial scan complete. Ready for changes. (' + this.pluginPath + ')'
      )
      console.log(
        `[PluginManager] Waiting for ${this.initialLoadPromises.length} initial plugins to load...`
      )
      // Wait for all initial plugin loading operations to complete.
      await Promise.allSettled(this.initialLoadPromises)
      console.log('[PluginManager] All initial plugins loaded.')
      // Once all plugins are loaded, load the persisted state and auto-enable plugins.
      await this.loadPersistedState()
    })

    this.watcher.on('error', (error) => {
      console.error('[PluginManager] Error happened', error)
      console.log(`[PluginManager] ${error}`)
    })
  }

  async listPlugins(): Promise<Array<string>> {
    return fse.readdirSync(this.pluginPath)
  }

  async loadPlugin(pluginName: string): Promise<boolean> {
    const pluginPath = path.resolve(this.pluginPath, pluginName)
    const manifestPath = path.resolve(pluginPath, 'manifest.json')

    console.log(`[PluginManager] Ready to load ${pluginName} from ${pluginPath}`)

    if (!fse.existsSync(pluginPath) || !fse.existsSync(manifestPath)) {
      const placeholderIcon = new PluginIcon(pluginPath, 'error', 'loading', {
        enable: false,
        address: ''
      })
      const touchPlugin = new TouchPlugin(
        pluginName,
        placeholderIcon,
        '0.0.0',
        'Loading...',
        '',
        { enable: false, address: '' },
        pluginPath
      )

      touchPlugin.issues.push({
        type: 'error',
        message: 'Plugin directory or manifest.json is missing.',
        source: 'filesystem',
        code: 'MISSING_MANIFEST',
        suggestion: 'Ensure the plugin folder and its manifest.json exist.',
        timestamp: Date.now()
      })
      touchPlugin.status = PluginStatus.LOAD_FAILED
      this.plugins.set(pluginName, touchPlugin)
      genTouchChannel().send(ChannelType.MAIN, 'plugin:add', {
        plugin: touchPlugin.toJSONObject()
      })
      console.warn(`[PluginManager] Plugin ${pluginName} failed to load: Missing manifest.json.`)
      return Promise.resolve(true)
    }

    try {
      const loader = createPluginLoader(pluginName, pluginPath)
      const touchPlugin = await loader.load()

      // After all loading attempts, set final status
      if (touchPlugin.issues.some((issue) => issue.type === 'error')) {
        touchPlugin.status = PluginStatus.LOAD_FAILED
      } else {
        touchPlugin.status = PluginStatus.DISABLED
      }

      this.watcher?.add(path.resolve(pluginPath, 'README.md'))
      this.plugins.set(pluginName, touchPlugin)
      this.devWatcher.addPlugin(touchPlugin)

      genTouchChannel().send(ChannelType.MAIN, 'plugin:add', {
        plugin: touchPlugin.toJSONObject()
      })

      // const channel = genTouchChannel()
      // const windows = BrowserWindow.getAllWindows()
      // windows.forEach((window) => {
      //   channel.sendTo(window, ChannelType.MAIN, 'core-box-updated:features', {}).catch((error) => {
      //     console.error(`Failed to notify window ${window.id} about feature updates:`, error)
      //   })
      // })
    } catch (error: any) {
      console.error(`[PluginManager] Unhandled error while loading plugin ${pluginName}:`, error)
      // Create a dummy plugin to show the error in the UI
      const placeholderIcon = new PluginIcon(pluginPath, 'error', 'fatal', {
        enable: false,
        address: ''
      })
      const touchPlugin = new TouchPlugin(
        pluginName,
        placeholderIcon,
        '0.0.0',
        'Fatal Error',
        '',
        { enable: false, address: '' },
        pluginPath
      )
      touchPlugin.issues.push({
        type: 'error',
        message: `A fatal error occurred while creating the plugin loader: ${error.message}`,
        source: 'plugin-loader',
        code: 'LOADER_FATAL',
        meta: { error: error.stack },
        timestamp: Date.now()
      })
      touchPlugin.status = PluginStatus.LOAD_FAILED
      this.plugins.set(pluginName, touchPlugin)
      genTouchChannel().send(ChannelType.MAIN, 'plugin:add', {
        plugin: touchPlugin.toJSONObject()
      })
    }

    return Promise.resolve(true)
  }

  unloadPlugin(pluginName: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginName)
    if (!plugin) return Promise.resolve(false)

    const pluginPath = path.resolve(this.pluginPath, pluginName)
    this.watcher?.unwatch(path.resolve(pluginPath, 'README.md'))

    // Remove from dev watcher
    this.devWatcher.removePlugin(pluginName)

    plugin.disable()
    plugin.logger.getManager().destroy()

    this.plugins.delete(pluginName)

    genTouchChannel().send(ChannelType.MAIN, 'plugin:del', {
      plugin: pluginName
    })

    return Promise.resolve(true)
  }
}

let pluginManager: IPluginManager | null = null

export function genPluginManager(pluginPath?: string): IPluginManager {
  if (!pluginManager) pluginManager = new PluginManager(pluginPath!)
  return pluginManager!
}

export const PluginManagerModule: TalexTouch.IModule = {
  name: Symbol('PluginManager'),
  filePath: 'plugins',
  init(touchApp) {
    const manager = genPluginManager(
      path.join(touchApp.rootPath, 'modules', 'plugins')
    ) as PluginManager

    const touchChannel = genTouchChannel()

    touchChannel.regChannel(ChannelType.MAIN, 'plugin-list', () =>
      (pluginManager as PluginManager).getPluginList()
    )
    touchChannel.regChannel(ChannelType.MAIN, 'change-active', ({ data }) =>
      pluginManager!.setActivePlugin(data!.name)
    )
    touchChannel.regChannel(ChannelType.MAIN, 'enable-plugin', async ({ data }) => {
      const plugin = pluginManager!.plugins.get(data!.name)
      if (!plugin) return false

      if (plugin.status === PluginStatus.LOAD_FAILED) {
        console.log(
          `[PluginManager] Attempting to re-enable a failed plugin '${data!.name}'. Reloading...`
        )
        await manager.reloadPlugin(data!.name)
        // After reloading, the plugin might be enabled automatically if it was previously.
        // We return the current status from the manager.
        return manager.enabledPlugins.has(data!.name)
      }

      const success = await plugin.enable()
      if (success) {
        manager.enabledPlugins.add(data!.name)
        await manager.persistEnabledPlugins()
      }
      return success
    })
    touchChannel.regChannel(ChannelType.MAIN, 'disable-plugin', async ({ data }) => {
      const plugin = pluginManager!.plugins.get(data!.name)
      if (!plugin) return false
      const success = await plugin.disable()
      if (success) {
        manager.enabledPlugins.delete(data!.name)
        await manager.persistEnabledPlugins()
      }
      return success
    })
    touchChannel.regChannel(ChannelType.MAIN, 'get-plugin', ({ data }) =>
      pluginManager!.plugins.get(data!.name)
    )

    touchChannel.regChannel(ChannelType.PLUGIN, 'crash', async ({ data, plugin }) => {
      touchChannel.send(ChannelType.MAIN, 'plugin-crashed', {
        plugin,
        ...data
      })
      touchChannel.send(ChannelType.PLUGIN, '@lifecycle:cr', {
        plugin,
        ...data
      })
    })

    touchChannel.regChannel(ChannelType.PLUGIN, 'feature:reg', ({ data, plugin }) => {
      const { feature } = data!
      const pluginIns = pluginManager!.plugins.get(plugin!)
      return pluginIns?.addFeature(feature)
    })

    touchChannel.regChannel(ChannelType.PLUGIN, 'feature:unreg', ({ data, plugin }) => {
      const { feature } = data!
      const pluginIns = pluginManager!.plugins.get(plugin!)
      return pluginIns?.delFeature(feature)
    })

    touchChannel.regChannel(ChannelType.MAIN, 'trigger-plugin-feature', ({ data }) => {
      const { feature, query, plugin } = data!
      const pluginIns = pluginManager!.plugins.get(plugin!)
      return pluginIns?.triggerFeature(feature, query)
    })

    touchChannel.regChannel(
      ChannelType.MAIN,
      'trigger-plugin-feature-input-changed',
      ({ data }) => {
        const { feature, query, plugin } = data!
        const pluginIns = pluginManager!.plugins.get(plugin!)
        return pluginIns?.triggerInputChanged(feature, query)
      }
    )

    touchChannel.regChannel(ChannelType.MAIN, 'plugin:explorer', async ({ data }) => {
      const plugin = (pluginManager as PluginManager).getPluginByName(data) as TouchPlugin
      if (!plugin) return
      const pluginPath = plugin.pluginPath
      try {
        const err = await shell.openPath(pluginPath)
        if (err) console.error(`Error opening plugin folder: ${err}`)
      } catch (error) {
        console.error(`Exception while opening plugin folder:`, error)
      }
    })
    touchChannel.regChannel(ChannelType.PLUGIN, 'window:new', async ({ data, plugin, reply }) => {
      const touchPlugin = pluginManager!.plugins.get(plugin!) as TouchPlugin
      if (!touchPlugin) return reply(DataCode.ERROR, { error: 'Plugin not found!' })

      const win = new TouchWindow(data)
      let webContents: Electron.WebContents
      if (data.file) {
        webContents = await win.loadFile(data.file)
      } else if (data.url) {
        webContents = await win.loadURL(data.url)
      } else {
        return reply(DataCode.ERROR, { error: 'No file or url provided!' })
      }

      const obj = touchPlugin.__getInjections__()
      await webContents.insertCSS(obj.styles)
      await webContents.executeJavaScript(obj.js)

      webContents.send('@loaded', {
        id: webContents.id,
        plugin,
        type: 'intend'
      })

      touchPlugin._windows.set(webContents.id, win)
      win.window.on('closed', () => {
        win.window.removeAllListeners()
        touchPlugin._windows.delete(webContents.id)
      })

      return reply(DataCode.SUCCESS, { id: webContents.id })
    })
  },
  destroy() {
    const plugins = pluginManager!.plugins
    plugins.forEach((plugin) => plugin.disable())
    console.log('All plugins were closed!')
  }
}
