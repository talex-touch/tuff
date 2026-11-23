const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const test = require('node:test')
const vm = require('node:vm')

class FakeBuilder {
  constructor(id) {
    this.item = { id, meta: {}, actions: [] }
    this.basic = {}
  }

  setSource(type, id, name) {
    this.item.source = { type, id, name }
    return this
  }

  setTitle(title) {
    this.basic.title = title
    return this
  }

  setSubtitle(subtitle) {
    this.basic.subtitle = subtitle
    return this
  }

  setAccessory(accessory) {
    this.basic.accessory = accessory
    return this
  }

  setIcon(icon) {
    this.basic.icon = icon
    return this
  }

  setMeta(meta) {
    this.item.meta = { ...this.item.meta, ...meta }
    return this
  }

  createAndAddAction(id, type, label, payload) {
    this.item.actions.push({ id, type, label, payload })
    return this
  }

  build() {
    this.item.render = { mode: 'default', basic: { ...this.basic } }
    return this.item
  }
}

function createHarness(options = {}) {
  const files = new Map(options.files || [])
  const state = { items: [], clipboardWrites: [], logs: [] }
  const plugin = {
    storage: options.storage || {
      async getFile(name) {
        return files.get(name) ?? null
      },
      async setFile(name, value) {
        files.set(name, value)
      },
    },
    feature: options.feature || {
      async clearItems() {
        state.items = []
      },
      async pushItems(items) {
        state.items = items
      },
    },
  }

  const sandbox = {
    plugin,
    clipboard: 'clipboard' in options
      ? options.clipboard
      : {
          async writeText(text) {
            state.clipboardWrites.push(text)
          },
        },
    permission: 'permission' in options
      ? options.permission
      : {
          async check(id) {
            if (options.permissionError)
              throw options.permissionError
            return options.permissionGranted !== false && id === 'clipboard.write'
          },
        },
    logger: {
      warn(...args) { state.logs.push(['warn', ...args]) },
      error(...args) { state.logs.push(['error', ...args]) },
      info(...args) { state.logs.push(['info', ...args]) },
    },
    TuffItemBuilder: FakeBuilder,
    Intl,
    module: { exports: {} },
  }
  sandbox.exports = sandbox.module.exports
  sandbox.globalThis = sandbox

  const source = readFileSync(require.resolve('./index.js'), 'utf8')
  vm.runInNewContext(source, sandbox, { filename: 'touch-world-time/index.js' })
  return { module: sandbox.module.exports, state, files }
}

test('resolves key global city aliases and timezone abbreviations across 50+ cities', async () => {
  const h = createHarness()
  const aliases = [
    ['tokyo', /Tokyo/],
    ['nyc', /New York/],
    ['sf', /San Francisco/],
    ['london', /London/],
    ['berlin', /Berlin/],
    ['sg', /Singapore/],
    ['shanghai', /Shanghai/],
    ['sydney', /Sydney/],
    ['utc', /UTC/],
    ['pst', /San Francisco/],
    ['est', /New York/],
    ['cet', /Berlin/],
    ['jst', /Tokyo/],
    ['东京', /Tokyo/],
    ['苏黎世', /Zurich/],
  ]

  for (const [alias, expected] of aliases) {
    await h.module.onFeatureTriggered('world-time', { text: alias })
    assert.ok(h.state.items.length >= 1, `expected match for alias ${alias}`)
    assert.match(h.state.items[0].render.basic.title, expected, `alias ${alias} matched unexpected city`)
  }
})

test('natural time conversion: 14:00 PST to CST/UTC/Tokyo computes exact offsets and day rollover', async () => {
  const h = createHarness()

  await h.module.onFeatureTriggered('world-time', { text: '14:00 PST to CST/UTC/Tokyo' })
  // Expect 3 targets + 1 summary item
  assert.equal(h.state.items.length, 4)

  const cst = h.state.items[0]
  const utc = h.state.items[1]
  const tokyo = h.state.items[2]

  // 14:00 UTC-8 = 22:00 UTC = 06:00 (+1d) China CST = 07:00 (+1d) Tokyo
  assert.match(cst.render.basic.title, /06:00 \(\+1d\)/)
  assert.match(cst.render.basic.subtitle, /US Central \(UTC-6\): 16:00/)
  assert.match(utc.render.basic.title, /22:00/)
  assert.doesNotMatch(utc.render.basic.title, /\+1d/)
  assert.match(tokyo.render.basic.title, /07:00 \(\+1d\)/)
})

test('DST-aware explicit date & 12-hour conversion: 2026-07-15 9:30am nyc to london, berlin, tokyo', async () => {
  const h = createHarness()

  await h.module.onFeatureTriggered('world-time', { text: '2026-07-15 9:30am nyc to london, berlin, tokyo' })
  assert.equal(h.state.items.length, 4)

  // In July: NYC is EDT (UTC-4) -> 09:30 EDT = 13:30 UTC
  // London (BST, UTC+1) = 14:30; Berlin (CEST, UTC+2) = 15:30; Tokyo (JST, UTC+9) = 22:30
  assert.match(h.state.items[0].render.basic.title, /London.*14:30/)
  assert.match(h.state.items[1].render.basic.title, /Berlin.*15:30/)
  assert.match(h.state.items[2].render.basic.title, /Tokyo.*22:30/)
})

test('conversion without target list defaults to pinned cities', async () => {
  const h = createHarness({
    files: [['world-time.json', { version: 1, pinned: ['tokyo', 'london'] }]],
  })

  await h.module.onFeatureTriggered('world-time', { text: '12:00 utc' })
  // 2 pinned targets + 1 summary
  assert.equal(h.state.items.length, 3)
  assert.match(h.state.items[0].render.basic.title, /Tokyo.*21:00/)
})

test('golden-hours team meeting overlap planner finds valid working-hour overlap for NYC/London/Berlin', async () => {
  const h = createHarness()

  await h.module.onFeatureTriggered('world-time', { text: 'meet nyc london berlin' })
  const golden = h.state.items.find(i => i.render.basic.accessory === 'Golden')
  assert.ok(golden, 'expected a Golden overlap window for NYC, London, Berlin')
  assert.match(golden.render.basic.title, /黄金重叠时段/)

  // Verify copy action works with permission gate
  const copyRes = await h.module.onItemAction(golden, { actionId: 'copy-meeting' })
  assert.equal(copyRes.success, true)
  assert.equal(h.state.clipboardWrites.length, 1)
  assert.match(h.state.clipboardWrites[0], /Golden Hours/)
})

test('meeting planner handles zero-golden global triad (SF + London + Tokyo) with compromise ranking', async () => {
  const h = createHarness()

  await h.module.onFeatureTriggered('world-time', { text: 'overlap sf london tokyo' })
  assert.ok(h.state.items.length >= 2)
  // Every recommended slot line includes all 3 cities
  const slotItem = h.state.items.find(i => i.id.includes('-slot-'))
  assert.ok(slotItem)
  assert.match(slotItem.render.basic.title, /San Francisco/)
  assert.match(slotItem.render.basic.title, /London/)
  assert.match(slotItem.render.basic.title, /Tokyo/)
})

test('pinned cities persist in plugin.storage via pin-city, unpin-city, and reset-pins', async () => {
  const h = createHarness()
  await h.module.onInit()
  assert.deepEqual(Array.from(h.files.get('world-time.json').pinned), [
    'shanghai',
    'tokyo',
    'london',
    'new-york',
    'san-francisco',
    'utc',
  ])

  // Search Berlin and pin via secondary context.actionId
  await h.module.onFeatureTriggered('world-time', { text: 'berlin' })
  const berlinItem = h.state.items[0]
  const pinRes = await h.module.onItemAction(berlinItem, { actionId: 'pin-city' })
  assert.equal(pinRes.success, true)
  assert.equal(h.files.get('world-time.json').pinned[0], 'berlin')

  // Unpin Berlin
  const pinnedBerlin = h.state.items.find(i => i.id.endsWith('-city-berlin'))
  assert.ok(pinnedBerlin)
  const unpinRes = await h.module.onItemAction(pinnedBerlin, { actionId: 'unpin-city' })
  assert.equal(unpinRes.success, true)
  assert.equal(h.files.get('world-time.json').pinned.includes('berlin'), false)

  // Reset pins
  await h.module.onFeatureTriggered('world-time', { text: 'reset' })
  const resetRes = await h.module.onItemAction(h.state.items[0], { actionId: 'reset-pins' })
  assert.equal(resetRes.success, true)
  assert.equal(h.files.get('world-time.json').pinned.length, 6)
})

test('direct IANA timezone and explicit UTC offset lookups work', async () => {
  const h = createHarness()

  await h.module.onFeatureTriggered('world-time', { text: 'America/Anchorage' })
  assert.match(h.state.items[0].render.basic.title, /Anchorage/)

  await h.module.onFeatureTriggered('world-time', { text: 'UTC+5:30' })
  assert.match(h.state.items[0].render.basic.title, /UTC\+5:30/)
})

test('clipboard copy fails closed on permission-denied, permission-sdk-unavailable, permission-check-failed, and invalid action', async () => {
  const denied = createHarness({ permissionGranted: false })
  await denied.module.onFeatureTriggered('world-time', { text: 'tokyo' })
  const r1 = await denied.module.onItemAction(denied.state.items[0], { actionId: 'copy-time' })
  assert.equal(r1.status, 'blocked')
  assert.equal(r1.reason, 'permission-denied')
  assert.equal(denied.state.clipboardWrites.length, 0)

  const noSdk = createHarness({ permission: undefined })
  await noSdk.module.onFeatureTriggered('world-time', { text: 'tokyo' })
  const r2 = await noSdk.module.onItemAction(noSdk.state.items[0], { actionId: 'copy-time' })
  assert.equal(r2.status, 'blocked')
  assert.equal(r2.reason, 'permission-sdk-unavailable')

  const checkErr = createHarness({ permissionError: new Error('boom') })
  await checkErr.module.onFeatureTriggered('world-time', { text: 'tokyo' })
  const r3 = await checkErr.module.onItemAction(checkErr.state.items[0], { actionId: 'copy-time' })
  assert.equal(r3.status, 'blocked')
  assert.equal(r3.reason, 'permission-check-failed')

  const r4 = await denied.module.onItemAction(denied.state.items[0], { actionId: 'unknown-action' })
  assert.equal(r4.status, 'blocked')
  assert.equal(r4.reason, 'invalid-action')
})

test('trigger generation guard and onDestroy lifecycle prevent stale writes and post-destroy mutations', async () => {
  let releaseFirst
  const firstRead = new Promise((resolve) => { releaseFirst = resolve })
  let reads = 0
  const h = createHarness({
    storage: {
      async getFile() {
        reads += 1
        if (reads === 1)
          return firstRead
        return { version: 1, pinned: ['tokyo'] }
      },
      async setFile() {},
    },
  })

  const slow = h.module.onFeatureTriggered('world-time', { text: '' })
  await Promise.resolve()
  await h.module.onFeatureTriggered('world-time', { text: 'sydney' })
  assert.match(h.state.items[0].render.basic.title, /Sydney/)

  releaseFirst({ version: 1, pinned: ['london'] })
  await slow
  assert.match(h.state.items[0].render.basic.title, /Sydney/)

  const item = h.state.items[0]
  h.module.onDestroy()
  assert.equal(await h.module.onFeatureTriggered('world-time', { text: 'tokyo' }), false)
  const act = await h.module.onItemAction(item, { actionId: 'copy-time' })
  assert.equal(act.status, 'blocked')
  assert.equal(act.reason, 'cancelled')
})
