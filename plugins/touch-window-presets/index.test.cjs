const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const permissionState = {
  async check() {
    return false
  },
  async request() {
    return false
  },
}

globalThis.logger = {
  warn() {},
}
globalThis.permission = permissionState

let execFileCalls = 0
const originalExecFile = childProcess.execFile
childProcess.execFile = () => {
  execFileCalls += 1
  throw new Error('shell execution must remain blocked')
}

function loadPluginModule(filename) {
  const source = fs.readFileSync(filename, 'utf8')
  const mod = new Module(filename)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  mod._compile(source, filename)
  return mod.exports
}

const { onItemAction } = loadPluginModule(path.join(__dirname, 'index.js'))

childProcess.execFile = originalExecFile

const actionItem = {
  meta: {
    defaultAction: 'window-presets',
    actionId: 'run-preset',
    payload: {
      presetId: 'preset-dev-split',
    },
  },
}

function resetPermissionSdk() {
  permissionState.check = async () => false
  permissionState.request = async () => false
  execFileCalls = 0
}

test.beforeEach(() => {
  resetPermissionSdk()
})

test('blocks before shell execution when permission sdk is unavailable', async () => {
  permissionState.check = undefined
  permissionState.request = undefined

  const result = await onItemAction(actionItem)

  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'permission-sdk-unavailable')
  assert.equal(execFileCalls, 0)
})

test('blocks before shell execution when permission is denied', async () => {
  const result = await onItemAction(actionItem)

  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'permission-denied')
  assert.equal(execFileCalls, 0)
})

test('blocks before shell execution when permission check fails', async () => {
  permissionState.check = async () => {
    throw new Error('permission check failed')
  }

  const result = await onItemAction(actionItem)

  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'permission-request-failed')
  assert.equal(execFileCalls, 0)
})

test('blocks before shell execution when permission request fails', async () => {
  permissionState.request = async () => {
    throw new Error('permission request failed')
  }

  const result = await onItemAction(actionItem)

  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'permission-request-failed')
  assert.equal(execFileCalls, 0)
})
