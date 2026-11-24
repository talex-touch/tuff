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
  const state = { items: [], clipboardWrites: [], opened: [] }
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
  const permissionGlobal = options.permission === undefined
    ? {
        async check() {
          if (options.permissionThrows)
            throw new Error('permission check failed')
          return options.permissionGranted !== false
        },
      }
    : options.permission

  const sandbox = {
    plugin,
    clipboard: {
      async writeText(value) {
        if (options.clipboardErrorCode) {
          throw Object.assign(new Error('/private/clipboard error'), {
            code: options.clipboardErrorCode,
          })
        }
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
    permission: permissionGlobal,
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
  assert.deepEqual(Object.keys(harness.module).sort(), ['onDestroy', 'onFeatureTriggered', 'onInit', 'onItemAction'])
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

test('differentiates permission-sdk-unavailable and permission-check-failed suffixes', async () => {
  const sdkUnavailable = createHarness({ permission: null })
  await sdkUnavailable.module.onFeatureTriggered('browser-bookmarks', 'example.com')
  const sdkOpenItem = sdkUnavailable.state.items.find(item => item.render.basic.title === '默认浏览器打开')
  assert.match(sdkOpenItem.render.basic.subtitle, /权限 SDK 不可用/)
  assert.match(sdkOpenItem.render.basic.subtitle, /缺少 network\.internet 权限/)

  const checkFailed = createHarness({ permissionThrows: true })
  await checkFailed.module.onFeatureTriggered('browser-bookmarks', 'example.com')
  const failOpenItem = checkFailed.state.items.find(item => item.render.basic.title === '默认浏览器打开')
  assert.match(failOpenItem.render.basic.subtitle, /权限检查失败/)
  assert.match(failOpenItem.render.basic.subtitle, /缺少 network\.internet 权限/)
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

test('maps permission-unavailable, cancelled and timeout host errors distinctly', async () => {
  const cases = [
    ['PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE', 'blocked', 'permission-unavailable'],
    ['PLUGIN_HOST_CAPABILITY_CANCELLED', 'cancelled', 'cancelled'],
    ['PLUGIN_HOST_CAPABILITY_TIMEOUT', 'failed', 'timeout'],
  ]

  for (const [code, expectedStatus, expectedReason] of cases) {
    const harness = createHarness({ clipboardErrorCode: code, openErrorCode: code })
    await harness.module.onInit()

    const copyResult = await harness.module.onItemAction({
      meta: { defaultAction: 'browser-bookmarks' },
      actions: [{ id: 'copy-url', payload: { url: 'https://example.com/' } }],
    })
    assert.equal(copyResult.status, expectedStatus)
    assert.equal(copyResult.reason, expectedReason)

    const openResult = await harness.module.onItemAction({
      meta: { defaultAction: 'browser-bookmarks' },
      actions: [{ id: 'open-url', payload: { url: 'https://example.com/', title: 'Example' } }],
    })
    assert.equal(openResult.status, expectedStatus)
    assert.equal(openResult.reason, expectedReason)
  }
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

test('supports secondary toggle-pin, copy-url and remove-bookmark actions via context.actionId', async () => {
  const harness = createHarness({
    files: [
      [
        'bookmarks.json',
        {
          items: [
            {
              id: 'bm-1',
              url: 'https://docs.example.com/',
              title: 'Docs',
              tags: ['dev'],
              pinned: false,
              createdAt: 100,
              updatedAt: 200,
            },
          ],
          updatedAt: 200,
        },
      ],
      ['recent-urls.json', { items: [], updatedAt: 0 }],
    ],
  })

  await harness.module.onFeatureTriggered('browser-bookmarks', '')
  const item = harness.state.items.find(candidate => candidate.render.basic.title === '手动收藏 · Docs')
  assert.ok(item)
  assert.deepEqual(
    item.actions.map(action => action.id),
    ['open-url', 'toggle-pin-bookmark', 'copy-url', 'remove-bookmark'],
  )

  const copied = await harness.module.onItemAction(item, { actionId: 'copy-url' })
  assert.equal(copied.status, 'started')
  assert.deepEqual(harness.state.clipboardWrites, ['https://docs.example.com/'])

  const pinned = await harness.module.onItemAction(item, { actionId: 'toggle-pin-bookmark' })
  assert.equal(pinned.status, 'completed')
  assert.equal(pinned.pinned, true)
  assert.equal(harness.files.get('bookmarks.json').items[0].pinned, true)

  await harness.module.onFeatureTriggered('browser-bookmarks', '')
  const pinnedItem = harness.state.items.find(candidate => candidate.render.basic.title === '手动收藏 · Docs')
  const unpinned = await harness.module.onItemAction(pinnedItem, { actionId: 'toggle-pin-bookmark' })
  assert.equal(unpinned.status, 'completed')
  assert.equal(unpinned.pinned, false)
  assert.equal(harness.files.get('bookmarks.json').items[0].pinned, false)

  const removed = await harness.module.onItemAction(pinnedItem, { actionId: 'remove-bookmark' })
  assert.equal(removed.status, 'completed')
  assert.equal(removed.removed, true)
  assert.equal(harness.files.get('bookmarks.json').items.length, 0)

  const missingRemove = await harness.module.onItemAction(pinnedItem, { actionId: 'remove-bookmark' })
  assert.equal(missingRemove.status, 'blocked')
  assert.equal(missingRemove.reason, 'bookmark-not-found')
})

test('generation guard and onDestroy drop stale triggers', async () => {
  let releaseFirst
  let startedResolve
  const started = new Promise((resolve) => {
    startedResolve = resolve
  })
  let firstPending = true
  const harness = createHarness({
    files: [
      ['bookmarks.json', { items: [], updatedAt: 0 }],
      ['recent-urls.json', { items: [], updatedAt: 0 }],
    ],
    async onGetFile(name) {
      if (firstPending && name === 'bookmarks.json') {
        firstPending = false
        startedResolve()
        await new Promise((resolve) => {
          releaseFirst = resolve
        })
      }
    },
  })

  const run = harness.module.onFeatureTriggered('browser-bookmarks', 'example.com')
  await started
  await harness.module.onDestroy()
  releaseFirst()
  await run
  assert.deepEqual(harness.state.items, [])
})

test('manifest and package.json align featureId, indexedSourceId and npm metadata', () => {
  const manifest = JSON.parse(readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'))
  const pkg = JSON.parse(readFileSync(path.join(__dirname, 'package.json'), 'utf8'))

  assert.equal(manifest.searchProviders[0].featureId, 'browser-bookmarks')
  assert.equal(manifest.searchProviders[0].indexedSourceId, 'quicklinks')
  assert.equal(pkg.version, manifest.version)
  assert.equal(pkg.packageManager, 'pnpm@11.24.0')
  assert.ok(pkg.keywords.includes('tuff-plugin'))
  assert.equal(pkg.tuff.id, manifest.id)
  assert.equal(pkg.tuff.name, manifest.name)
})
