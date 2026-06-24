const assert = require('node:assert/strict')
const test = require('node:test')

globalThis.plugin = { storage: {} }
globalThis.clipboard = {}
globalThis.logger = {}
globalThis.permission = {}
globalThis.TuffItemBuilder = class {
  constructor(id) {
    this.item = { id, meta: {} }
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

  build() {
    return this.item
  }
}

const {
  applyPlaceholders,
  buildSnippetIndex,
  containsSensitiveContent,
  createSnippetPack,
  createSnippetFromContent,
  importSnippetPack,
  inferSnippetType,
  installCloudSnippetPack,
  listCloudSnippetPacks,
  matchSnippet,
  normalizeSnippet,
  normalizeSnippetPack,
  parseSnippets,
  publishSnippetPack,
  readClipboardText,
  resolveAccountAuthToken,
  rankSnippets,
  serializeSnippets,
  writeClipboardText,
} = require('./index.js').__test

test('applyPlaceholders resolves date time uuid and clipboard placeholders', () => {
  let uuidCalls = 0
  const resolved = applyPlaceholders('{{date}} {{time}} {{uuid}} {{uuid}} {{clipboard}}', {
    now: new Date(2026, 4, 17, 8, 9, 10),
    clipboardText: 'copied',
    uuidFactory: () => {
      uuidCalls += 1
      return '123e4567-e89b-12d3-a456-426614174000'
    },
  })

  assert.equal(resolved, '2026-05-17 08:09:10 123e4567-e89b-12d3-a456-426614174000 123e4567-e89b-12d3-a456-426614174000 copied')
  assert.equal(uuidCalls, 1)
})

test('readClipboardText does not read when clipboard.read permission is denied', async () => {
  const reads = []
  const requests = []
  const originalReadText = globalThis.clipboard.readText
  const originalCheck = globalThis.permission.check
  const originalRequest = globalThis.permission.request

  globalThis.clipboard.readText = async () => {
    reads.push('read')
    return 'secret'
  }
  globalThis.permission.check = async () => false
  globalThis.permission.request = async (permissionId, reason) => {
    requests.push({ permissionId, reason })
    return false
  }

  try {
    const result = await readClipboardText('需要读取剪贴板')

    assert.deepEqual(requests, [{ permissionId: 'clipboard.read', reason: '需要读取剪贴板' }])
    assert.deepEqual(reads, [])
    assert.deepEqual(result, {
      read: false,
      text: '',
      reason: 'permission-denied',
    })
  }
  finally {
    globalThis.clipboard.readText = originalReadText
    globalThis.permission.check = originalCheck
    globalThis.permission.request = originalRequest
  }
})

test('readClipboardText fails closed when clipboard read sdk is unavailable', async () => {
  const originalReadText = globalThis.clipboard.readText
  const originalCheck = globalThis.permission.check
  const originalRequest = globalThis.permission.request

  delete globalThis.clipboard.readText
  globalThis.permission.check = async () => true
  globalThis.permission.request = async () => true

  try {
    const result = await readClipboardText('需要读取剪贴板')

    assert.deepEqual(result, {
      read: false,
      text: '',
      reason: 'clipboard-unavailable',
    })
  }
  finally {
    globalThis.clipboard.readText = originalReadText
    globalThis.permission.check = originalCheck
    globalThis.permission.request = originalRequest
  }
})

test('writeClipboardText fails closed when clipboard write sdk is unavailable', async () => {
  const originalWriteText = globalThis.clipboard.writeText
  const originalCheck = globalThis.permission.check
  const originalRequest = globalThis.permission.request

  delete globalThis.clipboard.writeText
  globalThis.permission.check = async () => true
  globalThis.permission.request = async () => true

  try {
    const result = await writeClipboardText('snippet', '需要写入剪贴板')

    assert.deepEqual(result, {
      written: false,
      reason: 'clipboard-unavailable',
    })
  }
  finally {
    globalThis.clipboard.writeText = originalWriteText
    globalThis.permission.check = originalCheck
    globalThis.permission.request = originalRequest
  }
})

test('writeClipboardText returns explicit failure when clipboard write throws', async () => {
  const originalWriteText = globalThis.clipboard.writeText
  const originalCheck = globalThis.permission.check
  const originalRequest = globalThis.permission.request

  globalThis.clipboard.writeText = async () => {
    throw new Error('clipboard down')
  }
  globalThis.permission.check = async () => true
  globalThis.permission.request = async () => true

  try {
    const result = await writeClipboardText('snippet', '需要写入剪贴板')

    assert.deepEqual(result, {
      written: false,
      reason: 'clipboard-write-failed',
    })
  }
  finally {
    globalThis.clipboard.writeText = originalWriteText
    globalThis.permission.check = originalCheck
    globalThis.permission.request = originalRequest
  }
})

test('parseSnippets accepts string payloads and keeps legacy snippet shape', () => {
  const parsed = parseSnippets(JSON.stringify({
    snippets: [{ id: 'legacy', title: 'Legacy', content: 'hello' }],
  }))

  assert.equal(parsed.version, 1)
  assert.equal(parsed.snippets[0].id, 'legacy')
})

test('normalizeSnippet upgrades legacy snippets to unified fields', () => {
  const normalized = normalizeSnippet({
    id: 'hello',
    title: 'Hello',
    content: 'content',
    tags: ['greeting'],
  }, 0)

  assert.equal(normalized.type, 'text')
  assert.equal(normalized.language, '')
  assert.deepEqual(normalized.tags, ['greeting'])
  assert.equal(normalized.useCount, 0)
})

test('inferSnippetType detects code and prompt snippets', () => {
  assert.equal(inferSnippetType('const value = 1'), 'code')
  assert.equal(inferSnippetType('system prompt for assistant'), 'prompt')
  assert.equal(inferSnippetType('normal reply template'), 'text')
})

test('createSnippetFromContent derives title and type from content', () => {
  const snippet = createSnippetFromContent('function demo() {}', { now: 123 })

  assert.equal(snippet.id, 'snippet-123')
  assert.equal(snippet.type, 'code')
  assert.equal(snippet.title, 'function demo() {}')
})

test('matchSnippet searches title type language tags and content', () => {
  const snippet = normalizeSnippet({
    title: 'React hook',
    type: 'code',
    language: 'ts',
    tags: ['frontend'],
    content: 'useEffect(() => {})',
  }, 0)

  assert.equal(matchSnippet(snippet, 'frontend'), true)
  assert.equal(matchSnippet(snippet, 'ts'), true)
  assert.equal(matchSnippet(snippet, 'missing'), false)
})

test('rankSnippets prefers title prefix, recent use then use count', () => {
  const snippets = [
    normalizeSnippet({ id: 'b', title: 'Beta', content: '', useCount: 8 }, 0),
    normalizeSnippet({ id: 'a', title: 'Alpha', content: '', useCount: 1 }, 1),
    normalizeSnippet({ id: 'c', title: 'Gamma', content: '', lastUsedAt: 2, useCount: 2 }, 2),
  ]

  assert.deepEqual(rankSnippets(snippets, 'al').map(item => item.id), ['a', 'c', 'b'])
})

test('buildSnippetIndex and serializeSnippets keep a stable unified store', () => {
  const index = buildSnippetIndex([
    { id: 'one', title: 'One', type: 'template', content: 'first' },
    { title: 'Two', content: 'second' },
  ])
  const serialized = serializeSnippets(Array.from(index.values()))

  assert.equal(index.get('one').type, 'template')
  assert.equal(serialized.version, 1)
  assert.equal(serialized.snippets.length, 2)
  assert.equal(serialized.snippets[1].id, 'snippet-1')
})

test('createSnippetPack filters sensitive snippets by default', () => {
  const pack = createSnippetPack([
    { id: 'safe', title: 'Safe', content: 'hello' },
    { id: 'secret', title: 'Secret', content: 'api_key = "hidden"' },
  ], { title: 'Team pack' }, { now: 123 })

  assert.equal(pack.format, 'tuff.snippet-pack+json')
  assert.equal(pack.title, 'Team pack')
  assert.equal(pack.snippets.length, 1)
  assert.equal(pack.snippets[0].id, 'safe')
  assert.equal(pack.skippedSensitiveCount, 1)
  assert.equal(containsSensitiveContent('password: test'), true)
})

test('normalizeSnippetPack accepts CloudShare content package payloads', () => {
  const pack = normalizeSnippetPack({
    title: 'Cloud pack',
    contentInline: {
      snippets: [{ id: 'one', title: 'One', content: 'first' }],
    },
  })

  assert.equal(pack.title, 'Cloud pack')
  assert.equal(pack.snippets.length, 1)
  assert.equal(pack.snippets[0].id, 'one')
})

test('importSnippetPack merges snippets and renames conflicting ids', () => {
  const imported = importSnippetPack(
    [{ id: 'one', title: 'Existing', content: 'old' }],
    {
      format: 'tuff.snippet-pack+json',
      snippets: [
        { id: 'one', title: 'Imported', content: 'new' },
        { id: 'two', title: 'Two', content: 'second' },
      ],
    },
    { now: 456 },
  )

  assert.equal(imported.importedCount, 2)
  assert.equal(imported.snippets.length, 3)
  assert.equal(imported.snippets[0].id, 'one-imported-456-0')
  assert.equal(imported.snippets[1].id, 'two')
  assert.equal(imported.snippets[2].id, 'one')
})

test('publishSnippetPack posts CloudShare payload with bearer token', async () => {
  const calls = []
  const httpClient = {
    async post(url, data, config) {
      calls.push({ url, data, config })
      return {
        data: {
          package: {
            id: 'pkg-1',
            contentInline: data.contentInline,
          },
        },
      }
    },
  }

  const result = await publishSnippetPack(
    createSnippetPack([{ id: 'one', title: 'One', content: 'first' }]),
    {
      httpClient,
      authToken: 'token-1',
      baseUrl: 'https://example.com',
    },
  )

  assert.equal(result.id, 'pkg-1')
  assert.equal(calls[0].url, 'https://example.com/api/store/plugin-content')
  assert.equal(calls[0].config.headers.authorization, 'Bearer token-1')
  assert.equal(calls[0].data.kind, 'snippet-pack')
})

test('list and install CloudShare snippet packs through injected http client', async () => {
  const httpClient = {
    async get(url) {
      assert.equal(url, 'https://example.com/api/store/plugin-content?pluginId=touch-snippets&kind=snippet-pack&limit=5')
      return {
        data: {
          packages: [{ id: 'pkg-1', title: 'Pack' }],
        },
      }
    },
    async post(url) {
      assert.equal(url, 'https://example.com/api/store/plugin-content/pkg-1/install')
      return {
        data: {
          package: {
            id: 'pkg-1',
            contentInline: {
              snippets: [{ id: 'one', title: 'One', content: 'first' }],
            },
          },
        },
      }
    },
  }

  const packs = await listCloudSnippetPacks({ httpClient, baseUrl: 'https://example.com', limit: 5 })
  const installed = await installCloudSnippetPack('pkg-1', { httpClient, baseUrl: 'https://example.com' })

  assert.equal(packs.length, 1)
  assert.equal(installed.id, 'pkg-1')
})

test('resolveAccountAuthToken reads token from touch channel', async () => {
  const token = await resolveAccountAuthToken({
    touchChannel: {
      async send(eventName) {
        assert.equal(eventName, 'account:auth:get-token')
        return ' token-2 '
      },
    },
  })

  assert.equal(token, 'token-2')
})
