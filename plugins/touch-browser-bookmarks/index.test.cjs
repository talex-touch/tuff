const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const test = require('node:test')
const vm = require('node:vm')

class FakeBuilder {
  constructor(id) {
    this.item = { id, meta: {}, actions: [] }
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
    this.item.actions.push({ id, type, label, payload })
    return this
  }

  build() {
    this.item.render = { mode: 'default', basic: { ...this.basic } }
    return this.item
  }
}

function createHarness(options = {}) {
  const files = new Map(options.files || [])
  const state = { items: [], clipboardWrites: [], opened: [] }
  const plugin = {
    storage: {
      async getFile(name) {
        return files.get(name) ?? null
      },
      async setFile(name, value) {
        files.set(name, value)
      },
      async deleteFile(name) {
        return files.delete(name)
      },
      async listFiles() {
        return [...files.keys()]
      },
    },
    feature: {
      async clearItems() {
        state.items = []
      },
      async pushItems(items) {
        state.items = items
      },
    },
  }
  const sandbox = {
    plugin,
    clipboard: {
      async writeText(value) {
        if (options.denyClipboard) {
          throw Object.assign(new Error('/private/clipboard denied'), {
            code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED',
          })
        }
        if (options.failClipboard) {
          throw new Error('/private/clipboard write failed')
        }
        state.clipboardWrites.push(value)
      },
    },
    permission: {
      async check() {
        return options.permissionGranted !== false
      },
    },
    openUrl: async (url) => {
      state.opened.push(url)
      if (options.denyOpen) {
        throw Object.assign(new Error('/private/open denied'), {
          code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED',
        })
      }
    },
    logger: {},
    TuffItemBuilder: FakeBuilder,
    URL,
    URLSearchParams,
    module: { exports: {} },
  }
  sandbox.exports = sandbox.module.exports
  vm.runInNewContext(readFileSync(require.resolve('./index.js'), 'utf8'), sandbox, {
    filename: 'touch-browser-bookmarks/index.js',
  })
  return { files, module: sandbox.module.exports, state }
}

test('initializes bounded storage and exports lifecycle only', async () => {
  const harness = createHarness()
  await harness.module.onInit()

  assert.equal(harness.module.__test, undefined)
  assert.deepEqual([...harness.files.keys()].sort(), ['bookmarks.json', 'recent-urls.json'])
})

test('triggers feature publication from async storage state', async () => {
  const harness = createHarness({
    files: [
      ['bookmarks.json', { items: [], updatedAt: 0 }],
      ['recent-urls.json', { items: [], updatedAt: 0 }],
    ],
  })

  assert.equal(await harness.module.onFeatureTriggered('browser-bookmarks', { text: 'example.com' }), true)
  assert.equal(
    harness.state.items.some(item => item.actions.some(action => action.id === 'open-url')),
    true,
  )
  assert.equal(
    harness.state.items.some(item => item.actions.some(action => action.id === 'config-open')),
    false,
  )
})

test('maps host clipboard and open-url permission denials without leaking native detail', async () => {
  const harness = createHarness({ denyClipboard: true, denyOpen: true, permissionGranted: false })
  await harness.module.onInit()

  const copyResult = await harness.module.onItemAction({
    meta: { defaultAction: 'browser-bookmarks' },
    actions: [{ id: 'copy-url', payload: { url: 'https://example.com/' } }],
  })
  assert.equal(copyResult.reason, 'permission-denied')
  assert.doesNotMatch(JSON.stringify(copyResult), /private|clipboard denied/)

  const openResult = await harness.module.onItemAction({
    meta: { defaultAction: 'browser-bookmarks' },
    actions: [{
      id: 'open-url',
      payload: { url: 'https://example.com/', title: 'Example' },
    }],
  })
  assert.equal(openResult.reason, 'permission-denied')
  assert.equal(harness.state.opened.length, 1)
  assert.doesNotMatch(JSON.stringify(openResult), /private|open denied/)
})

test('maps ordinary clipboard failures without misreporting a permission denial', async () => {
  const harness = createHarness({ failClipboard: true })
  await harness.module.onInit()

  const result = await harness.module.onItemAction({
    meta: { defaultAction: 'browser-bookmarks' },
    actions: [{ id: 'copy-url', payload: { url: 'https://example.com/' } }],
  })
  assert.equal(result.reason, 'clipboard-write-failed')
  assert.equal(result.message, '复制失败')
  assert.doesNotMatch(JSON.stringify(result), /private|clipboard write failed/)
})

test('opens, copies and persists recent state when host capabilities grant calls', async () => {
  const harness = createHarness()
  await harness.module.onInit()

  const copyResult = await harness.module.onItemAction({
    meta: { defaultAction: 'browser-bookmarks' },
    actions: [{ id: 'copy-url', payload: { url: 'https://example.com/' } }],
  })
  assert.equal(copyResult.status, 'started')
  assert.deepEqual(harness.state.clipboardWrites, ['https://example.com/'])

  const openResult = await harness.module.onItemAction({
    meta: { defaultAction: 'browser-bookmarks' },
    actions: [{
      id: 'open-url',
      payload: { url: 'https://example.com/', title: 'Example' },
    }],
  })
  assert.equal(openResult.status, 'started')
  assert.deepEqual(harness.state.opened, ['https://example.com/'])
  assert.equal(harness.files.get('recent-urls.json').items[0].url, 'https://example.com/')
})
