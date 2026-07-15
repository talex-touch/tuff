const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')
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
  searchHistory,
  readChromiumHistory,
  scanBrowserHistory,
} = require('./index.js').__test

function loadFreshPluginModule(globals = {}) {
  Object.assign(globalThis, globals)
  delete require.cache[require.resolve('./index.js')]
  const pluginModule = require('./index.js')
  delete require.cache[require.resolve('./index.js')]
  return pluginModule
}

const CHROMIUM_EPOCH_MICROS = 11644473600000000n
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

function toChromiumFixtureTimestamp(unixMs) {
  return CHROMIUM_EPOCH_MICROS + BigInt(unixMs) * 1000n
}

function createHistoryFixture(t) {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'tuff-browser-history-fixture-'),
  )
  const databases = []

  t.after(() => {
    for (const database of databases) {
      try {
        database.close()
      }
      catch {
        // Fixture cleanup must not hide assertion failures.
      }
    }
    fs.rmSync(root, { recursive: true, force: true })
  })

  return {
    root,
    addProfile(profile, rows) {
      const profileDirectory = path.join(root, profile)
      const historyPath = path.join(profileDirectory, 'History')
      fs.mkdirSync(profileDirectory, { recursive: true })

      const database = new DatabaseSync(historyPath)
      databases.push(database)
      database.exec('PRAGMA journal_mode = WAL')
      database.exec(`
        CREATE TABLE urls (
          url TEXT NOT NULL,
          title TEXT NOT NULL,
          last_visit_time INTEGER NOT NULL,
          visit_count INTEGER NOT NULL
        )
      `)
      const insert = database.prepare(
        'INSERT INTO urls (url, title, last_visit_time, visit_count) VALUES (?, ?, ?, ?)',
      )
      for (const row of rows) {
        insert.run(
          row.url,
          row.title,
          toChromiumFixtureTimestamp(row.lastVisitedAt),
          row.visitCount || 1,
        )
      }

      return {
        path: historyPath,
        browserId: 'chrome',
        browserName: 'Chrome',
        profile,
      }
    },
    addCorruptProfile(profile) {
      const profileDirectory = path.join(root, profile)
      const historyPath = path.join(profileDirectory, 'History')
      fs.mkdirSync(profileDirectory, { recursive: true })
      fs.writeFileSync(historyPath, 'not a sqlite database')
      return {
        path: historyPath,
        browserId: 'chrome',
        browserName: 'Chrome',
        profile,
      }
    },
  }
}

function createTrackedHistoryFs(temporaryDirectories) {
  const fsImpl = Object.create(fs)
  fsImpl.mkdtempSync = (prefix) => {
    const directory = fs.mkdtempSync(prefix)
    temporaryDirectories.push(directory)
    return directory
  }
  return fsImpl
}

function captureBrowserFileAccess(t) {
  const calls = []
  const methods = [
    'existsSync',
    'readdirSync',
    'readFileSync',
    'copyFileSync',
    'mkdtempSync',
  ]
  const originals = Object.fromEntries(
    methods.map(method => [method, fs[method]]),
  )

  for (const method of methods) {
    fs[method] = (...args) => {
      calls.push({ method, args })
      throw new Error(
        `unexpected local browser file access through fs.${method}`,
      )
    }
  }
  t.after(() => {
    for (const method of methods) fs[method] = originals[method]
  })

  return calls
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
  assert.deepEqual(parseQuery('browser-data docs'), {
    browser: '',
    keyword: 'docs',
  })
  assert.deepEqual(parseQuery('chrome: tuff'), {
    browser: 'chrome',
    keyword: 'tuff',
  })
  assert.deepEqual(parseQuery('edge bookmarks'), {
    browser: 'edge',
    keyword: 'bookmarks',
  })
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
  fs.writeFileSync(
    path.join(profile, 'Bookmarks'),
    JSON.stringify(createChromiumBookmarksPayload()),
  )

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
  fs.writeFileSync(
    path.join(profile, 'Bookmarks'),
    JSON.stringify(createChromiumBookmarksPayload()),
  )

  const scan = scanBrowserBookmarks({
    definitions: [{ id: 'chrome', name: 'Chrome', root }],
    browserFilter: 'chrome',
  })

  assert.equal(scan.items.length, 2)
  assert.equal(scan.diagnostics[0].status, 'available')
  assert.equal(scan.diagnostics[0].profileCount, 1)

  fs.rmSync(root, { recursive: true, force: true })
})

test('buildBrowserSourceDiagnostics marks Linux Arc as unsupported without exposing local roots', () => {
  const roots = [
    '/home/user/.config/google-chrome',
    '/home/user/.config/microsoft-edge',
    '/home/user/.config/BraveSoftware/Brave-Browser',
  ]
  const diagnostics = buildBrowserSourceDiagnostics('linux', [
    { id: 'chrome', name: 'Chrome', root: roots[0] },
    { id: 'edge', name: 'Edge', root: roots[1] },
    { id: 'brave', name: 'Brave', root: roots[2] },
  ])

  const arc = diagnostics.find(item => item.browserId === 'arc')
  assert.equal(arc.status, 'unsupported')
  assert.match(arc.reason, /unsupported on linux/)
  assert.equal(
    diagnostics.every(item => !Object.hasOwn(item, 'root')),
    true,
  )
  const serializedDiagnostics = JSON.stringify(diagnostics)
  for (const root of roots)
    assert.equal(serializedDiagnostics.includes(root), false)
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
  const serializedDiagnostics = JSON.stringify(scan.diagnostics)
  assert.equal(Object.hasOwn(scan.diagnostics[0], 'failedProfile'), false)
  assert.equal(Object.hasOwn(scan.diagnostics[0], 'profile'), false)
  assert.equal(Object.hasOwn(scan.diagnostics[0], 'root'), false)
  assert.equal(serializedDiagnostics.includes(root), false)
  assert.equal(serializedDiagnostics.includes('Default'), false)

  fs.rmSync(root, { recursive: true, force: true })
})

test('searchBookmarks ranks title prefix before URL matches', () => {
  const bookmarks = [
    {
      title: 'Other',
      url: 'https://example.com/tuff',
      folder: '',
      browserName: 'Chrome',
      profile: 'Default',
    },
    {
      title: 'Tuff Docs',
      url: 'https://docs.example.com',
      folder: '',
      browserName: 'Chrome',
      profile: 'Default',
    },
  ]

  const result = searchBookmarks(bookmarks, 'tuff')

  assert.equal(result[0].title, 'Tuff Docs')
  assert.equal(result[1].title, 'Other')
})

test('includes exact-now and 30-day boundaries while excluding future Chromium history', (t) => {
  const now = 1_713_000_000_000
  const fixture = createHistoryFixture(t)
  const history = fixture.addProfile('Default', [
    {
      url: 'https://now.example/',
      title: 'Exact now visit',
      lastVisitedAt: now,
      visitCount: 7,
    },
    {
      url: 'https://boundary.example/',
      title: 'Window boundary visit',
      lastVisitedAt: now - THIRTY_DAYS_MS,
      visitCount: 2,
    },
    {
      url: 'https://future.example/',
      title: 'Future visit',
      lastVisitedAt: now + 1,
      visitCount: 3,
    },
    {
      url: 'https://expired.example/',
      title: 'Expired visit',
      lastVisitedAt: now - THIRTY_DAYS_MS - 1,
      visitCount: 9,
    },
  ])

  const result = readChromiumHistory(history, {
    DatabaseSync,
    now,
    tempRoot: fixture.root,
  })

  assert.equal(result.reason, '')
  assert.deepEqual(
    result.items.map(item => item.title),
    ['Exact now visit', 'Window boundary visit'],
  )
  assert.equal(result.items[0].lastVisitedAt, now)
  assert.equal(result.items[0].visitCount, 7)
})

test('keeps fifty history rows per profile and globally ranks recent history for selection', (t) => {
  const now = 1_713_000_000_000
  const fixture = createHistoryFixture(t)
  const definitions = [{ id: 'chrome', name: 'Chrome', root: fixture.root }]

  fixture.addProfile(
    'Default',
    Array.from({ length: 51 }, (_, index) => ({
      url: `https://default-${index}.example/`,
      title: `Default visit ${index}`,
      lastVisitedAt: now - 100 - index,
      visitCount: index + 1,
    })),
  )
  fixture.addProfile(
    'Profile 1',
    Array.from({ length: 51 }, (_, index) => ({
      url: `https://profile-1-${index}.example/`,
      title: `Profile 1 visit ${index}`,
      lastVisitedAt: now - index,
      visitCount: index + 1,
    })),
  )

  const result = scanBrowserHistory({
    DatabaseSync,
    definitions,
    browserFilter: 'chrome',
    now,
    tempRoot: fixture.root,
  })

  assert.equal(result.items.length, 100)
  assert.equal(
    result.items.filter(item => item.profile === 'Default').length,
    50,
  )
  assert.equal(
    result.items.filter(item => item.profile === 'Profile 1').length,
    50,
  )

  const selectedItems = searchHistory(result.items, '', 50)
  assert.equal(selectedItems.length, 50)
  assert.equal(
    selectedItems.every(item => item.profile === 'Profile 1'),
    true,
  )
  assert.deepEqual(
    selectedItems.map(item => item.lastVisitedAt),
    Array.from({ length: 50 }, (_, index) => now - index),
  )
  assert.equal(
    selectedItems.some(item => item.title === 'Profile 1 visit 50'),
    false,
  )
})

test('orders equal-score history matches by recency before limiting displayed results', () => {
  const now = 1_713_000_000_000
  const historyItems = Array.from({ length: 51 }, (_, offset) => {
    const index = 50 - offset
    return {
      browserId: 'chrome',
      browserName: 'Chrome',
      profile: 'Default',
      title: 'Docs history',
      url: `https://history.example/${index}`,
      lastVisitedAt: now - index,
      visitCount: 1,
    }
  })
  const items = buildResultItems('browser-data', 'browser docs', {
    items: [],
    diagnostics: [],
    historyItems,
    historyDiagnostics: [
      {
        browserId: 'chrome',
        browserName: 'Chrome',
        status: 'available',
        profileCount: 1,
      },
    ],
  })
  const historyResults = items.filter(
    item =>
      item.meta?.actionId === 'open-url'
      && item.meta?.sourceType === 'browser-history',
  )

  assert.equal(historyResults.length, 20)
  assert.deepEqual(
    historyResults.map(item => item.meta.payload.url),
    Array.from(
      { length: 20 },
      (_, index) => `https://history.example/${index}`,
    ),
  )
})
test('removes unique temporary database, WAL, and SHM copies after history success and failure', (t) => {
  const now = 1_713_000_000_000
  const fixture = createHistoryFixture(t)
  const validHistory = fixture.addProfile('Default', [
    {
      url: 'https://wal.example/',
      title: 'WAL-backed history',
      lastVisitedAt: now,
      visitCount: 1,
    },
  ])
  const temporaryDirectories = []
  const temporaryCopyLayouts = []
  const fsImpl = createTrackedHistoryFs(temporaryDirectories)

  assert.equal(fs.existsSync(`${validHistory.path}-wal`), true)
  assert.equal(fs.existsSync(`${validHistory.path}-shm`), true)

  class InspectingDatabaseSync {
    constructor(databasePath, options) {
      temporaryCopyLayouts.push(
        ['History', 'History-wal', 'History-shm'].map(file =>
          fs.existsSync(path.join(path.dirname(databasePath), file)),
        ),
      )
      this.database = new DatabaseSync(databasePath, options)
    }

    prepare(...args) {
      return this.database.prepare(...args)
    }

    close() {
      return this.database.close()
    }
  }

  class FailingDatabaseSync {
    constructor(databasePath, options) {
      temporaryCopyLayouts.push(
        ['History', 'History-wal', 'History-shm'].map(file =>
          fs.existsSync(path.join(path.dirname(databasePath), file)),
        ),
      )
      const database = new DatabaseSync(databasePath, options)
      database.close()
      const error = new Error('database is locked')
      error.code = 'SQLITE_BUSY'
      throw error
    }
  }

  const successfulRead = readChromiumHistory(validHistory, {
    DatabaseSync: InspectingDatabaseSync,
    fs: fsImpl,
    now,
    tempRoot: fixture.root,
  })
  const failedRead = readChromiumHistory(validHistory, {
    DatabaseSync: FailingDatabaseSync,
    fs: fsImpl,
    now,
    tempRoot: fixture.root,
  })

  assert.equal(successfulRead.reason, '')
  assert.equal(successfulRead.items[0].title, 'WAL-backed history')
  assert.deepEqual(temporaryCopyLayouts, [
    [true, true, true],
    [true, true, true],
  ])
  assert.equal(failedRead.reason, 'History database is locked')
  assert.equal(temporaryDirectories.length, 2)
  assert.equal(new Set(temporaryDirectories).size, 2)
  assert.equal(
    temporaryDirectories.every(directory => !fs.existsSync(directory)),
    true,
  )
  assert.deepEqual(
    fs
      .readdirSync(fixture.root)
      .filter(name => name.startsWith('tuff-browser-history-')),
    [],
  )
})

test('fails closed with a sanitized result when temporary history cleanup cannot complete', (t) => {
  const now = 1_713_000_000_000
  const fixture = createHistoryFixture(t)
  const history = fixture.addProfile('Default', [
    {
      url: 'https://cleanup.example/',
      title: 'Cleanup-sensitive history',
      lastVisitedAt: now,
      visitCount: 1,
    },
  ])
  const temporaryDirectories = []
  const cleanupAttempts = []
  const fsImpl = createTrackedHistoryFs(temporaryDirectories)
  fsImpl.rmSync = (directory, options) => {
    cleanupAttempts.push({ directory, options })
    const error = new Error(`temporary database remains busy at ${directory}`)
    error.code = 'EBUSY'
    throw error
  }

  const result = readChromiumHistory(history, {
    DatabaseSync,
    fs: fsImpl,
    now,
    tempRoot: fixture.root,
  })

  assert.deepEqual(result.items, [])
  assert.match(
    result.reason,
    /(?:temporary.*(?:cleanup.*failed|could not be removed)|history-temp-cleanup-failed)/i,
  )
  assert.equal(result.reason.includes(fixture.root), false)
  assert.equal(JSON.stringify(result).includes(fixture.root), false)
  assert.equal(cleanupAttempts.length, 1)
  assert.equal(cleanupAttempts[0].directory, temporaryDirectories[0])
  assert.equal(cleanupAttempts[0].options.recursive, true)
  assert.equal(cleanupAttempts[0].options.force, true)
  assert.equal(Number.isInteger(cleanupAttempts[0].options.maxRetries), true)
  assert.equal(cleanupAttempts[0].options.maxRetries > 0, true)
  assert.equal(Number.isInteger(cleanupAttempts[0].options.retryDelay), true)
  assert.equal(cleanupAttempts[0].options.retryDelay > 0, true)
})
test('keeps bookmark results visible with explicit corrupt and unavailable history diagnostics', (t) => {
  const fixture = createHistoryFixture(t)
  fixture.addCorruptProfile('Default')
  const definitions = [{ id: 'chrome', name: 'Chrome', root: fixture.root }]
  const corrupt = scanBrowserHistory({
    DatabaseSync,
    definitions,
    browserFilter: 'chrome',
    tempRoot: fixture.root,
  })
  const unavailable = scanBrowserHistory({
    DatabaseSync: {},
    definitions,
    browserFilter: 'chrome',
    tempRoot: fixture.root,
  })

  for (const [name, history, reason] of [
    ['corrupt', corrupt, 'History database is corrupt or unsupported'],
    [
      'unavailable',
      unavailable,
      'History database support is unavailable in this runtime',
    ],
  ]) {
    assert.equal(history.items.length, 0, name)
    assert.equal(history.diagnostics[0].status, 'read-failed', name)
    assert.equal(history.diagnostics[0].reason, reason, name)
    const serializedHistoryDiagnostics = JSON.stringify(history.diagnostics)
    assert.equal(
      Object.hasOwn(history.diagnostics[0], 'failedProfile'),
      false,
      name,
    )
    assert.equal(Object.hasOwn(history.diagnostics[0], 'profile'), false, name)
    assert.equal(Object.hasOwn(history.diagnostics[0], 'root'), false, name)
    assert.equal(
      serializedHistoryDiagnostics.includes(fixture.root),
      false,
      name,
    )
    assert.equal(serializedHistoryDiagnostics.includes('Default'), false, name)

    const items = buildResultItems('browser-data', 'browser docs', {
      items: [
        {
          browserId: 'chrome',
          browserName: 'Chrome',
          profile: 'Default',
          folder: 'Bookmarks Bar',
          title: 'Docs bookmark',
          url: 'https://docs.example/',
        },
      ],
      diagnostics: [
        {
          browserId: 'chrome',
          browserName: 'Chrome',
          status: 'available',
          profileCount: 1,
        },
      ],
      historyItems: history.items,
      historyDiagnostics: history.diagnostics,
    })

    assert.equal(
      items.some(item => item.meta?.sourceType === 'browser-bookmark'),
      true,
      name,
    )
    assert.match(items.at(-1).subtitle, /Chrome历史读取失败/, name)
  }
})

test('renders available and read-failed browser history facts together in diagnostics', (t) => {
  const now = 1_713_000_000_000
  const failedFixture = createHistoryFixture(t)
  const availableFixture = createHistoryFixture(t)
  failedFixture.addCorruptProfile('Default')
  availableFixture.addProfile('Default', [
    {
      url: 'https://docs.example/',
      title: 'Docs history',
      lastVisitedAt: now,
      visitCount: 1,
    },
  ])

  const scan = scanBrowserHistory({
    DatabaseSync,
    definitions: [
      { id: 'chrome', name: 'Chrome', root: failedFixture.root },
      { id: 'edge', name: 'Edge', root: availableFixture.root },
    ],
    now,
    tempRoot: failedFixture.root,
  })
  const items = buildResultItems('browser-data', 'browser docs', {
    items: [],
    diagnostics: [],
    historyItems: scan.items,
    historyDiagnostics: scan.diagnostics,
  })
  const diagnosticItem = items.find(item => item.title === '历史扫描状态')

  assert.equal(
    scan.diagnostics.find(item => item.browserId === 'chrome').status,
    'read-failed',
  )
  assert.equal(
    scan.diagnostics.find(item => item.browserId === 'edge').status,
    'available',
  )
  assert.match(diagnosticItem.subtitle, /Chrome历史读取失败/)
  assert.match(
    diagnosticItem.subtitle,
    /(?:Edge.*(?:可用|已读取|已扫描)|(?:可用|已读取|已扫描).*Edge)/,
  )
})
test('keeps readable Chrome history when another profile is corrupt and reports partial diagnostics', (t) => {
  const now = 1_713_000_000_000
  const fixture = createHistoryFixture(t)
  fixture.addProfile('Default', [
    {
      url: 'https://readable.example/',
      title: 'Readable history',
      lastVisitedAt: now,
      visitCount: 1,
    },
  ])
  fixture.addCorruptProfile('Profile 1')

  const scan = scanBrowserHistory({
    DatabaseSync,
    definitions: [{ id: 'chrome', name: 'Chrome', root: fixture.root }],
    browserFilter: 'chrome',
    now,
    tempRoot: fixture.root,
  })
  const diagnostic = scan.diagnostics[0]
  const items = buildResultItems('browser-data', 'browser readable', {
    items: [],
    diagnostics: [],
    historyItems: scan.items,
    historyDiagnostics: scan.diagnostics,
  })
  const diagnosticItem = items.find(item => item.title === '历史扫描状态')

  assert.deepEqual(
    scan.items.map(item => item.title),
    ['Readable history'],
  )
  assert.equal(diagnostic.status, 'partial')
  assert.equal(diagnostic.readableProfileCount, 1)
  assert.equal(diagnostic.failedProfileCount, 1)
  assert.match(diagnosticItem.subtitle, /Chrome已读取/)
  assert.match(diagnosticItem.subtitle, /Chrome历史部分读取失败/)
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
    diagnostics: [
      { browserName: 'Chrome', status: 'available', profileCount: 1 },
    ],
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
      urlHost: 'tuff.tagzxia.com',
    },
  })
  assert.doesNotMatch(items[0].subtitle, /Default|Bookmarks Bar/)
  assert.equal(Object.hasOwn(items[0].meta.capability.audit, 'profile'), false)
  assert.equal(Object.hasOwn(items[0].meta.capability.audit, 'folder'), false)
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
  assert.equal(
    items.find(item => item.title === '书签扫描状态')?.meta.indexedSourceId,
    'browser-bookmarks',
  )
})

test('keeps browser bookmark and history search source metadata distinct', () => {
  const items = buildResultItems('browser-data', 'browser docs', {
    items: [
      {
        browserId: 'chrome',
        browserName: 'Chrome',
        profile: 'Default',
        folder: 'Bookmarks Bar',
        title: 'Docs bookmark',
        url: 'https://bookmarks.example/docs',
      },
    ],
    diagnostics: [
      {
        browserId: 'chrome',
        browserName: 'Chrome',
        status: 'available',
        profileCount: 1,
      },
    ],
    historyItems: [
      {
        browserId: 'chrome',
        browserName: 'Chrome',
        profile: 'Default',
        title: 'Docs history',
        url: 'https://history.example/docs',
        lastVisitedAt: 1_713_000_000_000,
        visitCount: 1,
      },
    ],
    historyDiagnostics: [
      {
        browserId: 'chrome',
        browserName: 'Chrome',
        status: 'available',
        profileCount: 1,
      },
    ],
  })
  const bookmark = items.find(
    item => item.meta?.sourceType === 'browser-bookmark',
  )
  const history = items.find(
    item => item.meta?.sourceType === 'browser-history',
  )
  for (const item of [bookmark, history]) {
    assert.doesNotMatch(item.subtitle, /Default|Bookmarks Bar/)
    assert.equal(Object.hasOwn(item.meta.capability.audit, 'profile'), false)
    assert.equal(Object.hasOwn(item.meta.capability.audit, 'folder'), false)
  }

  assert.deepEqual(
    Object.fromEntries(
      ['searchProviderId', 'indexedSourceId', 'sourceType', 'sourceKind'].map(
        key => [key, bookmark.meta[key]],
      ),
    ),
    {
      searchProviderId: 'touch-browser-data.browser-bookmarks',
      indexedSourceId: 'browser-bookmarks',
      sourceType: 'browser-bookmark',
      sourceKind: 'browser-bookmark',
    },
  )
  assert.deepEqual(
    Object.fromEntries(
      ['searchProviderId', 'indexedSourceId', 'sourceType', 'sourceKind'].map(
        key => [key, history.meta[key]],
      ),
    ),
    {
      searchProviderId: 'touch-browser-data.browser-history',
      indexedSourceId: 'browser-history',
      sourceType: 'browser-history',
      sourceKind: 'browser-history',
    },
  )
})

test('manifest declares external-opening permission and keeps history ephemeral and consent-gated', () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'),
  )

  assert.ok(manifest.permissions.optional.includes('network.internet'))
  assert.match(
    manifest.permissionReasons['network.internet'],
    /默认浏览器打开/,
  )
  const historySource = manifest.indexedSources.find(
    source => source.id === 'browser-history',
  )
  const historyProvider = manifest.searchProviders.find(
    provider => provider.id === 'touch-browser-data.browser-history',
  )
  assert.equal(historySource.storage, 'ephemeral')
  assert.equal(historySource.admission.requiresUserConsent, true)
  assert.equal(historyProvider.requiresUserConsent, true)
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
  const items = buildResultItems(
    'browser-data',
    'browser tuff',
    {
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
      diagnostics: [
        { browserName: 'Chrome', status: 'available', profileCount: 1 },
      ],
    },
    capabilityState,
  )

  assert.equal(capabilityState.status, 'permission-missing')
  assert.equal(requested, false)
  assert.match(items[0].subtitle, /缺少 network\.internet 权限/)
  assert.equal(items[0].meta.capability.status, 'permission-missing')
  assert.equal(
    items[0].meta.capability.reason,
    'network-internet-permission-required',
  )
  assert.equal(items[0].meta.capability.audit.browserId, 'chrome')
  assert.equal(items[0].meta.capability.audit.urlHost, 'tuff.tagzxia.com')
})

test('network diagnostics fail closed when permission sdk is unavailable', async () => {
  const pluginModule = loadFreshPluginModule({
    permission: {},
  })

  const capabilityState
    = await pluginModule.__test.resolveNetworkOpenCapabilityState()

  assert.equal(capabilityState.status, 'permission-missing')
  assert.equal(capabilityState.reason, 'permission-sdk-unavailable')
})

test('onFeatureTriggered reaches the fs permission gate after an enabled provider preflight', async () => {
  const pushed = []
  const pluginModule = loadFreshPluginModule({
    permission: {},
    plugin: {
      feature: {
        isSearchProviderEnabled(providerId) {
          return providerId === 'touch-browser-data.browser-bookmarks'
        },
        clearItems() {},
        pushItems(items) {
          pushed.push(items)
        },
      },
    },
  })

  const result = await pluginModule.onFeatureTriggered(
    'browser-data',
    'browser tuff',
  )

  assert.equal(result, true)
  assert.equal(pushed.at(-1)?.[0]?.id, 'browser-data-permission')
  assert.equal(pushed.at(-1)?.[0]?.title, '缺少文件读取权限')
})

test('onFeatureTriggered stops before permissions or local scans when no browser provider is enabled', async (t) => {
  const permissionCalls = []
  const pushed = []
  const pluginModule = loadFreshPluginModule({
    permission: {
      async check(permissionId) {
        permissionCalls.push(['check', permissionId])
        return true
      },
      async request(permissionId) {
        permissionCalls.push(['request', permissionId])
        return true
      },
    },
    plugin: {
      feature: {
        isSearchProviderEnabled() {
          return false
        },
        clearItems() {},
        pushItems(items) {
          pushed.push(items)
        },
      },
    },
  })
  const localScanCalls = captureBrowserFileAccess(t)

  const result = await pluginModule.onFeatureTriggered(
    'browser-data',
    'browser tuff',
  )

  assert.equal(result, true)
  assert.deepEqual(permissionCalls, [])
  assert.deepEqual(localScanCalls, [])
  assert.equal(pushed.length, 0)
})

test('onFeatureTriggered fails closed before permissions or local scans when provider state is unavailable', async (t) => {
  const permissionCalls = []
  const pushed = []
  const pluginModule = loadFreshPluginModule({
    permission: {
      async check(permissionId) {
        permissionCalls.push(['check', permissionId])
        return true
      },
      async request(permissionId) {
        permissionCalls.push(['request', permissionId])
        return true
      },
    },
    plugin: {
      feature: {
        clearItems() {},
        pushItems(items) {
          pushed.push(items)
        },
      },
    },
  })
  const localScanCalls = captureBrowserFileAccess(t)

  const result = await pluginModule.onFeatureTriggered(
    'browser-data',
    'browser tuff',
  )

  assert.equal(result, true)
  assert.deepEqual(permissionCalls, [])
  assert.deepEqual(localScanCalls, [])
  assert.equal(pushed.length, 0)
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

test('scopes maintenance items and current-result clear to their declared source', async (t) => {
  const maintenanceItems = buildResultItems('browser-data', 'browser docs', {
    items: [],
    diagnostics: [],
    historyItems: [],
    historyDiagnostics: [],
  }).filter(item =>
    ['rebuild-browser-data', 'clear-browser-data-results'].includes(
      item.meta?.actionId,
    ),
  )
  const findMaintenanceItem = (actionId, sourceId) =>
    maintenanceItems.find(
      item =>
        item.meta.actionId === actionId
        && item.meta.payload.sourceIds[0] === sourceId,
    )

  assert.equal(maintenanceItems.length, 4)
  for (const [actionId, sourceId, searchProviderId] of [
    [
      'rebuild-browser-data',
      'browser-bookmarks',
      'touch-browser-data.browser-bookmarks',
    ],
    [
      'rebuild-browser-data',
      'browser-history',
      'touch-browser-data.browser-history',
    ],
    [
      'clear-browser-data-results',
      'browser-bookmarks',
      'touch-browser-data.browser-bookmarks',
    ],
    [
      'clear-browser-data-results',
      'browser-history',
      'touch-browser-data.browser-history',
    ],
  ]) {
    const item = findMaintenanceItem(actionId, sourceId)
    assert.ok(item, `${actionId} must exist for ${sourceId}`)
    assert.deepEqual(item.meta.payload.sourceIds, [sourceId])
    assert.equal(item.meta.searchProviderId, searchProviderId)
    assert.equal(item.meta.indexedSourceId, sourceId)
  }

  const writes = []
  const removedItemIds = []
  let broadClearCalls = 0
  const pluginModule = loadFreshPluginModule({
    permission: {
      async check() {
        return false
      },
      async request() {
        return false
      },
    },
    plugin: {
      feature: {
        isSearchProviderEnabled() {
          return true
        },
        getItems() {
          return [
            {
              id: 'bookmark-result',
              meta: { indexedSourceId: 'browser-bookmarks' },
            },
            {
              id: 'bookmark-empty',
              meta: { indexedSourceId: 'browser-bookmarks' },
            },
            {
              id: 'bookmark-diagnostic',
              meta: { indexedSourceId: 'browser-bookmarks' },
            },
            {
              id: 'history-result',
              meta: { indexedSourceId: 'browser-history' },
            },
            {
              id: 'history-empty',
              meta: { indexedSourceId: 'browser-history' },
            },
            {
              id: 'history-diagnostic',
              meta: { indexedSourceId: 'browser-history' },
            },
            {
              id: 'unrelated-result',
              meta: { indexedSourceId: 'unrelated-source' },
            },
          ]
        },
        removeItem(itemId) {
          removedItemIds.push(itemId)
        },
        clearItems() {
          broadClearCalls += 1
        },
        pushItems() {},
      },
      storage: {
        async setFile(file) {
          writes.push(file)
          throw new Error(
            'browser-data maintenance must not persist browser data',
          )
        },
      },
    },
  })
  const refreshItem = findMaintenanceItem(
    'rebuild-browser-data',
    'browser-bookmarks',
  )
  const clearItem = findMaintenanceItem(
    'clear-browser-data-results',
    'browser-history',
  )

  const refreshResult = await pluginModule.onItemAction(refreshItem)
  const clearResult = await pluginModule.onItemAction(clearItem)

  assert.deepEqual(refreshResult, {
    externalAction: true,
    success: false,
    status: 'blocked',
    reason: 'permission-denied',
    message: '缺少 fs.read 权限',
  })
  assert.deepEqual(clearResult, {
    externalAction: true,
    status: 'completed',
    sourceIds: ['browser-history'],
    operation: 'clear-results',
  })
  assert.deepEqual(removedItemIds, [
    'history-result',
    'history-empty',
    'history-diagnostic',
  ])
  assert.equal(broadClearCalls, 0)
  assert.deepEqual(writes, [])

  const disabledHistoryPermissionChecks = []
  const disabledHistoryPushes = []
  const disabledHistoryPlugin = loadFreshPluginModule({
    permission: {
      async check(permissionId) {
        disabledHistoryPermissionChecks.push(permissionId)
        return true
      },
      async request(permissionId) {
        disabledHistoryPermissionChecks.push(permissionId)
        return true
      },
    },
    plugin: {
      feature: {
        isSearchProviderEnabled(providerId) {
          return providerId === 'touch-browser-data.browser-bookmarks'
        },
        clearItems() {},
        pushItems(items) {
          disabledHistoryPushes.push(items)
        },
      },
    },
  })
  const localScanCalls = captureBrowserFileAccess(t)
  const disabledHistoryRefreshResult = await disabledHistoryPlugin.onItemAction(
    findMaintenanceItem('rebuild-browser-data', 'browser-history'),
  )

  assert.equal(disabledHistoryRefreshResult.externalAction, true)
  assert.deepEqual(disabledHistoryPermissionChecks, [])
  assert.deepEqual(localScanCalls, [])
  assert.equal(disabledHistoryPushes.length, 0)
})

test('buildResultItems keeps empty and scan-status items source-scoped', () => {
  const diagnostics = buildBrowserSourceDiagnostics('linux', [
    { id: 'chrome', name: 'Chrome', root: '/home/user/.config/google-chrome' },
    { id: 'edge', name: 'Edge', root: '/home/user/.config/microsoft-edge' },
    {
      id: 'brave',
      name: 'Brave',
      root: '/home/user/.config/BraveSoftware/Brave-Browser',
    },
  ])
  const items = buildResultItems('browser-data', 'browser', {
    items: [],
    diagnostics,
    historyItems: [],
    historyDiagnostics: diagnostics,
  })

  for (const [title, sourceId] of [
    ['未发现浏览器书签', 'browser-bookmarks'],
    ['书签扫描状态', 'browser-bookmarks'],
    ['未发现浏览器历史', 'browser-history'],
    ['历史扫描状态', 'browser-history'],
  ]) {
    const item = items.find(candidate => candidate.title === title)
    assert.ok(item, `${title} must be rendered`)
    assert.equal(item.meta.indexedSourceId, sourceId)
    assert.equal(typeof item.meta.indexedSourceId, 'string')
  }

  const bookmarkEmpty = items.find(item => item.title === '未发现浏览器书签')
  const bookmarkDiagnostic = items.find(
    item => item.title === '书签扫描状态',
  )
  assert.match(bookmarkEmpty.subtitle, /Chrome \/ Edge \/ Brave/)
  assert.doesNotMatch(bookmarkEmpty.subtitle, /Arc/)
  assert.match(bookmarkDiagnostic.subtitle, /Arc.*不支持/)
})

test('getAvailableBrowserNames follows platform definitions', () => {
  assert.deepEqual(getAvailableBrowserNames('linux'), [
    'Chrome',
    'Edge',
    'Brave',
  ])
})
