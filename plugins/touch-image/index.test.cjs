const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const IMAGE_TOKEN = `img_${'A'.repeat(32)}`

class ItemBuilder {
  constructor(id) {
    this.item = { id, actions: [], meta: {} }
  }

  setSource(type, id, name) {
    this.item.source = { type, id, name }
    return this
  }

  setTitle(value) {
    this.item.title = value
    return this
  }

  setSubtitle(value) {
    this.item.subtitle = value
    return this
  }

  setIcon(value) {
    this.item.icon = value
    return this
  }

  setMeta(value) {
    Object.assign(this.item.meta, value)
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
  saveCalls: [],
  saveResult: { status: 'saved', name: 'image.webp', format: 'webp', width: 64, height: 64, bytes: 1234 },
}

const clone = value => JSON.parse(JSON.stringify(value))

globalThis.TuffItemBuilder = ItemBuilder
globalThis.plugin = {
  feature: {
    async clearItems() {
      state.items = []
    },
    async pushItems(items) {
      state.items = items
    },
  },
  imageTools: {
    async save(request) {
      state.saveCalls.push(request)
      return state.saveResult
    },
  },
}

function loadPlugin() {
  const filename = path.join(__dirname, 'index.js')
  const mod = new Module(filename)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(__dirname)
  mod._compile(fs.readFileSync(filename, 'utf8'), filename)
  return mod.exports
}

const lifecycle = loadPlugin()

function imageQuery(text = '') {
  return {
    text,
    inputs: [
      {
        type: 'image',
        content: IMAGE_TOKEN,
        metadata: { name: 'portrait.png' },
      },
    ],
  }
}

function itemByAction(actionId) {
  return state.items.find(item => item.actions?.some(action => action.id === actionId))
}

test.beforeEach(() => {
  state.items = []
  state.saveCalls = []
  state.saveResult = { status: 'saved', name: 'image.webp', format: 'webp', width: 64, height: 64, bytes: 1234 }
  globalThis.plugin.imageTools = {
    async save(request) {
      state.saveCalls.push(request)
      return state.saveResult
    },
  }
  lifecycle.onInit()
})

test('shows an explicit empty state when the feature receives no approved image identity', async () => {
  await lifecycle.onFeatureTriggered('image-tools', { text: '64x64 q82', inputs: [] })

  assert.equal(state.items.length, 1)
  assert.equal(state.items[0].id, 'image-tools-no-input')
  assert.equal(state.items[0].title, '需要一张图片')
  assert.equal(state.items[0].actions.length, 0)
})

test('publishes the four fixed export actions with exact parsed requests and no host data', async () => {
  await lifecycle.onFeatureTriggered('image-tools', imageQuery('64x64 q82'))

  assert.deepEqual(
    state.items.map(item => item.actions[0].id),
    ['image-tools.save-png', 'image-tools.save-webp', 'image-tools.save-jpeg', 'image-tools.save-ico'],
  )
  assert.deepEqual(
    state.items.map(item => item.actions[0].payload),
    [
      { token: IMAGE_TOKEN, format: 'png', width: 64, height: 64 },
      { token: IMAGE_TOKEN, format: 'webp', width: 64, height: 64, quality: 82 },
      { token: IMAGE_TOKEN, format: 'jpeg', width: 64, height: 64, quality: 82 },
      { token: IMAGE_TOKEN, format: 'ico', width: 64, height: 64 },
    ],
  )
  assert.deepEqual(
    state.items.map(item => item.source),
    [
      { type: 'plugin', id: 'plugin-features', name: 'touch-image' },
      { type: 'plugin', id: 'plugin-features', name: 'touch-image' },
      { type: 'plugin', id: 'plugin-features', name: 'touch-image' },
      { type: 'plugin', id: 'plugin-features', name: 'touch-image' },
    ],
  )
  const serialized = JSON.stringify(state.items)
  assert.equal(serialized.includes('rawContent'), false)
  assert.equal(serialized.includes('thumbnail'), false)
  assert.equal(serialized.includes('path'), false)
  assert.equal(serialized.includes('data:image'), false)
})

test('rejects malformed dimensions or quality instead of publishing a request the host could misinterpret', async () => {
  for (const text of ['0x64', '64x0', '8193x64', '64x8193', '64x64 q0', '64x64 q101', '64x', 'q82x']) {
    await lifecycle.onFeatureTriggered('image-tools', imageQuery(text))
    assert.equal(state.items.length, 1, text)
    assert.equal(state.items[0].id, 'image-tools-invalid-size', text)
    assert.equal(state.items[0].title, '图片导出参数无效', text)
    assert.equal(state.items[0].actions.length, 0, text)
  }
})

test('executes only the current generated action and preserves the host save outcome', async () => {
  await lifecycle.onFeatureTriggered('image-tools', imageQuery('64x64 q82'))
  const webp = clone(itemByAction('image-tools.save-webp'))

  assert.deepEqual(await lifecycle.onItemAction(webp, { actionId: 'image-tools.save-webp' }), {
    externalAction: true,
    success: true,
    status: 'saved',
    name: 'image.webp',
    format: 'webp',
    width: 64,
    height: 64,
    bytes: 1234,
  })
  assert.deepEqual(state.saveCalls, [{ token: IMAGE_TOKEN, format: 'webp', width: 64, height: 64, quality: 82 }])

  const forged = clone(webp)
  forged.actions[0].payload = { token: IMAGE_TOKEN, format: 'webp', width: 64, height: 64, quality: 1 }
  assert.deepEqual(await lifecycle.onItemAction(forged, { actionId: 'image-tools.save-webp' }), {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'invalid-action',
  })

  const foreignSource = clone(webp)
  foreignSource.source.id = 'foreign-plugin'
  assert.equal(await lifecycle.onItemAction(foreignSource), undefined)
  const foreignFeature = clone(webp)
  foreignFeature.meta.featureId = 'foreign-feature'
  assert.equal(await lifecycle.onItemAction(foreignFeature), undefined)

  await lifecycle.onFeatureTriggered('image-tools', imageQuery())
  assert.deepEqual(await lifecycle.onItemAction(webp, { actionId: 'image-tools.save-webp' }), {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'invalid-action',
  })
  assert.equal(state.saveCalls.length, 1)
})

test('reports unavailable and failed capability outcomes without attempting local export', async () => {
  globalThis.plugin.imageTools = undefined
  await lifecycle.onFeatureTriggered('image-tools', imageQuery())
  assert.equal(state.items[0].id, 'image-tools-capability-unavailable')
  assert.equal(state.items[0].title, '图片导出能力不可用')

  globalThis.plugin.imageTools = {
    async save() {
      const error = new Error('host rejected request')
      error.code = 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED'
      throw error
    },
  }
  await lifecycle.onFeatureTriggered('image-tools', imageQuery())
  const item = itemByAction('image-tools.save-png')
  assert.deepEqual(await lifecycle.onItemAction(item, { actionId: 'image-tools.save-png' }), {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'permission-denied',
  })
  assert.equal(state.saveCalls.length, 0)
})

test('destroy invalidates every issued image export action before it reaches the host', async () => {
  await lifecycle.onFeatureTriggered('image-tools', imageQuery('64x64 q82'))
  const item = clone(itemByAction('image-tools.save-png'))
  lifecycle.onDestroy()

  assert.deepEqual(await lifecycle.onItemAction(item, { actionId: 'image-tools.save-png' }), {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'invalid-action',
  })
  assert.deepEqual(state.saveCalls, [])
})
