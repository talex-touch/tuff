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
  buildResultItems,
  discoverBookmarkFiles,
  parseChromiumBookmarks,
  parseQuery,
  scanBrowserBookmarks,
  searchBookmarks,
} = require('./index.js').__test

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
  assert.equal(items[0].actions[0].payload, 'https://tuff.tagzxia.com/docs')
  assert.equal(items.at(-1).title, '扫描状态')
})
