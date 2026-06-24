const assert = require('node:assert/strict')
const test = require('node:test')

function loadFreshPluginModule() {
  delete require.cache[require.resolve('./index.js')]
  const pluginModule = require('./index.js')
  delete require.cache[require.resolve('./index.js')]
  return pluginModule
}

globalThis.plugin = {
  box: { hide() {} },
  feature: { clearItems() {}, pushItems() {} },
}
globalThis.clipboard = {}
globalThis.logger = {}
globalThis.permission = {}
globalThis.TuffItemBuilder = class {
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

  createAndAddAction(id, type, title, payload) {
    this.item.actions.push({ id, type, title, payload })
    return this
  }

  build() {
    return this.item
  }
}

const pluginModule = loadFreshPluginModule()

function copyItem(payload = 'TEXT') {
  return {
    meta: { defaultAction: 'copy', featureId: 'text-tools' },
    actions: [{ id: 'copy', type: 'plugin', payload: { text: payload } }],
  }
}

test('onItemAction blocks copy when permission sdk is unavailable', async () => {
  const writes = []
  const originalPermission = globalThis.permission
  const originalWriteText = globalThis.clipboard.writeText

  delete globalThis.permission
  globalThis.clipboard.writeText = value => writes.push(value)

  try {
    const freshPlugin = loadFreshPluginModule()
    const result = await freshPlugin.onItemAction(copyItem())

    assert.deepEqual(writes, [])
    assert.equal(result.externalAction, true)
    assert.equal(result.status, 'blocked')
    assert.equal(result.reason, 'permission-sdk-unavailable')
  }
  finally {
    globalThis.permission = originalPermission
    globalThis.clipboard.writeText = originalWriteText
  }
})

test('onItemAction blocks copy when permission request fails', async () => {
  const writes = []
  const originalWriteText = globalThis.clipboard.writeText
  const originalCheck = globalThis.permission.check
  const originalRequest = globalThis.permission.request

  globalThis.clipboard.writeText = value => writes.push(value)
  globalThis.permission.check = async () => {
    throw new Error('permission down')
  }
  globalThis.permission.request = async () => true

  try {
    const result = await pluginModule.onItemAction(copyItem())

    assert.deepEqual(writes, [])
    assert.equal(result.externalAction, true)
    assert.equal(result.status, 'blocked')
    assert.equal(result.reason, 'permission-request-failed')
  }
  finally {
    globalThis.clipboard.writeText = originalWriteText
    globalThis.permission.check = originalCheck
    globalThis.permission.request = originalRequest
  }
})

test('onItemAction blocks copy when clipboard sdk is unavailable', async () => {
  const originalWriteText = globalThis.clipboard.writeText
  const originalCheck = globalThis.permission.check
  const originalRequest = globalThis.permission.request

  delete globalThis.clipboard.writeText
  globalThis.permission.check = async () => true
  globalThis.permission.request = async () => true

  try {
    const result = await pluginModule.onItemAction(copyItem())

    assert.equal(result.externalAction, true)
    assert.equal(result.status, 'blocked')
    assert.equal(result.reason, 'clipboard-unavailable')
  }
  finally {
    globalThis.clipboard.writeText = originalWriteText
    globalThis.permission.check = originalCheck
    globalThis.permission.request = originalRequest
  }
})

test('onItemAction returns explicit failure when clipboard write fails', async () => {
  const originalWriteText = globalThis.clipboard.writeText
  const originalCheck = globalThis.permission.check
  const originalRequest = globalThis.permission.request

  globalThis.clipboard.writeText = async () => {
    throw new Error('clipboard down')
  }
  globalThis.permission.check = async () => true
  globalThis.permission.request = async () => true

  try {
    const result = await pluginModule.onItemAction(copyItem())

    assert.equal(result.externalAction, true)
    assert.equal(result.status, 'blocked')
    assert.equal(result.reason, 'clipboard-write-failed')
    assert.equal(result.message, 'clipboard down')
  }
  finally {
    globalThis.clipboard.writeText = originalWriteText
    globalThis.permission.check = originalCheck
    globalThis.permission.request = originalRequest
  }
})

test('onItemAction copies after clipboard.write permission is granted', async () => {
  const writes = []
  const originalWriteText = globalThis.clipboard.writeText
  const originalCheck = globalThis.permission.check
  const originalRequest = globalThis.permission.request

  globalThis.clipboard.writeText = value => writes.push(value)
  globalThis.permission.check = async () => true
  globalThis.permission.request = async () => true

  try {
    const result = await pluginModule.onItemAction(copyItem('ok'))

    assert.deepEqual(writes, ['ok'])
    assert.equal(result.externalAction, true)
    assert.equal(result.status, 'started')
  }
  finally {
    globalThis.clipboard.writeText = originalWriteText
    globalThis.permission.check = originalCheck
    globalThis.permission.request = originalRequest
  }
})
