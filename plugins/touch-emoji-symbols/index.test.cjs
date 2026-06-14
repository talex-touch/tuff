const assert = require('node:assert/strict')
const test = require('node:test')

function loadFreshPluginModule() {
  delete require.cache[require.resolve('./index.js')]
  const pluginModule = require('./index.js')
  delete require.cache[require.resolve('./index.js')]
  return pluginModule
}

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
  parseSearchQuery,
  searchEmojiSymbols,
} = loadFreshPluginModule().__test
const emojiPlugin = loadFreshPluginModule()

test('parseSearchQuery strips emoji and symbol command prefixes', () => {
  assert.equal(parseSearchQuery('emoji check'), 'check')
  assert.equal(parseSearchQuery('symbol: arrow'), 'arrow')
  assert.equal(parseSearchQuery('符号 货币'), '货币')
  assert.equal(parseSearchQuery('check'), 'check')
})

test('searchEmojiSymbols matches english and chinese keywords', () => {
  const checks = searchEmojiSymbols('check')
  const arrows = searchEmojiSymbols('右箭头')
  const currencies = searchEmojiSymbols('人民币')

  assert.equal(checks[0].value, '✅')
  assert.equal(arrows[0].value, '→')
  assert.equal(currencies[0].value, '¥')
})

test('buildResultItems creates copy items with plugin copy action', () => {
  const items = buildResultItems('emoji-symbols', 'emoji rocket')

  assert.equal(items[0].title, '🚀 Rocket')
  assert.equal(items[0].meta.pluginName, 'touch-emoji-symbols')
  assert.equal(items[0].meta.defaultAction, 'copy')
  assert.deepEqual(items[0].actions[0], {
    id: 'copy',
    type: 'plugin',
    title: '复制',
    payload: { text: '🚀' },
  })
})

test('buildResultItems returns empty state for missing query', () => {
  const items = buildResultItems('emoji-symbols', 'not-a-symbol-value')

  assert.equal(items.length, 1)
  assert.equal(items[0].id, 'emoji-symbols-empty')
})

test('onItemAction blocks copy when clipboard.write permission is denied', async () => {
  const writes = []
  const requested = []
  const originalWriteText = globalThis.clipboard.writeText
  const originalCheck = globalThis.permission.check
  const originalRequest = globalThis.permission.request

  globalThis.clipboard.writeText = value => writes.push(value)
  globalThis.permission.check = async () => false
  globalThis.permission.request = async (permissionId, reason) => {
    requested.push({ permissionId, reason })
    return false
  }

  try {
    const result = await emojiPlugin.onItemAction({
      meta: { defaultAction: 'copy' },
      actions: [{ type: 'copy', payload: '✨' }],
    })

    assert.deepEqual(requested, [
      {
        permissionId: 'clipboard.write',
        reason: '需要剪贴板写入权限以复制 Emoji 或符号',
      },
    ])
    assert.deepEqual(writes, [])
    assert.equal(result.externalAction, true)
    assert.equal(result.status, 'blocked')
    assert.equal(result.reason, 'permission-denied')
  }
  finally {
    globalThis.clipboard.writeText = originalWriteText
    globalThis.permission.check = originalCheck
    globalThis.permission.request = originalRequest
  }
})

test('onItemAction blocks copy when permission sdk is unavailable', async () => {
  const writes = []
  const originalPermission = globalThis.permission
  const originalWriteText = globalThis.clipboard.writeText
  delete globalThis.permission
  globalThis.clipboard.writeText = value => writes.push(value)

  try {
    const pluginWithoutPermission = loadFreshPluginModule()
    const result = await pluginWithoutPermission.onItemAction({
      meta: { defaultAction: 'copy' },
      actions: [{ type: 'copy', payload: '✨' }],
    })

    assert.deepEqual(writes, [])
    assert.equal(result.externalAction, true)
    assert.equal(result.status, 'blocked')
    assert.equal(result.reason, 'permission-denied')
  }
  finally {
    globalThis.permission = originalPermission
    globalThis.clipboard.writeText = originalWriteText
  }
})

test('onItemAction copies emoji after clipboard.write permission is granted', async () => {
  const writes = []
  const requested = []
  const originalWriteText = globalThis.clipboard.writeText
  const originalCheck = globalThis.permission.check
  const originalRequest = globalThis.permission.request

  globalThis.clipboard.writeText = value => writes.push(value)
  globalThis.permission.check = async () => true
  globalThis.permission.request = async (permissionId) => {
    requested.push(permissionId)
    return true
  }

  try {
    const result = await emojiPlugin.onItemAction({
      meta: { defaultAction: 'copy' },
      actions: [{ type: 'copy', payload: '✅' }],
    })

    assert.deepEqual(requested, [])
    assert.deepEqual(writes, ['✅'])
    assert.equal(result.externalAction, true)
    assert.equal(result.status, 'started')
  }
  finally {
    globalThis.clipboard.writeText = originalWriteText
    globalThis.permission.check = originalCheck
    globalThis.permission.request = originalRequest
  }
})
