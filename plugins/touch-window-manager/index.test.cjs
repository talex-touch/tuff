const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const WINDOW_TOKEN = 'wm_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const APP_TOKEN = 'wm_BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'

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
  result: null,
  presetResult: null,
  presetError: null,
  actError: null,
}

function inventory() {
  return {
    operation: 'list',
    status: 'available',
    platform: 'win32',
    items: [
      {
        kind: 'window',
        token: WINDOW_TOKEN,
        name: 'Terminal',
        title: 'Workspace',
        isFront: true,
        topmost: false,
        actions: ['activate', 'snap-left', 'snap-right', 'topmost-toggle', 'close', 'hide', 'quit'],
      },
      {
        kind: 'app',
        token: APP_TOKEN,
        name: 'Terminal',
        running: true,
        actions: ['launch'],
      },
    ],
  }
}

globalThis.platform = { platform: 'win32', arch: 'x64' }
globalThis.logger = { error() {} }
globalThis.TuffItemBuilder = TestTuffItemBuilder
globalThis.plugin = {
  feature: {
    async clearItems() {
      state.calls.push({ operation: 'clear' })
      state.items = []
    },
    async pushItems(items) {
      state.calls.push({ operation: 'push' })
      state.items = items
    },
  },
  windowManager: {
    async list() {
      state.calls.push({ operation: 'list' })
      return inventory()
    },
    async act(action, token) {
      state.calls.push({ operation: 'act', action, token })
      if (state.actError)
        throw state.actError
      return state.result || { operation: 'act', action, status: 'completed' }
    },
  },
  windowPresets: {
    async runAction(presetId) {
      state.calls.push({ operation: 'run-preset', presetId })
      if (state.presetError)
        throw state.presetError
      return state.presetResult || { operation: 'run-action', actionId: presetId, status: 'completed', affectedWindows: 2 }
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
  state.result = null
  state.presetResult = null
  state.presetError = null
  state.actError = null
  globalThis.platform.platform = 'win32'
})

test('publishes redacted windows and host-issued launch tokens in awaited order', async () => {
  assert.equal(await pluginModule.onFeatureTriggered('window-app', ''), true)
  assert.deepEqual(
    state.calls.map(call => call.operation),
    ['list', 'clear', 'push'],
  )
  const windowItem = state.items.find(item => item.title === 'Terminal')
  const appItem = state.items.find(item => item.title === '应用 · Terminal')
  assert.ok(windowItem)
  assert.ok(appItem)
  assert.deepEqual(
    windowItem.actions.map(action => action.id),
    ['activate', 'snap-left', 'snap-right', 'topmost-toggle', 'close', 'hide', 'quit'],
  )
  assert.deepEqual(appItem.actions, [
    {
      id: 'launch',
      type: 'plugin',
      label: '启动',
      payload: { action: 'launch', token: APP_TOKEN },
    },
  ])
  assert.equal(JSON.stringify(state.items).includes('Program Files'), false)
  assert.equal(
    state.items.every(item => item.icon.type === 'class'),
    true,
  )
})

test('dispatches only the selected fixed action and opaque token', async () => {
  await pluginModule.onFeatureTriggered('window-app', 'Terminal')
  const item = state.items.find(entry => entry.title === 'Terminal')
  const result = await pluginModule.onItemAction(item, { actionId: 'snap-left' })
  assert.deepEqual(result, {
    externalAction: true,
    success: true,
    status: 'completed',
    message: '窗口动作已完成',
  })
  assert.deepEqual(state.calls.at(-1), {
    operation: 'act',
    action: 'snap-left',
    token: WINDOW_TOKEN,
  })

  const invalid = await pluginModule.onItemAction({
    meta: { defaultAction: 'activate' },
    actions: [{ id: 'activate', payload: { action: 'activate', token: '100', path: '/private' } }],
  })
  assert.equal(invalid.reason, 'invalid-action')
  assert.equal(state.calls.filter(call => call.operation === 'act').length, 1)
})

test('keeps expired token, permission and unsupported outcomes stable and redacted', async () => {
  await pluginModule.onFeatureTriggered('window-app', '')
  const item = state.items.find(entry => entry.title === 'Terminal')
  state.result = {
    operation: 'act',
    action: 'activate',
    status: 'blocked',
    reason: 'token-expired',
  }
  const expired = await pluginModule.onItemAction(item, { actionId: 'activate' })
  assert.equal(expired.status, 'blocked')
  assert.equal(expired.reason, 'token-expired')
  assert.equal(expired.message, '窗口列表已过期，请重新搜索')
  assert.doesNotMatch(JSON.stringify(expired), /handle|pid|path|powershell/i)

  globalThis.platform.platform = 'linux'
  state.calls = []
  await pluginModule.onFeatureTriggered('window-app', '')
  assert.equal(state.items[0].title, '当前平台暂不支持窗口管理')
  assert.deepEqual(
    state.calls.map(call => call.operation),
    ['clear', 'push'],
  )
})

test('window-presets feature executes presets, handles blocked/errors, and guards platform and empty matches', async () => {
  assert.equal(await pluginModule.onFeatureTriggered('window-presets', 'dev'), true)
  assert.equal(state.items.length, 1)
  const presetItem = state.items[0]
  assert.equal(presetItem.actions[0].id, 'run-preset')
  assert.equal(presetItem.actions[0].type, 'plugin')
  assert.deepEqual(presetItem.actions[0].payload, { presetId: 'preset-dev-split' })

  const executed = await pluginModule.onItemAction(presetItem, { actionId: 'run-preset' })
  assert.deepEqual(executed, {
    externalAction: true,
    success: true,
    status: 'completed',
    message: '已处理 2 个窗口',
  })
  assert.deepEqual(state.calls.at(-1), { operation: 'run-preset', presetId: 'preset-dev-split' })

  state.presetResult = { status: 'blocked', reason: 'insufficient-windows' }
  const blockedResult = await pluginModule.onItemAction(presetItem, { actionId: 'run-preset' })
  assert.equal(blockedResult.status, 'blocked')
  assert.equal(blockedResult.reason, 'insufficient-windows')
  assert.equal(blockedResult.message, '可见窗口数量不足')

  state.presetResult = null
  state.presetError = Object.assign(new Error('/private/perm'), {
    code: 'PLUGIN_HOST_PERMISSION_REQUEST_FAILED',
  })
  const failedResult = await pluginModule.onItemAction(presetItem, { actionId: 'run-preset' })
  assert.equal(failedResult.status, 'blocked')
  assert.equal(failedResult.reason, 'permission-check-failed')
  assert.doesNotMatch(JSON.stringify(failedResult), /private/)

  state.presetError = null
  await pluginModule.onFeatureTriggered('window-presets', 'no-matching-preset-xyz')
  assert.equal(state.items[0].title, '暂无匹配预设')

  globalThis.platform.platform = 'darwin'
  await pluginModule.onFeatureTriggered('window-presets', '')
  assert.equal(state.items[0].title, '当前平台暂不支持窗口预设')
})

test('ignores unrelated items in onItemAction and maps permission failures canonically', async () => {
  const unrelated = await pluginModule.onItemAction(
    {
      meta: { defaultAction: 'copy' },
      actions: [{ id: 'copy', payload: { text: 'hello' } }],
    },
    { actionId: 'copy' },
  )
  assert.equal(unrelated, undefined)

  const foreign = await pluginModule.onItemAction(
    {
      meta: { pluginName: 'other-plugin', defaultAction: 'activate' },
      actions: [{ id: 'activate', payload: { action: 'activate', token: WINDOW_TOKEN } }],
    },
    { actionId: 'activate' },
  )
  assert.equal(foreign, undefined)
  assert.equal(state.calls.length, 0)

  await pluginModule.onFeatureTriggered('window-app', 'Terminal')
  const item = state.items.find(entry => entry.title === 'Terminal')
  state.actError = Object.assign(new Error('req failed'), {
    code: 'PLUGIN_HOST_PERMISSION_REQUEST_FAILED',
  })
  const permFailed = await pluginModule.onItemAction(item, { actionId: 'activate' })
  assert.equal(permFailed.status, 'blocked')
  assert.equal(permFailed.reason, 'permission-check-failed')
})

test('production Prelude contains no privileged, reflective or test-only surface', () => {
  const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
  for (const pattern of [
    /\b__test\b/,
    /\brequire\s*\(/,
    /\bchild_process\b/,
    /\bexecFile\b/,
    /\bspawn\s*\(/,
    /\bPowerShell\b/i,
    /\bAppleScript\b/i,
    /(?:^|[^.\w])process\s*(?:\.|\[)/m,
    /\bfetch\s*\(/,
    /\bhandle\b/i,
    /\bpid\b/i,
    /\bappPath\b/,
  ]) {
    assert.doesNotMatch(source, pattern)
  }
})
