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
  const state = { items: [], opened: [] }
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
    openUrl: async (url) => {
      state.opened.push(url)
      if (options.denyOpen) {
        throw Object.assign(new Error('/private/open denied'), {
          code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED',
        })
      }
    },
    permission: {
      async check() {
        return options.permissionGranted !== false
      },
    },
    logger: {},
    TuffItemBuilder: FakeBuilder,
    URL,
    module: { exports: {} },
  }
  sandbox.exports = sandbox.module.exports
  vm.runInNewContext(readFileSync(require.resolve('./index.js'), 'utf8'), sandbox, {
    filename: 'touch-dev-toolbox/index.js',
  })
  return { files, module: sandbox.module.exports, state }
}

test('initializes storage, publishes configured links and exports lifecycle only', async () => {
  const harness = createHarness({
    files: [['toolbox.json', { links: [{ title: 'Docs', url: 'https://example.com/docs' }] }]],
  })
  await harness.module.onInit()
  await harness.module.onFeatureTriggered('dev-toolbox', { text: 'Docs' })

  assert.equal(harness.module.__test, undefined)
  assert.equal(
    harness.state.items.some(item => item.actions.some(action => action.id === 'open-link')),
    true,
  )
  assert.equal(
    harness.state.items.some(item => item.actions.some(action => action.id === 'config-open')),
    false,
  )
})

test('maps a host permission denial to a stable blocked result', async () => {
  const harness = createHarness({ denyOpen: true, permissionGranted: false })
  const result = await harness.module.onItemAction({
    meta: { defaultAction: 'dev-toolbox' },
    actions: [{ id: 'open-link', payload: { url: 'https://example.com/docs' } }],
  })

  assert.equal(harness.state.opened.length, 1)
  assert.equal(result.reason, 'permission-denied')
  assert.doesNotMatch(JSON.stringify(result), /private|open denied/)
})

test('opens a validated link when the host capability grants the call', async () => {
  const harness = createHarness()
  const result = await harness.module.onItemAction({
    meta: { defaultAction: 'dev-toolbox' },
    actions: [{ id: 'open-link', payload: { url: 'https://example.com/docs' } }],
  })

  assert.equal(result.status, 'started')
  assert.deepEqual(harness.state.opened, ['https://example.com/docs'])
})
