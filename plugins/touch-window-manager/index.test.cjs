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
      return state.result || { operation: 'act', action, status: 'completed' }
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
