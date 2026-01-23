import type { MaybePromise, ModuleInitContext, ModuleKey, TalexTouch } from '@talex-touch/utils'
import type {
  IManifest,
  IPluginManager,
  ITouchPlugin,
  PluginInstallConfirmResponse
} from '@talex-touch/utils/plugin'
import type {
  PluginInstallRequest,
  PluginInstallSummary
} from '@talex-touch/utils/plugin/providers'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import type {
  PluginInstallSourceResponse,
  PluginPerformanceGetPathsResponse
} from '@talex-touch/utils/transport/events/types'
import type { FSWatcher } from 'chokidar'
import type { PluginWithSource } from '../../service/market-api.service'
import { exec } from 'node:child_process'
import path from 'node:path'
import * as util from 'node:util'
import { sleep } from '@talex-touch/utils'
import { getLogger } from '@talex-touch/utils/common/logger'
import { PluginStatus } from '@talex-touch/utils/plugin'
import { getTuffTransportMain } from '@talex-touch/utils/transport/main'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import {
  CoreBoxEvents,
  MarketEvents,
  PermissionEvents,
  PluginEvents
} from '@talex-touch/utils/transport/events'
import { app, shell } from 'electron'
import fse from 'fs-extra'
import { TalexEvents, touchEventBus } from '../../core/eventbus/touch-event'
import { TouchWindow } from '../../core/touch-window'
import { TuffIconImpl } from '../../core/tuff-icon'
import { createDbUtils } from '../../db/utils'
import { internalPlugins } from '../../plugins/internal'
import { fileWatchService } from '../../service/file-watch.service'
import {
  reportPluginUninstall,
  startUpdateScheduler,
  stopUpdateScheduler,
  triggerUpdateCheck
} from '../../service/market-api.service'
import { performMarketHttpRequest } from '../../service/market-http.service'
import { getOfficialPlugins } from '../../service/official-plugin.service'
import { debounce } from '../../utils/common-util'
import { createLogger } from '../../utils/logger'
import { BaseModule } from '../abstract-base-module'
import { viewCacheManager } from '../box-tool/core-box/view-cache'
import { databaseModule } from '../database'
import { getPermissionModule } from '../permission'
import { DevServerHealthMonitor } from './dev-server-monitor'
import { PluginInstallQueue } from './install-queue'
import { TouchPlugin } from './plugin'
import { PluginInstaller } from './plugin-installer'

import { createPluginLoader } from './plugin-loaders'
import { LocalPluginProvider } from './providers/local-provider'
import { pluginRuntimeTracker } from './runtime/plugin-runtime-tracker'

const pluginLog = getLogger('plugin-system')
const pluginModuleLog = createLogger('PluginSystem')
const devWatcherLog = pluginLog.child('DevWatcher')

type IPluginManagerWithInternals = IPluginManager & {
  __installQueue?: PluginInstallQueue
  pendingPermissionPlugins?: Map<string, { pluginName: string; autoRetry: boolean }>
}

type WindowNewPayload = TalexTouch.TouchWindowConstructorOptions & {
  file?: string
  url?: string
}

interface WindowVisiblePayload {
  id: number
  visible?: boolean
}

interface WindowPropertyPayload {
  id: number
  property: {
    window?: Record<string, unknown>
    webContents?: Record<string, unknown>
  }
}

interface IndexCommunicatePayload {
  key?: string
  info?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

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
        devWatcherLog.debug('Watching dev plugin source', {
          meta: { path: plugin.pluginPath, plugin: plugin.name }
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
      devWatcherLog.debug('Stopped watching dev plugin source', {
        meta: { path: plugin.pluginPath, plugin: plugin.name }
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
        pollInterval: 50
      }
    })

    this.watcher.on(
      'change',
      debounce(async (filePath) => {
        if (typeof filePath !== 'string') {
          return
        }
        const pluginName = Array.from(this.devPlugins.values()).find(
          (p) =>
            !p.dev.source &&
            (p.pluginPath === filePath || filePath === path.join(p.pluginPath, 'manifest.json'))
        )?.name
        if (pluginName) {
          const fileName = path.basename(filePath)
          devWatcherLog.debug('Dev plugin source changed, reloading', {
            meta: { plugin: pluginName, file: filePath, fileName }
          })

          if (fileName === 'manifest.json') {
            devWatcherLog.debug('Manifest.json changed, reloading plugin with new configuration', {
              meta: { plugin: pluginName }
            })
          }

          await this.manager.reloadPlugin(pluginName)
        }
      }, 300)
    )

    devWatcherLog.debug('Started watching for dev plugin changes', {
      meta: { plugins: this.devPlugins.size }
    })
  }

  /**
   * Stop watching for file changes
   */
  stop(): void {
    if (!this.watcher) return
    void fileWatchService.close(this.watcher)
    this.watcher = null
    devWatcherLog.debug('Stopped watching for dev plugin changes')
  }
}

/**
 * Create plugin manager instance
 * @param pluginPath - Base directory for plugins
 * @returns Plugin manager instance
 */
const INTERNAL_PLUGIN_NAMES = new Set<string>()

function createPluginModuleInternal(
  pluginPath: string,
  transport: ITuffTransportMain,
  mainWindowId: number
): IPluginManager {
  const plugins: Map<string, ITouchPlugin> = new Map()
  let active: string = ''
  const enabledPlugins = new Set<string>()
  const loadingPlugins = new Set<string>()
  const reloadingPlugins = new Set<string>()
  const pendingPermissionPlugins = new Map<string, { pluginName: string; autoRetry: boolean }>()
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
        return util.inspect(arg, { depth: 3, colors: false })
      })
      .join(' ')
      .trim()
  }
  const extractError = (args: unknown[]): Error | undefined => {
    return args.find((arg) => arg instanceof Error) as Error | undefined
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
  const logModuleInfo = (...args: unknown[]): void => {
    const message = formatLogArgs(args)
    pluginModuleLog.info(message)
  }
  const pluginTag = (name: string): string => `[${name}]`

  const installer = new PluginInstaller()

  const persistInstallSourceMetadata = async ({
    request,
    manifest,
    providerResult
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
        clientMetadata: request.clientMetadata ?? null
      })
    } catch (error) {
      logWarn('Failed to save plugin source metadata', pluginTag(pluginName), error as Error)
    }
  }

  const installQueue = new PluginInstallQueue(installer, transport, mainWindowId, {
    onInstallCompleted: persistInstallSourceMetadata
  })
  const localProvider = new LocalPluginProvider(pluginPath)

  const getPluginList = (): Array<object> => {
    logDebug('getPluginList called.')
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

      logDebug(`Returning plugin list with ${list.length} item(s).`)
      return list
    } catch (error) {
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
          `Deactivating plugin ${pluginTag(active)}: ${PluginStatus[previousPlugin.status]} → ENABLED`
        )

        transport
          .sendToPlugin(active, PluginEvents.lifecycleSignal.inactive, undefined)
          .catch(() => {})

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
          `Cannot activate plugin ${pluginTag(pluginName)}: invalid status ${PluginStatus[plugin.status]} (expected ENABLED or ACTIVE)`
        )
        return false
      }

      // Avoid redundant activation
      if (active === pluginName && plugin.status === PluginStatus.ACTIVE) {
        logDebug(`Plugin ${pluginTag(pluginName)} is already active, skipping`)
        return true
      }

      logDebug(
        `Activating plugin ${pluginTag(pluginName)}: ${PluginStatus[plugin.status]} → ACTIVE`
      )

      plugin.status = PluginStatus.ACTIVE
      active = pluginName

      transport
        .sendToPlugin(pluginName, PluginEvents.lifecycleSignal.active, undefined)
        .catch(() => {})
    } else {
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

  const enablePlugin = async (
    pluginName: string,
    skipPermissionCheck = false
  ): Promise<boolean> => {
    let plugin = plugins.get(pluginName)
    if (!plugin) return false

    if (plugin.status === PluginStatus.LOAD_FAILED) {
      pluginLog.info('Attempting to enable failed plugin, reloading first', {
        meta: { plugin: pluginName }
      })

      await reloadPlugin(pluginName)

      plugin = plugins.get(pluginName)
      if (!plugin || plugin.status !== PluginStatus.DISABLED) {
        return false
      }
    }

    // Check permissions on first enable (if plugin declares permissions)
    if (!skipPermissionCheck && plugin.declaredPermissions) {
      const permModule = getPermissionModule()
      if (permModule) {
        const declared = {
          required: plugin.declaredPermissions.required || [],
          optional: plugin.declaredPermissions.optional || []
        }

        // Check if permission confirmation is needed
        if (permModule.needsPermissionConfirmation(pluginName, plugin.sdkapi, declared)) {
          const missing = permModule.getMissingPermissions(pluginName, plugin.sdkapi, declared)

          // Send permission request to renderer
          pluginLog.info(
            `Plugin ${pluginName} needs permission confirmation: ${missing.required.length} required, ${missing.optional.length} optional`
          )

          void transport
            .sendToWindow(mainWindowId, PermissionEvents.push.startupRequest, {
              pluginId: pluginName,
              pluginName: plugin.name,
              sdkapi: plugin.sdkapi,
              required: missing.required,
              optional: missing.optional,
              reasons: plugin.declaredPermissions.reasons || {}
            })
            .catch(() => {
              pluginLog.warn(`Main window not available for permission request: ${pluginName}`)
            })

          // Store for retry after permission grant
          pendingPermissionPlugins.set(pluginName, {
            pluginName: plugin.name,
            autoRetry: !skipPermissionCheck
          })

          // Block enabling until required permissions are granted
          pluginLog.info(
            `Plugin enable blocked: missing required permissions [${missing.required.join(', ')}]`,
            {
              meta: { plugin: pluginName }
            }
          )
          return false
        }
      }
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
    if (!plugin) return false

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
      logDebug('Skip reload because plugin already reloading:', pluginTag(pluginName))
      return
    }

    const plugin = plugins.get(pluginName)
    if (!plugin) {
      logError('Cannot reload plugin - not found:', pluginTag(pluginName))
      return
    }

    reloadingPlugins.add(pluginName)

    try {
      logModuleInfo('Reloading plugin', pluginTag(pluginName))

      stopHealthMonitoring(pluginName)

      const _enabled =
        plugin.status === PluginStatus.ENABLED || plugin.status === PluginStatus.ACTIVE

      if (plugin.status !== PluginStatus.LOAD_FAILED) {
        await plugin.disable()
      }

      await unloadPlugin(pluginName)

      logDebug('Waiting 0.200s before reloading plugin...', pluginTag(pluginName))
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
        logModuleInfo('Plugin reloaded successfully', pluginTag(pluginName))
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
      logDebug('Persisted enabled plugins state.')
    } catch (error) {
      logError('Failed to persist enabled plugins state:', error)
    }
  }

  const listPlugins = async (): Promise<Array<string>> => {
    return localProvider.scan()
  }

  const loadPlugin = async (pluginName: string): Promise<boolean> => {
    if (INTERNAL_PLUGIN_NAMES.has(pluginName)) {
      logDebug('Skipping disk load for internal plugin', pluginTag(pluginName))
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
          { skipDataInit: true }
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
        transport.broadcast(PluginEvents.push.stateChanged, {
          type: 'added',
          plugin: touchPlugin.toJSONObject()
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
            existingFolderForName
          )
          touchPlugin.issues.push({
            type: 'error',
            message: `Duplicate plugin '${normalizedName}' detected, already loaded in directory '${existingFolderForName}'. Please remove the duplicate plugin or modify the name and try again.`,
            source: 'manifest.json',
            code: 'DUPLICATE_PLUGIN_NAME',
            suggestion: `Ensure plugin names are unique across all plugins. Directory '${existingFolderForName}' currently uses this name.`,
            timestamp: Date.now()
          })
          touchPlugin.status = PluginStatus.LOAD_FAILED
        } else {
          pluginNameIndex.set(normalizedName, pluginName)
        }

        // After all loading attempts, set final status
        if (touchPlugin.issues.some((issue) => issue.type === 'error')) {
          touchPlugin.status = PluginStatus.LOAD_FAILED
        } else {
          touchPlugin.status = PluginStatus.DISABLED
        }

        localProvider.trackFile(path.resolve(currentPluginPath, 'README.md'))
        plugins.set(pluginName, touchPlugin)
        devWatcherInstance.addPlugin(touchPlugin)

        logDebug(
          'Plugin metadata loaded',
          pluginTag(pluginName),
          '| version:',
          touchPlugin.version,
          '| features:',
          touchPlugin.features.length,
          '| issues:',
          touchPlugin.issues.length
        )

        transport.broadcast(PluginEvents.push.stateChanged, {
          type: 'added',
          plugin: touchPlugin.toJSONObject()
        })
      } catch (error: unknown) {
        logError('Unhandled error while loading plugin', pluginTag(pluginName), error)
        const message = error instanceof Error ? error.message : 'Unknown error'
        const stack = error instanceof Error ? error.stack : undefined
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
          { skipDataInit: true }
        )
        touchPlugin.issues.push({
          type: 'error',
          message: `A fatal error occurred while creating the plugin loader: ${message}`,
          source: 'plugin-loader',
          code: 'LOADER_FATAL',
          meta: { error: stack },
          timestamp: Date.now()
        })
        touchPlugin.status = PluginStatus.LOAD_FAILED
        plugins.set(pluginName, touchPlugin)
        transport.broadcast(PluginEvents.push.stateChanged, {
          type: 'added',
          plugin: touchPlugin.toJSONObject()
        })
      }

      return true
    } finally {
      loadingPlugins.delete(pluginName)
    }
  }

  const unloadPlugin = (pluginName: string): Promise<boolean> => {
    const plugin = plugins.get(pluginName)
    if (!plugin) return Promise.resolve(false)

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
    } catch (error) {
      logWarn('Error during plugin disable in unload:', pluginTag(pluginName), error)
    }

    try {
      plugin.logger.getManager().destroy()
    } catch (error) {
      logWarn('Error destroying plugin logger:', pluginTag(pluginName), error)
    }

    plugins.delete(pluginName)
    enabledPlugins.delete(pluginName)

    logWarn('Plugin unloaded', pluginTag(pluginName))

    transport.broadcast(PluginEvents.push.stateChanged, {
      type: 'removed',
      name: pluginName
    })

    return Promise.resolve(true)
  }

  const installFromSource = async (
    request: PluginInstallRequest
  ): Promise<PluginInstallSummary> => {
    const summary = await installer.install(request)
    return summary
  }

  const resolvePluginFolderName = (identifier: string): string | undefined => {
    if (plugins.has(identifier)) return identifier
    return pluginNameIndex.get(identifier)
  }

  const uninstallPlugin = async (identifier: string): Promise<boolean> => {
    const folderName = resolvePluginFolderName(identifier)

    if (!folderName) {
      logWarn('Cannot uninstall plugin, not found:', pluginTag(identifier))
      return false
    }

    const pluginInstance = plugins.get(folderName) as TouchPlugin | undefined
    const dataDir =
      pluginInstance instanceof TouchPlugin ? path.dirname(pluginInstance.getConfigPath()) : null
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

    logModuleInfo('Plugin uninstalled successfully', pluginTag(folderName))
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

    pluginInstance.meta = { ...(pluginInstance.meta ?? {}), internal: true }

    plugins.set(pluginName, pluginInstance)
    INTERNAL_PLUGIN_NAMES.add(pluginName)

    logDebug('Internal plugin registered', pluginTag(pluginName))
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
    registerInternalPlugin
  }

  ;(managerInstance as IPluginManagerWithInternals).__installQueue = installQueue

  const devWatcherInstance: DevPluginWatcher = new DevPluginWatcher(managerInstance)
  managerInstance.devWatcher = devWatcherInstance

  const __initDevWatcher = (): void => {
    devWatcherInstance.start()
  }

  const loadPersistedState = async (): Promise<void> => {
    logModuleInfo('Attempting to load persisted plugin states...')
    try {
      const data = await dbUtils.getPluginData('internal:plugin-module', 'enabled_plugins')
      if (data && data.value) {
        const enabled = JSON.parse(data.value) as string[]
        enabledPlugins.clear()
        enabled.forEach((p) => enabledPlugins.add(p))
        logModuleInfo(
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
              logDebug('Auto-enabling plugin', pluginTag(pluginName))

              // Go through manager-level enable flow to enforce permission gating.
              await enablePlugin(pluginName)

              logDebug('Auto-enable complete', pluginTag(pluginName))
            } catch (e) {
              logError('Failed to auto-enable plugin', pluginTag(pluginName), e)
            }
          }
        }
      } else {
        logDebug('No persisted plugin state found in database.')
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

      logModuleInfo('Initializing plugin module with root:', pluginPath)

      __initDevWatcher()

      touchEventBus.on(TalexEvents.BEFORE_APP_QUIT, () => {
        void localProvider.stopWatching()
        devWatcherInstance.stop()
        logModuleInfo('Watchers closed.')
      })

      const initialPlugins = await localProvider.scan()
      if (initialPlugins.length === 0) {
        logWarn('No plugins found in directory yet.')
      } else {
        logModuleInfo(
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

          if (loadingPlugins.has(pluginName)) {
            logDebug(
              'File change received while plugin is still loading, ignoring.',
              pluginTag(pluginName),
              'file:',
              baseName
            )
            return
          }

          if (reloadingPlugins.has(pluginName)) {
            logDebug(
              'File change received while plugin is reloading, ignoring.',
              pluginTag(pluginName),
              'file:',
              baseName
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
              pluginTag(pluginName)
            )
            return
          }

          if (plugin.dev.enable) {
            logDebug(
              'Ignore disk change because plugin is running in dev mode.',
              pluginTag(pluginName)
            )
            return
          }

          logDebug(
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

            transport.broadcast(PluginEvents.push.reload, {
              source: 'disk',
              plugin: (plugin as TouchPlugin).toJSONObject()
            })

            logDebug('plugin reload event sent', pluginTag(pluginName), 'wasEnabled:', _enabled)

            if (_enabled) {
              await plugin.enable()
            }
          } else if (baseName === 'README.md') {
            plugin.readme = fse.readFileSync(_path, 'utf-8')

            transport.broadcast(PluginEvents.push.reloadReadme, {
              source: 'disk',
              plugin: pluginName,
              readme: plugin.readme
            })
            transport.broadcast(PluginEvents.push.stateChanged, {
              type: 'readme-updated',
              name: pluginName,
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
          if (!fse.existsSync(`${_path}/manifest.json`)) return
          const pluginName = path.basename(_path)

          if (pluginName.includes('.') || pluginName.includes('\\') || pluginName.includes('/')) {
            logWarn('Detected new directory with invalid plugin name, ignoring.', pluginName)
            return
          }

          logModuleInfo('Plugin directory added', pluginTag(pluginName))

          if (hasPlugin(pluginName)) {
            logDebug('Reload existing plugin after directory add', pluginTag(pluginName))
            transport.broadcast(PluginEvents.push.reload, {
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
          logModuleInfo('File watcher ready for changes.', pluginPath)
          logDebug(`Waiting for ${initialLoadPromises.length} initial plugin load operation(s)...`)
          await Promise.allSettled(initialLoadPromises)
          logModuleInfo('All initial plugins loaded.')
          await loadPersistedState()
        },
        onError: (error) => {
          logError('Watcher error occurred:', error)
        }
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
      } catch (error) {
        pluginLog.warn('Failed to create internal plugin', { error })
      }
    }
  } catch (error) {
    pluginLog.warn('Failed to register built-in internal plugins', { error })
  }
}

export class PluginModule extends BaseModule {
  pluginManager?: IPluginManager
  installQueue?: PluginInstallQueue
  healthMonitor?: DevServerHealthMonitor
  private transport: ITuffTransportMain | null = null
  private transportDisposers: Array<() => void> = []

  static key: symbol = Symbol.for('PluginModule')
  name: ModuleKey = PluginModule.key

  constructor() {
    super(PluginModule.key, {
      create: true,
      dirName: 'plugins'
    })
  }

  onInit({ file, app }: ModuleInitContext<TalexEvents>): MaybePromise<void> {
    const channel =
      (app as { channel?: unknown } | null | undefined)?.channel ??
      ($app as { channel?: unknown } | null | undefined)?.channel
    if (!channel) {
      throw new Error('[PluginModule] TouchChannel not available on app context')
    }
    const mainWindowId = (app as { window?: { window?: { id?: unknown } } } | null | undefined)
      ?.window?.window?.id
    if (typeof mainWindowId !== 'number') {
      throw new TypeError('[PluginModule] Main window id is not available')
    }

    const keyManager =
      (channel as { keyManager?: unknown } | null | undefined)?.keyManager ?? channel
    this.transport = getTuffTransportMain(channel, keyManager)

    TouchPlugin.setTransport(this.transport)

    this.pluginManager = createPluginModuleInternal(file.dirPath!, this.transport, mainWindowId)
    this.installQueue = (this.pluginManager as IPluginManagerWithInternals).__installQueue
    this.healthMonitor = new DevServerHealthMonitor(this.pluginManager)
    this.pluginManager.healthMonitor = this.healthMonitor

    // Register built-in internal plugins (e.g. internal AI)
    registerBuiltInInternalPlugins(this.pluginManager)

    // Listen for permission granted events to retry enabling plugins
    touchEventBus.on(TalexEvents.PERMISSION_GRANTED, (event) => {
      if (!isRecord(event) || typeof event.pluginId !== 'string' || event.pluginId.length === 0) {
        return
      }

      const pluginId = event.pluginId
      const manager = this.pluginManager
      if (!manager) return

      // Check if this plugin is pending permission
      const pendingPlugins = (manager as IPluginManagerWithInternals).pendingPermissionPlugins
      const pending = pendingPlugins?.get(pluginId)

      if (!pending?.autoRetry) return

      pluginLog.info(`Permission granted for ${pluginId}, retrying enable...`)

      // Remove from pending
      pendingPlugins?.delete(pluginId)

      void (async () => {
        try {
          const success = await manager.enablePlugin(pluginId)
          if (success) {
            pluginLog.info(`Successfully enabled ${pluginId} after permission grant`)
          } else {
            pluginLog.warn(`Failed to enable ${pluginId} after permission grant`)
          }
        } catch (error) {
          pluginLog.error(`Error enabling ${pluginId} after permission grant`, { error })
        }
      })()
    })
  }

  onDestroy(): MaybePromise<void> {
    for (const disposer of this.transportDisposers) {
      try {
        disposer()
      } catch {
        // ignore
      }
    }
    this.transportDisposers = []
    this.pluginManager?.plugins.forEach((plugin) => plugin.disable())
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
      if (plugin.meta?.internal) continue

      try {
        const sourceData = await manager.dbUtils.getPluginData(name, 'install_source')
        result.push({
          name,
          version: plugin.version,
          installSource: sourceData?.value ? JSON.parse(sourceData.value) : null
        })
      } catch {
        result.push({ name, version: plugin.version, installSource: null })
      }
    }

    return result
  }

  start(): MaybePromise<void> {
    const manager = this.pluginManager!
    const transport = this.transport
    if (!transport) {
      throw new Error('[PluginModule] Transport is not initialized')
    }

    // Initialize update scheduler
    startUpdateScheduler({
      checkIntervalMs: 24 * 60 * 60 * 1000, // 24 hours
      getPluginsWithSource: () => this.getPluginsWithSource(),
      onUpdatesFound: (updates) => {
        transport.broadcast(MarketEvents.push.updatesAvailable, { updates })
      }
    })
    const installQueue = this.installQueue

    this.transportDisposers.push(
      transport.on(MarketEvents.api.httpRequest, async (request) =>
        performMarketHttpRequest(request)
      ),
      transport.on(MarketEvents.api.checkUpdates, async () => {
        const updates = await triggerUpdateCheck()
        return { updates, checkedAt: new Date().toISOString() }
      }),
      transport.on(
        PluginEvents.install.source,
        async (data): Promise<PluginInstallSourceResponse> => {
          if (!installQueue) {
            return { status: 'error', error: 'Install queue is not ready' }
          }
          if (!isRecord(data) || typeof data.source !== 'string') {
            return { status: 'error', error: 'Invalid install request' }
          }
          const request: PluginInstallRequest = {
            source: data.source,
            hintType: data.hintType as PluginInstallRequest['hintType'],
            metadata: isRecord(data.metadata) ? data.metadata : undefined,
            clientMetadata: isRecord(data.clientMetadata) ? data.clientMetadata : undefined
          }
          return await installQueue.enqueue(request)
        }
      ),
      transport.on(PluginEvents.install.confirmResponse, async (response) => {
        if (!installQueue) {
          return
        }
        installQueue.handleConfirmResponse(response as PluginInstallConfirmResponse)
      }),
      transport.on(CoreBoxEvents.item.clear, async (_payload, context) => {
        const pluginName = context.plugin?.name
        if (!pluginName) {
          return
        }
        const pluginIns = manager.plugins.get(pluginName)
        if (pluginIns instanceof TouchPlugin) {
          pluginIns.clearCoreBoxItems()
        }
      })
    )

    this.transportDisposers.push(
      transport.on(
        defineRawEvent<WindowNewPayload, { id?: number; error?: string }>('window:new'),
        async (data, context) => {
          const pluginName = context.plugin?.name
          const touchPlugin = pluginName
            ? (manager.plugins.get(pluginName) as TouchPlugin)
            : undefined
          if (!touchPlugin) {
            return { error: 'Plugin not found!' }
          }

          const { file, url, ...windowOptions } = data
          const win = new TouchWindow(windowOptions)
          let webContents: Electron.WebContents
          if (typeof file === 'string' && file.length > 0) {
            webContents = await win.loadFile(file)
          } else if (typeof url === 'string' && url.length > 0) {
            webContents = await win.loadURL(url)
          } else {
            return { error: 'No file or url provided!' }
          }

          const obj = touchPlugin.__getInjections__()
          await webContents.insertCSS(obj.styles)
          await webContents.executeJavaScript(obj.js)

          webContents.send('@loaded', {
            id: webContents.id,
            plugin: pluginName,
            type: 'intend'
          })

          touchPlugin._windows.set(webContents.id, win)
          win.window.on('closed', () => {
            win.window.removeAllListeners()
            touchPlugin._windows.delete(webContents.id)
          })

          return { id: webContents.id }
        }
      ),

      transport.on(
        defineRawEvent<WindowVisiblePayload, { visible?: boolean; error?: string }>(
          'window:visible'
        ),
        async (payload, context) => {
          const pluginName = context.plugin?.name
          const touchPlugin = pluginName
            ? (manager.plugins.get(pluginName) as TouchPlugin)
            : undefined
          if (!touchPlugin) {
            return { error: 'Plugin not found!' }
          }

          const id = payload?.id
          if (typeof id !== 'number') {
            return { error: 'Window id is required' }
          }

          const win = touchPlugin._windows.get(id)
          if (!win || win.window.isDestroyed()) {
            return { error: 'Window not found' }
          }

          if (payload?.visible === undefined) {
            if (win.window.isVisible()) {
              win.window.hide()
            } else {
              win.window.show()
            }
          } else if (payload.visible) {
            win.window.show()
          } else {
            win.window.hide()
          }

          return { visible: win.window.isVisible() }
        }
      ),

      transport.on(
        defineRawEvent<WindowPropertyPayload, { success?: boolean; error?: string }>(
          'window:property'
        ),
        async (payload, context) => {
          const pluginName = context.plugin?.name
          const touchPlugin = pluginName
            ? (manager.plugins.get(pluginName) as TouchPlugin)
            : undefined
          if (!touchPlugin) {
            return { error: 'Plugin not found!' }
          }

          const id = payload?.id
          const property = payload?.property
          if (typeof id !== 'number') {
            return { error: 'Window id is required' }
          }
          if (!property) {
            return { error: 'Property is required' }
          }

          const win = touchPlugin._windows.get(id)
          if (!win || win.window.isDestroyed()) {
            return { error: 'Window not found' }
          }

          const applyProps = (target: Record<string, unknown>, props?: Record<string, unknown>) => {
            if (!props) return { success: true }
            for (const [key, value] of Object.entries(props)) {
              if (value === undefined) continue
              try {
                const current = target[key]
                if (typeof current === 'function') {
                  if (Array.isArray(value)) {
                    current(...value)
                  } else {
                    current(value)
                  }
                } else {
                  target[key] = value
                }
              } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                return { success: false, error: `Failed to set ${key}: ${message}` }
              }
            }
            return { success: true }
          }

          const windowResult = applyProps(
            win.window as unknown as Record<string, unknown>,
            property.window
          )
          if (!windowResult.success) {
            return windowResult
          }

          const webContentsResult = applyProps(
            win.window.webContents as unknown as Record<string, unknown>,
            property.webContents
          )
          if (!webContentsResult.success) {
            return webContentsResult
          }

          return { success: true }
        }
      ),

      transport.on(
        defineRawEvent<IndexCommunicatePayload, { status?: string; error?: string }>(
          'index:communicate'
        ),
        async (data, context) => {
          try {
            const pluginName = context.plugin?.name
            const key = typeof data?.key === 'string' ? data.key : ''
            const info = data?.info

            if (!pluginName || !key) {
              return { error: 'Plugin name and key are required' }
            }

            const plugin = manager.getPluginByName(pluginName) as TouchPlugin
            if (!plugin) {
              return { error: `Plugin ${pluginName} not found` }
            }

            const lifecycle = plugin.getFeatureLifeCycle?.()
            if (!lifecycle || !lifecycle.onMessage) {
              return { error: `Plugin ${pluginName} does not have onMessage handler` }
            }

            lifecycle.onMessage(key, info)
            return { status: 'message_sent' }
          } catch (error) {
            console.error('Error in index:communicate handler:', error)
            return { error: error instanceof Error ? error.message : 'Unknown error' }
          }
        }
      )
    )

    const resolveTouchPlugin = (
      payload: unknown,
      context: unknown
    ): { pluginName: string; plugin: TouchPlugin } | { error: string } => {
      const pluginNameFromContext =
        isRecord(context) && isRecord(context.plugin) && typeof context.plugin.name === 'string'
          ? context.plugin.name
          : undefined
      const pluginNameFromPayload =
        isRecord(payload) && typeof payload.pluginName === 'string' ? payload.pluginName : undefined
      const pluginName = pluginNameFromContext ?? pluginNameFromPayload
      if (!pluginName) {
        return { error: 'Plugin name is required' }
      }
      const plugin = manager.getPluginByName(pluginName) as TouchPlugin
      if (!plugin) {
        return { error: `Plugin ${pluginName} not found` }
      }
      return { pluginName, plugin }
    }

    // Plugin Storage Channel Handlers
    this.transportDisposers.push(
      transport.on(PluginEvents.storage.getFile, async (payload, context) => {
        try {
          const fileName = payload?.fileName
          if (!fileName) {
            return { error: 'fileName is required' }
          }
          const resolved = resolveTouchPlugin(payload, context)
          if ('error' in resolved) {
            return { error: resolved.error }
          }
          return resolved.plugin.getPluginFile(fileName)
        } catch (error) {
          console.error('Error in plugin:storage:get-file handler:', error)
          return { error: error instanceof Error ? error.message : 'Unknown error' }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.storage.setFile, async (payload, context) => {
        try {
          const fileName = payload?.fileName
          if (!fileName) {
            return { success: false, error: 'fileName is required' }
          }
          const resolved = resolveTouchPlugin(payload, context)
          if ('error' in resolved) {
            return { success: false, error: resolved.error }
          }
          return resolved.plugin.savePluginFile(fileName, payload?.content)
        } catch (error) {
          console.error('Error in plugin:storage:set-file handler:', error)
          return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.storage.deleteFile, async (payload, context) => {
        try {
          const fileName = payload?.fileName
          if (!fileName) {
            return { success: false, error: 'fileName is required' }
          }
          const resolved = resolveTouchPlugin(payload, context)
          if ('error' in resolved) {
            return { success: false, error: resolved.error }
          }
          return resolved.plugin.deletePluginFile(fileName)
        } catch (error) {
          console.error('Error in plugin:storage:delete-file handler:', error)
          return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.storage.listFiles, async (payload, context) => {
        try {
          const resolved = resolveTouchPlugin(payload, context)
          if ('error' in resolved) {
            return []
          }
          return resolved.plugin.listPluginFiles()
        } catch (error) {
          console.error('Error in plugin:storage:list-files handler:', error)
          return []
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.storage.getStats, async (payload, context) => {
        try {
          const resolved = resolveTouchPlugin(payload, context)
          if ('error' in resolved) {
            return { error: resolved.error }
          }
          return resolved.plugin.getStorageStats()
        } catch (error) {
          console.error('Error in plugin:storage:get-stats handler:', error)
          return { error: error instanceof Error ? error.message : 'Unknown error' }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.performance.getMetrics, async (_payload, context) => {
        try {
          const resolved = resolveTouchPlugin({}, context)
          if ('error' in resolved) {
            return { error: resolved.error }
          }
          return resolved.plugin.getPerformanceMetrics()
        } catch (error) {
          console.error('Error in plugin:performance:get-metrics handler:', error)
          return { error: error instanceof Error ? error.message : 'Unknown error' }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.performance.getPaths, async (_payload, context) => {
        try {
          const resolved = resolveTouchPlugin({}, context)
          if ('error' in resolved) {
            throw new Error(resolved.error)
          }

          return {
            pluginPath: resolved.plugin.pluginPath,
            dataPath: resolved.plugin.getDataPath(),
            configPath: resolved.plugin.getConfigPath(),
            logsPath: resolved.plugin.getLogsPath(),
            tempPath: resolved.plugin.getTempPath()
          } satisfies PluginPerformanceGetPathsResponse
        } catch (error) {
          console.error('Error in plugin:performance:get-paths handler:', error)
          throw error instanceof Error ? error : new Error('Unknown error')
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.storage.getTree, async (payload, context) => {
        try {
          const resolved = resolveTouchPlugin(payload, context)
          if ('error' in resolved) {
            return { error: resolved.error }
          }
          return resolved.plugin.getStorageTree()
        } catch (error) {
          console.error('Error in plugin:storage:get-tree handler:', error)
          return { error: error instanceof Error ? error.message : 'Unknown error' }
        }
      })
    )

    // Plugin Storage: get-file-details (support both MAIN and PLUGIN channels)
    this.transportDisposers.push(
      transport.on(PluginEvents.storage.getFileDetails, async (payload, context) => {
        try {
          const fileName = payload?.fileName
          if (!fileName) {
            return { error: 'fileName is required' }
          }
          const resolved = resolveTouchPlugin(payload, context)
          if ('error' in resolved) {
            return { error: resolved.error }
          }
          return resolved.plugin.getFileDetails(fileName)
        } catch (error) {
          console.error('Error in plugin:storage:get-file-details handler:', error)
          return { error: error instanceof Error ? error.message : 'Unknown error' }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.storage.clear, async (payload, context) => {
        try {
          const resolved = resolveTouchPlugin(payload, context)
          if ('error' in resolved) {
            return { success: false, error: resolved.error }
          }
          return resolved.plugin.clearStorage()
        } catch (error) {
          console.error('Error in plugin:storage:clear handler:', error)
          return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.storage.openFolder, async (payload, context) => {
        try {
          const resolved = resolveTouchPlugin(payload, context)
          if ('error' in resolved) {
            return
          }
          const configPath = resolved.plugin.getConfigPath()
          await shell.openPath(configPath)
        } catch (error) {
          console.error('Error in plugin:storage:open-folder handler:', error)
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.storage.openInEditor, async (payload) => {
        try {
          const pluginName = payload?.pluginName
          if (!pluginName) {
            return { success: false, error: 'Plugin name is required' }
          }

          const plugin = manager.getPluginByName(pluginName) as TouchPlugin
          if (!plugin) {
            return { success: false, error: `Plugin ${pluginName} not found` }
          }

          const configPath = plugin.getConfigPath()
          const execAsync = util.promisify(exec)

          try {
            await execAsync(`code "${configPath}"`)
          } catch {
            await shell.openPath(configPath)
          }

          return { success: true }
        } catch (error) {
          console.error('Error in plugin:storage:open-in-editor handler:', error)
          return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.devServer.reconnect, async (payload) => {
        try {
          const pluginName = payload?.pluginName
          if (!pluginName) {
            return { success: false, error: 'Plugin name is required' }
          }
          const success = (await this.healthMonitor?.reconnectDevServer(pluginName)) || false
          return { success }
        } catch (error) {
          console.error('Error in plugin:reconnect-dev-server handler:', error)
          return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.devServer.status, async (payload) => {
        try {
          const pluginName = payload?.pluginName
          if (!pluginName) {
            return { monitoring: false, connected: false, error: 'Plugin name is required' }
          }

          return (
            this.healthMonitor?.getStatus(pluginName) || {
              monitoring: false,
              connected: false
            }
          )
        } catch (error) {
          console.error('Error in plugin:dev-server-status handler:', error)
          return {
            monitoring: false,
            connected: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      })
    )

    manager.plugins.forEach((plugin) => {
      if (plugin.status === PluginStatus.ENABLED && plugin.dev.enable && plugin.dev.source) {
        this.healthMonitor?.startMonitoring(plugin)
      }
    })

    this.transportDisposers.push(
      transport.on(PluginEvents.api.list, async (payload) => {
        try {
          const filters = payload?.filters || {}
          let plugins = Array.from(manager.plugins.values()) as TouchPlugin[]

          if (filters.status !== undefined) {
            plugins = plugins.filter((p) => p.status === filters.status)
          }
          if (filters.enabled !== undefined) {
            const enabledNames = manager.enabledPlugins
            plugins = plugins.filter((p) => enabledNames.has(p.name) === filters.enabled)
          }
          if (filters.dev !== undefined) {
            plugins = plugins.filter((p) => p.dev?.enable === filters.dev)
          }

          return plugins.map((p) => p.toJSONObject())
        } catch (error) {
          console.error('Error in plugin:api:list handler:', error)
          return []
        }
      }),

      transport.on(PluginEvents.api.get, async (payload) => {
        try {
          const name = payload?.name
          if (!name) {
            return null
          }

          const plugin = manager.plugins.get(name) as TouchPlugin | undefined
          return plugin ? plugin.toJSONObject() : null
        } catch (error) {
          console.error('Error in plugin:api:get handler:', error)
          return null
        }
      }),

      transport.on(PluginEvents.api.getStatus, async (payload) => {
        try {
          const name = payload?.name
          if (!name) {
            return -1
          }

          const plugin = manager.plugins.get(name)
          return plugin ? plugin.status : -1
        } catch (error) {
          console.error('Error in plugin:api:get-status handler:', error)
          return -1
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.api.enable, async (payload) => {
        try {
          const name = payload?.name
          if (!name) {
            return { success: false, error: 'Plugin name is required' }
          }

          const success = await manager.enablePlugin(name)
          if (success) {
            const plugin = manager.plugins.get(name)
            if (plugin) {
              transport.broadcast(PluginEvents.push.stateChanged, {
                type: 'status-changed',
                name,
                status: plugin.status
              })
            }
          }
          return { success }
        } catch (error) {
          console.error('Error in plugin:api:enable handler:', error)
          return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
      }),

      transport.on(PluginEvents.api.disable, async (payload) => {
        try {
          const name = payload?.name
          if (!name) {
            return { success: false, error: 'Plugin name is required' }
          }

          const success = await manager.disablePlugin(name)
          if (success) {
            const plugin = manager.plugins.get(name)
            if (plugin) {
              transport.broadcast(PluginEvents.push.stateChanged, {
                type: 'status-changed',
                name,
                status: plugin.status
              })
            }
          }
          return { success }
        } catch (error) {
          console.error('Error in plugin:api:disable handler:', error)
          return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
      }),

      transport.on(PluginEvents.api.reload, async (payload) => {
        try {
          const name = payload?.name
          if (!name) {
            return { success: false, error: 'Plugin name is required' }
          }

          if (!manager.plugins.has(name)) {
            return { success: false, error: `Plugin ${name} not found` }
          }

          await manager.reloadPlugin(name)
          return { success: true }
        } catch (error) {
          console.error('Error in plugin:api:reload handler:', error)
          return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
      }),

      transport.on(PluginEvents.api.install, async (request) => {
        const installQueue = this.installQueue
        if (!installQueue) {
          return { success: false, error: 'Install queue is not ready' }
        }

        if (!request || typeof request.source !== 'string' || request.source.trim().length === 0) {
          return { success: false, error: 'Invalid install request' }
        }

        const result = await installQueue.enqueue(request)
        if (result?.status === 'success') {
          return { success: true }
        }
        return { success: false, error: result?.message ?? 'INSTALL_FAILED' }
      }),

      transport.on(PluginEvents.api.uninstall, async (payload) => {
        try {
          const name = payload?.name
          if (!name) {
            return { success: false, error: 'Plugin name is required' }
          }

          const success = await manager.uninstallPlugin(name)
          if (!success) {
            return { success: false, error: `Plugin ${name} not found` }
          }
          return { success: true }
        } catch (error) {
          console.error('Error in plugin:api:uninstall handler:', error)
          return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
      })
    )

    this.transportDisposers.push(
      transport.on(PluginEvents.api.triggerFeature, async (payload) => {
        try {
          const pluginName = payload?.plugin
          const featureId = payload?.feature
          const query = payload?.query
          if (!pluginName || !featureId) {
            return { error: 'Plugin name and feature ID are required' }
          }

          const pluginIns = manager.plugins.get(pluginName)
          if (!pluginIns) {
            return { error: `Plugin ${pluginName} not found` }
          }

          const feature = pluginIns.getFeature(featureId)
          if (!feature) {
            return { error: `Feature ${featureId} not found in plugin ${pluginName}` }
          }

          return pluginIns.triggerFeature(feature, query)
        } catch (error) {
          console.error('Error in plugin:api:trigger-feature handler:', error)
          return { error: error instanceof Error ? error.message : 'Unknown error' }
        }
      }),

      transport.on(PluginEvents.api.featureInputChanged, async (payload) => {
        try {
          const pluginName = payload?.plugin
          const featureId = payload?.feature
          const query = payload?.query
          if (!pluginName || !featureId) {
            return
          }

          const pluginIns = manager.plugins.get(pluginName)
          if (!pluginIns) {
            return
          }

          const feature = pluginIns.getFeature(featureId)
          if (!feature) {
            return
          }

          pluginIns.triggerInputChanged(feature, query)
        } catch (error) {
          console.error('Error in plugin:api:feature-input-changed handler:', error)
        }
      }),

      transport.on(PluginEvents.api.openFolder, async (payload) => {
        try {
          const name = payload?.name
          if (!name) {
            return
          }

          const plugin = manager.getPluginByName(name) as TouchPlugin
          if (!plugin) {
            return
          }

          await shell.openPath(plugin.pluginPath)
        } catch (error) {
          console.error('Error in plugin:api:open-folder handler:', error)
        }
      }),

      transport.on(PluginEvents.api.getOfficialList, async (payload) => {
        try {
          return await getOfficialPlugins({ force: Boolean(payload?.force) })
        } catch (error: unknown) {
          console.error('Failed to fetch official plugin list:', error)
          return { plugins: [] }
        }
      })
    )

    // ============================================
    // Plugin Details APIs (for PluginInfo page)
    // ============================================

    /**
     * Get plugin manifest.json content
     */
    this.transportDisposers.push(
      transport.on(PluginEvents.api.getManifest, async (payload) => {
        try {
          const name = payload?.name
          if (!name) {
            return null
          }

          const plugin = manager.plugins.get(name) as TouchPlugin
          if (!plugin) {
            return null
          }

          const manifestPath = path.resolve(plugin.pluginPath, 'manifest.json')
          if (!fse.existsSync(manifestPath)) {
            return null
          }

          return fse.readJSONSync(manifestPath)
        } catch (error) {
          console.error('Error in plugin:api:get-manifest handler:', error)
          return null
        }
      })
    )

    /**
     * Save plugin manifest.json and optionally reload
     */
    this.transportDisposers.push(
      transport.on(PluginEvents.api.saveManifest, async (payload) => {
        try {
          const name = payload?.name
          const manifest = payload?.manifest
          const shouldReload = payload?.reload !== false

          if (!name) {
            return { success: false, error: 'Plugin name is required' }
          }
          if (!manifest) {
            return { success: false, error: 'Manifest content is required' }
          }

          const plugin = manager.plugins.get(name) as TouchPlugin
          if (!plugin) {
            return { success: false, error: `Plugin ${name} not found` }
          }

          const manifestPath = path.resolve(plugin.pluginPath, 'manifest.json')
          fse.writeJSONSync(manifestPath, manifest, { spaces: 2 })

          if (shouldReload) {
            await manager.reloadPlugin(name)
          }

          return { success: true }
        } catch (error) {
          console.error('Error in plugin:api:save-manifest handler:', error)
          return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
      })
    )

    /**
     * Get plugin paths (pluginPath, dataPath, configPath, logsPath)
     */
    this.transportDisposers.push(
      transport.on(PluginEvents.api.getPaths, async (payload) => {
        try {
          const name = payload?.name
          if (!name) {
            throw new Error('Plugin name is required')
          }

          const plugin = manager.plugins.get(name) as TouchPlugin
          if (!plugin) {
            throw new Error(`Plugin ${name} not found`)
          }

          return {
            pluginPath: plugin.pluginPath,
            dataPath: plugin.getDataPath(),
            configPath: plugin.getConfigPath(),
            logsPath: plugin.getLogsPath(),
            tempPath: plugin.getTempPath()
          }
        } catch (error) {
          console.error('Error in plugin:api:get-paths handler:', error)
          throw error
        }
      })
    )

    /**
     * Open a specific plugin path in file explorer
     */
    this.transportDisposers.push(
      transport.on(PluginEvents.api.openPath, async (payload) => {
        try {
          const name = payload?.name
          const pathType = payload?.pathType
          if (!name) {
            return { success: false, error: 'Plugin name is required' }
          }
          if (!pathType) {
            return { success: false, error: 'Path type is required' }
          }

          const plugin = manager.plugins.get(name) as TouchPlugin
          if (!plugin) {
            return { success: false, error: `Plugin ${name} not found` }
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
              return { success: false, error: `Invalid path type: ${pathType}` }
          }

          fse.ensureDirSync(targetPath)
          await shell.openPath(targetPath)

          return { success: true, path: targetPath }
        } catch (error) {
          console.error('Error in plugin:api:open-path handler:', error)
          return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        }
      })
    )

    /**
     * Get plugin performance metrics
     */
    this.transportDisposers.push(
      transport.on(PluginEvents.api.getPerformance, async (payload) => {
        try {
          const name = payload?.name
          if (!name) {
            return { error: 'Plugin name is required' }
          }

          const plugin = manager.plugins.get(name) as TouchPlugin
          if (!plugin) {
            return { error: `Plugin ${name} not found` }
          }

          const storageStats = plugin.getStorageStats()
          const performanceMetrics = plugin.getPerformanceMetrics?.() || {
            loadTime: 0,
            memoryUsage: 0,
            cpuUsage: 0,
            lastActiveTime: 0
          }

          return {
            storage: storageStats,
            performance: performanceMetrics
          }
        } catch (error) {
          console.error('Error in plugin:api:get-performance handler:', error)
          return { error: error instanceof Error ? error.message : 'Unknown error' }
        }
      })
    )

    /**
     * Get plugin runtime stats (workers/memory/uptime)
     */
    this.transportDisposers.push(
      transport.on(PluginEvents.api.getRuntimeStats, async (payload) => {
        try {
          const name = payload?.name
          if (!name) {
            return { error: 'Plugin name is required' }
          }

          const plugin = manager.plugins.get(name) as TouchPlugin
          if (!plugin) {
            return { error: `Plugin ${name} not found` }
          }

          const now = Date.now()
          const startedAt = plugin._runtimeStats?.startedAt ?? 0
          const lastActiveAt =
            plugin._runtimeStats?.lastActiveAt ?? plugin._performanceMetrics?.lastActiveTime ?? 0

          const cachedViews = viewCacheManager.getCachedViewsByPlugin(name)
          const webContentsList: Electron.WebContents[] = []

          const getViewWebContents = (view: unknown): Electron.WebContents | null => {
            const webContents = isRecord(view) ? view.webContents : undefined
            if (!webContents) return null
            if (typeof (webContents as { isDestroyed?: unknown }).isDestroyed !== 'function')
              return null
            return webContents as Electron.WebContents
          }

          for (const win of plugin._windows.values()) {
            if (!win.window.isDestroyed()) {
              webContentsList.push(win.window.webContents)
            }
          }

          for (const view of cachedViews) {
            const webContents = getViewWebContents(view)
            if (!webContents || webContents.isDestroyed()) continue
            webContentsList.push(webContents)
          }

          let divisionBoxViewCount = 0
          try {
            const { DivisionBoxManager } = await import('../division-box/manager')
            const divisionBoxManager = DivisionBoxManager.getInstance()
            const sessions = divisionBoxManager.getActiveSessions()
            for (const session of sessions) {
              const attached = session.getAttachedPlugin()
              if (attached?.name !== name) continue
              const view = session.getUIView()
              const webContents = getViewWebContents(view)
              if (!webContents || webContents.isDestroyed()) continue
              divisionBoxViewCount += 1
              webContentsList.push(webContents)
            }
          } catch {
            // ignore: DivisionBox is optional for plugins
          }

          const webContentsMap = new Map<number, Electron.WebContents>()
          for (const webContents of webContentsList) {
            if (webContents.isDestroyed()) continue
            webContentsMap.set(webContents.id, webContents)
          }

          const webContents = Array.from(webContentsMap.values())

          const appMetrics = app.getAppMetrics()
          const metricByPid = new Map<number, Electron.ProcessMetric>()
          appMetrics.forEach((metric) => {
            metricByPid.set(metric.pid, metric as Electron.ProcessMetric)
          })

          let memoryBytes = 0
          let cpuPercent = 0
          for (const wc of webContents) {
            const getOSProcessId = (wc as unknown as { getOSProcessId?: unknown }).getOSProcessId
            const pid =
              typeof getOSProcessId === 'function' ? (getOSProcessId as () => number).call(wc) : 0
            if (!pid) continue
            const metric = metricByPid.get(pid)
            if (!metric) continue

            const workingSetSizeKb = (
              metric as unknown as { memory?: { workingSetSize?: unknown } }
            ).memory?.workingSetSize
            if (typeof workingSetSizeKb === 'number') {
              memoryBytes += workingSetSizeKb * 1024
            }

            const percentCpu = (metric as unknown as { cpu?: { percentCPUUsage?: unknown } }).cpu
              ?.percentCPUUsage
            if (typeof percentCpu === 'number') {
              cpuPercent += percentCpu
            }
          }

          return {
            startedAt,
            uptimeMs: startedAt > 0 ? now - startedAt : 0,
            requestCount: plugin._runtimeStats?.requestCount ?? 0,
            lastActiveAt,
            workers: {
              threadCount: pluginRuntimeTracker.getWorkerCount(name),
              uiProcessCount: webContents.length,
              windowCount: plugin._windows.size,
              cachedViewCount: cachedViews.length,
              divisionBoxViewCount
            },
            usage: {
              memoryBytes,
              cpuPercent
            }
          }
        } catch (error) {
          console.error('Error in plugin:api:get-runtime-stats handler:', error)
          return { error: error instanceof Error ? error.message : 'Unknown error' }
        }
      })
    )

    /**
     * Check for plugin updates from market (manual trigger)
     * Uses the scheduler to check by install source
     */
    this.transportDisposers.push(
      transport.on(MarketEvents.api.checkUpdates, async () => {
        try {
          const updates = await triggerUpdateCheck()
          return {
            updates,
            checkedAt: new Date().toISOString()
          }
        } catch (error) {
          console.error('Error in market:check-updates handler:', error)
          return { updates: [], checkedAt: new Date().toISOString() }
        }
      })
    )

    /**
     * Search plugins in the market (NPM + TPEX)
     */
    this.transportDisposers.push(
      transport.on(MarketEvents.api.search, async (payload) => {
        try {
          const { searchPlugins } = await import('../../service/plugin-market.service')
          const source =
            payload?.source === 'tpex' || payload?.source === 'npm' || payload?.source === 'all'
              ? payload.source
              : undefined
          return await searchPlugins({
            keyword: payload?.keyword,
            source,
            category: payload?.category,
            limit: payload?.limit,
            offset: payload?.offset
          })
        } catch (error: unknown) {
          console.error('Market search failed:', error)
          return { error: error instanceof Error ? error.message : 'MARKET_SEARCH_FAILED' }
        }
      })
    )

    /**
     * Get plugin details from market
     */
    this.transportDisposers.push(
      transport.on(MarketEvents.api.getPlugin, async (payload) => {
        try {
          const { getPluginDetails } = await import('../../service/plugin-market.service')
          const identifier = payload?.identifier
          if (!identifier) return null
          const source =
            payload?.source === 'tpex' || payload?.source === 'npm' ? payload.source : undefined
          const plugin = await getPluginDetails(identifier, source)
          return plugin ?? null
        } catch (error: unknown) {
          console.error('Get plugin details failed:', error)
          return null
        }
      })
    )

    /**
     * Get featured plugins from market
     */
    this.transportDisposers.push(
      transport.on(MarketEvents.api.featured, async (payload) => {
        try {
          const { getFeaturedPlugins } = await import('../../service/plugin-market.service')
          const limit =
            isRecord(payload) && typeof payload.limit === 'number' ? payload.limit : undefined
          const plugins = await getFeaturedPlugins(limit)
          return { plugins }
        } catch (error: unknown) {
          console.error('Get featured plugins failed:', error)
          return { plugins: [] }
        }
      })
    )

    /**
     * List plugins from NPM
     */
    this.transportDisposers.push(
      transport.on(MarketEvents.api.npmList, async () => {
        try {
          const { listNpmPlugins } = await import('../../service/plugin-market.service')
          const plugins = await listNpmPlugins()
          return { plugins }
        } catch (error: unknown) {
          console.error('List NPM plugins failed:', error)
          return { plugins: [] }
        }
      })
    )
  }
}

const pluginModule = new PluginModule()

export { pluginModule }
