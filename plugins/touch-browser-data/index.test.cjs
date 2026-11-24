const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

class TuffItemBuilder {
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

function loadPlugin(overrides = {}) {
  const state = {
    items: [],
    scans: [],
    removed: [],
    opened: [],
    copied: [],
    permissions: {
      'fs.read': true,
      'fs.index': true,
      'network.internet': true,
      'clipboard.write': true,
      ...overrides.permissions,
    },
  }
  const plugin = {
    feature: {
      async clearItems() {
        state.items = []
      },
      async pushItems(items) {
        state.items.push(...items)
      },
      async getItems() {
        return state.items
      },
      async removeItem(id) {
        state.removed.push(id)
        state.items = state.items.filter(item => item.id !== id)
        return true
      },
    },
    ...(overrides.omitBrowserData
      ? {}
      : {
          browserData: {
            async scan(sources, browser) {
              state.scans.push({ sources, browser })
              if (overrides.scan)
                return overrides.scan(sources, browser)
              const source = sources[0]
              return {
                operation: 'scan',
                status: 'completed',
                records:
                  source === 'bookmarks'
                    ? [
                        {
                          source,
                          browser: 'chrome',
                          browserName: 'Chrome',
                          profile: 'Default',
                          title: 'Tuff Docs',
                          url: 'https://tuff.example/docs',
                          folder: 'Docs',
                        },
                      ]
                    : [
                        {
                          source,
                          browser: 'chrome',
                          browserName: 'Chrome',
                          profile: 'Default',
                          title: 'Tuff History',
                          url: 'https://history.example/docs',
                          visitedAt: Date.now(),
                        },
                      ],
                diagnostics: [
                  {
                    source,
                    browser: 'chrome',
                    browserName: 'Chrome',
                    status: 'available',
                    code: 'BROWSER_DATA_OK',
                    profileCount: 1,
                    recordCount: 1,
                  },
                ],
              }
            },
          },
        }),
  }

  const permissionGlobal = overrides.permission === undefined
    ? {
        async check(id) {
          return state.permissions[id] === true
        },
        async request(id) {
          return state.permissions[id] === true
        },
      }
    : overrides.permission

  Object.assign(globalThis, {
    plugin,
    clipboard: overrides.clipboard || {
      async writeText(value) {
        state.copied.push(value)
      },
    },
    logger: { warn() {}, error() {} },
    permission: permissionGlobal,
    openUrl: overrides.openUrl || (async (value) => {
      state.opened.push(value)
    }),
    TuffItemBuilder,
  })
  delete require.cache[require.resolve('./index.js')]
  const lifecycle = require('./index.js')
  delete require.cache[require.resolve('./index.js')]
  return { lifecycle, state }
}

test('Prelude exports only lifecycle methods and has no privileged Node access', () => {
  const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
  assert.deepEqual(Object.keys(loadPlugin().lifecycle).sort(), ['onDestroy', 'onFeatureTriggered', 'onItemAction'])
  assert.doesNotMatch(source, /\brequire\s*\(/)
  assert.doesNotMatch(source, /node:(?:fs|os|path|process|sqlite|worker_threads)/)
  assert.doesNotMatch(source, /\b(?:DatabaseSync|process\.env|homedir|mkdtemp|copyFile|readFile|readdir)\b/)
  assert.doesNotMatch(source, /__test/)
})

test('feature trigger scans bookmarks and history through fixed browserData facade', async () => {
  const { lifecycle, state } = loadPlugin()

  assert.equal(await lifecycle.onFeatureTriggered('browser-data', 'chrome: docs'), true)
  assert.deepEqual(state.scans, [
    { sources: ['bookmarks'], browser: 'chrome' },
    { sources: ['history'], browser: 'chrome' },
  ])
  const bookmark = state.items.find(item =>
    item.meta.searchProviderId === 'touch-browser-data.browser-bookmarks'
    && item.actions.some(action => action.id === 'open-url'))
  const history = state.items.find(item =>
    item.meta.searchProviderId === 'touch-browser-data.browser-history'
    && item.actions.some(action => action.id === 'open-url'))
  assert.equal(bookmark.title, 'Chrome · Tuff Docs')
  assert.equal(bookmark.meta.searchProviderId, 'touch-browser-data.browser-bookmarks')
  assert.equal(history.title, 'Chrome · 历史 · Tuff History')
  assert.equal(history.meta.searchProviderId, 'touch-browser-data.browser-history')
  assert.equal(JSON.stringify(state.items).includes('Default'), false)
  assert.equal(JSON.stringify(state.items).includes('/Library/'), false)
})

test('history permission denial leaves bookmark workflow available and surfaces degraded history info', async () => {
  const { lifecycle, state } = loadPlugin({
    permissions: { 'fs.index': false },
  })

  await lifecycle.onFeatureTriggered('browser-data', 'browser docs')
  assert.deepEqual(state.scans, [{ sources: ['bookmarks'], browser: undefined }])
  assert.equal(
    state.items.some(item =>
      item.meta.searchProviderId === 'touch-browser-data.browser-bookmarks'
      && item.actions.length > 0),
    true,
  )
  const degradedHistory = state.items.find(item =>
    item.id === 'browser-data-browser-history-degraded'
    && item.meta.searchProviderId === 'touch-browser-data.browser-history')
  assert.ok(degradedHistory)
  assert.equal(degradedHistory.actions.length, 0)
  assert.match(degradedHistory.subtitle, /fs\.index/)
  assert.equal(
    state.items.some(item =>
      item.meta.searchProviderId === 'touch-browser-data.browser-history'
      && item.actions.length > 0),
    false,
  )
})

test('blocked host source emits explicit degraded info items without forging records', async () => {
  const { lifecycle, state } = loadPlugin({
    scan: async () => ({
      operation: 'scan',
      status: 'blocked',
      code: 'BROWSER_DATA_SOURCE_DISABLED',
      records: [],
      diagnostics: [],
    }),
  })

  await lifecycle.onFeatureTriggered('browser-data', '')
  assert.equal(state.items.length, 2)
  assert.equal(state.items.every(item => item.actions.length === 0), true)
  assert.ok(state.items.some(item => item.id === 'browser-data-browser-bookmarks-degraded'))
  assert.ok(state.items.some(item => item.id === 'browser-data-browser-history-degraded'))
})

test('guards missing browserData.scan capability and differentiates permission SDK failures', async () => {
  const unavailable = loadPlugin({ omitBrowserData: true })
  await unavailable.lifecycle.onFeatureTriggered('browser-data', 'docs')
  assert.equal(unavailable.state.items.length, 2)
  assert.ok(unavailable.state.items.every(item => item.title.includes('能力不可用')))

  const noSdk = loadPlugin({ permission: null })
  await noSdk.lifecycle.onFeatureTriggered('browser-data', 'docs')
  assert.equal(noSdk.state.items.length, 1)
  assert.match(noSdk.state.items[0].title, /权限 SDK 不可用/)

  const checkFailed = loadPlugin({
    permission: {
      async check() {
        throw new Error('ipc failed')
      },
    },
  })
  await checkFailed.lifecycle.onFeatureTriggered('browser-data', 'docs')
  assert.equal(checkFailed.state.items.length, 1)
  assert.match(checkFailed.state.items[0].title, /权限状态检查失败/)
})

test('rebuild and clear act only on the requested indexed source', async () => {
  const { lifecycle, state } = loadPlugin()
  await lifecycle.onFeatureTriggered('browser-data', 'docs')
  const bookmarkRebuild = state.items.find(item =>
    item.meta.searchProviderId === 'touch-browser-data.browser-bookmarks'
    && item.actions.some(action => action.id === 'rebuild-browser-data'))
  const historyIds = state.items
    .filter(item => item.meta.searchProviderId === 'touch-browser-data.browser-history')
    .map(item => item.id)

  const rebuilt = await lifecycle.onItemAction(bookmarkRebuild)
  assert.equal(rebuilt.status, 'completed')
  assert.deepEqual(rebuilt.sourceIds, ['browser-bookmarks'])
  assert.deepEqual(state.scans.at(-1), { sources: ['bookmarks'], browser: undefined })
  assert.equal(
    historyIds.every(id => state.removed.includes(id) === false),
    true,
  )

  const bookmarkClear = state.items.find(item =>
    item.meta.searchProviderId === 'touch-browser-data.browser-bookmarks'
    && item.actions.some(action => action.id === 'clear-browser-data-results'))
  const cleared = await lifecycle.onItemAction(bookmarkClear)
  assert.equal(cleared.status, 'completed')
  assert.equal(
    state.items.some(item =>
      item.meta.searchProviderId === 'touch-browser-data.browser-bookmarks'),
    false,
  )
})

test('open and secondary copy-url action via context.actionId work on 2-action record items', async () => {
  const { lifecycle, state } = loadPlugin()
  await lifecycle.onFeatureTriggered('browser-data', 'docs')
  const bookmark = state.items.find(item =>
    item.meta.searchProviderId === 'touch-browser-data.browser-bookmarks'
    && item.actions.some(action => action.id === 'open-url'))

  assert.deepEqual(bookmark.actions.map(action => action.id), ['open-url', 'copy-url'])

  const opened = await lifecycle.onItemAction(bookmark)
  assert.equal(opened.status, 'started')
  assert.deepEqual(state.opened, ['https://tuff.example/docs'])

  const copied = await lifecycle.onItemAction(bookmark, { actionId: 'copy-url' })
  assert.equal(copied.status, 'completed')
  assert.deepEqual(state.copied, ['https://tuff.example/docs'])
  assert.equal(state.opened.length, 1)

  const invalid = await lifecycle.onItemAction(bookmark, { actionId: 'non-existent' })
  assert.equal(invalid.status, 'blocked')
  assert.equal(invalid.reason, 'invalid-action')
})

test('open and copy fail closed on denied or unavailable host capability errors', async () => {
  const denied = loadPlugin({
    permissions: {
      'network.internet': false,
      'clipboard.write': false,
    },
  })
  const open = await denied.lifecycle.onItemAction({
    meta: { defaultAction: 'browser-data' },
    actions: [{
      id: 'open-url',
      payload: { url: 'https://example.com/' },
    }],
  })
  const copy = await denied.lifecycle.onItemAction({
    meta: { defaultAction: 'browser-data' },
    actions: [{
      id: 'copy-url',
      payload: { url: 'https://example.com/' },
    }],
  })

  assert.equal(open.status, 'blocked')
  assert.equal(open.reason, 'permission-denied')
  assert.equal(copy.status, 'blocked')
  assert.equal(copy.reason, 'permission-denied')
  assert.deepEqual(denied.state.opened, [])
  assert.deepEqual(denied.state.copied, [])

  const unavailable = loadPlugin({
    openUrl: async () => {
      throw Object.assign(new Error('permission service down'), {
        code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE',
      })
    },
    clipboard: {
      async writeText() {
        throw Object.assign(new Error('permission service down'), {
          code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE',
        })
      },
    },
  })
  const openUnavailable = await unavailable.lifecycle.onItemAction({
    meta: { defaultAction: 'browser-data' },
    actions: [{ id: 'open-url', payload: { url: 'https://example.com/' } }],
  })
  const copyUnavailable = await unavailable.lifecycle.onItemAction({
    meta: { defaultAction: 'browser-data' },
    actions: [{ id: 'copy-url', payload: { url: 'https://example.com/' } }],
  })
  assert.equal(openUnavailable.status, 'blocked')
  assert.equal(openUnavailable.reason, 'permission-unavailable')
  assert.equal(copyUnavailable.status, 'blocked')
  assert.equal(copyUnavailable.reason, 'permission-unavailable')
})

test('generation guard and onDestroy drop stale async scan results', async () => {
  let resolveFirst
  let scanStartedResolve
  const scanStarted = new Promise((resolve) => {
    scanStartedResolve = resolve
  })
  let callIndex = 0
  const { lifecycle, state } = loadPlugin({
    scan: async (sources) => {
      callIndex += 1
      if (callIndex === 1) {
        scanStartedResolve()
        await new Promise((resolve) => {
          resolveFirst = resolve
        })
      }
      return {
        operation: 'scan',
        status: 'completed',
        records: [{
          source: sources[0],
          browser: 'chrome',
          browserName: 'Chrome',
          profile: 'Default',
          title: callIndex === 1 ? 'Stale Bookmark' : 'Fresh Bookmark',
          url: `https://example.com/${callIndex}`,
          folder: 'Docs',
        }],
        diagnostics: [],
      }
    },
  })

  const firstRun = lifecycle.onFeatureTriggered('browser-data', 'stale')
  await scanStarted
  await lifecycle.onDestroy()
  resolveFirst()
  await firstRun
  assert.deepEqual(state.items, [])
})

test('manifest and package.json align featureId, logo asset, and npm metadata', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'))
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'))

  assert.equal(manifest.icon.type, 'file')
  assert.equal(manifest.icon.value, 'assets/logo.svg')
  assert.equal(fs.existsSync(path.join(__dirname, 'assets/logo.svg')), true)
  assert.equal(manifest.searchProviders.every(p => p.featureId === 'browser-data'), true)
  assert.equal(pkg.version, manifest.version)
  assert.equal(pkg.packageManager, 'pnpm@11.24.0')
  assert.ok(pkg.keywords.includes('tuff-plugin'))
  assert.equal(pkg.tuff.id, manifest.id)
  assert.equal(pkg.tuff.name, manifest.name)
})
