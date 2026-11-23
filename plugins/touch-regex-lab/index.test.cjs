const assert = require('node:assert/strict')
const test = require('node:test')

class MockTuffItemBuilder {
  constructor(id) {
    this.item = { id, meta: {}, actions: [], render: { mode: 'default', basic: {} } }
  }

  setSource(type, id, name) {
    this.item.source = { type, id, name }
    return this
  }

  setTitle(title) {
    this.item.title = title
    this.item.render.basic.title = title
    return this
  }

  setSubtitle(subtitle) {
    this.item.subtitle = subtitle
    this.item.render.basic.subtitle = subtitle
    return this
  }

  setDescription(description) {
    this.item.description = description
    this.item.render.basic.description = description
    return this
  }

  setAccessory(accessory) {
    this.item.accessory = accessory
    this.item.render.basic.accessory = accessory
    return this
  }

  setIcon(icon) {
    this.item.icon = icon
    this.item.render.basic.icon = icon
    return this
  }

  setMeta(meta) {
    this.item.meta = { ...this.item.meta, ...meta }
    return this
  }

  createAndAddAction(id, type, label, payload) {
    this.item.actions.push({ id, type, label, primary: this.item.actions.length === 0, payload })
    return this
  }

  build() {
    return this.item
  }
}

function createHarness(overrides = {}) {
  const pushedBatches = []
  let clearedCount = 0
  const clipboardWrites = []

  globalThis.TuffItemBuilder = MockTuffItemBuilder
  globalThis.logger = { info() {}, warn() {}, error() {} }
  globalThis.plugin = {
    feature: {
      async clearItems() {
        clearedCount += 1
      },
      async pushItems(items) {
        pushedBatches.push(items)
      },
      ...overrides.feature,
    },
  }
  globalThis.permission = 'permission' in overrides
    ? overrides.permission
    : {
        async check(id) {
          return id === 'clipboard.write'
        },
      }
  globalThis.clipboard = 'clipboard' in overrides
    ? overrides.clipboard
    : {
        async writeText(text) {
          clipboardWrites.push(text)
        },
      }

  delete require.cache[require.resolve('./index.js')]
  const mod = require('./index.js')
  delete require.cache[require.resolve('./index.js')]

  return {
    mod,
    get pushed() {
      return pushedBatches.at(-1) || []
    },
    pushedBatches,
    get clearedCount() {
      return clearedCount
    },
    clipboardWrites,
  }
}

test('empty query renders guide and curated battle-tested regex library', async () => {
  const h = createHarness()
  const ok = await h.mod.onFeatureTriggered('regex-lab', { text: 'regex' })
  assert.equal(ok, true)
  assert.equal(h.clearedCount, 1)
  assert.ok(h.pushed.length >= 10)
  assert.equal(h.pushed[0].id, 'regex-lab-guide')

  const firstLib = h.pushed[1]
  assert.deepEqual(
    firstLib.actions.map(a => a.id),
    ['copy-raw', 'copy-js', 'copy-python'],
  )
  assert.ok(firstLib.actions.every(a => a.type === 'plugin'))
})

test('live regex test extracts numbered and named capture groups with spans', async () => {
  const h = createHarness()
  await h.mod.onFeatureTriggered(
    'regex-lab',
    { text: 'regex /(?<user>[a-z]+)@([a-z.]+)/gi :: Contact alice@tuff.dev and bob@example.org' },
  )

  const summary = h.pushed.find(item => item.id === 'regex-lab-summary')
  assert.ok(summary)
  assert.match(summary.title, /2 matches/)

  const match1 = h.pushed.find(item => item.id === 'regex-lab-match-1')
  const match2 = h.pushed.find(item => item.id === 'regex-lab-match-2')
  assert.ok(match1 && match2)
  assert.match(match1.title, /alice@tuff\.dev/)
  assert.match(match1.subtitle, /<user>="alice"/)
  assert.match(match1.subtitle, /\$2="tuff\.dev"/)
  assert.equal(match1.accessory, '[8..22]')
  assert.match(match2.title, /bob@example\.org/)
})

test('handles escaped slashes and character class slashes cleanly', async () => {
  const h = createHarness()
  await h.mod.onFeatureTriggered(
    'regex-lab',
    { text: '/https?:\\/\\/[\\w.-]+\\/[\\w/-]+/g :: See https://tuff.dev/docs/api now' },
  )

  const match1 = h.pushed.find(item => item.id === 'regex-lab-match-1')
  assert.ok(match1)
  assert.match(match1.title, /https:\/\/tuff\.dev\/docs\/api/)
})

test('sed-style and arrow-style replace preview expand capture references accurately', async () => {
  const h = createHarness()
  await h.mod.onFeatureTriggered(
    'regex-lab',
    { text: 's/(\\w+)=(\\d+)/$1:$2/g :: port=8080 retries=3' },
  )
  const sedOut = h.pushed.find(item => item.id === 'regex-lab-replace-output')
  assert.ok(sedOut)
  assert.equal(sedOut.actions[0].payload.text, 'port:8080 retries:3')
  assert.match(sedOut.actions[2].payload.text, /re\.sub/)

  await h.mod.onFeatureTriggered(
    'regex-lab',
    { text: '/(?<first>\\w+)\\s+(?<last>\\w+)/g => $<last>, $<first> :: Ada Lovelace' },
  )
  const arrowOut = h.pushed.find(item => item.id === 'regex-lab-replace-output')
  assert.ok(arrowOut)
  assert.equal(arrowOut.actions[0].payload.text, 'Lovelace, Ada')
})

test('ReDoS guard blocks catastrophic backtracking patterns before execution', async () => {
  const h = createHarness()
  const payload = `${'a'.repeat(40)}!`

  await h.mod.onFeatureTriggered('regex-lab', { text: `/(a+)+$/ :: ${payload}` })
  const warning = h.pushed.find(item => item.id === 'regex-lab-redos-blocked')
  assert.ok(warning)
  assert.equal(warning.accessory, 'ReDoS Guard')
  assert.match(warning.subtitle, /Nested quantifier/i)

  await h.mod.onFeatureTriggered('regex-lab', { text: `/(a|aa)+$/ :: ${payload}` })
  const altWarning = h.pushed.find(item => item.id === 'regex-lab-redos-blocked')
  assert.ok(altWarning)
  assert.match(altWarning.subtitle, /Overlapping repeated alternation/i)
})

test('library search finds curated patterns and auto-detects literal sample values', async () => {
  const h = createHarness()
  await h.mod.onFeatureTriggered('regex-lab', { text: 'regex semver' })
  const semverCard = h.pushed.find(item => item.id === 'regex-lab-lib-semver')
  assert.ok(semverCard)

  await h.mod.onFeatureTriggered('regex-lab', { text: 'regex 192.168.10.42' })
  const detectedIp = h.pushed.find(item => item.id === 'regex-lab-detected-ipv4')
  assert.ok(detectedIp)
  assert.equal(detectedIp.accessory, 'MATCHED')
})

test('onItemAction honors context.actionId to copy raw, JS, or Python format', async () => {
  const h = createHarness()
  await h.mod.onFeatureTriggered('regex-lab', { text: 'regex uuid' })
  const uuidCard = h.pushed.find(item => item.id === 'regex-lab-lib-uuid-v4')
  assert.ok(uuidCard)

  const resRaw = await h.mod.onItemAction(uuidCard, { actionId: 'copy-raw' })
  const resJs = await h.mod.onItemAction(uuidCard, { actionId: 'copy-js' })
  const resPy = await h.mod.onItemAction(uuidCard, { actionId: 'copy-python' })

  assert.equal(resRaw.status, 'started')
  assert.equal(resJs.status, 'started')
  assert.equal(resPy.status, 'started')
  assert.equal(h.clipboardWrites.length, 3)
  assert.ok(!h.clipboardWrites[0].startsWith('/'))
  assert.ok(h.clipboardWrites[1].startsWith('/') && h.clipboardWrites[1].endsWith('/i'))
  assert.match(h.clipboardWrites[2], /^re\.compile\(r".*", re\.IGNORECASE\)$/)

  const invalid = await h.mod.onItemAction(uuidCard, { actionId: 'non-existent' })
  assert.equal(invalid.status, 'blocked')
  assert.equal(invalid.reason, 'invalid-action')
})

test('fail-closed permission and capability guards block clipboard write with canonical reasons', async () => {
  const baseHarness = createHarness()
  await baseHarness.mod.onFeatureTriggered('regex-lab', { text: 'regex email' })
  const card = baseHarness.pushed.find(item => item.id === 'regex-lab-lib-email')

  // permission-denied
  const denied = createHarness({ permission: { async check() { return false } } })
  const r1 = await denied.mod.onItemAction(card, { actionId: 'copy-raw' })
  assert.equal(r1.status, 'blocked')
  assert.equal(r1.reason, 'permission-denied')
  assert.equal(denied.clipboardWrites.length, 0)

  // permission-sdk-unavailable
  const noSdk = createHarness({ permission: undefined })
  const r2 = await noSdk.mod.onItemAction(card, { actionId: 'copy-raw' })
  assert.equal(r2.status, 'blocked')
  assert.equal(r2.reason, 'permission-sdk-unavailable')
  assert.equal(noSdk.clipboardWrites.length, 0)

  // permission-unavailable (host error code)
  const permUnavail = createHarness({
    permission: {
      async check() {
        const err = new Error('unavailable')
        err.code = 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE'
        throw err
      },
    },
  })
  const r3 = await permUnavail.mod.onItemAction(card, { actionId: 'copy-raw' })
  assert.equal(r3.status, 'blocked')
  assert.equal(r3.reason, 'permission-unavailable')

  // permission-check-failed (generic error)
  const permFail = createHarness({
    permission: {
      async check() {
        throw new Error('boom')
      },
    },
  })
  const r4 = await permFail.mod.onItemAction(card, { actionId: 'copy-raw' })
  assert.equal(r4.status, 'blocked')
  assert.equal(r4.reason, 'permission-check-failed')

  // capability-unavailable (missing clipboard.writeText)
  const noClip = createHarness({ clipboard: {} })
  const r5 = await noClip.mod.onItemAction(card, { actionId: 'copy-raw' })
  assert.equal(r5.status, 'blocked')
  assert.equal(r5.reason, 'capability-unavailable')
})

test('zero-width matches terminate safely and invalid regex/flags emit clear diagnostics', async () => {
  const h = createHarness()
  await h.mod.onFeatureTriggered('regex-lab', { text: '/\\b/g :: a b' })
  const summary = h.pushed.find(item => item.id === 'regex-lab-summary')
  assert.ok(summary)
  assert.match(summary.title, /4 matches/)

  await h.mod.onFeatureTriggered('regex-lab', { text: '/([unclosed/g :: abc' })
  const syntaxErr = h.pushed.find(item => item.id === 'regex-lab-syntax-error')
  assert.ok(syntaxErr)
  assert.equal(syntaxErr.accessory, 'ERROR')

  await h.mod.onFeatureTriggered('regex-lab', { text: '/abc/z :: abc' })
  const flagErr = h.pushed.find(item => item.id === 'regex-lab-syntax-error')
  assert.ok(flagErr)
  assert.match(flagErr.subtitle, /Unsupported regex flag/i)
})

test('trigger generation guard and onDestroy prevent stale async publishes', async () => {
  let releaseFirstClear
  let clearCalls = 0
  const firstClearBarrier = new Promise((resolve) => {
    releaseFirstClear = resolve
  })

  const h = createHarness({
    feature: {
      async clearItems() {
        clearCalls += 1
        if (clearCalls === 1) {
          await firstClearBarrier
        }
      },
      async pushItems(items) {
        h.pushedBatches.push(items)
      },
    },
  })

  const p1 = h.mod.onFeatureTriggered('regex-lab', { text: 'regex email' })
  await Promise.resolve()
  h.mod.onDestroy()
  releaseFirstClear()
  await p1

  assert.equal(h.pushedBatches.length, 0)
  assert.deepEqual(Object.keys(h.mod).sort(), ['onDestroy', 'onFeatureTriggered', 'onItemAction'])
})

test('ReDoS guard blocks escaped nested quantifiers, escaped overlaps, and non-capturing/named group overlaps', async () => {
  const h = createHarness()
  const dangerousQueries = [
    '/(\\d+)+$/ :: 111111111111111111111111!',
    '/(\\w+)+$/ :: aaaaaaaaaaaaaaaaaaaaaaaa!',
    '/(\\d|\\w)+$/ :: 111111111111111111111111!',
    '/(?:a|aa)+$/ :: aaaaaaaaaaaaaaaaaaaaaaaa!',
    '/(?:a|a)+$/ :: aaaaaaaaaaaaaaaaaaaaaaaa!',
    '/(?<x>a|aa)+$/ :: aaaaaaaaaaaaaaaaaaaaaaaa!',
  ]

  for (const query of dangerousQueries) {
    h.pushedBatches.length = 0
    await h.mod.onFeatureTriggered('regex-lab', { text: query })
    const items = h.pushedBatches.at(-1) || []
    const blockedItem = items.find(item => /ReDoS|风险|blocked|拒绝/i.test(`${item.title} ${item.subtitle}`))
    assert.ok(blockedItem, `expected ReDoS guard to block: ${query} (got: ${JSON.stringify(items.map(i => i.title))})`)
  }
})
