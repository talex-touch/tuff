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
  }
  Object.assign(globalThis, {
    plugin,
    clipboard: {
      async writeText(value) {
        state.copied.push(value)
      },
    },
    logger: { warn() {}, error() {} },
    permission: {
      async check(id) {
        return state.permissions[id] === true
      },
      async request(id) {
        return state.permissions[id] === true
      },
    },
    async openUrl(value) {
      state.opened.push(value)
    },
    TuffItemBuilder,
  })
  delete require.cache[require.resolve('./index.js')]
  const lifecycle = require('./index.js')
  delete require.cache[require.resolve('./index.js')]
  return { lifecycle, state }
}

test('Prelude exports only lifecycle methods and has no privileged Node access', () => {
  const source = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8')
  assert.deepEqual(Object.keys(loadPlugin().lifecycle).sort(), ['onFeatureTriggered', 'onItemAction'])
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

test('history permission denial leaves bookmark workflow available', async () => {
  const { lifecycle, state } = loadPlugin({
    permissions: { 'fs.index': false },
  })

  await lifecycle.onFeatureTriggered('browser-data', 'browser docs')
  assert.deepEqual(state.scans, [{ sources: ['bookmarks'], browser: undefined }])
  assert.equal(
    state.items.some(item =>
      item.meta.searchProviderId === 'touch-browser-data.browser-bookmarks'),
    true,
  )
  assert.equal(
    state.items.some(item =>
      item.meta.searchProviderId === 'touch-browser-data.browser-history'),
    false,
  )
})

test('blocked host source produces no child-forged records or diagnostics', async () => {
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
  assert.deepEqual(state.items, [])
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

test('open and copy actions preserve permission-gated typed workflows', async () => {
  const { lifecycle, state } = loadPlugin()
  await lifecycle.onFeatureTriggered('browser-data', 'docs')
  const bookmark = state.items.find(item =>
    item.meta.searchProviderId === 'touch-browser-data.browser-bookmarks'
    && item.actions.some(action => action.id === 'open-url'))

  const opened = await lifecycle.onItemAction(bookmark)
  assert.equal(opened.status, 'started')
  assert.deepEqual(state.opened, ['https://tuff.example/docs'])

  const copied = await lifecycle.onItemAction({
    meta: { defaultAction: 'browser-data' },
    actions: [{
      id: 'copy-url',
      payload: { url: 'https://tuff.example/docs' },
    }],
  })
  assert.equal(copied.status, 'completed')
  assert.deepEqual(state.copied, ['https://tuff.example/docs'])
})

test('open and copy fail closed when optional permissions are denied', async () => {
  const { lifecycle, state } = loadPlugin({
    permissions: {
      'network.internet': false,
      'clipboard.write': false,
    },
  })
  const open = await lifecycle.onItemAction({
    meta: { defaultAction: 'browser-data' },
    actions: [{
      id: 'open-url',
      payload: { url: 'https://example.com/' },
    }],
  })
  const copy = await lifecycle.onItemAction({
    meta: { defaultAction: 'browser-data' },
    actions: [{
      id: 'copy-url',
      payload: { url: 'https://example.com/' },
    }],
  })

  assert.equal(open.status, 'blocked')
  assert.equal(copy.status, 'blocked')
  assert.deepEqual(state.opened, [])
  assert.deepEqual(state.copied, [])
})
