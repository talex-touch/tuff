const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const permissionChecks = []
const featureCalls = []
const storageCalls = []
const filesystemCalls = []
const logCalls = []
let storedUndo = null

globalThis.permission = {
  async check(permissionId) {
    permissionChecks.push(permissionId)
    return true
  },
}
globalThis.filesystem = {
  async renameBatch(entries) {
    filesystemCalls.push(entries)
    return entries.map((_, index) => ({ index, status: 'renamed' }))
  },
}
globalThis.logger = {
  error(message) {
    logCalls.push(message)
  },
  warn(message) {
    logCalls.push(message)
  },
}
globalThis.plugin = {
  feature: {
    async clearItems() {
      featureCalls.push({ type: 'clear' })
    },
    async pushItems(items) {
      featureCalls.push({ type: 'push', items })
    },
  },
  storage: {
    async getFile(name) {
      storageCalls.push({ type: 'get', name })
      return storedUndo
    },
    async setFile(name, value) {
      storageCalls.push({ type: 'set', name, value })
      storedUndo = value
    },
  },
}
globalThis.TuffItemBuilder = class {
  constructor(id) {
    this.item = { id, meta: {} }
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
    this.item.meta = { ...this.item.meta, ...meta }
    return this
  }

  createAndAddAction(id, type, label, payload) {
    this.item.actions ??= []
    this.item.actions.push({ id, type, label, payload, primary: this.item.actions.length === 0 })
    return this
  }

  build() {
    return {
      ...this.item,
      render: { mode: 'default', basic: { ...this.basic } },
    }
  }
}

function loadPluginModule(filename) {
  const source = fs.readFileSync(filename, 'utf8')
  const mod = new Module(filename)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  mod._compile(source, filename)
  return mod.exports
}

const pluginPath = path.join(__dirname, 'index.js')
const source = fs.readFileSync(pluginPath, 'utf8')
const lifecycle = loadPluginModule(pluginPath)

function latestItems() {
  return featureCalls.findLast(call => call.type === 'push')?.items ?? []
}

function action(featureId, actionId) {
  return lifecycle.onItemAction({
    meta: {
      defaultAction: 'batch-rename',
      featureId,
    },
    actions: [{ id: actionId, type: 'plugin', label: actionId, primary: true }],
  })
}

async function preview(featureId, files = ['/approved/alpha.txt']) {
  await lifecycle.onFeatureTriggered(featureId, {
    text: 'prefix:renamed-',
    inputs: [{ type: 'files', content: JSON.stringify(files) }],
  })
}

test.afterEach(() => {
  permissionChecks.length = 0
  featureCalls.length = 0
  storageCalls.length = 0
  filesystemCalls.length = 0
  logCalls.length = 0
  storedUndo = null
  globalThis.permission.check = async (permissionId) => {
    permissionChecks.push(permissionId)
    return true
  }
  globalThis.filesystem.renameBatch = async (entries) => {
    filesystemCalls.push(entries)
    return entries.map((_, index) => ({ index, status: 'renamed' }))
  }
})

test('production Prelude has no privileged imports, raw host surface or test export', () => {
  for (const pattern of [
    /\b__test\b/,
    /\brequire\s*\(/,
    /\bfetch\s*\(/,
    /(?:^|[^.\w])process\s*(?:\.|\[)/m,
    /\bnode:(?:fs(?:\/promises)?|child_process|sqlite|worker_threads)\b/,
    /\belectron\b/,
    /showOpenDialog|showMessageBox/,
  ]) {
    assert.doesNotMatch(source, pattern)
  }
  assert.deepEqual(Object.keys(lifecycle).sort(), ['onDestroy', 'onFeatureTriggered', 'onItemAction'])
})

test('feature trigger awaits read permission and ordered item publication', async () => {
  await preview('batch-rename-preview', ['/approved/alpha.txt', '/approved/beta.md'])

  assert.deepEqual(permissionChecks, ['fs.read'])
  assert.deepEqual(
    featureCalls.map(call => call.type),
    ['clear', 'push'],
  )
  const items = latestItems()
  assert.equal(
    items.some(item => item.actions?.[0]?.id === 'apply'),
    true,
  )
  assert.equal(
    items.some(item => item.actions?.[0]?.id === 'undo'),
    true,
  )
  assert.equal(
    items.some(item => Object.hasOwn(item.meta, 'actionId')),
    false,
  )
  assert.equal(
    items.some(item => item.render.basic.subtitle === 'renamed-alpha.txt'),
    true,
  )
  assert.equal(
    items.some(item => item.render.basic.subtitle === 'renamed-beta.md'),
    true,
  )
  assert.equal(
    items.every(item => item.render.basic.icon.type === 'class'),
    true,
  )
})

test('apply sends one exact rename transaction before persisting bounded undo entries', async () => {
  await preview('batch-rename-apply', ['/approved/alpha.txt', '/approved/beta.md'])
  featureCalls.length = 0
  permissionChecks.length = 0

  const result = await action('batch-rename-apply', 'apply')

  assert.deepEqual(result, {
    externalAction: true,
    success: true,
    status: 'completed',
  })
  assert.deepEqual(permissionChecks, ['fs.write'])
  assert.deepEqual(filesystemCalls, [
    [
      { source: '/approved/alpha.txt', targetName: 'renamed-alpha.txt' },
      { source: '/approved/beta.md', targetName: 'renamed-beta.md' },
    ],
  ])
  assert.equal(storageCalls.length, 1)
  assert.deepEqual(storageCalls[0].value.items, [
    { source: '/approved/renamed-alpha.txt', targetName: 'alpha.txt' },
    { source: '/approved/renamed-beta.md', targetName: 'beta.md' },
  ])
})

test('write denial blocks before filesystem and storage work', async () => {
  await preview('batch-rename-denied')
  filesystemCalls.length = 0
  storageCalls.length = 0
  globalThis.permission.check = async permissionId => permissionId !== 'fs.write'

  const result = await action('batch-rename-denied', 'apply')

  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'permission-denied')
  assert.equal(filesystemCalls.length, 0)
  assert.equal(storageCalls.length, 0)
})

test('filesystem failures expose only a stable code and never native detail', async () => {
  await preview('batch-rename-failure')
  filesystemCalls.length = 0
  globalThis.filesystem.renameBatch = async () => {
    throw Object.assign(new Error('/private/owner/secret.txt'), {
      code: 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED',
    })
  }

  const result = await action('batch-rename-failure', 'apply')

  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'PLUGIN_HOST_CAPABILITY_HANDLER_FAILED')
  assert.doesNotMatch(JSON.stringify(result), /private|secret\.txt/)
  assert.deepEqual(logCalls, ['[touch-batch-rename] PLUGIN_HOST_CAPABILITY_HANDLER_FAILED'])
  assert.equal(storageCalls.length, 0)
})

test('undo reads the journal, runs the same fixed transaction and clears it after success', async () => {
  storedUndo = {
    items: [{ source: '/approved/renamed-alpha.txt', targetName: 'alpha.txt' }],
  }

  const result = await action('batch-rename-undo', 'undo')

  assert.equal(result.success, true)
  assert.deepEqual(filesystemCalls, [[{ source: '/approved/renamed-alpha.txt', targetName: 'alpha.txt' }]])
  assert.deepEqual(
    storageCalls.map(call => call.type),
    ['get', 'set'],
  )
  assert.deepEqual(storedUndo.items, [])
})
