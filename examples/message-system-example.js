/**
 * 消息系统示例
 * 展示如何使用SDK发送消息
 */

// 获取SDK实例
const sdk = window.$touchSDK

// 发送消息示例
async function sendMessageExamples() {
  try {
    // 发送搜索消息
    await sdk.sendMessage('search', {
      query: 'hello world',
      type: 'text'
    })

    // 发送翻译消息
    await sdk.sendMessage('translate', {
      text: 'Hello',
      from: 'en',
      to: 'zh'
    })

    // 发送通知消息
    await sdk.sendMessage('notify', {
      title: 'Plugin Message',
      body: 'This is a notification from plugin'
    })

  } catch (error) {
    console.error('Failed to send messages:', error)
  }
}

// 导出函数
window.messageSystemExample = {
  sendMessageExamples
}
