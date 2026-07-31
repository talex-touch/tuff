const assert = require('node:assert/strict')
const test = require('node:test')

class FakeBuilder {
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

  setKind(kind) {
    this.item.kind = kind
    return this
  }

  setCustomRender(type, content, data) {
    this.item.render = { mode: 'custom', custom: { type, content, data } }
    return this
  }

  setClassName(className) {
    this.item.className = className
    return this
  }

  setFinalScore(score) {
    this.item.finalScore = score
    return this
  }

  setActions(actions) {
    this.item.actions = actions
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

function loadPlugin(options = {}) {
  const state = { items: [], flowCalls: [], logs: [] }
  globalThis.plugin = {
    feature: options.feature || {
      async clearItems() {
        state.items = []
      },
      async pushItems(items) {
        state.items = items
      },
    },
  }
  globalThis.quickOps = options.quickOps || {
    async capabilities() {
      return { platform: 'darwin', enabled: true, entries: [] }
    },
  }
  globalThis.flow = options.flow
  globalThis.logger = {
    error(...values) {
      state.logs.push(values)
    },
  }
  globalThis.TuffItemBuilder = FakeBuilder
  delete require.cache[require.resolve('./index.js')]
  const plugin = require('./index.js')
  delete require.cache[require.resolve('./index.js')]
  return { plugin, state }
}

function flowItem(items) {
  const item = items.find(entry => entry.meta.defaultAction === 'quickops-flow-action')
  if (!item)
    throw new Error('missing flow item')
  return item
}

test('onFeatureTriggered awaits clear before publishing QuickOps capability items', async () => {
  let releaseClear
  let pushed = false
  const clearBarrier = new Promise((resolve) => {
    releaseClear = resolve
  })
  const { plugin } = loadPlugin({
    feature: {
      clearItems: () => clearBarrier,
      async pushItems() {
        pushed = true
      },
    },
  })

  const pending = plugin.onFeatureTriggered('quickops', { text: 'quickops' })
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(pushed, false)
  releaseClear()
  assert.equal(await pending, true)
  assert.equal(pushed, true)
})

test('onFeatureTriggered publishes a stable redacted fallback when the host operation fails', async () => {
  const { plugin, state } = loadPlugin({
    quickOps: {
      async capabilities() {
        throw new Error('/private/quickops failure')
      },
    },
  })

  assert.equal(await plugin.onFeatureTriggered('quickops', { text: 'quickops' }), true)
  assert.equal(state.items[0].render.basic.title, 'QuickOps 加载失败')
  assert.equal(state.items[0].render.basic.subtitle, '宿主能力暂不可用')
  assert.deepEqual(state.logs, [['[touch-quickops] Failed to render QuickOps summary']])
  assert.doesNotMatch(JSON.stringify(state), /private|quickops failure/)
})

test('onItemAction returns a stable denial when the host rejects Flow permission', async () => {
  const { plugin, state } = loadPlugin({
    flow: {
      async dispatch(payload, options) {
        state.flowCalls.push({ payload, options })
        throw Object.assign(new Error('/private/flow permission'), {
          code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED',
        })
      },
    },
  })
  await plugin.onFeatureTriggered('quickops', { text: 'stop timer' })

  const result = await plugin.onItemAction(flowItem(state.items))

  assert.equal(state.flowCalls.length, 1)
  assert.deepEqual(result, {
    externalAction: true,
    success: false,
    status: 'blocked',
    targetId: 'quickops.stop-timer',
    reason: 'permission-denied',
    message: undefined,
  })
  assert.deepEqual(state.logs, [['[touch-quickops] Failed to dispatch QuickOps Flow action']])
  assert.doesNotMatch(JSON.stringify(result), /private|flow permission/)
})

test('onItemAction dispatches only the fixed Flow payload and awaits the acknowledgement', async () => {
  const { plugin, state } = loadPlugin({
    flow: {
      async dispatch(payload, options) {
        state.flowCalls.push({ payload, options })
        return { sessionId: 'flow-1', state: 'ACKED', ackPayload: { stopped: true } }
      },
    },
  })
  await plugin.onFeatureTriggered('quickops', { text: 'stop timer secret payload' })

  const result = await plugin.onItemAction(flowItem(state.items))

  assert.equal(result.success, true)
  assert.equal(result.status, 'ACKED')
  assert.equal(result.sessionId, 'flow-1')
  assert.deepEqual(state.flowCalls[0], {
    payload: {
      type: 'json',
      data: {
        action: 'stop-timer',
        targetId: 'quickops.stop-timer',
        cleanup: true,
        statefulRuntime: true,
      },
      context: { sourcePluginId: 'touch-quickops' },
    },
    options: {
      preferredTarget: 'quickops.stop-timer',
      skipSelector: true,
      requireAck: true,
    },
  })
  assert.doesNotMatch(JSON.stringify(state.flowCalls), /secret payload/)
})

test('onItemAction fails closed when the Flow facade is absent', async () => {
  const { plugin, state } = loadPlugin()
  await plugin.onFeatureTriggered('quickops', { text: 'stop timer' })

  assert.deepEqual(await plugin.onItemAction(flowItem(state.items)), {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'flow-sdk-unavailable',
  })
})
