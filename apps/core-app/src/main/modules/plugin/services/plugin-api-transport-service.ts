import type { IPluginManager, ITouchPlugin } from '@talex-touch/utils/plugin'
import type { PluginPerformanceGetPathsResponse } from '@talex-touch/utils/transport/events/types'
import type { ITuffTransportMain } from '@talex-touch/utils/transport/main'
import path from 'node:path'
import { PluginStatus } from '@talex-touch/utils/plugin'
import { PluginEvents } from '@talex-touch/utils/transport/events'
import { defineRawEvent } from '@talex-touch/utils/transport/event/builder'
import { app, shell } from 'electron'
import fse from 'fs-extra'
import { getOfficialPlugins } from '../../../service/official-plugin.service'
import { useAliveTarget, useAliveWebContents } from '../../../hooks/use-electron-guard'
import { viewCacheManager } from '../../box-tool/core-box/view-cache'
import { installPluginContentPackageToLocalPlugin } from '../plugin-content-installer'
import { TouchPlugin } from '../plugin'
import { mergePackagedManifestMetadata } from '../plugin-runtime-integrity'
import { pluginRuntimeTracker } from '../runtime/plugin-runtime-tracker'
import { widgetManager } from '../widget/widget-manager'
import type { PluginInstallQueue } from '../install-queue'
import type { DevServerHealthMonitor } from '../dev-server-monitor'

type TransportDisposer = () => void
const WIDGET_ROOT_DIR = 'widgets'
const WIDGET_ALLOWED_EXTENSIONS = new Set(['.vue', '.tsx', '.jsx', '.ts', '.js'])

export interface PluginApiTransportContext {
  manager: IPluginManager
  transport: ITuffTransportMain
  installQueue?: PluginInstallQueue
  healthMonitor?: DevServerHealthMonitor
  getPluginRuntimeLogsPath: (plugin: TouchPlugin) => string
  buildPluginFileTree: (rootPath: string) => Promise<unknown>
  isRecord: (value: unknown) => value is Record<string, unknown>
  logHandlerError: (handler: string, error: unknown) => void
  toErrorMessage: (error: unknown) => string
}

/** Registers plugin API, dev-server, content, performance, and store transport handlers. */
export function registerPluginApiTransportHandlers(
  context: PluginApiTransportContext
): TransportDisposer[] {
  const {
    manager,
    transport,
    installQueue: pluginInstallQueue,
    healthMonitor,
    getPluginRuntimeLogsPath,
    buildPluginFileTree,
    isRecord,
    logHandlerError: logIpcHandlerError,
    toErrorMessage
  } = context
  const disposers: TransportDisposer[] = []

  const resolveWidgetTarget = (
    pluginPath: string,
    widgetPath: string
  ): { absolutePath: string; relativePath: string } | { error: string } => {
    const trimmed = widgetPath.trim()
    if (!trimmed) {
      return { error: 'Widget path is required' }
    }

    const normalized = trimmed.replace(/\\/g, '/').replace(/^\/+/, '')
    const withoutRoot = normalized.replace(/^widgets\//, '')
    if (!withoutRoot || withoutRoot.split('/').some((segment) => segment === '..')) {
      return { error: 'Widget path is invalid' }
    }

    const widgetsDir = path.resolve(pluginPath, WIDGET_ROOT_DIR)
    const candidate = path.resolve(widgetsDir, withoutRoot)
    const relative = path.relative(widgetsDir, candidate)
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return { error: 'Widget path is outside widgets directory' }
    }

    const finalPath = path.extname(candidate) ? candidate : `${candidate}.vue`
    const ext = path.extname(finalPath)
    if (!WIDGET_ALLOWED_EXTENSIONS.has(ext)) {
      return { error: `Unsupported widget file type: ${ext}` }
    }

    return {
      absolutePath: finalPath,
      relativePath: path.relative(widgetsDir, finalPath).split(path.sep).join('/')
    }
  }

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

  disposers.push(
    transport.on(PluginEvents.performance.getMetrics, async (_payload, context) => {
      try {
        const resolved = resolveTouchPlugin({}, context)
        if ('error' in resolved) {
          return { error: resolved.error }
        }
        return resolved.plugin.getPerformanceMetrics()
      } catch (error) {
        logIpcHandlerError('plugin:performance:get-metrics', error)
        return { error: toErrorMessage(error) }
      }
    })
  )

  disposers.push(
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
          logsPath: getPluginRuntimeLogsPath(resolved.plugin),
          tempPath: resolved.plugin.getTempPath()
        } satisfies PluginPerformanceGetPathsResponse
      } catch (error) {
        logIpcHandlerError('plugin:performance:get-paths', error)
        throw error instanceof Error ? error : new Error('Unknown error')
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.devServer.reconnect, async (payload) => {
      try {
        const pluginName = payload?.pluginName
        if (!pluginName) {
          return { success: false, error: 'Plugin name is required' }
        }
        const success = (await healthMonitor?.reconnectDevServer(pluginName)) || false
        return { success }
      } catch (error) {
        logIpcHandlerError('plugin:reconnect-dev-server', error)
        return { success: false, error: toErrorMessage(error) }
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.devServer.status, async (payload) => {
      try {
        const pluginName = payload?.pluginName
        if (!pluginName) {
          return { monitoring: false, connected: false, error: 'Plugin name is required' }
        }

        return (
          healthMonitor?.getStatus(pluginName) || {
            monitoring: false,
            connected: false
          }
        )
      } catch (error) {
        logIpcHandlerError('plugin:dev-server-status', error)
        return {
          monitoring: false,
          connected: false,
          error: toErrorMessage(error)
        }
      }
    })
  )

  manager.plugins.forEach((plugin) => {
    if (plugin.status === PluginStatus.ENABLED && plugin.dev.enable && plugin.dev.source) {
      healthMonitor?.startMonitoring(plugin)
    }
  })

  const readInstallSource = async (pluginName: string): Promise<unknown | null> => {
    try {
      const sourceData = await manager.dbUtils.getPluginData(pluginName, 'install_source')
      const raw = sourceData?.value
      if (typeof raw !== 'string' || raw.trim().length === 0) {
        return null
      }
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  const serializePluginWithInstallSource = async (
    plugin: TouchPlugin
  ): Promise<ITouchPlugin & { installSource?: unknown | null }> => {
    const base = plugin.toJSONObject() as ITouchPlugin & { installSource?: unknown | null }
    base.installSource = await readInstallSource(plugin.name)
    return base
  }

  disposers.push(
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

        return await Promise.all(plugins.map((plugin) => serializePluginWithInstallSource(plugin)))
      } catch (error) {
        logIpcHandlerError('plugin:api:list', error)
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
        if (!plugin) {
          return null
        }

        return await serializePluginWithInstallSource(plugin)
      } catch (error) {
        logIpcHandlerError('plugin:api:get', error)
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
        logIpcHandlerError('plugin:api:get-status', error)
        return -1
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.content.install, async (payload) => {
      try {
        return installPluginContentPackageToLocalPlugin(
          {
            getPluginByName: (name) => manager.getPluginByName(name) as TouchPlugin | undefined
          },
          payload
        )
      } catch (error) {
        logIpcHandlerError('plugin-content:install', error)
        return { success: false, error: toErrorMessage(error) }
      }
    }),

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
        logIpcHandlerError('plugin:api:enable', error)
        return { success: false, error: toErrorMessage(error) }
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
        logIpcHandlerError('plugin:api:disable', error)
        return { success: false, error: toErrorMessage(error) }
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
        logIpcHandlerError('plugin:api:reload', error)
        return { success: false, error: toErrorMessage(error) }
      }
    }),

    transport.on(PluginEvents.api.install, async (request) => {
      if (!pluginInstallQueue) {
        return { success: false, error: 'Install queue is not ready' }
      }

      if (!request || typeof request.source !== 'string' || request.source.trim().length === 0) {
        return { success: false, error: 'Invalid install request' }
      }

      const result = await pluginInstallQueue.enqueue(request)
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
        logIpcHandlerError('plugin:api:uninstall', error)
        return { success: false, error: toErrorMessage(error) }
      }
    })
  )

  disposers.push(
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
        logIpcHandlerError('plugin:api:trigger-feature', error)
        return { error: toErrorMessage(error) }
      }
    }),

    transport.on(PluginEvents.api.registerWidget, async (payload) => {
      try {
        const pluginName = payload?.plugin
        const featureId = payload?.feature
        if (!pluginName || !featureId) {
          return { success: false, error: 'Plugin name and feature ID are required' }
        }

        const pluginIns = manager.plugins.get(pluginName)
        if (!pluginIns) {
          return { success: false, error: `Plugin ${pluginName} not found` }
        }

        const feature = pluginIns.getFeature(featureId)
        if (!feature) {
          return {
            success: false,
            error: `Feature ${featureId} not found in plugin ${pluginName}`
          }
        }

        if (feature.interaction?.type !== 'widget' || !feature.interaction?.path) {
          return { success: false, error: 'Feature does not have a widget interaction' }
        }

        const registration = await widgetManager.registerWidget(pluginIns, feature, {
          emitAsUpdate: payload?.emitAsUpdate
        })
        if (!registration) {
          return { success: false, error: 'WIDGET_REGISTER_FAILED' }
        }
        return { success: true }
      } catch (error) {
        logIpcHandlerError('plugin:api:register-widget', error)
        return { success: false, error: toErrorMessage(error) }
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
        logIpcHandlerError('plugin:api:feature-input-changed', error)
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
        logIpcHandlerError('plugin:api:open-folder', error)
      }
    }),

    transport.on(PluginEvents.api.getOfficialList, async (payload) => {
      try {
        return await getOfficialPlugins({ force: Boolean(payload?.force) })
      } catch (error: unknown) {
        logIpcHandlerError('plugin:api:get-official-list', error)
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
  disposers.push(
    transport.on(PluginEvents.api.getManifest, async (payload) => {
      try {
        const name = payload?.name
        if (!name) {
          return null
        }

        const plugin = manager.getPluginByName(name) as TouchPlugin
        if (!plugin) {
          return null
        }

        const manifestPath = path.resolve(plugin.pluginPath, 'manifest.json')
        if (!fse.existsSync(manifestPath)) {
          return null
        }

        return fse.readJSONSync(manifestPath)
      } catch (error) {
        logIpcHandlerError('plugin:api:get-manifest', error)
        return null
      }
    })
  )

  /**
   * Save plugin manifest.json and optionally reload
   */
  disposers.push(
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

        const plugin = manager.getPluginByName(name) as TouchPlugin
        if (!plugin) {
          return { success: false, error: `Plugin ${name} not found` }
        }

        const manifestPath = path.resolve(plugin.pluginPath, 'manifest.json')
        const currentManifest = fse.existsSync(manifestPath) ? fse.readJSONSync(manifestPath) : null
        const nextManifest = mergePackagedManifestMetadata(currentManifest, manifest)
        fse.writeJSONSync(manifestPath, nextManifest, { spaces: 2 })

        if (shouldReload) {
          await manager.reloadPlugin(name)
        }

        return { success: true }
      } catch (error) {
        logIpcHandlerError('plugin:api:save-manifest', error)
        return { success: false, error: toErrorMessage(error) }
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.api.saveWidgetFile, async (payload) => {
      try {
        const name = payload?.name
        const widgetPath = payload?.widgetPath
        const source = payload?.source
        const overwrite = payload?.overwrite !== false

        if (!name) {
          return { success: false, error: 'Plugin name is required' }
        }
        if (typeof widgetPath !== 'string') {
          return { success: false, error: 'Widget path is required' }
        }
        if (typeof source !== 'string') {
          return { success: false, error: 'Widget source is required' }
        }

        const plugin = manager.getPluginByName(name) as TouchPlugin
        if (!plugin) {
          return { success: false, error: `Plugin ${name} not found` }
        }

        if (!plugin.dev?.enable) {
          return { success: false, error: 'Widget editing is only available in dev mode' }
        }

        const resolved = resolveWidgetTarget(plugin.pluginPath, widgetPath)
        if ('error' in resolved) {
          return { success: false, error: resolved.error }
        }

        if (!overwrite && fse.existsSync(resolved.absolutePath)) {
          return { success: false, error: 'Widget file already exists' }
        }

        fse.ensureDirSync(path.dirname(resolved.absolutePath))
        fse.writeFileSync(resolved.absolutePath, source, 'utf-8')

        if (plugin.dev?.enable && !plugin.dev?.source) {
          await manager.reloadPlugin(plugin.name)
        }

        return { success: true, relativePath: resolved.relativePath }
      } catch (error) {
        logIpcHandlerError('plugin:api:save-widget-file', error)
        return { success: false, error: toErrorMessage(error) }
      }
    })
  )

  /**
   * Get plugin paths (pluginPath, dataPath, configPath, logsPath)
   */
  disposers.push(
    transport.on(PluginEvents.api.getPaths, async (payload) => {
      try {
        const name = payload?.name
        if (!name) {
          throw new Error('Plugin name is required')
        }

        const plugin = manager.getPluginByName(name) as TouchPlugin
        if (!plugin) {
          throw new Error(`Plugin ${name} not found`)
        }

        return {
          pluginPath: plugin.pluginPath,
          dataPath: plugin.getDataPath(),
          configPath: plugin.getConfigPath(),
          logsPath: getPluginRuntimeLogsPath(plugin),
          tempPath: plugin.getTempPath()
        }
      } catch (error) {
        logIpcHandlerError('plugin:api:get-paths', error)
        throw error
      }
    })
  )

  disposers.push(
    transport.on(PluginEvents.api.getFileTree, async (payload) => {
      try {
        const name = payload?.name
        if (!name) return []

        const plugin = manager.getPluginByName(name) as TouchPlugin
        if (!plugin) return []

        return await buildPluginFileTree(plugin.pluginPath)
      } catch (error) {
        logIpcHandlerError('plugin:api:get-file-tree', error)
        return []
      }
    })
  )

  /**
   * Open a specific plugin path in file explorer
   */
  disposers.push(
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

        const plugin = manager.getPluginByName(name) as TouchPlugin
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
            targetPath = getPluginRuntimeLogsPath(plugin)
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
        logIpcHandlerError('plugin:api:open-path', error)
        return { success: false, error: toErrorMessage(error) }
      }
    })
  )

  /**
   * Reveal a specific plugin file in file explorer
   */
  disposers.push(
    transport.on(PluginEvents.api.revealPath, async (payload) => {
      try {
        const name = payload?.name
        const targetPath = payload?.path
        if (!name) {
          return { success: false, error: 'Plugin name is required' }
        }
        if (!targetPath) {
          return { success: false, error: 'Path is required' }
        }

        const plugin = manager.getPluginByName(name) as TouchPlugin
        if (!plugin) {
          return { success: false, error: `Plugin ${name} not found` }
        }

        const resolvedTarget = path.resolve(targetPath)
        const allowedRoots = [
          plugin.pluginPath,
          plugin.getDataPath(),
          plugin.getConfigPath(),
          getPluginRuntimeLogsPath(plugin),
          plugin.getLogsPath(),
          plugin.getTempPath()
        ].map((root) => path.resolve(root))

        const isAllowed = allowedRoots.some(
          (root) => resolvedTarget === root || resolvedTarget.startsWith(`${root}${path.sep}`)
        )

        if (!isAllowed) {
          return { success: false, error: 'Path is not allowed' }
        }

        if (!(await fse.pathExists(resolvedTarget))) {
          return { success: false, error: 'Path does not exist' }
        }

        shell.showItemInFolder(resolvedTarget)
        return { success: true, path: resolvedTarget }
      } catch (error) {
        logIpcHandlerError('plugin:api:reveal-path', error)
        return { success: false, error: toErrorMessage(error) }
      }
    })
  )

  /**
   * Get plugin performance metrics
   */
  disposers.push(
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
        logIpcHandlerError('plugin:api:get-performance', error)
        return { error: toErrorMessage(error) }
      }
    })
  )

  /**
   * Get plugin runtime stats (workers/memory/uptime)
   */
  disposers.push(
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
          if (!isRecord(view)) return null
          return useAliveWebContents(view as { webContents?: Electron.WebContents | null })
        }

        for (const win of plugin._windows.values()) {
          const webContents = useAliveWebContents(win.window)
          if (!webContents) continue
          webContentsList.push(webContents)
        }

        for (const view of cachedViews) {
          const webContents = getViewWebContents(view)
          if (!webContents) continue
          webContentsList.push(webContents)
        }

        let divisionBoxViewCount = 0
        try {
          // Dynamic to avoid the DivisionBox ↔ plugin runtime initialization cycle.
          const { DivisionBoxManager } = await import('../../division-box/manager')
          const divisionBoxManager = DivisionBoxManager.getInstance()
          const sessions = divisionBoxManager.getActiveSessions()
          for (const session of sessions) {
            const attached = session.getAttachedPlugin()
            if (attached?.name !== name) continue
            const view = session.getUIView()
            const webContents = getViewWebContents(view)
            if (!webContents) continue
            divisionBoxViewCount += 1
            webContentsList.push(webContents)
          }
        } catch {
          // ignore: DivisionBox is optional for plugins
        }

        const webContentsMap = new Map<number, Electron.WebContents>()
        for (const webContents of webContentsList) {
          if (!useAliveTarget(webContents)) continue
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

          const workingSetSizeKb = (metric as unknown as { memory?: { workingSetSize?: unknown } })
            .memory?.workingSetSize
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
        logIpcHandlerError('plugin:api:get-runtime-stats', error)
        return { error: toErrorMessage(error) }
      }
    })
  )

  /**
   * Open developer tools for every live webContents owned by a plugin
   * (plugin windows + cached CoreBox UI views). Returns whether devtools were
   * newly opened for at least one target.
   */
  disposers.push(
    transport.on(defineRawEvent<string, boolean>('plugin:open-devtools'), async (pluginName) => {
      try {
        if (typeof pluginName !== 'string' || pluginName.length === 0) {
          return false
        }

        const plugin = manager.getPluginByName(pluginName) as TouchPlugin | undefined
        if (!plugin) {
          return false
        }

        const webContentsList: Electron.WebContents[] = []

        for (const win of plugin._windows.values()) {
          const webContents = useAliveWebContents(win.window)
          if (!webContents) continue
          webContentsList.push(webContents)
        }

        for (const view of viewCacheManager.getCachedViewsByPlugin(pluginName)) {
          const webContents = useAliveWebContents(
            view as { webContents?: Electron.WebContents | null }
          )
          if (!webContents) continue
          webContentsList.push(webContents)
        }

        if (webContentsList.length === 0) {
          return false
        }

        let opened = false
        for (const webContents of webContentsList) {
          if (!webContents.isDevToolsOpened()) {
            webContents.openDevTools({ mode: 'detach' })
            opened = true
          }
        }

        return opened
      } catch (error) {
        logIpcHandlerError('plugin:open-devtools', error)
        return false
      }
    })
  )

  return disposers
}
