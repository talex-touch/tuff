import type {
  DevServerHealthCheckResult,
  IPluginManager,
  ITouchPlugin
} from '@talex-touch/utils/plugin'
import { PollingService } from '@talex-touch/utils/common/utils/polling'
import { DevServerKeys, i18nMsg } from '@talex-touch/utils/i18n'
import { PluginStatus } from '@talex-touch/utils/plugin'
import axios from 'axios'
import { createLogger } from '../../utils/logger'

type PluginWindowInfo = {
  window?: {
    isDestroyed: () => boolean
    webContents?: { send: (...args: unknown[]) => void }
  }
}
type PluginWindows = Map<number, PluginWindowInfo>
const toErrorMessage = (error: unknown): string => {
  if (axios.isAxiosError(error)) {
    const detailParts = [
      error.code,
      typeof error.response?.status === 'number' ? `status ${error.response.status}` : undefined,
      error.config?.url ? `url ${error.config.url}` : undefined
    ].filter(Boolean)
    const suffix = detailParts.length ? ` (${detailParts.join(', ')})` : ''
    return `${error.message}${suffix}`
  }
  return error instanceof Error ? error.message : String(error)
}

const monitorLog = createLogger('DevServerMonitor')

interface FileStatus {
  exist: boolean
  changed: boolean
  lastModified: number | null
  path: string
  size: number | null
}

interface FileStatusMap {
  [filename: string]: FileStatus
}

export class DevServerHealthMonitor {
  private monitors: Map<string, string> = new Map()
  private lastFileStatus: Map<string, FileStatusMap> = new Map()
  private failureCount: Map<string, number> = new Map()
  private inFlightChecks: Set<string> = new Set()
  private readonly pollingService = PollingService.getInstance()

  private readonly INTERVAL = 5000 // 探测间隔 5 秒
  private readonly TIMEOUT = 2500 // 请求超时 2.5 秒
  private readonly MAX_RETRIES = 2 // 重试次数

  constructor(private manager: IPluginManager) {}

  /**
   * 启动监控指定插件的 Dev Server
   */
  startMonitoring(plugin: ITouchPlugin): void {
    if (!this.shouldMonitor(plugin)) {
      monitorLog.debug(`Skipping monitoring for plugin ${plugin.name} - conditions not met`)
      return
    }

    if (this.monitors.has(plugin.name)) {
      monitorLog.warn(`Already monitoring plugin ${plugin.name}`)
      return
    }

    monitorLog.info(`Starting Dev Server monitoring for plugin ${plugin.name}`)

    const taskId = `dev-server-monitor.${plugin.name}`
    if (this.pollingService.isRegistered(taskId)) {
      this.pollingService.unregister(taskId)
    }
    this.pollingService.register(taskId, () => this.runHealthCheck(plugin), {
      interval: this.INTERVAL,
      unit: 'milliseconds',
      runImmediately: true
    })
    this.pollingService.start()
    this.monitors.set(plugin.name, taskId)
  }

  /**
   * 停止监控指定插件
   */
  stopMonitoring(pluginName: string): void {
    const taskId = this.monitors.get(pluginName)
    if (taskId) {
      this.pollingService.unregister(taskId)
      this.monitors.delete(pluginName)
      this.lastFileStatus.delete(pluginName)
      this.failureCount.delete(pluginName)
      this.inFlightChecks.delete(pluginName)
      monitorLog.info(`Stopped monitoring plugin ${pluginName}`)
    }
  }

  /**
   * 手动重连 Dev Server
   */
  async reconnectDevServer(pluginName: string): Promise<boolean> {
    const plugin = this.manager.getPluginByName(pluginName)
    if (!plugin || !plugin.dev.source) {
      monitorLog.warn(`Cannot reconnect plugin ${pluginName} - not found or not in source mode`)
      return false
    }

    plugin.status = PluginStatus.DEV_RECONNECTING
    plugin.logger.info('Attempting to reconnect to Dev Server...')

    const result = await this.checkDevServerHealth(plugin.dev.address)

    if (result.healthy) {
      plugin.status = PluginStatus.ENABLED
      // 清除断连警告
      plugin.issues = plugin.issues.filter((issue) => issue.code !== 'DEV_SERVER_DISCONNECTED')
      plugin.logger.info('Successfully reconnected to Dev Server')
      return true
    } else {
      plugin.status = PluginStatus.DEV_DISCONNECTED
      this.upsertDevDisconnectIssue(plugin, result)
      const errorSuffix = result.error ? `: ${result.error}` : ''
      plugin.logger.error(`Failed to reconnect to Dev Server${errorSuffix}`)
      return false
    }
  }

  /**
   * 获取插件 Dev Server 状态
   */
  getStatus(pluginName: string): { monitoring: boolean; connected: boolean; lastCheck?: number } {
    const monitoring = this.monitors.has(pluginName)
    const plugin = this.manager.getPluginByName(pluginName)
    const connected = plugin ? plugin.status !== PluginStatus.DEV_DISCONNECTED : false

    return {
      monitoring,
      connected,
      lastCheck: this.lastFileStatus.get(pluginName) ? Date.now() : undefined
    }
  }

  /**
   * 检查是否应该监控该插件
   */
  private shouldMonitor(plugin: ITouchPlugin): boolean {
    return (
      plugin.dev.enable === true &&
      plugin.dev.source === true &&
      !!plugin.dev.address &&
      [
        PluginStatus.ENABLED,
        PluginStatus.ACTIVE,
        PluginStatus.DEV_DISCONNECTED,
        PluginStatus.DEV_RECONNECTING
      ].includes(plugin.status)
    )
  }

  private runHealthCheck(plugin: ITouchPlugin): void {
    if (this.inFlightChecks.has(plugin.name)) return
    this.inFlightChecks.add(plugin.name)
    void this.checkHealth(plugin).finally(() => {
      this.inFlightChecks.delete(plugin.name)
    })
  }

  /**
   * 执行健康检查
   */
  private async checkHealth(plugin: ITouchPlugin): Promise<void> {
    if (!this.shouldMonitor(plugin)) {
      this.stopMonitoring(plugin.name)
      return
    }

    try {
      const result = await this.checkDevServerHealth(plugin.dev.address)

      if (result.healthy) {
        await this.handleHealthyResponse(plugin, result)
      } else {
        await this.handleUnhealthyResponse(plugin, result)
      }
    } catch (error: unknown) {
      monitorLog.error(`Health check failed for plugin ${plugin.name}:`, { error })
      await this.handleUnhealthyResponse(plugin, {
        healthy: false,
        error: toErrorMessage(error),
        timestamp: Date.now()
      })
    }
  }

  /**
   * 检查 Dev Server 健康状态
   */
  private async checkDevServerHealth(address: string): Promise<DevServerHealthCheckResult> {
    const endpoints = ['/_tuff_devkit/update', '/manifest.json']
    let lastError: unknown

    for (const endpoint of endpoints) {
      const healthUrl = new URL(endpoint, address).toString()
      try {
        await axios.get(healthUrl, {
          timeout: this.TIMEOUT,
          proxy: false,
          validateStatus: (status) => status >= 200 && status < 400
        })
        return {
          healthy: true,
          timestamp: Date.now()
        }
      } catch (error: unknown) {
        lastError = error
      }
    }

    return {
      healthy: false,
      timestamp: Date.now(),
      error: toErrorMessage(lastError)
    }
  }

  /**
   * 处理健康响应
   */
  private async handleHealthyResponse(
    plugin: ITouchPlugin,
    _result: DevServerHealthCheckResult
  ): Promise<void> {
    // 重置失败计数
    this.failureCount.delete(plugin.name)

    // If previously disconnected, now restored
    if (plugin.status === PluginStatus.DEV_DISCONNECTED) {
      plugin.status = PluginStatus.ENABLED
      plugin.issues = plugin.issues.filter((issue) => issue.code !== 'DEV_SERVER_DISCONNECTED')
      plugin.logger.info('Dev Server connection restored')

      // Notify view windows about reconnection
      this.notifyViewWindowsReconnected(plugin)
    }
  }

  /**
   * 处理不健康响应
   */
  private async handleUnhealthyResponse(
    plugin: ITouchPlugin,
    result: DevServerHealthCheckResult
  ): Promise<void> {
    const failureCount = (this.failureCount.get(plugin.name) || 0) + 1
    this.failureCount.set(plugin.name, failureCount)

    // 重试机制
    if (failureCount <= this.MAX_RETRIES) {
      monitorLog.debug(
        `Health check failed for plugin ${plugin.name}, retrying... (${failureCount}/${this.MAX_RETRIES})`
      )
      return
    }

    // 标记为断连
    if (plugin.status !== PluginStatus.DEV_DISCONNECTED) {
      plugin.status = PluginStatus.DEV_DISCONNECTED

      this.upsertDevDisconnectIssue(plugin, result)
      const errorSuffix = result.error ? ` (${result.error})` : ''
      plugin.logger.warn(`Dev Server disconnected${errorSuffix}`)

      // Notify all view windows instead of closing them (per PRD requirement)
      this.notifyViewWindowsDisconnected(plugin)
    }
  }

  private upsertDevDisconnectIssue(plugin: ITouchPlugin, result: DevServerHealthCheckResult): void {
    const issueIndex = plugin.issues.findIndex((issue) => issue.code === 'DEV_SERVER_DISCONNECTED')
    const payload = {
      type: 'warning' as const,
      code: 'DEV_SERVER_DISCONNECTED',
      message: i18nMsg(DevServerKeys.DISCONNECTED_DESC),
      suggestion: i18nMsg(DevServerKeys.CHECK_SERVER),
      timestamp: Date.now(),
      meta: {
        error: result.error || '',
        address: plugin.dev.address,
        checkedAt: result.timestamp
      }
    }

    if (issueIndex >= 0) {
      const existing = plugin.issues[issueIndex]
      plugin.issues[issueIndex] = {
        ...existing,
        ...payload,
        meta: {
          ...((existing.meta as Record<string, unknown> | undefined) || {}),
          ...payload.meta
        }
      }
    } else {
      plugin.issues.push(payload)
    }
  }

  /**
   * Notify all view windows about disconnection (instead of closing them)
   * Per PRD: Already opened view windows should NOT be forcibly closed
   */
  private notifyViewWindowsDisconnected(plugin: ITouchPlugin): void {
    const windows = (plugin as { _windows?: PluginWindows })._windows
    if (windows && typeof windows.forEach === 'function') {
      windows.forEach((windowInfo, id: number) => {
        try {
          const win = windowInfo?.window
          if (win && !win.isDestroyed() && win.webContents) {
            // Send IPC message to trigger in-view UI notification (i18n format)
            win.webContents.send('tuff:dev-server-disconnected', {
              pluginName: plugin.name,
              title: i18nMsg(DevServerKeys.DISCONNECTED),
              message: i18nMsg(DevServerKeys.CONNECTION_LOST),
              suggestion: i18nMsg(DevServerKeys.CHECK_SERVER),
              canReconnect: true,
              timestamp: Date.now()
            })
            plugin.logger.info(`Notified view window ${id} about Dev Server disconnection`)
          }
        } catch (error: unknown) {
          plugin.logger.warn(`Error notifying view window ${id}:`, toErrorMessage(error))
        }
      })
    }
  }

  /**
   * Notify view windows about reconnection success
   */
  private notifyViewWindowsReconnected(plugin: ITouchPlugin): void {
    const windows = (plugin as { _windows?: PluginWindows })._windows
    if (windows && typeof windows.forEach === 'function') {
      windows.forEach((windowInfo, id: number) => {
        try {
          const win = windowInfo?.window
          if (win && !win.isDestroyed() && win.webContents) {
            win.webContents.send('tuff:dev-server-reconnected', {
              pluginName: plugin.name,
              title: i18nMsg(DevServerKeys.RECONNECTED),
              message: i18nMsg(DevServerKeys.CONNECTION_RESTORED),
              timestamp: Date.now()
            })
            plugin.logger.info(`Notified view window ${id} about Dev Server reconnection`)
          }
        } catch (error: unknown) {
          plugin.logger.warn(`Error notifying view window ${id}:`, toErrorMessage(error))
        }
      })
    }
  }

  /**
   * 清理所有监控
   */
  destroy(): void {
    for (const [pluginName, interval] of this.monitors) {
      clearInterval(interval)
      monitorLog.info(`Destroyed monitoring for plugin ${pluginName}`)
    }

    this.monitors.clear()
    this.lastFileStatus.clear()
    this.failureCount.clear()
  }
}
