const assert = require('node:assert/strict')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const Module = require('node:module')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const permissionState = {
  async check() { return true },
  async request() { return true },
}
const dialogCalls = []
const storageCalls = []
let renameCalls = 0
const originalRename = fsp.rename

fsp.rename = async () => {
  renameCalls += 1
  throw new Error('rename must remain blocked')
}

globalThis.permission = permissionState
globalThis.dialog = {
  async showMessageBox(options) {
    dialogCalls.push(options)
    return { response: 1 }
  },
}
globalThis.logger = {}
globalThis.plugin = {
  feature: {
    clearItems() {},
    pushItems() {},
  },
  storage: {
    async getFile(filename) {
      storageCalls.push({ type: 'get', filename })
      return { items: [] }
    },
    async setFile(filename, value) {
      storageCalls.push({ type: 'set', filename, value })
    },
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

function loadPluginModule(filename) {
  const source = fs.readFileSync(filename, 'utf8')
  const mod = new Module(filename)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  mod._compile(source, filename)
  return mod.exports
}

const lifecycle = loadPluginModule(path.join(__dirname, 'index.js'))

test.afterEach(() => {
  permissionState.check = async () => true
  permissionState.request = async () => true
  dialogCalls.length = 0
  storageCalls.length = 0
  renameCalls = 0
})

test.after(() => {
  fsp.rename = originalRename
})

async function createRenameFixture(featureId) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-batch-rename-'))
  const sourcePath = path.join(tempDir, 'original.txt')
  const targetPath = path.join(tempDir, 'renamed-original.txt')
  fs.writeFileSync(sourcePath, 'content')

  permissionState.check = async (permissionId) => {
    assert.equal(permissionId, 'fs.read')
    return true
  }

  await lifecycle.onFeatureTriggered(featureId, {
    text: 'prefix:renamed-',
    inputs: [{ type: 'files', content: JSON.stringify([sourcePath]) }],
  })

  return { sourcePath, targetPath }
}

function applyAction(featureId) {
  return lifecycle.onItemAction({
    meta: {
      defaultAction: 'batch-rename',
      actionId: 'apply',
      featureId,
    },
  })
}

function assertApplyBlocked(result, reason, fixture) {
  assert.deepEqual(result, {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason,
    message: '缺少 fs.write 权限',
  })
  assert.equal(fs.existsSync(fixture.sourcePath), true)
  assert.equal(fs.existsSync(fixture.targetPath), false)
  assert.equal(renameCalls, 0)
  assert.equal(dialogCalls.length, 0)
  assert.equal(storageCalls.length, 0)
}

test('apply blocks before rename when permission sdk is unavailable', async () => {
  const featureId = 'batch-rename-sdk-unavailable'
  const fixture = await createRenameFixture(featureId)
  permissionState.check = undefined
  permissionState.request = undefined

  const result = await applyAction(featureId)

  assertApplyBlocked(result, 'permission-sdk-unavailable', fixture)
})

test('apply blocks before rename when fs.write permission is denied', async () => {
  const featureId = 'batch-rename-denied'
  const fixture = await createRenameFixture(featureId)
  permissionState.check = async permissionId => permissionId !== 'fs.write'
  permissionState.request = async () => false

  const result = await applyAction(featureId)

  assertApplyBlocked(result, 'permission-denied', fixture)
})

test('apply blocks before rename when permission check fails', async () => {
  const featureId = 'batch-rename-check-failed'
  const fixture = await createRenameFixture(featureId)
  permissionState.check = async () => {
    throw new Error('permission check failed')
  }

  const result = await applyAction(featureId)

  assertApplyBlocked(result, 'permission-request-failed', fixture)
})

test('apply blocks before rename when permission request fails', async () => {
  const featureId = 'batch-rename-request-failed'
  const fixture = await createRenameFixture(featureId)
  permissionState.check = async () => false
  permissionState.request = async () => {
    throw new Error('permission request failed')
  }

  const result = await applyAction(featureId)

  assertApplyBlocked(result, 'permission-request-failed', fixture)
})

test('undo blocks before reading records when fs.write permission is denied', async () => {
  permissionState.check = async permissionId => permissionId !== 'fs.write'
  permissionState.request = async () => false

  const result = await lifecycle.onItemAction({
    meta: {
      defaultAction: 'batch-rename',
      actionId: 'undo',
      featureId: 'batch-rename-undo-denied',
    },
  })

  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'permission-denied')
  assert.equal(renameCalls, 0)
  assert.equal(dialogCalls.length, 0)
  assert.equal(storageCalls.length, 0)
})
