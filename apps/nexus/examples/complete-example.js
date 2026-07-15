/**
 * 完整插件示例
 * 展示一个完整的插件如何使用SDK
 */

import { useTouchSDK } from '@talex-touch/utils/plugin/sdk'

const sdk = useTouchSDK()

// 插件配置
const PLUGIN_CONFIG = {
  name: 'Example Plugin',
  version: '1.0.0',
  description: 'A complete example plugin',
  author: 'Talex Touch Team',
}

// 插件初始化
async function initializePlugin() {
  try {
    console.log(`[${PLUGIN_CONFIG.name}] Initializing...`)

    // 发送初始化消息
    await sdk.sendMessage('init', {
      config: PLUGIN_CONFIG,
      timestamp: Date.now(),
    })

    // 加载用户配置
    const userConfig = await sdk.sendMessage('storage:get', {
      key: 'user_config',
    })

    if (!userConfig) {
      // 设置默认配置
      await sdk.sendMessage('storage:set', {
        key: 'user_config',
        value: {
          theme: 'auto',
          language: 'zh-CN',
          notifications: true,
        },
      })
    }

    console.log(`[${PLUGIN_CONFIG.name}] Initialized successfully`)
  }
  catch (error) {
    console.error(`[${PLUGIN_CONFIG.name}] Initialization failed:`, error)
  }
}

// 演示所有功能
async function demonstrateAllFeatures() {
  try {
    console.log('=== Demonstrating All Features ===')

    // 1. 搜索功能
    console.log('1. Testing search...')
    await sdk.sendMessage('search', {
      query: 'hello world',
      type: 'text',
    })

    // 2. 翻译功能
    console.log('2. Testing translation...')
    await sdk.sendMessage('translate', {
      text: 'Hello World',
      from: 'en',
      to: 'zh',
    })

    // 3. 通知功能
    console.log('3. Testing notification...')
    await sdk.sendMessage('notify', {
      title: 'Plugin Demo',
      body: 'All features working!',
      options: {
        icon: 'success',
        timeout: 2000,
      },
    })

    // 4. 存储功能
    console.log('4. Testing storage...')
    await sdk.sendMessage('storage:set', {
      key: 'demo_data',
      value: {
        message: 'Hello from plugin',
        timestamp: Date.now(),
      },
    })

    const storedData = await sdk.sendMessage('storage:get', {
      key: 'demo_data',
    })
    console.log('Stored data:', storedData)

    // 5. 剪贴板功能
    console.log('5. Testing clipboard...')
    await sdk.sendMessage('clipboard:write', {
      content: 'Hello from Talex Touch Plugin!',
      type: 'text',
    })

    const clipboardContent = await sdk.sendMessage('clipboard:read', {
      type: 'text',
    })
    console.log('Clipboard content:', clipboardContent)

    console.log('=== All features demonstrated successfully ===')
  }
  catch (error) {
    console.error('Feature demonstration failed:', error)
  }
}

// 处理函数
function handleInit(data) {
  console.log('Plugin initialized with config:', data.config)
}

function handleSearch(data) {
  console.log('Searching for:', data.query, 'Type:', data.type)
  // 实现搜索逻辑
}

function handleTranslate(data) {
  console.log('Translating:', data.text, 'From:', data.from, 'To:', data.to)
  // 实现翻译逻辑
}

function handleNotify(data) {
  console.log('Showing notification:', data.title, data.body)
  // 实现通知逻辑
}

function handleStorageGet(data) {
  console.log('Getting storage for key:', data.key)
  // 实现存储获取逻辑
}

function handleStorageSet(data) {
  console.log('Setting storage:', data.key, data.value)
  // 实现存储设置逻辑
}

function handleClipboardRead(data) {
  console.log('Reading clipboard, type:', data.type)
  // 实现剪贴板读取逻辑
}

function handleClipboardWrite(data) {
  console.log('Writing to clipboard:', data.content, 'Type:', data.type)
  // 实现剪贴板写入逻辑
}

// 导出
window.completeExample = {
  initializePlugin,
  demonstrateAllFeatures,
}

// 自动初始化
initializePlugin()
