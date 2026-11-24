const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
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

  setMeta(meta) {
    this.item.meta = { ...this.item.meta, ...meta }
    return this
  }

  createAndAddAction(id, type, label, payload) {
    this.item.actions.push({ id, type, label, primary: this.item.actions.length === 0, payload })
    return this
  }

  build() {
    return this.item
  }
}

function loadFreshPluginModule({ feature, clipboard = {}, logger = {} }) {
  globalThis.plugin = { feature }
  globalThis.clipboard = clipboard
  globalThis.logger = logger
  globalThis.TuffItemBuilder = FakeBuilder
  delete require.cache[require.resolve('./index.js')]
  const pluginModule = require('./index.js')
  delete require.cache[require.resolve('./index.js')]
  return pluginModule
}

function createFeatureHarness() {
  const state = { items: [] }
  return {
    state,
    feature: {
      async clearItems() {
        state.items = []
      },
      async pushItems(items) {
        state.items = items
      },
    },
  }
}

test('onFeatureTriggered matches command prefixes, chinese keywords and kaomoji (颜文字)', async () => {
  const harness = createFeatureHarness()
  const emojiPlugin = loadFreshPluginModule({ feature: harness.feature })

  await emojiPlugin.onFeatureTriggered('emoji-symbols', { text: 'emoji check' })
  assert.equal(harness.state.items[0].title, '✅ Check Mark')

  await emojiPlugin.onFeatureTriggered('emoji-symbols', { text: '符号 人民币' })
  assert.equal(harness.state.items[0].title, '¥ Yen / Yuan Sign')

  await emojiPlugin.onFeatureTriggered('emoji-symbols', { text: '颜文字' })
  assert.ok(harness.state.items.length >= 10, 'expected rich kaomoji results for 颜文字')
  assert.ok(harness.state.items.every(item => item.subtitle.startsWith('kaomoji')))

  await emojiPlugin.onFeatureTriggered('emoji-symbols', { text: '颜文字 摊手' })
  assert.equal(harness.state.items[0].actions[0].payload.text, '¯\\_(ツ)_/¯')
})

test('onFeatureTriggered creates deterministic empty state', async () => {
  const harness = createFeatureHarness()
  const emojiPlugin = loadFreshPluginModule({ feature: harness.feature })

  await emojiPlugin.onFeatureTriggered('emoji-symbols', { text: 'not-a-symbol-value' })

  assert.equal(harness.state.items.length, 1)
  assert.equal(harness.state.items[0].id, 'emoji-symbols-empty')
})

test('onFeatureTriggered awaits clear before publishing items and drops stale runs on destroy', async () => {
  let releaseClear
  let pushed = false
  const clearBarrier = new Promise((resolve) => {
    releaseClear = resolve
  })
  const feature = {
    clearItems: () => clearBarrier,
    async pushItems() {
      pushed = true
    },
  }
  const emojiPlugin = loadFreshPluginModule({ feature })

  const trigger = emojiPlugin.onFeatureTriggered('emoji-symbols', { text: 'rocket' })
  await Promise.resolve()
  assert.equal(pushed, false)
  releaseClear()
  await trigger
  assert.equal(pushed, true)

  pushed = false
  let releaseStale
  feature.clearItems = () => new Promise((resolve) => {
    releaseStale = resolve
  })
  const stale = emojiPlugin.onFeatureTriggered('emoji-symbols', { text: 'rocket' })
  await emojiPlugin.onDestroy()
  releaseStale()
  await stale
  assert.equal(pushed, false)
})

test('onFeatureTriggered publishes a stable fallback after the first capability failure', async () => {
  let clearCalls = 0
  const published = []
  const logs = []
  const emojiPlugin = loadFreshPluginModule({
    feature: {
      async clearItems() {
        clearCalls += 1
        if (clearCalls === 1)
          throw new Error('/private/first-capability-failure')
      },
      async pushItems(items) {
        published.push(items)
      },
    },
    logger: {
      error(message) {
        logs.push(message)
      },
    },
  })

  const result = await emojiPlugin.onFeatureTriggered('emoji-symbols', { text: 'rocket' })

  assert.equal(result, true)
  assert.equal(clearCalls, 2)
  assert.equal(published.length, 1)
  assert.equal(published[0][0].id, 'emoji-symbols-error')
  assert.deepEqual(logs, ['[touch-emoji-symbols] feature failed'])
  assert.doesNotMatch(JSON.stringify(published), /private|first-capability/)
})

test('onFeatureTriggered contains a failed fallback without leaking host errors', async () => {
  const logs = []
  const emojiPlugin = loadFreshPluginModule({
    feature: {
      async clearItems() {
        throw new Error('/private/persistent-capability-failure')
      },
      async pushItems() {
        throw new Error('/private/fallback-push-failure')
      },
    },
    logger: {
      error(message) {
        logs.push(message)
      },
    },
  })

  const result = await emojiPlugin.onFeatureTriggered('emoji-symbols', { text: 'rocket' })

  assert.equal(result, false)
  assert.deepEqual(logs, [
    '[touch-emoji-symbols] feature failed',
    '[touch-emoji-symbols] fallback failed',
  ])
})

test('onItemAction copies without a child-side permission request and honors context.actionId', async () => {
  const writes = []
  const emojiPlugin = loadFreshPluginModule({
    feature: createFeatureHarness().feature,
    clipboard: {
      async writeText(value) {
        writes.push(value)
      },
    },
  })

  const result = await emojiPlugin.onItemAction({
    meta: { defaultAction: 'copy' },
    actions: [
      { id: 'copy', type: 'plugin', payload: { text: '🚀' } },
      { id: 'copy-alt', type: 'plugin', payload: { text: '¯\\_(ツ)_/¯' } },
    ],
  })
  assert.deepEqual(writes, ['🚀'])
  assert.deepEqual(result, { externalAction: true, status: 'started' })

  const altResult = await emojiPlugin.onItemAction(
    {
      meta: { defaultAction: 'copy' },
      actions: [
        { id: 'copy', type: 'plugin', payload: { text: '🚀' } },
        { id: 'copy-alt', type: 'plugin', payload: { text: '¯\\_(ツ)_/¯' } },
      ],
    },
    { actionId: 'copy-alt' },
  )
  assert.deepEqual(writes, ['🚀', '¯\\_(ツ)_/¯'])
  assert.deepEqual(altResult, { externalAction: true, status: 'started' })

  const invalid = await emojiPlugin.onItemAction(
    {
      meta: { defaultAction: 'copy' },
      actions: [{ id: 'copy', type: 'plugin', payload: { text: '🚀' } }],
    },
    { actionId: 'missing' },
  )
  assert.equal(invalid.status, 'blocked')
  assert.equal(invalid.reason, 'invalid-action')
})

test('onItemAction fails closed when clipboard capability is undeclared', async () => {
  const emojiPlugin = loadFreshPluginModule({ feature: createFeatureHarness().feature })

  const result = await emojiPlugin.onItemAction({
    meta: { defaultAction: 'copy' },
    actions: [{ id: 'copy', type: 'plugin', payload: { text: '✨' } }],
  })

  assert.equal(result.externalAction, true)
  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'clipboard-unavailable')
})

test('onItemAction returns a stable redacted failure when host write rejects', async () => {
  const logs = []
  const emojiPlugin = loadFreshPluginModule({
    feature: createFeatureHarness().feature,
    clipboard: {
      async writeText() {
        throw new Error('/private/native clipboard detail')
      },
    },
    logger: {
      error(message) {
        logs.push(message)
      },
    },
  })

  const result = await emojiPlugin.onItemAction({
    meta: { defaultAction: 'copy' },
    actions: [{ id: 'copy', type: 'plugin', payload: { text: '✨' } }],
  })

  assert.deepEqual(result, {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'clipboard-write-failed',
    message: '复制失败',
  })
  assert.deepEqual(logs, ['[touch-emoji-symbols] clipboard write failed'])
  assert.doesNotMatch(JSON.stringify(result), /private|native clipboard/)
})

test('onItemAction distinguishes permission denial, permission-unavailable, cancelled and timeout', async () => {
  const cases = [
    ['PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED', 'blocked', 'permission-denied', '缺少 clipboard.write 权限'],
    ['PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE', 'blocked', 'permission-unavailable', '权限系统暂时不可用'],
    ['PLUGIN_HOST_CAPABILITY_CANCELLED', 'cancelled', 'cancelled', '已取消复制'],
    ['PLUGIN_HOST_CAPABILITY_TIMEOUT', 'failed', 'timeout', '复制超时，请重试'],
  ]

  for (const [code, status, reason, message] of cases) {
    const emojiPlugin = loadFreshPluginModule({
      feature: createFeatureHarness().feature,
      clipboard: {
        async writeText() {
          throw Object.assign(new Error('/private/permission detail'), { code })
        },
      },
    })

    const result = await emojiPlugin.onItemAction({
      meta: { defaultAction: 'copy' },
      actions: [{ id: 'copy', type: 'plugin', payload: { text: '✨' } }],
    })

    assert.deepEqual(result, {
      externalAction: true,
      success: false,
      status,
      reason,
      message,
    })
    assert.doesNotMatch(JSON.stringify(result), /private|permission detail/)
  }
})

test('manifest, logo asset and package.json align with npm metadata contract', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'))
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'))

  assert.equal(manifest.icon.type, 'file')
  assert.equal(manifest.icon.value, 'assets/logo.svg')
  assert.equal(fs.existsSync(path.join(__dirname, 'assets/logo.svg')), true)
  assert.equal(pkg.version, manifest.version)
  assert.equal(pkg.packageManager, 'pnpm@11.24.0')
  assert.ok(pkg.keywords.includes('tuff-plugin'))
  assert.equal(pkg.tuff.id, manifest.id)
  assert.equal(pkg.tuff.name, manifest.name)
})
