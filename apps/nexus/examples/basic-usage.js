/**
 * 基本使用示例
 * 展示如何使用SDK发送消息
 */

import { useTouchSDK } from '@talex-touch/utils/plugin/sdk'

// 获取SDK实例
const sdk = useTouchSDK()

// 2. 发送消息执行功能
async function executeActions() {
  try {
    // 执行搜索
    const searchResult = await sdk.sendMessage('search', {
      query: 'hello world',
      type: 'text',
    })
    console.log('Search result:', searchResult)

    // 执行翻译
    const translateResult = await sdk.sendMessage('translate', {
      text: 'Hello',
      from: 'en',
      to: 'zh',
    })
    console.log('Translate result:', translateResult)

    // 发送通知
    await sdk.sendMessage('notify', {
      title: 'Plugin Message',
      body: 'This is a notification from plugin',
    })
  }
  catch (error) {
    console.error('Failed to execute actions:', error)
  }
}

// 处理函数
function handleSearch(data) {
  console.log('Handling search:', data)
  // 实现搜索逻辑
}

function handleTranslate(data) {
  console.log('Handling translate:', data)
  // 实现翻译逻辑
}

function handleNotify(data) {
  console.log('Handling notify:', data)
  // 实现通知逻辑
}

// 导出函数供外部调用
window.pluginBasicExample = {
  executeActions,
}
