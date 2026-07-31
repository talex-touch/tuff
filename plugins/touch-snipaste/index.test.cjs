const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')

const sourcePath = path.join(__dirname, 'index.js')
const source = fs.readFileSync(sourcePath, 'utf8')

class TuffItemBuilder {
  constructor(id) {
    this.item = { id, actions: [], meta: {} }
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

  createAndAddAction(id, type, label, payload) {
    this.item.actions.push({ id, type, label, payload })
    return this
  }

  build() {
    return this.item
  }
}

function createHarness(options = {}) {
  const state = { calls: [], items: [], order: [] }
  const context = {
    module: { exports: {} },
    exports: {},
    logger: { error() {} },
    platform: { platform: options.platform || 'darwin', arch: 'arm64' },
    TuffItemBuilder,
    plugin: {
      feature: {
        async clearItems() {
          state.order.push('clear')
          state.items = []
        },
        async pushItems(items) {
          state.order.push('push')
          state.items = items
        },
      },
      snipaste: options.withoutCapability
        ? undefined
        : {
            async runAction(actionId) {
              state.calls.push(actionId)
              if (options.error)
                throw options.error
              return options.result || { actionId, status: 'started' }
            },
          },
    },
  }
  context.globalThis = context
  vm.runInNewContext(source, context, { filename: sourcePath })
  return { lifecycle: context.module.exports, state }
}

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

test('production Prelude exports lifecycle hooks only and has no privileged child surface', () => {
  const harness = createHarness()
  assert.deepEqual(Object.keys(harness.lifecycle).sort(), [
    'onDestroy',
    'onFeatureTriggered',
    'onInit',
    'onItemAction',
  ])
  assert.doesNotMatch(source, /\b__test\b/)
  assert.doesNotMatch(source, /\brequire\s*\(/)
  assert.doesNotMatch(source, /\bnode:(?:child_process|path)\b/)
  assert.doesNotMatch(source, /(?:^|[^.\w])process\s*(?:\.|\[)/m)
  assert.doesNotMatch(source, /SNIPASTE_PATH|snipastePath|custom-snip|settings\.json/)
})

test('feature trigger publishes the seven fixed workflows in awaited order', async () => {
  const harness = createHarness()

  assert.equal(
    await harness.lifecycle.onFeatureTriggered('snipaste-quick', { text: '' }),
    true,
  )
  assert.deepEqual(harness.state.order, ['clear', 'push'])
  assert.deepEqual(
    plain(harness.state.items.map(item => item.actions[0].payload.actionId)),
    ['launch', 'snip', 'snip-full', 'paste', 'pick-color', 'toggle-images', 'docs'],
  )
  for (const item of harness.state.items) {
    assert.deepEqual(plain(item.icon), { type: 'class', value: 'i-ri-screenshot-2-line' })
    assert.equal(item.meta.pluginName, 'touch-snipaste')
    assert.doesNotMatch(JSON.stringify(item), /Applications|Program Files|snipastePath/)
  }
})

test('feature query filters fixed actions without accepting custom behavior', async () => {
  const harness = createHarness()
  await harness.lifecycle.onFeatureTriggered('snipaste-quick', { text: '取色' })

  assert.equal(harness.state.items.length, 1)
  assert.equal(harness.state.items[0].actions[0].payload.actionId, 'pick-color')
  assert.equal(await harness.lifecycle.onFeatureTriggered('other-feature', { text: '' }), false)
})

test('item action invokes only the fixed purpose facade', async () => {
  const harness = createHarness()
  await harness.lifecycle.onFeatureTriggered('snipaste-quick', { text: '截图' })
  const item = harness.state.items.find(entry => entry.actions[0].payload.actionId === 'snip')

  const result = await harness.lifecycle.onItemAction(item, { actionId: 'run-action' })

  assert.deepEqual(plain(result), {
    externalAction: true,
    success: true,
    status: 'started',
  })
  assert.deepEqual(harness.state.calls, ['snip'])
})

test('host blocked results remain stable and redacted', async () => {
  const harness = createHarness({
    result: { actionId: 'launch', status: 'blocked', reason: 'not-installed' },
  })
  await harness.lifecycle.onFeatureTriggered('snipaste-quick', { text: '启动' })

  const result = await harness.lifecycle.onItemAction(harness.state.items[0], {
    actionId: 'run-action',
  })

  assert.deepEqual(plain(result), {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'not-installed',
    message: '未在受信任位置找到 Snipaste',
  })
  assert.doesNotMatch(JSON.stringify(result), /Applications|Program Files|private/)
})

test('capability errors map to deterministic failure without native detail', async () => {
  const error = Object.assign(new Error('/private/Snipaste native failure'), {
    code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED',
  })
  const harness = createHarness({ error })
  await harness.lifecycle.onFeatureTriggered('snipaste-quick', { text: '截图' })

  const result = await harness.lifecycle.onItemAction(harness.state.items[0], {
    actionId: 'run-action',
  })

  assert.deepEqual(plain(result), {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'permission-denied',
    message: '缺少 system.shell 权限',
  })
  assert.doesNotMatch(JSON.stringify(result), /private|native failure/)
})

test('missing facade and forged item action fail closed without host work', async () => {
  const missing = createHarness({ withoutCapability: true })
  await missing.lifecycle.onFeatureTriggered('snipaste-quick', { text: '截图' })
  const missingResult = await missing.lifecycle.onItemAction(missing.state.items[0], {
    actionId: 'run-action',
  })
  assert.equal(missingResult.reason, 'process-capability-unavailable')

  const harness = createHarness()
  const forged = {
    meta: { defaultAction: 'snipaste-action' },
    actions: [{ id: 'run-action', payload: { actionId: 'custom-command' } }],
  }
  const forgedResult = await harness.lifecycle.onItemAction(forged, { actionId: 'run-action' })
  assert.equal(forgedResult.reason, 'invalid-action')
  assert.deepEqual(harness.state.calls, [])
})
