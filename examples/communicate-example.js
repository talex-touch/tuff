/**
 * 插件通信示例
 * 展示如何使用 communicateWithPlugin 方法与其他插件通信
 */

import { useTouchSDK } from '@talex-touch/utils/plugin/sdk'

// 获取SDK实例
const sdk = useTouchSDK()

// 发送消息到插件的示例
async function communicateWithPlugin() {
  try {
    // 使用新的 communicateWithPlugin 方法
    const result = await sdk.communicateWithPlugin(
      'touch-translation', // 目标插件名称
      'translate', // 消息键
      { // 消息数据
        text: 'Hello World',
        from: 'en',
        to: 'zh',
      },
    )

    console.log('Communication result:', result)
  }
  catch (error) {
    console.error('Failed to communicate with plugin:', error)
  }
}

// 发送搜索消息到插件
async function sendSearchToPlugin() {
  try {
    const result = await sdk.communicateWithPlugin(
      'touch-translation',
      'search',
      {
        query: 'translation',
        type: 'text',
      },
    )

    console.log('Search result:', result)
  }
  catch (error) {
    console.error('Failed to send search to plugin:', error)
  }
}

// 发送通知消息到插件
async function sendNotificationToPlugin() {
  try {
    const result = await sdk.communicateWithPlugin(
      'touch-translation',
      'notify',
      {
        title: 'Plugin Communication',
        body: 'This is a test notification',
      },
    )

    console.log('Notification result:', result)
  }
  catch (error) {
    console.error('Failed to send notification to plugin:', error)
  }
}

// 批量发送消息到多个插件
async function sendToMultiplePlugins() {
  const plugins = ['touch-translation', 'touch-music', 'touch-image']
  const key = 'ping'
  const info = { timestamp: Date.now() }

  const promises = plugins.map(async (pluginName) => {
    try {
      return await sdk.communicateWithPlugin(pluginName, key, info)
    }
    catch (error) {
      console.error(`Failed to send to ${pluginName}:`, error)
      return null
    }
  })

  const results = await Promise.allSettled(promises)
  console.log('Batch communication results:', results)
}

// 导出函数供外部调用
window.communicateExample = {
  communicateWithPlugin,
  sendSearchToPlugin,
  sendNotificationToPlugin,
  sendToMultiplePlugins,
}
