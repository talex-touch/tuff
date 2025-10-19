/**
 * Storage onDidChange 示例
 * 展示如何使用 storage.onDidChange 监听存储文件变化
 * 注意：这里只能获取新值，旧值无法获取
 */

// 获取SDK实例
const sdk = window.$touchSDK

// 示例1: 监听整个配置文件的变化
function setupConfigListener() {
  console.log('[Storage] Setting up listener for entire config changes')

  const unsubscribe = sdk.storage.onDidChange((newConfig) => {
    console.log('[Storage] Config changed:')
    console.log('  New config:', newConfig)

    // 处理特定键的变化
    if (newConfig && newConfig.user_preference && newConfig.user_preference.theme) {
      console.log(`[Storage] Theme changed to: ${newConfig.user_preference.theme}`)
    }
  })

  // 返回取消监听的函数
  return unsubscribe
}

// 示例2: 监听配置变化并处理特定键
function setupConfigChangeHandler() {
  console.log('[Storage] Setting up config change handler')

  const unsubscribe = sdk.storage.onDidChange((newConfig) => {
    console.log('[Storage] Config changed:')
    console.log('  New config:', newConfig)

    // 处理特定键的变化
    if (newConfig.user_preference) {
      handleUserPreferenceChange(newConfig.user_preference)
    }
    if (newConfig.settings) {
      handleSettingsChange(newConfig.settings)
    }
    if (newConfig.cache) {
      handleCacheChange(newConfig.cache)
    }
  })

  return unsubscribe
}

// 示例3: 动态监听
function setupDynamicListener() {
  let currentListener = null

  // 开始监听
  function startListening() {
    console.log('[Storage] Starting to listen for config changes')

    // 如果已有监听器，先取消
    if (currentListener) {
      currentListener()
    }

    currentListener = sdk.storage.onDidChange((newConfig) => {
      console.log('[Storage] Dynamic listener for config changes:')
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
  console.log('[Storage] Setting up conditional listener')

  const unsubscribe = sdk.storage.onDidChange((newConfig) => {
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

  const unsubscribe = sdk.storage.onDidChange((newConfig) => {
    console.log('[Storage] Config changed:')
    console.log('  New config keys:', Object.keys(newConfig))

    // 处理批量数据变化
    if (newConfig.batch_data) {
      console.log('[Storage] Processing batch data changes')
      console.log('  Batch data count:', Object.keys(newConfig.batch_data).length)

      // 应用变化
      applyChanges(newConfig.batch_data)
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
  setupConfigChangeHandler,
  setupDynamicListener,
  setupConditionalListener,
  setupBatchOperationListener
}

// 自动运行示例（可选）
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  console.log('[Auto] Setting up storage listeners...')

  // 设置配置监听
  const unsubscribe1 = setupConfigListener()

  // 设置配置变化处理器
  const unsubscribeAll = setupConfigChangeHandler()

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
