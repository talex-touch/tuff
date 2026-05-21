const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const pushedItems = []
let requestCount = 0

globalThis.plugin = {
  feature: {
    clearItems() {
      pushedItems.length = 0
    },
    pushItems(items) {
      pushedItems.push(...items)
    },
  },
}
globalThis.dialog = {
  async showMessageBox() {
    return { response: 1 }
  },
}
globalThis.logger = {
  error() {},
  warn() {},
}
globalThis.features = {}
globalThis.permission = {
  async check() {
    return true
  },
  async request() {
    requestCount += 1
    return true
  },
}
globalThis.TuffItemBuilder = class {
  constructor(id) {
    this.item = { id, meta: {} }
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

  build() {
    return this.item
  }
}

function loadPluginModule() {
  const filename = path.join(__dirname, 'index.js')
  const source = fs.readFileSync(filename, 'utf8')
  const loaded = new Module(filename, module)
  loaded.filename = filename
  loaded.paths = Module._nodeModulePaths(__dirname)
  loaded._compile(source, filename)
  return loaded.exports
}

const pluginModule = loadPluginModule()
const {
  buildShellCapability,
  formatShellStatusSubtitle,
  resolveActions,
  resolveShellCapabilityState,
  runActionWithGuards,
  runShellCommand,
  setSpawnShellCommandForTest,
} = pluginModule.__test

function createChild({ code = 0 } = {}) {
  const child = new EventEmitter()
  process.nextTick(() => child.emit('close', code))
  return child
}

test.afterEach(() => {
  pushedItems.length = 0
  requestCount = 0
  globalThis.permission.check = async () => true
  globalThis.permission.request = async () => {
    requestCount += 1
    return true
  }
  globalThis.dialog.showMessageBox = async () => ({ response: 1 })
  setSpawnShellCommandForTest(null)
})

test('buildShellCapability exposes shell audit metadata', () => {
  const capability = buildShellCapability({
    featureId: 'quick-actions',
    actionId: 'shutdown',
    commandKind: 'fixed-shell',
    requiresConfirmation: true,
    requiresAdmin: true,
    platform: 'darwin',
    status: 'permission-missing',
    reason: 'system-shell-permission-required',
  })

  assert.equal(capability.id, 'system.shell')
  assert.equal(capability.type, 'shell')
  assert.equal(capability.permission, 'system.shell')
  assert.equal(capability.status, 'permission-missing')
  assert.equal(capability.reason, 'system-shell-permission-required')
  assert.equal(capability.audit.pluginName, 'touch-quick-actions')
  assert.equal(capability.audit.featureId, 'quick-actions')
  assert.equal(capability.audit.actionId, 'shutdown')
  assert.equal(capability.audit.commandKind, 'fixed-shell')
  assert.equal(capability.audit.requiresConfirmation, true)
  assert.equal(capability.audit.requiresAdmin, true)
})

test('resolveShellCapabilityState checks permission without requesting it', async () => {
  setSpawnShellCommandForTest(() => createChild())
  globalThis.permission.check = async (permissionId) => {
    assert.equal(permissionId, 'system.shell')
    return false
  }

  const state = await resolveShellCapabilityState('darwin')

  assert.equal(state.status, 'permission-missing')
  assert.equal(state.reason, 'system-shell-permission-required')
  assert.equal(requestCount, 0)
})

test('formatShellStatusSubtitle keeps unsupported reason visible', () => {
  assert.equal(
    formatShellStatusSubtitle({ status: 'unsupported', reason: 'safe-shell-unavailable' }),
    '不可用 · safe-shell-unavailable',
  )
})

test('runActionWithGuards blocks safe-shell unavailable before requesting permission', async () => {
  const action = resolveActions('darwin').find(item => item.id === 'lock-screen')

  const result = await runActionWithGuards(action)

  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'safe-shell-unavailable')
  assert.equal(requestCount, 0)
})

test('runActionWithGuards blocks unsafe payload before requesting permission', async () => {
  setSpawnShellCommandForTest(() => createChild())

  const result = await runActionWithGuards({
    id: 'bad',
    name: 'Bad',
    command: 'echo ok\nrm -rf /',
  })

  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'unsafe-command-payload')
  assert.equal(requestCount, 0)
})

test('runActionWithGuards starts a safe-shell action', async () => {
  const calls = []
  setSpawnShellCommandForTest((command, options) => {
    calls.push({ command, options })
    return createChild()
  })

  const result = await runActionWithGuards({
    id: 'lock-screen',
    name: '锁定屏幕',
    command: '  pmset displaysleepnow  ',
  })

  assert.equal(result.status, 'started')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].command, 'pmset displaysleepnow')
  assert.equal(calls[0].options.windowsHide, true)
})

test('runShellCommand reports non-zero exit as execution failure', async () => {
  setSpawnShellCommandForTest(() => createChild({ code: 2 }))

  await assert.rejects(
    runShellCommand('pmset displaysleepnow'),
    /command failed with code 2/,
  )
})

test('onFeatureTriggered shows permission diagnostics without prompting', async () => {
  setSpawnShellCommandForTest(() => createChild())
  globalThis.permission.check = async () => false

  const handled = await pluginModule.onFeatureTriggered('quick-actions', '')

  assert.equal(handled, true)
  assert.equal(requestCount, 0)
  assert.equal(pushedItems.length, 1)
  assert.equal(pushedItems[0].id, 'quick-actions-no-permission')
  assert.equal(pushedItems[0].meta.capability.status, 'permission-missing')
  assert.equal(pushedItems[0].meta.capability.reason, 'system-shell-permission-required')
})

test('onItemAction returns explicit blocked result for invalid action payload', async () => {
  const result = await pluginModule.onItemAction({
    meta: {
      defaultAction: 'quick-actions',
      actionId: 'run-action',
      payload: {},
    },
  })

  assert.equal(result.externalAction, true)
  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'invalid-action')
  assert.equal(result.success, false)
})
