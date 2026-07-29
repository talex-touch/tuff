const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const state = {
  features: [],
  items: [],
  systemCalls: [],
  systemResult: { actionId: 'lock-screen', status: 'started' },
}

class FakeBuilder {
  constructor(id) {
    this.item = { id }
    this.basic = {}
  }

  setSource(type, id, name) {
    this.item.source = { type, id, name }
    return this
  }

  setTitle(title) {
    this.basic.title = title
    return this
  }

  setSubtitle(subtitle) {
    this.basic.subtitle = subtitle
    return this
  }

  setIcon(icon) {
    this.basic.icon = icon
    return this
  }

  setMeta(meta) {
    this.item.meta = meta
    return this
  }

  createAndAddAction(id, type, label, payload) {
    this.item.actions = [{ id, type, label, payload }]
    return this
  }

  build() {
    return { ...this.item, render: { mode: 'default', basic: this.basic } }
  }
}

globalThis.plugin = {
  feature: {
    async clearItems() {
      state.items = []
    },
    async pushItems(items) {
      state.items = items
    },
  },
}
globalThis.features = {
  async addFeature(feature) {
    state.features.push(feature)
    return true
  },
}
globalThis.system = {
  async runAction(actionId) {
    state.systemCalls.push(actionId)
    return state.systemResult
  },
}
globalThis.platform = { platform: 'darwin', arch: 'arm64' }
globalThis.logger = { error() {}, info() {} }
globalThis.TuffItemBuilder = FakeBuilder

const filename = path.join(__dirname, 'index.js')
const source = fs.readFileSync(filename, 'utf8')
const loaded = new Module(filename, module)
loaded.filename = filename
loaded.paths = Module._nodeModulePaths(__dirname)
loaded._compile(source, filename)
const pluginModule = loaded.exports

test.beforeEach(() => {
  state.items = []
  state.systemCalls = []
  state.systemResult = { actionId: 'lock-screen', status: 'started' }
})

test('production Prelude has no privileged or test-only child surface', () => {
  for (const pattern of [
    /\b__test\b/,
    /\brequire\s*\(/,
    /\bfetch\s*\(/,
    /(?:^|[^.\w])process\s*(?:\.|\[)/m,
    /\bnode:(?:fs|child_process|sqlite|worker_threads)\b/,
    /\bdialog\b/,
    /\b(?:command|executable|args|cwd|env|url|script)\s*:/,
  ]) {
    assert.doesNotMatch(source, pattern)
  }
  assert.deepEqual(Object.keys(pluginModule).sort(), ['onDestroy', 'onFeatureTriggered', 'onInit', 'onItemAction'])
})

test('onInit awaits registration of all fixed display-only features', async () => {
  await pluginModule.onInit()

  assert.equal(state.features.length, 8)
  assert.deepEqual(
    state.features.map(feature => feature.id),
    [
      'quick-action-restart',
      'quick-action-shutdown',
      'quick-action-lock-screen',
      'quick-action-mute-toggle',
      'quick-action-focus-settings',
      'quick-action-notification-settings',
      'quick-action-sound-settings',
      'quick-action-display-settings',
    ],
  )
  assert.deepEqual(state.features[0].platform, {
    win: { enable: false, arch: [], os: [] },
    darwin: { enable: true, arch: [], os: [] },
    linux: { enable: false, arch: [], os: [] },
  })
  assert.equal(
    state.features.some(feature => 'command' in feature),
    false,
  )
})

test('feature trigger publishes action IDs without command payloads', async () => {
  await pluginModule.onFeatureTriggered('quick-actions', { text: '' })

  assert.equal(state.items.length, 5)
  const firstAction = state.items[0].actions[0]
  assert.equal(firstAction.id, 'run-action')
  assert.equal(firstAction.payload.actionId, 'restart')
  assert.equal(JSON.stringify(state.items).includes('command'), false)
})

test('safe item action invokes only the fixed system action ID', async () => {
  await pluginModule.onFeatureTriggered('quick-actions', { text: '锁屏' })
  const item = state.items.find(entry => entry.actions?.[0]?.payload?.actionId === 'lock-screen')
  assert.ok(item)

  const result = await pluginModule.onItemAction(item, { actionId: 'run-action' })

  assert.deepEqual(state.systemCalls, ['lock-screen'])
  assert.equal(result.status, 'started')
  assert.equal(result.success, true)
})

test('main-owned blocked status is preserved without local execution fallback', async () => {
  state.systemResult = {
    actionId: 'shutdown',
    status: 'blocked',
    reason: 'confirmation-denied',
  }

  const result = await pluginModule.onFeatureTriggered('quick-action-shutdown', { text: '' })

  assert.deepEqual(state.systemCalls, ['shutdown'])
  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'confirmation-denied')
  assert.equal(result.success, false)
})
