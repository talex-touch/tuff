import { IPluginManager, ITouchPlugin, PluginStatus } from '@talex-touch/utils/plugin'
import fse from 'fs-extra'
import path from 'path'
import chokidar, { FSWatcher } from 'chokidar'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { TouchPlugin } from './plugin'
import { PluginIcon } from './plugin-icon'
import { shell } from 'electron'
import { createDbUtils } from '../../db/utils'
import { databaseModule } from '../database'
import { TalexEvents, touchEventBus } from '../../core/eventbus/touch-event'
import { createPluginLoader } from '../../plugins/loaders'
import { MaybePromise, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import { TouchWindow } from '../../core/touch-window'
import { genTouchChannel } from '../../core/channel-core'
import { BaseModule } from '../abstract-base-module'

class DevPluginWatcher {
  private readonly manager: IPluginManager
  private readonly devPlugins: Map<string, ITouchPlugin> = new Map()
  private watcher: FSWatcher | null = null

  constructor(manager: IPluginManager) {
    this.manager = manager
  }

  addPlugin(plugin: ITouchPlugin): void {
    if (plugin.dev.enable && typeof plugin.dev.source === 'string') {
      this.devPlugins.set(plugin.name, plugin)
      if (this.watcher) {
        this.watcher.add(plugin.dev.source)
        console.log(`[DevPluginWatcher] Watching dev plugin source: ${plugin.dev.source}`)
      }
    }
  }

  removePlugin(pluginName: string): void {
    const plugin = this.devPlugins.get(pluginName)
    if (plugin && typeof plugin.dev.source === 'string' && this.watcher) {
      this.watcher.unwatch(plugin.dev.source)
      this.devPlugins.delete(pluginName)
      console.log(`[DevPluginWatcher] Unwatching dev plugin source: ${plugin.dev.source}`)
    }
  }

  start(): void {
    if (this.watcher) {
      console.warn('[DevPluginWatcher] Watcher already started.')
      return
    }

    this.watcher = chokidar.watch([], {
      ignored: /(^|[/\\])\../,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50
      }
    })

    this.watcher.on('change', async (filePath) => {
      const pluginName = Array.from(this.devPlugins.values()).find(
        (p) => typeof p.dev.source === 'string' && p.dev.source === filePath
      )?.name
      if (pluginName) {
        console.log(`[DevPluginWatcher] Dev plugin source changed: ${filePath}, reloading ${pluginName}`)
        await this.manager.reloadPlugin(pluginName)
      }
    })

    console.log('[DevPluginWatcher] Started watching for dev plugin changes.')
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close()
      this.watcher = null
      console.log('[DevPluginWatcher] Stopped watching for dev plugin changes.')
    }
  }
}

const createPluginModuleInternal = (pluginPath: string): IPluginManager => {
  const plugins: Map<string, ITouchPlugin> = new Map()
  let active: string = ''
  const reloadingPlugins: Set<string> = new Set()
  const enabledPlugins: Set<string> = new Set()
  const dbUtils = createDbUtils(databaseModule.getDb())
  const initialLoadPromises: Promise<boolean>[] = []

  let watcher: FSWatcher | null = null

  const getPluginList = (): Array<object> => {
    console.log('[PluginModule] getPluginList called.')
    const list = new Array<object>()

    try {
      for (const plugin of plugins.values()) {
        if (!plugin) {
          console.warn('[PluginModule] Skipping null/undefined plugin')
          continue
        }
        console.log(
          `[PluginModule]   - Processing plugin: ${plugin.name}, status: ${
            PluginStatus[(plugin as TouchPlugin).status]
          }`
        )
        list.push((plugin as TouchPlugin).toJSONObject())
      }

      console.log(`[PluginModule] Returning plugin list with ${list.length} items.`)
      return list
    } catch (error) {
      console.error('[PluginModule] Error in getPluginList:', error)
      return []
    }
  }

  const setActivePlugin = (pluginName: string): boolean => {
    if (active) {
      const plugin = plugins.get(active)

      genTouchChannel().send(ChannelType.PLUGIN, '@lifecycle:in', {
        plugin: active
      })

      if (plugin) plugin.status = PluginStatus.ENABLED
    }

    if (pluginName) {
      const plugin = plugins.get(pluginName)
      if (!plugin || plugin.status !== PluginStatus.ENABLED) return false

      plugin.status = PluginStatus.ACTIVE
      active = pluginName

      genTouchChannel().send(ChannelType.PLUGIN, '@lifecycle:ac', {
        plugin: pluginName
      })
    }

    return true
  }

  const hasPlugin = (name: string): boolean => {
    return !!getPluginByName(name)
  }

  const getPluginByName = (name: string): ITouchPlugin | undefined => {
    for (const plugin of plugins.values()) {
      if (plugin.name === name) {
        return plugin
      }
    }
    return undefined
  }

  const reloadPlugin = async (pluginName: string): Promise<void> => {
    if (reloadingPlugins.has(pluginName)) {
      console.log(`[PluginModule] Plugin ${pluginName} is already reloading. Skip.`)
      return
    }

    const plugin = plugins.get(pluginName)
    if (!plugin) {
      console.error(`[PluginModule] Cannot reload plugin ${pluginName}: not found.`)
      return
    }

    reloadingPlugins.add(pluginName)

    try {
      console.log(`[PluginModule] Reloading plugin: ${pluginName}`)

      const _enabled =
        plugin.status === PluginStatus.ENABLED || plugin.status === PluginStatus.ACTIVE

      await plugin.disable()
      await unloadPlugin(pluginName)
      await loadPlugin(pluginName)

      const newPlugin = plugins.get(pluginName) as TouchPlugin
      if (newPlugin) {
        genTouchChannel().send(ChannelType.MAIN, 'plugin:reload', {
          source: 'dev',
          plugin: newPlugin.toJSONObject()
        })
        if (_enabled) {
          await newPlugin.enable()
        }
        console.log(`[PluginModule] Plugin ${pluginName} reloaded successfully.`)
      } else {
        console.error(
          `[PluginModule] Plugin ${pluginName} failed to reload, as it could not be loaded again.`
        )
      }
    } catch (error) {
      console.error(`[PluginModule] Error while reloading plugin ${pluginName}:`, error)
    } finally {
      reloadingPlugins.delete(pluginName)
    }
  }

  const persistEnabledPlugins = async (): Promise<void> => {
    try {
      await dbUtils.setPluginData(
        'internal:plugin-module',
        'enabled_plugins',
        Array.from(enabledPlugins)
      )
      console.log('[PluginModule] Persisted enabled plugins state.')
    } catch (error) {
      console.error('[PluginModule] Failed to persist enabled plugins state:', error)
    }
  }

  const listPlugins = async (): Promise<Array<string>> => {
    return fse.readdirSync(pluginPath)
  }

  const loadPlugin = async (pluginName: string): Promise<boolean> => {
    const currentPluginPath = path.resolve(pluginPath, pluginName)
    const manifestPath = path.resolve(currentPluginPath, 'manifest.json')

    console.debug(`[PluginModule] Ready to load ${pluginName} from ${currentPluginPath}`)

    if (!fse.existsSync(currentPluginPath) || !fse.existsSync(manifestPath)) {
      const placeholderIcon = new PluginIcon(currentPluginPath, 'error', 'loading', {
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
        currentPluginPath
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
      plugins.set(pluginName, touchPlugin)
      genTouchChannel().send(ChannelType.MAIN, 'plugin:add', {
        plugin: touchPlugin.toJSONObject()
      })
      console.warn(`[PluginModule] Plugin ${pluginName} failed to load: Missing manifest.json.`)
      return Promise.resolve(true)
    }

    try {
      const loader = createPluginLoader(pluginName, currentPluginPath)
      const touchPlugin = await loader.load()

      // After all loading attempts, set final status
      if (touchPlugin.issues.some((issue) => issue.type === 'error')) {
        touchPlugin.status = PluginStatus.LOAD_FAILED
      } else {
        touchPlugin.status = PluginStatus.DISABLED
      }

      watcher?.add(path.resolve(currentPluginPath, 'README.md'))
      plugins.set(pluginName, touchPlugin)
      devWatcherInstance.addPlugin(touchPlugin)

      genTouchChannel().send(ChannelType.MAIN, 'plugin:add', {
        plugin: touchPlugin.toJSONObject()
      })

    } catch (error: any) {
      console.error(`[PluginModule] Unhandled error while loading plugin ${pluginName}:`, error)
      // Create a dummy plugin to show the error in the UI
      const placeholderIcon = new PluginIcon(currentPluginPath, 'error', 'fatal', {
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
        currentPluginPath
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
      plugins.set(pluginName, touchPlugin)
      genTouchChannel().send(ChannelType.MAIN, 'plugin:add', {
        plugin: touchPlugin.toJSONObject()
      })
    }

    return Promise.resolve(true)
  }

  const unloadPlugin = (pluginName: string): Promise<boolean> => {
    const plugin = plugins.get(pluginName)
    if (!plugin) return Promise.resolve(false)

    const currentPluginPath = path.resolve(pluginPath, pluginName)
    watcher?.unwatch(path.resolve(currentPluginPath, 'README.md'))

    // Remove from dev watcher
    devWatcherInstance.removePlugin(pluginName)

    plugin.disable()
    plugin.logger.getManager().destroy()

    plugins.delete(pluginName)

    genTouchChannel().send(ChannelType.MAIN, 'plugin:del', {
      plugin: pluginName
    })

    return Promise.resolve(true)
  }


  const managerInstance: IPluginManager = {
    plugins,
    active,
    reloadingPlugins,
    enabledPlugins,
    dbUtils,
    initialLoadPromises,
    pluginPath,
    watcher,
    devWatcher: null!, // Will be set after DevPluginWatcher is created
    getPluginList,
    setActivePlugin,
    hasPlugin,
    getPluginByName,
    reloadPlugin,
    persistEnabledPlugins,
    listPlugins,
    loadPlugin,
    unloadPlugin
  }

  const devWatcherInstance: DevPluginWatcher = new DevPluginWatcher(managerInstance)
  managerInstance.devWatcher = devWatcherInstance // Set the circular reference

  const __initDevWatcher = (): void => {
    devWatcherInstance.start()
  }

  const loadPersistedState = async (): Promise<void> => {
    console.log('[PluginModule] Attempting to load persisted plugin states...')
    try {
      const data = await dbUtils.getPluginData('internal:plugin-module', 'enabled_plugins')
      if (data && data.value) {
        const enabled = JSON.parse(data.value) as string[]
        enabledPlugins.clear()
        enabled.forEach(p => enabledPlugins.add(p));
        console.log(
          `[PluginModule] Loaded ${
            enabled.length
          } enabled plugins from database: [${enabled.join(', ')}]`
        )

        for (const pluginName of enabledPlugins) {
          const plugin = plugins.get(pluginName)
          console.log(
            `[PluginModule] Checking auto-enable for '${pluginName}': found=${!!plugin}, status=${
              plugin ? PluginStatus[plugin.status] : 'N/A'
            }`
          )
          if (plugin && plugin.status === PluginStatus.DISABLED) {
            try {
              console.log(`[PluginModule] ==> Auto-enabling plugin: ${pluginName}`)
              await plugin.enable()
              console.log(`[PluginModule] ==> Finished auto-enabling for '${pluginName}'.`)
            } catch (e) {
              console.error(`[PluginModule] Failed to auto-enable plugin ${pluginName}:`, e)
            }
          }
        }
      } else {
        console.log('[PluginModule] No persisted plugin state found in database.')
      }
    } catch (error) {
      console.error('[PluginModule] Failed to load persisted plugin state:', error)
    }
  }

  const __init__ = (): void => {
    if (!fse.existsSync(pluginPath)) return

    __initDevWatcher()

    touchEventBus.on(TalexEvents.BEFORE_APP_QUIT, () => {
      watcher?.close()
      devWatcherInstance.stop()
      console.log('[PluginModule] Watchers closed.')
    })

    watcher = chokidar.watch(pluginPath, {
      ignored: /(^|[/\\])\../,
      persistent: true,
      depth: 1,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 500
      }
    })

    watcher.on('change', async (_path) => {
      const baseName = path.basename(_path)
      if (baseName.indexOf('.') === 0) return

      const pluginName = path.basename(path.dirname(_path))

      if (!hasPlugin(pluginName)) {
        console.debug(
          '[PluginModule] IGNORE | The plugin ' +
            pluginName +
            " isn't loaded despite changes made to its file."
        )

        loadPlugin(pluginName)
        return
      }
      let plugin = plugins.get(pluginName) as TouchPlugin

      if (plugin.dev.enable && plugin.dev.source) {
        console.log(
          `[PluginModule] IGNORE | Plugin ${pluginName} is in dev source mode, ignoring local file changes.`
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
        await unloadPlugin(pluginName)

        await loadPlugin(pluginName)

        plugin = plugins.get(pluginName) as TouchPlugin

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
          '[PluginModule] Plugin ' +
            pluginName +
            "'s " +
            baseName +
            " has been changed, but it's not a valid file."
        )
      }
    })

    watcher.on('addDir', (_path) => {
      if (!fse.existsSync(_path + '/manifest.json')) return
      const pluginName = path.basename(_path)

      if (
        pluginName.indexOf('.') !== -1 ||
        pluginName.indexOf('\\') !== -1 ||
        pluginName.indexOf('/') !== -1
      ) {
        console.log(
          `[PluginModule] IGNORE | Plugin ${pluginName} has been added, but it's not a valid name.`
        )
        return
      }

      console.log(`[Plugin] Plugin ${pluginName} has been added`)

      if (hasPlugin(pluginName)) {
        console.log(`[PluginModule] Reload plugin ${pluginName}`)
        genTouchChannel().send(ChannelType.MAIN, 'plugin:reload', {
          source: 'disk',
          plugin: pluginName
        })
        return
      }

      initialLoadPromises.push(loadPlugin(pluginName))
    })

    watcher.on('unlinkDir', (_path) => {
      const pluginName = path.basename(_path)
      console.log(`[Plugin] Plugin ${pluginName} has been removed`)

      if (!hasPlugin(pluginName)) return
      unloadPlugin(pluginName)
    })

    watcher.on('ready', async () => {
      console.log(
        '[PluginModule] Initial scan complete. Ready for changes. (' + pluginPath + ')'
      )
      console.log(
        `[PluginModule] Waiting for ${initialLoadPromises.length} initial plugins to load...`
      )
      // Wait for all initial plugin loading operations to complete.
      await Promise.allSettled(initialLoadPromises)
      console.log('[PluginModule] All initial plugins loaded.')
      // Once all plugins are loaded, load the persisted state and auto-enable plugins.
      await loadPersistedState()
    })

    watcher.on('error', (error) => {
      console.error('[PluginModule] Error happened', error)
      console.log(`[PluginModule] ${error}`)
    })
  }

  __init__()

  return managerInstance
}

export class PluginModule extends BaseModule {
  pluginManager?: IPluginManager

  static key: symbol = Symbol.for('PluginModule')
  name: ModuleKey = PluginModule.key

  constructor() {
    super(PluginModule.key, {
      create: true,
      dirName: 'plugins'
    })
  }

  onInit({ file }: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    this.pluginManager = createPluginModuleInternal(file.dirPath!)
  }
  onDestroy(): MaybePromise<void> {
    this.pluginManager?.plugins.forEach((plugin) => plugin.disable())
  }

  start(): MaybePromise<void> {
    const manager = this.pluginManager!
    const touchChannel = genTouchChannel()

    touchChannel.regChannel(ChannelType.MAIN, 'plugin-list', () => {
      try {
        const result = manager.getPluginList()
        return result
      } catch (error) {
        console.error('[PluginModule] Error in plugin-list handler:', error)
        return []
      }
    })
    touchChannel.regChannel(ChannelType.MAIN, 'change-active', ({ data }) =>
      manager.setActivePlugin(data!.name)
    )
    touchChannel.regChannel(ChannelType.MAIN, 'enable-plugin', async ({ data }) => {
      const plugin = manager.plugins.get(data!.name)
      if (!plugin) return false

      if (plugin.status === PluginStatus.LOAD_FAILED) {
        console.log(
          `[PluginModule] Attempting to re-enable a failed plugin '${data!.name}'. Reloading...`
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
      const plugin = manager.plugins.get(data!.name)
      if (!plugin) return false
      const success = await plugin.disable()
      if (success) {
        manager.enabledPlugins.delete(data!.name)
        await manager.persistEnabledPlugins()
      }
      return success
    })
    touchChannel.regChannel(ChannelType.MAIN, 'get-plugin', ({ data }) =>
      manager.plugins.get(data!.name)
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
      const pluginIns = manager.plugins.get(plugin!)
      return pluginIns?.addFeature(feature)
    })

    touchChannel.regChannel(ChannelType.PLUGIN, 'feature:unreg', ({ data, plugin }) => {
      const { feature } = data!
      const pluginIns = manager.plugins.get(plugin!)
      return pluginIns?.delFeature(feature)
    })

    touchChannel.regChannel(ChannelType.MAIN, 'trigger-plugin-feature', ({ data }) => {
      const { feature, query, plugin } = data!
      const pluginIns = manager.plugins.get(plugin!)
      return pluginIns?.triggerFeature(feature, query)
    })

    touchChannel.regChannel(
      ChannelType.MAIN,
      'trigger-plugin-feature-input-changed',
      ({ data }) => {
        const { feature, query, plugin } = data!
        const pluginIns = manager.plugins.get(plugin!)
        return pluginIns?.triggerInputChanged(feature, query)
      }
    )

    touchChannel.regChannel(ChannelType.MAIN, 'plugin:explorer', async ({ data }) => {
      const plugin = manager.getPluginByName(data) as TouchPlugin
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
      const touchPlugin = manager.plugins.get(plugin!) as TouchPlugin
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
  }
}

const pluginModule = new PluginModule()

export { pluginModule }
