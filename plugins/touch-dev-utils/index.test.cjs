const assert = require('node:assert/strict')
const test = require('node:test')

function loadFreshPluginModule() {
  delete require.cache[require.resolve('./index.js')]
  const pluginModule = require('./index.js')
  delete require.cache[require.resolve('./index.js')]
  return pluginModule
}

globalThis.plugin = { feature: { async clearItems() {}, async pushItems() {} } }
globalThis.clipboard = {}
globalThis.logger = {}
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

function copyItem(payload = 'dev result') {
  return {
    meta: { defaultAction: 'copy' },
    actions: [{ id: 'copy', type: 'plugin', payload: { text: payload } }],
  }
}

test('onItemAction attempts the host clipboard capability without a child permission sdk', async () => {
  const writes = []
  const originalPermission = globalThis.permission
  const originalWriteText = globalThis.clipboard.writeText

  delete globalThis.permission
  globalThis.clipboard.writeText = async value => writes.push(value)

  try {
    const freshPlugin = loadFreshPluginModule()
    const result = await freshPlugin.onItemAction(copyItem())

    assert.deepEqual(writes, ['dev result'])
    assert.equal(result.externalAction, true)
    assert.equal(result.status, 'started')
  }
  finally {
    globalThis.permission = originalPermission
    globalThis.clipboard.writeText = originalWriteText
  }
})

test('onItemAction blocks copy when clipboard sdk is unavailable', async () => {
  const originalWriteText = globalThis.clipboard.writeText

  delete globalThis.clipboard.writeText

  try {
    const result = await pluginModule.onItemAction(copyItem())

    assert.equal(result.externalAction, true)
    assert.equal(result.status, 'blocked')
    assert.equal(result.reason, 'clipboard-unavailable')
  }
  finally {
    globalThis.clipboard.writeText = originalWriteText
  }
})

test('onItemAction returns a stable redacted failure when clipboard write fails', async () => {
  const originalWriteText = globalThis.clipboard.writeText

  globalThis.clipboard.writeText = async () => {
    throw new Error('/private/clipboard down')
  }

  try {
    const result = await pluginModule.onItemAction(copyItem())

    assert.equal(result.externalAction, true)
    assert.equal(result.status, 'blocked')
    assert.equal(result.reason, 'clipboard-write-failed')
    assert.equal(result.message, '复制失败')
    assert.doesNotMatch(JSON.stringify(result), /private|clipboard down/)
  }
  finally {
    globalThis.clipboard.writeText = originalWriteText
  }
})

test('onItemAction copies when the host capability grants the call', async () => {
  const writes = []
  const originalWriteText = globalThis.clipboard.writeText

  globalThis.clipboard.writeText = async value => writes.push(value)

  try {
    const result = await pluginModule.onItemAction(copyItem('ok'))

    assert.deepEqual(writes, ['ok'])
    assert.equal(result.externalAction, true)
    assert.equal(result.status, 'started')
  }
  finally {
    globalThis.clipboard.writeText = originalWriteText
  }
})

test('onFeatureTriggered awaits clear before publishing results', async () => {
  let releaseClear
  let pushed = false
  const clearBarrier = new Promise((resolve) => {
    releaseClear = resolve
  })
  const originalFeature = globalThis.plugin.feature
  globalThis.plugin.feature = {
    clearItems: () => clearBarrier,
    async pushItems() {
      pushed = true
    },
  }

  try {
    const freshPlugin = loadFreshPluginModule()
    const trigger = freshPlugin.onFeatureTriggered('dev-utils', { text: 'camel case' })
    await Promise.resolve()
    assert.equal(pushed, false)
    releaseClear()
    await trigger
    assert.equal(pushed, true)
  }
  finally {
    globalThis.plugin.feature = originalFeature
  }
})
