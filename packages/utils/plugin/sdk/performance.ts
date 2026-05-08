/**
 * Plugin Performance SDK
 *
 * Provides APIs for plugins to access their own performance metrics
 * and storage statistics.
 */
import type { StorageStats } from '../../types/storage'
import type {
  PluginApiGetPathsResponse,
  PluginPerformanceGetMetricsResponse
} from '../../transport/events/types'
import type { PluginChannelClient } from './channel-client'
import { createPluginTuffTransport } from '../../transport'
import { PluginEvents } from '../../transport/events'
import { ensureRendererChannel } from './channel'
import { usePluginName } from './plugin-info'

/**
 * Performance metrics interface
 */
export interface PerformanceMetrics {
  /** Plugin load time in milliseconds */
  loadTime: number
  /** Estimated memory usage in bytes */
  memoryUsage: number
  /** CPU usage percentage (0-100) */
  cpuUsage: number
  /** Last active timestamp */
  lastActiveTime: number
}

/**
 * Plugin paths interface
 */
export interface PluginPaths {
  /** Plugin installation directory */
  pluginPath: string
  /** Plugin data directory */
  dataPath: string
  /** Plugin config directory */
  configPath: string
  /** Plugin logs directory */
  logsPath: string
  /** Plugin temp directory */
  tempPath: string
}

/**
 * Performance SDK interface
 */
export interface PerformanceSDK {
  /**
   * Get storage statistics for the current plugin
   *
   * @example
   * ```typescript
   * const stats = await plugin.performance.getStorageStats()
   * console.log(`Using ${stats.usagePercent}% of storage`)
   * ```
   */
  getStorageStats: () => Promise<StorageStats>

  /**
   * Get performance metrics for the current plugin
   *
   * @example
   * ```typescript
   * const metrics = await plugin.performance.getMetrics()
   * console.log(`Load time: ${metrics.loadTime}ms`)
   * ```
   */
  getMetrics: () => Promise<PerformanceMetrics>

  /**
   * Get all paths for the current plugin
   *
   * @example
   * ```typescript
   * const paths = await plugin.performance.getPaths()
   * console.log(`Plugin installed at: ${paths.pluginPath}`)
   * ```
   */
  getPaths: () => Promise<PluginPaths>

  /**
   * Get combined performance data (storage + metrics + paths)
   *
   * @example
   * ```typescript
   * const data = await plugin.performance.getAll()
   * console.log(data.storage, data.metrics, data.paths)
   * ```
   */
  getAll: () => Promise<{
    storage: StorageStats
    metrics: PerformanceMetrics
    paths: PluginPaths
  }>
}

/**
 * Creates a Performance SDK instance for plugin use
 *
 * @param channel - The plugin channel bridge for IPC communication
 * @returns Configured Performance SDK instance
 *
 * @internal
 */
export function createPerformanceSDK(channel: PluginChannelClient): PerformanceSDK {
  const transport = createPluginTuffTransport(channel)
  const pluginName = usePluginName('[Plugin SDK] Cannot determine plugin name. Make sure this is called in a plugin context.')

  const normalizeStorageStats = (result: unknown): StorageStats => {
    const value = result && typeof result === 'object' && 'data' in result
      ? (result as { data?: unknown }).data
      : result
    if (value && typeof value === 'object') {
      return value as StorageStats
    }
    return {
      totalSize: 0,
      fileCount: 0,
      dirCount: 0,
      maxSize: 10 * 1024 * 1024,
      usagePercent: 0,
    }
  }

  const normalizeMetrics = (result: PluginPerformanceGetMetricsResponse): PerformanceMetrics => {
    const value = result && typeof result === 'object' && 'data' in result
      ? (result as { data?: unknown }).data
      : result
    if (value && typeof value === 'object') {
      return value as PerformanceMetrics
    }
    return {
      loadTime: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      lastActiveTime: 0,
    }
  }

  const normalizePaths = (result: PluginApiGetPathsResponse): PluginPaths => {
    const value = result && typeof result === 'object' && 'data' in result
      ? (result as { data?: unknown }).data
      : result
    if (value && typeof value === 'object') {
      return value as PluginPaths
    }
    return {
      pluginPath: '',
      dataPath: '',
      configPath: '',
      logsPath: '',
      tempPath: '',
    }
  }

  return {
    async getStorageStats(): Promise<StorageStats> {
      try {
        const result = await transport.send(PluginEvents.storage.getStats, { pluginName })
        return normalizeStorageStats(result)
      }
      catch (error) {
        console.error('[Performance SDK] Failed to get storage stats:', error)
        throw error
      }
    },

    async getMetrics(): Promise<PerformanceMetrics> {
      try {
        const result = await transport.send(PluginEvents.performance.getMetrics)
        return normalizeMetrics(result)
      }
      catch (error) {
        console.error('[Performance SDK] Failed to get performance metrics:', error)
        throw error
      }
    },

    async getPaths(): Promise<PluginPaths> {
      try {
        const result = await transport.send(PluginEvents.performance.getPaths)
        return normalizePaths(result)
      }
      catch (error) {
        console.error('[Performance SDK] Failed to get plugin paths:', error)
        throw error
      }
    },

    async getAll(): Promise<{
      storage: StorageStats
      metrics: PerformanceMetrics
      paths: PluginPaths
    }> {
      const [storage, metrics, paths] = await Promise.all([
        this.getStorageStats(),
        this.getMetrics(),
        this.getPaths(),
      ])

      return { storage, metrics, paths }
    },
  }
}

/**
 * Hook for using Performance SDK in plugin context
 *
 * @returns Performance SDK instance
 *
 * @example
 * ```typescript
 * const performance = usePerformance()
 *
 * const stats = await performance.getStorageStats()
 * const metrics = await performance.getMetrics()
 * ```
 */
export function usePerformance(): PerformanceSDK {
  const channel = ensureRendererChannel('[Performance SDK] Channel not available. Make sure this is called in a plugin context.')
  return createPerformanceSDK(channel)
}
