import {
  IPluginManager,
  ITouchPlugin,
  PluginStatus,
  DevServerHealthCheckResult
} from '@talex-touch/utils/plugin'
import axios from 'axios'
import { createLogger } from '../../utils/logger'

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
  private monitors: Map<string, NodeJS.Timeout> = new Map()
  private lastFileStatus: Map<string, FileStatusMap> = new Map()
  private failureCount: Map<string, number> = new Map()

  private readonly INTERVAL = 5000 // 探测间隔 5 秒
  private readonly TIMEOUT = 1500 // 请求超时 1.5 秒
  private readonly MAX_RETRIES = 1 // 重试次数

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

    const interval = setInterval(async () => {
      await this.checkHealth(plugin)
    }, this.INTERVAL)

    this.monitors.set(plugin.name, interval)

    // 立即执行一次检查
    this.checkHealth(plugin)
  }

  /**
   * 停止监控指定插件
   */
  stopMonitoring(pluginName: string): void {
    const interval = this.monitors.get(pluginName)
    if (interval) {
      clearInterval(interval)
      this.monitors.delete(pluginName)
      this.lastFileStatus.delete(pluginName)
      this.failureCount.delete(pluginName)
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

    const isHealthy = await this.checkDevServerHealth(plugin.dev.address)

    if (isHealthy) {
      plugin.status = PluginStatus.ENABLED
      // 清除断连警告
      plugin.issues = plugin.issues.filter((issue) => issue.code !== 'DEV_SERVER_DISCONNECTED')
      plugin.logger.info('Successfully reconnected to Dev Server')
      return true
    } else {
      plugin.status = PluginStatus.DEV_DISCONNECTED
      plugin.logger.error('Failed to reconnect to Dev Server')
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
      (plugin.status === PluginStatus.ENABLED || plugin.status === PluginStatus.ACTIVE)
    )
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
    } catch (error: any) {
      monitorLog.error(`Health check failed for plugin ${plugin.name}:`, error)
      await this.handleUnhealthyResponse(plugin, {
        healthy: false,
        error: error.message,
        timestamp: Date.now()
      })
    }
  }

  /**
   * 检查 Dev Server 健康状态
   */
  private async checkDevServerHealth(address: string): Promise<DevServerHealthCheckResult> {
    const healthUrl = new URL('/_tuff_devkit/update', address).toString()

    try {
      await axios.get(healthUrl, {
        timeout: this.TIMEOUT,
        validateStatus: (status) => status === 200
      })

      return {
        healthy: true,
        timestamp: Date.now()
      }
    } catch (error: any) {
      return {
        healthy: false,
        timestamp: Date.now(),
        error: error.message
      }
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

    // 如果之前是断连状态，现在恢复了
    if (plugin.status === PluginStatus.DEV_DISCONNECTED) {
      plugin.status = PluginStatus.ENABLED
      plugin.issues = plugin.issues.filter((issue) => issue.code !== 'DEV_SERVER_DISCONNECTED')
      plugin.logger.info('Dev Server connection restored')
    }
  }

  /**
   * 处理不健康响应
   */
  private async handleUnhealthyResponse(
    plugin: ITouchPlugin,
    _result: DevServerHealthCheckResult
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

      // 添加断连警告
      plugin.issues.push({
        type: 'warning',
        code: 'DEV_SERVER_DISCONNECTED',
        message: 'Dev Server 连接已断开，可能是服务器崩溃或网络中断',
        suggestion: '请检查 Dev Server 是否正常运行，或尝试手动重连',
        timestamp: Date.now()
      })

      plugin.logger.warn('Dev Server disconnected')

      // 关闭所有相关 view 窗口
      this.closeAllViewWindows(plugin)
    }
  }

  /**
   * 关闭插件的所有 view 窗口
   */
  private closeAllViewWindows(plugin: ITouchPlugin): void {
    // 使用类型断言访问内部实现细节
    const pluginImpl = plugin as any
    if (pluginImpl._windows && typeof pluginImpl._windows.forEach === 'function') {
      pluginImpl._windows.forEach((window: any, id: number) => {
        try {
          if (window?.window && !window.window.isDestroyed()) {
            plugin.logger.info(`Closing view window ${id} due to Dev Server disconnection`)
            window.window.close()
          }
        } catch (error: any) {
          plugin.logger.warn(`Error closing view window ${id}:`, error)
        }
      })

      // 清理窗口引用
      if (typeof pluginImpl._windows.clear === 'function') {
        pluginImpl._windows.clear()
      }
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
