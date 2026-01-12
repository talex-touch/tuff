import { hasWindow } from '@talex-touch/utils/env'

/**
 * 完整通信示例
 * 展示插件间通信的完整流程
 */

// 获取SDK实例
const sdk = window.$touchSDK

// 1. 插件A发送消息给插件B
async function pluginAtoPluginB() {
  try {
    console.log('[Plugin A] Sending message to Plugin B')

    const result = await sdk.communicateWithPlugin(
      'touch-translation', // 目标插件
      'translate', // 消息键
      { // 消息数据
        text: 'Hello from Plugin A',
        from: 'en',
        to: 'zh',
      },
    )

    console.log('[Plugin A] Received response:', result)
    return result
  }
  catch (error) {
    console.error('[Plugin A] Communication failed:', error)
    throw error
  }
}

// 2. 批量通信示例
async function batchCommunication() {
  const plugins = [
    { name: 'touch-translation', key: 'translate', info: { text: 'Hello', from: 'en', to: 'zh' } },
    { name: 'touch-music', key: 'play', info: { song: 'Test Song', artist: 'Test Artist' } },
    { name: 'touch-image', key: 'process', info: { imageUrl: 'https://example.com/image.jpg' } },
  ]

  console.log('[Batch] Starting batch communication...')

  const results = await Promise.allSettled(
    plugins.map(async (plugin) => {
      try {
        return await sdk.communicateWithPlugin(plugin.name, plugin.key, plugin.info)
      }
      catch (error) {
        console.error(`[Batch] Failed to communicate with ${plugin.name}:`, error)
        return { error: error.message }
      }
    }),
  )

  console.log('[Batch] Batch communication results:', results)
  return results
}

// 3. 错误处理示例
async function errorHandlingExample() {
  try {
    // 尝试与不存在的插件通信
    await sdk.communicateWithPlugin('non-existent-plugin', 'test', {})
  }
  catch (error) {
    console.log('[Error Handling] Expected error:', error.message)
  }

  try {
    // 尝试与插件通信但缺少必要参数
    await sdk.communicateWithPlugin('touch-translation', '', {})
  }
  catch (error) {
    console.log('[Error Handling] Expected error:', error.message)
  }
}

// 4. 实时通信示例
async function realTimeCommunication() {
  console.log('[Real-time] Starting real-time communication...')

  // 发送ping消息
  const pingResult = await sdk.communicateWithPlugin('touch-translation', 'ping', {
    timestamp: Date.now(),
    source: 'plugin-a',
  })

  console.log('[Real-time] Ping result:', pingResult)

  // 发送状态查询
  const statusResult = await sdk.communicateWithPlugin('touch-translation', 'status', {
    query: 'plugin_status',
  })

  console.log('[Real-time] Status result:', statusResult)
}

// 5. 数据交换示例
async function dataExchange() {
  console.log('[Data Exchange] Starting data exchange...')

  // 发送数据给插件处理
  const processResult = await sdk.communicateWithPlugin('touch-translation', 'process_data', {
    data: {
      text: 'This is a test message',
      metadata: {
        source: 'plugin-a',
        timestamp: Date.now(),
        version: '1.0.0',
      },
    },
  })

  console.log('[Data Exchange] Process result:', processResult)

  // 请求插件返回处理后的数据
  const result = await sdk.communicateWithPlugin('touch-translation', 'get_result', {
    requestId: 'test-request-123',
  })

  console.log('[Data Exchange] Result:', result)
}

// 6. 插件状态监控
async function pluginStatusMonitoring() {
  const plugins = ['touch-translation', 'touch-music', 'touch-image']

  console.log('[Monitoring] Checking plugin status...')

  for (const pluginName of plugins) {
    try {
      const status = await sdk.communicateWithPlugin(pluginName, 'health_check', {
        timestamp: Date.now(),
      })
      console.log(`[Monitoring] ${pluginName} status:`, status)
    }
    catch (error) {
      console.log(`[Monitoring] ${pluginName} is not responding:`, error.message)
    }
  }
}

// 导出所有函数
window.completeCommunicationExample = {
  pluginAtoPluginB,
  batchCommunication,
  errorHandlingExample,
  realTimeCommunication,
  dataExchange,
  pluginStatusMonitoring,
}

// 自动运行示例（可选）
if (hasWindow() && window.location.hostname === 'localhost') {
  console.log('[Auto] Running communication examples...')

  // 延迟执行，确保SDK已初始化
  setTimeout(async () => {
    try {
      await pluginAtoPluginB()
      await batchCommunication()
      await errorHandlingExample()
      await realTimeCommunication()
      await dataExchange()
      await pluginStatusMonitoring()
    }
    catch (error) {
      console.error('[Auto] Example execution failed:', error)
    }
  }, 1000)
}
