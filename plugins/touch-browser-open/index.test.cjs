const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const fs = require('node:fs')
const Module = require('node:module')
const os = require('node:os')
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

const storageWrites = []
globalThis.plugin = {
  storage: {
    async getFile() {
      return null
    },
    async setFile(name, value) {
      storageWrites.push({ name, value })
    },
  },
}
globalThis.logger = {
  warn() {},
  error() {},
}
globalThis.permission = permissionState

const spawnCalls = []
let execFileCalls = 0
const originalExecFile = childProcess.execFile
const originalSpawn = childProcess.spawn
const originalPlatform = os.platform

os.platform = () => 'darwin'
childProcess.execFile = () => {
  execFileCalls += 1
  throw new Error('execFile must remain blocked')
}
childProcess.spawn = (...args) => {
  spawnCalls.push(args)
  return {
    unref() {},
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

const browserOpenPlugin = loadPluginModule(path.join(__dirname, 'index.js'))
const { cacheDetectedBrowsers } = browserOpenPlugin.__test

childProcess.execFile = originalExecFile
childProcess.spawn = originalSpawn
os.platform = originalPlatform

function createActionItem(actionId, browser) {
  return {
    meta: {
      defaultAction: 'browser-open',
      actionId,
      payload: {
        url: 'https://example.com',
        ...(browser ? { browser } : {}),
      },
    },
  }
}

test.beforeEach(() => {
  cacheDetectedBrowsers([])
  permissionState.check = async () => false
  permissionState.request = async () => false
  spawnCalls.length = 0
  execFileCalls = 0
  storageWrites.length = 0
})

test('blocks unsupported actions before permission and shell execution', async () => {
  let permissionChecks = 0
  permissionState.check = async () => {
    permissionChecks += 1
    return true
  }

  const result = await browserOpenPlugin.onItemAction(createActionItem('launch-arbitrary'))

  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'unsupported-action')
  assert.equal(permissionChecks, 0)
  assert.equal(spawnCalls.length, 0)
  assert.equal(execFileCalls, 0)
})

test('blocks unknown browser targets before permission and shell execution', async () => {
  let permissionChecks = 0
  permissionState.check = async () => {
    permissionChecks += 1
    return true
  }

  const result = await browserOpenPlugin.onItemAction(createActionItem('open-browser', {
    id: 'calculator',
    name: 'Calculator',
    target: 'Calculator',
  }))

  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'browser-target-not-allowed')
  assert.equal(permissionChecks, 0)
  assert.equal(spawnCalls.length, 0)
  assert.equal(execFileCalls, 0)
})

test('blocks mismatched targets for a detected browser id', async () => {
  cacheDetectedBrowsers([{ id: 'chrome', name: 'Chrome', target: 'Google Chrome' }])

  const result = await browserOpenPlugin.onItemAction(createActionItem('open-browser', {
    id: 'chrome',
    name: 'Chrome',
    target: 'Calculator',
  }))

  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'browser-target-not-allowed')
  assert.equal(spawnCalls.length, 0)
})

test('blocks a detected browser before shell execution when permission is denied', async () => {
  cacheDetectedBrowsers([{ id: 'chrome', name: 'Chrome', target: 'Google Chrome' }])

  const result = await browserOpenPlugin.onItemAction(createActionItem('open-browser', {
    id: 'chrome',
    name: 'Forged Name',
    target: 'Google Chrome',
  }))

  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'permission-denied')
  assert.equal(spawnCalls.length, 0)
})

test('blocks a detected browser when the permission sdk is unavailable', async () => {
  cacheDetectedBrowsers([{ id: 'chrome', name: 'Chrome', target: 'Google Chrome' }])
  permissionState.check = undefined
  permissionState.request = undefined

  const result = await browserOpenPlugin.onItemAction(createActionItem('open-browser', {
    id: 'chrome',
    name: 'Chrome',
    target: 'Google Chrome',
  }))

  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'permission-sdk-unavailable')
  assert.equal(spawnCalls.length, 0)
})

test('opens only the canonical detected browser target after permission succeeds', async () => {
  cacheDetectedBrowsers([{ id: 'chrome', name: 'Chrome', target: 'Google Chrome' }])
  permissionState.check = async () => true

  const result = await browserOpenPlugin.onItemAction(createActionItem('open-browser', {
    id: 'chrome',
    name: 'Forged Name',
    target: 'Google Chrome',
  }))

  assert.equal(result.status, 'started')
  assert.equal(spawnCalls.length, 1)
  assert.equal(spawnCalls[0][0], 'open')
  assert.deepEqual(spawnCalls[0][1], ['-a', 'Google Chrome', 'https://example.com/'])
  assert.equal(execFileCalls, 0)
  assert.equal(storageWrites.length, 1)
  assert.equal(storageWrites[0].value.items[0].name, 'Chrome')
})
