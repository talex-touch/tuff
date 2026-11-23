const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
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
        if (options.onGetFile)
          await options.onGetFile(name)
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
      if (options.openErrorCode) {
        throw Object.assign(new Error('/private/open error'), {
          code: options.openErrorCode,
        })
      }
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
  assert.deepEqual(Object.keys(harness.module).sort(), ['onDestroy', 'onFeatureTriggered', 'onInit', 'onItemAction'])
  assert.equal(
    harness.state.items.some(item => item.actions.some(action => action.id === 'open-link')),
    true,
  )
  assert.equal(
    harness.state.items.some(item => item.actions.some(action => action.id === 'config-open')),
    false,
  )
})

test('ignores null/non-object/invalid links without crashing and displays valid link count', async () => {
  const harness = createHarness({
    files: [
      [
        'toolbox.json',
        {
          links: [
            null,
            undefined,
            'not-an-object',
            42,
            { title: 'Bad Scheme', url: 'javascript:alert(1)' },
            { title: 'Docs', url: 'https://example.com/docs' },
            { title: '', url: 'https://example.com/api' },
          ],
        },
      ],
    ],
  })

  assert.equal(await harness.module.onFeatureTriggered('dev-toolbox', ''), true)
  const countItem = harness.state.items.find(item => item.id === 'dev-toolbox-counts')
  assert.ok(countItem)
  assert.equal(countItem.render.basic.subtitle, '2')
  const openItems = harness.state.items.filter(item => item.actions.some(action => action.id === 'open-link'))
  assert.equal(openItems.length, 2)
})

test('maps host permission denial, permission-unavailable, cancelled and timeout distinctly', async () => {
  const denied = createHarness({ denyOpen: true, permissionGranted: false })
  const deniedResult = await denied.module.onItemAction({
    meta: { defaultAction: 'dev-toolbox' },
    actions: [{ id: 'open-link', payload: { url: 'https://example.com/docs' } }],
  })
  assert.equal(denied.state.opened.length, 1)
  assert.equal(deniedResult.reason, 'permission-denied')
  assert.doesNotMatch(JSON.stringify(deniedResult), /private|open denied/)

  const cases = [
    ['PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE', 'blocked', 'permission-unavailable'],
    ['PLUGIN_HOST_CAPABILITY_CANCELLED', 'cancelled', 'cancelled'],
    ['PLUGIN_HOST_CAPABILITY_TIMEOUT', 'failed', 'timeout'],
  ]
  for (const [code, expectedStatus, expectedReason] of cases) {
    const harness = createHarness({ openErrorCode: code })
    const result = await harness.module.onItemAction({
      meta: { defaultAction: 'dev-toolbox' },
      actions: [{ id: 'open-link', payload: { url: 'https://example.com/docs' } }],
    })
    assert.equal(result.status, expectedStatus)
    assert.equal(result.reason, expectedReason)
  }
})

test('opens a validated link and honors context.actionId', async () => {
  const harness = createHarness()
  const multiActionItem = {
    meta: { defaultAction: 'dev-toolbox' },
    actions: [
      { id: 'config-init', payload: {} },
      { id: 'open-link', payload: { url: 'https://example.com/docs' } },
    ],
  }

  const result = await harness.module.onItemAction(multiActionItem, { actionId: 'open-link' })
  assert.equal(result.status, 'started')
  assert.deepEqual(harness.state.opened, ['https://example.com/docs'])

  const missing = await harness.module.onItemAction(multiActionItem, { actionId: 'unknown' })
  assert.equal(missing.status, 'blocked')
  assert.equal(missing.reason, 'invalid-action')
})

test('generation guard and onDestroy drop stale async triggers', async () => {
  let release
  let startedResolve
  const started = new Promise((resolve) => {
    startedResolve = resolve
  })
  let pending = true
  const harness = createHarness({
    files: [['toolbox.json', { links: [{ title: 'Docs', url: 'https://example.com/docs' }] }]],
    async onGetFile() {
      if (pending) {
        pending = false
        startedResolve()
        await new Promise((resolve) => {
          release = resolve
        })
      }
    },
  })

  const run = harness.module.onFeatureTriggered('dev-toolbox', '')
  await started
  await harness.module.onDestroy()
  release()
  await run
  assert.deepEqual(harness.state.items, [])
})

test('manifest and package.json align featureId, indexedSourceId and npm metadata', () => {
  const manifest = JSON.parse(readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'))
  const pkg = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf8'))

  assert.equal(manifest.searchProviders[0].featureId, 'dev-toolbox')
  assert.equal(manifest.searchProviders[0].indexedSourceId, 'quicklinks')
  assert.equal(pkg.version, manifest.version)
  assert.equal(pkg.packageManager, 'pnpm@11.24.0')
  assert.ok(pkg.keywords.includes('tuff-plugin'))
  assert.equal(pkg.tuff.id, manifest.id)
  assert.equal(pkg.tuff.name, manifest.name)
})
