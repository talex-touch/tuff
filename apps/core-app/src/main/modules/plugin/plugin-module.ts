import { IPluginManager, ITouchPlugin, PluginStatus } from '@talex-touch/utils/plugin'
import type {
  PluginInstallRequest,
  PluginInstallSummary
} from '@talex-touch/utils/plugin/providers'
import type { FSWatcher } from 'chokidar'
import chalk from 'chalk'
import fse from 'fs-extra'
import path from 'path'
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
import { PluginInstaller } from './plugin-installer'
import { LocalPluginProvider } from './providers/local-provider'
import { fileWatchService } from '../../service/file-watch.service'
import util from 'util'

const devWatcherLabel = chalk.blue('[DevPluginWatcher]')

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
        console.log(devWatcherLabel, `Watching dev plugin source: ${plugin.dev.source}`)
      }
    }
  }

  removePlugin(pluginName: string): void {
    const plugin = this.devPlugins.get(pluginName)
    if (plugin && typeof plugin.dev.source === 'string' && this.watcher) {
      this.watcher.unwatch(plugin.dev.source)
      this.devPlugins.delete(pluginName)
      console.log(devWatcherLabel, `Unwatching dev plugin source: ${plugin.dev.source}`)
    }
  }

  start(): void {
    if (this.watcher) {
      console.warn(devWatcherLabel, 'Watcher already started.')
      return
    }

    this.watcher = fileWatchService.watch([], {
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
        console.log(
          devWatcherLabel,
          `Dev plugin source changed: ${filePath}, reloading ${pluginName}`
        )
        await this.manager.reloadPlugin(pluginName)
      }
    })

    console.log(devWatcherLabel, 'Started watching for dev plugin changes.')
  }

  stop(): void {
    if (!this.watcher) return
    void fileWatchService.close(this.watcher)
    this.watcher = null
    console.log(devWatcherLabel, 'Stopped watching for dev plugin changes.')
  }
}

const createPluginModuleInternal = (pluginPath: string): IPluginManager => {
  const plugins: Map<string, ITouchPlugin> = new Map()
  let active: string = ''
  const reloadingPlugins: Set<string> = new Set()
  const enabledPlugins: Set<string> = new Set()
  const dbUtils = createDbUtils(databaseModule.getDb())
  const initialLoadPromises: Promise<boolean>[] = []

  const label = chalk.cyan('[PluginModule]')
  const formatLogArgs = (args: unknown[]): string => {
    const colorSupport = chalk.level > 0
    return args
      .map((arg) => {
        if (typeof arg === 'string') return arg
        if (typeof arg === 'number' || typeof arg === 'boolean' || typeof arg === 'bigint') {
          return String(arg)
        }
        if (arg instanceof Error) {
          return arg.stack || arg.message
        }
        if (arg === null) return 'null'
        if (typeof arg === 'undefined') return 'undefined'
        if (typeof arg === 'symbol') return arg.toString()
        return util.inspect(arg, { depth: 3, colors: colorSupport })
      })
      .join(' ')
      .trim()
  }
  const logInfo = (...args: unknown[]): void => {
    const message = formatLogArgs(args)
    console.log(message ? `${label} ${message}` : label)
  }
  const logWarn = (...args: unknown[]): void => {
    const message = formatLogArgs(args)
    console.warn(
      message ? `${chalk.yellow('[PluginModule]')} ${message}` : chalk.yellow('[PluginModule]')
    )
  }
  const logError = (...args: unknown[]): void => {
    const message = formatLogArgs(args)
    console.error(
      message ? `${chalk.red('[PluginModule]')} ${message}` : chalk.red('[PluginModule]')
    )
  }
  const logDebug = (...args: unknown[]): void => {
    const message = formatLogArgs(args)
    console.debug(
      message ? `${chalk.gray('[PluginModule]')} ${message}` : chalk.gray('[PluginModule]')
    )
  }
  const pluginTag = (name: string): string => chalk.magenta(`[${name}]`)

  const installer = new PluginInstaller()
  const localProvider = new LocalPluginProvider(pluginPath)

  const getPluginList = (): Array<object> => {
    logInfo('getPluginList called.')
    const list = new Array<object>()

    try {
      for (const plugin of plugins.values()) {
        if (!plugin) {
          logWarn('Skipping null/undefined plugin')
          continue
        }
        logDebug(
          'Processing plugin entry',
          pluginTag(plugin.name),
          'status:',
          PluginStatus[(plugin as TouchPlugin).status]
        )
        list.push((plugin as TouchPlugin).toJSONObject())
      }

      logInfo(`Returning plugin list with ${list.length} item(s).`)
      return list
    } catch (error) {
      logError('Error in getPluginList:', error)
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
      logInfo('Skip reload because plugin already reloading:', pluginTag(pluginName))
      return
    }

    const plugin = plugins.get(pluginName)
    if (!plugin) {
      logError('Cannot reload plugin - not found:', pluginTag(pluginName))
      return
    }

    reloadingPlugins.add(pluginName)

    try {
      logInfo('Reloading plugin', pluginTag(pluginName))

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
        logInfo('Plugin reloaded successfully', pluginTag(pluginName))
      } else {
        logError('Plugin failed to reload, it could not be loaded again.', pluginTag(pluginName))
      }
    } catch (error) {
      logError('Error while reloading plugin', pluginTag(pluginName), error)
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
      logInfo('Persisted enabled plugins state.')
    } catch (error) {
      logError('Failed to persist enabled plugins state:', error)
    }
  }

  const listPlugins = async (): Promise<Array<string>> => {
    return localProvider.scan()
  }

  const loadPlugin = async (pluginName: string): Promise<boolean> => {
    const currentPluginPath = path.resolve(pluginPath, pluginName)
    const manifestPath = path.resolve(currentPluginPath, 'manifest.json')

    logDebug('Ready to load plugin from disk', pluginTag(pluginName), 'path:', currentPluginPath)

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
      logWarn('Plugin failed to load: missing manifest.json', pluginTag(pluginName))
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

      localProvider.trackFile(path.resolve(currentPluginPath, 'README.md'))
      plugins.set(pluginName, touchPlugin)
      devWatcherInstance.addPlugin(touchPlugin)

      logInfo(
        'Plugin metadata loaded',
        pluginTag(pluginName),
        '| version:',
        touchPlugin.version,
        '| features:',
        touchPlugin.features.length,
        '| issues:',
        touchPlugin.issues.length
      )

      genTouchChannel().send(ChannelType.MAIN, 'plugin:add', {
        plugin: touchPlugin.toJSONObject()
      })
    } catch (error: any) {
      logError('Unhandled error while loading plugin', pluginTag(pluginName), error)
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
    localProvider.untrackFile(path.resolve(currentPluginPath, 'README.md'))

    // Remove from dev watcher
    devWatcherInstance.removePlugin(pluginName)

    plugin.disable()
    plugin.logger.getManager().destroy()

    plugins.delete(pluginName)

    logWarn('Plugin unloaded', pluginTag(pluginName))

    genTouchChannel().send(ChannelType.MAIN, 'plugin:del', {
      plugin: pluginName
    })

    return Promise.resolve(true)
  }

  const installFromSource = async (
    request: PluginInstallRequest
  ): Promise<PluginInstallSummary> => {
    const summary = await installer.install(request)
    return summary
  }

  const managerInstance: IPluginManager = {
    plugins,
    active,
    reloadingPlugins,
    enabledPlugins,
    dbUtils,
    initialLoadPromises,
    pluginPath,
    watcher: null,
    devWatcher: null!, // Will be set after DevPluginWatcher is created
    getPluginList,
    setActivePlugin,
    hasPlugin,
    getPluginByName,
    reloadPlugin,
    persistEnabledPlugins,
    listPlugins,
    loadPlugin,
    unloadPlugin,
    installFromSource
  }

  const devWatcherInstance: DevPluginWatcher = new DevPluginWatcher(managerInstance)
  managerInstance.devWatcher = devWatcherInstance // Set the circular reference

  const __initDevWatcher = (): void => {
    devWatcherInstance.start()
  }

  const loadPersistedState = async (): Promise<void> => {
    logInfo('Attempting to load persisted plugin states...')
    try {
      const data = await dbUtils.getPluginData('internal:plugin-module', 'enabled_plugins')
      if (data && data.value) {
        const enabled = JSON.parse(data.value) as string[]
        enabledPlugins.clear()
        enabled.forEach((p) => enabledPlugins.add(p))
        logInfo(
          `Loaded ${enabled.length} enabled plugin(s) from database:`,
          enabled.map(pluginTag).join(' ')
        )

        for (const pluginName of enabledPlugins) {
          const plugin = plugins.get(pluginName)
          logDebug(
            'Checking auto-enable for',
            pluginTag(pluginName),
            '| found:',
            !!plugin,
            '| status:',
            plugin ? PluginStatus[plugin.status] : 'N/A'
          )
          if (plugin && plugin.status === PluginStatus.DISABLED) {
            try {
              logInfo('Auto-enabling plugin', pluginTag(pluginName))
              await plugin.enable()
              logInfo('Auto-enable complete', pluginTag(pluginName))
            } catch (e) {
              logError('Failed to auto-enable plugin', pluginTag(pluginName), e)
            }
          }
        }
      } else {
        logInfo('No persisted plugin state found in database.')
      }
    } catch (error) {
      logError('Failed to load persisted plugin state:', error)
    }
  }

  const __init__ = (): void => {
    void (async () => {
      const exists = await fse.pathExists(pluginPath)
      if (!exists) {
        logWarn('Plugin directory does not exist, skip initialization.', pluginPath)
        return
      }

      logInfo('Initializing plugin module with root:', chalk.blue(pluginPath))

      __initDevWatcher()

      touchEventBus.on(TalexEvents.BEFORE_APP_QUIT, () => {
        void localProvider.stopWatching()
        devWatcherInstance.stop()
        logInfo('Watchers closed.')
      })

      const initialPlugins = await localProvider.scan()
      if (initialPlugins.length === 0) {
        logWarn('No plugins found in directory yet.')
      } else {
        logInfo(
          `Discovered ${initialPlugins.length} plugin(s) on startup:`,
          initialPlugins.map(pluginTag).join(' ')
        )
        for (const pluginName of initialPlugins) {
          initialLoadPromises.push(loadPlugin(pluginName))
        }
      }

      localProvider.startWatching({
        onFileChange: async (_path) => {
          const baseName = path.basename(_path)
          if (baseName.indexOf('.') === 0) return

          const pluginName = path.basename(path.dirname(_path))

          if (!hasPlugin(pluginName)) {
            logDebug('File changed for unknown plugin, triggering load.', pluginTag(pluginName))
            await loadPlugin(pluginName)
            return
          }
          let plugin = plugins.get(pluginName) as TouchPlugin

          if (plugin.dev.enable && plugin.dev.source) {
            logDebug(
              'Ignore disk change because plugin is in dev source mode.',
              pluginTag(pluginName)
            )
            return
          }

          logInfo(
            'Detected file change, reloading plugin',
            pluginTag(pluginName),
            'file:',
            baseName
          )

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

            logDebug('plugin reload event sent', pluginTag(pluginName), 'wasEnabled:', _enabled)

            if (_enabled) {
              await plugin.enable()
            }
          } else if (baseName === 'README.md') {
            plugin.readme = fse.readFileSync(_path, 'utf-8')

            genTouchChannel().send(ChannelType.MAIN, 'plugin:reload-readme', {
              source: 'disk',
              plugin: pluginName,
              readme: plugin.readme
            })
          } else {
            logWarn(
              'File change detected but ignored (not a tracked file):',
              pluginTag(pluginName),
              baseName
            )
          }
        },
        onDirectoryAdd: async (_path) => {
          if (!fse.existsSync(_path + '/manifest.json')) return
          const pluginName = path.basename(_path)

          if (
            pluginName.indexOf('.') !== -1 ||
            pluginName.indexOf('\\') !== -1 ||
            pluginName.indexOf('/') !== -1
          ) {
            logWarn('Detected new directory with invalid plugin name, ignoring.', pluginName)
            return
          }

          logInfo('Plugin directory added', pluginTag(pluginName))

          if (hasPlugin(pluginName)) {
            logInfo('Reload existing plugin after directory add', pluginTag(pluginName))
            genTouchChannel().send(ChannelType.MAIN, 'plugin:reload', {
              source: 'disk',
              plugin: pluginName
            })
            return
          }

          initialLoadPromises.push(loadPlugin(pluginName))
        },
        onDirectoryRemove: async (_path) => {
          const pluginName = path.basename(_path)
          logWarn('Plugin directory removed', pluginTag(pluginName))

          if (!hasPlugin(pluginName)) return
          await unloadPlugin(pluginName)
        },
        onReady: async () => {
          logInfo('File watcher ready for changes.', chalk.blue(pluginPath))
          logInfo(`Waiting for ${initialLoadPromises.length} initial plugin load operation(s)...`)
          await Promise.allSettled(initialLoadPromises)
          logInfo('All initial plugins loaded.')
          await loadPersistedState()
        },
        onError: (error) => {
          logError('Watcher error occurred:', error)
        }
      })
    })().catch((err) => logError('Failed to initialize plugin module watchers:', err))
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
        logError('Error in plugin-list handler:', error)
        return []
      }
    })
    touchChannel.regChannel(ChannelType.MAIN, 'plugin:install-source', async ({ data, reply }) => {
      if (!data || typeof data.source !== 'string') {
        return reply(DataCode.ERROR, { error: 'Invalid install request' })
      }

      try {
        const request: PluginInstallRequest = {
          source: data.source,
          hintType: data.hintType,
          metadata: data.metadata
        }
        const summary = await manager.installFromSource(request)
        return reply(DataCode.SUCCESS, {
          status: 'success',
          manifest: summary.manifest,
          provider: summary.providerResult.provider,
          official: summary.providerResult.official ?? false
        })
      } catch (error: any) {
        logError('插件安装失败:', error)
        return reply(DataCode.ERROR, {
          status: 'error',
          message: error?.message || 'INSTALL_FAILED'
        })
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
        if (err) logError('Error opening plugin folder:', err)
      } catch (error) {
        logError('Exception while opening plugin folder:', error)
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
