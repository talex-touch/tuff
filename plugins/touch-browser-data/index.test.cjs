const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

globalThis.plugin = { feature: { clearItems() {}, pushItems() {} } }
globalThis.clipboard = {}
globalThis.logger = {}
globalThis.permission = {}
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

const {
  buildBrowserSourceDiagnostics,
  buildResultItems,
  resolveNetworkOpenCapabilityState,
  discoverBookmarkFiles,
  getAvailableBrowserNames,
  parseChromiumBookmarks,
  parseQuery,
  scanBrowserBookmarks,
  searchBookmarks,
} = require('./index.js').__test

function loadFreshPluginModule(globals = {}) {
  Object.assign(globalThis, globals)
  delete require.cache[require.resolve('./index.js')]
  const pluginModule = require('./index.js')
  delete require.cache[require.resolve('./index.js')]
  return pluginModule
}

function createChromiumBookmarksPayload() {
  return {
    roots: {
      bookmark_bar: {
        type: 'folder',
        name: 'Bookmarks Bar',
        children: [
          {
            type: 'url',
            name: 'Tuff Docs',
            url: 'https://tuff.tagzxia.com/docs',
            date_added: '1',
          },
          {
            type: 'folder',
            name: 'Tools',
            children: [
              {
                type: 'url',
                name: 'Raycast Store',
                url: 'https://www.raycast.com/store',
                date_added: '2',
              },
              {
                type: 'url',
                name: 'Local File',
                url: 'file:///tmp/demo.txt',
              },
            ],
          },
        ],
      },
    },
  }
}

test('parseQuery strips command prefixes and captures browser filters', () => {
  assert.deepEqual(parseQuery('browser-data docs'), { browser: '', keyword: 'docs' })
  assert.deepEqual(parseQuery('chrome: tuff'), { browser: 'chrome', keyword: 'tuff' })
  assert.deepEqual(parseQuery('edge bookmarks'), { browser: 'edge', keyword: 'bookmarks' })
  assert.deepEqual(parseQuery('书签 文档'), { browser: '', keyword: '文档' })
})

test('parseChromiumBookmarks flattens folders and ignores non-http URLs', () => {
  const bookmarks = parseChromiumBookmarks(createChromiumBookmarksPayload(), {
    browserId: 'chrome',
    browserName: 'Chrome',
    profile: 'Default',
  })

  assert.equal(bookmarks.length, 2)
  assert.equal(bookmarks[0].title, 'Tuff Docs')
  assert.equal(bookmarks[0].folder, 'Bookmarks Bar')
  assert.equal(bookmarks[1].folder, 'Bookmarks Bar / Tools')
  assert.equal(bookmarks[1].url, 'https://www.raycast.com/store')
})

test('discoverBookmarkFiles finds standard Chromium profile bookmarks', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-browser-data-'))
  const profile = path.join(root, 'Profile 1')
  fs.mkdirSync(profile, { recursive: true })
  fs.writeFileSync(path.join(profile, 'Bookmarks'), JSON.stringify(createChromiumBookmarksPayload()))

  const files = discoverBookmarkFiles({ id: 'chrome', name: 'Chrome', root })

  assert.equal(files.length, 1)
  assert.equal(files[0].profile, 'Profile 1')
  assert.equal(files[0].browserName, 'Chrome')

  fs.rmSync(root, { recursive: true, force: true })
})

test('scanBrowserBookmarks reads definitions and reports diagnostics', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-browser-data-'))
  const profile = path.join(root, 'Default')
  fs.mkdirSync(profile, { recursive: true })
  fs.writeFileSync(path.join(profile, 'Bookmarks'), JSON.stringify(createChromiumBookmarksPayload()))

  const scan = scanBrowserBookmarks({
    definitions: [{ id: 'chrome', name: 'Chrome', root }],
    browserFilter: 'chrome',
  })

  assert.equal(scan.items.length, 2)
  assert.equal(scan.diagnostics[0].status, 'available')
  assert.equal(scan.diagnostics[0].profileCount, 1)

  fs.rmSync(root, { recursive: true, force: true })
})

test('buildBrowserSourceDiagnostics marks Linux Arc as unsupported', () => {
  const diagnostics = buildBrowserSourceDiagnostics('linux', [
    { id: 'chrome', name: 'Chrome', root: '/home/user/.config/google-chrome' },
    { id: 'edge', name: 'Edge', root: '/home/user/.config/microsoft-edge' },
    { id: 'brave', name: 'Brave', root: '/home/user/.config/BraveSoftware/Brave-Browser' },
  ])

  const arc = diagnostics.find(item => item.browserId === 'arc')
  assert.equal(arc.status, 'unsupported')
  assert.match(arc.reason, /unsupported on linux/)
})

test('scanBrowserBookmarks preserves read-failed reason', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuff-browser-data-'))
  const profile = path.join(root, 'Default')
  fs.mkdirSync(profile, { recursive: true })
  fs.writeFileSync(path.join(profile, 'Bookmarks'), '{not-json')

  const scan = scanBrowserBookmarks({
    definitions: [{ id: 'chrome', name: 'Chrome', root }],
    browserFilter: 'chrome',
  })

  assert.equal(scan.items.length, 0)
  assert.equal(scan.diagnostics[0].status, 'read-failed')
  assert.equal(scan.diagnostics[0].profileCount, 1)
  assert.ok(scan.diagnostics[0].lastError)
  assert.equal(scan.diagnostics[0].failedProfile, 'Default')

  fs.rmSync(root, { recursive: true, force: true })
})

test('searchBookmarks ranks title prefix before URL matches', () => {
  const bookmarks = [
    { title: 'Other', url: 'https://example.com/tuff', folder: '', browserName: 'Chrome', profile: 'Default' },
    { title: 'Tuff Docs', url: 'https://docs.example.com', folder: '', browserName: 'Chrome', profile: 'Default' },
  ]

  const result = searchBookmarks(bookmarks, 'tuff')

  assert.equal(result[0].title, 'Tuff Docs')
  assert.equal(result[1].title, 'Other')
})

test('buildResultItems creates open items with copy URL action', () => {
  const items = buildResultItems('browser-data', 'browser tuff', {
    items: [
      {
        title: 'Tuff Docs',
        url: 'https://tuff.tagzxia.com/docs',
        folder: 'Bookmarks Bar',
        browserName: 'Chrome',
        profile: 'Default',
      },
    ],
    diagnostics: [{ browserName: 'Chrome', status: 'available', profileCount: 1 }],
  })

  assert.equal(items[0].title, 'Chrome · Tuff Docs')
  assert.equal(items[0].meta.pluginName, 'touch-browser-data')
  assert.equal(items[0].meta.actionId, 'open-url')
  assert.deepEqual(items[0].meta.capability, {
    id: 'network.internet',
    type: 'network',
    permission: 'network.internet',
    status: 'available',
    audit: {
      pluginName: 'touch-browser-data',
      featureId: 'browser-data',
      actionId: 'open-url',
      operation: 'open-external-url',
      source: 'bookmarks-json',
      browserId: undefined,
      browserName: 'Chrome',
      profile: 'Default',
      urlHost: 'tuff.tagzxia.com',
    },
  })
  assert.deepEqual(items[0].meta.actions.copyUrl, {
    actionId: 'copy-url',
    payload: { url: 'https://tuff.tagzxia.com/docs' },
    permission: 'clipboard.write',
  })
  assert.deepEqual(items[0].actions[0], {
    id: 'copy-url',
    type: 'plugin',
    title: '复制 URL',
    payload: { url: 'https://tuff.tagzxia.com/docs' },
  })
  assert.equal(items.at(-1).title, '扫描状态')
})

test('manifest declares network permission for external bookmark opening', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'))

  assert.ok(manifest.permissions.optional.includes('network.internet'))
  assert.match(manifest.permissionReasons['network.internet'], /默认浏览器打开/)
})

test('buildResultItems shows network permission diagnostics without prompting', async () => {
  let requested = false
  Object.assign(globalThis.permission, {
    async check(permissionId) {
      return permissionId !== 'network.internet'
    },
    async request() {
      requested = true
      return false
    },
  })

  const capabilityState = await resolveNetworkOpenCapabilityState()
  const items = buildResultItems('browser-data', 'browser tuff', {
    items: [
      {
        browserId: 'chrome',
        title: 'Tuff Docs',
        url: 'https://tuff.tagzxia.com/docs',
        folder: 'Bookmarks Bar',
        browserName: 'Chrome',
        profile: 'Default',
      },
    ],
    diagnostics: [{ browserName: 'Chrome', status: 'available', profileCount: 1 }],
  }, capabilityState)

  assert.equal(capabilityState.status, 'permission-missing')
  assert.equal(requested, false)
  assert.match(items[0].subtitle, /缺少 network\.internet 权限/)
  assert.equal(items[0].meta.capability.status, 'permission-missing')
  assert.equal(items[0].meta.capability.reason, 'network-internet-permission-required')
  assert.equal(items[0].meta.capability.audit.browserId, 'chrome')
  assert.equal(items[0].meta.capability.audit.urlHost, 'tuff.tagzxia.com')
})

test('network diagnostics fail closed when permission sdk is unavailable', async () => {
  const pluginModule = loadFreshPluginModule({
    permission: {},
  })

  const capabilityState = await pluginModule.__test.resolveNetworkOpenCapabilityState()

  assert.equal(capabilityState.status, 'permission-missing')
  assert.equal(capabilityState.reason, 'permission-sdk-unavailable')
})

test('onFeatureTriggered blocks local bookmark scan when permission sdk is unavailable', async () => {
  const pushed = []
  const pluginModule = loadFreshPluginModule({
    permission: {},
    plugin: {
      feature: {
        clearItems() {},
        pushItems(items) {
          pushed.push(items)
        },
      },
    },
  })

  const result = await pluginModule.onFeatureTriggered('browser-data', 'browser tuff')

  assert.equal(result, true)
  assert.equal(pushed.at(-1)?.[0]?.id, 'browser-data-permission')
  assert.equal(pushed.at(-1)?.[0]?.title, '缺少文件读取权限')
})

test('onItemAction blocks external URL opening when network permission is denied', async () => {
  let opened = false
  const pluginModule = loadFreshPluginModule({
    openUrl: async () => {
      opened = true
    },
    permission: {
      async check() {
        return false
      },
      async request() {
        return false
      },
    },
  })

  const result = await pluginModule.onItemAction({
    meta: {
      defaultAction: 'browser-data',
      actionId: 'open-url',
      payload: { url: 'https://tuff.tagzxia.com/docs', title: 'Tuff Docs' },
    },
  })

  assert.deepEqual(result, {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'permission-denied',
    message: '缺少 network.internet 权限',
  })
  assert.equal(opened, false)
})

test('onItemAction blocks external URL opening when permission sdk is unavailable', async () => {
  let opened = false
  const pluginModule = loadFreshPluginModule({
    openUrl: async () => {
      opened = true
    },
    permission: {},
  })

  const result = await pluginModule.onItemAction({
    meta: {
      defaultAction: 'browser-data',
      actionId: 'open-url',
      payload: { url: 'https://tuff.tagzxia.com/docs', title: 'Tuff Docs' },
    },
  })

  assert.deepEqual(result, {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'permission-sdk-unavailable',
    message: '缺少 network.internet 权限',
  })
  assert.equal(opened, false)
})

test('onItemAction blocks external URL opening when permission request fails', async () => {
  let opened = false
  const pluginModule = loadFreshPluginModule({
    openUrl: async () => {
      opened = true
    },
    permission: {
      async check() {
        return false
      },
      async request() {
        throw new Error('permission transport failed')
      },
    },
  })

  const result = await pluginModule.onItemAction({
    meta: {
      defaultAction: 'browser-data',
      actionId: 'open-url',
      payload: { url: 'https://tuff.tagzxia.com/docs', title: 'Tuff Docs' },
    },
  })

  assert.deepEqual(result, {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'permission-request-failed',
    message: '缺少 network.internet 权限',
  })
  assert.equal(opened, false)
})

test('onItemAction opens external URL after network permission is granted', async () => {
  const opened = []
  const pluginModule = loadFreshPluginModule({
    openUrl: async (url) => {
      opened.push(url)
    },
    permission: {
      async check() {
        return true
      },
      async request() {
        return true
      },
    },
  })

  const result = await pluginModule.onItemAction({
    meta: {
      defaultAction: 'browser-data',
      actionId: 'open-url',
      payload: { url: 'https://tuff.tagzxia.com/docs', title: 'Tuff Docs' },
    },
  })

  assert.deepEqual(result, { externalAction: true, status: 'started' })
  assert.deepEqual(opened, ['https://tuff.tagzxia.com/docs'])
})

test('onItemAction blocks URL copy when clipboard.write permission is denied', async () => {
  const writes = []
  const pluginModule = loadFreshPluginModule({
    clipboard: {
      writeText(value) {
        writes.push(value)
      },
    },
    permission: {
      async check() {
        return false
      },
      async request() {
        return false
      },
    },
  })

  const result = await pluginModule.onItemAction({
    meta: {
      defaultAction: 'browser-data',
      actionId: 'copy-url',
      payload: { url: 'https://tuff.tagzxia.com/docs' },
    },
  })

  assert.deepEqual(result, {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'permission-denied',
    message: '缺少 clipboard.write 权限',
  })
  assert.deepEqual(writes, [])
})

test('onItemAction blocks URL copy when permission sdk is unavailable', async () => {
  const writes = []
  const pluginModule = loadFreshPluginModule({
    clipboard: {
      writeText(value) {
        writes.push(value)
      },
    },
    permission: {},
  })

  const result = await pluginModule.onItemAction({
    meta: {
      defaultAction: 'browser-data',
      actionId: 'copy-url',
      payload: { url: 'https://tuff.tagzxia.com/docs' },
    },
  })

  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'permission-sdk-unavailable')
  assert.deepEqual(writes, [])
})

test('onItemAction blocks URL copy when permission request fails', async () => {
  const writes = []
  const pluginModule = loadFreshPluginModule({
    clipboard: {
      writeText(value) {
        writes.push(value)
      },
    },
    permission: {
      async check() {
        return false
      },
      async request() {
        throw new Error('permission transport failed')
      },
    },
  })

  const result = await pluginModule.onItemAction({
    meta: {
      defaultAction: 'browser-data',
      actionId: 'copy-url',
      payload: { url: 'https://tuff.tagzxia.com/docs' },
    },
  })

  assert.equal(result.status, 'blocked')
  assert.equal(result.reason, 'permission-request-failed')
  assert.deepEqual(writes, [])
})

test('onItemAction copies URL after clipboard.write permission is granted', async () => {
  const writes = []
  const pluginModule = loadFreshPluginModule({
    clipboard: {
      writeText(value) {
        writes.push(value)
      },
    },
    permission: {
      async check(permissionId) {
        return permissionId === 'clipboard.write'
      },
      async request() {
        return true
      },
    },
  })

  const result = await pluginModule.onItemAction({
    meta: {
      defaultAction: 'browser-data',
      actionId: 'copy-url',
      payload: { url: 'https://tuff.tagzxia.com/docs' },
    },
  })

  assert.deepEqual(result, { externalAction: true, status: 'started' })
  assert.deepEqual(writes, ['https://tuff.tagzxia.com/docs'])
})

test('buildResultItems uses platform-aware source availability in empty state', () => {
  const items = buildResultItems('browser-data', 'browser', {
    items: [],
    diagnostics: buildBrowserSourceDiagnostics('linux', [
      { id: 'chrome', name: 'Chrome', root: '/home/user/.config/google-chrome' },
      { id: 'edge', name: 'Edge', root: '/home/user/.config/microsoft-edge' },
      { id: 'brave', name: 'Brave', root: '/home/user/.config/BraveSoftware/Brave-Browser' },
    ]),
  })

  assert.equal(items[0].title, '未发现浏览器书签')
  assert.match(items[0].subtitle, /Chrome \/ Edge \/ Brave/)
  assert.doesNotMatch(items[0].subtitle, /Arc/)
  assert.match(items.at(-1).subtitle, /Arc 不支持/)
})

test('getAvailableBrowserNames follows platform definitions', () => {
  assert.deepEqual(getAvailableBrowserNames('linux'), ['Chrome', 'Edge', 'Brave'])
})
