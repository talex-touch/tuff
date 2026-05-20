const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

globalThis.plugin = {
  storage: {
    async getFile() {
      return null
    },
    async setFile() {},
    async openFolder() {},
  },
  feature: {
    clearItems() {},
    pushItems() {},
  },
}
globalThis.logger = {}
globalThis.permission = {
  async check() {
    return true
  },
  async request() {
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

function loadPluginModule(filename) {
  const source = fs.readFileSync(filename, 'utf8')
  const mod = new Module(filename)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  mod._compile(source, filename)
  return mod.exports
}

const snipastePlugin = loadPluginModule(path.join(__dirname, 'index.js'))
const {
  buildCapabilityMeta,
  normalizeAction,
  normalizeArgs,
  runSnipaste,
} = snipastePlugin.__test

test('normalizeArgs rejects newline and null payloads', () => {
  assert.deepEqual(normalizeArgs(['snip', '  --full  ']), { ok: true, args: ['snip', '--full'] })
  assert.equal(normalizeArgs(['snip\nrm']).reason, 'invalid-arg-payload')
  assert.equal(normalizeArgs(['snip\0rm']).reason, 'invalid-arg-payload')
  assert.equal(normalizeArgs([123]).reason, 'invalid-arg-type')
})

test('normalizeAction preserves invalid custom action as blocked diagnostic', () => {
  const action = normalizeAction({
    id: 'bad',
    title: 'Bad',
    args: ['snip\nbad'],
  }, 'custom')

  assert.equal(action.invalidReason, 'invalid-arg-payload')
  assert.deepEqual(action.args, [])
})

test('buildCapabilityMeta exposes shell capability audit fields', () => {
  const meta = buildCapabilityMeta({
    actionId: 'builtin:snip',
    status: 'permission-missing',
    reason: 'system.shell permission is required',
    commandSource: 'builtin',
  })

  assert.equal(meta.capability.permissionId, 'system.shell')
  assert.equal(meta.capability.status, 'permission-missing')
  assert.equal(meta.capability.commandSource, 'builtin')
  assert.equal(meta.capability.actionId, 'builtin:snip')
})

test('runSnipaste blocks before spawn when permission is missing', async () => {
  const originalCheck = globalThis.permission.check
  const originalRequest = globalThis.permission.request
  globalThis.permission.check = async () => false
  globalThis.permission.request = async () => false

  try {
    const result = await runSnipaste(['snip'])
    assert.equal(result.status, 'blocked')
    assert.equal(result.reason, 'permission-missing')
  }
  finally {
    globalThis.permission.check = originalCheck
    globalThis.permission.request = originalRequest
  }
})

test('runSnipaste blocks invalid args without permission checks when requested', async () => {
  const result = await runSnipaste(['snip\nbad'], { checkPermission: false })
  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'invalid-arg-payload')
})

test('runSnipaste returns failed when executable cannot spawn', async () => {
  const originalEnv = process.env.SNIPASTE_PATH
  process.env.SNIPASTE_PATH = '/definitely/not/a/snipaste/bin'

  try {
    const result = await runSnipaste(['snip'], { checkPermission: false })
    assert.equal(result.status, 'failed')
    assert.equal(result.reason, 'spawn-failed')
    assert.ok(result.errorMessage)
  }
  finally {
    if (originalEnv === undefined)
      delete process.env.SNIPASTE_PATH
    else
      process.env.SNIPASTE_PATH = originalEnv
  }
})
