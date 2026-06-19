const assert = require('node:assert/strict')
const test = require('node:test')

function loadFreshPluginModule() {
  delete require.cache[require.resolve('./index.js')]
  const pluginModule = require('./index.js')
  delete require.cache[require.resolve('./index.js')]
  return pluginModule
}

globalThis.plugin = {
  feature: {
    clearItems() {},
    pushItems() {},
  },
}
globalThis.logger = {}
globalThis.quickOps = {}
globalThis.TuffItemBuilder = class {
  constructor(id) {
    this.item = { id, meta: {}, actions: [] }
  }

  setSource(type, id, name) {
    this.item.source = { type, id, name }
    return this
  }

  setTitle(title) {
    this.item.title = title
    return this
  }

  setSubtitle(subtitle) {
    this.item.subtitle = subtitle
    return this
  }

  setIcon(icon) {
    this.item.icon = icon
    return this
  }

  setMeta(meta) {
    this.item.meta = { ...this.item.meta, ...meta }
    return this
  }

  createAndAddAction(id, type, title, payload) {
    this.item.actions.push({ id, type, title, payload })
    return this
  }

  build() {
    return this.item
  }
}

const quickopsPlugin = loadFreshPluginModule()
const {
  buildResultItems,
  resolveConfirmationFlowAction,
  resolveMode,
  resolveSafeFlowAction,
} = quickopsPlugin.__test

test('resolveMode maps quickops queries to read-only views', () => {
  assert.equal(resolveMode('quickops'), 'capabilities')
  assert.equal(resolveMode('quickops status'), 'sessions')
  assert.equal(resolveMode('quickops audit'), 'audit')
  assert.equal(resolveMode('system info'), 'system-info')
  assert.equal(resolveMode('disk space'), 'disk-space')
  assert.equal(resolveMode('deep directory usage'), 'directory-usage-deep')
  assert.equal(resolveMode('network status'), 'network-status')
  assert.equal(resolveMode('local ip'), 'local-ip')
  assert.equal(resolveMode('battery status'), 'battery-status')
  assert.equal(resolveMode('system proxy'), 'system-proxy')
  assert.equal(resolveMode('快捷工具 状态'), 'sessions')
  assert.equal(resolveMode('快捷工具 审计'), 'audit')
  assert.equal(resolveMode('系统信息'), 'system-info')
  assert.equal(resolveMode('磁盘空间'), 'disk-space')
  assert.equal(resolveMode('网络状态'), 'network-status')
})

test('buildResultItems renders capability summary without mutation actions', async () => {
  const calls = []
  const items = await buildResultItems('quickops', 'quickops', {
    async capabilities() {
      calls.push('capabilities')
      return {
        platform: 'darwin',
        enabled: true,
        entries: [
          {
            id: 'quickops.network.local',
            label: '本机 IP',
            status: 'supported',
            riskLevel: 'safe',
          },
          {
            id: 'quickops.network.portKill',
            label: '端口释放',
            status: 'disabled',
            riskLevel: 'danger',
            reason: 'copy-only-command',
          },
        ],
      }
    },
  })

  assert.deepEqual(calls, ['capabilities'])
  assert.equal(items[0].title, 'QuickOps 能力摘要')
  assert.equal(items[0].meta.mode, 'capabilities')
  assert.equal(items[0].actions.length, 0)
  assert.equal(items[2].meta.capabilityId, 'quickops.network.local')
})

test('buildResultItems renders sessions view through quickOps facade', async () => {
  const calls = []
  const items = await buildResultItems('quickops', 'quickops sessions', {
    async sessions() {
      calls.push('sessions')
      return {
        state: 'running',
        count: 1,
        text: '1 running session',
        sessions: [
          {
            id: 'timer',
            kind: 'timer',
            title: '计时器',
            state: 'running',
            displayDurationText: '10:00',
          },
        ],
      }
    },
  })

  assert.deepEqual(calls, ['sessions'])
  assert.equal(items[0].title, 'QuickOps 正在运行')
  assert.equal(items[1].meta.sessionId, 'timer')
  assert.equal(items[1].actions.length, 0)
})

test('buildResultItems renders safe state actions as plugin Flow dispatch items', async () => {
  assert.equal(resolveSafeFlowAction('stop timer').targetId, 'quickops.stop-timer')
  assert.equal(resolveSafeFlowAction('暂停番茄钟').targetId, 'quickops.pause-pomodoro')
  assert.equal(resolveSafeFlowAction('reset stopwatch').targetId, 'quickops.reset-stopwatch')

  const items = await buildResultItems('quickops', 'stop timer', {})

  assert.equal(items.length, 1)
  assert.equal(items[0].title, '停止计时器')
  assert.equal(items[0].meta.mode, 'flow-action')
  assert.equal(items[0].meta.defaultAction, 'quickops-flow-action')
  assert.equal(items[0].meta.flowTargetId, 'quickops.stop-timer')
  assert.deepEqual(items[0].meta.payload.options, {
    preferredTarget: 'quickops.stop-timer',
    skipSelector: true,
    requireAck: true,
  })
  assert.deepEqual(items[0].meta.payload.payload, {
    type: 'json',
    data: {
      action: 'stop-timer',
      targetId: 'quickops.stop-timer',
    },
    context: {
      sourcePluginId: 'touch-quickops',
    },
  })
  assert.equal(items[0].actions.length, 1)
})

test('buildResultItems blocks confirmation-only actions in plugin shell', async () => {
  assert.equal(resolveConfirmationFlowAction('start timer').targetId, 'quickops.start-timer')

  const items = await buildResultItems('quickops', 'start timer 10m', {})

  assert.equal(items.length, 1)
  assert.equal(items[0].meta.mode, 'confirmation-required')
  assert.equal(items[0].meta.requiresConfirmation, true)
  assert.equal(items[0].meta.flowTargetId, 'quickops.start-timer')
  assert.match(items[0].subtitle, /confirmationToken/)
  assert.equal(items[0].actions.length, 0)
})

test('buildResultItems renders audit view without payload values', async () => {
  const items = await buildResultItems('quickops', 'quickops audit', {
    async auditRecent(request) {
      assert.deepEqual(request, { limit: 8 })
      return {
        state: 'ready',
        count: 1,
        limit: 8,
        maxEntries: 100,
        entries: [
          {
            id: 'audit-1',
            at: Date.now(),
            source: 'flow',
            targetId: 'copy-to-clipboard',
            decision: 'delivered',
            requiresConfirmation: true,
            payloadKeys: ['text'],
          },
        ],
      }
    },
  })

  assert.equal(items[1].title, 'copy-to-clipboard · delivered')
  assert.match(items[1].subtitle, /keys:text/)
  assert.doesNotMatch(items[1].subtitle, /secret-value/)
  assert.equal(items[1].actions.length, 0)
})

test('onItemAction dispatches safe QuickOps Flow action', async () => {
  const calls = []
  const originalFlow = globalThis.flow
  globalThis.flow = {
    async dispatch(payload, options) {
      calls.push({ payload, options })
      return {
        sessionId: 'flow-session-1',
        state: 'COMPLETED',
        ackPayload: { state: 'stopped', stopped: true },
      }
    },
  }

  try {
    const freshPlugin = loadFreshPluginModule()
    const result = await freshPlugin.onItemAction({
      meta: {
        defaultAction: 'quickops-flow-action',
        payload: {
          targetId: 'quickops.stop-timer',
          payload: {
            type: 'json',
            data: { action: 'stop-timer', targetId: 'quickops.stop-timer' },
            context: { sourcePluginId: 'touch-quickops' },
          },
          options: {
            preferredTarget: 'quickops.stop-timer',
            skipSelector: true,
            requireAck: true,
          },
        },
      },
    })

    assert.deepEqual(calls, [
      {
        payload: {
          type: 'json',
          data: { action: 'stop-timer', targetId: 'quickops.stop-timer' },
          context: { sourcePluginId: 'touch-quickops' },
        },
        options: {
          preferredTarget: 'quickops.stop-timer',
          skipSelector: true,
          requireAck: true,
        },
      },
    ])
    assert.equal(result.externalAction, true)
    assert.equal(result.success, true)
    assert.equal(result.status, 'COMPLETED')
    assert.match(result.message, /stopped/)
  }
  finally {
    globalThis.flow = originalFlow
  }
})

test('onItemAction fails closed when Flow SDK is unavailable', async () => {
  const originalFlow = globalThis.flow
  globalThis.flow = undefined

  try {
    const freshPlugin = loadFreshPluginModule()
    const result = await freshPlugin.onItemAction({
      meta: {
        defaultAction: 'quickops-flow-action',
        payload: {
          targetId: 'quickops.stop-timer',
          payload: { type: 'json', data: {} },
          options: { preferredTarget: 'quickops.stop-timer' },
        },
      },
    })

    assert.equal(result.externalAction, true)
    assert.equal(result.success, false)
    assert.equal(result.reason, 'flow-sdk-unavailable')
  }
  finally {
    globalThis.flow = originalFlow
  }
})

test('buildResultItems routes system info to the plugin read-only tool surface', async () => {
  const calls = []
  const items = await buildResultItems('quickops', 'system info', {
    async systemInfo() {
      calls.push('systemInfo')
      return {
        text: 'System info',
        systemInfo: {
          osType: 'Darwin',
          osRelease: '25.0.0',
          platform: 'darwin',
          arch: 'arm64',
          cpuModel: 'Apple M',
          cpuCount: 10,
          totalMemoryBytes: 16 * 1024 * 1024 * 1024,
          freeMemoryBytes: 8 * 1024 * 1024 * 1024,
          uptimeSeconds: 7200,
          loadAverage: [1, 2, 3],
        },
      }
    },
  })

  assert.deepEqual(calls, ['systemInfo'])
  assert.equal(items[0].title, 'QuickOps 系统信息')
  assert.equal(items[0].meta.mode, 'system-info')
  assert.equal(items[0].meta.runtimeBoundary, 'official-plugin')
  assert.equal(items[0].actions.length, 0)
  assert.match(items[1].subtitle, /Apple M/)
})

test('buildResultItems renders disk and directory read-only summaries', async () => {
  const calls = []
  const api = {
    async diskSpace() {
      calls.push('diskSpace')
      return {
        state: 'ready',
        text: 'Home: 10 GB free',
        diskSpace: {
          entries: [
            {
              label: 'Home',
              path: '~',
              totalBytes: 100 * 1024 * 1024 * 1024,
              freeBytes: 10 * 1024 * 1024 * 1024,
              usedBytes: 90 * 1024 * 1024 * 1024,
              usedPercent: 90,
            },
          ],
        },
      }
    },
    async directoryUsage(request) {
      calls.push(`directoryUsage:${request.deep}`)
      return {
        state: 'ready',
        text: 'Directory usage',
        directoryUsage: {
          scanDepth: request.deep ? 3 : 1,
          maxEntriesPerDirectory: 200,
          entries: [
            {
              label: 'Downloads',
              path: '~/Downloads',
              directFileBytes: 1024,
              totalFileBytes: 2048,
              fileCount: 2,
              directoryCount: 1,
              otherCount: 0,
              scannedEntryCount: 3,
              truncated: false,
            },
          ],
        },
      }
    },
  }

  const diskItems = await buildResultItems('quickops', 'disk space', api)
  const dirItems = await buildResultItems('quickops', 'deep directory usage', api)

  assert.deepEqual(calls, ['diskSpace', 'directoryUsage:true'])
  assert.equal(diskItems[0].meta.mode, 'disk-space')
  assert.equal(diskItems[1].title, 'Home · 90% used')
  assert.equal(dirItems[0].meta.mode, 'directory-usage-deep')
  assert.equal(dirItems[1].subtitle, 'files:2 · dirs:1 · scanned:3')
  assert.equal(diskItems[0].actions.length, 0)
  assert.equal(dirItems[0].actions.length, 0)
})

test('buildResultItems renders network and local ip read-only summaries', async () => {
  const calls = []
  const api = {
    async networkStatus() {
      calls.push('networkStatus')
      return {
        text: 'Network status',
        networkStatus: {
          addresses: [
            { name: 'en0', family: 'IPv4', address: '192.168.2.10' },
          ],
          dnsServers: ['192.168.2.1'],
          proxyStatus: 'not-detected',
          proxies: [],
        },
      }
    },
    async queryLocalIp() {
      calls.push('queryLocalIp')
      return {
        text: 'Local IP',
        addresses: [
          { name: 'en0', family: 'IPv4', address: '192.168.2.10' },
        ],
      }
    },
  }

  const networkItems = await buildResultItems('quickops', 'network status', api)
  const localIpItems = await buildResultItems('quickops', 'local ip', api)

  assert.deepEqual(calls, ['networkStatus', 'queryLocalIp'])
  assert.equal(networkItems[0].title, 'QuickOps 网络状态')
  assert.equal(networkItems[1].title, 'en0 · IPv4')
  assert.equal(localIpItems[0].title, 'en0 · IPv4')
  assert.equal(networkItems[0].actions.length, 0)
  assert.equal(localIpItems[0].actions.length, 0)
})

test('buildResultItems renders developer network read-only tools through quickOps facade', async () => {
  const calls = []
  const api = {
    async portStatus(request) {
      calls.push(['portStatus', request])
      return {
        state: 'occupied',
        available: false,
        port: 5173,
        host: '127.0.0.1',
        process: {
          pid: 42,
          name: 'vite',
          source: 'lsof',
        },
        releaseCommand: 'kill 42',
      }
    },
    async dnsQuery(request) {
      calls.push(['dnsQuery', request])
      return {
        state: 'resolved',
        text: 'DNS example.com',
        dnsQuery: {
          hostname: 'example.com',
          records: [
            { type: 'A', value: '93.184.216.34' },
            { type: 'MX', value: 'mail.example.com', priority: 10 },
          ],
          failedTypes: [],
          deep: true,
        },
      }
    },
  }

  const portItems = await buildResultItems('quickops', 'port 5173', api)
  const dnsItems = await buildResultItems('quickops', 'deep dns example.com', api)

  assert.deepEqual(calls, [
    ['portStatus', { port: 5173, text: 'port 5173' }],
    ['dnsQuery', { hostname: 'example.com', text: 'deep dns example.com', deep: true }],
  ])
  assert.equal(portItems[0].meta.mode, 'port-status')
  assert.equal(portItems[0].meta.available, false)
  assert.equal(portItems[1].meta.copyOnly, true)
  assert.equal(dnsItems[0].meta.mode, 'dns-query')
  assert.equal(dnsItems[1].title, 'A')
  assert.equal(portItems[0].actions.length, 0)
  assert.equal(dnsItems[0].actions.length, 0)
})

test('buildResultItems renders file and text read-only tools through quickOps facade', async () => {
  const calls = []
  const api = {
    async fileHash(request) {
      calls.push(['fileHash', request])
      return {
        state: 'hashed',
        path: '/tmp/demo.txt',
        fileName: 'demo.txt',
        size: 12,
        hashes: {
          md5: 'md5-value',
          sha1: 'sha1-value',
          sha256: 'sha256-value',
        },
      }
    },
    async fileBase64(request) {
      calls.push(['fileBase64', request])
      return {
        state: 'encoded',
        path: '/tmp/demo.txt',
        fileName: 'demo.txt',
        size: 12,
        base64: 'ZGVtbw==',
      }
    },
    async recentDownload() {
      calls.push(['recentDownload'])
      return {
        state: 'found',
        path: '/tmp/Downloads/latest.zip',
        fileName: 'latest.zip',
        size: 1024,
        modifiedAt: 1781800000000,
      }
    },
    async commonDirectory(request) {
      calls.push(['commonDirectory', request])
      return {
        state: 'resolved',
        directoryId: 'logs',
        title: '日志',
        subtitle: 'Logs',
        path: '/tmp/tuff/logs',
        commonDirectory: {
          id: 'logs',
          title: '日志',
          subtitle: 'Logs',
          path: '/tmp/tuff/logs',
        },
      }
    },
    async pathFormat(request) {
      calls.push(['pathFormat', request])
      return {
        state: 'formatted',
        path: '/tmp/demo.txt',
        fileName: 'demo.txt',
        formats: {
          raw: '/tmp/demo.txt',
          shell: '\'/tmp/demo.txt\'',
          fileUrl: 'file:///tmp/demo.txt',
        },
      }
    },
    async formatText(request) {
      calls.push(['formatText', request])
      return {
        state: 'formatted',
        mode: request.mode,
        inputCharCount: request.text.length,
        outputCharCount: 10,
        truncated: false,
        text: 'hello_world',
      }
    },
  }

  const hashItems = await buildResultItems('quickops', 'file hash "/tmp/demo.txt"', api)
  const base64Items = await buildResultItems('quickops', 'file base64 "/tmp/demo.txt"', api)
  const recentItems = await buildResultItems('quickops', 'recent download', api)
  const directoryItems = await buildResultItems('quickops', 'common directory logs', api)
  const pathItems = await buildResultItems('quickops', 'path format "/tmp/demo.txt"', api)
  const textItems = await buildResultItems('quickops', 'format text snake "Hello World"', api)

  assert.deepEqual(calls, [
    ['fileHash', { path: '/tmp/demo.txt', text: 'file hash "/tmp/demo.txt"' }],
    ['fileBase64', { path: '/tmp/demo.txt', text: 'file base64 "/tmp/demo.txt"' }],
    ['recentDownload'],
    ['commonDirectory', { query: 'logs', text: 'common directory logs' }],
    ['pathFormat', { path: '/tmp/demo.txt', text: 'path format "/tmp/demo.txt"' }],
    ['formatText', { mode: 'snake', text: 'Hello World' }],
  ])
  assert.equal(hashItems[0].meta.mode, 'file-hash')
  assert.equal(base64Items[0].meta.mode, 'file-base64')
  assert.equal(recentItems[0].meta.mode, 'recent-download')
  assert.equal(directoryItems[0].meta.directoryId, 'logs')
  assert.equal(pathItems[1].title, 'shell')
  assert.equal(textItems[0].subtitle, 'hello_world')
  assert.equal(hashItems[0].actions.length, 0)
  assert.equal(textItems[0].actions.length, 0)
})

test('buildResultItems renders degraded and unsupported read-only tools safely', async () => {
  const batteryItems = await buildResultItems('quickops', 'battery status', {
    async batteryStatus() {
      return {
        state: 'degraded',
        degradedReason: 'battery-unavailable',
        message: 'No battery',
      }
    },
  })
  const proxyItems = await buildResultItems('quickops', 'system proxy', {})

  assert.equal(batteryItems[0].meta.mode, 'battery-status')
  assert.equal(batteryItems[0].meta.state, 'degraded')
  assert.equal(batteryItems[0].actions.length, 0)
  assert.equal(proxyItems[0].meta.mode, 'system-proxy')
  assert.equal(proxyItems[0].meta.state, 'unsupported')
  assert.match(proxyItems[0].subtitle, /不会 fallback 到私有 IPC/)
  assert.equal(proxyItems[0].actions.length, 0)
})

test('onFeatureTriggered pushes rendered items', async () => {
  const pushed = []
  const originalFeature = globalThis.plugin.feature
  const originalQuickOps = globalThis.quickOps

  globalThis.plugin.feature = {
    clearItems() {
      pushed.length = 0
    },
    pushItems(items) {
      pushed.push(...items)
    },
  }
  globalThis.quickOps = {
    async capabilities() {
      return {
        platform: 'darwin',
        enabled: true,
        entries: [],
      }
    },
  }

  try {
    const freshPlugin = loadFreshPluginModule()
    await freshPlugin.onFeatureTriggered('quickops', 'quickops')
    assert.equal(pushed[0].title, 'QuickOps 能力摘要')
  }
  finally {
    globalThis.plugin.feature = originalFeature
    globalThis.quickOps = originalQuickOps
  }
})
