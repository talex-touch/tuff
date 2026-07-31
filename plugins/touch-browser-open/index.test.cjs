const assert = require('node:assert/strict')
const fs = require('node:fs')
const Module = require('node:module')
const path = require('node:path')
const test = require('node:test')

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
    browsers: [
      {
        id: 'chrome',
        name: 'Chrome',
        token: 'bo_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      },
    ],
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
  async getFeature(id) {
    return state.features.get(id)
  },
  async addFeature(feature) {
    state.features.set(feature.id, feature)
    return true
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

const sourcePath = path.join(__dirname, 'index.js')
const pluginModule = loadPluginModule(sourcePath)

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
    browsers: [
      {
        id: 'chrome',
        name: 'Chrome',
        token: 'bo_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      },
    ],
  }
}

test.beforeEach(reset)

test('production Prelude contains no privileged child surface or test export', () => {
  const source = fs.readFileSync(sourcePath, 'utf8')
  for (const pattern of [
    /\b__test\b/,
    /\brequire\s*\(/,
    /\bfetch\s*\(/,
    /(?:^|[^.\w])process\s*(?:\.|\[)/m,
    /\bnode:(?:fs|child_process|sqlite|worker_threads)\b/,
    /\belectron\b/,
  ]) {
    assert.doesNotMatch(source, pattern)
  }
  assert.deepEqual(Object.keys(pluginModule).sort(), [
    'onDestroy',
    'onFeatureTriggered',
    'onInit',
    'onInputChanged',
    'onItemAction',
  ])
})

test('registers bounded dynamic search features through the typed registry', async () => {
  await pluginModule.onInit()
  assert.deepEqual(
    [...state.features.keys()],
    ['search-engine-google', 'search-engine-bing', 'search-engine-duckduckgo'],
  )
  for (const feature of state.features.values()) {
    assert.equal(feature.icon.type, 'class')
    assert.deepEqual(feature.platform.darwin, { enable: true, arch: [], os: [] })
    assert.equal(feature.platform.win.enable, false)
  }
})

test('publishes only opaque browser tokens and opens a re-listed browser', async () => {
  await pluginModule.onFeatureTriggered('browser-open', 'example.com')
  const item = actionItem('open-browser')
  assert.ok(item)
  const action = item.actions.find(candidate => candidate.id === 'open-browser')
  assert.deepEqual(Object.keys(action.payload).sort(), ['browserToken', 'url'])
  assert.equal(action.payload.browserToken, 'bo_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')
  assert.doesNotMatch(JSON.stringify(state.items), /Applications|Google Chrome\.app|executable|target|path/i)

  const result = await pluginModule.onItemAction(item, { actionId: 'open-browser' })
  assert.deepEqual(result, {
    externalAction: true,
    success: true,
    status: 'completed',
  })
  assert.deepEqual(state.openCalls, [
    {
      url: 'https://example.com/',
      token: 'bo_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    },
  ])
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
        token: 'bo_ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ',
        lastUsedAt: Date.now(),
      },
    ],
  })
  await pluginModule.onFeatureTriggered('browser-open', 'https://example.com')
  const recent = state.items.find(item => item.title === '最近 · Chrome')
  assert.ok(recent)
  assert.deepEqual(recent.actions[0].payload, {
    url: 'https://example.com/',
    browserToken: 'bo_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  })
  assert.doesNotMatch(JSON.stringify(recent), /Calculator|ZZZZ/)
})

test('uses bounded typed HTTP suggestions and keeps direct search first', async () => {
  await pluginModule.onFeatureTriggered('search-engine-google', 'google tuff', null, new AbortController().signal)
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
  await pluginModule.onFeatureTriggered('browser-open', 'example.com')
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
  await pluginModule.onFeatureTriggered('browser-open', 'example.com')
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
