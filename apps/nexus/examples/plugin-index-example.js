/**
 * 插件 index.js 示例
 * 展示如何在插件的 index.js 中使用 IFeatureLifeCycle 接口
 */

// 这个文件会被 loadPluginFeatureContextFromContent 加载
// 它应该导出符合 IFeatureLifeCycle 接口的对象

// 导出 onMessage 函数 - 用于注册消息处理器
function onMessage(messageHandler) {
  console.log('Plugin: Registering message handlers')

  // 注册搜索消息处理器
  messageHandler('search', (data) => {
    console.log('Plugin: Handling search message', data)

    // 实现搜索逻辑
    const results = performSearch(data.query, data.type)

    // 发送搜索结果
    messageHandler('search:results', { results })
  })

  // 注册翻译消息处理器
  messageHandler('translate', (data) => {
    console.log('Plugin: Handling translate message', data)

    // 实现翻译逻辑
    const translation = performTranslation(data.text, data.from, data.to)

    // 发送翻译结果
    messageHandler('translate:result', translation)
  })

  // 注册通知消息处理器
  messageHandler('notify', (data) => {
    console.log('Plugin: Handling notify message', data)

    // 实现通知逻辑
    showNotification(data.title, data.body)
  })
}

// 导出 lifecycle 函数 - 用于注册生命周期钩子
function lifecycle(lifecycleHooks) {
  console.log('Plugin: Registering lifecycle hooks')

  // 注册初始化钩子
  lifecycleHooks.onInit(() => {
    console.log('Plugin: Initialized')
    // 初始化插件
    initializePlugin()
  })

  // 注册启动钩子
  lifecycleHooks.onStart(() => {
    console.log('Plugin: Started')
    // 启动插件
    startPlugin()
  })

  // 注册停止钩子
  lifecycleHooks.onStop(() => {
    console.log('Plugin: Stopped')
    // 停止插件
    stopPlugin()
  })

  // 注册销毁钩子
  lifecycleHooks.onDestroy(() => {
    console.log('Plugin: Destroyed')
    // 清理资源
    cleanupPlugin()
  })
}

// 导出符合 IFeatureLifeCycle 接口的对象
const featureLifeCycle = {
  onInit() {
    console.log('Plugin: onInit called')
    initializePlugin()
  },

  onMessage(key, info) {
    console.log(`Plugin: onMessage called with ${key}`, info)

    switch (key) {
      case 'search':
        handleSearchMessage(info)
        break
      case 'translate':
        handleTranslateMessage(info)
        break
      case 'notify':
        handleNotifyMessage(info)
        break
      default:
        console.log('Unknown message:', key)
    }
  },

  onLaunch(feature) {
    console.log('Plugin: onLaunch called', feature)
    startPlugin()
  },

  onFeatureTriggered(id, data, feature, signal) {
    console.log('Plugin: onFeatureTriggered called', { id, data, feature })
    // 处理功能触发
  },

  onInputChanged(input) {
    console.log('Plugin: onInputChanged called', input)
    // 处理输入变化
  },

  onActionClick(actionId, data) {
    console.log('Plugin: onActionClick called', { actionId, data })
    // 处理动作点击
  },

  onClose(feature) {
    console.log('Plugin: onClose called', feature)
    stopPlugin()
  },

  onItemAction(item) {
    console.log('Plugin: onItemAction called', item)
    // 处理项目动作
    return Promise.resolve({
      externalAction: false,
      shouldActivate: false,
    })
  },
}

// 辅助函数
function performSearch(query, type) {
  console.log(`Searching for: ${query} (type: ${type})`)

  // 模拟搜索逻辑
  return [
    {
      id: 'search-result-1',
      title: `Search Result for "${query}"`,
      description: 'This is a search result',
      action: 'open',
      data: { url: `https://example.com/search?q=${encodeURIComponent(query)}` },
    },
    {
      id: 'search-result-2',
      title: `Another Result for "${query}"`,
      description: 'Another search result',
      action: 'copy',
      data: { text: query },
    },
  ]
}

function performTranslation(text, from, to) {
  console.log(`Translating: "${text}" from ${from} to ${to}`)

  // 模拟翻译逻辑
  return {
    original: text,
    translated: `[${from}→${to}] ${text}`,
    from,
    to,
    confidence: 0.95,
  }
}

function showNotification(title, body) {
  console.log(`Notification: ${title} - ${body}`)
  // 实现通知显示逻辑
}

function initializePlugin() {
  console.log('Plugin: Initializing...')
  // 初始化插件逻辑
}

function startPlugin() {
  console.log('Plugin: Starting...')
  // 启动插件逻辑
}

function stopPlugin() {
  console.log('Plugin: Stopping...')
  // 停止插件逻辑
}

function cleanupPlugin() {
  console.log('Plugin: Cleaning up...')
  // 清理资源逻辑
}

// 消息处理函数
function handleSearchMessage(info) {
  console.log('Handling search message:', info)
  const results = performSearch(info.query, info.type)
  // 这里可以通过SDK发送结果
}

function handleTranslateMessage(info) {
  console.log('Handling translate message:', info)
  const translation = performTranslation(info.text, info.from, info.to)
  // 这里可以通过SDK发送结果
}

function handleNotifyMessage(info) {
  console.log('Handling notify message:', info)
  showNotification(info.title, info.body)
}

// 导出函数和对象
module.exports = {
  onMessage,
  lifecycle,
  ...featureLifeCycle,
}
