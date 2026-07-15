/**
 * 插件接收端示例
 * 展示插件如何接收和处理来自其他插件的消息
 */

// 实现 IFeatureLifeCycle 接口
const featureLifeCycle = {
  onInit() {
    console.log('[Plugin Receiver] Plugin initialized')
    // 插件初始化逻辑
  },

  onMessage(key, info) {
    console.log(`[Plugin Receiver] Received message: ${key}`, info)

    switch (key) {
      case 'translate':
        handleTranslateMessage(info)
        break
      case 'search':
        handleSearchMessage(info)
        break
      case 'ping':
        handlePingMessage(info)
        break
      case 'status':
        handleStatusMessage(info)
        break
      case 'process_data':
        handleProcessDataMessage(info)
        break
      case 'get_result':
        handleGetResultMessage(info)
        break
      case 'health_check':
        handleHealthCheckMessage(info)
        break
      default:
        console.log(`[Plugin Receiver] Unknown message type: ${key}`)
    }
  },

  onLaunch(feature) {
    console.log('[Plugin Receiver] Plugin launched', feature)
  },

  onFeatureTriggered(id, data, feature, signal) {
    console.log('[Plugin Receiver] Feature triggered', { id, data, feature })
  },

  onInputChanged(input) {
    console.log('[Plugin Receiver] Input changed:', input)
  },

  onActionClick(actionId, data) {
    console.log('[Plugin Receiver] Action clicked:', { actionId, data })
  },

  onClose(feature) {
    console.log('[Plugin Receiver] Plugin closed', feature)
  },

  onItemAction(item) {
    console.log('[Plugin Receiver] Item action:', item)
    return Promise.resolve({
      externalAction: false,
      shouldActivate: false,
    })
  },
}

// 消息处理函数
function handleTranslateMessage(info) {
  console.log('[Translate] Processing translation request:', info)

  // 模拟翻译处理
  const translation = {
    original: info.text,
    translated: `Translated: ${info.text}`,
    from: info.from,
    to: info.to,
    timestamp: Date.now(),
  }

  console.log('[Translate] Translation result:', translation)
  return translation
}

function handleSearchMessage(info) {
  console.log('[Search] Processing search request:', info)

  // 模拟搜索处理
  const results = [
    {
      id: 'result-1',
      title: 'Search Result 1',
      description: 'This is a search result',
      score: 0.95,
    },
    {
      id: 'result-2',
      title: 'Search Result 2',
      description: 'Another search result',
      score: 0.87,
    },
  ]

  console.log('[Search] Search results:', results)
  return results
}

function handlePingMessage(info) {
  console.log('[Ping] Received ping:', info)

  // 返回pong响应
  const pong = {
    message: 'pong',
    timestamp: Date.now(),
    source: 'plugin-receiver',
    originalTimestamp: info.timestamp,
  }

  console.log('[Ping] Sending pong:', pong)
  return pong
}

function handleStatusMessage(info) {
  console.log('[Status] Status query:', info)

  // 返回插件状态
  const status = {
    status: 'active',
    version: '1.0.0',
    uptime: Date.now(),
    features: ['translate', 'search', 'ping'],
    memory: {
      used: Math.random() * 100,
      total: 100,
    },
  }

  console.log('[Status] Plugin status:', status)
  return status
}

function handleProcessDataMessage(info) {
  console.log('[Process Data] Processing data:', info)

  // 模拟数据处理
  const processedData = {
    original: info.data,
    processed: {
      ...info.data,
      processedAt: Date.now(),
      processedBy: 'plugin-receiver',
    },
    metadata: {
      ...info.data.metadata,
      processingTime: Math.random() * 100,
    },
  }

  console.log('[Process Data] Processed data:', processedData)
  return processedData
}

function handleGetResultMessage(info) {
  console.log('[Get Result] Result request:', info)

  // 返回处理结果
  const result = {
    requestId: info.requestId,
    status: 'completed',
    result: {
      message: 'Data processed successfully',
      timestamp: Date.now(),
    },
  }

  console.log('[Get Result] Returning result:', result)
  return result
}

function handleHealthCheckMessage(info) {
  console.log('[Health Check] Health check request:', info)

  // 返回健康状态
  const health = {
    status: 'healthy',
    timestamp: Date.now(),
    checks: {
      memory: 'ok',
      cpu: 'ok',
      network: 'ok',
    },
  }

  console.log('[Health Check] Health status:', health)
  return health
}

// 导出生命周期对象
module.exports = featureLifeCycle
