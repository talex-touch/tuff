const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

class TestTuffItemBuilder {
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
    this.item.actions.push({ id, type, label, payload })
    return this
  }

  build() {
    return this.item
  }
}

const state = {
  items: [],
  calls: [],
  status: { operation: 'status', status: 'available', windowCount: 3 },
  result: {
    operation: 'run-action',
    actionId: 'preset-dev-split',
    status: 'completed',
    affectedWindows: 2,
  },
}

globalThis.platform = { platform: 'win32', arch: 'x64' }
globalThis.logger = { error() {} }
globalThis.TuffItemBuilder = TestTuffItemBuilder
globalThis.plugin = {
  feature: {
    async clearItems() {
      state.items = []
    },
    async pushItems(items) {
      state.items = items
    },
  },
  windowPresets: {
    async status() {
      state.calls.push({ operation: 'status' })
      return state.status
    },
    async runAction(actionId) {
      state.calls.push({ operation: 'run-action', actionId })
      return { ...state.result, actionId }
    },
  },
}

function loadPluginModule(filename) {
  const source = fs.readFileSync(filename, 'utf8')
  const mod = new Module(filename)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  mod._compile(source, filename)
  return mod.exports
}

const pluginModule = loadPluginModule(path.join(__dirname, 'index.js'))

test.beforeEach(() => {
  state.items = []
  state.calls = []
  state.status = { operation: 'status', status: 'available', windowCount: 3 }
  state.result = {
    operation: 'run-action',
    actionId: 'preset-dev-split',
    status: 'completed',
    affectedWindows: 2,
  }
  globalThis.platform.platform = 'win32'
})

test('publishes the count and all three fixed preset actions', async () => {
  assert.equal(await pluginModule.onFeatureTriggered('window-presets', ''), true)
  assert.equal(state.items.find(item => item.id === 'window-presets-window-count').subtitle, '3 个')
  assert.deepEqual(
    state.items.flatMap(item => item.actions || []).map(action => action.payload.actionId),
    ['preset-two-column', 'preset-dev-split', 'preset-clear-topmost'],
  )
  assert.deepEqual(state.calls, [{ operation: 'status' }])
  assert.equal(state.items.every(item => item.icon.type === 'class'), true)
})

test('executes only the fixed action selected from the standard item action', async () => {
  await pluginModule.onFeatureTriggered('window-presets', 'dev')
  const item = state.items.find(entry => entry.actions?.[0]?.payload?.actionId === 'preset-dev-split')
  const result = await pluginModule.onItemAction(item, { actionId: 'run-action' })
  assert.deepEqual(result, {
    externalAction: true,
    success: true,
    status: 'completed',
    message: '已处理 2 个窗口',
  })
  assert.deepEqual(state.calls.at(-1), {
    operation: 'run-action',
    actionId: 'preset-dev-split',
  })

  const invalid = await pluginModule.onItemAction({
    meta: { defaultAction: 'window-presets-action' },
    actions: [{ id: 'run-action', payload: { actionId: 'restart' } }],
  })
  assert.equal(invalid.reason, 'invalid-action')
  assert.equal(state.calls.filter(call => call.operation === 'run-action').length, 1)
})

test('keeps permission and unsupported outcomes stable and redacted', async () => {
  state.status = { operation: 'status', status: 'blocked', reason: 'permission-denied' }
  await pluginModule.onFeatureTriggered('window-presets', '')
  assert.equal(state.items[0].title, '缺少 system.shell 权限')

  state.result = {
    operation: 'run-action',
    actionId: 'preset-two-column',
    status: 'blocked',
    reason: 'permission-denied',
  }
  const item = state.items.find(entry => entry.actions?.[0]?.payload?.actionId === 'preset-two-column')
  const denied = await pluginModule.onItemAction(item, { actionId: 'run-action' })
  assert.equal(denied.status, 'blocked')
  assert.equal(denied.reason, 'permission-denied')
  assert.equal(JSON.stringify(denied).includes('powershell'), false)

  globalThis.platform.platform = 'darwin'
  state.calls = []
  await pluginModule.onFeatureTriggered('window-presets', '')
  assert.equal(state.items[0].title, '当前平台暂不支持窗口预设')
  assert.deepEqual(state.calls, [])
})

test('production Prelude contains no direct privileged or test-only surface', () => {
  const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
  for (const pattern of [
    /\b__test\b/,
    /\brequire\s*\(/,
    /\bchild_process\b/,
    /\bexecFile\b/,
    /\bPowerShell\b/i,
    /(?:^|[^.\w])process\s*(?:\.|\[)/m,
    /\bfetch\s*\(/,
  ]) {
    assert.doesNotMatch(source, pattern)
  }
})
