const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

const TOKEN_A = `bo_${'A'.repeat(32)}`
const TOKEN_B = `bo_${'B'.repeat(32)}`

class FakeBuilder {
  constructor(id) {
    this.item = { id }
    this.basic = {}
  }

  setSource(type, id, name) {
    this.item.source = { type, id, name }
    return this
  }

  setTitle(title) {
    this.item.title = title
    this.basic.title = title
    return this
  }

  setSubtitle(subtitle) {
    this.item.subtitle = subtitle
    this.basic.subtitle = subtitle
    return this
  }

  setIcon(icon) {
    this.basic.icon = icon
    return this
  }

  setMeta(meta) {
    this.item.meta = meta
    return this
  }

  createAndAddAction(id, type, label, payload) {
    this.item.actions ||= []
    this.item.actions.push({ id, type, label, payload })
    return this
  }

  build() {
    return { ...this.item, render: { mode: 'default', basic: this.basic } }
  }
}

const state = {
  items: [],
  files: new Map(),
  openCalls: [],
  httpCalls: [],
  clipboardWrites: [],
  features: new Map(),
  listResult: {
    operation: 'list',
    status: 'available',
    defaultAvailable: true,
    browsers: [{ id: 'chrome', name: 'Chrome', token: TOKEN_A }],
  },
}

globalThis.plugin = {
  getLocale: () => 'zh-CN',
  feature: {
    async clearItems() {
      state.items.length = 0
    },
    async pushItems(items) {
      state.items.push(...items)
    },
  },
  storage: {
    async getFile(name) {
      return state.files.get(name) ?? null
    },
    async setFile(name, value) {
      state.files.set(name, value)
    },
  },
  browser: {
    async list() {
      return state.listResult
    },
    async open(url, token) {
      state.openCalls.push({ url, token })
      return { operation: 'open', status: 'completed' }
    },
  },
}
globalThis.clipboard = {
  async writeText(value) {
    state.clipboardWrites.push(value)
  },
}
globalThis.http = {
  async get(url, config) {
    state.httpCalls.push({ url, config })
    return {
      status: 200,
      statusText: 'OK',
      headers: {},
      data: ['tuff', ['tuff app', 'tuff plugin']],
      url,
      ok: true,
    }
  },
}
globalThis.features = {
  async addFeature(feature) {
    state.features.set(feature.id, feature)
    return true
  },
  async removeFeature(featureId) {
    return state.features.delete(featureId)
  },
  async getFeature(featureId) {
    return state.features.get(featureId)
  },
  async getFeatures() {
    return [...state.features.values()]
  },
}
globalThis.platform = { platform: 'darwin', arch: 'arm64' }
globalThis.logger = { error() {}, warn() {}, info() {} }
globalThis.TuffItemBuilder = FakeBuilder

function loadPluginModule(filename) {
  const source = fs.readFileSync(filename, 'utf8')
  const mod = new Module(filename)
  mod.filename = filename
  mod.paths = Module._nodeModulePaths(path.dirname(filename))
  mod._compile(source, filename)
  return mod.exports
}

const pluginModule = loadPluginModule(path.join(__dirname, 'index.js'))

function feature(id) {
  return state.features.get(id)
}

function actionItem(actionId) {
  return state.items.find(item => item.actions?.some(action => action.id === actionId))
}

function reset() {
  state.items.length = 0
  state.files.clear()
  state.openCalls.length = 0
  state.httpCalls.length = 0
  state.clipboardWrites.length = 0
  state.features.clear()
  state.listResult = {
    operation: 'list',
    status: 'available',
    defaultAvailable: true,
    browsers: [{ id: 'chrome', name: 'Chrome', token: TOKEN_A }],
  }
}

test.beforeEach(reset)

test('registers direct entries beside the search modes, sharing one non-push shape', async () => {
  await pluginModule.onInit()

  for (const id of ['search-engine-google', 'search-engine-bing', 'search-engine-duckduckgo']) {
    assert.equal(feature(id)?.push, true, `${id} should stay an explicit push mode`)
  }
  for (const id of [
    'search-open-google',
    'search-open-baidu',
    'browser-direct-default',
    'browser-direct-chrome',
    'hot-weibo-hot',
  ]) {
    const entry = feature(id)
    assert.ok(entry, `${id} should be registered`)
    // A non-push feature is what lets one Enter navigate instead of opening a surface.
    assert.equal(entry.push, false, `${id} should not require a second activation`)
    assert.equal(typeof entry.commands?.[0]?.value, 'string')
    assert.equal(entry.commands?.[0]?.type, 'regex')
  }
})

test('opens the URL carried by the copied query inputs, without the push list or a second press', async () => {
  await pluginModule.onInit()

  const result = await pluginModule.onFeatureTriggered('browser-direct-default', {
    text: '',
    inputs: [{ type: 'text', content: 'example.com/from-inputs' }],
  })

  assert.equal(result, false)
  assert.deepEqual(state.openCalls, [{ url: 'https://example.com/from-inputs', token: undefined }])
  // A one-shot entry publishes nothing, so there is no surface to confirm in.
  assert.deepEqual(state.items, [])
})

test('searches unicode and ampersands once, percent-encoded into the engine template', async () => {
  await pluginModule.onInit()
  const query = '中文 & a/b?c'

  const result = await pluginModule.onFeatureTriggered('search-open-google', { text: query })

  assert.equal(result, false)
  assert.deepEqual(state.openCalls, [
    { url: `https://www.google.com/search?q=${encodeURIComponent(query)}`, token: undefined },
  ])
  assert.deepEqual(state.items, [])
  // Direct search never asks the network for suggestions; that is the explicit push mode's job.
  assert.deepEqual(state.httpCalls, [])
})

test('a settings-defined engine drives its own {query} template', async () => {
  state.files.set('search-settings.json', {
    engines: [
      {
        id: 'kagi',
        name: 'Kagi',
        keyword: 'kagi',
        urlTemplate: 'https://kagi.com/search?q={query}',
        enabled: true,
      },
    ],
    defaultEngine: 'kagi',
    hotEntries: [],
  })
  await pluginModule.onInit()

  assert.ok(feature('search-open-kagi'), 'a custom enabled engine registers a direct entry')
  const query = 'a&b 中'
  await pluginModule.onFeatureTriggered('search-open-kagi', { text: query })

  assert.deepEqual(state.openCalls, [
    { url: `https://kagi.com/search?q=${encodeURIComponent(query)}`, token: undefined },
  ])
})

test('disabling an engine removes its registered features', async () => {
  await pluginModule.onInit()
  assert.ok(feature('search-open-google'))
  assert.ok(feature('search-engine-google'))

  state.files.set('search-settings.json', {
    engines: [
      {
        id: 'google',
        name: 'Google',
        keyword: 'google',
        urlTemplate: 'https://www.google.com/search?q={query}',
        enabled: false,
      },
    ],
    hotEntries: [
      {
        id: 'weibo-hot',
        name: '微博热搜',
        keyword: 'weibo',
        url: 'https://s.weibo.com/top/summary',
        enabled: true,
      },
    ],
  })
  await pluginModule.onMessage('browser-open:sync-settings')

  // A disabled engine must leave nothing behind — neither its direct entry nor its push mode.
  assert.equal(feature('search-engine-google'), undefined)
  assert.equal(feature('search-open-google'), undefined)
  assert.deepEqual(state.openCalls, [])
  // Other engines and entries are not collateral damage.
  assert.ok(feature('search-open-bing'))
  assert.ok(feature('hot-weibo-hot'))
})

test('a hot entry opens its target directly', async () => {
  await pluginModule.onInit()

  const result = await pluginModule.onFeatureTriggered('hot-weibo-hot', { text: '' })

  assert.equal(result, false)
  assert.deepEqual(state.openCalls, [
    { url: 'https://s.weibo.com/top/summary', token: undefined },
  ])
  assert.deepEqual(state.items, [])
})

test('the catch-all search entry matches plain text but not URLs, paths or file names', async () => {
  await pluginModule.onInit()
  const pattern = feature('search-open-google').commands[0].value
  const matches = value => new RegExp(pattern).test(value)

  for (const text of ['hello world', '中文 关键词', 'how to build a thing', 'tuff']) {
    assert.equal(matches(text), true, `plain text should route to search: ${text}`)
  }
  for (const text of [
    'https://example.com/a?b=1',
    'http://example.com',
    '~/Workspace',
    '/Users/x/Downloads',
    'C:\\Users\\x\\Downloads',
    'readme.md',
    'notes.txt',
  ]) {
    assert.equal(matches(text), false, `URL/path/file must not route to search: ${text}`)
  }
})

test('a bare host is matched by the browser-link pattern, not the search pattern', async () => {
  await pluginModule.onInit()
  const searchPattern = new RegExp(feature('search-open-google').commands[0].value)
  const linkPattern = new RegExp(feature('browser-direct-default').commands[0].value)

  // The registered link entry accepts the domain forms the search entry refuses, so a typed domain
  // always becomes an "open link" row rather than a web search.
  for (const text of ['example.com', 'example.com/docs', 'www.example.com/a?b=1', 'https://example.com/a?b=1']) {
    assert.equal(linkPattern.test(text), true, `a URL should be link-shaped: ${text}`)
    assert.equal(searchPattern.test(text), false, `a URL must not be search-shaped: ${text}`)
  }
})

test('a per-browser entry re-lists at execution time and opens with the fresh token', async () => {
  await pluginModule.onInit()
  assert.ok(feature('browser-direct-chrome'))

  // The registration-time inventory is stale by the time the user presses Enter.
  state.listResult = {
    operation: 'list',
    status: 'available',
    defaultAvailable: true,
    browsers: [{ id: 'chrome', name: 'Chrome', token: TOKEN_B }],
  }
  const result = await pluginModule.onFeatureTriggered('browser-direct-chrome', {
    text: 'example.com',
  })

  assert.equal(result, false)
  assert.deepEqual(state.openCalls, [{ url: 'https://example.com/', token: TOKEN_B }])
})

test('refuses a direct trigger with no usable URL and opens nothing', async () => {
  await pluginModule.onInit()

  const result = await pluginModule.onFeatureTriggered('browser-direct-default', {
    text: '',
    inputs: [],
  })

  assert.equal(result.accepted, false)
  assert.equal(result.success, false)
  assert.deepEqual(state.openCalls, [])
})

test('publishes only opaque browser tokens and opens a re-listed browser', async () => {
  await pluginModule.onFeatureTriggered('browser-open', { text: 'example.com' })
  const item = actionItem('open-browser')
  assert.ok(item)
  const action = item.actions.find(candidate => candidate.id === 'open-browser')
  assert.deepEqual(Object.keys(action.payload).sort(), ['browserToken', 'url'])
  assert.equal(action.payload.browserToken, TOKEN_A)
  assert.doesNotMatch(JSON.stringify(state.items), /Applications|Google Chrome\.app|executable|target|path/i)

  const result = await pluginModule.onItemAction(item, { actionId: 'open-browser' })
  assert.deepEqual(result, { externalAction: true, success: true, status: 'completed' })
  assert.deepEqual(state.openCalls, [{ url: 'https://example.com/', token: TOKEN_A }])
  const recent = state.files.get('recent-browsers.json')
  assert.deepEqual(Object.keys(recent.items[0]).sort(), ['id', 'lastUsedAt', 'name'])
  assert.equal(recent.items[0].id, 'chrome')
  assert.equal(JSON.stringify(recent).includes('token'), false)
})

test('re-lists recent display ids and never treats storage as authority', async () => {
  state.files.set('recent-browsers.json', {
    items: [
      {
        id: 'chrome',
        name: 'Forged Chrome',
        target: '/Applications/Calculator.app',
        token: `bo_${'Z'.repeat(32)}`,
        lastUsedAt: Date.now(),
      },
    ],
  })
  await pluginModule.onFeatureTriggered('browser-open', { text: 'https://example.com' })
  const recent = state.items.find(item => item.title === '最近 · Chrome')
  assert.ok(recent)
  assert.deepEqual(recent.actions[0].payload, {
    url: 'https://example.com/',
    browserToken: TOKEN_A,
  })
  assert.doesNotMatch(JSON.stringify(recent), /Calculator|ZZZZ/)
})

test('uses bounded typed HTTP suggestions and keeps direct search first', async () => {
  await pluginModule.onFeatureTriggered(
    'search-engine-google',
    { text: 'google tuff' },
    null,
    new AbortController().signal,
  )
  assert.equal(state.httpCalls.length, 1)
  assert.match(state.httpCalls[0].url, /^https:\/\/suggestqueries\.google\.com\//)
  assert.equal(state.httpCalls[0].config.responseType, 'json')
  assert.deepEqual(
    state.items.map(item => item.title),
    ['Google 搜索：tuff', 'tuff app', 'tuff plugin'],
  )
  const direct = actionItem('search-web')
  const result = await pluginModule.onItemAction(direct, { actionId: 'search-web' })
  assert.equal(result.status, 'completed')
  assert.equal(state.openCalls[0].token, undefined)
  assert.equal(state.openCalls[0].url, 'https://www.google.com/search?q=tuff')
})

test('awaits clipboard writes and rejects hostile action payloads', async () => {
  await pluginModule.onFeatureTriggered('browser-open', { text: 'example.com' })
  const copy = actionItem('copy-url')
  await pluginModule.onItemAction(copy, { actionId: 'copy-url' })
  assert.deepEqual(state.clipboardWrites, ['https://example.com/'])

  const forged = {
    ...copy,
    actions: [
      {
        id: 'default-open',
        type: 'plugin',
        label: 'open',
        payload: {
          url: 'https://example.com',
          executable: '/Applications/Calculator.app',
        },
      },
    ],
  }
  forged.meta = { ...copy.meta, defaultAction: 'default-open' }
  const result = await pluginModule.onItemAction(forged, { actionId: 'default-open' })
  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'invalid-action')
  assert.equal(state.openCalls.length, 0)
})

test('maps capability denial to a deterministic redacted result', async () => {
  globalThis.plugin.browser.open = async () => {
    throw Object.assign(new Error('/private/path denied'), {
      code: 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED',
    })
  }
  await pluginModule.onFeatureTriggered('browser-open', { text: 'example.com' })
  const result = await pluginModule.onItemAction(actionItem('default-open'), {
    actionId: 'default-open',
  })
  assert.deepEqual(result, {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'permission-denied',
  })
  globalThis.plugin.browser.open = async (url, token) => {
    state.openCalls.push({ url, token })
    return { operation: 'open', status: 'completed' }
  }
})
