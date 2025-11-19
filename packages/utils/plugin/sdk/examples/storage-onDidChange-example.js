/**
 * Storage onDidChange 示例
 * 展示如何使用 storage.onDidChange 监听存储文件变化
 * 注意：这里只能获取新值，旧值无法获取
 */

// 获取SDK实例
const sdk = window.$touchSDK

// 示例1: 监听特定配置文件的变化
function setupConfigListener() {
  console.log('[Storage] Setting up listener for config.json changes')

  const unsubscribe = sdk.storage.onDidChange('config.json', (newConfig) => {
    console.log('[Storage] config.json changed:')
    console.log('  New config:', newConfig)

    // 处理特定键的变化
    if (newConfig && newConfig.user_preference && newConfig.user_preference.theme) {
      console.log(`[Storage] Theme changed to: ${newConfig.user_preference.theme}`)
    }
  })

  // 返回取消监听的函数
  return unsubscribe
}

// 示例2: 监听多个配置文件的变化
function setupMultipleFileListeners() {
  console.log('[Storage] Setting up multiple file listeners')

  const unsubscribers = []

  // 监听 config.json
  const configUnsubscribe = sdk.storage.onDidChange('config.json', (newConfig) => {
    console.log('[Storage] config.json changed:', newConfig)
    if (newConfig.user_preference) {
      handleUserPreferenceChange(newConfig.user_preference)
    }
  })
  unsubscribers.push(configUnsubscribe)

  // 监听 settings.json
  const settingsUnsubscribe = sdk.storage.onDidChange('settings.json', (newSettings) => {
    console.log('[Storage] settings.json changed:', newSettings)
    if (newSettings) {
      handleSettingsChange(newSettings)
    }
  })
  unsubscribers.push(settingsUnsubscribe)

  // 监听 cache.json
  const cacheUnsubscribe = sdk.storage.onDidChange('cache.json', (newCache) => {
    console.log('[Storage] cache.json changed:', newCache)
    if (newCache) {
      handleCacheChange(newCache)
    }
  })
  unsubscribers.push(cacheUnsubscribe)

  // 返回取消所有监听的函数
  return () => {
    unsubscribers.forEach(unsubscribe => unsubscribe())
  }
}

// 示例3: 动态监听
function setupDynamicListener() {
  let currentListener = null

  // 开始监听
  function startListening(fileName) {
    console.log(`[Storage] Starting to listen for ${fileName} changes`)

    // 如果已有监听器，先取消
    if (currentListener) {
      currentListener()
    }

    currentListener = sdk.storage.onDidChange(fileName, (newConfig) => {
      console.log(`[Storage] Dynamic listener for ${fileName} changes:`)
      console.log('  New config:', newConfig)
    })
  }

  // 停止监听
  function stopListening() {
    if (currentListener) {
      console.log('[Storage] Stopping current listener')
      currentListener()
      currentListener = null
    }
  }

  return { startListening, stopListening }
}

// 示例4: 条件监听
function setupConditionalListener() {
  console.log('[Storage] Setting up conditional listener for user preferences')

  const unsubscribe = sdk.storage.onDidChange('config.json', (newConfig) => {
    // 处理用户偏好变化
    if (newConfig.user_preference) {
      const pref = newConfig.user_preference

      // 处理主题变化
      if (pref.theme) {
        console.log(`[Storage] Theme: ${pref.theme}`)
        applyTheme(pref.theme)
      }

      // 处理语言变化
      if (pref.language) {
        console.log(`[Storage] Language: ${pref.language}`)
        reloadInterface(pref.language)
      }
    }
  })

  return unsubscribe
}

// 示例5: 批量操作监听
function setupBatchOperationListener() {
  console.log('[Storage] Setting up batch operation listener')

  const unsubscribe = sdk.storage.onDidChange('batch_data.json', (newConfig) => {
    console.log('[Storage] batch_data.json changed:')
    console.log('  New config:', newConfig)

    // 处理批量数据变化
    if (newConfig) {
      console.log('[Storage] Processing batch data changes')
      console.log('  Batch data count:', Object.keys(newConfig).length)

      // 应用变化
      applyChanges(newConfig)
    }
  })

  return unsubscribe
}

// 辅助函数
function handleUserPreferenceChange(newValue) {
  console.log('[Storage] Handling user preference change')
  // 处理用户偏好变化
}

function handleSettingsChange(newValue) {
  console.log('[Storage] Handling settings change')
  // 处理设置变化
}

function handleCacheChange(newValue) {
  console.log('[Storage] Handling cache change')
  // 处理缓存变化
}

function applyTheme(theme) {
  console.log(`[Storage] Applying theme: ${theme}`)
  // 应用主题逻辑
}

function reloadInterface(language) {
  console.log(`[Storage] Reloading interface for language: ${language}`)
  // 重新加载界面逻辑
}

function findChanges(oldValue, newValue) {
  const changes = []
  // 比较两个对象并找出变化
  return changes
}

function applyChanges(changes) {
  console.log('[Storage] Applying changes:', changes)
  // 应用变化逻辑
}

// 导出函数供外部调用
window.storageOnDidChangeExample = {
  setupConfigListener,
  setupMultipleFileListeners,
  setupDynamicListener,
  setupConditionalListener,
  setupBatchOperationListener,
}

// 自动运行示例（可选）
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  console.log('[Auto] Setting up storage listeners...')

  // 设置配置监听
  const unsubscribe1 = setupConfigListener()

  // 设置多文件监听
  const unsubscribeAll = setupMultipleFileListeners()

  // 设置动态监听
  const { startListening, stopListening } = setupDynamicListener()

  // 5秒后切换到监听其他键
  setTimeout(() => {
    stopListening()
    startListening('settings')
  }, 5000)

  // 10秒后停止所有监听
  setTimeout(() => {
    console.log('[Auto] Stopping all listeners...')
    unsubscribe1()
    unsubscribeAll()
    stopListening()
  }, 10000)
}
