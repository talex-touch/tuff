const assert = require('node:assert/strict')
const test = require('node:test')

globalThis.plugin = { feature: { clearItems() {}, pushItems() {} } }
globalThis.clipboard = {}
globalThis.logger = {}
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
} = require('./index.js').__test

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

test('buildResultItems creates copy items with default copy action', () => {
  const items = buildResultItems('emoji-symbols', 'emoji rocket')

  assert.equal(items[0].title, '🚀 Rocket')
  assert.equal(items[0].meta.pluginName, 'touch-emoji-symbols')
  assert.equal(items[0].meta.defaultAction, 'copy')
  assert.equal(items[0].actions[0].payload, '🚀')
})

test('buildResultItems returns empty state for missing query', () => {
  const items = buildResultItems('emoji-symbols', 'not-a-symbol-value')

  assert.equal(items.length, 1)
  assert.equal(items[0].id, 'emoji-symbols-empty')
})
