/**
 * Plugin SDK - RPC style interface for plugin management
 *
 * @description
 * Provides a unified SDK for plugin operations with reactive state management
 */

import type { ITouchPlugin } from '@talex-touch/utils'
import type { PluginProviderType } from '@talex-touch/utils/plugin/providers/types'
import type {
  InputChangedRequest,
  PluginFilters,
  PluginStateEvent,
  RegisterWidgetRequest,
  TriggerFeatureRequest
} from '@talex-touch/utils/plugin/sdk/types'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { tryUseChannel } from '@talex-touch/utils/renderer'
import { useTuffTransport } from '@talex-touch/utils/transport'
import { createPluginSdk } from '@talex-touch/utils/transport/sdk/domains/plugin'

type PluginStateCallback = (event: PluginStateEvent) => void
type PluginCallback = (plugin: ITouchPlugin) => void

const transport = useTuffTransport()
const pluginTransportSdk = createPluginSdk(transport)
const pollingService = PollingService.getInstance()

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

class PluginSDK {
  private subscribers: Set<PluginStateCallback> = new Set()
  private pluginSubscribers: Map<string, Set<PluginCallback>> = new Map()
  private initialized = false
  private initRetryTaskId: string | null = null
  private transportDisposers: Array<() => void> = []

  constructor() {
    this.initializeEventListener()
  }

  /**
   * Initialize the global state change event listener
   */
  private initializeEventListener(): void {
    if (this.initialized) return

    if (!tryUseChannel()) {
      this.scheduleEventListenerInit()
      return
    }

    this.transportDisposers.push(
      pluginTransportSdk.onStateChanged((event) => {
        this.subscribers.forEach((callback) => {
          try {
            callback(event)
          } catch (error) {
            console.error('[PluginSDK] Error in state change subscriber:', error)
          }
        })

        if (
          event.type === 'added' ||
          event.type === 'updated' ||
          event.type === 'status-changed' ||
          event.type === 'readme-updated'
        ) {
          const pluginName = event.type === 'added' ? event.plugin.name : event.name
          const callbacks = this.pluginSubscribers.get(pluginName)

          if (callbacks && callbacks.size > 0) {
            this.get(pluginName)
              .then((plugin) => {
                if (plugin) {
                  callbacks.forEach((callback) => {
                    try {
                      callback(plugin)
                    } catch (error) {
                      console.error('[PluginSDK] Error in plugin-specific subscriber:', error)
                    }
                  })
                }
              })
              .catch((error) => {
                console.error('[PluginSDK] Failed to fetch plugin data for subscribers:', error)
              })
          }
        }
      })
    )

    this.transportDisposers.push(
      pluginTransportSdk.onStatusUpdated(({ plugin: pluginName, status }) => {
        const event: PluginStateEvent = {
          type: 'status-changed',
          name: pluginName,
          status
        }

        this.subscribers.forEach((callback) => {
          try {
            callback(event)
          } catch (error) {
            console.error('[PluginSDK] Error in status update subscriber:', error)
          }
        })

        const callbacks = this.pluginSubscribers.get(pluginName)
        if (callbacks && callbacks.size > 0) {
          this.get(pluginName)
            .then((plugin) => {
              if (plugin) {
                callbacks.forEach((callback) => {
                  try {
                    callback(plugin)
                  } catch (error) {
                    console.error('[PluginSDK] Error in plugin-specific status subscriber:', error)
                  }
                })
              }
            })
            .catch((error) => {
              console.error(
                '[PluginSDK] Failed to fetch plugin data for status subscribers:',
                error
              )
            })
        }
      })
    )

    this.initialized = true
  }

  private scheduleEventListenerInit(): void {
    if (this.initRetryTaskId) return

    const taskId = `plugin-sdk.channel-check.${Date.now()}`
    this.initRetryTaskId = taskId

    pollingService.register(
      taskId,
      () => {
        if (this.initialized) {
          pollingService.unregister(taskId)
          this.initRetryTaskId = null
          return
        }
        if (tryUseChannel()) {
          pollingService.unregister(taskId)
          this.initRetryTaskId = null
          this.initializeEventListener()
        }
      },
      { interval: 100, unit: 'milliseconds' }
    )
    pollingService.start()

    setTimeout(() => {
      if (this.initRetryTaskId === taskId) {
        pollingService.unregister(taskId)
        this.initRetryTaskId = null
      }
    }, 5000)
  }

  // ============================================
  // Query APIs
  // ============================================

  /**
   * Get list of all plugins with optional filters
   */
  async list(filters?: PluginFilters): Promise<ITouchPlugin[]> {
    try {
      return await pluginTransportSdk.list({ filters })
    } catch (error) {
      console.error('[PluginSDK] Failed to list plugins:', error)
      return []
    }
  }

  /**
   * Get a specific plugin by name
   */
  async get(name: string): Promise<ITouchPlugin | null> {
    try {
      return await pluginTransportSdk.get({ name })
    } catch (error) {
      console.error('[PluginSDK] Failed to get plugin:', error)
      return null
    }
  }

  /**
   * Get plugin status by name
   */
  async getStatus(name: string): Promise<number> {
    try {
      return await pluginTransportSdk.getStatus({ name })
    } catch (error) {
      console.error('[PluginSDK] Failed to get plugin status:', error)
      throw error
    }
  }

  // ============================================
  // Operation APIs
  // ============================================

  /**
   * Enable a plugin
   */
  async enable(name: string): Promise<boolean> {
    try {
      const response = await pluginTransportSdk.enable({ name })
      return response?.success || false
    } catch (error) {
      console.error('[PluginSDK] Failed to enable plugin:', error)
      return false
    }
  }

  /**
   * Disable a plugin
   */
  async disable(name: string): Promise<boolean> {
    try {
      const response = await pluginTransportSdk.disable({ name })
      return response?.success || false
    } catch (error) {
      console.error('[PluginSDK] Failed to disable plugin:', error)
      return false
    }
  }

  /**
   * Reload a plugin
   */
  async reload(name: string): Promise<boolean> {
    try {
      const response = await pluginTransportSdk.reload({ name })
      return response?.success || false
    } catch (error) {
      console.error('[PluginSDK] Failed to reload plugin:', error)
      return false
    }
  }

  /**
   * Reconnect to dev server for a plugin
   */
  async reconnectDevServer(name: string): Promise<boolean> {
    try {
      const response = await pluginTransportSdk.reconnectDevServer({ pluginName: name })
      return response?.success || false
    } catch (error) {
      console.error('[PluginSDK] Failed to reconnect dev server:', error)
      return false
    }
  }

  // ============================================
  // Install/Uninstall APIs
  // ============================================

  /**
   * Install a plugin from source
   * @param source - Plugin source URL or path
   * @param options - Install options
   * @returns Success status
   */
  async install(
    source: string,
    options?: {
      hintType?: string
      metadata?: Record<string, unknown>
      clientMetadata?: Record<string, unknown>
    }
  ): Promise<boolean> {
    try {
      const hintType = options?.hintType
      const normalizedHintType =
        hintType === 'github' ||
        hintType === 'npm' ||
        hintType === 'tpex' ||
        hintType === 'file' ||
        hintType === 'dev'
          ? (hintType as PluginProviderType)
          : undefined

      const response = await pluginTransportSdk.install({
        source,
        hintType: normalizedHintType,
        metadata: options?.metadata,
        clientMetadata: options?.clientMetadata
      })
      return response?.success || false
    } catch (error) {
      console.error('[PluginSDK] Failed to install plugin:', error)
      return false
    }
  }

  /**
   * Uninstall a plugin
   */
  async uninstall(name: string): Promise<boolean> {
    try {
      const response = await pluginTransportSdk.uninstall({ name })
      return response?.success || false
    } catch (error) {
      console.error('[PluginSDK] Failed to uninstall plugin:', error)
      return false
    }
  }

  // ============================================
  // Feature APIs
  // ============================================

  /**
   * Trigger a plugin feature
   * @param request - Feature trigger request
   * @returns Response from the feature
   */
  async triggerFeature(request: TriggerFeatureRequest): Promise<unknown> {
    try {
      return await pluginTransportSdk.triggerFeature(request)
    } catch (error) {
      console.error('[PluginSDK] Failed to trigger feature:', error)
      throw error
    }
  }

  /**
   * Register a widget renderer for preview or rendering
   */
  async registerWidget(request: RegisterWidgetRequest): Promise<boolean> {
    try {
      const response = await pluginTransportSdk.registerWidget(request)
      return response?.success || false
    } catch (error) {
      console.error('[PluginSDK] Failed to register widget:', error)
      return false
    }
  }

  /**
   * Handle input changed event for a feature
   */
  async onInputChanged(request: InputChangedRequest): Promise<void> {
    try {
      await pluginTransportSdk.featureInputChanged(request)
    } catch (error) {
      console.error('[PluginSDK] Failed to handle input changed:', error)
    }
  }

  // ============================================
  // System APIs
  // ============================================

  /**
   * Open plugin folder in file explorer
   */
  async openFolder(name: string): Promise<void> {
    try {
      await pluginTransportSdk.openFolder({ name })
    } catch (error) {
      console.error('[PluginSDK] Failed to open plugin folder:', error)
      throw error
    }
  }

  /**
   * Get official plugin list
   * @param force - Force refresh the list
   * @returns Official plugin list
   */
  async getOfficialList(force = false): Promise<unknown[]> {
    try {
      const response = await pluginTransportSdk.getOfficialList({ force })
      return response?.plugins || []
    } catch (error) {
      console.error('[PluginSDK] Failed to get official plugin list:', error)
      return []
    }
  }

  // ============================================
  // Plugin Details APIs (for PluginInfo page)
  // ============================================

  /**
   * Get plugin manifest.json content
   * @param name - Plugin name
   * @returns Manifest object
   */
  async getManifest(name: string): Promise<Record<string, unknown> | null> {
    try {
      return await pluginTransportSdk.getManifest({ name })
    } catch (error) {
      console.error('[PluginSDK] Failed to get plugin manifest:', error)
      return null
    }
  }

  /**
   * Save plugin manifest.json and optionally reload
   * @param name - Plugin name
   * @param manifest - Manifest content to save
   * @param reload - Whether to reload the plugin after saving (default: true)
   * @returns Success status
   */
  async saveManifest(
    name: string,
    manifest: Record<string, unknown>,
    reload = true
  ): Promise<boolean> {
    try {
      const response = await pluginTransportSdk.saveManifest({
        name,
        manifest,
        reload
      })
      return response?.success || false
    } catch (error) {
      console.error('[PluginSDK] Failed to save plugin manifest:', error)
      return false
    }
  }

  async saveWidgetFile(
    name: string,
    widgetPath: string,
    source: string,
    options?: { overwrite?: boolean }
  ): Promise<{ success: boolean; error?: string; relativePath?: string }> {
    try {
      return await pluginTransportSdk.saveWidgetFile({
        name,
        widgetPath,
        source,
        overwrite: options?.overwrite
      })
    } catch (error) {
      console.error('[PluginSDK] Failed to save widget file:', error)
      return { success: false, error: 'SAVE_WIDGET_FILE_FAILED' }
    }
  }

  /**
   * Get plugin paths (pluginPath, dataPath, configPath, logsPath, tempPath)
   * @param name - Plugin name
   * @returns Plugin paths object
   */
  async getPaths(name: string): Promise<{
    pluginPath: string
    dataPath: string
    configPath: string
    logsPath: string
    tempPath: string
  } | null> {
    try {
      return await pluginTransportSdk.getPaths({ name })
    } catch (error) {
      console.error('[PluginSDK] Failed to get plugin paths:', error)
      return null
    }
  }

  /**
   * Open a specific plugin path in file explorer
   * @param name - Plugin name
   * @param pathType - Type of path to open: 'plugin' | 'data' | 'config' | 'logs' | 'temp'
   * @returns Success status and opened path
   */
  async openPath(
    name: string,
    pathType: 'plugin' | 'data' | 'config' | 'logs' | 'temp'
  ): Promise<{ success: boolean; path?: string }> {
    try {
      const response = await pluginTransportSdk.openPath({ name, pathType })
      return response || { success: false }
    } catch (error) {
      console.error('[PluginSDK] Failed to open plugin path:', error)
      return { success: false }
    }
  }

  async revealPath(name: string, path: string): Promise<{ success: boolean; path?: string }> {
    try {
      const response = await pluginTransportSdk.revealPath({ name, path })
      return { success: response?.success ?? false, path: response?.path }
    } catch (error) {
      console.error('[PluginSDK] Failed to reveal plugin path:', error)
      return { success: false }
    }
  }

  /**
   * Get plugin performance metrics
   * @param name - Plugin name
   * @returns Performance metrics object
   */
  async getPerformance(name: string): Promise<{
    storage: {
      totalSize: number
      fileCount: number
      dirCount: number
      maxSize: number
      usagePercent: number
    }
    performance: {
      loadTime: number
      memoryUsage: number
      cpuUsage: number
      lastActiveTime: number
    }
  } | null> {
    try {
      const response = await pluginTransportSdk.getPerformance({ name })
      if (!isRecord(response)) {
        return null
      }

      const storage = response.storage
      const performance = response.performance

      if (!isRecord(storage) || !isRecord(performance)) {
        return null
      }

      if (
        !isNumber(storage.totalSize) ||
        !isNumber(storage.fileCount) ||
        !isNumber(storage.dirCount) ||
        !isNumber(storage.maxSize) ||
        !isNumber(storage.usagePercent)
      ) {
        return null
      }

      if (
        !isNumber(performance.loadTime) ||
        !isNumber(performance.memoryUsage) ||
        !isNumber(performance.cpuUsage) ||
        !isNumber(performance.lastActiveTime)
      ) {
        return null
      }

      return response as {
        storage: {
          totalSize: number
          fileCount: number
          dirCount: number
          maxSize: number
          usagePercent: number
        }
        performance: {
          loadTime: number
          memoryUsage: number
          cpuUsage: number
          lastActiveTime: number
        }
      }
    } catch (error) {
      console.error('[PluginSDK] Failed to get plugin performance:', error)
      return null
    }
  }

  /**
   * Get plugin runtime stats (workers/memory/uptime)
   * @param name - Plugin name
   */
  async getRuntimeStats(name: string): Promise<{
    startedAt: number
    uptimeMs: number
    requestCount: number
    lastActiveAt: number
    workers: {
      threadCount: number
      uiProcessCount: number
      windowCount: number
      cachedViewCount: number
      divisionBoxViewCount: number
    }
    usage: {
      memoryBytes: number
      cpuPercent: number
    }
  } | null> {
    try {
      const response = await pluginTransportSdk.getRuntimeStats({ name })
      if (!isRecord(response)) {
        return null
      }

      const workers = response.workers
      const usage = response.usage

      if (!isRecord(workers) || !isRecord(usage)) {
        return null
      }

      if (
        !isNumber(response.startedAt) ||
        !isNumber(response.uptimeMs) ||
        !isNumber(response.requestCount) ||
        !isNumber(response.lastActiveAt)
      ) {
        return null
      }

      if (
        !isNumber(workers.threadCount) ||
        !isNumber(workers.uiProcessCount) ||
        !isNumber(workers.windowCount) ||
        !isNumber(workers.cachedViewCount) ||
        !isNumber(workers.divisionBoxViewCount)
      ) {
        return null
      }

      if (!isNumber(usage.memoryBytes) || !isNumber(usage.cpuPercent)) {
        return null
      }

      return response as {
        startedAt: number
        uptimeMs: number
        requestCount: number
        lastActiveAt: number
        workers: {
          threadCount: number
          uiProcessCount: number
          windowCount: number
          cachedViewCount: number
          divisionBoxViewCount: number
        }
        usage: {
          memoryBytes: number
          cpuPercent: number
        }
      }
    } catch (error) {
      console.error('[PluginSDK] Failed to get plugin runtime stats:', error)
      return null
    }
  }

  // ============================================
  // Subscription APIs
  // ============================================

  /**
   * Subscribe to all plugin state changes
   * @returns Unsubscribe function
   */
  subscribe(callback: PluginStateCallback): () => void {
    this.initializeEventListener()
    this.subscribers.add(callback)

    return () => {
      this.subscribers.delete(callback)
    }
  }

  /**
   * Subscribe to a specific plugin's state changes
   * @returns Unsubscribe function
   */
  subscribePlugin(name: string, callback: PluginCallback): () => void {
    this.initializeEventListener()
    if (!this.pluginSubscribers.has(name)) {
      this.pluginSubscribers.set(name, new Set())
    }

    const callbacks = this.pluginSubscribers.get(name)!
    callbacks.add(callback)

    return () => {
      callbacks.delete(callback)
      if (callbacks.size === 0) {
        this.pluginSubscribers.delete(name)
      }
    }
  }
}

// Export singleton instance
export const pluginSDK = new PluginSDK()
