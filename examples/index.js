/**
 * Talex Touch Plugin SDK
 *
 * 简单的插件通信SDK - 通过 IFeatureLifeCycle 接口与主应用通信
 */

// 检查运行环境
if (typeof window === 'undefined') {
  throw new TypeError('[Plugin SDK] This SDK must run in a browser environment')
}

if (!window.$channel) {
  throw new Error('[Plugin SDK] Channel not available')
}

if (!window.$plugin) {
  throw new Error('[Plugin SDK] Plugin context not available')
}

/**
 * 简单的插件SDK
 */
class PluginSDK {
  constructor() {
    this.channel = window.$channel
    this.plugin = window.$plugin
    this.pluginName = this.plugin?.name || 'unknown'

    console.log(`[Plugin SDK] Initialized for plugin: ${this.pluginName}`)
  }

  /**
   * 发送消息到主应用
   * @param {string} message - 消息类型
   * @param {any} data - 消息数据
   */
  async sendMessage(message, data = {}) {
    try {
      return await this.channel.send(`plugin:${this.pluginName}:${message}`, data)
    }
    catch (error) {
      console.error(`[Plugin SDK] Failed to send message: ${message}`, error)
      throw error
    }
  }

  /**
   * 通过 index:communicate 通道与其他插件通信
   * @param {string} targetPluginName - 目标插件名称
   * @param {string} key - 消息键
   * @param {any} info - 消息数据
   */
  async communicateWithPlugin(targetPluginName, key, info = {}) {
    try {
      return await this.channel.send('index:communicate', {
        pluginName: targetPluginName,
        key,
        info,
      })
    }
    catch (error) {
      console.error(`[Plugin SDK] Failed to communicate with plugin ${targetPluginName}:`, error)
      throw error
    }
  }

  /**
   * 获取插件信息
   */
  getPluginInfo() {
    return {
      name: this.pluginName,
      version: this.plugin?.version || 'unknown',
      description: this.plugin?.desc || '',
      status: this.plugin?.status || 'unknown',
    }
  }

  /**
   * 获取原始通道（高级用法）
   */
  getChannel() {
    return this.channel
  }
}
