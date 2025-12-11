import type { MaybePromise, ModuleInitContext, ModuleKey } from '@talex-touch/utils'
import type { IManifest, IPluginManager, ITouchPlugin, PluginInstallConfirmResponse } from '@talex-touch/utils/plugin'
import type {
  PluginInstallRequest,
  PluginInstallSummary,
} from '@talex-touch/utils/plugin/providers'
import type { FSWatcher } from 'chokidar'
import { exec } from 'node:child_process'
import path from 'node:path'
import * as util from 'node:util'
import { sleep } from '@talex-touch/utils'
import { ChannelType, DataCode } from '@talex-touch/utils/channel'
import { PluginStatus } from '@talex-touch/utils/plugin'
import { app, shell } from 'electron'
import fse from 'fs-extra'
import { genTouchChannel } from '../../core/channel-core'
import { TalexEvents, touchEventBus } from '../../core/eventbus/touch-event'
import { TouchWindow } from '../../core/touch-window'
import { TuffIconImpl } from '../../core/tuff-icon'
import { createDbUtils } from '../../db/utils'
import { internalPlugins } from '../../plugins/internal'
import { fileWatchService } from '../../service/file-watch.service'
import { getOfficialPlugins } from '../../service/official-plugin.service'
import { performMarketHttpRequest } from '../../service/market-http.service'
import {
  reportPluginUninstall,
  startUpdateScheduler,
  stopUpdateScheduler,
  triggerUpdateCheck,
  type PluginWithSource,
} from '../../service/market-api.service'
import { createLogger } from '../../utils/logger'
import { debounce } from '../../utils/common-util'
import { BaseModule } from '../abstract-base-module'
import type { MarketHttpRequestOptions } from '@talex-touch/utils/market'
import { databaseModule } from '../database'
import { DevServerHealthMonitor } from './dev-server-monitor'
import { PluginInstallQueue } from './install-queue'
import { TouchPlugin } from './plugin'
import { PluginInstaller } from './plugin-installer'
import { createPluginLoader } from './plugin-loaders'

import { LocalPluginProvider } from './providers/local-provider'

const pluginLog = createLogger('PluginModule')
const devWatcherLog = pluginLog.child('DevWatcher')

/**
 * Watches development plugins for file changes and triggers hot reload
 */
class DevPluginWatcher {
  private readonly manager: IPluginManager
  private readonly devPlugins: Map<string, ITouchPlugin> = new Map()
  private watcher: FSWatcher | null = null

  constructor(manager: IPluginManager) {
    this.manager = manager
  }

  /**
   * Add a plugin to be watched for changes
   * @param plugin - Plugin to watch
   */
  addPlugin(plugin: ITouchPlugin): void {
    if (plugin.dev.enable && !plugin.dev.source) {
      this.devPlugins.set(plugin.name, plugin)
      if (this.watcher) {
        this.watcher.add(plugin.pluginPath)
        const manifestPath = path.join(plugin.pluginPath, 'manifest.json')
        if (fse.existsSync(manifestPath)) {
          this.watcher.add(manifestPath)
        }
        devWatcherLog.info('Watching dev plugin source', {
          meta: { path: plugin.pluginPath, plugin: plugin.name },
        })
      }
    }
  }

  /**
   * Remove a plugin from being watched
   * @param pluginName - Name of the plugin to stop watching
   */
  removePlugin(pluginName: string): void {
    const plugin = this.devPlugins.get(pluginName)
    if (plugin && !plugin.dev.source && this.watcher) {
      this.watcher.unwatch(plugin.pluginPath)
      const manifestPath = path.join(plugin.pluginPath, 'manifest.json')
      if (fse.existsSync(manifestPath)) {
        this.watcher.unwatch(manifestPath)
      }
      this.devPlugins.delete(pluginName)
      devWatcherLog.info('Stopped watching dev plugin source', {
        meta: { path: plugin.pluginPath, plugin: plugin.name },
      })
    }
  }

  /**
   * Start watching for file changes
   */
  start(): void {
    if (this.watcher) {
      devWatcherLog.warn('Watcher already started')
      return
    }

    this.watcher = fileWatchService.watch([], {
      ignored: /(^|[/\\])\../,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    })

    this.watcher.on('change', debounce(async (filePath) => {
      const pluginName = Array.from(this.devPlugins.values()).find(
        p =>
          !p.dev.source
          && (p.pluginPath === filePath || filePath === path.join(p.pluginPath, 'manifest.json')),
      )?.name
      if (pluginName) {
        const fileName = path.basename(filePath)
        devWatcherLog.info('Dev plugin source changed, reloading', {
          meta: { plugin: pluginName, file: filePath, fileName },
        })

        if (fileName === 'manifest.json') {
          devWatcherLog.info('Manifest.json changed, reloading plugin with new configuration', {
            meta: { plugin: pluginName },
          })
        }

        await this.manager.reloadPlugin(pluginName)
      }
    }, 300))

    devWatcherLog.info('Started watching for dev plugin changes', {
      meta: { plugins: this.devPlugins.size },
    })
  }

  /**
   * Stop watching for file changes
   */
  stop(): void {
    if (!this.watcher)
      return
    void fileWatchService.close(this.watcher)
    this.watcher = null
    devWatcherLog.info('Stopped watching for dev plugin changes')
  }
}

/**
 * Create plugin manager instance
 * @param pluginPath - Base directory for plugins
 * @returns Plugin manager instance
 */
const INTERNAL_PLUGIN_NAMES = new Set<string>()

function createPluginModuleInternal(pluginPath: string): IPluginManager {
  const plugins: Map<string, ITouchPlugin> = new Map()
  let active: string = ''
  const reloadingPlugins: Set<string> = new Set()
  const loadingPlugins: Set<string> = new Set()
  const enabledPlugins: Set<string> = new Set()
  const pluginNameIndex: Map<string, string> = new Map()
  const dbUtils = createDbUtils(databaseModule.getDb())
  const initialLoadPromises: Promise<boolean>[] = []

  /**
   * Format log arguments for plugin logging
   * @param args - Arguments to format
   * @returns Formatted string
   */
  const formatLogArgs = (args: unknown[]): string => {
    return args
      .map((arg) => {
        if (typeof arg === 'string')
          return arg
        if (typeof arg === 'number' || typeof arg === 'boolean' || typeof arg === 'bigint') {
          return String(arg)
        }
        if (arg instanceof Error) {
          return arg.stack || arg.message
        }
        if (arg === null)
          return 'null'
        if (typeof arg === 'undefined')
          return 'undefined'
        if (typeof arg === 'symbol')
          return arg.toString()
        return util.inspect(arg, { depth: 3, colors: false })
      })
      .join(' ')
      .trim()
  }
  const extractError = (args: unknown[]): Error | undefined => {
    return args.find(arg => arg instanceof Error) as Error | undefined
  }
  const logInfo = (...args: unknown[]): void => {
    const message = formatLogArgs(args)
    pluginLog.info(message)
  }
  const logWarn = (...args: unknown[]): void => {
    const message = formatLogArgs(args)
    pluginLog.warn(message)
  }
  const logError = (...args: unknown[]): void => {
    const message = formatLogArgs(args)
    const error = extractError(args)
    pluginLog.error(message, error ? { error } : undefined)
  }
  const logDebug = (...args: unknown[]): void => {
    const message = formatLogArgs(args)
    pluginLog.debug(message)
  }
  const pluginTag = (name: string): string => `[${name}]`

  const installer = new PluginInstaller()

  const persistInstallSourceMetadata = async ({
    request,
    manifest,
    providerResult,
  }: {
    request: PluginInstallRequest
    manifest?: IManifest
    providerResult: PluginInstallSummary['providerResult']
  }): Promise<void> => {
    const pluginName = manifest?.name
    if (!pluginName) {
      logWarn('Failed to persist install metadata: missing plugin name')
      return
    }
    try {
      await dbUtils.setPluginData(pluginName, 'install_source', {
        source: request.source,
        hintType: request.hintType ?? null,
        official: Boolean(providerResult.official),
        provider: providerResult.provider,
        installedAt: Date.now(),
        metadata: request.metadata ?? null,
        clientMetadata: request.clientMetadata ?? null,
      })
    }
    catch (error) {
      logWarn('Failed to save plugin source metadata', pluginTag(pluginName), error as Error)
    }
  }

  const installQueue = new PluginInstallQueue(installer, {
    onInstallCompleted: persistInstallSourceMetadata,
  })
  const localProvider = new LocalPluginProvider(pluginPath)

  const getPluginList = (): Array<object> => {
    logInfo('getPluginList called.')
    const list = new Array<object>()
    const isDevEnv = !app.isPackaged

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
          PluginStatus[(plugin as TouchPlugin).status],
        )
        const json = (plugin as TouchPlugin).toJSONObject() as any
        if ((plugin as any).internal) {
          if (!isDevEnv) {
            logDebug('Skipping internal plugin from list in production', pluginTag(plugin.name))
            continue
          }
          json.internal = true
        }
        list.push(json)
      }

      logInfo(`Returning plugin list with ${list.length} item(s).`)
      return list
    }
    catch (error) {
      logError('Error in getPluginList:', error)
      return []
    }
  }

  const setActivePlugin = (pluginName: string): boolean => {
    // Handle deactivation of currently active plugin
    if (active && active !== pluginName) {
      const previousPlugin = plugins.get(active)

      if (previousPlugin) {
        logDebug(
          `Deactivating plugin ${pluginTag(active)}: ${PluginStatus[previousPlugin.status]} → ENABLED`,
        )

        genTouchChannel().broadcastPlugin(active, 'plugin:lifecycle:inactive', {})

        if (previousPlugin.status === PluginStatus.ACTIVE) {
          previousPlugin.status = PluginStatus.ENABLED
        }
      }
    }

    // Handle activation of new plugin
    if (pluginName) {
      const plugin = plugins.get(pluginName)

      if (!plugin) {
        logWarn(`Cannot activate plugin ${pluginTag(pluginName)}: plugin not found`)
        return false
      }

      // Allow activation if plugin is ENABLED or already ACTIVE (idempotent)
      const validStates = [PluginStatus.ENABLED, PluginStatus.ACTIVE]
      if (!validStates.includes(plugin.status)) {
        logWarn(
          `Cannot activate plugin ${pluginTag(pluginName)}: invalid status ${PluginStatus[plugin.status]} (expected ENABLED or ACTIVE)`,
        )
        return false
      }

      // Avoid redundant activation
      if (active === pluginName && plugin.status === PluginStatus.ACTIVE) {
        logDebug(`Plugin ${pluginTag(pluginName)} is already active, skipping`)
        return true
      }

      logDebug(
        `Activating plugin ${pluginTag(pluginName)}: ${PluginStatus[plugin.status]} → ACTIVE`,
      )

      plugin.status = PluginStatus.ACTIVE
      active = pluginName

      genTouchChannel().broadcastPlugin(pluginName, 'plugin:lifecycle:active', {})
    }
    else {
      // Clear active plugin if no name provided
      active = ''
    }

    return true
  }

  const getPluginByName = (name: string): ITouchPlugin | undefined => {
    const folderKey = pluginNameIndex.get(name) ?? name
    const pluginByFolder = plugins.get(folderKey)
    if (pluginByFolder && pluginByFolder.name === name) {
      return pluginByFolder
    }

    if (plugins.has(name)) {
      return plugins.get(name)
    }

    for (const plugin of plugins.values()) {
      if (plugin.name === name) {
        return plugin
      }
    }

    return undefined
  }

  const hasPlugin = (name: string): boolean => {
    return plugins.has(name) || !!getPluginByName(name)
  }

  const startHealthMonitoringIfNeeded = (plugin: ITouchPlugin): void => {
    if (plugin.dev.enable && plugin.dev.source && managerInstance.healthMonitor) {
      managerInstance.healthMonitor.startMonitoring(plugin)
    }
  }

  const stopHealthMonitoring = (pluginName: string): void => {
    if (managerInstance.healthMonitor) {
      managerInstance.healthMonitor.stopMonitoring(pluginName)
    }
  }

  const enablePlugin = async (pluginName: string): Promise<boolean> => {
    const plugin = plugins.get(pluginName)
    if (!plugin)
      return false

    if (plugin.status === PluginStatus.LOAD_FAILED) {
      pluginLog.info('Attempting to re-enable failed plugin, reloading', {
        meta: { plugin: pluginName },
      })
      await reloadPlugin(pluginName)
      return enabledPlugins.has(pluginName)
    }

    const success = await plugin.enable()
    if (success) {
      enabledPlugins.add(pluginName)
      await persistEnabledPlugins()
      startHealthMonitoringIfNeeded(plugin)
    }
    return success
  }

  const disablePlugin = async (pluginName: string): Promise<boolean> => {
    const plugin = plugins.get(pluginName)
    if (!plugin)
      return false

    stopHealthMonitoring(pluginName)

    const success = await plugin.disable()
    if (success) {
      enabledPlugins.delete(pluginName)
      await persistEnabledPlugins()
    }
    return success
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

      stopHealthMonitoring(pluginName)

      const _enabled
        = plugin.status === PluginStatus.ENABLED || plugin.status === PluginStatus.ACTIVE

      if (plugin.status !== PluginStatus.LOAD_FAILED) {
        await plugin.disable()
      }

      await unloadPlugin(pluginName)

      logInfo('Waiting 0.200s before reloading plugin...', pluginTag(pluginName))
      await sleep(200)

      await loadPlugin(pluginName)

      const newPlugin = plugins.get(pluginName) as TouchPlugin
      if (newPlugin) {
        if (_enabled) {
          await newPlugin.enable()
          enabledPlugins.add(pluginName)
          await persistEnabledPlugins()
          startHealthMonitoringIfNeeded(newPlugin)
        }
        logInfo('Plugin reloaded successfully', pluginTag(pluginName))
      }
      else {
        logError('Plugin failed to reload, it could not be loaded again.', pluginTag(pluginName))
      }
    }
    catch (error) {
      logError('Error while reloading plugin', pluginTag(pluginName), error)
    }
    finally {
      reloadingPlugins.delete(pluginName)
    }
  }

  const persistEnabledPlugins = async (): Promise<void> => {
    try {
      await dbUtils.setPluginData(
        'internal:plugin-module',
        'enabled_plugins',
        Array.from(enabledPlugins),
      )
      logInfo('Persisted enabled plugins state.')
    }
    catch (error) {
      logError('Failed to persist enabled plugins state:', error)
    }
  }

  const listPlugins = async (): Promise<Array<string>> => {
    return localProvider.scan()
  }

  const loadPlugin = async (pluginName: string): Promise<boolean> => {
    if (INTERNAL_PLUGIN_NAMES.has(pluginName)) {
      logInfo('Skipping disk load for internal plugin', pluginTag(pluginName))
      return true
    }
    if (loadingPlugins.has(pluginName)) {
      logDebug('Skip load because plugin is already loading.', pluginTag(pluginName))
      return false
    }

    loadingPlugins.add(pluginName)
    try {
      const currentPluginPath = path.resolve(pluginPath, pluginName)
      const manifestPath = path.resolve(currentPluginPath, 'manifest.json')

      logDebug('Ready to load plugin from disk', pluginTag(pluginName), 'path:', currentPluginPath)

      if (!fse.existsSync(currentPluginPath) || !fse.existsSync(manifestPath)) {
        const placeholderIcon = new TuffIconImpl(currentPluginPath, 'emoji', '')
        placeholderIcon.status = 'error'
        const touchPlugin = new TouchPlugin(
          pluginName,
          placeholderIcon,
          '0.0.0',
          'Loading...',
          '',
          { enable: false, address: '' },
          currentPluginPath,
          undefined,
          { skipDataInit: true },
        )

        touchPlugin.issues.push({
          type: 'error',
          message: 'Plugin directory or manifest.json is missing.',
          source: 'filesystem',
          code: 'MISSING_MANIFEST',
          suggestion: 'Ensure the plugin folder and its manifest.json exist.',
          timestamp: Date.now(),
        })
        touchPlugin.status = PluginStatus.LOAD_FAILED
        plugins.set(pluginName, touchPlugin)
        genTouchChannel().broadcast(ChannelType.MAIN, 'plugin:state-changed', {
          type: 'added',
          plugin: touchPlugin.toJSONObject(),
        })
        logWarn('Plugin failed to load: missing manifest.json', pluginTag(pluginName))
        return true
      }

      try {
        const loadStartTime = Date.now()
        const loader = createPluginLoader(pluginName, currentPluginPath)
        const touchPlugin = await loader.load()
        touchPlugin.markLoadStart()
        touchPlugin._performanceMetrics.loadStartTime = loadStartTime // Set actual start time
        touchPlugin.markLoadEnd()

        const manifestName = touchPlugin.name || pluginName
        const normalizedName = manifestName.trim()
        const existingFolderForName = pluginNameIndex.get(normalizedName)

        if (existingFolderForName && existingFolderForName !== pluginName) {
          logError(
            'Duplicate plugin name detected, loading blocked.',
            pluginTag(pluginName),
            '| manifestName:',
            normalizedName,
            '| existingFolder:',
            existingFolderForName,
          )
          touchPlugin.issues.push({
            type: 'error',
            message: `Duplicate plugin '${normalizedName}' detected, already loaded in directory '${existingFolderForName}'. Please remove the duplicate plugin or modify the name and try again.`,
            source: 'manifest.json',
            code: 'DUPLICATE_PLUGIN_NAME',
            suggestion: `Ensure plugin names are unique across all plugins. Directory '${existingFolderForName}' currently uses this name.`,
            timestamp: Date.now(),
          })
          touchPlugin.status = PluginStatus.LOAD_FAILED
        }
        else {
          pluginNameIndex.set(normalizedName, pluginName)
        }

        // After all loading attempts, set final status
        if (touchPlugin.issues.some(issue => issue.type === 'error')) {
          touchPlugin.status = PluginStatus.LOAD_FAILED
        }
        else {
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
          touchPlugin.issues.length,
        )

        genTouchChannel().broadcast(ChannelType.MAIN, 'plugin:state-changed', {
          type: 'added',
          plugin: touchPlugin.toJSONObject(),
        })
      }
      catch (error: any) {
        logError('Unhandled error while loading plugin', pluginTag(pluginName), error)
        // Create a dummy plugin to show the error in the UI
        const placeholderIcon = new TuffIconImpl(currentPluginPath, 'emoji', '')
        placeholderIcon.status = 'error'
        const touchPlugin = new TouchPlugin(
          pluginName,
          placeholderIcon,
          '0.0.0',
          'Fatal Error',
          '',
          { enable: false, address: '' },
          currentPluginPath,
          undefined,
          { skipDataInit: true },
        )
        touchPlugin.issues.push({
          type: 'error',
          message: `A fatal error occurred while creating the plugin loader: ${error.message}`,
          source: 'plugin-loader',
          code: 'LOADER_FATAL',
          meta: { error: error.stack },
          timestamp: Date.now(),
        })
        touchPlugin.status = PluginStatus.LOAD_FAILED
        plugins.set(pluginName, touchPlugin)
        genTouchChannel().broadcast(ChannelType.MAIN, 'plugin:state-changed', {
          type: 'added',
          plugin: touchPlugin.toJSONObject(),
        })
      }

      return true
    }
    finally {
      loadingPlugins.delete(pluginName)
    }
  }

  const unloadPlugin = (pluginName: string): Promise<boolean> => {
    const plugin = plugins.get(pluginName)
    if (!plugin)
      return Promise.resolve(false)

    const currentPluginPath = path.resolve(pluginPath, pluginName)
    localProvider.untrackFile(path.resolve(currentPluginPath, 'README.md'))

    devWatcherInstance.removePlugin(pluginName)
    stopHealthMonitoring(pluginName)

    if (pluginNameIndex.get(plugin.name) === pluginName) {
      pluginNameIndex.delete(plugin.name)
    }

    try {
      if (plugin.status === PluginStatus.ENABLED || plugin.status === PluginStatus.ACTIVE) {
        plugin.disable().catch((error) => {
          logWarn('Error disabling plugin during unload:', pluginTag(pluginName), error)
        })
      }
    }
    catch (error) {
      logWarn('Error during plugin disable in unload:', pluginTag(pluginName), error)
    }

    try {
      plugin.logger.getManager().destroy()
    }
    catch (error) {
      logWarn('Error destroying plugin logger:', pluginTag(pluginName), error)
    }

    plugins.delete(pluginName)
    enabledPlugins.delete(pluginName)

    logWarn('Plugin unloaded', pluginTag(pluginName))

    genTouchChannel().broadcast(ChannelType.MAIN, 'plugin:state-changed', {
      type: 'removed',
      name: pluginName,
    })

    return Promise.resolve(true)
  }

  const installFromSource = async (
    request: PluginInstallRequest,
  ): Promise<PluginInstallSummary> => {
    const summary = await installer.install(request)
    return summary
  }

  const resolvePluginFolderName = (identifier: string): string | undefined => {
    if (plugins.has(identifier))
      return identifier
    return pluginNameIndex.get(identifier)
  }

  const uninstallPlugin = async (identifier: string): Promise<boolean> => {
    const folderName = resolvePluginFolderName(identifier)

    if (!folderName) {
      logWarn('Cannot uninstall plugin, not found:', pluginTag(identifier))
      return false
    }

    const pluginInstance = plugins.get(folderName) as TouchPlugin | undefined
    const dataDir
      = pluginInstance instanceof TouchPlugin ? path.dirname(pluginInstance.getConfigPath()) : null
    const manifestName = pluginInstance?.name ?? identifier
    const pluginDir = path.resolve(pluginPath, folderName)

    // Report uninstall to market (fire and forget, use folder name as slug)
    reportPluginUninstall(folderName).catch(() => {})

    await unloadPlugin(folderName)

    if (await fse.pathExists(pluginDir)) {
      await fse.remove(pluginDir).catch((error) => {
        logWarn('Failed to remove plugin directory', pluginTag(folderName), error)
      })
    }

    if (dataDir && (await fse.pathExists(dataDir))) {
      await fse.remove(dataDir).catch((error) => {
        logWarn('Failed to remove plugin data directory', pluginTag(folderName), error)
      })
    }

    await dbUtils.deletePluginData(manifestName).catch((error) => {
      logWarn('Failed to delete plugin data records', pluginTag(folderName), error)
    })

    await persistEnabledPlugins()

    logInfo('Plugin uninstalled successfully', pluginTag(folderName))
    return true
  }

  /**
   * Register an internal plugin instance that is created in code (no manifest / scanning).
   * It is added to the plugins map but is treated as hidden in user-facing lists.
   */
  const registerInternalPlugin = (pluginInstance: ITouchPlugin): void => {
    const pluginName = pluginInstance.name
    if (!pluginName) {
      logWarn('Cannot register internal plugin without name')
      return
    }

    if (plugins.has(pluginName)) {
      logWarn('Internal plugin already registered, skipping:', pluginTag(pluginName))
      return
    }

    ;(pluginInstance as any).internal = true

    plugins.set(pluginName, pluginInstance)
    INTERNAL_PLUGIN_NAMES.add(pluginName)

    logInfo('Internal plugin registered', pluginTag(pluginName))
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
    devWatcher: null!,
    healthMonitor: null,
    getPluginList,
    setActivePlugin,
    hasPlugin,
    getPluginByName,
    enablePlugin,
    disablePlugin,
    reloadPlugin,
    persistEnabledPlugins,
    listPlugins,
    loadPlugin,
    unloadPlugin,
    installFromSource,
    uninstallPlugin,
    registerInternalPlugin,
  }

  ;(managerInstance as any).__installQueue = installQueue

  const devWatcherInstance: DevPluginWatcher = new DevPluginWatcher(managerInstance)
  managerInstance.devWatcher = devWatcherInstance

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
        enabled.forEach(p => enabledPlugins.add(p))
        logInfo(
          `Loaded ${enabled.length} enabled plugin(s) from database:`,
          enabled.map(pluginTag).join(' '),
        )

        for (const pluginName of enabledPlugins) {
          const plugin = plugins.get(pluginName)
          logDebug(
            'Checking auto-enable for',
            pluginTag(pluginName),
            '| found:',
            !!plugin,
            '| status:',
            plugin ? PluginStatus[plugin.status] : 'N/A',
          )
          if (plugin && plugin.status === PluginStatus.DISABLED) {
            try {
              logInfo('Auto-enabling plugin', pluginTag(pluginName))
              await plugin.enable()

              logInfo('Auto-enable complete', pluginTag(pluginName))
            }
            catch (e) {
              logError('Failed to auto-enable plugin', pluginTag(pluginName), e)
            }
          }
        }
      }
      else {
        logInfo('No persisted plugin state found in database.')
      }
    }
    catch (error) {
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

      logInfo('Initializing plugin module with root:', pluginPath)

      __initDevWatcher()

      touchEventBus.on(TalexEvents.BEFORE_APP_QUIT, () => {
        void localProvider.stopWatching()
        devWatcherInstance.stop()
        logInfo('Watchers closed.')
      })

      const initialPlugins = await localProvider.scan()
      if (initialPlugins.length === 0) {
        logWarn('No plugins found in directory yet.')
      }
      else {
        logInfo(
          `Discovered ${initialPlugins.length} plugin(s) on startup:`,
          initialPlugins.map(pluginTag).join(' '),
        )
        for (const pluginName of initialPlugins) {
          initialLoadPromises.push(loadPlugin(pluginName))
        }
      }

      localProvider.startWatching({
        onFileChange: async (_path) => {
          const baseName = path.basename(_path)
          if (baseName.indexOf('.') === 0)
            return

          const pluginName = path.basename(path.dirname(_path))

          if (loadingPlugins.has(pluginName)) {
            logDebug(
              'File change received while plugin is still loading, ignoring.',
              pluginTag(pluginName),
              'file:',
              baseName,
            )
            return
          }

          if (reloadingPlugins.has(pluginName)) {
            logDebug(
              'File change received while plugin is reloading, ignoring.',
              pluginTag(pluginName),
              'file:',
              baseName,
            )
            return
          }

          if (!hasPlugin(pluginName)) {
            logDebug('File changed for unknown plugin, triggering load.', pluginTag(pluginName))
            await loadPlugin(pluginName)
            return
          }
          let plugin = plugins.get(pluginName) as TouchPlugin

          if (plugin.status === PluginStatus.LOAD_FAILED) {
            logWarn(
              'File change detected but plugin previously failed to load; skipping auto reload.',
              pluginTag(pluginName),
            )
            return
          }

          if (plugin.dev.enable) {
            logDebug(
              'Ignore disk change because plugin is running in dev mode.',
              pluginTag(pluginName),
            )
            return
          }

          logInfo(
            'Detected file change, reloading plugin',
            pluginTag(pluginName),
            'file:',
            baseName,
          )

          if (
            baseName === 'manifest.json'
            || baseName === 'preload.js'
            || baseName === 'index.html'
            || baseName === 'index.js'
          ) {
            const _enabled
              = plugin.status === PluginStatus.ENABLED || plugin.status === PluginStatus.ACTIVE

            await plugin.disable()
            await unloadPlugin(pluginName)

            await loadPlugin(pluginName)

            plugin = plugins.get(pluginName) as TouchPlugin

            genTouchChannel().broadcast(ChannelType.MAIN, 'plugin:reload', {
              source: 'disk',
              plugin: (plugin as TouchPlugin).toJSONObject(),
            })

            logDebug('plugin reload event sent', pluginTag(pluginName), 'wasEnabled:', _enabled)

            if (_enabled) {
              await plugin.enable()
            }
          }
          else if (baseName === 'README.md') {
            plugin.readme = fse.readFileSync(_path, 'utf-8')

            genTouchChannel().broadcast(ChannelType.MAIN, 'plugin:reload-readme', {
              source: 'disk',
              plugin: pluginName,
              readme: plugin.readme,
            })
            genTouchChannel().broadcast(ChannelType.MAIN, 'plugin:state-changed', {
              type: 'readme-updated',
              name: pluginName,
              readme: plugin.readme,
            })
          }
          else {
            logWarn(
              'File change detected but ignored (not a tracked file):',
              pluginTag(pluginName),
              baseName,
            )
          }
        },
        onDirectoryAdd: async (_path) => {
          if (!fse.existsSync(`${_path}/manifest.json`))
            return
          const pluginName = path.basename(_path)

          if (
            pluginName.includes('.')
            || pluginName.includes('\\')
            || pluginName.includes('/')
          ) {
            logWarn('Detected new directory with invalid plugin name, ignoring.', pluginName)
            return
          }

          logInfo('Plugin directory added', pluginTag(pluginName))

          if (hasPlugin(pluginName)) {
            logInfo('Reload existing plugin after directory add', pluginTag(pluginName))
            genTouchChannel().broadcast(ChannelType.MAIN, 'plugin:reload', {
              source: 'disk',
              plugin: pluginName,
            })
            return
          }

          initialLoadPromises.push(loadPlugin(pluginName))
        },
        onDirectoryRemove: async (_path) => {
          const pluginName = path.basename(_path)
          logWarn('Plugin directory removed', pluginTag(pluginName))

          if (!hasPlugin(pluginName))
            return
          await unloadPlugin(pluginName)
        },
        onReady: async () => {
          logInfo('File watcher ready for changes.', pluginPath)
          logInfo(`Waiting for ${initialLoadPromises.length} initial plugin load operation(s)...`)
          await Promise.allSettled(initialLoadPromises)
          logInfo('All initial plugins loaded.')
          await loadPersistedState()
        },
        onError: (error) => {
          logError('Watcher error occurred:', error)
        },
      })
    })().catch((err) => {
      pluginLog.error('Failed to initialize plugin module watchers', { error: err })
    })
  }

  __init__()

  return managerInstance
}

/**
 * Register built-in internal plugins that are created purely in code.
 * These plugins are not loaded from disk and are hidden from user-facing lists.
 */
function registerBuiltInInternalPlugins(manager: IPluginManager): void {
  try {
    for (const createPlugin of internalPlugins) {
      try {
        const plugin = createPlugin()
        manager.registerInternalPlugin(plugin)

        // Default start: enable internal plugin, but do NOT persist to enabledPlugins
        void plugin.enable().catch((error) => {
          pluginLog.warn(`Failed to enable internal plugin ${plugin.name}`, { error })
        })
      }
      catch (error) {
        pluginLog.warn('Failed to create internal plugin', { error })
      }
    }
  }
  catch (error) {
    pluginLog.warn('Failed to register built-in internal plugins', { error })
  }
}

export class PluginModule extends BaseModule {
  pluginManager?: IPluginManager
  installQueue?: PluginInstallQueue
  healthMonitor?: DevServerHealthMonitor

  static key: symbol = Symbol.for('PluginModule')
  name: ModuleKey = PluginModule.key

  constructor() {
    super(PluginModule.key, {
      create: true,
      dirName: 'plugins',
    })
  }

  onInit({ file }: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    this.pluginManager = createPluginModuleInternal(file.dirPath!)
    this.installQueue = (this.pluginManager as any).__installQueue as PluginInstallQueue
    this.healthMonitor = new DevServerHealthMonitor(this.pluginManager)
    this.pluginManager.healthMonitor = this.healthMonitor

    // Register built-in internal plugins (e.g. internal AI)
    registerBuiltInInternalPlugins(this.pluginManager)
  }

  onDestroy(): MaybePromise<void> {
    this.pluginManager?.plugins.forEach(plugin => plugin.disable())
    this.healthMonitor?.destroy()
    stopUpdateScheduler()
  }

  /**
   * Get all plugins with their install source metadata
   */
  private async getPluginsWithSource(): Promise<PluginWithSource[]> {
    const manager = this.pluginManager
    if (!manager) return []

    const result: PluginWithSource[] = []

    for (const [name, plugin] of manager.plugins) {
      if ((plugin as any).internal) continue

      try {
        const sourceData = await manager.dbUtils.getPluginData(name, 'install_source')
        result.push({
          name,
          version: plugin.version,
          installSource: sourceData?.value ? JSON.parse(sourceData.value) : null,
        })
      } catch {
        result.push({ name, version: plugin.version, installSource: null })
      }
    }

    return result
  }

  start(): MaybePromise<void> {
    const manager = this.pluginManager!
    const touchChannel = genTouchChannel()

    // Initialize update scheduler
    startUpdateScheduler({
      checkIntervalMs: 24 * 60 * 60 * 1000, // 24 hours
      getPluginsWithSource: () => this.getPluginsWithSource(),
      onUpdatesFound: (updates) => {
        // Notify renderer about available updates
        touchChannel.send(ChannelType.MAIN, 'market:updates-available', { updates })
      },
    })

    touchChannel.regChannel(ChannelType.MAIN, 'plugin-list', () => {
      try {
        const result = manager.getPluginList()
        return result
      }
      catch (error) {
        console.error('Error in plugin-list handler:', error)
        return []
      }
    })
    touchChannel.regChannel(ChannelType.MAIN, 'plugin:official-list', async ({ data, reply }) => {
      try {
        const result = await getOfficialPlugins({ force: Boolean(data?.force) })
        return reply(DataCode.SUCCESS, result)
      }
      catch (error: any) {
        console.error('Failed to fetch official plugin list:', error)
        return reply(DataCode.ERROR, {
          error: error?.message ?? 'OFFICIAL_PLUGIN_FETCH_FAILED',
        })
      }
    })
    touchChannel.regChannel(ChannelType.MAIN, 'market:http-request', async ({ data, reply }) => {
      try {
        const result = await performMarketHttpRequest(data as MarketHttpRequestOptions)
        return reply(DataCode.SUCCESS, result)
      }
      catch (error: any) {
        console.error('Market HTTP request failed:', error)
        return reply(DataCode.ERROR, {
          error: typeof error?.message === 'string' ? error.message : 'MARKET_HTTP_REQUEST_FAILED',
        })
      }
    })
    const installQueue = this.installQueue

    touchChannel.regChannel(ChannelType.MAIN, 'plugin:install-source', async ({ data, reply }) => {
      if (!installQueue) {
        return reply(DataCode.ERROR, { error: 'Install queue is not ready' })
      }

      if (!data || typeof data.source !== 'string') {
        return reply(DataCode.ERROR, { error: 'Invalid install request' })
      }

      const request: PluginInstallRequest = {
        source: data.source,
        hintType: data.hintType,
        metadata: data.metadata,
        clientMetadata: data.clientMetadata,
      }

      // Wait for install to complete - reply is called inside enqueue
      await installQueue.enqueue(request, reply)
    })

    touchChannel.regChannel(
      ChannelType.MAIN,
      'plugin:install-confirm-response',
      ({ data, reply }) => {
        if (!installQueue) {
          return reply(DataCode.ERROR, { error: 'Install queue is not ready' })
        }

        installQueue.handleConfirmResponse(data as PluginInstallConfirmResponse)
        reply(DataCode.SUCCESS, { status: 'received' })
      },
    )
    touchChannel.regChannel(ChannelType.MAIN, 'change-active', ({ data }) =>
      manager.setActivePlugin(data!.name))
    touchChannel.regChannel(ChannelType.MAIN, 'enable-plugin', ({ data }) =>
      manager.enablePlugin(data!.name))
    touchChannel.regChannel(ChannelType.MAIN, 'disable-plugin', ({ data }) =>
      manager.disablePlugin(data!.name))
    touchChannel.regChannel(ChannelType.MAIN, 'reload-plugin', async ({ data }) => {
      const pluginName = data!.name
      if (!pluginName)
        return false
      if (!manager.plugins.has(pluginName))
        return false

      await manager.reloadPlugin(pluginName)
      return true
    })
    touchChannel.regChannel(ChannelType.MAIN, 'get-plugin', ({ data }) =>
      manager.plugins.get(data!.name))

    touchChannel.regChannel(ChannelType.PLUGIN, 'crash', async ({ data, plugin }) => {
      touchChannel.broadcast(ChannelType.MAIN, 'plugin-crashed', {
        plugin,
        ...data,
      })
      if (plugin) {
        touchChannel.broadcastPlugin(plugin, 'plugin:lifecycle:crashed', data ?? {})
      }
    })

    touchChannel.regChannel(ChannelType.PLUGIN, 'core-box:clear-items', ({ plugin }) => {
      if (!plugin) {
        console.warn('core-box:clear-items called without plugin context')
        return false
      }

      const pluginIns = manager.plugins.get(plugin)
      if (!pluginIns) {
        console.warn('core-box:clear-items target plugin not found', {
          meta: { plugin },
        })
        return false
      }

      if (pluginIns instanceof TouchPlugin) {
        pluginIns.clearCoreBoxItems()
        return true
      }

      console.warn('core-box:clear-items received for unsupported plugin instance', {
        meta: { plugin },
      })
      return false
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
      },
    )

    touchChannel.regChannel(ChannelType.MAIN, 'plugin:explorer', async ({ data }) => {
      const plugin = manager.getPluginByName(data) as TouchPlugin
      if (!plugin)
        return
      const pluginPath = plugin.pluginPath
      try {
        const err = await shell.openPath(pluginPath)
        if (err)
          console.error('Error opening plugin folder:', err)
      }
      catch (error) {
        console.error('Exception while opening plugin folder:', error)
      }
    })

    touchChannel.regChannel(ChannelType.MAIN, 'plugin:open-devtools', async ({ data }) => {
      const pluginName = data as string
      if (!pluginName) return

      // Try to open DevTools for DivisionBox session
      try {
        const { DivisionBoxManager } = await import('../division-box/manager')
        const divisionBoxManager = DivisionBoxManager.getInstance()
        const sessions = divisionBoxManager.getActiveSessions()
        
        for (const session of sessions) {
          // Check if this session belongs to the plugin by checking the config pluginId
          if (session.config?.pluginId === pluginName) {
            session.openDevTools()
            return
          }
        }
      } catch (err) {
        console.warn('[PluginModule] Could not open DevTools via DivisionBox:', err)
      }

      // Try to open DevTools for CoreBox session
      try {
        const { windowManager } = await import('../box-tool/core-box/window')
        if (windowManager.openPluginDevTools(pluginName)) {
          return
        }
      } catch (err) {
        console.warn('[PluginModule] Could not open DevTools via CoreBox:', err)
      }
    })

    touchChannel.regChannel(ChannelType.PLUGIN, 'window:new', async ({ data, plugin, reply }) => {
      const touchPlugin = manager.plugins.get(plugin!) as TouchPlugin
      if (!touchPlugin)
        return reply(DataCode.ERROR, { error: 'Plugin not found!' })

      const win = new TouchWindow(data)
      let webContents: Electron.WebContents
      if (data.file) {
        webContents = await win.loadFile(data.file)
      }
      else if (data.url) {
        webContents = await win.loadURL(data.url)
      }
      else {
        return reply(DataCode.ERROR, { error: 'No file or url provided!' })
      }

      const obj = touchPlugin.__getInjections__()
      await webContents.insertCSS(obj.styles)
      await webContents.executeJavaScript(obj.js)

      webContents.send('@loaded', {
        id: webContents.id,
        plugin,
        type: 'intend',
      })

      touchPlugin._windows.set(webContents.id, win)
      win.window.on('closed', () => {
        win.window.removeAllListeners()
        touchPlugin._windows.delete(webContents.id)
      })

      return reply(DataCode.SUCCESS, { id: webContents.id })
    })

    touchChannel.regChannel(
      ChannelType.PLUGIN,
      'index:communicate',
      async ({ data, reply, plugin: pluginName }) => {
        try {
          const { key, info } = data

          if (!key) {
            return reply(DataCode.ERROR, { error: 'Plugin name and key are required' })
          }

          const plugin = manager.getPluginByName(pluginName!) as TouchPlugin
          if (!plugin) {
            return reply(DataCode.ERROR, { error: `Plugin ${pluginName} not found` })
          }

          const lifecycle = plugin.getFeatureLifeCycle?.()
          if (!lifecycle || !lifecycle.onMessage) {
            return reply(DataCode.ERROR, {
              error: `Plugin ${pluginName} does not have onMessage handler`,
            })
          }

          lifecycle.onMessage(key, info)

          return reply(DataCode.SUCCESS, { status: 'message_sent' })
        }
        catch (error) {
          console.error('Error in index:communicate handler:', error)
          return reply(DataCode.ERROR, {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      },
    )

    // Plugin Storage Channel Handlers
    touchChannel.regChannel(
      ChannelType.PLUGIN,
      'plugin:storage:get-file',
      async ({ data, reply, plugin: pluginName }) => {
        try {
          const { fileName } = data
          if (!pluginName || !fileName) {
            return reply(DataCode.ERROR, { error: 'Plugin name and fileName are required' })
          }

          const plugin = manager.getPluginByName(pluginName) as TouchPlugin
          if (!plugin) {
            return reply(DataCode.ERROR, { error: `Plugin ${pluginName} not found` })
          }

          const content = plugin.getPluginFile(fileName)
          return reply(DataCode.SUCCESS, content)
        }
        catch (error) {
          console.error('Error in plugin:storage:get-file handler:', error)
          return reply(DataCode.ERROR, {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      },
    )

    touchChannel.regChannel(
      ChannelType.PLUGIN,
      'plugin:storage:set-file',
      async ({ data, reply, plugin: pluginName }) => {
        try {
          const { fileName, content } = data
          if (!pluginName || !fileName) {
            return reply(DataCode.ERROR, { error: 'Plugin name and fileName are required' })
          }

          const plugin = manager.getPluginByName(pluginName) as TouchPlugin
          if (!plugin) {
            return reply(DataCode.ERROR, { error: `Plugin ${pluginName} not found` })
          }

          const result = plugin.savePluginFile(fileName, content)
          return reply(DataCode.SUCCESS, result)
        }
        catch (error) {
          console.error('Error in plugin:storage:set-file handler:', error)
          return reply(DataCode.ERROR, {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      },
    )

    touchChannel.regChannel(
      ChannelType.PLUGIN,
      'plugin:storage:delete-file',
      async ({ data, reply, plugin: pluginName }) => {
        try {
          const { fileName } = data
          if (!pluginName || !fileName) {
            return reply(DataCode.ERROR, { error: 'Plugin name and fileName are required' })
          }

          const plugin = manager.getPluginByName(pluginName) as TouchPlugin
          if (!plugin) {
            return reply(DataCode.ERROR, { error: `Plugin ${pluginName} not found` })
          }

          const result = plugin.deletePluginFile(fileName)
          return reply(DataCode.SUCCESS, result)
        }
        catch (error) {
          console.error('Error in plugin:storage:delete-file handler:', error)
          return reply(DataCode.ERROR, {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      },
    )

    touchChannel.regChannel(
      ChannelType.PLUGIN,
      'plugin:storage:list-files',
      async ({ reply, plugin: pluginName }) => {
        try {
          if (!pluginName) {
            return reply(DataCode.ERROR, { error: 'Plugin name is required' })
          }

          const plugin = manager.getPluginByName(pluginName) as TouchPlugin
          if (!plugin) {
            return reply(DataCode.ERROR, { error: `Plugin ${pluginName} not found` })
          }

          const files = plugin.listPluginFiles()
          return reply(DataCode.SUCCESS, files)
        }
        catch (error) {
          console.error('Error in plugin:storage:list-files handler:', error)
          return reply(DataCode.ERROR, {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      },
    )

    // Plugin Storage: get-stats (support both MAIN and PLUGIN channels)
    touchChannel.regChannel(
      ChannelType.MAIN,
      'plugin:storage:get-stats',
      async ({ data, reply }) => {
        try {
          const { pluginName } = data
          if (!pluginName) {
            return reply(DataCode.ERROR, { error: 'Plugin name is required' })
          }

          const plugin = manager.getPluginByName(pluginName) as TouchPlugin
          if (!plugin) {
            return reply(DataCode.ERROR, { error: `Plugin ${pluginName} not found` })
          }

          const stats = plugin.getStorageStats()
          return reply(DataCode.SUCCESS, stats)
        }
        catch (error) {
          console.error('Error in plugin:storage:get-stats handler:', error)
          return reply(DataCode.ERROR, {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      },
    )

    touchChannel.regChannel(
      ChannelType.PLUGIN,
      'plugin:storage:get-stats',
      async ({ reply, plugin: pluginName }) => {
        try {
          if (!pluginName) {
            return reply(DataCode.ERROR, { error: 'Plugin name is required' })
          }

          const plugin = manager.getPluginByName(pluginName) as TouchPlugin
          if (!plugin) {
            return reply(DataCode.ERROR, { error: `Plugin ${pluginName} not found` })
          }

          const stats = plugin.getStorageStats()
          return reply(DataCode.SUCCESS, stats)
        }
        catch (error) {
          console.error('Error in plugin:storage:get-stats handler:', error)
          return reply(DataCode.ERROR, {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      },
    )

    // Plugin Performance: get-metrics (for plugin SDK)
    touchChannel.regChannel(
      ChannelType.PLUGIN,
      'plugin:performance:get-metrics',
      async ({ reply, plugin: pluginName }) => {
        try {
          if (!pluginName) {
            return reply(DataCode.ERROR, { error: 'Plugin name is required' })
          }

          const plugin = manager.getPluginByName(pluginName) as TouchPlugin
          if (!plugin) {
            return reply(DataCode.ERROR, { error: `Plugin ${pluginName} not found` })
          }

          const metrics = plugin.getPerformanceMetrics()
          return reply(DataCode.SUCCESS, metrics)
        }
        catch (error) {
          console.error('Error in plugin:performance:get-metrics handler:', error)
          return reply(DataCode.ERROR, {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      },
    )

    // Plugin Performance: get-paths (for plugin SDK)
    touchChannel.regChannel(
      ChannelType.PLUGIN,
      'plugin:performance:get-paths',
      async ({ reply, plugin: pluginName }) => {
        try {
          if (!pluginName) {
            return reply(DataCode.ERROR, { error: 'Plugin name is required' })
          }

          const plugin = manager.getPluginByName(pluginName) as TouchPlugin
          if (!plugin) {
            return reply(DataCode.ERROR, { error: `Plugin ${pluginName} not found` })
          }

          return reply(DataCode.SUCCESS, {
            pluginPath: plugin.pluginPath,
            dataPath: plugin.getDataPath(),
            configPath: plugin.getConfigPath(),
            logsPath: plugin.getLogsPath(),
            tempPath: plugin.getTempPath(),
          })
        }
        catch (error) {
          console.error('Error in plugin:performance:get-paths handler:', error)
          return reply(DataCode.ERROR, {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      },
    )

    // Plugin Storage: get-tree (support both MAIN and PLUGIN channels)
    touchChannel.regChannel(
      ChannelType.MAIN,
      'plugin:storage:get-tree',
      async ({ data, reply }) => {
        try {
          const { pluginName } = data
          if (!pluginName) {
            return reply(DataCode.ERROR, { error: 'Plugin name is required' })
          }

          const plugin = manager.getPluginByName(pluginName) as TouchPlugin
          if (!plugin) {
            return reply(DataCode.ERROR, { error: `Plugin ${pluginName} not found` })
          }

          const tree = plugin.getStorageTree()
          return reply(DataCode.SUCCESS, tree)
        }
        catch (error) {
          console.error('Error in plugin:storage:get-tree handler:', error)
          return reply(DataCode.ERROR, {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      },
    )

    touchChannel.regChannel(
      ChannelType.PLUGIN,
      'plugin:storage:get-tree',
      async ({ reply, plugin: pluginName }) => {
        try {
          if (!pluginName) {
            return reply(DataCode.ERROR, { error: 'Plugin name is required' })
          }

          const plugin = manager.getPluginByName(pluginName) as TouchPlugin
          if (!plugin) {
            return reply(DataCode.ERROR, { error: `Plugin ${pluginName} not found` })
          }

          const tree = plugin.getStorageTree()
          return reply(DataCode.SUCCESS, tree)
        }
        catch (error) {
          console.error('Error in plugin:storage:get-tree handler:', error)
          return reply(DataCode.ERROR, {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      },
    )

    // Plugin Storage: get-file-details (support both MAIN and PLUGIN channels)
    touchChannel.regChannel(
      ChannelType.MAIN,
      'plugin:storage:get-file-details',
      async ({ data, reply }) => {
        try {
          const { pluginName, fileName } = data
          if (!pluginName || !fileName) {
            return reply(DataCode.ERROR, { error: 'Plugin name and fileName are required' })
          }

          const plugin = manager.getPluginByName(pluginName) as TouchPlugin
          if (!plugin) {
            return reply(DataCode.ERROR, { error: `Plugin ${pluginName} not found` })
          }

          const details = plugin.getFileDetails(fileName)
          return reply(DataCode.SUCCESS, details)
        }
        catch (error) {
          console.error('Error in plugin:storage:get-file-details handler:', error)
          return reply(DataCode.ERROR, {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      },
    )

    touchChannel.regChannel(
      ChannelType.PLUGIN,
      'plugin:storage:get-file-details',
      async ({ data, reply, plugin: pluginName }) => {
        try {
          const { fileName } = data
          if (!pluginName || !fileName) {
            return reply(DataCode.ERROR, { error: 'Plugin name and fileName are required' })
          }

          const plugin = manager.getPluginByName(pluginName) as TouchPlugin
          if (!plugin) {
            return reply(DataCode.ERROR, { error: `Plugin ${pluginName} not found` })
          }

          const details = plugin.getFileDetails(fileName)
          return reply(DataCode.SUCCESS, details)
        }
        catch (error) {
          console.error('Error in plugin:storage:get-file-details handler:', error)
          return reply(DataCode.ERROR, {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      },
    )

    // Plugin Storage: clear (support both MAIN and PLUGIN channels)
    touchChannel.regChannel(ChannelType.MAIN, 'plugin:storage:clear', async ({ data, reply }) => {
      try {
        const { pluginName } = data
        if (!pluginName) {
          return reply(DataCode.ERROR, { error: 'Plugin name is required' })
        }

        const plugin = manager.getPluginByName(pluginName) as TouchPlugin
        if (!plugin) {
          return reply(DataCode.ERROR, { error: `Plugin ${pluginName} not found` })
        }

        const result = plugin.clearStorage()
        return reply(DataCode.SUCCESS, result)
      }
      catch (error) {
        console.error('Error in plugin:storage:clear handler:', error)
        return reply(DataCode.ERROR, {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })

    touchChannel.regChannel(ChannelType.PLUGIN, 'plugin:storage:clear', async ({ reply, plugin: pluginName }) => {
      try {
        if (!pluginName) {
          return reply(DataCode.ERROR, { error: 'Plugin name is required' })
        }

        const plugin = manager.getPluginByName(pluginName) as TouchPlugin
        if (!plugin) {
          return reply(DataCode.ERROR, { error: `Plugin ${pluginName} not found` })
        }

        const result = plugin.clearStorage()
        return reply(DataCode.SUCCESS, result)
      }
      catch (error) {
        console.error('Error in plugin:storage:clear handler:', error)
        return reply(DataCode.ERROR, {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })

    // Plugin Storage: open-folder (support both MAIN and PLUGIN channels)
    touchChannel.regChannel(
      ChannelType.MAIN,
      'plugin:storage:open-folder',
      async ({ data, reply }) => {
        try {
          const { pluginName } = data
          if (!pluginName) {
            return reply(DataCode.ERROR, { error: 'Plugin name is required' })
          }

          const plugin = manager.getPluginByName(pluginName) as TouchPlugin
          if (!plugin) {
            return reply(DataCode.ERROR, { error: `Plugin ${pluginName} not found` })
          }

          const configPath = plugin.getConfigPath()
          await shell.openPath(configPath)
          return reply(DataCode.SUCCESS, { success: true })
        }
        catch (error) {
          console.error('Error in plugin:storage:open-folder handler:', error)
          return reply(DataCode.ERROR, {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      },
    )

    touchChannel.regChannel(
      ChannelType.PLUGIN,
      'plugin:storage:open-folder',
      async ({ reply, plugin: pluginName }) => {
        try {
          if (!pluginName) {
            return reply(DataCode.ERROR, { error: 'Plugin name is required' })
          }

          const plugin = manager.getPluginByName(pluginName) as TouchPlugin
          if (!plugin) {
            return reply(DataCode.ERROR, { error: `Plugin ${pluginName} not found` })
          }

          const configPath = plugin.getConfigPath()
          await shell.openPath(configPath)
          return reply(DataCode.SUCCESS, { success: true })
        }
        catch (error) {
          console.error('Error in plugin:storage:open-folder handler:', error)
          return reply(DataCode.ERROR, {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      },
    )

    touchChannel.regChannel(
      ChannelType.MAIN,
      'plugin:storage:open-in-editor',
      async ({ data, reply }) => {
        try {
          const { pluginName } = data
          if (!pluginName) {
            return reply(DataCode.ERROR, { error: 'Plugin name is required' })
          }

          const plugin = manager.getPluginByName(pluginName) as TouchPlugin
          if (!plugin) {
            return reply(DataCode.ERROR, { error: `Plugin ${pluginName} not found` })
          }

          const configPath = plugin.getConfigPath()
          const execAsync = util.promisify(exec)

          try {
            await execAsync(`code "${configPath}"`)
          }
          catch {
            await shell.openPath(configPath)
          }

          return reply(DataCode.SUCCESS, { success: true })
        }
        catch (error) {
          console.error('Error in plugin:storage:open-in-editor handler:', error)
          return reply(DataCode.ERROR, {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      },
    )

    touchChannel.regChannel(
      ChannelType.MAIN,
      'plugin:reconnect-dev-server',
      async ({ data, reply }) => {
        try {
          const { pluginName } = data
          if (!pluginName) {
            return reply(DataCode.ERROR, { error: 'Plugin name is required' })
          }

          const success = (await this.healthMonitor?.reconnectDevServer(pluginName)) || false
          return reply(success ? DataCode.SUCCESS : DataCode.ERROR, { success })
        }
        catch (error) {
          console.error('Error in plugin:reconnect-dev-server handler:', error)
          return reply(DataCode.ERROR, {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      },
    )

    touchChannel.regChannel(ChannelType.MAIN, 'plugin:dev-server-status', ({ data, reply }) => {
      try {
        const { pluginName } = data
        if (!pluginName) {
          return reply(DataCode.ERROR, { error: 'Plugin name is required' })
        }

        const status = this.healthMonitor?.getStatus(pluginName) || {
          monitoring: false,
          connected: false,
        }
        return reply(DataCode.SUCCESS, status)
      }
      catch (error) {
        console.error('Error in plugin:dev-server-status handler:', error)
        return reply(DataCode.ERROR, {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })

    manager.plugins.forEach((plugin) => {
      if (plugin.status === PluginStatus.ENABLED && plugin.dev.enable && plugin.dev.source) {
        this.healthMonitor?.startMonitoring(plugin)
      }
    })

    touchChannel.regChannel(ChannelType.MAIN, 'plugin:api:list', ({ data, reply }) => {
      try {
        const filters = data?.filters || {}
        let plugins = Array.from(manager.plugins.values()) as TouchPlugin[]

        if (filters.status !== undefined) {
          plugins = plugins.filter(p => p.status === filters.status)
        }
        if (filters.enabled !== undefined) {
          const enabledNames = manager.enabledPlugins
          plugins = plugins.filter(p => enabledNames.has(p.name) === filters.enabled)
        }
        if (filters.dev !== undefined) {
          plugins = plugins.filter(p => p.dev?.enable === filters.dev)
        }

        const result = plugins.map(p => p.toJSONObject())
        return reply(DataCode.SUCCESS, result)
      }
      catch (error) {
        console.error('Error in plugin:api:list handler:', error)
        return reply(DataCode.ERROR, {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })

    touchChannel.regChannel(ChannelType.MAIN, 'plugin:api:get', ({ data, reply }) => {
      try {
        const { name } = data
        if (!name) {
          return reply(DataCode.ERROR, { error: 'Plugin name is required' })
        }

        const plugin = manager.plugins.get(name) as TouchPlugin | undefined
        if (!plugin) {
          return reply(DataCode.SUCCESS, null)
        }

        return reply(DataCode.SUCCESS, plugin.toJSONObject())
      }
      catch (error) {
        console.error('Error in plugin:api:get handler:', error)
        return reply(DataCode.ERROR, {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })

    touchChannel.regChannel(ChannelType.MAIN, 'plugin:api:get-status', ({ data, reply }) => {
      try {
        const { name } = data
        if (!name) {
          return reply(DataCode.ERROR, { error: 'Plugin name is required' })
        }

        const plugin = manager.plugins.get(name)
        if (!plugin) {
          return reply(DataCode.ERROR, { error: `Plugin ${name} not found` })
        }

        return reply(DataCode.SUCCESS, plugin.status)
      }
      catch (error) {
        console.error('Error in plugin:api:get-status handler:', error)
        return reply(DataCode.ERROR, {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })

    touchChannel.regChannel(ChannelType.MAIN, 'plugin:api:enable', async ({ data, reply }) => {
      try {
        const { name } = data
        if (!name) {
          return reply(DataCode.ERROR, { error: 'Plugin name is required' })
        }

        const success = await manager.enablePlugin(name)

        if (success) {
          const plugin = manager.plugins.get(name)
          if (plugin) {
            touchChannel.broadcast(ChannelType.MAIN, 'plugin:state-changed', {
              type: 'status-changed',
              name,
              status: plugin.status,
            })
          }
        }

        return reply(DataCode.SUCCESS, { success })
      }
      catch (error) {
        console.error('Error in plugin:api:enable handler:', error)
        return reply(DataCode.ERROR, {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })

    touchChannel.regChannel(ChannelType.MAIN, 'plugin:api:disable', async ({ data, reply }) => {
      try {
        const { name } = data
        if (!name) {
          return reply(DataCode.ERROR, { error: 'Plugin name is required' })
        }

        const success = await manager.disablePlugin(name)

        if (success) {
          const plugin = manager.plugins.get(name)
          if (plugin) {
            touchChannel.broadcast(ChannelType.MAIN, 'plugin:state-changed', {
              type: 'status-changed',
              name,
              status: plugin.status,
            })
          }
        }

        return reply(DataCode.SUCCESS, { success })
      }
      catch (error) {
        console.error('Error in plugin:api:disable handler:', error)
        return reply(DataCode.ERROR, {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })

    touchChannel.regChannel(ChannelType.MAIN, 'plugin:api:reload', async ({ data, reply }) => {
      try {
        const { name } = data
        if (!name) {
          return reply(DataCode.ERROR, { error: 'Plugin name is required' })
        }

        if (!manager.plugins.has(name)) {
          return reply(DataCode.ERROR, { error: `Plugin ${name} not found` })
        }

        await manager.reloadPlugin(name)
        return reply(DataCode.SUCCESS, { success: true })
      }
      catch (error) {
        console.error('Error in plugin:api:reload handler:', error)
        return reply(DataCode.ERROR, {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })

    touchChannel.regChannel(ChannelType.MAIN, 'plugin:api:install', async ({ data, reply }) => {
      if (!this.installQueue) {
        return reply(DataCode.ERROR, { error: 'Install queue is not ready' })
      }

      if (!data || typeof data.source !== 'string') {
        return reply(DataCode.ERROR, { error: 'Invalid install request' })
      }

      const request: PluginInstallRequest = {
        source: data.source,
        hintType: data.hintType,
        metadata: data.metadata,
        clientMetadata: data.clientMetadata,
      }

      this.installQueue.enqueue(request, reply)
    })

    touchChannel.regChannel(ChannelType.MAIN, 'plugin:api:uninstall', async ({ data, reply }) => {
      try {
        const { name } = data
        if (!name) {
          return reply(DataCode.ERROR, { error: 'Plugin name is required' })
        }

        const success = await manager.uninstallPlugin(name)
        if (!success) {
          return reply(DataCode.ERROR, { error: `Plugin ${name} not found` })
        }

        return reply(DataCode.SUCCESS, { success: true })
      }
      catch (error) {
        console.error('Error in plugin:api:uninstall handler:', error)
        return reply(DataCode.ERROR, {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })

    touchChannel.regChannel(ChannelType.MAIN, 'plugin:api:trigger-feature', ({ data, reply }) => {
      try {
        const { plugin: pluginName, feature: featureId, query } = data
        if (!pluginName || !featureId) {
          return reply(DataCode.ERROR, { error: 'Plugin name and feature ID are required' })
        }

        const pluginIns = manager.plugins.get(pluginName)
        if (!pluginIns) {
          return reply(DataCode.ERROR, { error: `Plugin ${pluginName} not found` })
        }

        const feature = pluginIns.getFeature(featureId)
        if (!feature) {
          return reply(DataCode.ERROR, {
            error: `Feature ${featureId} not found in plugin ${pluginName}`,
          })
        }

        const result = pluginIns.triggerFeature(feature, query)
        return reply(DataCode.SUCCESS, result)
      }
      catch (error) {
        console.error('Error in plugin:api:trigger-feature handler:', error)
        return reply(DataCode.ERROR, {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })

    touchChannel.regChannel(
      ChannelType.MAIN,
      'plugin:api:feature-input-changed',
      ({ data, reply }) => {
        try {
          const { plugin: pluginName, feature: featureId, query } = data
          if (!pluginName || !featureId) {
            return reply(DataCode.ERROR, { error: 'Plugin name and feature ID are required' })
          }

          const pluginIns = manager.plugins.get(pluginName)
          if (!pluginIns) {
            return reply(DataCode.ERROR, { error: `Plugin ${pluginName} not found` })
          }

          const feature = pluginIns.getFeature(featureId)
          if (!feature) {
            return reply(DataCode.ERROR, {
              error: `Feature ${featureId} not found in plugin ${pluginName}`,
            })
          }

          const result = pluginIns.triggerInputChanged(feature, query)
          return reply(DataCode.SUCCESS, result)
        }
        catch (error) {
          console.error('Error in plugin:api:feature-input-changed handler:', error)
          return reply(DataCode.ERROR, {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      },
    )

    touchChannel.regChannel(ChannelType.MAIN, 'plugin:api:open-folder', async ({ data, reply }) => {
      try {
        const { name } = data
        if (!name) {
          return reply(DataCode.ERROR, { error: 'Plugin name is required' })
        }

        const plugin = manager.getPluginByName(name) as TouchPlugin
        if (!plugin) {
          return reply(DataCode.ERROR, { error: `Plugin ${name} not found` })
        }

        const pluginPath = plugin.pluginPath
        const err = await shell.openPath(pluginPath)
        if (err) {
          console.error('Error opening plugin folder:', err)
          return reply(DataCode.ERROR, { error: err })
        }

        return reply(DataCode.SUCCESS, { success: true })
      }
      catch (error) {
        console.error('Error in plugin:api:open-folder handler:', error)
        return reply(DataCode.ERROR, {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })

    touchChannel.regChannel(
      ChannelType.MAIN,
      'plugin:api:get-official-list',
      async ({ data, reply }) => {
        try {
          const result = await getOfficialPlugins({ force: Boolean(data?.force) })
          return reply(DataCode.SUCCESS, result)
        }
        catch (error: any) {
          console.error('Failed to fetch official plugin list:', error)
          return reply(DataCode.ERROR, {
            error: error?.message ?? 'OFFICIAL_PLUGIN_FETCH_FAILED',
          })
        }
      },
    )

    // ============================================
    // Plugin Details APIs (for PluginInfo page)
    // ============================================

    /**
     * Get plugin manifest.json content
     */
    touchChannel.regChannel(ChannelType.MAIN, 'plugin:api:get-manifest', async ({ data, reply }) => {
      try {
        const { name } = data
        if (!name) {
          return reply(DataCode.ERROR, { error: 'Plugin name is required' })
        }

        const plugin = manager.plugins.get(name) as TouchPlugin
        if (!plugin) {
          return reply(DataCode.ERROR, { error: `Plugin ${name} not found` })
        }

        const manifestPath = path.resolve(plugin.pluginPath, 'manifest.json')
        if (!fse.existsSync(manifestPath)) {
          return reply(DataCode.ERROR, { error: 'manifest.json not found' })
        }

        const manifest = fse.readJSONSync(manifestPath)
        return reply(DataCode.SUCCESS, manifest)
      }
      catch (error) {
        console.error('Error in plugin:api:get-manifest handler:', error)
        return reply(DataCode.ERROR, {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })

    /**
     * Save plugin manifest.json and optionally reload
     */
    touchChannel.regChannel(ChannelType.MAIN, 'plugin:api:save-manifest', async ({ data, reply }) => {
      try {
        const { name, manifest, reload = true } = data
        if (!name) {
          return reply(DataCode.ERROR, { error: 'Plugin name is required' })
        }
        if (!manifest) {
          return reply(DataCode.ERROR, { error: 'Manifest content is required' })
        }

        const plugin = manager.plugins.get(name) as TouchPlugin
        if (!plugin) {
          return reply(DataCode.ERROR, { error: `Plugin ${name} not found` })
        }

        const manifestPath = path.resolve(plugin.pluginPath, 'manifest.json')

        // Write manifest.json
        fse.writeJSONSync(manifestPath, manifest, { spaces: 2 })

        // Optionally reload the plugin
        if (reload) {
          await manager.reloadPlugin(name)
        }

        return reply(DataCode.SUCCESS, { success: true })
      }
      catch (error) {
        console.error('Error in plugin:api:save-manifest handler:', error)
        return reply(DataCode.ERROR, {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })

    /**
     * Get plugin paths (pluginPath, dataPath, configPath, logsPath)
     */
    touchChannel.regChannel(ChannelType.MAIN, 'plugin:api:get-paths', async ({ data, reply }) => {
      try {
        const { name } = data
        if (!name) {
          return reply(DataCode.ERROR, { error: 'Plugin name is required' })
        }

        const plugin = manager.plugins.get(name) as TouchPlugin
        if (!plugin) {
          return reply(DataCode.ERROR, { error: `Plugin ${name} not found` })
        }

        return reply(DataCode.SUCCESS, {
          pluginPath: plugin.pluginPath,
          dataPath: plugin.getDataPath(),
          configPath: plugin.getConfigPath(),
          logsPath: plugin.getLogsPath(),
          tempPath: plugin.getTempPath(),
        })
      }
      catch (error) {
        console.error('Error in plugin:api:get-paths handler:', error)
        return reply(DataCode.ERROR, {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })

    /**
     * Open a specific plugin path in file explorer
     */
    touchChannel.regChannel(ChannelType.MAIN, 'plugin:api:open-path', async ({ data, reply }) => {
      try {
        const { name, pathType } = data
        if (!name) {
          return reply(DataCode.ERROR, { error: 'Plugin name is required' })
        }
        if (!pathType) {
          return reply(DataCode.ERROR, { error: 'Path type is required' })
        }

        const plugin = manager.plugins.get(name) as TouchPlugin
        if (!plugin) {
          return reply(DataCode.ERROR, { error: `Plugin ${name} not found` })
        }

        let targetPath: string
        switch (pathType) {
          case 'plugin':
            targetPath = plugin.pluginPath
            break
          case 'data':
            targetPath = plugin.getDataPath()
            break
          case 'config':
            targetPath = plugin.getConfigPath()
            break
          case 'logs':
            targetPath = plugin.getLogsPath()
            break
          case 'temp':
            targetPath = plugin.getTempPath()
            break
          default:
            return reply(DataCode.ERROR, { error: `Invalid path type: ${pathType}` })
        }

        // Ensure directory exists before opening
        fse.ensureDirSync(targetPath)
        await shell.openPath(targetPath)

        return reply(DataCode.SUCCESS, { success: true, path: targetPath })
      }
      catch (error) {
        console.error('Error in plugin:api:open-path handler:', error)
        return reply(DataCode.ERROR, {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })

    /**
     * Get plugin performance metrics
     */
    touchChannel.regChannel(ChannelType.MAIN, 'plugin:api:get-performance', async ({ data, reply }) => {
      try {
        const { name } = data
        if (!name) {
          return reply(DataCode.ERROR, { error: 'Plugin name is required' })
        }

        const plugin = manager.plugins.get(name) as TouchPlugin
        if (!plugin) {
          return reply(DataCode.ERROR, { error: `Plugin ${name} not found` })
        }

        // Get storage stats
        const storageStats = plugin.getStorageStats()

        // Get performance metrics from plugin if available
        const performanceMetrics = plugin.getPerformanceMetrics?.() || {
          loadTime: 0,
          memoryUsage: 0,
          cpuUsage: 0,
          lastActiveTime: 0,
        }

        return reply(DataCode.SUCCESS, {
          storage: storageStats,
          performance: performanceMetrics,
        })
      }
      catch (error) {
        console.error('Error in plugin:api:get-performance handler:', error)
        return reply(DataCode.ERROR, {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })

    /**
     * Check for plugin updates from market (manual trigger)
     * Uses the scheduler to check by install source
     */
    touchChannel.regChannel(ChannelType.MAIN, 'market:check-updates', async ({ reply }) => {
      try {
        const updates = await triggerUpdateCheck()
        return reply(DataCode.SUCCESS, {
          updates,
          checkedAt: new Date().toISOString(),
        })
      }
      catch (error) {
        console.error('Error in market:check-updates handler:', error)
        return reply(DataCode.ERROR, {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    })

    /**
     * Search plugins in the market (NPM + TPEX)
     */
    touchChannel.regChannel(ChannelType.MAIN, 'market:search', async ({ data, reply }) => {
      try {
        const { searchPlugins } = await import('../../service/plugin-market.service')
        const result = await searchPlugins({
          keyword: data?.keyword,
          source: data?.source,
          category: data?.category,
          limit: data?.limit,
          offset: data?.offset,
        })
        return reply(DataCode.SUCCESS, result)
      }
      catch (error: any) {
        console.error('Market search failed:', error)
        return reply(DataCode.ERROR, {
          error: error?.message ?? 'MARKET_SEARCH_FAILED',
        })
      }
    })

    /**
     * Get plugin details from market
     */
    touchChannel.regChannel(ChannelType.MAIN, 'market:get-plugin', async ({ data, reply }) => {
      try {
        const { getPluginDetails } = await import('../../service/plugin-market.service')
        const plugin = await getPluginDetails(data?.identifier, data?.source)
        if (plugin) {
          return reply(DataCode.SUCCESS, plugin)
        }
        return reply(DataCode.ERROR, { error: 'Plugin not found' })
      }
      catch (error: any) {
        console.error('Get plugin details failed:', error)
        return reply(DataCode.ERROR, {
          error: error?.message ?? 'GET_PLUGIN_FAILED',
        })
      }
    })

    /**
     * Get featured plugins from market
     */
    touchChannel.regChannel(ChannelType.MAIN, 'market:featured', async ({ data, reply }) => {
      try {
        const { getFeaturedPlugins } = await import('../../service/plugin-market.service')
        const plugins = await getFeaturedPlugins(data?.limit)
        return reply(DataCode.SUCCESS, { plugins })
      }
      catch (error: any) {
        console.error('Get featured plugins failed:', error)
        return reply(DataCode.ERROR, {
          error: error?.message ?? 'GET_FEATURED_FAILED',
        })
      }
    })

    /**
     * List plugins from NPM
     */
    touchChannel.regChannel(ChannelType.MAIN, 'market:npm-list', async ({ reply }) => {
      try {
        const { listNpmPlugins } = await import('../../service/plugin-market.service')
        const plugins = await listNpmPlugins()
        return reply(DataCode.SUCCESS, { plugins })
      }
      catch (error: any) {
        console.error('List NPM plugins failed:', error)
        return reply(DataCode.ERROR, {
          error: error?.message ?? 'NPM_LIST_FAILED',
        })
      }
    })
  }
}

const pluginModule = new PluginModule()

export { pluginModule }
