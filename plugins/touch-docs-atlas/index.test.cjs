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

test('empty query shows offline atlas overview across all reference modules', async () => {
  const h = createHarness()
  const ok = await h.mod.onFeatureTriggered('docs-atlas', { text: 'atlas' })
  assert.equal(ok, true)
  assert.equal(h.clearedCount, 1)
  assert.equal(h.pushed[0].id, 'docs-atlas-guide')
  assert.ok(h.pushed.length >= 6)
})

test('HTTP status code lookup covers 1xx-5xx codes, class filters, and keywords', async () => {
  const h = createHarness()

  await h.mod.onFeatureTriggered('docs-atlas', { text: 'http 429' })
  const code429 = h.pushed.find(i => i.id === 'docs-atlas-http-429')
  assert.ok(code429)
  assert.match(code429.title, /429 Too Many Requests/)
  assert.equal(code429.actions[0].payload.text, '429 Too Many Requests')

  await h.mod.onFeatureTriggered('docs-atlas', { text: 'http 1xx' })
  assert.ok(h.pushed.some(i => i.id === 'docs-atlas-http-101'))
  assert.ok(h.pushed.every(i => i.accessory === 'HTTP 1xx'))

  await h.mod.onFeatureTriggered('docs-atlas', { text: 'http 5xx' })
  assert.ok(h.pushed.some(i => i.id === 'docs-atlas-http-502'))
  assert.ok(h.pushed.some(i => i.id === 'docs-atlas-http-504'))

  await h.mod.onFeatureTriggered('docs-atlas', { text: 'http-status 404' })
  assert.ok(h.pushed.some(i => i.id === 'docs-atlas-http-404'))

  await h.mod.onFeatureTriggered('docs-atlas', { text: 'status-code 502' })
  assert.ok(h.pushed.some(i => i.id === 'docs-atlas-http-502'))
})

test('chmod calculator converts octal <-> symbolic including setuid/sticky bits and security warnings', async () => {
  const h = createHarness()

  await h.mod.onFeatureTriggered('docs-atlas', { text: 'chmod 755' })
  const card755 = h.pushed.find(i => i.id === 'docs-atlas-chmod-summary')
  assert.ok(card755)
  assert.match(card755.title, /755.*rwxr-xr-x/)
  assert.equal(card755.actions[1].payload.text, 'rwxr-xr-x')

  await h.mod.onFeatureTriggered('docs-atlas', { text: 'chmod drwxrwxrwt' })
  const sticky = h.pushed.find(i => i.id === 'docs-atlas-chmod-summary')
  assert.ok(sticky)
  assert.match(sticky.title, /1777/)
  assert.match(sticky.subtitle, /sticky/i)

  await h.mod.onFeatureTriggered('docs-atlas', { text: 'chmod 4755' })
  const suid = h.pushed.find(i => i.id === 'docs-atlas-chmod-summary')
  assert.match(suid.title, /rwsr-xr-x/)

  await h.mod.onFeatureTriggered('docs-atlas', { text: 'chmod 777' })
  const warn = h.pushed.find(i => i.id === 'docs-atlas-chmod-warning')
  assert.ok(warn)
  assert.match(warn.subtitle, /World-writable/i)

  await h.mod.onFeatureTriggered('docs-atlas', { text: 'chmod u=rw,g=r,o=' })
  const clause = h.pushed.find(i => i.id === 'docs-atlas-chmod-summary')
  assert.match(clause.title, /640.*rw-r-----/)
})

test('IPv4 CIDR subnet calculator handles /24, dotted mask, /31 RFC 3021, /32 host, and /0 accurately', async () => {
  const h = createHarness()

  await h.mod.onFeatureTriggered('docs-atlas', { text: 'cidr 192.168.1.42/24' })
  const net24 = h.pushed.find(i => i.id === 'docs-atlas-cidr-network')
  const range24 = h.pushed.find(i => i.id === 'docs-atlas-cidr-range')
  const mask24 = h.pushed.find(i => i.id === 'docs-atlas-cidr-mask')
  assert.equal(net24.actions[0].payload.text, '192.168.1.0/24')
  assert.match(net24.title, /254 usable \/ 256 total/)
  assert.equal(range24.actions[0].payload.text, '192.168.1.1 – 192.168.1.254')
  assert.equal(range24.actions[1].payload.text, '192.168.1.255')
  assert.equal(mask24.actions[0].payload.text, '255.255.255.0')
  assert.equal(mask24.actions[1].payload.text, '0.0.0.255')

  await h.mod.onFeatureTriggered('docs-atlas', { text: '10.20.30.40 255.255.240.0' })
  const net20 = h.pushed.find(i => i.id === 'docs-atlas-cidr-network')
  assert.equal(net20.actions[0].payload.text, '10.20.16.0/20')

  await h.mod.onFeatureTriggered('docs-atlas', { text: 'cidr 10.0.0.1/31' })
  const net31 = h.pushed.find(i => i.id === 'docs-atlas-cidr-network')
  assert.match(net31.title, /2 usable \/ 2 total/)
  assert.match(net31.subtitle, /RFC 3021/)

  await h.mod.onFeatureTriggered('docs-atlas', { text: 'cidr 10.0.0.9/32' })
  const net32 = h.pushed.find(i => i.id === 'docs-atlas-cidr-network')
  assert.match(net32.title, /1 usable \/ 1 total/)

  await h.mod.onFeatureTriggered('docs-atlas', { text: 'cidr 0.0.0.0/0' })
  const net0 = h.pushed.find(i => i.id === 'docs-atlas-cidr-network')
  assert.equal(net0.actions[0].payload.text, '0.0.0.0/0')
  assert.match(net0.title, /4,294,967,294 usable \/ 4,294,967,296 total/)

  await h.mod.onFeatureTriggered('docs-atlas', { text: 'cidr 192.168.1.1/255.0.255.0' })
  const invalidMask = h.pushed.find(i => i.id === 'docs-atlas-cidr-invalid')
  assert.ok(invalidMask)
  assert.match(invalidMask.subtitle, /Non-contiguous/)
})

test('MIME types lookup supports extensions, MIME names, and Content-Type header copy', async () => {
  const h = createHarness()
  await h.mod.onFeatureTriggered('docs-atlas', { text: 'mime woff2' })
  const woff2 = h.pushed.find(i => i.title.includes('font/woff2'))
  assert.ok(woff2)
  assert.equal(woff2.actions[0].payload.text, 'font/woff2')
  assert.equal(woff2.actions[1].payload.text, 'Content-Type: font/woff2')

  await h.mod.onFeatureTriggered('docs-atlas', { text: 'atlas .svg' })
  assert.ok(h.pushed.some(i => i.title.includes('image/svg+xml')))
})

test('ASCII and ANSI lookup handles characters, decimal, hex, control names, and SGR sequences', async () => {
  const h = createHarness()

  await h.mod.onFeatureTriggered('docs-atlas', { text: 'ascii A' })
  const aCard = h.pushed.find(i => i.id === 'docs-atlas-ascii-65')
  assert.ok(aCard)
  assert.match(aCard.title, /ASCII 65 · 0x41/)

  await h.mod.onFeatureTriggered('docs-atlas', { text: 'ascii 0x1B' })
  const escCard = h.pushed.find(i => i.id === 'docs-atlas-ascii-27')
  assert.ok(escCard)
  assert.match(escCard.title, /ESC/)

  await h.mod.onFeatureTriggered('docs-atlas', { text: 'ascii LF' })
  assert.ok(h.pushed.some(i => i.id === 'docs-atlas-ascii-10'))

  await h.mod.onFeatureTriggered('docs-atlas', { text: 'ansi rgb' })
  const rgbCard = h.pushed.find(i => i.title.includes('TrueColor'))
  assert.ok(rgbCard)
  assert.match(rgbCard.actions[0].payload.text, /\\x1b\[38;2;/)
})

test('cheatsheets cover Git, Docker, SQL, cURL, and tmux topics cleanly', async () => {
  const h = createHarness()
  const checks = [
    ['cheat git rebase', /git rebase -i/],
    ['cheat docker logs', /docker logs -f/],
    ['cheat sql window', /OVER \(PARTITION BY/],
    ['cheat curl timing', /time_starttransfer/],
    ['cheat tmux split', /split-window/],
  ]

  for (const [query, pattern] of checks) {
    await h.mod.onFeatureTriggered('docs-atlas', { text: query })
    assert.ok(h.pushed.length >= 1, `Expected hits for "${query}"`)
    assert.match(h.pushed[0].actions[0].payload.text, pattern)
  }
})

test('onItemAction honors context.actionId across primary, secondary, and JSON copy actions', async () => {
  const h = createHarness()
  await h.mod.onFeatureTriggered('docs-atlas', { text: 'cidr 192.168.1.42/24' })
  const netCard = h.pushed.find(i => i.id === 'docs-atlas-cidr-network')

  const r1 = await h.mod.onItemAction(netCard, { actionId: 'copy-primary' })
  const r2 = await h.mod.onItemAction(netCard, { actionId: 'copy-json' })
  assert.equal(r1.status, 'started')
  assert.equal(r2.status, 'started')
  assert.equal(h.clipboardWrites[0], '192.168.1.0/24')
  const parsedJson = JSON.parse(h.clipboardWrites[1])
  assert.equal(parsedJson.usableHosts, 254)

  const invalid = await h.mod.onItemAction(netCard, { actionId: 'bogus-id' })
  assert.equal(invalid.status, 'blocked')
  assert.equal(invalid.reason, 'invalid-action')
})

test('fail-closed permission and capability guards block clipboard write with canonical reasons', async () => {
  const base = createHarness()
  await base.mod.onFeatureTriggered('docs-atlas', { text: 'http 404' })
  const card = base.pushed.find(i => i.id === 'docs-atlas-http-404')

  const denied = createHarness({ permission: { async check() { return false } } })
  const r1 = await denied.mod.onItemAction(card, { actionId: 'copy-primary' })
  assert.equal(r1.status, 'blocked')
  assert.equal(r1.reason, 'permission-denied')
  assert.equal(denied.clipboardWrites.length, 0)

  const noSdk = createHarness({ permission: undefined })
  const r2 = await noSdk.mod.onItemAction(card, { actionId: 'copy-primary' })
  assert.equal(r2.status, 'blocked')
  assert.equal(r2.reason, 'permission-sdk-unavailable')

  const unavail = createHarness({
    permission: {
      async check() {
        const err = new Error('down')
        err.code = 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE'
        throw err
      },
    },
  })
  const r3 = await unavail.mod.onItemAction(card, { actionId: 'copy-primary' })
  assert.equal(r3.status, 'blocked')
  assert.equal(r3.reason, 'permission-unavailable')

  const checkFail = createHarness({
    permission: {
      async check() {
        throw new Error('err')
      },
    },
  })
  const r4 = await checkFail.mod.onItemAction(card, { actionId: 'copy-primary' })
  assert.equal(r4.status, 'blocked')
  assert.equal(r4.reason, 'permission-check-failed')

  const noClip = createHarness({ clipboard: {} })
  const r5 = await noClip.mod.onItemAction(card, { actionId: 'copy-primary' })
  assert.equal(r5.status, 'blocked')
  assert.equal(r5.reason, 'capability-unavailable')
})

test('trigger generation guard and onDestroy suppress stale async publishes', async () => {
  let releaseFirst
  let calls = 0
  const gate = new Promise((resolve) => {
    releaseFirst = resolve
  })

  const h = createHarness({
    feature: {
      async clearItems() {
        calls += 1
        if (calls === 1) {
          await gate
        }
      },
      async pushItems(items) {
        h.pushedBatches.push(items)
      },
    },
  })

  const pending = h.mod.onFeatureTriggered('docs-atlas', { text: 'http 200' })
  await Promise.resolve()
  h.mod.onDestroy()
  releaseFirst()
  await pending

  assert.equal(h.pushedBatches.length, 0)
  assert.deepEqual(Object.keys(h.mod).sort(), ['onDestroy', 'onFeatureTriggered', 'onItemAction'])
})
