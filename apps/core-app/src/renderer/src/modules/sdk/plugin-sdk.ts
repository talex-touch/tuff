/**
 * Plugin SDK - RPC style interface for plugin management
 *
 * @description
 * Provides a unified SDK for plugin operations with reactive state management
 */

import type { ITouchPlugin } from '@talex-touch/utils'
import type {
  InputChangedRequest,
  PluginFilters,
  PluginStateEvent,
  TriggerFeatureRequest,
} from '@talex-touch/utils/plugin/sdk/types'
import { touchChannel } from '~/modules/channel/channel-core'

type PluginStateCallback = (event: PluginStateEvent) => void
type PluginCallback = (plugin: ITouchPlugin) => void

class PluginSDK {
  private subscribers: Set<PluginStateCallback> = new Set()
  private pluginSubscribers: Map<string, Set<PluginCallback>> = new Map()
  private initialized = false

  constructor() {
    this.initializeEventListener()
  }

  /**
   * Initialize the global state change event listener
   */
  private initializeEventListener(): void {
    if (this.initialized)
      return

    touchChannel.regChannel('plugin:state-changed', (payload) => {
      const event = payload.data as PluginStateEvent

      this.subscribers.forEach((callback) => {
        try {
          callback(event)
        }
        catch (error) {
          console.error('[PluginSDK] Error in state change subscriber:', error)
        }
      })

      if (
        event.type === 'added'
        || event.type === 'updated'
        || event.type === 'status-changed'
        || event.type === 'readme-updated'
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
                  }
                  catch (error) {
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

    touchChannel.regChannel('plugin-status-updated', (payload) => {
      const { plugin: pluginName, status } = payload.data as { plugin: string, status: number }

      const event: PluginStateEvent = {
        type: 'status-changed',
        name: pluginName,
        status,
      }

      this.subscribers.forEach((callback) => {
        try {
          callback(event)
        }
        catch (error) {
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
                }
                catch (error) {
                  console.error('[PluginSDK] Error in plugin-specific status subscriber:', error)
                }
              })
            }
          })
          .catch((error) => {
            console.error('[PluginSDK] Failed to fetch plugin data for status subscribers:', error)
          })
      }
    })

    this.initialized = true
  }

  // ============================================
  // Query APIs
  // ============================================

  /**
   * Get list of all plugins with optional filters
   */
  async list(filters?: PluginFilters): Promise<ITouchPlugin[]> {
    try {
      const response = await touchChannel.send('plugin:api:list', { filters })
      return response || []
    }
    catch (error) {
      console.error('[PluginSDK] Failed to list plugins:', error)
      return []
    }
  }

  /**
   * Get a specific plugin by name
   */
  async get(name: string): Promise<ITouchPlugin | null> {
    try {
      const response = await touchChannel.send('plugin:api:get', { name })
      return response
    }
    catch (error) {
      console.error('[PluginSDK] Failed to get plugin:', error)
      return null
    }
  }

  /**
   * Get plugin status by name
   */
  async getStatus(name: string): Promise<number> {
    try {
      const response = await touchChannel.send('plugin:api:get-status', { name })
      return response
    }
    catch (error) {
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
      const response = await touchChannel.send('plugin:api:enable', { name })
      return response?.success || false
    }
    catch (error) {
      console.error('[PluginSDK] Failed to enable plugin:', error)
      return false
    }
  }

  /**
   * Disable a plugin
   */
  async disable(name: string): Promise<boolean> {
    try {
      const response = await touchChannel.send('plugin:api:disable', { name })
      return response?.success || false
    }
    catch (error) {
      console.error('[PluginSDK] Failed to disable plugin:', error)
      return false
    }
  }

  /**
   * Reload a plugin
   */
  async reload(name: string): Promise<boolean> {
    try {
      const response = await touchChannel.send('plugin:api:reload', { name })
      return response?.success || false
    }
    catch (error) {
      console.error('[PluginSDK] Failed to reload plugin:', error)
      return false
    }
  }

  /**
   * Reconnect to dev server for a plugin
   */
  async reconnectDevServer(name: string): Promise<boolean> {
    try {
      const response = await touchChannel.send('plugin:reconnect-dev-server', { pluginName: name })
      return response?.success || false
    }
    catch (error) {
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
    },
  ): Promise<boolean> {
    try {
      const response = await touchChannel.send('plugin:api:install', {
        source,
        ...options,
      })
      return response?.success || false
    }
    catch (error) {
      console.error('[PluginSDK] Failed to install plugin:', error)
      return false
    }
  }

  /**
   * Uninstall a plugin
   */
  async uninstall(name: string): Promise<boolean> {
    try {
      const response = await touchChannel.send('plugin:api:uninstall', { name })
      return response?.success || false
    }
    catch (error) {
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
      const response = await touchChannel.send('plugin:api:trigger-feature', request)
      return response
    }
    catch (error) {
      console.error('[PluginSDK] Failed to trigger feature:', error)
      throw error
    }
  }

  /**
   * Handle input changed event for a feature
   */
  async onInputChanged(request: InputChangedRequest): Promise<void> {
    try {
      await touchChannel.send('plugin:api:feature-input-changed', request)
    }
    catch (error) {
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
      await touchChannel.send('plugin:api:open-folder', { name })
    }
    catch (error) {
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
      const response = await touchChannel.send('plugin:api:get-official-list', { force })
      return response?.plugins || []
    }
    catch (error) {
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
      const response = await touchChannel.send('plugin:api:get-manifest', { name })
      return response
    }
    catch (error) {
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
    reload = true,
  ): Promise<boolean> {
    try {
      const response = await touchChannel.send('plugin:api:save-manifest', {
        name,
        manifest,
        reload,
      })
      return response?.success || false
    }
    catch (error) {
      console.error('[PluginSDK] Failed to save plugin manifest:', error)
      return false
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
      const response = await touchChannel.send('plugin:api:get-paths', { name })
      return response
    }
    catch (error) {
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
    pathType: 'plugin' | 'data' | 'config' | 'logs' | 'temp',
  ): Promise<{ success: boolean, path?: string }> {
    try {
      const response = await touchChannel.send('plugin:api:open-path', { name, pathType })
      return response || { success: false }
    }
    catch (error) {
      console.error('[PluginSDK] Failed to open plugin path:', error)
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
      const response = await touchChannel.send('plugin:api:get-performance', { name })
      return response
    }
    catch (error) {
      console.error('[PluginSDK] Failed to get plugin performance:', error)
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
